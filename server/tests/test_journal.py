import json
import os

from journal import Journal, read_walk


def test_walk_log_and_rounding(tmp_path):
    t = [1792569600.0]
    j = Journal(str(tmp_path), retention_days=30, clock=lambda: t[0])
    w = j.open("dev-abc/../x", {"fw": "1"})
    w.write("place", lat=41.378412345, lon=2.192512345, osm={"coastline": {"count": 1, "nearest_m": 26}})
    w.write("plan", plan={"why": "waves"}, source="rules")
    files = list(tmp_path.rglob("*.jsonl"))
    assert len(files) == 1 and ".." not in files[0].name and files[0].parent.name == "2026-10-21"
    evs = read_walk(str(files[0]))
    assert [e["ev"] for e in evs] == ["start", "place", "plan"]
    assert evs[1]["lat"] == 41.378 and evs[1]["lon"] == 2.193
    assert evs[0]["device"] == "dev-abc/../x" and evs[0]["fw"] == "1"


def test_retention_prunes_old_files(tmp_path):
    old = tmp_path / "2026-01-01"
    old.mkdir()
    f = old / "dev_000000.jsonl"
    f.write_text(json.dumps({"t": 0, "ev": "start"}) + "\n")
    os.utime(f, (1000, 1000))
    keep = tmp_path / "2026-10-21"
    keep.mkdir()
    k = keep / "dev_120000.jsonl"
    k.write_text("{}\n")
    j = Journal(str(tmp_path), retention_days=30)
    assert not f.exists() and not old.exists() and k.exists()
    assert j.prune() == 0


def test_disabled_journal_writes_nothing(tmp_path):
    j = Journal(str(tmp_path / "j"), enabled=False)
    w = j.open("dev")
    w.write("plan", plan={})
    assert not (tmp_path / "j").exists() and w.lines == 0


def test_review_tool_prints_timeline(tmp_path):
    import subprocess
    import sys
    j = Journal(str(tmp_path))
    w = j.open("dev")
    w.write("place", lat=41.3784, lon=2.1925, osm={"coastline": {"count": 1, "nearest_m": 26}}, weather={}, sun={})
    w.write("plan", source="rules", plan={"plan_id": 1, "starts_at_bar": 2, "bars": 16, "why": "waves near",
                                          "tracks": [{"role": "texture", "capture_id": 2}]})
    script = os.path.join(os.path.dirname(__file__), "..", "tools", "review_walk.py")
    r = subprocess.run([sys.executable, script, "--latest", "--dir", str(tmp_path)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    assert "coastline 26 m" in r.stdout and "plan #1 [rules]" in r.stdout and "waves near" in r.stdout
