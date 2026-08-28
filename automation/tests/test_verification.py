from newsfall.intelligence.verification import claim_status_from_evidence, event_confidence
from newsfall.processing.claims import initial_status
from newsfall.sources.registry import credibility_for


def ev(stance, cred, stype="NEWS", primary=False, key="k"):
    return {"stance": stance, "credibility_weight": cred, "source_type": stype, "is_primary_source": primary, "source_key": key}


def test_initial_status_ladder():
    assert initial_status("FACT", "OFFICIAL", True) == "CONFIRMED"
    assert initial_status("FACT", "NEWS", False) == "REPORTED"
    assert initial_status("RUMOR", "NEWS", False) == "UNVERIFIED"
    assert initial_status("REPORTED", "SOCIAL", False) == "UNVERIFIED"
    assert initial_status("OPINION", "OFFICIAL", True) == "UNVERIFIED"


def test_single_news_source_is_reported():
    status, conf = claim_status_from_evidence("REPORTED", [ev("SUPPORTS", 0.7, key="reuters")])
    assert status == "REPORTED" and conf < 0.7


def test_two_independent_high_quality_sources_partially_confirm():
    status, _ = claim_status_from_evidence("REPORTED", [ev("SUPPORTS", 0.7, key="reuters"), ev("SUPPORTS", 0.8, key="ft")])
    assert status == "PARTIALLY_CONFIRMED"
    # Same organisation twice is not independent.
    status, _ = claim_status_from_evidence("REPORTED", [ev("SUPPORTS", 0.7, key="reuters"), ev("SUPPORTS", 0.8, key="reuters")])
    assert status == "REPORTED"


def test_primary_source_confirms():
    status, conf = claim_status_from_evidence("FACT", [ev("SUPPORTS", 0.9, "OFFICIAL", True, "openai")])
    assert status == "CONFIRMED" and conf >= 0.85


def test_contradiction_disputes_and_social_only_is_unverified():
    status, _ = claim_status_from_evidence("REPORTED", [ev("SUPPORTS", 0.6, key="a"), ev("CONTRADICTS", 0.8, key="b")])
    assert status == "DISPUTED"
    status, _ = claim_status_from_evidence("REPORTED", [ev("SUPPORTS", 0.3, "SOCIAL", key="x")])
    assert status == "UNVERIFIED"
    status, _ = claim_status_from_evidence("OPINION", [ev("SUPPORTS", 0.9, "OFFICIAL", True)])
    assert status == "UNVERIFIED"


def test_event_confidence_rollup():
    claims = [{"claim_type": "FACT", "status": "CONFIRMED", "confidence": 0.9}]
    sources = [{"organization": "OpenAI", "source_type": "OFFICIAL", "is_primary_source": True},
               {"organization": "Reuters", "source_type": "NEWS", "is_primary_source": False}]
    roll = event_confidence(claims, sources)
    assert roll["primary_source_confirmed"] and roll["independent_source_count"] == 2 and roll["confidence_score"] > 0.9
    roll = event_confidence([{"claim_type": "REPORTED", "status": "DISPUTED", "confidence": 0.4}], sources[1:])
    assert roll["has_contradiction"] and roll["confidence_score"] <= 0.55


def test_contextual_credibility():
    official = {"credibility_score": 0.9, "source_type": "OFFICIAL"}
    assert credibility_for(official, "FACT") == 0.9
    assert credibility_for(official, "PREDICTION") < 0.6
    assert credibility_for({"credibility_score": 0.9, "source_type": "SOCIAL"}, "FACT") <= 0.4
