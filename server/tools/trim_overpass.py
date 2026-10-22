#!/usr/bin/env python3
"""Trims a real Overpass response for use as a test fixture: keeps elements the summary
uses, only the tags it reads, and coordinates at 6 decimals.

    python tools/trim_overpass.py raw.json tests/fixtures/overpass_<name>.json
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from place import _categories  # noqa: E402

KEEP = {"natural", "waterway", "leisure", "landuse", "highway", "railway", "amenity", "harbour", "industrial",
        "tunnel", "layer", "name"}


def pt(g):
    return {"lat": round(g["lat"], 6), "lon": round(g["lon"], 6)} if g else g


def trim(data: dict) -> dict:
    out = []
    for e in data.get("elements", []):
        tags = {k: v for k, v in (e.get("tags") or {}).items() if k in KEEP}
        if not _categories(tags):
            continue
        n = {"type": e["type"], "id": e["id"], "tags": tags}
        if "lat" in e:
            n.update(pt(e))
        if e.get("geometry"):
            n["geometry"] = [pt(g) for g in e["geometry"]]
        if e.get("members"):
            n["members"] = [{"type": m["type"], "role": m.get("role", ""),
                             **({"geometry": [pt(g) for g in m["geometry"]]} if m.get("geometry") else {}),
                             **({"lat": round(m["lat"], 6), "lon": round(m["lon"], 6)} if "lat" in m else {})}
                            for m in e["members"]]
        if e.get("bounds"):
            n["bounds"] = e["bounds"]
        out.append(n)
    return {"version": data.get("version"), "generator": data.get("generator"),
            "osm3s": {"copyright": (data.get("osm3s") or {}).get("copyright"),
                      "timestamp_osm_base": (data.get("osm3s") or {}).get("timestamp_osm_base")},
            "elements": out}


if __name__ == "__main__":
    with open(sys.argv[1]) as f:
        d = trim(json.load(f))
    with open(sys.argv[2], "w") as f:
        json.dump(d, f, separators=(",", ":"))
    print(sys.argv[2], len(d["elements"]), "elements", os.path.getsize(sys.argv[2]), "bytes")
