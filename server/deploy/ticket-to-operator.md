---
ticket_id: <YYYYMMDD-HHMMSS>_pm-ohmyondas_onboard-ondas-ws
from: pm-ohmyondas
to: operator
created: <ISO-8601 timestamp>
priority: normal
kind: mixed
model: sonnet
blocks: []
blocked_by: []
acceptance_checks:
  - "dig +short ondas-ws.levm.eu A -> <VPS IPv4>"
  - "curl -s https://ondas-ws.levm.eu/healthz -> ok"
  - "curl -s -o /dev/null -w '%{http_code}' -H 'Upgrade: websocket' -H 'Connection: Upgrade' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' https://ondas-ws.levm.eu/ -> 401"
---

# Onboard ondas-ws (Oh My Ondas layer-2 WebSocket app)

New containerized app from the ohmyondas.levm.eu repo, folder `server/` (Python, one HTTP/WebSocket
port 8765, health `GET /healthz` -> 200, persistent data in `/data`).

Proposed (architect decision needed: a second deploy shape — app — for a repo that is already a
static site; build context is a subfolder of the existing clone):

1. DNS: `ondas-ws.levm.eu` A/AAAA -> VPS. Hostname is a proposal.
2. `services/.env`: `DOMAIN_ONDASWS=ondas-ws.levm.eu`.
3. Compose service: `server/deploy/compose.service.yml` in the project repo.
4. Caddy block: `server/deploy/Caddyfile.snippet`.
5. Secrets: create `/opt/sisyphus/sites/ohmyondas.levm.eu/server/.env.local` (mode 600) from
   `server/deploy/env.local.template`; the owner provides DEVICE_TOKENS and ANTHROPIC_API_KEY
   out of band.
6. Register `ondas-ws` for monitoring (health URL `https://ondas-ws.levm.eu/healthz`).
7. Outbound HTTPS from the container to api.anthropic.com, overpass-api.de, api.open-meteo.com.

## Acceptance

- [ ] healthz returns ok over HTTPS
- [ ] WebSocket upgrade without a token returns 401
- [ ] `docker stats sisyphus-ondas-ws` under 512M
- [ ] Response written to `~/Current/Sisyphus/sisyphus-infra/.bus/responses/`
