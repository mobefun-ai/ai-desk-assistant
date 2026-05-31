#!/usr/bin/env python3
"""Generate assets/icon.png: a friendly assistant avatar (no external deps)."""
import math
import os
import struct
import zlib

W = H = 256


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def clamp01(x):
    return max(0.0, min(1.0, x))


TOP = (0x4F, 0x46, 0xE5)      # indigo
BOTTOM = (0x7C, 0x3A, 0xED)   # violet
WHITE = (255, 255, 255)
DARK = (0x26, 0x22, 0x4A)

cx, cy = W / 2, H / 2 + 6
R = 104


def coverage(dist, radius):
    # simple anti-aliased edge: 1 inside, 0 outside, smooth ~1px
    return clamp01(radius - dist + 0.5)


def blend(dst, src, alpha):
    return tuple(int(dst[i] + (src[i] - dst[i]) * alpha) for i in range(3))


pixels = bytearray()
for y in range(H):
    row = bytearray()
    for x in range(W):
        r, g, b, a = 0, 0, 0, 0
        dx, dy = x - cx, y - cy
        dist = math.hypot(dx, dy)

        head_cov = coverage(dist, R)
        if head_cov > 0:
            t = clamp01((y - (cy - R)) / (2 * R))
            base = lerp(TOP, BOTTOM, t)
            r, g, b = base
            a = int(255 * head_cov)

        # eyes
        for ex in (-34, 34):
            ed = math.hypot(x - (cx + ex), y - (cy - 14))
            ec = coverage(ed, 20)
            if ec > 0:
                r, g, b = blend((r, g, b), WHITE, ec)
                a = max(a, int(255 * ec))
            pd = math.hypot(x - (cx + ex + 3), y - (cy - 11))
            pc = coverage(pd, 9)
            if pc > 0:
                r, g, b = blend((r, g, b), DARK, pc)
                a = max(a, int(255 * pc))

        # smile (arc): points whose distance from a center ~ smile radius, lower half
        sd = math.hypot(x - cx, y - (cy + 6))
        smile_r = 46
        ring = abs(sd - smile_r)
        if y > cy + 18 and ring < 6:
            sc = coverage(ring, 5)
            r, g, b = blend((r, g, b), WHITE, sc)
            a = max(a, int(255 * sc))

        # little antenna dot
        ad = math.hypot(x - cx, y - (cy - R - 8))
        ac = coverage(ad, 9)
        if ac > 0:
            r, g, b = blend((r, g, b), (0x22, 0xC5, 0x5E), ac)
            a = max(a, int(255 * ac))

        row += bytes((r, g, b, a))
    pixels += b"\x00" + row  # filter byte per scanline


def chunk(tag, data):
    c = tag + data
    return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)


png = b"\x89PNG\r\n\x1a\n"
png += chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0))
png += chunk(b"IDAT", zlib.compress(bytes(pixels), 9))
png += chunk(b"IEND", b"")

out = os.path.join(os.path.dirname(__file__), "icon.png")
with open(out, "wb") as f:
    f.write(png)
print("wrote", out, len(png), "bytes")
