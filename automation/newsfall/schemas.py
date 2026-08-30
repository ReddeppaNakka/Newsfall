"""
Structured-output contracts for every LLM task (Part 19).

Each schema is a pydantic model: the LLM is asked for JSON matching it, the reply is
validated, and anything that fails validation is repaired once or discarded. Enum
fields use Literal types so an invented value can never reach the database (the DB
CHECK constraints are the last line of defence, not the first).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

EntityType = Literal[
    "PERSON", "COMPANY", "TECHNOLOGY", "PRODUCT", "ORGANIZATION", "INVESTOR", "STARTUP",
    "RESEARCH_LAB", "GOVERNMENT", "FUND", "INDUSTRY",
]
MentionType = Literal["SUBJECT", "ACTOR", "TARGET", "MENTIONED"]
ClaimType = Literal["FACT", "REPORTED", "RUMOR", "OPINION", "PREDICTION"]
EventType = Literal[
    "PRODUCT_LAUNCH", "MODEL_RELEASE", "FUNDING", "ACQUISITION", "PARTNERSHIP", "INVESTMENT",
    "LEADERSHIP_CHANGE", "EARNINGS", "REGULATION", "LAWSUIT", "RESEARCH_BREAKTHROUGH",
    "CHIP_DEVELOPMENT", "INFRASTRUCTURE_EXPANSION", "LAYOFF", "IPO", "SECURITY_INCIDENT",
    "OPEN_SOURCE_RELEASE", "POLICY_STATEMENT", "OTHER",
]
Stance = Literal["SUPPORTS", "CONTRADICTS", "MENTIONS", "UNCLEAR"]
RelationshipType = Literal[
    "FOUNDED", "CEO_OF", "EXECUTIVE_OF", "OWNS", "INVESTED_IN", "ACQUIRED", "PARTNERED_WITH",
    "COMPETES_WITH", "SUPPLIES", "DEPENDS_ON", "CREATED", "FUNDED", "ADVISED", "LEFT", "JOINED",
    "SUBSIDIARY_OF", "REGULATES", "SUED",
]
WatchKind = Literal["UPCOMING_KNOWN_EVENT", "EMERGING_SIGNAL", "SPECULATIVE_POSSIBILITY"]


def _clamp01(v: float) -> float:
    try:
        return max(0.0, min(1.0, float(v)))
    except (TypeError, ValueError):
        return 0.5


class ExtractedEntity(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: EntityType
    confidence: float = 0.7
    mention_type: MentionType = "MENTIONED"
    aliases: list[str] = Field(default_factory=list)
    context: str | None = Field(default=None, max_length=300)
    official_domain: str | None = Field(default=None, max_length=120)  # e.g. "nvidia.com" when well known

    @field_validator("confidence")
    @classmethod
    def _c(cls, v: float) -> float:
        return _clamp01(v)

    @field_validator("name")
    @classmethod
    def _n(cls, v: str) -> str:
        return v.strip()


class EntityDomains(BaseModel):
    """name → official domain (or null) for a batch of entities."""

    domains: dict[str, str | None] = Field(default_factory=dict)


class EntityExtraction(BaseModel):
    """Entities + the cheap classification signals, in ONE call (saves a call per article)."""

    entities: list[ExtractedEntity] = Field(default_factory=list)
    is_relevant: bool = True          # False → not about technology/industry/influence at all
    relevance_reason: str | None = None
    is_event: bool = True             # False for tutorials, opinion, listicles, evergreen explainers
    event_type: EventType = "OTHER"
    event_title: str | None = Field(default=None, max_length=140)
    magnitude: float = 0.3            # 0..1 significance of the development on its own

    @field_validator("magnitude")
    @classmethod
    def _m(cls, v: float) -> float:
        return _clamp01(v)


class ExtractedClaim(BaseModel):
    claim: str = Field(min_length=8, max_length=400)
    claim_type: ClaimType = "REPORTED"
    subject: str | None = None        # entity name
    object: str | None = None         # entity name
    confidence: float = 0.6
    source_context: str | None = Field(default=None, max_length=300)

    @field_validator("confidence")
    @classmethod
    def _c(cls, v: float) -> float:
        return _clamp01(v)


class ClaimExtraction(BaseModel):
    claims: list[ExtractedClaim] = Field(default_factory=list)


class ArticleClassification(BaseModel):
    """Cheap first pass: event type + a magnitude estimate + a compact event title."""

    event_type: EventType = "OTHER"
    event_title: str = Field(min_length=5, max_length=140)
    magnitude: float = 0.3            # 0..1 — how big is this development in its own right
    is_event: bool = True             # False for tutorials, opinion, listicles

    @field_validator("magnitude")
    @classmethod
    def _m(cls, v: float) -> float:
        return _clamp01(v)


class ClusterVerdict(BaseModel):
    same_event: bool
    confidence: float = 0.5
    reason: str | None = Field(default=None, max_length=300)

    @field_validator("confidence")
    @classmethod
    def _c(cls, v: float) -> float:
        return _clamp01(v)


class StanceVerdict(BaseModel):
    stance: Stance = "MENTIONS"
    confidence: float = 0.5
    excerpt: str | None = Field(default=None, max_length=300)

    @field_validator("confidence")
    @classmethod
    def _c(cls, v: float) -> float:
        return _clamp01(v)


class Scenario(BaseModel):
    scenario: str = Field(max_length=300)
    confidence: Literal["LOW", "MEDIUM", "HIGH"] = "LOW"
    supporting: list[str] = Field(default_factory=list)
    counter: list[str] = Field(default_factory=list)
    signals: list[str] = Field(default_factory=list)


class ExtractedRelationship(BaseModel):
    source: str
    target: str
    type: RelationshipType
    confidence: float = 0.5

    @field_validator("confidence")
    @classmethod
    def _c(cls, v: float) -> float:
        return _clamp01(v)


class WatchSuggestion(BaseModel):
    title: str = Field(max_length=160)
    reason: str = Field(max_length=300)
    kind: WatchKind = "EMERGING_SIGNAL"
    expected_timeframe: str | None = Field(default=None, max_length=80)
    confidence: float = 0.4

    @field_validator("confidence")
    @classmethod
    def _c(cls, v: float) -> float:
        return _clamp01(v)


class EventAnalysis(BaseModel):
    event_title: str = Field(min_length=5, max_length=140)
    event_type: EventType = "OTHER"
    summary: str = Field(max_length=900)
    why_it_matters: str = Field(max_length=900)
    industry_impact: str = Field(max_length=900)
    magnitude: float = 0.4
    industry_impact_score: float = 0.4
    affected_entities: list[str] = Field(default_factory=list)
    relationships: list[ExtractedRelationship] = Field(default_factory=list)
    what_to_watch: list[WatchSuggestion] = Field(default_factory=list)
    scenarios: list[Scenario] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)

    @field_validator("magnitude", "industry_impact_score")
    @classmethod
    def _m(cls, v: float) -> float:
        return _clamp01(v)


class BriefingSection(BaseModel):
    heading: str
    body: str
    event_slugs: list[str] = Field(default_factory=list)


class DailyBriefing(BaseModel):
    title: str = Field(max_length=140)
    most_important: BriefingSection
    why_it_matters: BriefingSection
    industry_shift: BriefingSection
    people_of_influence: BriefingSection
    emerging_signals: BriefingSection
    what_to_watch: BriefingSection


class AskAnswer(BaseModel):
    answer: str
    confidence: Literal["LOW", "MEDIUM", "HIGH"] = "MEDIUM"
    key_evidence: list[str] = Field(default_factory=list)   # citation ids like "E3" / "A7"
    uncertainties: list[str] = Field(default_factory=list)
    what_to_watch: list[str] = Field(default_factory=list)
