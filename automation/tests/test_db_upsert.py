"""upsert() must never send two rows with the same conflict key in one batch (SQLSTATE 21000)."""

from newsfall.db import dedupe_by_key, upsert


def test_dedupe_keeps_last_row_per_key_and_preserves_order():
    rows = [
        {"source_entity_id": "a", "target_entity_id": "b", "relationship_type": "PARTNERS_WITH", "confidence": 0.5},
        {"source_entity_id": "c", "target_entity_id": "d", "relationship_type": "ACQUIRES", "confidence": 0.9},
        {"source_entity_id": "a", "target_entity_id": "b", "relationship_type": "PARTNERS_WITH", "confidence": 0.8},
    ]
    out = dedupe_by_key(rows, "source_entity_id,target_entity_id,relationship_type")
    assert [r["confidence"] for r in out] == [0.8, 0.9]


def test_dedupe_handles_list_valued_columns_and_spaces_in_key():
    rows = [{"event_id": "e", "title": "Watch X", "related_entity_ids": ["1", "2"]},
            {"event_id": "e", "title": "Watch X", "related_entity_ids": ["1"]}]
    assert len(dedupe_by_key(rows, "event_id, title")) == 1


class _Recorder:
    def __init__(self):
        self.sent = []

    def table(self, _name):
        return self

    def upsert(self, rows, **_kw):
        self.sent.extend(rows)
        return self

    def execute(self):
        return None


def test_upsert_dedupes_before_sending():
    db = _Recorder()
    rows = [{"event_id": "e", "title": "T"}, {"event_id": "e", "title": "T"}, {"event_id": "f", "title": "T"}]
    assert upsert(db, "watch_items", rows, on_conflict="event_id,title") == 2
    assert len(db.sent) == 2
