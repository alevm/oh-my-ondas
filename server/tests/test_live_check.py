import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "tools", "live_check.py")


def run(*args, key=False):
    env = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}
    return subprocess.run([sys.executable, SCRIPT, *args], capture_output=True, text=True, env=env, timeout=60)


def test_dry_run_shows_exact_request():
    r = run("--dry-run")
    assert r.returncode == 0, r.stderr
    out = r.stdout
    assert "POST https://api.anthropic.com/v1/messages" in out
    assert "anthropic-beta: server-side-fallback-2026-07-01" in out
    body = json.loads(out.split("body:", 1)[1].split("system prompt chars")[0])
    assert body["model"] == "claude-sonnet-5-5" and body["fallbacks"] == "default"
    assert body["output_config"]["format"]["type"] == "json_schema" and body["output_config"]["effort"] == "low"
    assert "tool_choice" not in body and "thinking" not in body
    assert "capture inventory" in out and "within 300 m" in out  # recorded session + real place fixture


def test_without_key_refuses_live_call():
    r = run()
    assert r.returncode == 2 and "ANTHROPIC_API_KEY is not set" in r.stderr
