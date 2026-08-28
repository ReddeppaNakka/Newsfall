"""
Structured logging for the pipeline. One JSON object per line when LOG_FORMAT=json
(GitHub Actions / log shippers), human-readable otherwise.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from contextlib import contextmanager
from typing import Any, Iterator


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        extra = getattr(record, "extra", None)
        if isinstance(extra, dict):
            payload.update(extra)
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


class _TextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        base = f"{record.levelname[0]} {record.name.replace('newsfall.', '')}: {record.getMessage()}"
        extra = getattr(record, "extra", None)
        if isinstance(extra, dict) and extra:
            base += "  " + " ".join(f"{k}={v}" for k, v in extra.items())
        if record.exc_info:
            base += "\n" + self.formatException(record.exc_info)
        return base


_configured = False


def configure() -> None:
    global _configured
    if _configured:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter() if os.getenv("LOG_FORMAT", "").lower() == "json" else _TextFormatter())
    root = logging.getLogger("newsfall")
    root.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())
    root.handlers[:] = [handler]
    root.propagate = False
    _configured = True


class Logger:
    """Thin wrapper so call sites can pass structured fields as kwargs."""

    def __init__(self, name: str):
        configure()
        self._log = logging.getLogger(f"newsfall.{name}")

    def _emit(self, level: int, msg: str, exc_info: bool = False, **fields: Any) -> None:
        self._log.log(level, msg, exc_info=exc_info, extra={"extra": fields})

    def debug(self, msg: str, **f: Any) -> None:
        self._emit(logging.DEBUG, msg, **f)

    def info(self, msg: str, **f: Any) -> None:
        self._emit(logging.INFO, msg, **f)

    def warning(self, msg: str, **f: Any) -> None:
        self._emit(logging.WARNING, msg, **f)

    def error(self, msg: str, exc_info: bool = False, **f: Any) -> None:
        self._emit(logging.ERROR, msg, exc_info=exc_info, **f)

    @contextmanager
    def timed(self, msg: str, **f: Any) -> Iterator[dict[str, Any]]:
        """Log duration of a block; the yielded dict lets callers add fields."""
        start = time.perf_counter()
        fields: dict[str, Any] = dict(f)
        try:
            yield fields
        finally:
            fields["ms"] = int((time.perf_counter() - start) * 1000)
            self.info(msg, **fields)


def get_logger(name: str) -> Logger:
    return Logger(name)
