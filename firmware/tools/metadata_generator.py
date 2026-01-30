#!/usr/bin/env python3
"""
Oh My Ondas - Metadata Generator
Generate JSON metadata for GPS-tagged recordings
"""

import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Optional


def generate_recording_id(timestamp: datetime, lat: float, lon: float) -> str:
    """Generate unique recording ID from timestamp and location."""
    data = f"{timestamp.isoformat()}{lat:.6f}{lon:.6f}"
    hash_val = hashlib.sha256(data.encode()).hexdigest()[:12]
    date_str = timestamp.strftime("%Y%m%d_%H%M%S")
    return f"OMB_{date_str}_{hash_val}"


def create_metadata(
    recording_path: str,
    latitude: float,
    longitude: float,
    altitude: Optional[float] = None,
    timestamp: Optional[datetime] = None,
    bpm: Optional[float] = None,
    key: Optional[str] = None,
    weather: Optional[dict] = None,
    sources: Optional[list] = None,
    fx_chain: Optional[list] = None,
    notes: Optional[str] = None
) -> dict:
    """
    Create complete metadata for a recording.

    Args:
        recording_path: Path to the audio file
        latitude: GPS latitude
        longitude: GPS longitude
        altitude: GPS altitude in meters
        timestamp: Recording timestamp (default: now)
        bpm: Detected/set BPM
        key: Detected/set musical key
        weather: Weather data dict
        sources: List of audio sources used
        fx_chain: List of effects applied
        notes: User notes

    Returns:
        Complete metadata dictionary
    """
    if timestamp is None:
        timestamp = datetime.now()

    recording_id = generate_recording_id(timestamp, latitude, longitude)

    # Get audio file info
    audio_path = Path(recording_path)
    file_size = audio_path.stat().st_size if audio_path.exists() else 0

    metadata = {
        "recording_id": recording_id,
        "version": "1.0",
        "device": {
            "name": "Oh My Ondas",
            "firmware": "0.1.0",
            "serial": None  # To be filled by device
        },
        "timestamp": timestamp.isoformat(),
        "location": {
            "latitude": latitude,
            "longitude": longitude,
            "altitude": altitude,
            "accuracy_m": 5.0,  # GPS accuracy
            "location_name": None  # To be filled via reverse geocoding
        },
        "temporal": {
            "time_of_day": get_time_of_day(timestamp),
            "day_of_week": timestamp.strftime("%A"),
            "season": get_season(timestamp, latitude),
            "moon_phase": None,  # To be calculated
            "sunrise": None,
            "sunset": None
        },
        "audio": {
            "filename": audio_path.name,
            "format": "WAV",
            "sample_rate": 44100,
            "bit_depth": 24,
            "channels": 2,
            "duration_seconds": None,  # To be calculated from file
            "file_size_bytes": file_size
        },
        "analysis": {
            "detected_bpm": bpm,
            "detected_key": key,
            "dominant_frequencies": [],
            "noise_floor_db": None,
            "dynamic_range_db": None,
            "spectral_centroid": None
        },
        "composition": {
            "mode": None,  # "live", "pattern", "ai_compose"
            "pattern_number": None,
            "scene": None,
            "sources": sources or [],
            "fx_chain": fx_chain or [],
            "ai_prompt_hash": None,
            "ai_model": None
        },
        "weather": weather or {
            "condition": None,
            "temperature_c": None,
            "humidity_percent": None,
            "wind_speed_kmh": None
        },
        "user": {
            "notes": notes,
            "tags": [],
            "rating": None
        },
        "cryptographic": {
            "audio_hash": None,  # SHA256 of audio file
            "metadata_hash": None,  # SHA256 of metadata
            "signature": None  # Optional blockchain signature
        }
    }

    return metadata


def get_time_of_day(timestamp: datetime) -> str:
    """Categorize time of day."""
    hour = timestamp.hour
    if 5 <= hour < 12:
        return "morning"
    elif 12 <= hour < 17:
        return "afternoon"
    elif 17 <= hour < 21:
        return "evening"
    else:
        return "night"


def get_season(timestamp: datetime, latitude: float) -> str:
    """Get season based on date and hemisphere."""
    month = timestamp.month

    # Southern hemisphere has opposite seasons
    southern = latitude < 0

    if month in [3, 4, 5]:
        return "autumn" if southern else "spring"
    elif month in [6, 7, 8]:
        return "winter" if southern else "summer"
    elif month in [9, 10, 11]:
        return "spring" if southern else "autumn"
    else:
        return "summer" if southern else "winter"


def calculate_audio_hash(audio_path: str) -> str:
    """Calculate SHA256 hash of audio file."""
    sha256 = hashlib.sha256()
    with open(audio_path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            sha256.update(chunk)
    return sha256.hexdigest()


def save_metadata(metadata: dict, output_path: str):
    """Save metadata to JSON file."""
    with open(output_path, 'w') as f:
        json.dump(metadata, f, indent=2)


def load_metadata(json_path: str) -> dict:
    """Load metadata from JSON file."""
    with open(json_path, 'r') as f:
        return json.load(f)


def embed_metadata_in_wav(wav_path: str, metadata: dict):
    """
    Embed metadata in WAV file's INFO chunk.
    Note: Full implementation would use proper WAV library.
    """
    # For now, just save alongside as .json
    json_path = Path(wav_path).with_suffix('.json')
    save_metadata(metadata, str(json_path))


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Oh My Ondas Metadata Generator')
    parser.add_argument('audio_file', help='Audio file path')
    parser.add_argument('--lat', type=float, required=True, help='Latitude')
    parser.add_argument('--lon', type=float, required=True, help='Longitude')
    parser.add_argument('--alt', type=float, help='Altitude (m)')
    parser.add_argument('--bpm', type=float, help='BPM')
    parser.add_argument('--key', help='Musical key')
    parser.add_argument('--notes', help='User notes')
    parser.add_argument('-o', '--output', help='Output JSON path')

    args = parser.parse_args()

    # Create metadata
    metadata = create_metadata(
        recording_path=args.audio_file,
        latitude=args.lat,
        longitude=args.lon,
        altitude=args.alt,
        bpm=args.bpm,
        key=args.key,
        notes=args.notes
    )

    # Calculate audio hash if file exists
    if Path(args.audio_file).exists():
        metadata['cryptographic']['audio_hash'] = calculate_audio_hash(args.audio_file)

    # Determine output path
    if args.output:
        output_path = args.output
    else:
        output_path = Path(args.audio_file).with_suffix('.json')

    # Save
    save_metadata(metadata, str(output_path))

    print(f"Metadata saved: {output_path}")
    print(f"Recording ID: {metadata['recording_id']}")
    print(f"Location: {args.lat:.6f}, {args.lon:.6f}")


if __name__ == '__main__':
    main()
