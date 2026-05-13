"""
chip2.png / chip3.png / chip4.png からタイルを切り出して
tiles/sprites/chip2/ chip3/ chip4/ に保存するスクリプト。
白セパレータ線でグリッドを検出し、白背景を透過化して保存。
"""

import os
import numpy as np
from PIL import Image
from collections import deque

TILES_DIR  = os.path.join(os.path.dirname(__file__), "tiles")
SEP_FRAC   = 0.85
SEP_THRESH = 200
BBOX_THRESH = 245  # tight_bbox用: これ以上を背景と見なす（高いほど内容を多く保持）
BG_THRESH  = 240   # 透過化用: 外周＋内側の穴も除去
OUT_W, OUT_H = 80, 80
PAD = 6


def remove_bg(img, thresh=BG_THRESH):
    """
    全辺からのBFSで外側白背景を透過化 + 内側に閉じた白領域（指輪の穴など）も透過化。
    四隅だけでなく全辺ピクセルを起点にするため、角が白くなくても対応可能。
    """
    arr = np.array(img)
    h, w = arr.shape[:2]
    white = (arr[:,:,0] >= thresh) & (arr[:,:,1] >= thresh) & (arr[:,:,2] >= thresh)

    # 全辺から到達できる白領域（外側背景）
    exterior = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in [0, h-1]:
            if white[y, x] and not exterior[y, x]:
                exterior[y, x] = True; q.append((y, x))
    for y in range(1, h-1):
        for x in [0, w-1]:
            if white[y, x] and not exterior[y, x]:
                exterior[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in [(-1,0),(1,0),(0,-1),(0,1)]:
            ny, nx = y+dy, x+dx
            if 0 <= ny < h and 0 <= nx < w and white[ny, nx] and not exterior[ny, nx]:
                exterior[ny, nx] = True; q.append((ny, nx))

    # 外側 + 内側の閉じた白穴（指輪の内側など）を両方透過化
    result = arr.copy()
    result[white, 3] = 0  # exterior + interior holes (both are white) → transparent
    return Image.fromarray(result)


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


def tight_bbox(arr_region, thresh=BBOX_THRESH):
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
