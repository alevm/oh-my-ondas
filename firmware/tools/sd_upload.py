#!/usr/bin/env python3
"""
Oh My Ondas - SD Upload
Copy files to the Teensy built-in SD card over USB serial.
Requires firmware/teensy/test/sd_upload running on the Teensy.

Examples:
    sd_upload.py --test-wav                 # generate and upload TEST.WAV
    sd_upload.py sample01.wav --name S01.WAV
    sd_upload.py --list
"""

import argparse
import math
import struct
import sys
import time
import wave
from io import BytesIO

import serial

RATE = 44100


def make_test_wav() -> bytes:
    """TEST.WAV: 44.1kHz 16-bit stereo, rising C-E-G-C arpeggio + final chord (~3.2s)."""
    notes = [261.63, 329.63, 392.00, 523.25]
    frames = []

    def tone(freqs, secs):
        for i in range(int(RATE * secs)):
            t = i / RATE
            env = math.exp(-3.0 * t) * min(1.0, i / 200)
            v = sum(math.sin(2 * math.pi * f * t) for f in freqs) / len(freqs)
            s = int(0.5 * 32767 * env * v)
            frames.append(struct.pack('<hh', s, s))

    for f in notes:
        tone([f], 0.35)
    tone(notes, 1.5)
    tone([0], 0.3)

    buf = BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(frames))
    return buf.getvalue()


def list_files(port: serial.Serial) -> None:
    port.write(b'LIST\n')
    while (line := port.readline().decode().strip()) != 'END':
        if not line:
            sys.exit('No reply to LIST - is sd_upload running on the Teensy?')
        print(f'  {line}')


def put(port: serial.Serial, name: str, data: bytes) -> bool:
    port.write(f'PUT {name} {len(data)}\n'.encode())
    reply = port.readline().decode().strip()
    if reply != 'GO':
        print(f'Teensy: {reply or "no reply"}')
        return False
    for i in range(0, len(data), 4096):
        port.write(data[i:i + 4096])
    reply = port.readline().decode().strip()
    expected = f'OK {len(data)} {sum(data) & 0xFFFFFFFF}'
    print(f'Teensy: {reply}')
    return reply == expected


def main():
    parser = argparse.ArgumentParser(description='Copy files to the Teensy SD card over USB serial')
    parser.add_argument('file', nargs='?', help='Local file to upload')
    parser.add_argument('--name', help='Name on the SD card (default: local file name)')
    parser.add_argument('--test-wav', action='store_true', help='Generate and upload TEST.WAV')
    parser.add_argument('--list', action='store_true', help='List files on the SD card')
    parser.add_argument('--port', default='/dev/ttyACM0')
    args = parser.parse_args()

    port = serial.Serial(args.port, 115200, timeout=10)
    time.sleep(0.5)
    port.reset_input_buffer()

    if args.test_wav:
        name, data = 'TEST.WAV', make_test_wav()
    elif args.file:
        name = args.name or args.file.rsplit('/', 1)[-1]
        data = open(args.file, 'rb').read()
    else:
        list_files(port)
        return

    if not put(port, name, data):
        sys.exit('Upload failed or checksum mismatch')
    print(f'{name}: {len(data)} bytes, checksum OK')
    if args.list:
        list_files(port)


if __name__ == '__main__':
    main()
