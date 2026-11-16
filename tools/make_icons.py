"""Generate Suun icons with the standard library only."""
import os, struct, zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
C1, C2 = (0x64, 0xD2, 0xFF), (0x0A, 0x5C, 0xE0)
SS = 3  # supersampling per axis


def png(path, w, h, rows):
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xFFFFFFFF)
    data = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(data)


def sample(x, y, n, rounded):
    """Return (r, g, b, a) for a point in pixel units; a in 0..1."""
    if rounded:
        r = 0.22 * n
        cx = min(max(x, r), n - r)
        cy = min(max(y, r), n - r)
        if (x - cx) ** 2 + (y - cy) ** 2 > r * r:
            return (0, 0, 0, 0)
    t = (x + y) / (2 * n)
    col = [C1[i] + (C2[i] - C1[i]) * t for i in range(3)]
    d = ((x - n / 2) ** 2 + (y - n / 2) ** 2) ** 0.5 / n
    white = d <= 0.12 or abs(d - 0.24) <= 0.02 or abs(d - 0.36) <= 0.02
    if white:
        col = [255, 255, 255]
    return (col[0], col[1], col[2], 1)


def render(n, rounded):
    rows = []
    for py in range(n):
        row = []
        for px in range(n):
            acc = [0.0] * 4
            for sy in range(SS):
                for sx in range(SS):
                    r, g, b, a = sample(px + (sx + .5) / SS, py + (sy + .5) / SS, n, rounded)
                    acc[0] += r * a; acc[1] += g * a; acc[2] += b * a; acc[3] += a
            tot = SS * SS
            if acc[3] == 0:
                row += [0, 0, 0, 0]
            else:
                row += [round(acc[0] / acc[3]), round(acc[1] / acc[3]), round(acc[2] / acc[3]), round(255 * acc[3] / tot)]
        rows.append(row)
    return rows


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, n, rounded in [('icon-192.png', 192, True), ('icon-512.png', 512, True), ('icon-maskable-512.png', 512, False)]:
        png(os.path.join(OUT, name), n, n, render(n, rounded))
        print('wrote', name)
