"""
AI gateway (Parts 17–19).

`LLMService` is the ONLY place that knows about providers, model names, and the
wire format. Stages call task methods (`extract_entities`, `analyze_event`, …) and
receive validated pydantic objects or None. Every call is:

  routed   — task → role (fast / reasoning / premium) via ROUTING
  bounded  — a per-run call budget; exhausted budget returns None, never raises
  validated— JSON mode → pydantic; one repair attempt on validation failure
  logged   — llm_runs row with model, tokens, latency, success, estimated cost
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any, Type, TypeVar

import requests
from pydantic import BaseModel, ValidationError

from .config import LLMConfig, load_llm_config
from .log import get_logger
from .text import hashed_embedding
from . import schemas as S

log = get_logger("llm")

T = TypeVar("T", bound=BaseModel)

Role = str  # "fast" | "reasoning" | "premium"

# Task → role. Change routing here and nowhere else.
ROUTING: dict[str, Role] = {
    "classify_article": "fast",
    "extract_entities": "fast",
    "extract_claims": "fast",
    "cluster_verify": "reasoning",
    "claim_stance": "fast",
    "analyze_event": "reasoning",
    "analyze_event_major": "premium",
    "daily_briefing": "reasoning",
    "ask": "reasoning",
}

# Rough $/1M tokens (input, output) for cost estimation when the provider doesn't
# return a cost. Only used for llm_runs.estimated_cost_usd; never for decisions.
_PRICE_HINTS: dict[str, tuple[float, float]] = {
    "gemini-2.5-flash": (0.30, 2.50),
    "gemini-2.0-flash": (0.10, 0.40),
    "claude-sonnet": (3.0, 15.0),
    "claude-opus": (15.0, 75.0),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4.1": (2.0, 8.0),
    "deepseek": (0.3, 1.2),
    "llama": (0.0, 0.0),
    "text-embedding-3-small": (0.02, 0.0),
}


def _estimate_cost(model: str, p_tokens: int, c_tokens: int) -> float | None:
    for key, (pin, pout) in _PRICE_HINTS.items():
        if key in model:
            return round((p_tokens * pin + c_tokens * pout) / 1_000_000, 6)
    return None


class LLMService:
    def __init__(self, cfg: LLMConfig | None = None, db=None, run_id: str | None = None):
        self.cfg = cfg or load_llm_config()
        self.db = db
        self.run_id = run_id or str(uuid.uuid4())
        self.calls = 0
        self.failures = 0
        self._embedding_api_ok: bool | None = None
        self._session = requests.Session()

    # ------------------------------------------------------------------ core
    @property
    def enabled(self) -> bool:
        return self.cfg.enabled

    def budget_left(self) -> int:
        return max(0, self.cfg.max_calls_per_run - self.calls)

    def model_for(self, role: Role) -> str:
        return {"fast": self.cfg.fast_model, "reasoning": self.cfg.reasoning_model,
                "premium": self.cfg.premium_model}.get(role, self.cfg.fast_model)

    def _headers(self) -> dict[str, str]:
        h = {"Authorization": f"Bearer {self.cfg.api_key}", "Content-Type": "application/json"}
        if self.cfg.provider == "openrouter":
            h["HTTP-Referer"] = "https://github.com/ReddeppaNakka/Newsfall"
            h["X-Title"] = "Newsfall Intelligence"
        return h

    def _log_run(self, task: str, role: str, model: str, *, p: int | None, c: int | None,
                 latency_ms: int, success: bool, error: str | None, cost: float | None) -> None:
        if self.db is None:
            return
        try:
            self.db.table("llm_runs").insert({
                "run_id": self.run_id, "task_type": task, "role": role, "provider": self.cfg.provider,
                "model": model, "prompt_tokens": p, "completion_tokens": c, "latency_ms": latency_ms,
                "success": success, "error": (error or None) and str(error)[:500],
                "estimated_cost_usd": cost,
            }).execute()
        except Exception as exc:  # noqa: BLE001 — observability must never break the pipeline
            log.warning("llm_runs insert failed", error=str(exc)[:200])

    def _chat(self, task: str, role: Role, system: str, user: str, *, max_tokens: int) -> dict | None:
        """One JSON-mode chat completion → parsed dict (or None). Handles budget, 429, errors."""
        if not self.enabled:
            return None
        if self.budget_left() <= 0:
            log.warning("LLM budget exhausted", task=task, calls=self.calls)
            return None
        model = self.model_for(role)
        body: dict[str, Any] = {
            "model": model,
            "temperature": self.cfg.temperature,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        }
        if self.cfg.provider == "openrouter":
            body["usage"] = {"include": True}

        self.calls += 1
        start = time.perf_counter()
        error: str | None = None
        p_tok = c_tok = None
        cost = None
        parsed: dict | None = None
        for attempt in range(3):
            try:
                resp = self._session.post(f"{self.cfg.base_url}/chat/completions", headers=self._headers(),
                                          json=body, timeout=self.cfg.request_timeout)
                if resp.status_code == 429:
                    wait = min(float(resp.headers.get("retry-after", 2 ** attempt)), 20)
                    log.info("rate limited", task=task, wait=wait)
                    time.sleep(wait)
                    continue
                if resp.status_code >= 400:
                    error = f"http {resp.status_code}: {resp.text[:300]}"
                    break
                data = resp.json()
                usage = data.get("usage") or {}
                p_tok, c_tok = usage.get("prompt_tokens"), usage.get("completion_tokens")
                cost = usage.get("cost") if isinstance(usage.get("cost"), (int, float)) else None
                if cost is None and p_tok is not None:
                    cost = _estimate_cost(model, int(p_tok or 0), int(c_tok or 0))
                raw = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
                parsed = _parse_json(raw)
                if parsed is None:
                    error = "non-json response"
                break
            except requests.RequestException as exc:
                error = f"network: {exc}"[:300]
                time.sleep(1 + attempt)
            except ValueError as exc:
                error = f"bad json: {exc}"[:300]
                break

        latency = int((time.perf_counter() - start) * 1000)
        ok = parsed is not None
        if not ok:
            self.failures += 1
            log.warning("LLM call failed", task=task, model=model, error=error)
        self._log_run(task, role, model, p=p_tok, c=c_tok, latency_ms=latency, success=ok, error=error, cost=cost)
        return parsed

    def structured(self, task: str, schema: Type[T], system: str, user: str, *, max_tokens: int = 900,
                   role: Role | None = None) -> T | None:
        """Chat → validate against `schema`; one repair round-trip on validation failure."""
        role = role or ROUTING.get(task, "fast")
        sys_prompt = (
            f"{system}\n\nRespond with ONLY a JSON object matching this schema (no prose, no markdown):\n"
            f"{json.dumps(schema.model_json_schema(), separators=(',', ':'))}"
        )
        data = self._chat(task, role, sys_prompt, user, max_tokens=max_tokens)
        if data is None:
            return None
        try:
            return schema.model_validate(data)
        except ValidationError as exc:
            log.info("schema validation failed; attempting repair", task=task, errors=len(exc.errors()))
            repair_user = (
                f"{user}\n\nYour previous JSON was invalid: {str(exc)[:600]}\n"
                f"Previous JSON: {json.dumps(data)[:1500]}\nReturn a corrected JSON object."
            )
            data2 = self._chat(f"{task}:repair", role, sys_prompt, repair_user, max_tokens=max_tokens)
            if data2 is None:
                return None
            try:
                return schema.model_validate(data2)
            except ValidationError as exc2:
                log.warning("schema validation failed after repair", task=task, error=str(exc2)[:200])
                return None

    # ------------------------------------------------------------ embeddings
    def embed(self, texts: list[str]) -> tuple[list[list[float]], str]:
        """Embed texts → (vectors, model_tag). Falls back to hashed embeddings when no API
        is configured or the endpoint rejects the request, so downstream never blocks."""
        texts = [t[:8000] if t else " " for t in texts]
        if not texts:
            return [], "hash-v1"
        if self.cfg.embeddings_enabled and self._embedding_api_ok is not False:
            start = time.perf_counter()
            try:
                headers = {"Authorization": f"Bearer {self.cfg.embedding_api_key}", "Content-Type": "application/json"}
                resp = self._session.post(f"{self.cfg.embedding_base_url}/embeddings", headers=headers,
                                          json={"model": self.cfg.embedding_model, "input": texts},
                                          timeout=self.cfg.request_timeout)
                if resp.status_code < 400:
                    data = resp.json()
                    items = sorted(data.get("data", []), key=lambda d: d.get("index", 0))
                    vecs = [d["embedding"] for d in items]
                    if len(vecs) == len(texts) and all(len(v) == self.cfg.embedding_dim for v in vecs):
                        self._embedding_api_ok = True
                        usage = data.get("usage") or {}
                        self._log_run("embed", "embedding", self.cfg.embedding_model, p=usage.get("prompt_tokens"),
                                      c=0, latency_ms=int((time.perf_counter() - start) * 1000), success=True,
                                      error=None, cost=_estimate_cost(self.cfg.embedding_model, int(usage.get("prompt_tokens") or 0), 0))
                        return vecs, self.cfg.embedding_model
                    err = f"unexpected embedding shape (n={len(vecs)}, dim={len(vecs[0]) if vecs else 0})"
                else:
                    err = f"http {resp.status_code}: {resp.text[:200]}"
            except (requests.RequestException, ValueError, KeyError) as exc:
                err = str(exc)[:200]
            self._embedding_api_ok = False
            log.warning("embedding API unavailable — using hashed embeddings for this run", error=err)
            self._log_run("embed", "embedding", self.cfg.embedding_model, p=None, c=None,
                          latency_ms=int((time.perf_counter() - start) * 1000), success=False, error=err, cost=None)
        return [hashed_embedding(t, self.cfg.embedding_dim) for t in texts], "hash-v1"

    # ---------------------------------------------------------------- tasks
    _EDITOR = ("You are a precise technology-industry intelligence analyst. You never invent facts. "
               "You distinguish official confirmation from reporting, rumor, opinion and prediction.")

    def classify_article(self, title: str, content: str, source_name: str) -> S.ArticleClassification | None:
        return self.structured(
            "classify_article", S.ArticleClassification, self._EDITOR,
            "Classify this item. `is_event` is true only for something that happened or is developing "
            "(launch, release, funding, acquisition, regulation, research result, incident, leadership change…), "
            "false for tutorials, listicles, opinion, evergreen explainers. `magnitude` is how significant the "
            "development is for the technology industry on its own (0.1 minor patch … 0.9 industry-shaping). "
            "`event_title` is a neutral, specific headline naming the actors.\n\n"
            f"Source: {source_name}\nTitle: {title}\nContent: {content[:3000]}",
            max_tokens=300,
        )

    def extract_entities(self, title: str, content: str, source_name: str = "unknown") -> S.EntityExtraction | None:
        """Entities AND classification (event type / title / magnitude / is_event) in one call."""
        return self.structured(
            "extract_entities", S.EntityExtraction, self._EDITOR,
            "1) Extract the named entities that matter: people who can materially influence technology/industry/"
            "capital/policy, companies, startups, investors/funds, research labs, governments/regulators, "
            "products, and technologies (models, chips, frameworks). Canonical names (\"NVIDIA\", not \"Nvidia's\"); "
            "include ticker/short-form aliases you are confident about. mention_type: SUBJECT = the item is about "
            "them, ACTOR = they did something, TARGET = something was done to them, else MENTIONED. Skip generic "
            "terms (\"AI\"). Max 10 entities; omit `context`.\n"
            "2) Classify: is_relevant=false if not about technology/industry/research/influential people. "
            "is_event=true only for something that happened or is developing (launch, release, funding, "
            "acquisition, regulation, research result, incident, leadership change…), false for tutorials, "
            "listicles, opinion, explainers. magnitude = significance for the industry on its own (0.1 minor "
            "patch … 0.9 industry-shaping). event_title = neutral, specific headline naming the actors.\n\n"
            f"Source: {source_name}\nTitle: {title}\nContent: {content[:3000]}",
            max_tokens=700,
        )

    def extract_claims(self, title: str, content: str, source_name: str, source_type: str) -> S.ClaimExtraction | None:
        return self.structured(
            "extract_claims", S.ClaimExtraction, self._EDITOR,
            "Extract the distinct, checkable claims this item makes (max 5, most consequential first). Each claim is "
            "one atomic statement with named subject/object entities where applicable. claim_type: FACT = stated by "
            "a primary/official source as done; REPORTED = a news report attributing to sources; RUMOR = unnamed "
            "sources / 'reportedly' / 'considering'; OPINION = analyst/author view; PREDICTION = forward-looking. "
            "source_context = the supporting sentence fragment (≤ 25 words). Never merge two claims into one.\n\n"
            f"Source: {source_name} (type: {source_type})\nTitle: {title}\nContent: {content[:3200]}",
            max_tokens=650,
        )

    def cluster_verify(self, candidate_title: str, candidate_summary: str, event_title: str,
                       event_summary: str, shared_entities: list[str]) -> S.ClusterVerdict | None:
        return self.structured(
            "cluster_verify", S.ClusterVerdict, self._EDITOR,
            "Decide whether the NEW ITEM describes the SAME real-world event as the EXISTING EVENT (same "
            "development, same actors, same time), not merely the same topic or company. A follow-up that "
            "updates/contradicts the same development still counts as the same event.\n\n"
            f"EXISTING EVENT: {event_title}\n{event_summary}\n\nNEW ITEM: {candidate_title}\n{candidate_summary}\n\n"
            f"Shared entities: {', '.join(shared_entities) or 'none'}",
            max_tokens=200,
        )

    def claim_stance(self, claim_text: str, article_title: str, article_content: str) -> S.StanceVerdict | None:
        return self.structured(
            "claim_stance", S.StanceVerdict, self._EDITOR,
            "Does this article SUPPORT, CONTRADICT, merely MENTION, or say nothing clear (UNCLEAR) about the claim? "
            "Quote the decisive sentence in excerpt.\n\n"
            f"CLAIM: {claim_text}\n\nARTICLE: {article_title}\n{article_content[:3500]}",
            max_tokens=250,
        )

    def analyze_event(self, *, title: str, event_type: str, articles: list[dict], entities: list[str],
                      claims: list[dict], premium: bool = False) -> S.EventAnalysis | None:
        art_text = "\n\n".join(
            f"[{i+1}] {a.get('source_name','?')} ({a.get('source_type','?')}, credibility {a.get('credibility',0):.2f}) "
            f"— {a.get('title','')}\n{(a.get('content') or '')[:1200 if premium else 900]}"
            for i, a in enumerate(articles[: 5 if premium else 4])
        )
        claim_text = "\n".join(f"- [{c.get('status')}] {c.get('claim_text')}" for c in claims[:8]) or "none extracted"
        return self.structured(
            "analyze_event_major" if premium else "analyze_event", S.EventAnalysis, self._EDITOR,
            "Produce an intelligence analysis of this event from the evidence below ONLY. Be concrete and "
            "specific; name the mechanism by which it matters (capital, compute, distribution, regulation, "
            "talent, supply chain). `magnitude` = size of the development itself; `industry_impact_score` = "
            "breadth of second-order effects (both 0..1). `relationships` only when the evidence states them "
            "(e.g. ACQUIRED, INVESTED_IN, PARTNERED_WITH, CEO_OF). `what_to_watch`: unresolved questions with a "
            "kind (UPCOMING_KNOWN_EVENT / EMERGING_SIGNAL / SPECULATIVE_POSSIBILITY). `scenarios`: 1–3 evidence-"
            "based possible next developments with supporting and counter signals — clearly not facts. "
            "List genuine `uncertainties`. Do not restate unconfirmed claims as facts. Be concise: summary/"
            "why_it_matters/industry_impact ≤ 3 sentences each; ≤ 3 what_to_watch; ≤ 2 scenarios.\n\n"
            f"EVENT: {title} ({event_type})\nENTITIES: {', '.join(entities) or 'n/a'}\n\nCLAIMS:\n{claim_text}\n\n"
            f"EVIDENCE:\n{art_text}",
            max_tokens=1400 if premium else 1000,
        )

    def daily_briefing(self, day: str, events: list[dict], people: list[dict], watch: list[dict]) -> S.DailyBriefing | None:
        ev = "\n".join(
            f"- [{e['slug']}] ({e['event_type']}, importance {e['importance_score']:.0f}, confidence "
            f"{e['confidence_score']:.2f}) {e['title']}: {e.get('why_it_matters') or e.get('summary') or ''}"
            for e in events[:25]
        )
        pp = "\n".join(f"- {p['name']} (influence {p['influence_score']:.0f}): {p.get('description') or ''}" for p in people[:8])
        ww = "\n".join(f"- [{w.get('kind')}] {w['title']}: {w.get('reason') or ''}" for w in watch[:10])
        return self.structured(
            "daily_briefing", S.DailyBriefing, self._EDITOR,
            f"Write the Newsfall daily technology intelligence briefing for {day}. Synthesise across events — do "
            "not summarise each one. Reference events by their [slug] in event_slugs. Sections: most_important, "
            "why_it_matters, industry_shift, people_of_influence, emerging_signals, what_to_watch. Calm, precise, "
            "editorial tone; 2–5 sentences per section; state confidence where it is low.\n\n"
            f"EVENTS:\n{ev}\n\nPEOPLE:\n{pp or 'none'}\n\nWATCH ITEMS:\n{ww or 'none'}",
            max_tokens=1800,
        )


def _parse_json(raw: str) -> dict | None:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:]
    try:
        data = json.loads(raw)
    except ValueError:
        # Salvage the first {...} block if the model wrapped it in prose.
        start, end = raw.find("{"), raw.rfind("}")
        if start == -1 or end <= start:
            return None
        try:
            data = json.loads(raw[start : end + 1])
        except ValueError:
            return None
    return data if isinstance(data, dict) else None
