"""Place context from a GPS position: OpenStreetMap (Overpass), weather (Open-Meteo),
sun position (computed locally).

Results are cached per ~100 m cell for ~10 min. Network access goes through an
injected httpx.AsyncClient, so tests pass a MockTransport and never touch the network.

Overpass usage policy: identify with a User-Agent, keep queries small, a server-side
timeout, at most one request in flight, a minimum interval between requests, exponential
cool-down after 429/502/503/504. One query covers a 500 m radius and is reused for every
position within 200 m of its centre for OSM_TTL_S, so a walker triggers roughly one query per
200 m walked (about 25/hour), not one per 100 m cell. Sidewalks/footways/paths are left out
of the query: in Barcelona they are mapped individually and made ~80 % of the response.

Measured 2026-10-21 against overpass-api.de: 37-45 s per query (server at capacity,
~300 KB each with footways). Hence HTTP_TIMEOUT_S = 60 and lookups run in the background.
"""
from __future__ import annotations

import asyncio
import logging
import math
import time
from datetime import datetime, timezone

import httpx

log = logging.getLogger("place")

CELL_M = 100.0
CACHE_TTL_S = 600.0          # weather, per 100 m cell
OSM_TTL_S = 6 * 3600.0       # map data changes slowly
RADIUS_M = 300               # summary radius
QUERY_RADIUS_M = 500         # query radius; reuse while within QUERY_RADIUS_M - RADIUS_M of the centre
OVERPASS_MIN_INTERVAL_S = 10.0
OVERPASS_COOLDOWN_S = 60.0   # doubled per consecutive failure, max 30 min
HTTP_TIMEOUT_S = 60.0


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def cell_key(lat: float, lon: float) -> tuple[int, int]:
    dlat = CELL_M / 111320.0
    dlon = CELL_M / (111320.0 * max(math.cos(math.radians(lat)), 0.01))
    return (math.floor(lat / dlat), math.floor(lon / dlon))


# ---------------- sun ----------------
def _jd(ts: float) -> float:
    return ts / 86400.0 + 2440587.5


def sun_position(lat: float, lon: float, ts: float) -> tuple[float, float]:
    """Solar elevation and azimuth (degrees) for unix time ts. Accuracy ~0.5 deg."""
    d = _jd(ts) - 2451545.0
    g = math.radians((357.529 + 0.98560028 * d) % 360)
    q = (280.459 + 0.98564736 * d) % 360
    L = math.radians((q + 1.915 * math.sin(g) + 0.020 * math.sin(2 * g)) % 360)
    e = math.radians(23.439 - 0.00000036 * d)
    ra = math.atan2(math.cos(e) * math.sin(L), math.cos(L))
    dec = math.asin(math.sin(e) * math.sin(L))
    gmst = (18.697374558 + 24.06570982441908 * d) % 24
    ha = math.radians(gmst * 15 + lon) - ra
    la = math.radians(lat)
    el = math.asin(math.sin(la) * math.sin(dec) + math.cos(la) * math.cos(dec) * math.cos(ha))
    az = math.atan2(-math.sin(ha), math.tan(dec) * math.cos(la) - math.sin(la) * math.cos(ha))
    return math.degrees(el), (math.degrees(az) + 360) % 360


def sun_info(lat: float, lon: float, ts: float) -> dict:
    el, az = sun_position(lat, lon, ts)
    # sunrise/sunset of the local solar day: scan +-12 h in 2 min steps for -0.833 deg crossings
    noon_offset = -lon / 15.0 * 3600
    day0 = math.floor((ts - noon_offset) / 86400) * 86400 + noon_offset
    sunrise = sunset = None
    prev = sun_position(lat, lon, day0)[0] + 0.833
    for k in range(1, 721):
        t = day0 + k * 120
        cur = sun_position(lat, lon, t)[0] + 0.833
        if prev < 0 <= cur and sunrise is None:
            sunrise = t
        if prev >= 0 > cur:
            sunset = t
        prev = cur
    if el > 0:
        phase = "day"
    elif el > -6:
        phase = "civil_twilight"
    elif el > -12:
        phase = "nautical_twilight"
    else:
        phase = "night"
    info = {"elevation_deg": round(el, 1), "azimuth_deg": round(az, 0), "phase": phase}
    if sunrise:
        info["minutes_since_sunrise"] = round((ts - sunrise) / 60)
    if sunset:
        info["minutes_to_sunset"] = round((sunset - ts) / 60)
    return info


