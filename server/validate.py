"""Plan validation and packing to MSG_PLAN.

Rules (design doc section 5): only capture ids from the latest CAPS; values in range;
at most 8 tracks; every track is something layer 1 renders (no audio in a plan).
Out-of-range numbers are clamped; tracks that cannot be rendered are dropped.
"""
from __future__ import annotations

import protocol as P
from session import bar_delta

ROLE_IDX = {n: i for i, n in enumerate(P.ROLE_NAMES)}
MODSRC_IDX = {n: i for i, n in enumerate(P.MOD_SOURCES)}
MODTGT_IDX = {n: i for i, n in enumerate(P.MOD_TARGETS)}
SLICE_IDX = {n: i for i, n in enumerate(P.SLICE_NAMES)}
SCALE_FROM = ("none", "chroma")

BPM_MIN, BPM_MAX = 40.0, 200.0
BARS_MIN, BARS_MAX = 4, 64
PITCH_MIN, PITCH_MAX = -24, 24
NOTE_MIN, NOTE_MAX = -48, 48
MAX_LOOKAHEAD_BARS = 8


class PlanError(ValueError):
    pass


def _clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


def _num(v, default=0.0) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    return default if f != f else f  # NaN


def _enum(v):
    """Structured output may change the capitalisation of enum values: compare lower-case."""
    return v.strip().lower() if isinstance(v, str) else v


def steps_to_mask(steps) -> int:
    if isinstance(steps, bool):
        return 0
    if isinstance(steps, int):
        return steps & 0xFFFF
    if isinstance(steps, str):
        s = steps.strip().replace(" ", "")
        if s.lower().startswith("0x"):
            return int(s, 16) & 0xFFFF
        steps = [c for c in s if c in "01x."]
        steps = [1 if c in "1x" else 0 for c in steps]
    if isinstance(steps, (list, tuple)):
        m = 0
        for i, v in enumerate(list(steps)[:16]):
            if _num(v) >= 0.5:
                m |= 1 << i
        return m
    return 0


def clean_notes(notes) -> list:
    """16 values: int semitone offsets clamped to -48..48, None for rests (packed as -128)."""
    out = [None] * 16
    if isinstance(notes, (list, tuple)):
        for i, v in enumerate(list(notes)[:16]):
            if isinstance(v, bool) or v is None:
                continue
            f = _num(v, None) if not isinstance(v, str) else _num(v.strip() or "x", None)
            if f is None or f == P.LINK_NOTE_NONE:
                continue
            out[i] = int(round(_clamp(f, NOTE_MIN, NOTE_MAX)))
    return out


def mask_to_steps(mask: int) -> list[int]:
    return [(mask >> i) & 1 for i in range(16)]


