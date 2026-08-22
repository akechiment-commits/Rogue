"""立ち絵の外周背景を透過し、低容量のパレットPNGとして保存する。"""

from collections import deque
from pathlib import Path

from PIL import Image


PORTRAIT_DIR = Path(__file__).resolve().parent.parent / "tiles" / "Character"
THRESHOLD = 20
NEAR_WHITE = 220
# 暗い髪・レース・装飾まで外周背景として巻き込まない。
# 黒背景を処理する場合も、背景キーは純黒だけに限定する。
NEAR_BLACK = 0
GREEN_MIN = 150
PALETTE_COLORS = 256
SKIP_ALREADY_TRANSPARENT = True


def color_distance(first, second):
    return max(abs(first[index] - second[index]) for index in range(3))


def is_background_seed(rgba):
    r, g, b, a = rgba
    if a == 0:
        return False
    return (
        (r >= NEAR_WHITE and g >= NEAR_WHITE and b >= NEAR_WHITE)
        or (r <= NEAR_BLACK and g <= NEAR_BLACK and b <= NEAR_BLACK)
        or (g >= GREEN_MIN and g > r + 20 and g > b + 20)
    )


def transparentize_exterior(image):
    pixels = image.load()
    width, height = image.size
    visited = bytearray(width * height)
    queue = deque()

    for x, y in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)):
        rgba = pixels[x, y]
        if not is_background_seed(rgba):
            continue
        cell = y * width + x
        if visited[cell]:
            continue
        visited[cell] = 1
        queue.append((x, y, rgba))

    changed = 0
    while queue:
        x, y, reference = queue.popleft()
        rgba = pixels[x, y]
        if color_distance(rgba, reference) > THRESHOLD:
            continue

        if rgba[3] != 0:
            pixels[x, y] = (rgba[0], rgba[1], rgba[2], 0)
            changed += 1

        for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if next_x < 0 or next_x >= width or next_y < 0 or next_y >= height:
                continue
            cell = next_y * width + next_x
            if visited[cell]:
                continue
            visited[cell] = 1
            queue.append((next_x, next_y, reference))

    return changed


def process_image(path):
    image = Image.open(path).convert("RGBA")
    if SKIP_ALREADY_TRANSPARENT:
        alpha_min, alpha_max = image.getchannel("A").getextrema()
        if alpha_min < 255:
            print(f"  skipped {path.name}: already contains transparency")
            return 0
    changed = transparentize_exterior(image)
    if changed == 0:
        return 0

    optimized = image.quantize(
        colors=PALETTE_COLORS,
        method=Image.Quantize.FASTOCTREE,
        dither=Image.Dither.FLOYDSTEINBERG,
    )
    optimized.save(path, "PNG", optimize=True, compress_level=9)
    return changed


def main():
    files = sorted(PORTRAIT_DIR.glob("*.png"))
    updated = 0
    transparent_pixels = 0
    for path in files:
        changed = process_image(path)
        if changed == 0:
            continue
        updated += 1
        transparent_pixels += changed
        print(f"  updated {path.name}: {changed} background pixels")
    print(
        f"Done. {updated}/{len(files)} files updated; "
        f"{transparent_pixels} background pixels made transparent."
    )


if __name__ == "__main__":
    main()
