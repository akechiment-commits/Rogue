"""
chip1.png からチップセットタイルを切り出して tiles/sprites/chip/ に保存するスクリプト。
白系セパレータ行/列を検出して各タイルのバウンディングボックスを特定し切り出す。
"""

import os
import numpy as np
from PIL import Image

TILES_DIR = os.path.join(os.path.dirname(__file__), "tiles")
OUT_DIR   = os.path.join(TILES_DIR, "sprites", "chip")
CHIP_PATH = os.path.join(TILES_DIR, "chip1.png")

WHITE_THRESH = 200
SEP_FRAC     = 0.85   # 列/行の何割以上が白ならセパレータ
OUT_W, OUT_H = 80, 80
PAD = 4


def find_sep_groups(values, offset=0, thresh=SEP_FRAC, gap=3):
    """値配列からthresh以上の位置をグループ化してリストで返す"""
    seps = [i + offset for i, v in enumerate(values) if v > thresh]
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
    """セパレータグループのリストからタイル範囲 [(start, end), ...] を返す"""
    ranges = []
    for i in range(len(groups) - 1):
        x0 = groups[i][-1] + 1
        x1 = groups[i + 1][0] - 1
        if x1 > x0:
            ranges.append((x0, x1))
    return ranges


def tight_bbox(arr_region):
    """コンテンツ(非白)ピクセルのタイトなBBoxを返す。なければNone"""
    white = (arr_region[:, :, 0] >= WHITE_THRESH) & \
            (arr_region[:, :, 1] >= WHITE_THRESH) & \
            (arr_region[:, :, 2] >= WHITE_THRESH)
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
    """指定領域をパディング付きで切り出し、固定サイズRGBAキャンバスに中央配置"""
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

    sprite = img.crop((ax0, ay0, ax1, ay1))
    sw, sh = sprite.size
    if sw > out_w or sh > out_h:
        scale = min(out_w / sw, out_h / sh)
        sprite = sprite.resize(
            (max(1, int(sw * scale)), max(1, int(sh * scale))),
            Image.LANCZOS
        )
        sw, sh = sprite.size

    canvas = Image.new('RGBA', (out_w, out_h), (0, 0, 0, 0))
    px = (out_w - sw) // 2
    py = (out_h - sh) // 2
    canvas.paste(sprite.convert('RGBA'), (px, py))
    return canvas


def find_bands(density, min_val=3, min_size=8):
    """密度配列からバンド (start, end) リストを返す"""
    bands = []
    in_b = False
    bs = 0
    for i, v in enumerate(density):
        if v > min_val:
            if not in_b:
                bs = i
                in_b = True
        else:
            if in_b:
                if i - bs >= min_size:
                    bands.append((bs, i))
                in_b = False
    if in_b and len(density) - bs >= min_size:
        bands.append((bs, len(density)))
    return bands


def process_content_sprites(img, arr, white, x_start, x_end, y_start, y_end,
                              label, out_dir, counter, min_w=16, min_h=16):
    """
    列グループ → 行グループの順で検出。
    全幅行プロジェクションが異なる高さの列グループに引っ張られる問題を回避。
    """
    region_white = white[y_start:y_end, x_start:x_end]
    content = ~region_white

    # 1. 列グループを全高さのプロジェクションで検出
    col_d_full = content.sum(axis=0)
    col_groups = find_bands(col_d_full, min_val=2, min_size=min_w)

    saved = []
    for cg0, cg1 in col_groups:
        # 2. この列グループ内での行プロジェクションで行バンドを検出
        col_strip = content[:, cg0:cg1]
        row_d = col_strip.sum(axis=1)
        row_bands = find_bands(row_d, min_val=1, min_size=min_h)

        for rb0, rb1 in row_bands:
            # 3. この行×列セル内でタイトなbboxを取得して保存
            canvas = cut_to_canvas(img,
                                   x_start + cg0, y_start + rb0,
                                   x_start + cg1, y_start + rb1)
            if canvas is None:
                continue
            fname = f"chip_{label}_{counter[0]:03d}.png"
            canvas.save(os.path.join(out_dir, fname), "PNG")
            counter[0] += 1
            saved.append(fname)
    return saved


