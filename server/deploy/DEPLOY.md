# Deploying the layer-2 server on Sisyphus (not done; steps for you to run)

Written from `~/Current/Sisyphus/sisyphus-infra` (read-only), following its conventions:
- apps are built on the VPS from the project clone
- the env file lives on the VPS only
- data goes in `/data`
- health check, 512M / 0.5 CPU limits, network `sisyphus`
- Caddy `{$DOMAIN_X}` block with crowdsec, `security_headers` and a JSON log rolled at 10 MiB × 2

In Sisyphus, only the **operator** role edits `services/` and touches the VPS. The project side
files a ticket. So the steps below are split by role.

## Files here

| File | Goes to |
|---|---|
| `compose.service.yml` | merged into `sisyphus-infra/services/docker-compose.yml` (service `ondas-ws`, volume `ondas-ws-data`) |
| `Caddyfile.snippet` | appended to `sisyphus-infra/services/caddy/Caddyfile` |
| `env.local.template` | becomes `/opt/sisyphus/sites/ohmyondas.levm.eu/server/.env.local` on the VPS (mode 600) |
| `ticket-to-operator.md` | `sisyphus-infra/.bus/tickets/to_operator/<ticket_id>.md` |

## Decisions to take first

1. **Hostname:** `ondas-ws.levm.eu` is a proposal. The ESP32 firmware needs the final name and
   should pin or validate the Let's Encrypt chain.
2. **Deploy shape:** this repo is already a *static* Sisyphus site (Caddy serves `web/`). The
   proposal builds an *app* container from `server/` of the same clone. In Sisyphus that is an
   architect decision (a new shape for an existing project); the ticket says so.
3. **Overpass:** the public server answered 502 "at capacity" during testing. The code copes
   (cache, backoff, stale context). A self-hosted Overpass is the robust option, but it costs
   RAM and disk on the VPS.

## Steps (project owner, you)

1. Run the tests and the image build locally:
   ```bash
   cd server
   .venv/bin/python tools/fetch_model.py && .venv/bin/python -m pytest -q
   podman build -t ondas-ws:local .        # or docker build
   podman run --rm -p 127.0.0.1:18765:8765 --read-only --tmpfs /tmp --cap-drop ALL \
     -e DEVICE_TOKENS=test -e PLACE_ENABLED=0 ondas-ws:local &
   .venv/bin/python tools/sim_device.py --url ws://127.0.0.1:18765 --token test --duration 30 --speed 60
   ```
2. Commit and push `server/` (you decide when; nothing has been committed).
3. Generate one token per device: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`.
   Keep the tokens and the Anthropic API key out of git and out of the ticket. Hand them to the
   operator out of band.
4. Fill in `ticket-to-operator.md` (id, timestamp, VPS IP) and file it in
   `~/Current/Sisyphus/sisyphus-infra/.bus/tickets/to_operator/`.

## Steps (operator, on the VPS; listed so the ticket is complete)

1. DNS: `ondas-ws.levm.eu` A/AAAA → VPS.
2. `services/.env`: `DOMAIN_ONDASWS=ondas-ws.levm.eu`.
3. `git pull` in `/opt/sisyphus/sites/ohmyondas.levm.eu`.
4. Create `/opt/sisyphus/sites/ohmyondas.levm.eu/server/.env.local` from `env.local.template`
   with mode 600, owned by root.
5. Merge `compose.service.yml` and `Caddyfile.snippet`. Then run
   `scripts/caddy-validate.sh` and `docker compose up -d --build ondas-ws`, and reload Caddy.
   The image build downloads the YAMNet model (4 MB, sha256 checked), so the VPS needs
   outbound access to storage.googleapis.com at build time.
6. Verify:
   ```bash
   curl -s https://ondas-ws.levm.eu/healthz                      # ok
   curl -s -o /dev/null -w '%{http_code}\n' -H 'Upgrade: websocket' -H 'Connection: Upgrade' \
     -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' https://ondas-ws.levm.eu/   # 401
   docker logs --tail 5 sisyphus-ondas-ws                       # "listening", tagger yamnet
   docker stats --no-stream sisyphus-ondas-ws                   # < 512M (local: ~70-90 MiB)
   ```
7. From your laptop, point the simulator at production with a real token:
   `python tools/sim_device.py --url wss://ondas-ws.levm.eu --token <token> --duration 60`.
8. Register `ondas-ws` for monitoring (health URL above).

## Operations

- **Logs:** JSON lines on stdout; Docker `json-file` keeps 3 × 10 MB. Caddy writes
  `/var/log/caddy/ondas-ws.log` (10 MiB × 2) and redacts `Authorization`.
- **Journal:** in the `ondas-ws-data` volume at `/data/journal/<date>/*.jsonl`, kept for
  `JOURNAL_RETENTION_DAYS` (30). To review a walk:
  `docker cp sisyphus-ondas-ws:/data/journal ./journal && python tools/review_walk.py --latest --dir journal`.
- **Cost:** `docker logs sisyphus-ondas-ws | grep '"claude usage"'` shows tokens and estimated
  USD per call and per hour.
- **Rotate a device token:** edit `DEVICE_TOKENS` in `.env.local`, then
  `docker compose up -d ondas-ws`.
- **Roll back:** `ONDASWS_TAG=<previous> docker compose up -d ondas-ws`, or the Sisyphus
  webhook's auto-rollback.
- **Shutdown:** SIGTERM is handled; the container stops in under a second.
