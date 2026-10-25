import json
import os
from urllib.parse import parse_qs
from datetime import datetime, timezone

import httpx
import pytest

from conftest import FIXTURES
from config import Config
from place import (PlaceService, cell_key, element_distance, overpass_query, summarise_osm, summarise_weather,
                   sun_info)

POINTS = {"barceloneta": (41.3784, 2.1925), "sagrada": (41.4036, 2.1744), "ciutadella": (41.3881, 2.1873)}
LAT, LON = POINTS["barceloneta"]


def load(name):
    with open(os.path.join(FIXTURES, name)) as f:
        return json.load(f)


def mock_client(log, overpass_status=200, overpass_fixture="overpass_barceloneta.json"):
    def handler(req: httpx.Request):
        log.append(req)
        if "overpass" in req.url.host:
            if overpass_status != 200:
                return httpx.Response(overpass_status, text="busy")
            return httpx.Response(200, json=load(overpass_fixture))
        if "open-meteo" in req.url.host:
            return httpx.Response(200, json=load("open_meteo_barceloneta.json"))
        return httpx.Response(404)
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), headers={"User-Agent": "test-agent"})


# ---- real responses recorded 2026-10-21 from overpass-api.de (trimmed, ODbL) ----
def test_real_barceloneta():
    s = summarise_osm(load("overpass_barceloneta.json"), LAT, LON)
    assert s["coastline"]["nearest_m"] < 60 and s["beach"]["nearest_m"] < 60  # on the seafront
    assert "road_major" not in s  # Passeig Maritim is not a through road here
    assert s["park"]["count"] >= 1 and "place_of_worship" not in s


def test_real_sagrada_familia():
    s = summarise_osm(load("overpass_sagrada.json"), *POINTS["sagrada"])
    pw = s["place_of_worship"]
    assert pw["nearest_m"] == 0 and pw["names"][0] == "Basílica de la Sagrada Família"  # inside the basilica polygon
    assert s["water"]["nearest_m"] < 100  # Placa de Gaudi pond
    assert s["subway"]["nearest_m"] < 100  # L2/L5 Sagrada Familia
    assert s["road_medium"]["count"] > 10  # Eixample grid


def test_real_ciutadella():
    s = summarise_osm(load("overpass_ciutadella.json"), *POINTS["ciutadella"])
    assert s["park"]["nearest_m"] == 0 and s["wood"]["nearest_m"] < 50
    assert s["water"]["nearest_m"] < 50  # the park lake
    assert s["tram"]["nearest_m"] < 300 and s["fountain"]["count"] >= 1
    assert "Capella Castrense" in s["place_of_worship"]["names"]


def test_real_open_meteo():
    for n in POINTS:
        w = summarise_weather(load(f"open_meteo_{n}.json"))
        assert {"temperature_c", "wind_kmh", "cloud_cover_pct", "rain_mm", "is_day"} <= set(w)


def test_geometry_inside_and_segments():
    sq = {"type": "way", "geometry": [{"lat": 0, "lon": 0}, {"lat": 0, "lon": 0.01}, {"lat": 0.01, "lon": 0.01},
                                      {"lat": 0.01, "lon": 0}, {"lat": 0, "lon": 0}]}
    assert element_distance(sq, 0.005, 0.005, area=True) == 0.0
    assert 550 < element_distance(sq, 0.005, 0.005, area=False) < 560  # to the nearest edge, not a vertex
    line = {"type": "way", "geometry": [{"lat": 0, "lon": -0.01}, {"lat": 0, "lon": 0.01}]}
    assert element_distance(line, 0.001, 0.0, area=False) == pytest.approx(110.5, abs=1)
    bounds_only = {"type": "relation", "bounds": {"minlat": 0, "minlon": 0, "maxlat": 0.01, "maxlon": 0.01}}
    assert element_distance(bounds_only, 0.005, 0.005, area=True) == 0.0


def test_query_is_bounded():
    q = overpass_query(LAT, LON)
    assert "[timeout:25]" in q and "around:500," in q and "out geom qt;" in q
    assert "footway" not in q  # sidewalks excluded (80 % of the Barcelona response)


def test_cells():
    assert cell_key(LAT, LON) != cell_key(LAT + 0.002, LON)


