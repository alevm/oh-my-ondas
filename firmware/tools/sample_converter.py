#!/usr/bin/env python3
"""
Oh My Ondas - Sample Converter
Convert and prepare audio samples for the device
"""

import argparse
from pathlib import Path

import numpy as np
import soundfile as sf


def convert_sample(input_path: str, output_path: str,
                   sample_rate: int = 44100,
                   bit_depth: int = 16,
                   mono: bool = False,
                   normalize: bool = True,
                   max_length_sec: float = 30.0) -> dict:
    """
    Convert audio sample to device-compatible format.

    Args:
        input_path: Input audio file
        output_path: Output WAV file
        sample_rate: Target sample rate (default 44100)
        bit_depth: Target bit depth (16 or 24)
        mono: Convert to mono
        normalize: Normalize audio level
        max_length_sec: Maximum sample length in seconds

    Returns:
        Dictionary with conversion info
    """
    # Read input file
    data, sr = sf.read(input_path, dtype='float32')

    info = {
        'input': input_path,
        'output': output_path,
        'original_rate': sr,
        'original_channels': data.ndim,
        'original_length': len(data) / sr
    }

    # Convert to mono if requested
    if mono and data.ndim > 1:
        data = np.mean(data, axis=1)
        info['converted_to_mono'] = True

    # Resample if needed
    if sr != sample_rate:
        # Simple resampling (for production, use librosa or scipy)
        ratio = sample_rate / sr
        new_length = int(len(data) * ratio)

        if data.ndim == 1:
            data = np.interp(
                np.linspace(0, len(data) - 1, new_length),
                np.arange(len(data)),
                data
            )
        else:
            resampled = np.zeros((new_length, data.shape[1]))
            for ch in range(data.shape[1]):
                resampled[:, ch] = np.interp(
                    np.linspace(0, len(data) - 1, new_length),
                    np.arange(len(data)),
                    data[:, ch]
                )
            data = resampled

        info['resampled'] = True
        info['new_rate'] = sample_rate

    # Trim to max length
    max_samples = int(max_length_sec * sample_rate)
    if len(data) > max_samples:
        data = data[:max_samples]
        info['trimmed'] = True
        info['trimmed_to'] = max_length_sec

    # Normalize
    if normalize:
        peak = np.max(np.abs(data))
        if peak > 0:
            data = data / peak * 0.95  # Leave headroom
            info['normalized'] = True
            info['original_peak'] = float(peak)

    # Determine subtype for bit depth
    if bit_depth == 24:
        subtype = 'PCM_24'
    else:
        subtype = 'PCM_16'

    # Write output
    sf.write(output_path, data, sample_rate, subtype=subtype)

    info['final_length'] = len(data) / sample_rate
    info['final_channels'] = 1 if data.ndim == 1 else data.shape[1]
    info['bit_depth'] = bit_depth

    return info


def batch_convert(input_dir: str, output_dir: str, **kwargs) -> list:
    """Convert all audio files in a directory."""
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    results = []

    # Supported formats
    extensions = {'.wav', '.mp3', '.flac', '.aiff', '.ogg', '.m4a'}

    for file in input_path.iterdir():
        if file.suffix.lower() in extensions:
            output_file = output_path / (file.stem + '.wav')
            try:
                info = convert_sample(str(file), str(output_file), **kwargs)
                info['status'] = 'success'
            except Exception as e:
                info = {
                    'input': str(file),
                    'status': 'error',
                    'error': str(e)
                }
            results.append(info)

    return results


def prepare_bank(input_dir: str, output_dir: str, bank_number: int) -> dict:
    """
    Prepare a complete sample bank.
    Expects files named sample01.wav through sample08.wav
    """
    input_path = Path(input_dir)
    output_path = Path(output_dir) / f'bank{bank_number:02d}'
    output_path.mkdir(parents=True, exist_ok=True)

    bank_info = {
        'bank_number': bank_number,
        'output_dir': str(output_path),
        'samples': []
    }

    for i in range(1, 9):
        # Look for sample files
        found = False
        for ext in ['.wav', '.mp3', '.flac']:
            input_file = input_path / f'sample{i:02d}{ext}'
            if input_file.exists():
                output_file = output_path / f'sample{i:02d}.wav'
                info = convert_sample(str(input_file), str(output_file))
                info['slot'] = i
                bank_info['samples'].append(info)
                found = True
                break

        if not found:
            bank_info['samples'].append({
                'slot': i,
                'status': 'empty'
            })

    return bank_info


def main():
    parser = argparse.ArgumentParser(description='Oh My Ondas Sample Converter')

    subparsers = parser.add_subparsers(dest='command')

    # Single file conversion
    single = subparsers.add_parser('convert', help='Convert single file')
    single.add_argument('input', help='Input audio file')
    single.add_argument('output', help='Output WAV file')
    single.add_argument('--rate', type=int, default=44100, help='Sample rate')
    single.add_argument('--bits', type=int, default=16, choices=[16, 24])
    single.add_argument('--mono', action='store_true', help='Convert to mono')
    single.add_argument('--no-normalize', action='store_true')
    single.add_argument('--max-length', type=float, default=30.0)

    # Batch conversion
    batch = subparsers.add_parser('batch', help='Convert directory')
    batch.add_argument('input_dir', help='Input directory')
    batch.add_argument('output_dir', help='Output directory')
    batch.add_argument('--rate', type=int, default=44100)
    batch.add_argument('--bits', type=int, default=16, choices=[16, 24])
    batch.add_argument('--mono', action='store_true')

    # Bank preparation
    bank = subparsers.add_parser('bank', help='Prepare sample bank')
    bank.add_argument('input_dir', help='Input directory')
    bank.add_argument('output_dir', help='Output directory (e.g., /sdcard/samples)')
    bank.add_argument('bank_number', type=int, help='Bank number (0-63)')

    args = parser.parse_args()

    if args.command == 'convert':
        info = convert_sample(
            args.input, args.output,
            sample_rate=args.rate,
            bit_depth=args.bits,
            mono=args.mono,
            normalize=not args.no_normalize,
            max_length_sec=args.max_length
        )
        print(f"Converted: {info['input']} -> {info['output']}")
        print(f"  Length: {info['final_length']:.2f}s")
        print(f"  Rate: {args.rate}Hz, {args.bits}-bit")

    elif args.command == 'batch':
        results = batch_convert(
            args.input_dir, args.output_dir,
            sample_rate=args.rate,
            bit_depth=args.bits,
            mono=args.mono
        )
        success = sum(1 for r in results if r.get('status') == 'success')
        print(f"Converted {success}/{len(results)} files")

    elif args.command == 'bank':
        info = prepare_bank(args.input_dir, args.output_dir, args.bank_number)
        loaded = sum(1 for s in info['samples'] if s.get('status') != 'empty')
        print(f"Bank {args.bank_number}: {loaded}/8 samples loaded")
        print(f"Output: {info['output_dir']}")

    else:
        parser.print_help()


if __name__ == '__main__':
    main()
