#!/usr/bin/env bash
# The only way to flash the Teensy. The file path decides the loop:
#   bench     firmware/teensy/test/** -> fast: build here, flash now
#   teensy41  main firmware           -> gated: committed, pushed, CI fully green, then flash
# Every flash and its serial status are appended to the change log.
#
# usage: firmware/flash.sh bench|teensy41 [seconds of serial to read, default 8]
#        BENCH_SKETCH=demo_play firmware/flash.sh bench   (any folder under teensy/test/, default bench_all)
set -euo pipefail

ENV="${1:-}"
WATCH="${2:-8}"
FW="$(cd "$(dirname "$0")" && pwd)"
REPO="$(dirname "$FW")"
LOADER="$HOME/.platformio/packages/tool-teensy/teensy_loader_cli"
LOG="$HOME/.local/share/claude-changes/CHANGES.md"
# main firmware = everything the teensy41/esp32 images are built from, minus the bench sketches
MAIN_PATHS=(firmware/teensy firmware/common firmware/esp32 firmware/platformio.ini .github/workflows/firmware.yml)
EXCLUDE=(":(exclude)firmware/teensy/test")

die() { echo "flash.sh: REFUSED: $*" >&2; exit 1; }
TARGET="$ENV"; [ "$ENV" = bench ] && TARGET="bench:${BENCH_SKETCH:-bench_all}"
log() { mkdir -p "$(dirname "$LOG")"; echo "$(date -Is) flash.sh $TARGET $*" >> "$LOG"; }

case "$ENV" in
bench) ;;
teensy41)
    cd "$REPO"
    dirty="$(git status --porcelain -- "${MAIN_PATHS[@]}" "${EXCLUDE[@]}")"
    [ -z "$dirty" ] || die "uncommitted main firmware changes:
$dirty"
    git fetch -q origin main || die "cannot reach origin to check the push"
    git merge-base --is-ancestor HEAD origin/main || die "HEAD $(git rev-parse --short HEAD) is not pushed to origin/main"
    # CI runs only when firmware paths change: check the last commit that touched them
    sha="$(git log -1 --format=%H -- "${MAIN_PATHS[@]}" firmware/teensy/test)"
    run="$(gh run list -w "Firmware Build" --commit "$sha" -L 1 --json status,conclusion,databaseId \
        -q '.[0] | "\(.status) \(.conclusion) \(.databaseId)"' 2>/dev/null || true)"
    [ -n "$run" ] || die "no Firmware Build run for ${sha:0:7}"
    read -r status conclusion runid <<< "$run"
    [ "$status" = completed ] || die "Firmware Build run $runid for ${sha:0:7} is still $status"
    [ "$conclusion" = success ] || die "Firmware Build run $runid for ${sha:0:7} is $conclusion (every job must be green)"
    echo "gate: ${sha:0:7} pushed, Firmware Build run $runid success"
    ;;
*) echo "usage: $0 bench|teensy41 [watch-seconds]" >&2; exit 2 ;;
esac

cd "$FW"
timeout 900 pio run -e "$ENV" | tail -3
HEX="$FW/.pio/build/$ENV/firmware.hex"
[ -f "$HEX" ] || die "no $HEX after build"

lsusb | grep -q 16c0: || die "no Teensy on USB"
# -s asks the running sketch to reboot into the loader; plain -w if it is already in HalfKay
timeout 30 "$LOADER" -mmcu=TEENSY41 -s -w "$HEX" || timeout 30 "$LOADER" -mmcu=TEENSY41 -w "$HEX" \
    || { log "FAILED to write $(sha256sum "$HEX" | cut -c1-12)"; die "loader could not write the Teensy"; }

for _ in $(seq 20); do ls /dev/ttyACM* >/dev/null 2>&1 && break; sleep 0.5; done
status="$(timeout $((WATCH + 4)) python3 - "$WATCH" <<'EOF' || true
import glob, sys, time
import serial
ports = glob.glob('/dev/ttyACM*')
if not ports:
    print('no serial port after flash'); sys.exit()
s = serial.Serial(ports[0], 115200, timeout=1)
end, last = time.time() + float(sys.argv[1]), ''
while time.time() < end:
    l = s.readline().decode(errors='replace').strip()
    if l:
        print(l, flush=True); last = l
print('LAST:', last)
EOF
)"
echo "$status"
log "hex $(sha256sum "$HEX" | cut -c1-12) commit $(git -C "$REPO" rev-parse --short HEAD)$(git -C "$REPO" diff --quiet || echo +dirty) | $(echo "$status" | grep '^LAST:' | cut -c7-)"