async def test_area_reuse_and_weather_cache():
    log = []
    t = [1000.0]
    svc = PlaceService(Config(), client=mock_client(log), clock=lambda: t[0])
    utc = datetime(2026, 10, 21, 10, 0, tzinfo=timezone.utc).timestamp()
    c1 = await svc.context(LAT, LON, utc)
    assert c1["osm"]["coastline"]["count"] >= 1 and c1["weather"]["wind_kmh"] == 5.6
    assert c1["sun"]["phase"] == "day"
    assert svc.requests == {"overpass": 1, "open_meteo": 1}
    # ~110 m inland (positions are rounded: 41.378 -> 41.379): another weather cell, same Overpass
    # area (no new query), distances recomputed
    t[0] += 30
    c2 = await svc.context(LAT + 0.0009, LON, utc)
    assert svc.requests["overpass"] == 1
    assert c2["osm"]["coastline"]["nearest_m"] > c1["osm"]["coastline"]["nearest_m"] + 30
    # 400 m away: outside the reusable radius -> new query
    t[0] += 30
    await svc.context(LAT + 0.0036, LON, utc)
    assert svc.requests["overpass"] == 2
    ov = [r for r in log if "overpass" in r.url.host][0]
    assert ov.method == "POST" and ov.headers["User-Agent"] == "test-agent"
    wx = [r for r in log if "open-meteo" in r.url.host][0]
    assert "wind_speed_10m" in wx.url.params["current"] and wx.url.params["latitude"] == "41.378"


@pytest.mark.parametrize("status", [429, 502, 503, 504])
async def test_overpass_busy_backs_off(status):
    log = []
    t = [0.0]
    svc = PlaceService(Config(), client=mock_client(log, overpass_status=status), clock=lambda: t[0])
    c = await svc.context(LAT, LON)
    assert c["osm"] is None and c["weather"] is not None
    t[0] += 30  # inside the 60 s cool-down
    await svc.context(LAT + 0.01, LON)
    assert svc.requests["overpass"] == 1
    t[0] += 40  # cool-down over -> retry, fails again, cool-down doubles to 120 s
    await svc.context(LAT + 0.02, LON)
    assert svc.requests["overpass"] == 2
    t[0] += 100
    await svc.context(LAT + 0.03, LON)
    assert svc.requests["overpass"] == 2


async def test_place_works_from_rounded_position():
    """Two positions ~30 m apart in the same 3-decimal cell give the same summary, nearest
    distances are bucketed to 50 m, and Overpass never sees more than 3 decimals."""
    log = []
    t = [0.0]
    svc = PlaceService(Config(), client=mock_client(log), clock=lambda: t[0])
    c1 = await svc.context(41.37812, 2.19262)
    c2 = await svc.context(41.37786, 2.19288)
    assert c1["osm"] == c2["osm"] and c1["osm"]
    assert all(v["nearest_m"] % 50 == 0 for v in c1["osm"].values())
    body = parse_qs([r for r in log if "overpass" in r.url.host][0].content.decode())["data"][0]
    assert "around:500,41.378,2.193)" in body and "41.3781" not in body
    assert all(v["nearest_m"] % 50 == 0 for v in summarise_osm(load("overpass_sagrada.json"), *POINTS["sagrada"]).values())


async def test_bad_position_and_client_error_do_not_cool_down():
    log = []
    t = [0.0]
    svc = PlaceService(Config(), client=mock_client(log, overpass_status=400), clock=lambda: t[0])
    for lat, lon in ((0.0, 0.0), (91.0, 2.0), (41.0, 181.0)):
        with pytest.raises(ValueError):
            await svc.context(lat, lon)
    assert svc.requests["overpass"] == 0
    c = await svc.context(LAT, LON)
    assert c["osm"] is None
    t[0] += 15  # past the minimum interval: a 400 is about the request, so no shared cool-down
    await svc.context(LAT + 0.01, LON)
    assert svc.requests["overpass"] == 2


async def test_network_failure_is_soft():
    def boom(req):
        raise httpx.ConnectError("offline")
    svc = PlaceService(Config(), client=httpx.AsyncClient(transport=httpx.MockTransport(boom)))
    c = await svc.context(LAT, LON)
    assert c["osm"] is None and c["weather"] is None and "elevation_deg" in c["sun"]


def test_sun_barcelona():
    noon = datetime(2026, 6, 21, 11, 15, tzinfo=timezone.utc).timestamp()  # ~solar noon in BCN
    s = sun_info(LAT, LON, noon)
    assert 70 < s["elevation_deg"] < 74 and s["phase"] == "day"
    assert 150 < s["azimuth_deg"] < 210
    assert 6 * 60 < s["minutes_since_sunrise"] < 8 * 60 and 7 * 60 < s["minutes_to_sunset"] < 9 * 60
    night = datetime(2026, 10, 21, 1, 0, tzinfo=timezone.utc).timestamp()
    assert sun_info(LAT, LON, night)["phase"] == "night"
