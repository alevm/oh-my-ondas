# Oh My Ondas - Firmware

Embedded firmware for the Oh My Ondas portable music instrument.

## Structure

```
firmware/
├── platformio.ini      # PlatformIO build configuration
├── requirements.txt    # Python dependencies for tools
├── teensy/             # Teensy 4.1 main processor firmware
│   ├── main.ino
│   ├── sampling_engine.cpp
│   ├── sequencer.cpp
│   └── include/        # Header files
├── common/
│   └── link_protocol.h # Teensy <-> ESP32-S2 frames (shared by both firmwares)
├── esp32/              # ESP32-S2 WiFi bridge: own PlatformIO project
│   ├── platformio.ini
│   ├── config.example.h  # template; copy to config.h (gitignored)
│   ├── src/            # main.cpp, link_parser.h, frame_queue.h, server_ca.h
│   └── host_test/      # g++ test of parser + queue
└── tools/              # Python utilities
    ├── sample_converter.py
    └── metadata_generator.py
```

## Build

Requires [PlatformIO](https://platformio.org/).

```bash
# Install PlatformIO
pip install platformio

# Build Teensy 4.1 firmware
pio run -e teensy41

# Build ESP32-S2 bridge (separate project, see below)
cd esp32 && pio run

# Upload to Teensy
pio run -e teensy41 --target upload
```

## Python Tools

```bash
pip install -r requirements.txt
python tools/sample_converter.py --help
python tools/metadata_generator.py --help
```

## Hardware

- **Teensy 4.1** - Main processor (600MHz ARM Cortex-M7, 1MB RAM)
- **SparkFun ESP32-S2 Thing Plus** (WRL-17743) - WiFi bridge to the layer-2 server
- **Audio Shield** - SGTL5000 codec (44.1kHz / 24-bit)
- **CAP1188** - 8 capacitive touch pads (Wire2, pins 24/25)
- **SSD1306** - 128x64 OLED display

See [docs/technical/component_pinout.md](../docs/technical/component_pinout.md) for pin assignments.

## ESP32-S2 bridge

Forwards link frames between the Teensy (Serial7) and the layer-2 server over
WiFi + TLS WebSocket. No music logic. Design: `docs/technical/ai-layer2-design.md`;
frame format: `common/link_protocol.h`.

### Wiring (3 wires)

| ESP32-S2 Thing Plus | | Teensy 4.1 |
|---|---|---|
| TX (GPIO43) | -> | RX7 (pin 28) |
| RX (GPIO44) | <- | TX7 (pin 29) |
| GND | -- | GND |

Power the Thing Plus from its own USB-C (power bank output 2). Never from the
Teensy 3.3 V pin: the WiFi current peaks (~300 mA+) exceed what the Teensy
regulator can spare. Both boards are 3.3 V logic, no level shifting.
Link: 2 Mbaud 8N1 (`LINK_BAUD_ACTIVE`). If the wiring is noisy, set
`LINK_USE_FALLBACK_BAUD 1` in `common/link_protocol.h` (1 Mbaud) and rebuild
both firmwares: the define is shared, so the two sides always match.

At reset the ESP32-S2 ROM prints a boot message on GPIO43 at 115200 baud; the
Teensy sees it as garbage and the COBS parser discards it.

### Configuration

```bash
cd firmware/esp32
cp config.example.h config.h   # config.h is gitignored; never commit it
```

In `config.h`:
- `WIFI_NETWORKS`: SSID/password pairs; the phone hotspot first. The strongest
  known network is joined; reconnects automatically.
- `SERVER_URL`: `wss://host[:port]/path` (wss only, port 443 by default).
- `DEVICE_TOKEN`: per-device token, sent as `Authorization: Bearer <token>`.

TLS: the server certificate must chain to a root in `src/server_ca.h`
(ISRG Root X1 + X2, Let's Encrypt). Check the real server with
`openssl s_client -connect <host>:443 -showcerts </dev/null` and update the
header if it uses another CA. There is no insecure fallback.

### Build, flash, logs

```bash
cd firmware/esp32
pio run                  # build
pio run -t upload        # flash over USB-C
pio device monitor       # USB CDC logs: state changes + stats every 10 s
```

If upload does not find the port: hold BOOT, tap RESET, release BOOT, upload again.

Host test (parser + store-and-forward queue, no hardware):

```bash
cd firmware/esp32
g++ -std=c++17 -O2 -Wall -Wextra -I../common -Isrc host_test/test_bridge.cpp -o /tmp/test_bridge && /tmp/test_bridge
```

### Behaviour

- Teensy -> server: each CRC-valid frame becomes one binary WebSocket message
  (`header | payload`, no COBS/CRC). While the server is down, messages are
  queued (heap, allocated at boot): 36 KB ring for everything but CLIP
  (~30 s of features), 64 KB ring for CLIP chunks (halved at boot if the heap
  cannot fit it); each drops its oldest when full. Only the newest HELLO and
  CAPS are kept, and they are sent first on reconnect; the rest follows in
  arrival order at <= 100 msg/s.
- Server -> Teensy: only `PLAN`, `REQ_CLIP`, `ACK`, `ERR`, length-checked,
  <= 20 msg/s; anything else is dropped and counted.
- Handshake headers: `Authorization: Bearer <token>`, `X-Ondas-Proto: <LINK_PROTO_VERSION>`,
  `X-Ondas-Fw: <bridge version>`; the server should refuse a protocol mismatch.
- `MSG_LINK_STATE` to the Teensy on every WiFi/server state change and every
  2 s, from its own task (keeps going while WiFi join or TLS connect blocks).
- `MSG_RF` every 10 s (`RF_SCAN_INTERVAL_S`, `RF_SCAN_INTERVAL_CONNECTED_S` in
  `config.h`): passive WiFi scan (120 ms per channel, 60 ms back on the home
  channel between channels, so the connection stays up). Sends AP count, RSSI
  median and max, APs per channel 1-13, to the Teensy and to the server.
  Privacy: SSIDs and BSSIDs/MACs are never read, logged or sent, and the scan
  results are freed immediately. Keep `CORE_DEBUG_LEVEL` <= 2 (the build stops
  otherwise): the core's WiFiMulti logs nearby SSIDs at higher levels.
- Blue LED (GPIO13): blip every 2 s = WiFi down; 4 Hz = joining WiFi;
  1 Hz = WiFi up, no server; on = server connected; 10 Hz = config error.
- WiFi modem sleep is on; heartbeat ping every 15 s.
