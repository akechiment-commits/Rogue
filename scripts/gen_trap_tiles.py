"""Generate missing 16x16 trap icons for public/tiles."""
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / "public" / "tiles"
PREVIEW = Path(__file__).resolve().parents[1] / "tiles" / "Character" / "_brushup" / "traps" / "_preview"
OUT.mkdir(parents=True, exist_ok=True)
PREVIEW.mkdir(parents=True, exist_ok=True)

# DawnLike-adjacent palette sampled from existing public trap tiles
C = {
    "bg": (48, 52, 109, 255),
    "out": (69, 36, 52, 255),
    "dk": (77, 73, 77, 255),
    "mid": (117, 113, 97, 255),
    "br": (134, 77, 48, 255),
    "or": (211, 125, 44, 255),
    "pe": (211, 170, 154, 255),
    "yl": (219, 215, 93, 255),
    "lt": (223, 239, 215, 255),
    "cy": (109, 195, 203, 255),
    "gr": (80, 180, 90, 255),
    "dg": (40, 120, 50, 255),
    "pu": (160, 80, 200, 255),
    "rd": (200, 50, 50, 255),
    "bl": (60, 100, 200, 255),
    "wh": (240, 240, 245, 255),
    "bk": (20, 12, 28, 255),
    "sl": (134, 150, 162, 255),
}


def blank(fill="bg"):
    return Image.new("RGBA", (16, 16), C[fill])


def put(im, x, y, col):
    if 0 <= x < 16 and 0 <= y < 16:
        im.putpixel((x, y), C[col] if isinstance(col, str) else col)


def fill_rect(im, x0, y0, x1, y1, col):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            put(im, x, y, col)


def outline_rect(im, x0, y0, x1, y1, col):
    for x in range(x0, x1 + 1):
        put(im, x, y0, col)
        put(im, x, y1, col)
    for y in range(y0, y1 + 1):
        put(im, x0, y, col)
        put(im, x1, y, col)


def trap_mp_absorb():
    im = blank()
    fill_rect(im, 6, 5, 10, 11, "pu")
    put(im, 8, 4, "pu")
    put(im, 8, 12, "pu")
    put(im, 5, 8, "pu")
    put(im, 11, 8, "pu")
    put(im, 8, 5, "lt")
    put(im, 7, 8, "lt")
    for y, x in [(12, 6), (13, 7), (14, 8), (13, 9), (12, 10)]:
        put(im, x, y, "cy")
    outline_rect(im, 5, 4, 11, 12, "out")
    return im


def trap_confuse():
    im = blank()
    for x, y, c in [
        (8, 4, "yl"), (9, 5, "yl"), (10, 6, "or"), (10, 7, "or"), (9, 8, "yl"),
        (7, 8, "yl"), (6, 7, "or"), (6, 6, "or"), (7, 5, "yl"),
        (8, 9, "lt"), (8, 10, "lt"), (8, 12, "yl"),
    ]:
        put(im, x, y, c)
    for ox in (3, 11):
        put(im, ox + 1, 3, "lt")
        put(im, ox + 2, 3, "lt")
        put(im, ox + 2, 4, "lt")
        put(im, ox + 2, 5, "lt")
        put(im, ox + 1, 6, "lt")
        put(im, ox + 1, 8, "lt")
    return im


def trap_strong_arrow():
    im = blank()
    for i in range(3, 13):
        put(im, i, 7, "yl")
        put(im, i, 8, "or")
    for dx, dy in [(12, 6), (12, 7), (12, 8), (12, 9), (13, 7), (13, 8), (14, 7), (14, 8)]:
        put(im, dx, dy, "lt")
    put(im, 3, 5, "rd")
    put(im, 3, 6, "rd")
    put(im, 4, 6, "rd")
    put(im, 3, 9, "rd")
    put(im, 3, 10, "rd")
    put(im, 4, 9, "rd")
    put(im, 2, 7, "rd")
    put(im, 2, 8, "rd")
    return im


def trap_darkness():
    im = blank("bk")
    fill_rect(im, 3, 3, 12, 12, "dk")
    outline_rect(im, 3, 3, 12, 12, "out")
    put(im, 6, 7, "mid")
    put(im, 7, 7, "mid")
    put(im, 9, 7, "mid")
    put(im, 10, 7, "mid")
    put(im, 8, 8, "mid")
    for x, y in [(2, 2), (13, 2), (2, 13), (13, 13), (4, 4), (11, 4)]:
        put(im, x, y, "bk")
    return im


def trap_oil():
    im = blank()
    fill_rect(im, 3, 6, 12, 12, "br")
    fill_rect(im, 4, 5, 11, 5, "br")
    fill_rect(im, 5, 13, 10, 13, "br")
    put(im, 5, 7, "yl")
    put(im, 6, 7, "cy")
    put(im, 7, 8, "pu")
    put(im, 9, 9, "yl")
    put(im, 10, 8, "cy")
    outline_rect(im, 3, 5, 12, 13, "out")
    return im


