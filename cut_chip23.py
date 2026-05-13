"""
chip2.png / chip3.png / chip4.png からタイルを切り出して
tiles/sprites/chip2/ chip3/ chip4/ に保存するスクリプト。
白セパレータ線でグリッドを検出し、白背景を透過化して保存。
"""

import os
import numpy as np
from PIL import Image
from collections import deque

TILES_DIR = os.path.join(os.path.dirname(__file__), "tiles")
SEP_FRAC  = 0.85
SEP_THRESH = 200
OUT_W, OUT_H = 80, 80
PAD = 4


def remove_bg(img, thresh=230):
    """四隅起点フラッドフィルで白背景をアルファ0に透過化"""
    px = img.load()
    w, h = img.size
    visited = set()
    queue = deque()
    for cx, cy in [(0,0),(w-1,0),(0,h-1),(w-1,h-1)]:
        r, g, b, a = px[cx, cy]
        if r >= thresh and g >= thresh and b >= thresh and (cx,cy) not in visited:
            queue.append((cx, cy))
            visited.add((cx, cy))
    while queue:
        x, y = queue.popleft()
        r, g, b, a = px[x, y]
        if r >= thresh and g >= thresh and b >= thresh:
            px[x, y] = (r, g, b, 0)
            for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
                nx, ny = x+dx, y+dy
                if 0 <= nx < w and 0 <= ny < h and (nx,ny) not in visited:
                    visited.add((nx, ny))
                    queue.append((nx, ny))
    return img


def find_sep_groups(values, thresh=SEP_FRAC, gap=3):
    seps = [i for i, v in enumerate(values) if v > thresh]
    if not seps:
        return []
    groups = [[seps[0]]]
    for x in seps[1:]:
        if x - groups[-1][-1] <= gap:
            groups[-1].append(x)
        else:
            groups.append([x])
    return groups


def get_tile_ranges(groups):
    ranges = []
    for i in range(len(groups) - 1):
        x0 = groups[i][-1] + 1
        x1 = groups[i+1][0] - 1
        if x1 > x0:
            ranges.append((x0, x1))
    return ranges


def tight_bbox(arr_region, thresh=SEP_THRESH):
    white = (arr_region[:,:,0] >= thresh) & \
            (arr_region[:,:,1] >= thresh) & \
            (arr_region[:,:,2] >= thresh)
    content = ~white
    rows = content.any(axis=1)
    cols = content.any(axis=0)
    if not rows.any():
        return None
    r0 = int(np.where(rows)[0][0])
    r1 = int(np.where(rows)[0][-1]) + 1
    c0 = int(np.where(cols)[0][0])
    c1 = int(np.where(cols)[0][-1]) + 1
    return r0, c0, r1, c1


def cut_to_canvas(img, x0, y0, x1, y1, out_w=OUT_W, out_h=OUT_H, pad=PAD):
    arr = np.array(img)
    region = arr[y0:y1, x0:x1]
    bb = tight_bbox(region)
    if bb is None:
        return None
    br0, bc0, br1, bc1 = bb
    ax0 = max(0, x0 + bc0 - pad)
    ay0 = max(0, y0 + br0 - pad)
    ax1 = min(img.width,  x0 + bc1 + pad)
    ay1 = min(img.height, y0 + br1 + pad)

    sprite = img.crop((ax0, ay0, ax1, ay1)).convert('RGBA')
    sprite = remove_bg(sprite)
    sw, sh = sprite.size
    if sw > out_w or sh > out_h:
        scale = min(out_w / sw, out_h / sh)
        sprite = sprite.resize(
            (max(1, int(sw*scale)), max(1, int(sh*scale))),
            Image.LANCZOS
        )
        sw, sh = sprite.size

    canvas = Image.new('RGBA', (out_w, out_h), (0,0,0,0))
    canvas.paste(sprite, ((out_w-sw)//2, (out_h-sh)//2), sprite)
    return canvas


def process_chip(chip_name):
    chip_path = os.path.join(TILES_DIR, f"{chip_name}.png")
    out_dir   = os.path.join(TILES_DIR, "sprites", chip_name)
    os.makedirs(out_dir, exist_ok=True)

    if not os.path.exists(chip_path):
        print(f"SKIP: {chip_path} not found")
        return

    img = Image.open(chip_path).convert("RGB")
    arr = np.array(img)

    white = (arr[:,:,0] >= SEP_THRESH) & \
            (arr[:,:,1] >= SEP_THRESH) & \
            (arr[:,:,2] >= SEP_THRESH)

    row_groups = find_sep_groups(white.mean(axis=1))
    col_groups = find_sep_groups(white.mean(axis=0))
    row_ranges = get_tile_ranges(row_groups)
    col_ranges = get_tile_ranges(col_groups)

    print(f"{chip_name}.png: {len(row_ranges)} rows x {len(col_ranges)} cols")

    count = 0
    skipped = 0
    for ri, (ry0, ry1) in enumerate(row_ranges):
        for ci, (cx0, cx1) in enumerate(col_ranges):
            idx = ri * len(col_ranges) + ci
            fname = f"{chip_name}_r{ri:02d}c{ci:02d}_{idx:03d}.png"
            canvas = cut_to_canvas(img, cx0, ry0, cx1, ry1)
            if canvas is None:
                skipped += 1
                continue
            canvas.save(os.path.join(out_dir, fname), "PNG")
            count += 1

    print(f"  → {count} tiles saved, {skipped} empty skipped")
    print(f"  Output: {out_dir}")


if __name__ == "__main__":
    process_chip("chip2")
    process_chip("chip3")
    process_chip("chip4")
    print("\nDone.")
