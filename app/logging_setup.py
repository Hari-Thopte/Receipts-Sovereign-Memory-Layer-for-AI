"""Structured logging configuration that omits request bodies and secrets."""

import json
import logging
from datetime import datetime, timezone


class StructuredFormatter(logging.Formatter):
    """Serialize only the log message and standard metadata as one JSON line."""

    def format(self, record: logging.LogRecord) -> str:
        return json.dumps({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }, ensure_ascii=False)


def configure_logging() -> None:
    """Install a small JSON formatter on the root logger."""
    handler = logging.StreamHandler()
    handler.setFormatter(StructuredFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)