def trap_float():
    im = blank()
    fill_rect(im, 3, 7, 12, 10, "lt")
    fill_rect(im, 4, 6, 11, 6, "lt")
    fill_rect(im, 5, 5, 10, 5, "wh")
    fill_rect(im, 4, 11, 11, 11, "pe")
    for ox in (5, 10):
        put(im, ox, 3, "cy")
        put(im, ox, 2, "cy")
        put(im, ox - 1, 3, "cy")
        put(im, ox + 1, 3, "cy")
    outline_rect(im, 3, 5, 12, 11, "out")
    return im


def trap_bewitch():
    im = blank()
    for ox in (4, 9):
        fill_rect(im, ox, 5, ox + 3, 9, "lt")
        outline_rect(im, ox, 5, ox + 3, 9, "out")
        put(im, ox + 1, 7, "pu")
        put(im, ox + 2, 7, "pu")
        put(im, ox + 1, 6, "pu")
    for x, y in [(3, 12), (4, 13), (5, 12), (6, 13), (7, 12), (8, 13), (9, 12), (10, 13), (11, 12), (12, 13)]:
        put(im, x, y, "pu")
    return im


def trap_rot():
    im = blank()
    fill_rect(im, 5, 4, 10, 11, "mid")
    fill_rect(im, 4, 5, 11, 10, "mid")
    put(im, 6, 7, "bk")
    put(im, 9, 7, "bk")
    for x, y in [(4, 4), (5, 5), (10, 4), (11, 6), (5, 11), (8, 12), (11, 10), (3, 8)]:
        put(im, x, y, "gr")
    put(im, 6, 6, "dg")
    put(im, 9, 9, "dg")
    outline_rect(im, 4, 4, 11, 11, "out")
    return im


def trap_alarm():
    im = blank()
    fill_rect(im, 5, 5, 10, 10, "yl")
    fill_rect(im, 4, 6, 11, 9, "yl")
    put(im, 6, 4, "yl")
    put(im, 7, 3, "or")
    put(im, 8, 3, "or")
    put(im, 9, 4, "yl")
    put(im, 7, 11, "mid")
    put(im, 8, 11, "mid")
    put(im, 7, 12, "dk")
    put(im, 8, 12, "dk")
    for x, y in [(2, 6), (2, 8), (2, 10), (13, 6), (13, 8), (13, 10), (1, 7), (1, 9), (14, 7), (14, 9)]:
        put(im, x, y, "lt")
    outline_rect(im, 4, 5, 11, 10, "out")
    return im


def trap_unident():
    im = blank()
    fill_rect(im, 4, 7, 11, 13, "br")
    fill_rect(im, 5, 6, 10, 6, "or")
    put(im, 7, 5, "or")
    put(im, 8, 5, "or")
    outline_rect(im, 4, 6, 11, 13, "out")
    put(im, 7, 1, "lt")
    put(im, 8, 1, "lt")
    put(im, 9, 1, "lt")
    put(im, 9, 2, "lt")
    put(im, 9, 3, "lt")
    put(im, 8, 4, "lt")
    put(im, 7, 6, "lt")
    return im


def trap_multiply():
    im = blank()
    fill_rect(im, 2, 6, 6, 11, "pu")
    put(im, 3, 5, "pu")
    put(im, 4, 5, "pu")
    put(im, 5, 5, "pu")
    put(im, 3, 8, "lt")
    put(im, 5, 8, "lt")
    fill_rect(im, 9, 6, 13, 11, "pu")
    put(im, 10, 5, "pu")
    put(im, 11, 5, "pu")
    put(im, 12, 5, "pu")
    put(im, 10, 8, "lt")
    put(im, 12, 8, "lt")
    put(im, 7, 7, "yl")
    put(im, 8, 8, "yl")
    put(im, 7, 9, "yl")
    put(im, 8, 7, "or")
    return im


def trap_watergun():
    im = blank()
    fill_rect(im, 2, 6, 5, 10, "sl")
    fill_rect(im, 1, 7, 2, 9, "dk")
    for i in range(6, 14):
        put(im, i, 7, "cy")
        put(im, i, 8, "bl")
        put(im, i, 9, "cy")
    put(im, 14, 6, "lt")
    put(im, 14, 8, "lt")
    put(im, 14, 10, "lt")
    put(im, 13, 5, "cy")
    put(im, 13, 11, "cy")
    return im


def trap_trip():
    im = blank()
    for x in range(1, 15):
        put(im, x, 9, "yl")
    put(im, 2, 8, "or")
    put(im, 13, 8, "or")
    fill_rect(im, 1, 5, 2, 12, "br")
    fill_rect(im, 13, 5, 14, 12, "br")
    fill_rect(im, 6, 11, 9, 13, "pe")
    put(im, 5, 12, "pe")
    put(im, 10, 12, "pe")
    return im


