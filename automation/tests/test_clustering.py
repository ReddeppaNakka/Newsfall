from datetime import datetime, timedelta, timezone

from newsfall.intelligence.clustering import cluster_score, event_slug, time_proximity
from newsfall.processing.normalize import decide_duplicate
from newsfall.schemas import ClusterVerdict, EntityExtraction, EventAnalysis


def test_cluster_score_bands():
    assert cluster_score(0.95, 0.8, 1.0, True) >= 0.85          # obvious same event → auto-attach
    assert cluster_score(0.4, 0.0, 0.2, False) < 0.55           # unrelated → new event
    grey = cluster_score(0.75, 0.4, 0.6, False)
    assert 0.55 < grey < 0.8                                    # grey zone → LLM verification


def test_time_proximity():
    now = datetime.now(timezone.utc)
    assert time_proximity(now, now, 7) == 1.0
    assert time_proximity(now, now - timedelta(days=7), 7) == 0.0
    assert time_proximity(None, now, 7) == 0.5


def test_event_slug_is_stable_and_short():
    s = event_slug("OpenAI acquires a company for $5 billion", "article-123")
    assert s == event_slug("OpenAI acquires a company for $5 billion", "article-123")
    assert len(s) <= 70 and s.startswith("openai-acquires")


def test_decide_duplicate_same_source_only():
    a = {"id": "1", "title": "NVIDIA unveils Blackwell Ultra GPU", "source_id": "s1", "content_hash": "h1"}
    recent = [{"id": "2", "title": "NVIDIA unveils Blackwell Ultra GPU today", "source_id": "s1", "content_hash": "h2"},
              {"id": "3", "title": "NVIDIA unveils Blackwell Ultra GPU", "source_id": "s2", "content_hash": "h3"}]
    assert decide_duplicate(a, {}, recent, 0.8) == "2"
    assert decide_duplicate(a, {"h1": "9"}, [], 0.8) == "9"
    assert decide_duplicate(a, {}, recent[1:], 0.8) is None  # other source → clustering, not dedupe


def test_schemas_reject_invented_enums_and_clamp():
    ok = EntityExtraction.model_validate({"entities": [{"name": "NVIDIA", "type": "COMPANY", "confidence": 3}]})
    assert ok.entities[0].confidence == 1.0
    try:
        EntityExtraction.model_validate({"entities": [{"name": "X", "type": "CELEBRITY"}]})
        assert False, "invalid enum accepted"
    except Exception:
        pass
    v = ClusterVerdict.model_validate({"same_event": True, "confidence": -1})
    assert v.confidence == 0.0
    a = EventAnalysis.model_validate({"event_title": "OpenAI raises funding", "summary": "s", "why_it_matters": "w",
                                      "industry_impact": "i", "magnitude": 0.7, "relationships": [
                                          {"source": "Microsoft", "target": "OpenAI", "type": "INVESTED_IN"}]})
    assert a.relationships[0].type == "INVESTED_IN" and a.event_type == "OTHER"