# ---------------- OSM summary ----------------
def overpass_query(lat: float, lon: float, r: int = QUERY_RADIUS_M) -> str:
    a = f"around:{r},{lat:.6f},{lon:.6f}"
    hw = "motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link|secondary_link|" \
         "tertiary_link|residential|unclassified|living_street|service|pedestrian"
    return (
        "[out:json][timeout:25];("
        f'nwr({a})["natural"~"^(water|coastline|beach|wood|tree_row|scrub)$"];'
        f'nwr({a})["waterway"];'
        f'nwr({a})["leisure"~"^(park|garden|marina|playground)$"];'
        f'nwr({a})["landuse"~"^(forest|grass|harbour|railway|industrial)$"];'
        f'way({a})["highway"~"^({hw})$"];'
        f'way({a})["railway"~"^(rail|tram|subway|light_rail)$"];'
        f'nwr({a})["amenity"~"^(marketplace|place_of_worship|fountain|school)$"];'
        f'nwr({a})["harbour"];'
        f'nwr({a})["industrial"="port"];'
        ");out geom qt;"
    )


HIGHWAY_CLASSES = {
    "motorway": "major", "trunk": "major", "primary": "major", "motorway_link": "major",
    "trunk_link": "major", "primary_link": "major",
    "secondary": "medium", "tertiary": "medium", "secondary_link": "medium", "tertiary_link": "medium",
    "residential": "minor", "unclassified": "minor", "living_street": "minor", "service": "minor",
    "pedestrian": "pedestrian", "footway": "pedestrian", "path": "pedestrian", "steps": "pedestrian",
    "cycleway": "cycle",
}


def _categories(tags: dict) -> list[str]:
    c = []
    nat, lu, lei, am = tags.get("natural"), tags.get("landuse"), tags.get("leisure"), tags.get("amenity")
    if nat == "water" or "waterway" in tags:
        c.append("water")
    if nat == "coastline":
        c.append("coastline")
    if nat == "beach":
        c.append("beach")
    if lei in ("park", "garden", "playground") or lu == "grass":
        c.append("park")
    if nat in ("wood", "tree_row", "scrub") or lu == "forest":
        c.append("wood")
    if "highway" in tags:
        c.append("road_" + HIGHWAY_CLASSES.get(tags["highway"], "other"))
    rw = tags.get("railway")
    under = tags.get("tunnel") in ("yes", "building_passage") or tags.get("layer", "0").startswith("-")
    if rw in ("rail", "light_rail"):
        c.append("rail_underground" if under else "railway")  # tunnels: felt (piezo) more than heard
    elif rw == "tram":
        c.append("tram")
    elif rw == "subway":
        c.append("subway")
    if lu == "railway":
        c.append("railway")
    if am == "marketplace":
        c.append("marketplace")
    if am == "place_of_worship":
        c.append("place_of_worship")
    if am == "fountain":
        c.append("fountain")
    if am == "school":
        c.append("school")
    if lu == "harbour" or "harbour" in tags or tags.get("industrial") == "port" or lei == "marina":
        c.append("harbour")
    if lu == "industrial" and "harbour" not in c:
        c.append("industrial")
    return c


AREA_CATS = {"water", "beach", "park", "wood", "harbour", "marketplace", "place_of_worship", "school",
             "industrial", "railway", "fountain"}


def _xy(lat0: float, lon0: float, lat: float, lon: float) -> tuple[float, float]:
    """Local equirectangular metres around (lat0, lon0); fine within a few km."""
    return ((lon - lon0) * 111320.0 * math.cos(math.radians(lat0)), (lat - lat0) * 110540.0)


