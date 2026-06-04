#!/usr/bin/env python3
"""Simple MP3/WAV audio trimmer - trims to max N seconds.
Works without ffmpeg by parsing MP3 frame headers directly.
Usage: python3 trim_audio.py <input> <output> <max_seconds>
"""
import sys
import os

def trim_wav(input_path, output_path, max_seconds=10):
    import wave
    with wave.open(input_path, 'rb') as wf:
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        n_frames_total = wf.getnframes()
        duration = n_frames_total / framerate
        n_frames = int(min(max_seconds, duration) * framerate)
        params = wf.getparams()
        data = wf.readframes(n_frames)

    with wave.open(output_path, 'wb') as wf:
        wf.setparams(params)
        wf.writeframes(data)

    actual_duration = n_frames / framerate
    return True

def trim_mp3(input_path, output_path, max_seconds=10):
    with open(input_path, 'rb') as f:
        data = f.read()

    if len(data) < 4:
        return False

    # Skip ID3v2 tag if present
    offset = 0
    if data[:3] == b'ID3':
        tag_size = ((data[6] & 0x7F) << 21) | ((data[7] & 0x7F) << 14) | ((data[8] & 0x7F) << 7) | (data[9] & 0x7F)
        offset = 10 + tag_size

    # Bitrate tables (index 0 unused, 1-14 valid, 15 = bad)
    bitrates_v1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
    bitrates_v2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]

    # Sample rate tables (index 0-2 valid, 3 = reserved)
    sr_v1 = [44100, 48000, 32000]
    sr_v2 = [22050, 24000, 16000]
    sr_v25 = [11025, 12000, 8000]

    frame_count = 0
    end_pos = offset
    samplerate = 44100

    i = offset
    max_frames = 100000  # safety limit

    while i < len(data) - 4 and frame_count < max_frames:
        # Look for sync word: 0xFF followed by 0xE0+
        if data[i] != 0xFF or (data[i + 1] & 0xE0) != 0xE0:
            i += 1
            continue

        version = (data[i + 1] >> 3) & 0x03  # 0=2.5, 1=reserved, 2=2, 3=1
        layer = (data[i + 1] >> 1) & 0x03    # 0=reserved, 1=III, 2=II, 3=I
        br_idx = (data[i + 2] >> 4) & 0x0F
        sr_idx = (data[i + 2] >> 2) & 0x03
        pad = (data[i + 2] >> 1) & 0x01

        # Validate: we only support Layer III, valid bitrate/sample rates
        if layer != 0b01 or br_idx == 0 or br_idx == 0x0F or sr_idx == 0x03 or version == 0b01:
            i += 1
            continue

        if version == 0b11:  # MPEG1
            bitrate = bitrates_v1[br_idx] * 1000
            samplerate = sr_v1[sr_idx]
        elif version == 0b10:  # MPEG2
            bitrate = bitrates_v2[br_idx] * 1000
            samplerate = sr_v2[sr_idx]
        elif version == 0b00:  # MPEG2.5
            bitrate = bitrates_v2[br_idx] * 1000
            samplerate = sr_v25[sr_idx]
        else:
            i += 1
            continue

        if samplerate == 0 or bitrate == 0:
            i += 1
            continue

        # Frame size for Layer III: 144 * bitrate / samplerate + padding
        frame_size = (144 * bitrate) // samplerate + pad

        if frame_size <= 0 or i + frame_size > len(data):
            i += 1
            continue

        frame_count += 1
        end_pos = i + frame_size

        # Layer III = 1152 samples per frame
        duration = (frame_count * 1152.0) / samplerate
        if duration >= max_seconds:
            break

        i += frame_size

    if frame_count == 0 or end_pos <= offset:
        return False

    # Write output: ID3v2 tag (if any) + audio frames
    with open(output_path, 'wb') as f:
        if offset > 0:
            f.write(data[:offset])
        f.write(data[offset:end_pos])

    return True

def trim_audio(input_path, output_path, max_seconds=10):
    ext = os.path.splitext(input_path)[1].lower()
    if ext == '.wav':
        return trim_wav(input_path, output_path, max_seconds)
    elif ext == '.mp3':
        return trim_mp3(input_path, output_path, max_seconds)
    else:
        # Try MP3 first for unknown formats (m4a etc won't work)
        return trim_mp3(input_path, output_path, max_seconds)

if __name__ == '__main__':
    if len(sys.argv) != 4:
        print("ERROR:Usage:python3 trim_audio.py <input> <output> <max_seconds>")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    max_seconds = float(sys.argv[3])

    try:
        if trim_audio(input_path, output_path, max_seconds):
            print("OK")
        else:
            print("ERROR:trim_failed")
            sys.exit(1)
    except Exception as e:
        print("ERROR:" + str(e).replace("\n", " "))
        sys.exit(1)
