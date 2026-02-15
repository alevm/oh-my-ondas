#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Oh My Ondas — Demo Recording Pipeline
#
# Records the in-browser DEMO mode (demo-mode.js) as a video file.
#
# Phases:
#   0. Preflight    — check deps, detect audio/display system
#   1. Mic test     — record 3s, validate levels
#   2. Launch       — serve app, open Chrome
#   3. Record       — capture screen + system audio via ffmpeg
#   4. Wait         — wait for DEMO to finish
#   5. Post-process — trim, normalize audio, fade in/out
#   6. Report       — file stats, audio analysis
#
# Usage: ./record-demo.sh [OPTIONS]
#   --auto            Auto-start demo (opens ?demo=auto, no prompts)
#   --manual          Manual mode (default): prompts, you click DEMO
#   --mic-test-only   Run mic test and exit
#   --no-record       Launch app + Chrome but skip recording
#   --fake-mic FILE   Use a WAV file as fake mic input
#   --duration SECS   Override wait duration (default: 55)
#   --output FILE     Override output filename
#   --no-trim         Skip post-processing
#   --help            Show this help
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Colors ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
fail() { echo -e "  ${RED}✗${NC} $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $*"; }
info() { echo -e "  ${CYAN}→${NC} $*"; }
header() { echo -e "\n${BOLD}═══ $* ═══${NC}"; }

# ─── Defaults ───
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$SCRIPT_DIR/web"
PORT=8766
BASE="http://127.0.0.1:$PORT"
DURATION=55
FAKE_MIC=""
OUTPUT=""
NO_RECORD=false
NO_TRIM=false
MIC_TEST_ONLY=false
AUTO_MODE=false
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RAW_FILE="/tmp/ohmyondas-raw-${TIMESTAMP}.mp4"
TRIMMED_FILE=""
SERVER_PID=""
CHROME_PID=""
FFMPEG_PID=""

# ─── Parse args ───
while [[ $# -gt 0 ]]; do
  case "$1" in
    --auto) AUTO_MODE=true; shift ;;
    --manual) AUTO_MODE=false; shift ;;
    --mic-test-only) MIC_TEST_ONLY=true; shift ;;
    --no-record) NO_RECORD=true; shift ;;
    --fake-mic) FAKE_MIC="$2"; shift 2 ;;
    --duration) DURATION="$2"; shift 2 ;;
    --output) OUTPUT="$2"; shift 2 ;;
    --no-trim) NO_TRIM=true; shift ;;
    --help|-h)
      head -25 "$0" | tail -20
      exit 0
      ;;
    *) fail "Unknown option: $1"; exit 1 ;;
  esac
done

# Set output filename
if [[ -z "$OUTPUT" ]]; then
  OUTPUT="$SCRIPT_DIR/demo/output/ohmyondas-demo-${TIMESTAMP}.mp4"
fi
TRIMMED_FILE="${OUTPUT%.mp4}-trimmed.mp4"