def _seg_dist(p, a, b) -> float:
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _inside(p, ring) -> bool:
    x, y = p
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def _lines(el: dict) -> list[list[tuple[float, float]]]:
    """Polylines (lat, lon) of an element: node -> [pt], way -> geometry, relation -> member ways."""
    if "lat" in el and "lon" in el:
        return [[(el["lat"], el["lon"])]]
    if el.get("geometry"):
        return [[(g["lat"], g["lon"]) for g in el["geometry"] if g]]
    out = []
    for m in el.get("members") or []:
        if m.get("geometry"):
            out.append([(g["lat"], g["lon"]) for g in m["geometry"] if g])
        elif "lat" in m and "lon" in m:
            out.append([(m["lat"], m["lon"])])
    return [l for l in out if l]


def element_distance(el: dict, lat: float, lon: float, area: bool) -> float | None:
    """Metres from (lat, lon) to the element: 0 inside a closed area, else to the nearest segment.
    Falls back to the bounding box when no geometry was returned."""
    p = (0.0, 0.0)
    lines = _lines(el)
    if not lines:
        b = el.get("bounds")
        if not b:
            c = el.get("center")
            return haversine_m(lat, lon, c["lat"], c["lon"]) if c else None
        clat = min(max(lat, b["minlat"]), b["maxlat"])
        clon = min(max(lon, b["minlon"]), b["maxlon"])
        return haversine_m(lat, lon, clat, clon)
    best = None
    for line in lines:
        xy = [_xy(lat, lon, a, o) for a, o in line]
        if area and len(xy) >= 4 and line[0] == line[-1] and _inside(p, xy[:-1]):
            return 0.0
        d = math.hypot(*xy[0]) if len(xy) == 1 else min(_seg_dist(p, a, b) for a, b in zip(xy, xy[1:]))
        best = d if best is None or d < best else best
    if area and el.get("type") == "relation" and best is not None:
        # multipolygon split over open member ways: test the joined outer ring
        outer = [pt for m, line in zip(el.get("members") or [], lines) if m.get("role") == "outer" for pt in line]
        if len(outer) >= 4 and _inside(p, [_xy(lat, lon, a, o) for a, o in outer]):
            return 0.0
    return best


def summarise_osm(data: dict, lat: float, lon: float, radius: float = RADIUS_M) -> dict:
    """Counts and nearest distance (m) per category within `radius` of (lat, lon)."""
    out: dict[str, dict] = {}
    names: dict[str, list] = {}
    for el in data.get("elements", []):
        tags = el.get("tags") or {}
        cats = _categories(tags)
        if not cats:
            continue
        d = element_distance(el, lat, lon, area=bool(AREA_CATS & set(cats)) and "highway" not in tags)
        if d is None or d > radius:
            continue
        for c in cats:
            e = out.setdefault(c, {"count": 0, "nearest_m": None})
            e["count"] += 1
            if e["nearest_m"] is None or d < e["nearest_m"]:
                e["nearest_m"] = round(d)
        nm = tags.get("name")
        if nm and ("place_of_worship" in cats or "marketplace" in cats):
            for c in cats:
                if c in ("place_of_worship", "marketplace"):
                    names.setdefault(c, []).append((d, nm))
    for c, lst in names.items():
        seen = []
        for _, nm in sorted(lst):
            if nm not in seen:
                seen.append(nm)
        out[c]["names"] = seen[:3]
    return out


def summarise_weather(data: dict) -> dict:
    cur = data.get("current") or {}
    keys = {"temperature_2m": "temperature_c", "precipitation": "precipitation_mm", "rain": "rain_mm",
            "cloud_cover": "cloud_cover_pct", "wind_speed_10m": "wind_kmh", "wind_gusts_10m": "gusts_kmh",
            "wind_direction_10m": "wind_dir_deg", "relative_humidity_2m": "humidity_pct", "is_day": "is_day"}
    return {v: cur[k] for k, v in keys.items() if k in cur}


