#!/usr/bin/env python3
"""
Genera los iconos de Agile Team Hub para el paquete de Microsoft Teams.
- icon-color.png  : 192x192 px (color)
- icon-outline.png: 32x32 px  (contorno blanco sobre fondo transparente)

Requiere: pip install Pillow
"""
import os, struct, zlib, io

def make_png(width, height, rgba_rows):
    """Minimal PNG writer without Pillow dependency."""
    def chunk(name, data):
        c = struct.pack('>I', len(data)) + name + data
        return c + struct.pack('>I', zlib.crc32(name + data) & 0xffffffff)

    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
    # RGB mode (no alpha) for color, RGBA for outline
    # We'll use RGBA for both
    ihdr = chunk(b'IHDR', struct.pack('>II', width, height) + bytes([8, 6, 0, 0, 0]))

    raw = b''
    for row in rgba_rows:
        raw += b'\x00' + row
    compressed = zlib.compress(raw, 9)
    idat = chunk(b'IDAT', compressed)
    iend = chunk(b'IEND', b'')
    return header + ihdr + idat + iend

def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def generate_color_icon(size=192):
    """Blue rounded-square with 'ATH' text represented as geometric shapes."""
    BLUE = hex_to_rgb('#0f62fe')
    WHITE = (255, 255, 255)
    BG = (255, 255, 255, 0)  # transparent corners

    rows = []
    radius = size // 8
    for y in range(size):
        row = b''
        for x in range(size):
            # rounded corner check
            in_corner = False
            cx, cy = -1, -1
            if x < radius and y < radius: cx, cy = radius, radius
            elif x > size-1-radius and y < radius: cx, cy = size-1-radius, radius
            elif x < radius and y > size-1-radius: cx, cy = radius, size-1-radius
            elif x > size-1-radius and y > size-1-radius: cx, cy = size-1-radius, size-1-radius
            if cx >= 0:
                dist = ((x-cx)**2 + (y-cy)**2) ** 0.5
                if dist > radius:
                    in_corner = True

            if in_corner:
                row += bytes([255, 255, 255, 0])
                continue

            # Blue background
            r, g, b = BLUE
            a = 255

            # Draw a simple "A" shape in white using pixels
            # Centered agile-inspired diamond/chevron shape
            cx_center = size // 2
            cy_center = size // 2
            scale = size // 6

            # Three horizontal bars representing "iterative process"
            bar_width = size * 2 // 3
            bar_x_start = (size - bar_width) // 2
            bar_h = max(size // 20, 4)

            bar1_y = cy_center - scale
            bar2_y = cy_center
            bar3_y = cy_center + scale

            in_bar = (
                bar_x_start <= x <= bar_x_start + bar_width and
                (bar1_y <= y <= bar1_y + bar_h or
                 bar2_y <= y <= bar2_y + bar_h or
                 bar3_y <= y <= bar3_y + bar_h)
            )

            # Small circle top-right (sprint dot)
            dot_cx = size * 2 // 3
            dot_cy = size // 4
            dot_r = size // 14
            in_dot = (x - dot_cx) ** 2 + (y - dot_cy) ** 2 <= dot_r ** 2

            if in_bar or in_dot:
                r, g, b = WHITE
            row += bytes([r, g, b, a])
        rows.append(row)
    return rows

def generate_outline_icon(size=32):
    """White symbol on transparent background."""
    WHITE = (255, 255, 255)
    rows = []
    bar_width = size * 2 // 3
    bar_x_start = (size - bar_width) // 2
    bar_h = max(2, size // 16)
    scale = size // 6
    cy_center = size // 2

    for y in range(size):
        row = b''
        for x in range(size):
            bar1_y = cy_center - scale
            bar2_y = cy_center
            bar3_y = cy_center + scale

            in_bar = (
                bar_x_start <= x <= bar_x_start + bar_width and
                (bar1_y <= y <= bar1_y + bar_h or
                 bar2_y <= y <= bar2_y + bar_h or
                 bar3_y <= y <= bar3_y + bar_h)
            )

            dot_cx = size * 2 // 3
            dot_cy = size // 4
            dot_r = max(2, size // 14)
            in_dot = (x - dot_cx) ** 2 + (y - dot_cy) ** 2 <= dot_r ** 2

            if in_bar or in_dot:
                row += bytes([255, 255, 255, 255])
            else:
                row += bytes([0, 0, 0, 0])
        rows.append(row)
    return rows

out_dir = os.path.dirname(os.path.abspath(__file__))

color_rows = generate_color_icon(192)
color_png = make_png(192, 192, color_rows)
with open(os.path.join(out_dir, 'icon-color.png'), 'wb') as f:
    f.write(color_png)
print(f"✅ icon-color.png generado ({len(color_png)} bytes)")

outline_rows = generate_outline_icon(32)
outline_png = make_png(32, 32, outline_rows)
with open(os.path.join(out_dir, 'icon-outline.png'), 'wb') as f:
    f.write(outline_png)
print(f"✅ icon-outline.png generado ({len(outline_png)} bytes)")