def process_left_uniform_band(img, arr, white, y0, y1, band_name, out_dir, counter):
    """
    左セクションの均一バンド: 列セパレータを検出してタイルを切り出す
    """
    band_white = white[y0:y1, 9:497]
    col_w = band_white.mean(axis=0)
    sep_groups = find_sep_groups(col_w, offset=9)
    col_ranges = get_tile_ranges(sep_groups)

    saved = []
    for ci, (cx0, cx1) in enumerate(col_ranges):
        if cx1 - cx0 < 16:
            continue
        canvas = cut_to_canvas(img, cx0, y0, cx1, y1)
        if canvas is None:
            continue
        fname = f"chip_{band_name}_{ci:02d}.png"
        canvas.save(os.path.join(out_dir, fname), "PNG")
        counter[0] += 1
        saved.append(fname)
    return saved


def process():
    os.makedirs(OUT_DIR, exist_ok=True)

    if not os.path.exists(CHIP_PATH):
        print(f"SKIP: {CHIP_PATH} not found")
        return

    img = Image.open(CHIP_PATH).convert("RGB")
    arr = np.array(img)
    white = (arr[:, :, 0] >= WHITE_THRESH) & \
            (arr[:, :, 1] >= WHITE_THRESH) & \
            (arr[:, :, 2] >= WHITE_THRESH)

    counter = [0]
    total = 0

    # ── 左セクション (x=9..496) ────────────────────────────────────────────
    # 行セパレータ検出
    left_white = white[:, 9:497]
    row_w = left_white.mean(axis=1)
    row_sep_groups = find_sep_groups(row_w, offset=0, thresh=0.85)
    row_ranges = get_tile_ranges(row_sep_groups)

    print(f"左セクション: {len(row_ranges)} row bands")
    for ri, (ry0, ry1) in enumerate(row_ranges):
        h = ry1 - ry0
        band_name = f"L{ri}"
        print(f"  band {ri}: y={ry0}..{ry1} (h={h})")

        if h > 200:
            # 大きな複合バンド: コンテンツ検出で個別切り出し
            saved = process_content_sprites(
                img, arr, white,
                x_start=9, x_end=497,
                y_start=ry0, y_end=ry1,
                label=band_name, out_dir=OUT_DIR, counter=counter,
                min_w=20, min_h=20
            )
        else:
            # 均一バンド: 列セパレータで切り出し
            saved = process_left_uniform_band(
                img, arr, white, ry0, ry1, band_name, OUT_DIR, counter
            )
        print(f"    → {len(saved)} tiles")
        total += len(saved)

    # ── 右-左セクション (x=513..941): 木・草・小物 ───────────────────────
    print(f"\n右-左セクション (x=513..941):")
    counter_rl = [counter[0]]
    # 行セパレータ検出
    rl_white = white[:, 513:942]
    row_w_rl = rl_white.mean(axis=1)
    row_sep_groups_rl = find_sep_groups(row_w_rl, offset=0, thresh=0.85)
    row_ranges_rl = get_tile_ranges(row_sep_groups_rl)
    print(f"  {len(row_ranges_rl)} row bands")
    for ri, (ry0, ry1) in enumerate(row_ranges_rl):
        saved = process_content_sprites(
            img, arr, white,
            x_start=513, x_end=942,
            y_start=ry0, y_end=ry1,
            label=f"RL{ri}", out_dir=OUT_DIR, counter=counter,
            min_w=16, min_h=16
        )
        print(f"  band {ri} (y={ry0}..{ry1}): {len(saved)} sprites")
        total += len(saved)

    # ── 右-右セクション (x=960..1517): 建物・家具・ドア ─────────────────
    print(f"\n右-右セクション (x=960..1517):")
    rr_white = white[:, 960:1517]
    row_w_rr = rr_white.mean(axis=1)
    row_sep_groups_rr = find_sep_groups(row_w_rr, offset=0, thresh=0.85)
    row_ranges_rr = get_tile_ranges(row_sep_groups_rr)
    print(f"  {len(row_ranges_rr)} row bands")
    for ri, (ry0, ry1) in enumerate(row_ranges_rr):
        saved = process_content_sprites(
            img, arr, white,
            x_start=960, x_end=1517,
            y_start=ry0, y_end=ry1,
            label=f"RR{ri}", out_dir=OUT_DIR, counter=counter,
            min_w=24, min_h=24
        )
        print(f"  band {ri} (y={ry0}..{ry1}): {len(saved)} sprites")
        total += len(saved)

    print(f"\nDone. {total} chip tiles saved to {OUT_DIR}")

    # ── 切り出し結果サマリ ────────────────────────────────────────────────
    files = sorted(os.listdir(OUT_DIR))
    print(f"Total files: {len(files)}")


if __name__ == "__main__":
    process()