class PlaceService:
    def __init__(self, cfg, client: httpx.AsyncClient | None = None, clock=time.monotonic):
        self.cfg = cfg
        self._own_client = client is None
        self.client = client or httpx.AsyncClient(
            timeout=HTTP_TIMEOUT_S,
            headers={"User-Agent": f"OhMyOndas-layer2/0.1 (+{cfg.contact})"})
        self.clock = clock
        self._osm_areas: list = []  # [(fetched_at, lat, lon, data)]
        self._wx: dict = {}
        self._osm_lock = asyncio.Lock()
        self._last_overpass = -1e9
        self._cooldown_until = -1e9
        self._fails = 0
        self.requests = {"overpass": 0, "open_meteo": 0}

    async def aclose(self):
        if self._own_client:
            await self.client.aclose()

    def _cached(self, cache: dict, key):
        e = cache.get(key)
        if e and self.clock() - e[0] < CACHE_TTL_S:
            return e[1], True
        return None, False

    def _area_for(self, lat, lon):
        now = self.clock()
        self._osm_areas = [a for a in self._osm_areas if now - a[0] < OSM_TTL_S][-20:]
        best = None
        for a in self._osm_areas:
            d = haversine_m(lat, lon, a[1], a[2])
            if d <= QUERY_RADIUS_M - RADIUS_M and (best is None or d < best[0]):
                best = (d, a)
        return best[1] if best else None

    async def _get_osm(self, lat, lon):
        a = self._area_for(lat, lon)
        if a:
            return summarise_osm(a[3], lat, lon)
        async with self._osm_lock:
            a = self._area_for(lat, lon)
            if a:
                return summarise_osm(a[3], lat, lon)
            now = self.clock()
            if now < self._cooldown_until or now - self._last_overpass < OVERPASS_MIN_INTERVAL_S:
                return None
            self._last_overpass = now
            self.requests["overpass"] += 1
            try:
                r = await self.client.post(self.cfg.overpass_url, data={"data": overpass_query(lat, lon)})
                if r.status_code in (429, 502, 503, 504):
                    raise httpx.HTTPStatusError("busy", request=r.request, response=r)
                r.raise_for_status()
                data = r.json()
                if "remark" in data and not data.get("elements"):
                    raise ValueError("overpass remark: " + str(data["remark"])[:80])
            except (httpx.HTTPError, ValueError) as e:
                self._fails += 1
                self._cooldown_until = self.clock() + min(1800.0, OVERPASS_COOLDOWN_S * 2 ** (self._fails - 1))
                status = getattr(getattr(e, "response", None), "status_code", None)
                log.warning("overpass failed", extra={"error": type(e).__name__, "status": status, "fails": self._fails})
                return None
            self._fails = 0
            self._osm_areas.append((self.clock(), lat, lon, data))
            return summarise_osm(data, lat, lon)

    async def _get_weather(self, lat, lon, key):
        val, hit = self._cached(self._wx, key)
        if hit:
            return val
        self.requests["open_meteo"] += 1
        params = {"latitude": f"{lat:.3f}", "longitude": f"{lon:.3f}",
                  "current": "temperature_2m,relative_humidity_2m,precipitation,rain,cloud_cover,"
                             "wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day"}
        try:
            r = await self.client.get(self.cfg.open_meteo_url, params=params)
            r.raise_for_status()
            val = summarise_weather(r.json())
        except (httpx.HTTPError, ValueError) as e:
            log.warning("open-meteo failed", extra={"error": type(e).__name__})
            return None
        self._wx[key] = (self.clock(), val)
        return val

    async def context(self, lat: float, lon: float, utc: float | None = None) -> dict:
        key = cell_key(lat, lon)
        ts = utc or datetime.now(timezone.utc).timestamp()
        osm, wx = await asyncio.gather(self._get_osm(lat, lon), self._get_weather(lat, lon, key))
        return {"cell": f"{key[0]}:{key[1]}", "osm": osm, "weather": wx, "sun": sun_info(lat, lon, ts)}
