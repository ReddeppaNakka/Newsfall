"""Processing: normalize → dedupe → embed → entities → claims."""

from .normalize import run_normalize  # noqa: F401
from .embeddings import run_embeddings  # noqa: F401
from .entities import run_entity_extraction  # noqa: F401
from .claims import run_claim_extraction  # noqa: F401
