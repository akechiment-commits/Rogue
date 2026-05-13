"""
切り出し済みスプライトの背景（白系）を透過にするスクリプト。
コーナーの色を基準にflood fillで背景を検出し、アルファを0にする。
"""

import os
from PIL import Image
from collections import deque

SPRITES_DIR = os.path.join(os.path.dirname(__file__), "tiles", "sprites")
THRESHOLD = 30   # コーナー色からの許容距離（0〜255）
NEAR_WHITE = 220 # コーナーが白系かどうかの判定閾値（RGBすべてがこれ以上）


def color_dist(a, b):
    return max(abs(int(a[0]) - int(b[0])),
               abs(int(a[1]) - int(b[1])),
               abs(int(a[2]) - int(b[2])))


def is_near_white(rgba):
    r, g, b = rgba[0], rgba[1], rgba[2]
    return r >= NEAR_WHITE and g >= NEAR_WHITE and b >= NEAR_WHITE


def flood_fill_transparent(img):
    pixels = img.load()
    w, h = img.size
    visited = [[False] * w for _ in range(h)]
    queue = deque()

    # 四隅のうち白系のものだけを起点にする
    for cx, cy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        rgba = pixels[cx, cy]
        if is_near_white(rgba) and not visited[cy][cx]:
            queue.append((cx, cy, rgba))
            visited[cy][cx] = True

    while queue:
        x, y, ref = queue.popleft()
        rgba = pixels[x, y]
        if color_dist(rgba, ref) <= THRESHOLD:
            pixels[x, y] = (rgba[0], rgba[1], rgba[2], 0)
        else:
            continue
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                visited[ny][nx] = True
                queue.append((nx, ny, ref))

    return img


def process():
    total = 0
    for style in sorted(os.listdir(SPRITES_DIR)):
        style_dir = os.path.join(SPRITES_DIR, style)
        if not os.path.isdir(style_dir):
            continue
        files = [f for f in os.listdir(style_dir) if f.endswith(".png")]
        print(f"Processing {style}/ ({len(files)} files)...")
        for fname in files:
            path = os.path.join(style_dir, fname)
            img = Image.open(path).convert("RGBA")
            img = flood_fill_transparent(img)
            img.save(path, "PNG")
            total += 1
    print(f"Done. {total} files updated.")


if __name__ == "__main__":
    process()
