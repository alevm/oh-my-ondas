/**
 * Oh My Ondas - ESP32-S2 bridge (SparkFun ESP32-S2 Thing Plus, WRL-17743)
 *
 * Teensy Serial7 (COBS frames, firmware/common/link_protocol.h)
 *   <-> WiFi (phone hotspot, WiFiMulti) <-> wss server (binary WebSocket).
 * No logic beyond forwarding: docs/technical/ai-layer2-design.md section 2.
 *
 *   Teensy -> server: each CRC-valid frame -> one binary message, header | payload.
 *                     Queued while the server is down (bounded, oldest dropped);
 *                     newest HELLO/CAPS first, backlog flushed at <= 100 msg/s.
 *   server -> Teensy: allowlisted binary messages (PLAN, REQ_CLIP, ACK, ERR),
 *                     <= 20 msg/s, -> COBS frame + CRC.
 *   ESP32  -> Teensy: MSG_LINK_STATE on every state change and every 2 s (own task).
 *   ESP32  -> both:   MSG_RF every RF_SCAN_INTERVAL_S: passive WiFi scan, counts only
 *                     (no SSIDs, no MACs), t_ms = ESP32 millis().
 *
 * Tasks: uart (RX -> queue, prio 5), state (LINK_STATE, prio 4), led (prio 1),
 *        loop (WiFi, WebSocket, drain; prio 1). Only loop blocks (WiFi scan/join,
 *        TLS connect); the others keep running.
 *
 * USB-C: power + USB CDC logs (Serial). Serial1: Teensy link on the board's TX/RX pins.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiMulti.h>
#include <WebSocketsClient.h>
#include <esp_wifi.h>

#if __has_include("config.h")
#include "config.h"
#else
#error "Missing firmware/esp32/config.h: cp config.example.h config.h and fill it in"
#endif
#ifdef LINK_USE_FALLBACK_BAUD
#error "Remove LINK_USE_FALLBACK_BAUD from config.h: it is set in firmware/common/link_protocol.h for both sides"
#endif

#include "link_protocol.h"
#include "link_parser.h"
#include "frame_queue.h"
#include "server_ca.h"
#include "rf_stats.h"

#define FW_VERSION "bridge-0.6.0"

// Privacy: at INFO/DEBUG level the core's WiFiMulti logs nearby SSIDs and BSSIDs.
#if CORE_DEBUG_LEVEL > 2
#error "CORE_DEBUG_LEVEL > 2 logs nearby SSIDs/BSSIDs (WiFiMulti); keep it <= 2"
#endif

// WiFi density scan (MSG_RF); override in config.h
#ifndef RF_SCAN_INTERVAL_S
#define RF_SCAN_INTERVAL_S 10              // while WiFi is down / joining
#endif
#ifndef RF_SCAN_INTERVAL_CONNECTED_S
#define RF_SCAN_INTERVAL_CONNECTED_S 10    // while connected; raise to 30 if the link suffers
#endif
#define STR_(x) #x
#define STR(x)  STR_(x)

// ---------- pins (variant esp32s2thing_plus/pins_arduino.h) ----------
// Board pin "TX" = GPIO43 -> Teensy RX7 (pin 28)
// Board pin "RX" = GPIO44 <- Teensy TX7 (pin 29)
static constexpr int PIN_LINK_TX = 43;
static constexpr int PIN_LINK_RX = 44;
static constexpr int PIN_LED     = 13;   // blue user LED
static_assert(TX == PIN_LINK_TX && RX == PIN_LINK_RX, "board variant TX/RX changed");
static_assert(LED_BUILTIN == PIN_LED, "board variant LED changed");

static constexpr uint32_t kLinkBaud = LINK_BAUD_ACTIVE;

// ---------- timing / limits ----------
static constexpr uint32_t kLinkStateEveryMs = 2000;
static constexpr uint32_t kWifiRetryMs      = 3000;
static constexpr uint32_t kWifiConnectMs    = 5000;   // WiFiMulti join wait (scan adds ~2 s)
static constexpr uint32_t kWsReconnectMs    = 5000;
static constexpr uint32_t kStatsEveryMs     = 10000;
// RF scan: passive (listens for beacons, sends nothing), 120 ms per channel covers
// one 102.4 ms beacon interval. While connected the driver goes back to the home
// channel for kRfHomeDwellMs between channels, so the station stays associated
// and the WebSocket keeps flowing (13 x (120 + 60) ms ~ 2.3 s per scan).
static constexpr uint32_t kRfDwellMs        = 120;
static constexpr uint8_t  kRfHomeDwellMs    = 60;
static constexpr uint32_t kRfTimeoutMs      = 6000;
static constexpr size_t   kRfSkipBacklog    = 200;    // connected: skip a scan while flushing a backlog
static constexpr uint32_t kDrainBudgetMs    = 20;     // max time per loop spent flushing
static constexpr uint32_t kToServerPerSec   = 100;    // backlog + live, HELLO/CAPS exempt
static constexpr uint32_t kToServerBurst    = 20;
static constexpr uint32_t kToTeensyPerSec   = 20;     // server -> Teensy
static constexpr uint32_t kToTeensyBurst    = 10;

// ---------- store-and-forward queue ----------
// Main ring: FEAT record = 6 + 5 + 59 B at 10 Hz ~ 0.7 KB/s; with PIEZO, GPS,
// RADIO, PULSE, USER ~ 1.1 KB/s -> 36 KB holds ~30 s.
// CLIP ring: Teensy paces chunks at ~20 KB/s -> 64 KB ~ 3 s of clip traffic.
// Heap-allocated in setup(): the S2 static DRAM segment cannot hold 100 KB.
static constexpr size_t kMainRing = 36 * 1024;
static constexpr size_t kClipRing = 64 * 1024;
static FrameQueue* g_queue;
static SemaphoreHandle_t g_qlock;    // g_queue, g_pstats
static SemaphoreHandle_t g_txlock;   // Serial1 writes (state task + loop)

// ---------- state ----------
enum class Wifi : uint8_t { Down = 0, Connecting = 1, Up = 2 };
static volatile Wifi    g_wifi = Wifi::Down;
static volatile bool    g_server_up = false;
static volatile bool    g_config_ok = true;
static volatile int8_t  g_rssi = -128;   // updated by loop; read by the state task

static WiFiMulti        g_multi;
static WebSocketsClient g_ws;

struct Counters {
    uint32_t to_server = 0;     // messages sent to the server
    uint32_t to_teensy = 0;     // frames written to the Teensy (incl. LINK_STATE)
    uint32_t bad_ws    = 0;     // invalid binary messages from the server
    uint32_t denied_ws = 0;     // valid but type not allowed to reach the Teensy
    uint32_t limited_ws = 0;    // dropped by the server -> Teensy rate cap
    uint32_t text_ws   = 0;     // ignored text messages
    uint32_t ws_connects = 0;
    uint32_t rf_scans  = 0;     // MSG_RF sent
    uint32_t rf_fail   = 0;     // scan start failed or timed out
};
static Counters g_cnt;
static LinkParserStats g_pstats;    // copy from the UART task, under g_qlock

// ---------- token bucket ----------
struct RateLimit {
    uint32_t per_sec, burst, tokens_x1000, last_ms;
    RateLimit(uint32_t ps, uint32_t b) : per_sec(ps), burst(b), tokens_x1000(b * 1000), last_ms(0) {}
    void refill(uint32_t now) {
        uint32_t dt = now - last_ms;
        last_ms = now;
        uint64_t t = (uint64_t)tokens_x1000 + (uint64_t)dt * per_sec;
        tokens_x1000 = t > burst * 1000ULL ? burst * 1000 : (uint32_t)t;
    }
    bool ready(uint32_t now) { refill(now); return tokens_x1000 >= 1000; }
    bool take(uint32_t now) {
        if (!ready(now)) return false;
        tokens_x1000 -= 1000;
        return true;
    }
};
static RateLimit g_to_server(kToServerPerSec, kToServerBurst);
static RateLimit g_to_teensy(kToTeensyPerSec, kToTeensyBurst);

// ---------- config ----------
static char     g_host[128];
static char     g_path[128];
static uint16_t g_port = 443;
static char     g_auth[256];
// Replaces the library default ("Origin: file://"). Lets the server refuse a
// protocol mismatch during the handshake, before any frame flows.
static const char kExtraHeaders[] = "X-Ondas-Proto: " STR(LINK_PROTO_VERSION) "\r\nX-Ondas-Fw: " FW_VERSION;

struct WifiNet { const char* ssid; const char* pass; };
static const WifiNet kNets[] = WIFI_NETWORKS;

static bool parse_wss_url(const char* url) {
    static const char kPrefix[] = "wss://";
    if (strncmp(url, kPrefix, sizeof(kPrefix) - 1) != 0) return false;
    const char* h = url + sizeof(kPrefix) - 1;
    const char* slash = strchr(h, '/');
    const char* end = slash ? slash : h + strlen(h);
    const char* colon = (const char*)memchr(h, ':', end - h);
    const char* hend = colon ? colon : end;
    size_t hl = hend - h;
    if (hl == 0 || hl >= sizeof(g_host)) return false;
    memcpy(g_host, h, hl);
    g_host[hl] = 0;
    if (colon) {
        long p = strtol(colon + 1, nullptr, 10);
        if (p <= 0 || p > 65535) return false;
        g_port = (uint16_t)p;
    }
    const char* path = slash ? slash : "/";
    if (strlen(path) >= sizeof(g_path)) return false;
    strcpy(g_path, path);
    return true;
}

// ---------- UART -> queue (own task, so blocking WiFi/TLS calls never stall RX) ----------
static void uart_task(void*) {
    static LinkParser parser;   // ~2 KB of buffers, keep off the task stack
    static uint8_t buf[512];
    for (;;) {
        int avail = Serial1.available();
        if (avail <= 0) { vTaskDelay(1); continue; }
        size_t n = Serial1.read(buf, avail < (int)sizeof(buf) ? (size_t)avail : sizeof(buf));
        for (size_t i = 0; i < n; i++) {
            if (!parser.push(buf[i])) continue;
            xSemaphoreTake(g_qlock, portMAX_DELAY);
            g_queue->push(parser.raw(), (uint16_t)parser.raw_len());
            xSemaphoreGive(g_qlock);
        }
        xSemaphoreTake(g_qlock, portMAX_DELAY);
        g_pstats = parser.stats();
        xSemaphoreGive(g_qlock);
    }
}

// ---------- to the Teensy ----------
static void write_teensy_frame(const uint8_t* frame, size_t n) {
    xSemaphoreTake(g_txlock, portMAX_DELAY);
    Serial1.write(frame, n);
    g_cnt.to_teensy++;
    xSemaphoreGive(g_txlock);
}

// LINK_STATE (own task: keeps going while loop() blocks in WiFiMulti / TLS connect)
static void state_task(void*) {
    static uint8_t out[LINK_MAX_ENCODED];
    uint16_t seq = 0;
    uint8_t last_wifi = 0xFF, last_server = 0xFF;
    uint32_t last_ms = 0;
    for (;;) {
        uint32_t now = millis();
        uint8_t w = (uint8_t)g_wifi, s = g_server_up ? 1 : 0;
        if (w != last_wifi || s != last_server || now - last_ms >= kLinkStateEveryMs) {
            LinkState st;
            st.wifi = w;
            st.server = s;
            st.rssi_dbm = w == (uint8_t)Wifi::Up ? g_rssi : -128;
            size_t n = link_build_frame(MSG_LINK_STATE, seq++, &st, sizeof(st), out);
            if (n) write_teensy_frame(out, n);
            last_wifi = w; last_server = s; last_ms = now;
        }
        vTaskDelay(pdMS_TO_TICKS(50));
    }
}

// ---------- LED (own task: keeps blinking while WiFiMulti blocks) ----------
//   config error        10 Hz
//   WiFi down           50 ms blip every 2 s
//   WiFi connecting     4 Hz
//   WiFi up, no server  1 Hz
//   server up           on
static void led_task(void*) {
    for (;;) {
        uint32_t t = millis();
        bool on;
        if (!g_config_ok)                    on = (t / 50) % 2;
        else if (g_server_up)                on = true;
        else if (g_wifi == Wifi::Up)         on = (t / 500) % 2;
        else if (g_wifi == Wifi::Connecting) on = (t / 125) % 2;
        else                                 on = (t % 2000) < 50;
        digitalWrite(PIN_LED, on ? HIGH : LOW);
        vTaskDelay(pdMS_TO_TICKS(25));
    }
}

// ---------- server ----------
static bool allowed_to_teensy(uint8_t type) {
    return type == MSG_PLAN || type == MSG_REQ_CLIP || type == MSG_ACK || type == MSG_ERR;
}

static void ws_event(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
    case WStype_CONNECTED:
        g_server_up = true;
        g_cnt.ws_connects++;
        Serial.printf("[ws] connected %s:%u%s\n", g_host, g_port, g_path);
        break;
    case WStype_DISCONNECTED:
        if (g_server_up) Serial.println("[ws] disconnected");
        g_server_up = false;
        break;
    case WStype_BIN: {
        static uint8_t out[LINK_MAX_ENCODED];
        size_t n = link_frame_from_ws(payload, length, out);
        if (!n)                               { g_cnt.bad_ws++; break; }
        if (!allowed_to_teensy(payload[0]))   { g_cnt.denied_ws++; break; }
        if (!g_to_teensy.take(millis()))      { g_cnt.limited_ws++; break; }
        write_teensy_frame(out, n);
        break;
    }
    case WStype_TEXT:
        g_cnt.text_ws++;
        break;
    case WStype_ERROR:
        Serial.printf("[ws] error %.*s\n", (int)length, payload ? (const char*)payload : "");
        break;
    default:
        break;
    }
}

static void drain_queue() {
    static uint8_t msg[LINK_HEADER_SIZE + LINK_MAX_PAYLOAD];
    uint32_t t0 = millis();
    while (g_server_up && g_ws.isConnected() && millis() - t0 < kDrainBudgetMs) {
        uint32_t order;
        xSemaphoreTake(g_qlock, portMAX_DELAY);
        bool prio = g_queue->next_is_priority();
        int n = (prio || g_to_server.ready(millis())) ? g_queue->peek(msg, &order) : -1;
        xSemaphoreGive(g_qlock);
        if (n < 0) break;                             // empty, or rate cap reached
        if (!g_ws.sendBIN(msg, (size_t)n)) break;     // keep it queued, retry next loop
        if (!prio) g_to_server.take(millis());
        g_cnt.to_server++;
        xSemaphoreTake(g_qlock, portMAX_DELAY);
        g_queue->pop(order);   // no-op if dropped or replaced meanwhile
        xSemaphoreGive(g_qlock);
    }
}

// ---------- WiFi density (MSG_RF) ----------
// Privacy: only RSSI and channel are read from the scan results; never SSIDs or
// BSSIDs. Results are freed (WiFi.scanDelete) right after counting.
static bool     g_rf_running = false;
static uint32_t g_rf_started = 0, g_rf_last = 0;
static uint16_t g_rf_seq = 0;
static_assert(sizeof(((LinkRf*)nullptr)->ch_busy) == 13, "LinkRf.ch_busy layout");

static void rf_send(const LinkRf& rf) {
    uint16_t seq = g_rf_seq++;
    static uint8_t out[LINK_MAX_ENCODED];
    size_t n = link_build_frame(MSG_RF, seq, &rf, sizeof(rf), out);
    if (n) write_teensy_frame(out, n);
    uint8_t msg[LINK_HEADER_SIZE + sizeof(LinkRf)];
    msg[0] = MSG_RF; msg[1] = seq & 0xFF; msg[2] = seq >> 8;
    msg[3] = sizeof(LinkRf) & 0xFF; msg[4] = sizeof(LinkRf) >> 8;
    memcpy(msg + LINK_HEADER_SIZE, &rf, sizeof(rf));
    xSemaphoreTake(g_qlock, portMAX_DELAY);
    g_queue->push(msg, sizeof(msg));      // to the server like device frames (queued if down)
    xSemaphoreGive(g_qlock);
    g_cnt.rf_scans++;
}

static void rf_service(uint32_t now) {
    if (g_rf_running) {
        // The core's SCAN_DONE handler copies the records and sets the done bit;
        // scanComplete() then returns the count (>= 0).
        int16_t n = WiFi.scanComplete();
        if (n >= 0) {
            static RfAccumulator acc;
            acc = RfAccumulator();
            for (int16_t i = 0; i < n; i++) acc.add(WiFi.RSSI(i), WiFi.channel(i));
            WiFi.scanDelete();            // free the records (they contain SSIDs/BSSIDs)
            g_rf_running = false;
            LinkRf rf;
            acc.finish(now, &rf);
            rf_send(rf);
        } else if (now - g_rf_started > kRfTimeoutMs) {
            esp_wifi_scan_stop();
            WiFi.scanDelete();
            g_rf_running = false;
            g_cnt.rf_fail++;
        }
        return;
    }
    bool up = g_wifi == Wifi::Up;
    uint32_t every = (up ? RF_SCAN_INTERVAL_CONNECTED_S : RF_SCAN_INTERVAL_S) * 1000UL;
    if (now - g_rf_last < every) return;
    g_rf_last = now;
    if (up) {
        xSemaphoreTake(g_qlock, portMAX_DELAY);
        size_t backlog = g_queue->count();
        xSemaphoreGive(g_qlock);
        if (backlog > kRfSkipBacklog) return;
    }
    // Direct esp_wifi_scan_start: the core's scanNetworks() leaves
    // home_chan_dwell_time uninitialised.
    WiFi.scanDelete();                    // also clears a stale done bit
    wifi_scan_config_t cfg;
    memset(&cfg, 0, sizeof(cfg));
    cfg.show_hidden = true;               // count hidden APs too (no SSID is read anyway)
    cfg.scan_type = WIFI_SCAN_TYPE_PASSIVE;
    cfg.scan_time.passive = kRfDwellMs;
    cfg.home_chan_dwell_time = kRfHomeDwellMs;
    if (esp_wifi_scan_start(&cfg, false) == ESP_OK) {
        g_rf_running = true;
        g_rf_started = now;
    } else {
        g_cnt.rf_fail++;                  // e.g. STA busy connecting; retry next interval
    }
}

// ---------- WiFi ----------
static void wifi_service(uint32_t now) {
    static uint32_t last_try = 0;
    static bool was_up = false;
    bool up = WiFi.status() == WL_CONNECTED;
    if (up) {
        if (!was_up) Serial.printf("[wifi] up: %d dBm, ch %d\n", WiFi.RSSI(), (int)WiFi.channel());   // no SSID in logs
        int r = WiFi.RSSI();
        g_rssi = (int8_t)(r < -128 ? -128 : r > 0 ? 0 : r);
        g_wifi = Wifi::Up;
        was_up = true;
        return;
    }
    if (was_up) {
        Serial.println("[wifi] lost");
        was_up = false;
        if (g_server_up) g_ws.disconnect();
        g_server_up = false;
    }
    if (last_try != 0 && now - last_try < kWifiRetryMs) { g_wifi = Wifi::Down; return; }
    if (g_rf_running) { g_wifi = Wifi::Down; return; }   // do not start WiFiMulti's scan over ours
    g_wifi = Wifi::Connecting;               // state task reports it within 50 ms
    g_multi.run(kWifiConnectMs);             // blocks: sync scan (~2 s) + join (<= 5 s)
    last_try = millis();
    g_wifi = WiFi.status() == WL_CONNECTED ? Wifi::Up : Wifi::Down;
}

static void stats_service(uint32_t now) {
    static uint32_t last = 0;
    if (now - last < kStatsEveryMs) return;
    last = now;
    xSemaphoreTake(g_qlock, portMAX_DELAY);
    LinkParserStats p = g_pstats;
    size_t qn = g_queue->count(), qb = g_queue->used();
    uint32_t qd = g_queue->dropped(), qr = g_queue->replaced();
    xSemaphoreGive(g_qlock);
    Serial.printf("[stats] rx ok=%lu crc=%lu cobs=%lu ovf=%lu | q n=%u bytes=%u dropped=%lu replaced=%lu | "
                  "srv tx=%lu | ws bad=%lu denied=%lu limited=%lu text=%lu conn=%lu | teensy tx=%lu | "
                  "rf ok=%lu fail=%lu | wifi=%u rssi=%d srv=%u heap=%lu min=%lu\n",
                  (unsigned long)p.frames, (unsigned long)p.crc_err, (unsigned long)p.cobs_err,
                  (unsigned long)p.overflow, (unsigned)qn, (unsigned)qb, (unsigned long)qd, (unsigned long)qr,
                  (unsigned long)g_cnt.to_server, (unsigned long)g_cnt.bad_ws, (unsigned long)g_cnt.denied_ws,
                  (unsigned long)g_cnt.limited_ws, (unsigned long)g_cnt.text_ws, (unsigned long)g_cnt.ws_connects,
                  (unsigned long)g_cnt.to_teensy, (unsigned long)g_cnt.rf_scans, (unsigned long)g_cnt.rf_fail, (unsigned)g_wifi, (int)g_rssi, g_server_up ? 1u : 0u,
                  (unsigned long)ESP.getFreeHeap(), (unsigned long)ESP.getMinFreeHeap());
}

// ---------- setup / loop ----------
void setup() {
    pinMode(PIN_LED, OUTPUT);
    digitalWrite(PIN_LED, LOW);
    Serial.begin(115200);    // USB CDC; does not wait for a host

    g_qlock = xSemaphoreCreateMutex();
    // Allocate before WiFi/TLS fragment the heap; halve the CLIP ring if 64 KB is not available.
    for (size_t clip = kClipRing; clip >= 8 * 1024; clip /= 2) {
        g_queue = new FrameQueue(kMainRing, clip);
        if (g_queue->ok()) break;
        delete g_queue;
        g_queue = nullptr;
    }
    if (!g_queue) g_queue = new FrameQueue(8 * 1024, 4 * 1024);   // last resort
    g_txlock = xSemaphoreCreateMutex();

    Serial1.setRxBufferSize(16384);   // ~80 ms at 2 Mbaud; must precede begin()
    Serial1.setTxBufferSize(4096);
    Serial1.begin(kLinkBaud, SERIAL_8N1, PIN_LINK_RX, PIN_LINK_TX);

    xTaskCreate(uart_task, "uart", 4096, nullptr, 5, nullptr);   // above loop() (prio 1)
    xTaskCreate(state_task, "state", 3072, nullptr, 4, nullptr);
    xTaskCreate(led_task, "led", 2048, nullptr, 1, nullptr);

    Serial.printf("\nOh My Ondas %s, proto %d, link %lu baud on RX=%d TX=%d\n", FW_VERSION, LINK_PROTO_VERSION,
                  (unsigned long)kLinkBaud, PIN_LINK_RX, PIN_LINK_TX);
    Serial.printf("[mem] queue main=%u clip=%u ok=%d, free heap %lu, largest block %lu\n",
                  (unsigned)g_queue->main_capacity(), (unsigned)g_queue->clip_capacity(), (int)g_queue->ok(),
                  (unsigned long)ESP.getFreeHeap(), (unsigned long)ESP.getMaxAllocHeap());

    if (!parse_wss_url(SERVER_URL)) {
        Serial.println("[cfg] SERVER_URL must be wss://host[:port][/path]; server disabled");
        g_config_ok = false;
    }
    if (strncmp(DEVICE_TOKEN, "REPLACE", 7) == 0 || DEVICE_TOKEN[0] == 0) {
        Serial.println("[cfg] DEVICE_TOKEN not set; server disabled");
        g_config_ok = false;
    }

    WiFi.persistent(false);           // never write credentials to NVS flash
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(false);     // WiFiMulti reconnects (and picks the strongest network)
    WiFi.setSleep(true);              // modem sleep between DTIM beacons when idle
    for (const WifiNet& n : kNets) g_multi.addAP(n.ssid, n.pass);

    if (g_config_ok) {
        snprintf(g_auth, sizeof(g_auth), "Bearer %s", DEVICE_TOKEN);
        g_ws.beginSslWithCA(g_host, g_port, g_path, SERVER_CA_PEM, "");   // CA always set: never insecure
        g_ws.setAuthorization(g_auth);                                    // "Authorization: Bearer <token>"
        g_ws.setExtraHeaders(kExtraHeaders);                              // X-Ondas-Proto, X-Ondas-Fw
        g_ws.onEvent(ws_event);
        g_ws.setReconnectInterval(kWsReconnectMs);
        g_ws.enableHeartbeat(15000, 5000, 2);   // ping 15 s, drop after 2 missed pongs
    }
}

void loop() {
    wifi_service(millis());
    if (g_config_ok && g_wifi == Wifi::Up) {
        g_ws.loop();
        drain_queue();
    }
    rf_service(millis());
    stats_service(millis());
    delay(2);   // idle: lets the WiFi modem sleep and the other tasks run
}