def validate_plan(plan: dict, caps: dict, current_bar: int, plan_id: int) -> tuple[dict, list[str]]:
    """Returns (clean plan dict, warnings). Raises PlanError if nothing renderable is left."""
    if not isinstance(plan, dict):
        raise PlanError("plan is not an object")
    warn: list[str] = []
    tempo = plan.get("tempo") or {}
    bpm = _num(tempo.get("bpm", plan.get("bpm", 0)))
    follow = bool(tempo.get("follow_pulse", plan.get("follow_pulse", True)))
    if bpm != 0:
        nb = _clamp(bpm, BPM_MIN, BPM_MAX)
        if nb != bpm:
            warn.append(f"bpm {bpm} clamped to {nb}")
        bpm = nb
    bars = int(round(_num(plan.get("bars", 16), 16)))
    if not BARS_MIN <= bars <= BARS_MAX:
        warn.append(f"bars {bars} clamped")
        bars = _clamp(bars, BARS_MIN, BARS_MAX)
    cur = current_bar & 0xFFFF  # device bar counter wraps at 65536
    start = int(round(_num(plan.get("starts_at_bar", cur + 1), cur + 1)))
    d = bar_delta(start, cur)
    if not 1 <= d <= MAX_LOOKAHEAD_BARS:
        nd = _clamp(d, 1, MAX_LOOKAHEAD_BARS)
        warn.append(f"starts_at_bar {start} moved to {(cur + nd) & 0xFFFF}")
        d = nd
    start = (cur + d) & 0xFFFF

    tracks_in = plan.get("tracks") or []
    if not isinstance(tracks_in, list):
        raise PlanError("tracks is not a list")
    tracks = []
    for i, t in enumerate(tracks_in):
        if not isinstance(t, dict):
            warn.append(f"track {i}: not an object, dropped"); continue
        role = _enum(t.get("role"))
        if role not in ROLE_IDX:
            warn.append(f"track {i}: role {role!r} unknown, dropped"); continue
        cid = t.get("capture_id", t.get("capture"))
        if isinstance(cid, str):
            digits = "".join(ch for ch in cid if ch.isdigit())
            cid = int(digits) if digits else None
        elif isinstance(cid, float):
            cid = int(cid)
        if role == "modulation" and (cid is None or cid == P.CAPTURE_NONE or cid not in caps):
            cid = P.CAPTURE_NONE
        elif not isinstance(cid, int) or cid not in caps:
            warn.append(f"track {i}: capture {cid!r} not in CAPS, dropped"); continue
        dens = t.get("density") or {}
        mod = t.get("modulation") or {}
        src, tgt = _enum(mod.get("source")), _enum(mod.get("target"))
        if role == "modulation" and (src not in MODSRC_IDX or tgt not in MODTGT_IDX):
            warn.append(f"track {i}: modulation {src!r}->{tgt!r} unknown, dropped"); continue
        pitch = int(round(_num(t.get("pitch", 0))))
        if not PITCH_MIN <= pitch <= PITCH_MAX:
            warn.append(f"track {i}: pitch {pitch} clamped")
            pitch = _clamp(pitch, PITCH_MIN, PITCH_MAX)
        slice_ = _enum(t.get("slice", "whole"))
        if slice_ not in SLICE_IDX:
            warn.append(f"track {i}: slice {slice_!r} -> whole")
            slice_ = "whole"
        duck = _enum(t.get("duck_on", "none"))
        if duck == role or (duck not in ROLE_IDX and duck != "none"):
            if duck != role:
                warn.append(f"track {i}: duck_on {duck!r} -> none")
            duck = "none"
        scale = _enum(t.get("scale_from", "none"))
        if scale not in SCALE_FROM:
            warn.append(f"track {i}: scale_from {scale!r} -> none")
            scale = "none"
        clean = {
            "role": role,
            "capture_id": cid,
            "steps": mask_to_steps(steps_to_mask(t.get("steps", 0))),
            "prob": round(_clamp(_num(t.get("prob", 1.0), 1.0), 0.0, 1.0), 3),
            "pitch": pitch,
            "density": {"from": round(_clamp(_num(dens.get("from", 0.0)), 0.0, 1.0), 3),
                        "to": round(_clamp(_num(dens.get("to", dens.get("from", 0.0))), 0.0, 1.0), 3)},
            "modulation": {"source": src if src in MODSRC_IDX else P.MOD_SOURCES[0],
                           "target": tgt if tgt in MODTGT_IDX else P.MOD_TARGETS[0],
                           "depth": round(_clamp(_num(mod.get("depth", 0.0)), 0.0, 1.0), 3)},
            "slice": slice_,
            "duck_on": duck,
            "scale_from": scale,
            "notes": clean_notes(t.get("notes")) if role == "melody" else [None] * 16,
        }
        if role in ("rhythm", "melody") and not any(clean["steps"]) and clean["prob"] > 0:
            warn.append(f"track {i}: empty step mask")
        tracks.append(clean)
    if len(tracks) > 8:
        warn.append(f"{len(tracks)} tracks, kept 8")
        tracks = tracks[:8]
    if not tracks:
        raise PlanError("no renderable tracks")
    sections = []
    for s in plan.get("sections") or []:
        if isinstance(s, dict) and isinstance(s.get("name"), str):
            b = int(_clamp(_num(s.get("bar", 0)), 0, bars - 1))
            sections.append({"bar": b, "name": s["name"][:24]})
    why = str(plan.get("why", ""))[:300]
    return ({"plan_id": plan_id & 0xFFFF, "starts_at_bar": start, "bars": bars,
             "tempo": {"bpm": round(bpm, 1), "follow_pulse": follow},
             "tracks": tracks, "sections": sections[:8], "why": why}, warn)


def pack_valid_plan(clean: dict) -> bytes:
    hdr = P.PlanHdr(plan_id=clean["plan_id"], starts_at_bar=clean["starts_at_bar"], bars=clean["bars"],
                    bpm_x10=int(round(clean["tempo"]["bpm"] * 10)),
                    follow_pulse=1 if clean["tempo"]["follow_pulse"] else 0)
    tracks = []
    for t in clean["tracks"]:
        tracks.append(P.PlanTrack(
            role=ROLE_IDX[t["role"]], capture_id=t["capture_id"], steps=steps_to_mask(t["steps"]),
            prob=int(round(t["prob"] * 255)), pitch=t["pitch"],
            density_from=int(round(t["density"]["from"] * 255)), density_to=int(round(t["density"]["to"] * 255)),
            mod_source=MODSRC_IDX[t["modulation"]["source"]], mod_target=MODTGT_IDX[t["modulation"]["target"]],
            mod_depth=int(round(t["modulation"]["depth"] * 255)),
            slice=SLICE_IDX[t["slice"]],
            duck_on=ROLE_IDX[t["duck_on"]] if t["duck_on"] in ROLE_IDX else P.DUCK_NONE,
            flags=P.FLAG_SNAP_CHROMA if t["scale_from"] == "chroma" else 0,
            notes=[P.LINK_NOTE_NONE if n is None else n for n in t.get("notes", [None] * 16)]))
    return P.pack_plan(hdr, tracks)
