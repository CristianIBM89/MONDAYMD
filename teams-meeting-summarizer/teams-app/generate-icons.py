"""
Genera los dos iconos PNG requeridos por Teams:
  - icon-color.png  : 192×192 px (fondo de color)
  - icon-outline.png: 32×32 px  (transparente, solo contorno blanco)

Ejecuta: python generate-icons.py
No requiere dependencias externas — usa solo la librería estándar.
"""
import struct, zlib, base64

def make_png(width, height, pixels_fn):
    """Genera un PNG mínimo válido en memoria."""
    def chunk(name, data):
        c = zlib.crc32(name + data) & 0xFFFFFFFF
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', c)

    raw = b''
    for y in range(height):
        raw += b'\x00'  # filter none
        for x in range(width):
            raw += bytes(pixels_fn(x, y, width, height))

    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    idat = zlib.compress(raw)

    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', ihdr)
        + chunk(b'IDAT', idat)
        + chunk(b'IEND', b'')
    )

def color_pixels(x, y, w, h):
    """Icono color 192×192: fondo #464EB8 con checkmark blanco."""
    # Fondo morado IBM
    r, g, b = 0x46, 0x4E, 0xB8
    # Dibujar un check simple en el centro
    cx, cy = w // 2, h // 2
    # Checkmark: línea diagonal corta + larga
    in_check = False
    scale = w / 192
    # Brazo corto del check (abajo-izquierda)
    if (abs(x - (cx - int(30*scale))) < int(8*scale) and
        abs(y - (cy + int(10*scale))) < int(8*scale)):
        in_check = True
    # Brazo largo (arriba-derecha)
    dx = x - (cx - int(20*scale))
    dy = y - (cy + int(20*scale))
    if abs(dx - dy * 1.2) < int(9*scale) and 0 <= dx <= int(70*scale):
        in_check = True
    if in_check:
        return [255, 255, 255]
    return [r, g, b]

def outline_pixels(x, y, w, h):
    """Icono outline 32×32: solo borde blanco sobre transparente."""
    cx, cy = w // 2, h // 2
    dist = ((x - cx)**2 + (y - cy)**2) ** 0.5
    # Anillo blanco
    if 12 <= dist <= 15:
        return [255, 255, 255]
    return [0, 0, 0]  # negro (Teams lo hace transparente con el outline)

with open('icons/icon-color.png', 'wb') as f:
    f.write(make_png(192, 192, color_pixels))
    print('✅ icons/icon-color.png generado (192×192)')

with open('icons/icon-outline.png', 'wb') as f:
    f.write(make_png(32, 32, outline_pixels))
    print('✅ icons/icon-outline.png generado (32×32)')
