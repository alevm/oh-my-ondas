#!/bin/bash
# Oh My Ondas - Teensy 4.1 Setup Script
# Sets up udev rules, PlatformIO, builds and flashes firmware

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

info()  { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[x]${NC} $1"; }

usage() {
    echo "Usage: $(basename "$0") <command>"
    echo ""
    echo "Commands:"
    echo "  udev      Install Teensy udev rules (requires sudo)"
    echo "  install   Install PlatformIO CLI"
    echo "  build     Build Teensy 4.1 firmware"
    echo "  flash     Build and upload firmware to Teensy"
    echo "  monitor   Open serial monitor"
    echo "  esp       Build ESP32 firmware"
    echo "  espflash  Build and upload ESP32 firmware"
    echo "  all       Full setup: udev + install + build + flash"
    echo "  check     Check Teensy connection and toolchain"
}

check_teensy() {
    if lsusb 2>/dev/null | grep -q "16c0:0478"; then
        info "Teensy 4.1 detected (bootloader mode)"
        return 0
    elif lsusb 2>/dev/null | grep -q "16c0:0483"; then
        info "Teensy 4.1 detected (serial mode)"
        return 0
    elif lsusb 2>/dev/null | grep -q "16c0"; then
        info "Teensy device detected"
        return 0
    else
        error "No Teensy found on USB"
        return 1
    fi
}

check_pio() {
    export PATH="$HOME/.platformio/penv/bin:$PATH"
    if command -v pio &>/dev/null; then
        info "PlatformIO $(pio --version 2>/dev/null | awk '{print $NF}')"
        return 0
    else
        error "PlatformIO not installed (run: $0 install)"
        return 1
    fi
}

cmd_check() {
    echo "=== Oh My Ondas - System Check ==="
    echo ""

    # Teensy
    check_teensy || true

    # USB permissions
    local dev
    dev=$(lsusb 2>/dev/null | grep "16c0" | head -1 | sed 's/Bus \([0-9]*\) Device \([0-9]*\).*/\/dev\/bus\/usb\/\1\/\2/')
    if [ -n "$dev" ] && [ -w "$dev" ]; then
        info "USB device writable: $dev"
    elif [ -n "$dev" ]; then
        warn "USB device not writable: $dev (run: $0 udev)"
    fi

    # udev rules
    if [ -f /etc/udev/rules.d/49-teensy.rules ]; then
        info "Teensy udev rules installed"
    else
        warn "No udev rules (run: $0 udev)"
    fi

    # PlatformIO
    check_pio || true

    # Serial port
    if [ -e /dev/ttyACM0 ]; then
        info "Serial port: /dev/ttyACM0"
    else
        warn "No serial port (Teensy may be in bootloader mode or not flashed yet)"
    fi

    echo ""
}

cmd_udev() {
    info "Installing Teensy udev rules..."

    sudo tee /etc/udev/rules.d/49-teensy.rules > /dev/null << 'EOF'
# Teensy 4.1 - HalfKay Bootloader
SUBSYSTEM=="usb", ATTRS{idVendor}=="16c0", ATTRS{idProduct}=="0478", MODE="0666"
# Teensy 4.1 - Serial
SUBSYSTEM=="usb", ATTRS{idVendor}=="16c0", ATTRS{idProduct}=="0483", MODE="0666"
# Teensy 4.1 - Serial+MIDI
SUBSYSTEM=="usb", ATTRS{idVendor}=="16c0", ATTRS{idProduct}=="048a", MODE="0666"
# Teensy 4.1 - USB Audio
SUBSYSTEM=="usb", ATTRS{idVendor}=="16c0", ATTRS{idProduct}=="04d2", MODE="0666"
# Teensy 4.1 - RawHID
SUBSYSTEM=="usb", ATTRS{idVendor}=="16c0", ATTRS{idProduct}=="0486", MODE="0666"
EOF

    sudo udevadm control --reload-rules
    sudo udevadm trigger
    info "udev rules installed. Unplug and replug the Teensy."
}

cmd_install() {
    export PATH="$HOME/.platformio/penv/bin:$PATH"
    if command -v pio &>/dev/null; then
        info "PlatformIO already installed ($(pio --version 2>/dev/null | awk '{print $NF}'))"
        return 0
    fi

    info "Installing PlatformIO..."
    curl -fsSL https://raw.githubusercontent.com/platformio/platformio-core-installer/master/get-platformio.py -o /tmp/get-platformio.py
    python3 /tmp/get-platformio.py

    # Add to PATH in shell profiles
    for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
        if [ -f "$rc" ] && ! grep -q 'platformio/penv/bin' "$rc"; then
            echo 'export PATH="$HOME/.platformio/penv/bin:$PATH"' >> "$rc"
        fi
    done

    info "PlatformIO installed. Restart your shell or run: export PATH=\"\$HOME/.platformio/penv/bin:\$PATH\""
}

cmd_build() {
    check_pio || exit 1
    info "Building Teensy 4.1 firmware..."
    cd "$SCRIPT_DIR"
    pio run -e teensy41
    info "Build complete."
}

cmd_flash() {
    check_pio || exit 1
    check_teensy || { error "Connect Teensy and try again."; exit 1; }

    info "Building and flashing Teensy 4.1..."
    cd "$SCRIPT_DIR"
    pio run -e teensy41 --target upload
    info "Firmware flashed. Teensy should reboot now."

    # Wait for serial port
    echo -n "Waiting for serial port"
    for i in $(seq 1 10); do
        if [ -e /dev/ttyACM0 ]; then
            echo ""
            info "Serial port ready: /dev/ttyACM0"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    echo ""
    warn "Serial port not found. Teensy may need the button pressed to exit bootloader."
}

cmd_monitor() {
    check_pio || exit 1
    if [ ! -e /dev/ttyACM0 ]; then
        error "No serial port at /dev/ttyACM0"
        exit 1
    fi
    info "Opening serial monitor (115200 baud). Press Ctrl+C to exit."
    cd "$SCRIPT_DIR"
    pio device monitor -b 115200 -p /dev/ttyACM0
}

cmd_esp() {
    check_pio || exit 1
    info "Building ESP32 firmware..."
    cd "$SCRIPT_DIR"
    PLATFORMIO_SRC_DIR=esp32 pio run -e esp32
    info "ESP32 build complete."
}

cmd_espflash() {
    check_pio || exit 1
    info "Building and flashing ESP32..."
    cd "$SCRIPT_DIR"
    PLATFORMIO_SRC_DIR=esp32 pio run -e esp32 --target upload
    info "ESP32 firmware flashed."
}

cmd_all() {
    cmd_udev
    cmd_install
    echo ""
    warn "Unplug and replug the Teensy now, then press Enter."
    read -r
    cmd_flash
}

# Main
case "${1:-}" in
    udev)    cmd_udev ;;
    install) cmd_install ;;
    build)   cmd_build ;;
    flash)   cmd_flash ;;
    monitor) cmd_monitor ;;
    esp)     cmd_esp ;;
    espflash) cmd_espflash ;;
    all)     cmd_all ;;
    check)   cmd_check ;;
    *)       usage ;;
esac
