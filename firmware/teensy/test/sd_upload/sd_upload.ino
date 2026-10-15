// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Oh My Ondas - SD Upload Helper
 *
 * Writes files to the Teensy built-in SD card over USB serial, so test files
 * (e.g. TEST.WAV) can be loaded without removing the card.
 * Host side: firmware/tools/sd_upload.py
 *
 * Protocol (one command per line):
 *   PUT <name> <size>  -> "GO", then <size> raw bytes -> "OK <bytes> <sum32>" or "ERR ..."
 *   LIST               -> one "<name> <size>" line per root file, then "END"
 */

#include <SD.h>

bool sdOk = false;
uint8_t buf[8192];

String readLine() {
    String s;
    while (true) {
        if (Serial.available()) {
            char c = Serial.read();
            if (c == '\n') return s;
            if (c != '\r') s += c;
        }
    }
}

void doPut(const String& name, uint32_t size) {
    if (SD.exists(name.c_str())) SD.remove(name.c_str());
    File f = SD.open(name.c_str(), FILE_WRITE);
    if (!f) { Serial.println("ERR open"); return; }
    Serial.println("GO");
    uint32_t got = 0, sum = 0;
    unsigned long last = millis();
    while (got < size) {
        int avail = Serial.available();
        if (avail > 0) {
            int n = Serial.readBytes((char*)buf, min((uint32_t)sizeof(buf), min((uint32_t)avail, size - got)));
            for (int i = 0; i < n; i++) sum += buf[i];
            if (f.write(buf, n) != (size_t)n) { f.close(); Serial.println("ERR write"); return; }
            got += n;
            last = millis();
        } else if (millis() - last > 5000) {
            f.close();
            Serial.printf("ERR timeout at %lu\n", got);
            return;
        }
    }
    f.close();
    Serial.printf("OK %lu %lu\n", got, sum);
}

void setup() {
    Serial.begin(115200);
    while (!Serial) {}
    sdOk = SD.begin(BUILTIN_SDCARD);
    Serial.println(sdOk ? "READY SD OK" : "READY SD FAIL");
}

void loop() {
    String line = readLine();
    if (!sdOk) { Serial.println("ERR no SD"); return; }
    if (line.startsWith("PUT ")) {
        int sp = line.indexOf(' ', 4);
        doPut(line.substring(4, sp), line.substring(sp + 1).toInt());
    } else if (line == "LIST") {
        File root = SD.open("/");
        while (File e = root.openNextFile()) {
            Serial.printf("%s %lu\n", e.name(), (unsigned long)e.size());
            e.close();
        }
        Serial.println("END");
    }
}