# ─── Cleanup trap ───
cleanup() {
  [[ -n "$FFMPEG_PID" ]] && kill "$FFMPEG_PID" 2>/dev/null || true
  [[ -n "$CHROME_PID" ]] && kill "$CHROME_PID" 2>/dev/null || true
  [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null || true
  # Kill any leftover server on our port
  fuser -k "${PORT}/tcp" 2>/dev/null || true
  rm -f /tmp/ohmyondas-mic-test.wav
  rm -rf /tmp/ohmyondas-chrome-profile 2>/dev/null || true
}
trap cleanup EXIT

# ══════════════════════════════════════════════════════════════
# PHASE 0: PREFLIGHT
# ══════════════════════════════════════════════════════════════
header "PHASE 0: PREFLIGHT"

check_cmd() {
  if command -v "$1" &>/dev/null; then
    ok "$1 found: $(command -v "$1")"
    return 0
  else
    fail "$1 not found — install: $2"
    return 1
  fi
}

MISSING=0
check_cmd ffmpeg       "sudo zypper install ffmpeg"    || ((MISSING++))
check_cmd python3      "sudo zypper install python3"   || ((MISSING++))

# Chrome — try multiple names
CHROME_BIN=""
for name in google-chrome-stable google-chrome chromium chromium-browser; do
  if command -v "$name" &>/dev/null; then
    CHROME_BIN="$name"
    break
  fi
done
if [[ -n "$CHROME_BIN" ]]; then
  ok "Chrome found: $CHROME_BIN"
else
  fail "Chrome not found — install google-chrome-stable or chromium"
  ((MISSING++))
fi

# Optional tools
check_cmd pactl   "sudo zypper install pulseaudio-utils" || warn "pactl missing (audio monitor detection limited)"
check_cmd arecord "sudo zypper install alsa-utils"       || warn "arecord missing (mic test unavailable)"
check_cmd sox     "sudo zypper install sox"               || warn "sox missing (audio analysis limited)"
check_cmd xdotool "sudo zypper install xdotool"          || warn "xdotool missing (no auto-click DEMO)"

if [[ "$MISSING" -gt 0 ]]; then
  fail "$MISSING required tool(s) missing. Fix and re-run."
  exit 1
fi

# Detect display server and screen capture method
DISPLAY_TYPE="unknown"
CAPTURE_METHOD=""

# Check for XWayland / X11 (DISPLAY set = x11grab works)
if [[ -n "${DISPLAY:-}" ]]; then
  X11_DISPLAY="$DISPLAY"
else
  # Try common XWayland displays
  for d in :1 :0; do
    if xrandr --display "$d" --listmonitors &>/dev/null; then
      X11_DISPLAY="$d"
      break
    fi
  done
fi

if [[ "${XDG_SESSION_TYPE:-}" == "wayland" ]] || [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
  DISPLAY_TYPE="wayland"
  if command -v wf-recorder &>/dev/null; then
    CAPTURE_METHOD="wf-recorder"
  elif [[ -n "${X11_DISPLAY:-}" ]]; then
    CAPTURE_METHOD="x11grab"
    info "Wayland detected but using XWayland (DISPLAY=$X11_DISPLAY) for capture"
  fi
elif [[ -n "${X11_DISPLAY:-}" ]]; then
  DISPLAY_TYPE="x11"
  CAPTURE_METHOD="x11grab"
fi

if [[ -z "$CAPTURE_METHOD" ]]; then
  fail "No screen capture method available."
  fail "Install wf-recorder (zypper install wf-recorder) or ensure XWayland is running."
  exit 1
fi

info "Display server: $DISPLAY_TYPE"
info "Capture method: $CAPTURE_METHOD"

# Detect audio system
AUDIO_SYSTEM="unknown"
if pactl info 2>/dev/null | grep -qi pipewire; then
  AUDIO_SYSTEM="pipewire"
elif pactl info 2>/dev/null | grep -qi pulseaudio; then
  AUDIO_SYSTEM="pulseaudio"
elif command -v pw-cli &>/dev/null && pw-cli info 2>/dev/null; then
  AUDIO_SYSTEM="pipewire"
fi
info "Audio system: $AUDIO_SYSTEM"

# Find audio sources
MONITOR_SOURCE=""
MIC_SOURCE=""
if command -v pactl &>/dev/null; then
  # System audio monitor (what Chrome outputs through speakers)
  DEFAULT_SINK=$(pactl get-default-sink 2>/dev/null || echo "")
  if [[ -n "$DEFAULT_SINK" ]]; then
    MONITOR_SOURCE="${DEFAULT_SINK}.monitor"
    ok "System audio: $MONITOR_SOURCE"
  fi

  # Mic source (raw room sound)
  MIC_SOURCE=$(pactl get-default-source 2>/dev/null || echo "")
  # If default source is a monitor, find a real mic instead
  if [[ "$MIC_SOURCE" == *monitor* ]] || [[ -z "$MIC_SOURCE" ]]; then
    MIC_SOURCE=$(pactl list short sources 2>/dev/null | grep -v monitor | head -1 | awk '{print $2}')
  fi
  if [[ -n "$MIC_SOURCE" ]]; then
    ok "Mic source: $MIC_SOURCE"
  else
    warn "No mic source found"
  fi
fi

# List mic inputs
if command -v pactl &>/dev/null; then
  info "Available mic inputs:"
  pactl list short sources 2>/dev/null | grep -v monitor | while read -r line; do
    echo "      $line"
  done
fi

echo ""
ok "Preflight complete"

# ══════════════════════════════════════════════════════════════
# PHASE 1: MIC TEST
# ══════════════════════════════════════════════════════════════
header "PHASE 1: MIC TEST"

MIC_OK=false
if command -v arecord &>/dev/null; then
  echo -e "  Make noise for 3 seconds..."
  if arecord -d 3 -f S16_LE -r 44100 -c 1 /tmp/ohmyondas-mic-test.wav 2>/dev/null; then
    FSIZE=$(stat -c%s /tmp/ohmyondas-mic-test.wav 2>/dev/null || echo 0)
    if [[ "$FSIZE" -gt 1000 ]]; then
      if command -v sox &>/dev/null; then
        STATS=$(sox /tmp/ohmyondas-mic-test.wav -n stat 2>&1 || true)
        RMS=$(echo "$STATS" | grep "RMS.*amplitude" | head -1 | awk '{print $NF}')
        PEAK=$(echo "$STATS" | grep "Maximum amplitude" | awk '{print $NF}')
        info "RMS: ${RMS:-?}  Peak: ${PEAK:-?}"

        RMS_NUM=$(echo "${RMS:-0}" | sed 's/[^0-9.]//g')
        if (( $(echo "$RMS_NUM < 0.005" | bc -l 2>/dev/null || echo 0) )); then
          fail "Mic appears silent (RMS < 0.005). Check pavucontrol."
        elif (( $(echo "$RMS_NUM < 0.02" | bc -l 2>/dev/null || echo 0) )); then
          warn "Mic is quiet (RMS < 0.02). Consider increasing gain."
          MIC_OK=true
        else
          ok "Mic levels look good"
          MIC_OK=true
        fi
      else
        # No sox — check file isn't all zeros
        ZEROS=$(od -A n -t x1 -N 1000 /tmp/ohmyondas-mic-test.wav 2>/dev/null | tr -d ' \n' | grep -c "00" || echo 0)
        if [[ "$ZEROS" -lt 900 ]]; then
          ok "Mic recording captured audio (sox unavailable for detailed analysis)"
          MIC_OK=true
        else
          fail "Mic recording appears silent"
        fi
      fi
    else
      fail "Mic recording too small ($FSIZE bytes)"
    fi
  else
    warn "arecord failed — mic may not be available"
  fi
else
  warn "arecord not available — skipping mic test"
  MIC_OK=true
fi

if $MIC_TEST_ONLY; then
  if $MIC_OK; then
    ok "Mic test passed"
    exit 0
  else
    fail "Mic test failed"
    exit 1
  fi
fi

# ══════════════════════════════════════════════════════════════
# PHASE 2: LAUNCH
# ══════════════════════════════════════════════════════════════
header "PHASE 2: LAUNCH"

# Kill any existing server on port
fuser -k "${PORT}/tcp" 2>/dev/null || true
sleep 0.5

# Start local server
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$WEB_DIR" &>/dev/null &
SERVER_PID=$!
info "Server PID $SERVER_PID on port $PORT"
sleep 1.5

# Verify server is running
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  fail "Server failed to start"
  exit 1
fi
ok "Server running at $BASE"

# Use isolated profile so Chrome doesn't just hand off to existing instance
CHROME_PROFILE="/tmp/ohmyondas-chrome-profile"
mkdir -p "$CHROME_PROFILE"

# Prefer chromium (stays alive as separate process) over google-chrome
# google-chrome-stable delegates to existing instance and exits
for name in chromium chromium-browser google-chrome-stable google-chrome; do
  if command -v "$name" &>/dev/null; then
    CHROME_BIN="$name"
    break
  fi
done

# Build Chrome flags
CHROME_FLAGS=(
  --autoplay-policy=no-user-gesture-required
  "--user-data-dir=$CHROME_PROFILE"
  --window-size=1920,1080
  --window-position=0,0
  --disable-infobars
  --disable-extensions
  --no-first-run
  --no-default-browser-check
)

# Force X11 rendering when using x11grab capture (Wayland windows are invisible to x11grab)
if [[ "$CAPTURE_METHOD" == "x11grab" ]]; then
  CHROME_FLAGS+=(--ozone-platform=x11)
  info "Forcing Chrome X11 mode (needed for x11grab capture)"
fi

# PipeWire support
if [[ "$AUDIO_SYSTEM" == "pipewire" ]]; then
  CHROME_FLAGS+=(--enable-features=WebRTCPipeWireCapturer)
fi

# Fake mic
if [[ -n "$FAKE_MIC" ]]; then
  if [[ ! -f "$FAKE_MIC" ]]; then
    fail "Fake mic file not found: $FAKE_MIC"
    exit 1
  fi
  CHROME_FLAGS+=(
    --use-fake-device-for-media-stream
    --use-fake-ui-for-media-stream
    "--use-file-for-fake-audio-capture=$FAKE_MIC"
  )
  info "Using fake mic: $FAKE_MIC"
fi

# Launch Chrome
APP_URL="${BASE}/app.html"
if $AUTO_MODE; then
  APP_URL="${APP_URL}?demo=auto"
fi
info "Launching Chrome..."
"$CHROME_BIN" "${CHROME_FLAGS[@]}" "$APP_URL" &>/dev/null &
CHROME_PID=$!
info "Chrome PID $CHROME_PID"
sleep 4

if kill -0 "$CHROME_PID" 2>/dev/null; then
  ok "Chrome running (PID $CHROME_PID)"
else
  # Chrome may have delegated to existing instance — check if page is reachable
  if curl -s -o /dev/null -w "%{http_code}" "${BASE}/app.html" 2>/dev/null | grep -q "200"; then
    warn "Chrome process exited (delegated to existing instance) — app is reachable"
    CHROME_PID=""
  else
    fail "Chrome failed to start and app is not reachable"
    exit 1
  fi
fi

if $NO_RECORD; then
  echo ""
  ok "App launched (--no-record mode). Press Ctrl+C to stop."
  wait "$CHROME_PID" 2>/dev/null || true
  exit 0
fi

# ══════════════════════════════════════════════════════════════
# PHASE 3: RECORD
# ══════════════════════════════════════════════════════════════
header "PHASE 3: RECORD"

# Ensure output directory exists
mkdir -p "$(dirname "$RAW_FILE")"
mkdir -p "$(dirname "$OUTPUT")"

# Build recording command based on capture method
if $AUTO_MODE; then
  info "Auto mode — waiting 5s for audio engine + mic to settle..."
  sleep 5
else
  echo ""
  echo -e "  ${YELLOW}Press Enter when ready, then click DEMO in the app.${NC}"
  echo -e "  ${CYAN}Recording will run for ${DURATION}s.${NC}"
  read -r
fi

info "Starting recording ($CAPTURE_METHOD)..."

if [[ "$CAPTURE_METHOD" == "wf-recorder" ]]; then
  WF_ARGS=(-f "$RAW_FILE")
  [[ -n "$MONITOR_SOURCE" ]] && WF_ARGS+=(--audio="$MONITOR_SOURCE")
  wf-recorder "${WF_ARGS[@]}" &>/dev/null &
  FFMPEG_PID=$!

elif [[ "$CAPTURE_METHOD" == "x11grab" ]]; then
  FFMPEG_CMD=(ffmpeg -y
    -f x11grab -r 25 -video_size 1920x1080 -i "$X11_DISPLAY"
  )

  # Audio: mix raw mic + system audio output together
  AUDIO_INPUTS=0
  if [[ -n "$MIC_SOURCE" ]]; then
    FFMPEG_CMD+=(-f pulse -i "$MIC_SOURCE")
    AUDIO_INPUTS=$((AUDIO_INPUTS + 1))
  fi
  if [[ -n "$MONITOR_SOURCE" ]]; then
    FFMPEG_CMD+=(-f pulse -i "$MONITOR_SOURCE")
    AUDIO_INPUTS=$((AUDIO_INPUTS + 1))
  fi

  FFMPEG_CMD+=(-c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p)

  if [[ "$AUDIO_INPUTS" -eq 2 ]]; then
    # Mix mic + system audio into one stereo track
    FFMPEG_CMD+=(-filter_complex "[1:a][2:a]amix=inputs=2:duration=longest[aout]" -map 0:v -map "[aout]")
    FFMPEG_CMD+=(-c:a aac -b:a 192k)
  elif [[ "$AUDIO_INPUTS" -eq 1 ]]; then
    FFMPEG_CMD+=(-c:a aac -b:a 192k)
  else
    FFMPEG_CMD+=(-an)
  fi

  FFMPEG_CMD+=(-movflags +faststart "$RAW_FILE")

  "${FFMPEG_CMD[@]}" &>/dev/null &
  FFMPEG_PID=$!
fi

info "Recorder PID $FFMPEG_PID"

# ══════════════════════════════════════════════════════════════
# PHASE 4: WAIT
# ══════════════════════════════════════════════════════════════
header "PHASE 4: WAITING"

info "Waiting ${DURATION}s for demo to complete..."
if ! $AUTO_MODE; then
  info "Click DEMO in the app now!"
fi
for ((i = 0; i < DURATION; i++)); do
  if ! kill -0 "$FFMPEG_PID" 2>/dev/null; then
    warn "Recorder stopped early"
    break
  fi
  if (( i % 10 == 0 )); then
    echo -ne "\r  ${CYAN}→${NC} ${i}s / ${DURATION}s"
  fi
  sleep 1
done
echo -e "\r  ${GREEN}✓${NC} Recording complete (${DURATION}s)      "

# Stop recorder cleanly
if kill -0 "$FFMPEG_PID" 2>/dev/null; then
  kill -INT "$FFMPEG_PID" 2>/dev/null || true
  sleep 2
  kill -9 "$FFMPEG_PID" 2>/dev/null || true
fi
wait "$FFMPEG_PID" 2>/dev/null || true
FFMPEG_PID=""

# Check raw file
if [[ ! -f "$RAW_FILE" ]] || [[ $(stat -c%s "$RAW_FILE" 2>/dev/null || echo 0) -lt 10000 ]]; then
  fail "Recording failed — raw file missing or too small"
  exit 1
fi
ok "Raw recording: $RAW_FILE ($(du -h "$RAW_FILE" | cut -f1))"

# ══════════════════════════════════════════════════════════════
# PHASE 5: POST-PROCESS
# ══════════════════════════════════════════════════════════════
header "PHASE 5: POST-PROCESS"

if $NO_TRIM; then
  cp "$RAW_FILE" "$OUTPUT"
  ok "Skipping post-processing (--no-trim)"
else
  # Detect actual duration
  RAW_DUR=$(ffprobe -v quiet -print_format json -show_format "$RAW_FILE" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['format']['duration'])" 2>/dev/null || echo "$DURATION")
  info "Raw duration: ${RAW_DUR}s"

  # Trim: skip first 2s (loading), end at duration - 2s
  TRIM_END=$(python3 -c "print(max(5, float('$RAW_DUR') - 2))" 2>/dev/null || echo "$DURATION")

  # Check if raw has audio
  HAS_AUDIO=$(ffprobe -v quiet -print_format json -show_streams "$RAW_FILE" 2>/dev/null | python3 -c "import sys,json; print('yes' if any(s['codec_type']=='audio' for s in json.load(sys.stdin).get('streams',[])) else 'no')" 2>/dev/null || echo "no")

  PP_CMD=(ffmpeg -y -i "$RAW_FILE" -ss 2 -to "$TRIM_END")

  # Video filters: fade in 1s, fade out 2s
  FADE_OUT_START=$(python3 -c "print(max(0, float('$TRIM_END') - 2 - 4))" 2>/dev/null || echo "40")
  PP_CMD+=(-vf "fade=t=in:st=0:d=1,fade=t=out:st=${FADE_OUT_START}:d=2")

  if [[ "$HAS_AUDIO" == "yes" ]]; then
    AUDIO_FADE_OUT=$(python3 -c "print(max(0, float('$TRIM_END') - 2 - 3))" 2>/dev/null || echo "40")
    PP_CMD+=(-af "loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:st=0:d=0.5,afade=t=out:st=${AUDIO_FADE_OUT}:d=2")
    PP_CMD+=(-c:a aac -b:a 192k)
  else
    PP_CMD+=(-an)
    warn "No audio in raw recording"
  fi

  PP_CMD+=(-c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -movflags +faststart "$OUTPUT")

  info "Post-processing..."
  "${PP_CMD[@]}" 2>/dev/null
  ok "Processed: $OUTPUT"

  # Clean up raw
  rm -f "$RAW_FILE"
fi

# ══════════════════════════════════════════════════════════════
# PHASE 6: REPORT
# ══════════════════════════════════════════════════════════════
header "PHASE 6: REPORT"

echo ""
echo -e "${BOLD}════════════════════════════════════════${NC}"
echo -e "${BOLD}  RECORDING COMPLETE${NC}"
echo -e "${BOLD}════════════════════════════════════════${NC}"

# File info
FSIZE=$(stat -c%s "$OUTPUT" 2>/dev/null || echo 0)
FSIZE_MB=$(python3 -c "print(f'{$FSIZE / 1024 / 1024:.1f}')" 2>/dev/null || echo "?")

PROBE=$(ffprobe -v quiet -print_format json -show_format -show_streams "$OUTPUT" 2>/dev/null || echo "{}")
DUR=$(echo "$PROBE" | python3 -c "import sys,json; print(f\"{float(json.load(sys.stdin).get('format',{}).get('duration',0)):.1f}\")" 2>/dev/null || echo "?")
VCODEC=$(echo "$PROBE" | python3 -c "import sys,json; ss=[s for s in json.load(sys.stdin).get('streams',[]) if s['codec_type']=='video']; print(f\"{ss[0]['codec_name']} {ss[0]['width']}x{ss[0]['height']}\" if ss else 'none')" 2>/dev/null || echo "?")
ACODEC=$(echo "$PROBE" | python3 -c "import sys,json; ss=[s for s in json.load(sys.stdin).get('streams',[]) if s['codec_type']=='audio']; print(ss[0]['codec_name'] if ss else 'none')" 2>/dev/null || echo "none")

echo -e "  File:     ${CYAN}$(basename "$OUTPUT")${NC}"
echo -e "  Path:     $OUTPUT"
echo -e "  Size:     ${FSIZE_MB} MB"
echo -e "  Duration: ${DUR}s"
echo -e "  Video:    $VCODEC"
echo -e "  Audio:    $ACODEC"

# Audio analysis with sox
if [[ "$ACODEC" != "none" ]] && command -v sox &>/dev/null; then
  AUDIO_TMP="/tmp/ohmyondas-audio-${TIMESTAMP}.wav"
  ffmpeg -y -i "$OUTPUT" -vn -ar 44100 -ac 1 "$AUDIO_TMP" 2>/dev/null || true
  if [[ -f "$AUDIO_TMP" ]]; then
    STATS=$(sox "$AUDIO_TMP" -n stat 2>&1 || true)
    PEAK=$(echo "$STATS" | grep "Maximum amplitude" | awk '{print $NF}')
    RMS=$(echo "$STATS" | grep "RMS.*amplitude" | head -1 | awk '{print $NF}')
    echo -e "  Audio analysis:"
    echo -e "    Peak:  ${PEAK:-?}"
    echo -e "    RMS:   ${RMS:-?}"

    # Check levels
    RMS_VAL=$(echo "${RMS:-0}" | sed 's/[^0-9.]//g')
    if (( $(echo "$RMS_VAL > 0.01" | bc -l 2>/dev/null || echo 0) )); then
      echo -e "    ${GREEN}✓ Audio levels OK${NC}"
    else
      echo -e "    ${YELLOW}⚠ Audio may be too quiet${NC}"
    fi

    # Frequency balance (if sox stat -freq works)
    FREQ_STATS=$(sox "$AUDIO_TMP" -n stat -freq 2>&1 | head -100 || true)
    if [[ -n "$FREQ_STATS" ]]; then
      # Rough frequency bands
      LOW=$(echo "$FREQ_STATS" | awk '$1 > 20 && $1 < 300 {sum += $2; n++} END {if(n>0) printf "%.4f", sum/n; else print "?"}')
      MID=$(echo "$FREQ_STATS" | awk '$1 >= 300 && $1 < 4000 {sum += $2; n++} END {if(n>0) printf "%.4f", sum/n; else print "?"}')
      HIGH=$(echo "$FREQ_STATS" | awk '$1 >= 4000 && $1 < 20000 {sum += $2; n++} END {if(n>0) printf "%.4f", sum/n; else print "?"}')
      echo -e "  Frequency balance:"
      echo -e "    LOW  (20-300 Hz):   $LOW"
      echo -e "    MID  (300-4k Hz):   $MID"
      echo -e "    HIGH (4k-20k Hz):   $HIGH"
    fi

    rm -f "$AUDIO_TMP"
  fi
fi

echo ""
echo -e "  ${BOLD}Play:${NC} mpv \"$OUTPUT\""
echo -e "${BOLD}════════════════════════════════════════${NC}"
echo ""
