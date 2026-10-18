"""Generate PWA icons (no third-party dependencies or private assets).
Usage: python3 scripts/generate-pwa-icons.py output-directory
"""
from pathlib import Path
import struct
import sys
import zlib

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "assets")
OUT.mkdir(parents=True, exist_ok=True)

def rounded(x, y, cx, cy, width, height, radius):
    dx = max(abs(x-cx) - (width/2-radius), 0.0)
    dy = max(abs(y-cy) - (height/2-radius), 0.0)
    return dx*dx+dy*dy <= radius*radius

def pixel(x, y):
    u, v = x, y
    # Corporate navy foundation, opaque (iOS compliant).
    base = (16, 31 + int(11*v), 62 + int(9*u), 255)
    # Keep all foreground pixels in maskable 80% safe zone.
    tiles = [
        (.404, .404, (229, 239, 255, 255)),
        (.596, .404, (109, 156, 242, 255)),
        (.404, .596, (129, 173, 238, 255)),
        (.596, .596, (255, 255, 255, 255)),
    ]
    for cx,cy,color in tiles:
        if rounded(u, v, cx, cy, .166, .166, .025):
            return color
    return base

def chunk(kind, data):
    payload = kind + data
    return struct.pack(">I", len(data)) + payload + struct.pack(">I", zlib.crc32(payload) & 0xffffffff)

def render(size):
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            row.extend(pixel((x+.5)/size, (y+.5)/size))
        rows.append(bytes(row))
    raw = b"".join(rows)
    return (bytes.fromhex("89504e470d0a1a0a")
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b""))

for dimension in (180, 192, 512):
    dest = OUT / f"icon-{dimension}.png"
    dest.write_bytes(render(dimension))
    print(f"Created {dest} ({dimension}x{dimension})")