def spike(im, cx, cy, col):
    """Small 3x3 caret, tip at (cx, cy)."""
    put(im, cx, cy, col)
    put(im, cx - 1, cy + 1, col)
    put(im, cx, cy + 1, col)
    put(im, cx + 1, cy + 1, col)
    put(im, cx - 1, cy + 2, col)
    put(im, cx + 1, cy + 2, col)


def trap_trap():
    """Many small trap spikes scattered on the floor."""
    im = blank()
    spike(im, 3, 2, "rd")
    spike(im, 10, 1, "or")
    spike(im, 13, 5, "yl")
    spike(im, 5, 7, "or")
    spike(im, 9, 9, "rd")
    put(im, 1, 12, "dk")
    put(im, 6, 13, "dk")
    put(im, 12, 13, "dk")
    return im


def trap_item_monster():
    """Floor item morphing into a monster."""
    im = blank()
    # potion / bag
    put(im, 3, 3, "or")
    put(im, 4, 3, "or")
    put(im, 3, 4, "br")
    put(im, 4, 4, "br")
    fill_rect(im, 2, 5, 5, 11, "br")
    outline_rect(im, 2, 5, 5, 11, "out")
    put(im, 3, 7, "yl")
    # morph spark
    put(im, 7, 7, "yl")
    put(im, 8, 8, "or")
    put(im, 7, 9, "yl")
    put(im, 8, 6, "lt")
    # monster blob
    fill_rect(im, 9, 5, 13, 11, "pu")
    put(im, 10, 4, "pu")
    put(im, 11, 4, "pu")
    put(im, 12, 4, "pu")
    put(im, 10, 7, "lt")
    put(im, 12, 7, "lt")
    put(im, 11, 9, "rd")
    return im


def chevron(im, x, y0, col):
    """Right-pointing 5-tall chevron, left column at x."""
    put(im, x, y0, col)
    put(im, x, y0 + 4, col)
    put(im, x + 1, y0 + 1, col)
    put(im, x + 1, y0 + 3, col)
    put(im, x + 2, y0 + 2, col)
    put(im, x, y0 + 1, col)
    put(im, x, y0 + 3, col)
    put(im, x + 1, y0 + 2, col)


def trap_haste():
    """Speed chevrons racing right."""
    im = blank()
    chevron(im, 1, 5, "yl")
    chevron(im, 6, 5, "or")
    chevron(im, 11, 5, "lt")
    put(im, 4, 4, "cy")
    put(im, 9, 4, "cy")
    put(im, 4, 10, "cy")
    put(im, 9, 10, "cy")
    return im


def trap_unequip():
    """Sword and armor popping apart."""
    im = blank()
    # sword blade (diagonal)
    for i in range(5):
        put(im, 2 + i, 3 + i, "yl")
        put(im, 3 + i, 3 + i, "lt")
    put(im, 2, 3, "wh")
    # hilt
    put(im, 2, 7, "br")
    put(im, 1, 8, "br")
    put(im, 3, 8, "br")
    put(im, 2, 8, "or")
    put(im, 2, 9, "br")
    # burst
    put(im, 7, 6, "yl")
    put(im, 8, 7, "or")
    put(im, 7, 8, "yl")
    put(im, 8, 5, "lt")
    # chestplate
    fill_rect(im, 10, 5, 14, 11, "sl")
    outline_rect(im, 10, 5, 14, 11, "out")
    put(im, 11, 4, "sl")
    put(im, 12, 4, "sl")
    put(im, 13, 4, "sl")
    put(im, 10, 6, "lt")
    put(im, 12, 7, "dk")
    put(im, 12, 8, "dk")
    return im


DESIGNS = {
    "trap_mp_absorb": trap_mp_absorb,
    "trap_confuse": trap_confuse,
    "trap_strong_arrow": trap_strong_arrow,
    "trap_darkness": trap_darkness,
    "trap_oil": trap_oil,
    "trap_float": trap_float,
    "trap_bewitch": trap_bewitch,
    "trap_rot": trap_rot,
    "trap_alarm": trap_alarm,
    "trap_unident": trap_unident,
    "trap_multiply": trap_multiply,
    "trap_watergun": trap_watergun,
    "trap_trip": trap_trip,
    "trap_trap": trap_trap,
    "trap_item_monster": trap_item_monster,
    "trap_haste": trap_haste,
    "trap_unequip": trap_unequip,
}


def main():
    for name, fn in DESIGNS.items():
        im = fn()
        path = OUT / f"{name}.png"
        im.save(path)
        im.resize((128, 128), Image.NEAREST).save(PREVIEW / f"new_{name}.png")
        print("wrote", path.name)
    print("done", len(DESIGNS))


if __name__ == "__main__":
    main()
