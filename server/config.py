"""Settings from environment variables. Secrets are only read from the environment."""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _f(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


def _i(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def _b(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


@dataclass
class Config:
    host: str = field(default_factory=lambda: os.environ.get("BIND_HOST", "127.0.0.1"))
    # PORT is the Sisyphus platform convention; BIND_PORT kept as an alias
    port: int = field(default_factory=lambda: _i("PORT", _i("BIND_PORT", 8765)))
    device_tokens: list[str] = field(default_factory=lambda: [
        t.strip() for t in os.environ.get("DEVICE_TOKENS", "").split(",") if t.strip()])
    anthropic_model: str = field(default_factory=lambda: os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5-5"))
    anthropic_effort: str = field(default_factory=lambda: os.environ.get("ANTHROPIC_EFFORT", "low"))
    anthropic_fallbacks: bool = field(default_factory=lambda: _b("ANTHROPIC_FALLBACKS", True))
    anthropic_thinking: str = field(default_factory=lambda: os.environ.get("ANTHROPIC_THINKING", "adaptive"))
    plan_every_bars: int = field(default_factory=lambda: _i("PLAN_EVERY_BARS", 16))
    plan_timeout_s: float = field(default_factory=lambda: min(8.0, max(3.0, _f("PLAN_TIMEOUT_S", 6.0))))
    plan_min_interval_s: float = field(default_factory=lambda: _f("PLAN_MIN_INTERVAL_S", 4.0))
    feature_change_threshold: float = field(default_factory=lambda: _f("FEATURE_CHANGE_THRESHOLD", 0.35))
    attach_spectrogram: bool = field(default_factory=lambda: _b("ATTACH_SPECTROGRAM", False))
    clip_interval_s: float = field(default_factory=lambda: _f("CLIP_INTERVAL_S", 60.0))
    clip_seconds: int = field(default_factory=lambda: max(1, min(6, _i("CLIP_SECONDS", 6))))  # device max 6 s
    clip_request_timeout_s: float = field(default_factory=lambda: _f("CLIP_REQUEST_TIMEOUT_S", 30.0))
    tagger: str = field(default_factory=lambda: os.environ.get("TAGGER", "auto"))
    yamnet_model: str | None = field(default_factory=lambda: os.environ.get("YAMNET_MODEL") or None)
    yamnet_speech_discard: float = field(default_factory=lambda: _f("YAMNET_SPEECH_DISCARD", 0.3))
    mic_clips_require_model: bool = field(default_factory=lambda: _b("MIC_CLIPS_REQUIRE_MODEL", True))
    journal_dir: str = field(default_factory=lambda: os.environ.get("JOURNAL_DIR", "data/journal"))
    journal_enabled: bool = field(default_factory=lambda: _b("JOURNAL_ENABLED", True))
    journal_retention_days: float = field(default_factory=lambda: _f("JOURNAL_RETENTION_DAYS", 30.0))
    place_enabled: bool = field(default_factory=lambda: _b("PLACE_ENABLED", True))
    overpass_url: str = field(default_factory=lambda: os.environ.get(
        "OVERPASS_URL", "https://overpass-api.de/api/interpreter"))
    open_meteo_url: str = field(default_factory=lambda: os.environ.get(
        "OPEN_METEO_URL", "https://api.open-meteo.com/v1/forecast"))
    contact: str = field(default_factory=lambda: os.environ.get("CONTACT_URL", "https://ohmyondas.levm.eu"))
    price_input_per_mtok: float = field(default_factory=lambda: _f("PRICE_INPUT_PER_MTOK", 2.0))
    price_output_per_mtok: float = field(default_factory=lambda: _f("PRICE_OUTPUT_PER_MTOK", 10.0))
    rate_msgs_per_s: float = field(default_factory=lambda: _f("RATE_MSGS_PER_S", 200.0))
    rate_burst: float = field(default_factory=lambda: _f("RATE_BURST", 400.0))
    # extra one-off allowance right after connect, for the ESP32's buffered backlog
    rate_connect_backlog: float = field(default_factory=lambda: _f("RATE_CONNECT_BACKLOG", 4000.0))
    session_idle_s: float = field(default_factory=lambda: _f("SESSION_IDLE_S", 1800.0))
    log_level: str = field(default_factory=lambda: os.environ.get("LOG_LEVEL", "INFO"))

    @property
    def has_api_key(self) -> bool:
        return bool(os.environ.get("ANTHROPIC_API_KEY"))
