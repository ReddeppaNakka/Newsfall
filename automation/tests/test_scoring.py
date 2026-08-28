from datetime import datetime, timedelta, timezone

from newsfall.intelligence.influence import compute_influence
from newsfall.intelligence.scoring import WEIGHTS, compute_importance, cross_source_signal, novelty_signal


def test_weights_sum_to_100():
    assert sum(WEIGHTS.values()) == 100


def test_importance_bounds_and_clamping():
    score, bd = compute_importance({k: 1.0 for k in WEIGHTS})
    assert score == 100.0
    score, _ = compute_importance({k: 5.0 for k in WEIGHTS})  # out-of-range clamps
    assert score == 100.0
    score, _ = compute_importance({})
    assert score == 0.0


def test_llm_magnitude_alone_cannot_max_the_score():
    score, _ = compute_importance({"magnitude": 1.0, "industry_impact": 1.0})
    assert score == 40.0  # AI-derived signals cap at 40/100 without corroboration


def test_cross_source_and_novelty_signals():
    assert cross_source_signal(0) == 0.0 < cross_source_signal(1) < cross_source_signal(2) < cross_source_signal(4) == 1.0
    now = datetime.now(timezone.utc)
    assert novelty_signal(now - timedelta(hours=2), now) == 1.0
    assert novelty_signal(now - timedelta(days=10), now) == 0.2


def test_influence_monotonic_in_evidence():
    low = compute_influence("PERSON", [], 0, 0)
    mid = compute_influence("PERSON", [60.0], 5, 1)
    high = compute_influence("PERSON", [90.0, 80.0, 70.0], 40, 12)
    assert low < mid < high <= 100
