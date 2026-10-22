"""One-line JSON logs. Callers pass structured fields with `extra=`.
Never pass tokens, audio, or raw coordinates to the logger."""
from __future__ import annotations

import json
import logging
import time

_STD = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {"message", "asctime"}
_BLOCK = {"token", "authorization", "api_key", "pcm", "audio", "lat", "lon"}


class JsonFormatter(logging.Formatter):
    def format(self, r: logging.LogRecord) -> str:
        d = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(r.created)) + f".{int(r.msecs):03d}Z",
             "level": r.levelname, "logger": r.name, "msg": r.getMessage()}
        for k, v in r.__dict__.items():
            if k not in _STD and k.lower() not in _BLOCK:
                d[k] = v
        if r.exc_info:
            d["exc"] = self.formatException(r.exc_info)
        return json.dumps(d, default=str)


def setup(level: str = "INFO"):
    h = logging.StreamHandler()
    h.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [h]
    root.setLevel(level)
    logging.getLogger("websockets").setLevel("WARNING")
    logging.getLogger("httpx").setLevel("WARNING")
