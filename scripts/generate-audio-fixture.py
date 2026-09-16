"""Build a small silent mp3, tagged with ID3v2.3 metadata, for VLC fixtures.

Usage:
    python scripts/generate-audio-fixture.py <output.mp3> --artist NAME --album NAME
        --title NAME [--year YYYY] [--track N] [--seconds N] [--art PATH]

Uses ffmpeg to encode real silence when it is on PATH. Otherwise falls back to
writing raw MPEG-1 Layer I frames by hand: mono, 48000 Hz, 32 kbps. At that
combination the frame size formula (12 * bitrate / samplerate) lands on an
exact integer, 8, so no frame ever needs a padding byte, and the header's
declared bitrate matches the real one exactly. That is what lets a player
compute an accurate duration from the file size alone, with no Xing header.

Layer I keeps every subband's 4 bit allocation field at zero, meaning "not
transmitted". The format allows this: a frame with no subband allocated
carries no scalefactors and no sample data, so it decodes as pure silence
with nothing to reconstruct. This is a well known trick for hand rolling a
tiny, valid, silent mp3 without an encoder.

The ID3 tag itself follows the same recipe either way: synchsafe frame
sizes, UTF-16 text frames (the only text encoding ID3v2.3 allows for
non-ASCII, since UTF-8 belongs to v2.4 and gets dropped by a v2.3 reader), and
an optional APIC frame for cover art. Pass no --art to leave the file with no
embedded artwork at all.
"""

import argparse
import pathlib
import shutil
import subprocess


def synchsafe(n: int) -> bytes:
    return bytes(((n >> 21) & 0x7F, (n >> 14) & 0x7F, (n >> 7) & 0x7F, n & 0x7F))


def text_frame(frame_id: str, value: str) -> bytes:
    payload = b"\x01" + value.encode("utf-16")
    return frame_id.encode("ascii") + len(payload).to_bytes(4, "big") + b"\x00\x00" + payload


def picture_frame(image: bytes, mime: str) -> bytes:
    payload = (
        b"\x00"
        + mime.encode("ascii") + b"\x00"
        + b"\x03"
        + b"\x00"
        + image
    )
    return b"APIC" + len(payload).to_bytes(4, "big") + b"\x00\x00" + payload


def id3_tag(art: pathlib.Path | None, **tags: str) -> bytes:
    frames = b"".join(text_frame(k, v) for k, v in tags.items() if v)
    if art is not None:
        mime = "image/png" if art.suffix.lower() == ".png" else "image/jpeg"
        frames += picture_frame(art.read_bytes(), mime)
    return b"ID3\x03\x00\x00" + synchsafe(len(frames)) + frames


def layer1_header() -> bytes:
    """MPEG-1, Layer I, no CRC, 32 kbps, 48000 Hz, mono, no emphasis."""
    sync = 0b11111111111
    mpeg_version = 0b11
    layer = 0b11
    protection = 0b1
    bitrate_index = 0b0001
    sampling_index = 0b01
    padding = 0b0
    private_bit = 0b0
    channel_mode = 0b11
    mode_extension = 0b00
    copyright_bit = 0b0
    original = 0b1
    emphasis = 0b00

    bits = (
        (sync << 21)
        | (mpeg_version << 19)
        | (layer << 17)
        | (protection << 16)
        | (bitrate_index << 12)
        | (sampling_index << 10)
        | (padding << 9)
        | (private_bit << 8)
        | (channel_mode << 6)
        | (mode_extension << 4)
        | (copyright_bit << 3)
        | (original << 2)
        | (emphasis << 0)
    )
    return bits.to_bytes(4, "big")


def silent_mp3_frames(seconds: float) -> bytes:
    samples_per_frame = 384
    sample_rate = 48000
    frame_size = 32

    header = layer1_header()
    bit_allocation = bytes(16)  # 32 subbands, 4 bits each, all "not transmitted"
    ancillary = bytes(frame_size - len(header) - len(bit_allocation))
    frame = header + bit_allocation + ancillary

    frame_count = round(seconds * sample_rate / samples_per_frame)
    return frame * frame_count


def encode_with_ffmpeg(dest: pathlib.Path, seconds: float) -> None:
    subprocess.run(
        [
            "ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
            "-t", str(seconds), "-codec:a", "libmp3lame", "-b:a", "32k", str(dest),
        ],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def build(dest: pathlib.Path, seconds: float, art: pathlib.Path | None, **tags: str) -> None:
    tag = id3_tag(art, **tags)
    if shutil.which("ffmpeg"):
        encode_with_ffmpeg(dest, seconds)
        dest.write_bytes(tag + dest.read_bytes())
    else:
        dest.write_bytes(tag + silent_mp3_frames(seconds))
    print(f"  {dest}: {dest.stat().st_size} bytes, tag of {len(tag)} bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=pathlib.Path)
    parser.add_argument("--artist", default="")
    parser.add_argument("--album", default="")
    parser.add_argument("--title", default="")
    parser.add_argument("--year", default="")
    parser.add_argument("--track", default="")
    parser.add_argument("--seconds", type=float, default=6.0)
    parser.add_argument("--art", type=pathlib.Path, default=None)
    args = parser.parse_args()

    build(
        args.output, args.seconds, args.art,
        TIT2=args.title, TPE1=args.artist, TALB=args.album,
        TYER=args.year, TRCK=args.track,
    )
