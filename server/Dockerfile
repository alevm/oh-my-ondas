# Oh My Ondas layer-2 server. TLS is terminated by the reverse proxy (Caddy) in front of it.
# Pinned by digest: the multi-arch index of python:3.13-slim (3.13.16-slim-trixie, pulled 2026-10-21).
# To update: podman pull python:3.13-slim; pin the index (manifest list) digest from RepoDigests, not the per-arch one.
FROM python:3.13-slim@sha256:cf50a4f6ac4f026458b08d5222023d700ac806410dff5e9ca8728fa44f2b850f

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    BIND_HOST=0.0.0.0 PORT=8765 \
    JOURNAL_DIR=/data/journal YAMNET_MODEL=/app/models/yamnet.tflite

RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin ondas \
 && mkdir -p /data && chown ondas:ondas /data
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py ./
COPY tools/fetch_model.py tools/
# YAMNet model: downloaded at build time, sha256 verified, never in git
RUN python tools/fetch_model.py --dest /app/models/yamnet.tflite && chmod 0444 /app/models/yamnet.tflite
USER ondas
VOLUME ["/data"]
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/healthz', timeout=3)"
CMD ["python", "app.py"]
