"""
chip1.png からチップセットタイルを切り出して tiles/sprites/chip/ に保存するスクリプト。

左セクション:
  - 均一バンド (h<=150): 白セパレータ線を検出して列ごとに切り出し
  - 複合バンド (h>150): CONTENT_THRESH=240の3段階検出
右セクション:
  - 3段階検出 (列グループ→行バンド→副列グループ)
"""

import os
import numpy as np
from PIL import Image

TILES_DIR     = os.path.join(os.path.dirname(__file__), "tiles")
OUT_DIR       = os.path.join(TILES_DIR, "sprites", "chip")
CHIP_PATH     = os.path.join(TILES_DIR, "chip1.png")

SEP_THRESH    = 200   # 白セパレータ線の検出閾値
SEP_FRAC      = 0.85  # 行/列の何割以上が白ならセパレータ
CONTENT_THRESH = 240  # スプライト間ギャップ検出閾値（高いほど細い隙間も検出）
OUT_W, OUT_H  = 80, 80
PAD           = 4


# ── ユーティリティ ────────────────────────────────────────────────────────────

def _remove_bg(img, thresh=230):
    """白背景をアルファ0に透過化。四隅フラッドフィル後、指輪穴など内側の
    閉じた白領域も thresh_inner(=245) で追加除去する。"""
    from collections import deque
    px = img.load()
    w, h = img.size
    visited = set()
    queue = deque()
    # ── 外側フラッドフィル（四隅起点）──
    for cx, cy in [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]:
        r, g, b, a = px[cx, cy]
        if r >= thresh and g >= thresh and b >= thresh and (cx, cy) not in visited:
            queue.append((cx, cy))
            visited.add((cx, cy))
    while queue:
        x, y = queue.popleft()
        r, g, b, a = px[x, y]
        if r >= thresh and g >= thresh and b >= thresh:
            px[x, y] = (r, g, b, 0)
            for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
                nx, ny = x+dx, y+dy
                if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in visited:
                    visited.add((nx, ny))
                    queue.append((nx, ny))
    # ── 内側白領域（穴など閉じた白ピクセル）の追加除去 ──
    # 外側フラッドフィルで届かなかった非常に白いピクセルを残らず透過化
    thresh_inner = 240
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0 and r >= thresh_inner and g >= thresh_inner and b >= thresh_inner:
                px[x, y] = (r, g, b, 0)
    return img


def find_sep_groups(values, offset=0, thresh=SEP_FRAC, gap=3):
    """フラクション配列から閾値以上の連続グループを返す（セパレータ検出用）"""
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
    """セパレータグループ列からタイル範囲 [(start,end),...] を返す"""
    ranges = []
    for i in range(len(groups) - 1):
        x0 = groups[i][-1] + 1
        x1 = groups[i + 1][0] - 1
        if x1 > x0:
            ranges.append((x0, x1))
    return ranges


def content_mask(arr, y0, y1, x0, x1, thresh=CONTENT_THRESH):
    """指定領域のコンテンツ(非白)マスクを返す (thresh以上=白)"""
    sub = arr[y0:y1, x0:x1, :]
    white = (sub[:, :, 0] >= thresh) & \
            (sub[:, :, 1] >= thresh) & \
            (sub[:, :, 2] >= thresh)
    return ~white


def find_bands(density, min_val=0, min_size=8):
    """密度配列からコンテンツバンド (start, end) リストを返す"""
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


def tight_bbox(arr_region, thresh=SEP_THRESH):
    """コンテンツのタイトBBoxを返す。コンテンツなければNone"""
    white = (arr_region[:, :, 0] >= thresh) & \
            (arr_region[:, :, 1] >= thresh) & \
            (arr_region[:, :, 2] >= thresh)
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
    """指定領域をパディング付きで切り出し、固定サイズRGBAキャンバス中央に配置"""
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
    # キャンバス配置前に白背景を透過化（canvas角が透明になる前に処理）
    sprite = _remove_bg(sprite)
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
    canvas.paste(sprite, (px, py), sprite)
    return canvas


def save_tile(img, x0, y0, x1, y1, fname, out_dir, counter):
    """タイルを切り出してファイル保存。成功したらTrueを返す"""
    canvas = cut_to_canvas(img, x0, y0, x1, y1)
    if canvas is None:
        return False
    canvas.save(os.path.join(out_dir, fname), "PNG")
    counter[0] += 1
    return True


# ── 均一バンド（白セパレータ線で区切られた規則的なグリッド）─────────────────

def process_left_uniform_band(img, arr, y0, y1, band_name, out_dir, counter):
    """
    左セクションの均一バンド: 列セパレータ線を検出してタイルを切り出す。
    thresh=200でほぼ全列が白になる線をセパレータとして使用。
    """
    region = arr[y0:y1, 9:497, :]
    white_mask = (region[:, :, 0] >= SEP_THRESH) & \
                 (region[:, :, 1] >= SEP_THRESH) & \
                 (region[:, :, 2] >= SEP_THRESH)
    col_w = white_mask.mean(axis=0)
    sep_groups = find_sep_groups(col_w, offset=9)
    col_ranges = get_tile_ranges(sep_groups)

    saved = []
    for ci, (cx0, cx1) in enumerate(col_ranges):
        if cx1 - cx0 < 16:
            continue
        fname = f"chip_{band_name}_{ci:02d}.png"
        if save_tile(img, cx0, y0, cx1, y1, fname, out_dir, counter):
            saved.append(fname)
    return saved


# ── 複合バンド・右セクション（CONTENT_THRESH=240の3段階検出）─────────────────

def process_content_sprites(img, arr, x_start, x_end, y_start, y_end,
                              label, out_dir, counter, min_w=16, min_h=16):
    """
    CONTENT_THRESH=240で3段階検出してスプライトを切り出す:

    Level 1: 全高さ列プロジェクション → 列グループ
      異なる高さを持つアイテムが隣り合っていても列を正しく分離
    Level 2: 列グループ内の行プロジェクション → 行バンド
      同一列グループ内で縦に並んだアイテムを分離
    Level 3: 行バンド内の列プロジェクション → 副列グループ
      同一行バンド内で横に並んだアイテムを分離（ベッド3つ等）

    thresh=240を使うことで、thresh=200では見えなかった細い隙間も検出可能。
    """
    c = content_mask(arr, y_start, y_end, x_start, x_end)

    # Level 1: 列グループ（全高さ）
    col_d = c.sum(axis=0)
    col_groups = find_bands(col_d, min_val=0, min_size=min_w)

    saved = []
    for cg0, cg1 in col_groups:
        col_strip = c[:, cg0:cg1]

        # Level 2: 行バンド（この列グループ内）
        row_d = col_strip.sum(axis=1)
        row_bands = find_bands(row_d, min_val=0, min_size=min_h)

        for rb0, rb1 in row_bands:
            cell = col_strip[rb0:rb1, :]

            # Level 3: 副列グループ（この行バンド内）
            cell_col_d = cell.sum(axis=0)
            sub_cols = find_bands(cell_col_d, min_val=0, min_size=min_w)

            for sc0, sc1 in sub_cols:
                ix0 = x_start + cg0 + sc0
                ix1 = x_start + cg0 + sc1
                iy0 = y_start + rb0
                iy1 = y_start + rb1
                fname = f"chip_{label}_{counter[0]:03d}.png"
                if save_tile(img, ix0, iy0, ix1, iy1, fname, out_dir, counter):
                    saved.append(fname)
    return saved


# ── メイン処理 ────────────────────────────────────────────────────────────────

def process():
    os.makedirs(OUT_DIR, exist_ok=True)

    if not os.path.exists(CHIP_PATH):
        print(f"SKIP: {CHIP_PATH} not found")
        return

    img = Image.open(CHIP_PATH).convert("RGB")
    arr = np.array(img)

    # 行セパレータ検出用マスク（左セクション: thresh=200）
    left_arr = arr[:, 9:497, :]
    left_white = (left_arr[:, :, 0] >= SEP_THRESH) & \
                 (left_arr[:, :, 1] >= SEP_THRESH) & \
                 (left_arr[:, :, 2] >= SEP_THRESH)
    row_w = left_white.mean(axis=1)
    row_sep_groups = find_sep_groups(row_w, thresh=SEP_FRAC)
    row_ranges = get_tile_ranges(row_sep_groups)

    counter = [0]
    total = 0

    # ── 左セクション ──────────────────────────────────────────────────────────
    print(f"左セクション: {len(row_ranges)} bands")
    for ri, (ry0, ry1) in enumerate(row_ranges):
        h = ry1 - ry0
        band_name = f"L{ri}"
        print(f"  band {ri}: y={ry0}..{ry1} (h={h})")

        if h > 150:
            # 複合バンド: 3段階コンテンツ検出
            saved = process_content_sprites(
                img, arr,
                x_start=9, x_end=497,
                y_start=ry0, y_end=ry1,
                label=band_name, out_dir=OUT_DIR, counter=counter,
                min_w=20, min_h=20
            )
        else:
            # 均一バンド: 白セパレータ線で列検出
            saved = process_left_uniform_band(
                img, arr, ry0, ry1, band_name, OUT_DIR, counter
            )
        print(f"    → {len(saved)} tiles")
        total += len(saved)

    # ── 右-左セクション (x=513..941): 木・草・小物 ───────────────────────────
    print(f"\n右-左セクション (x=513..941):")
    rl_arr = arr[:, 513:942, :]
    rl_white = (rl_arr[:, :, 0] >= SEP_THRESH) & \
               (rl_arr[:, :, 1] >= SEP_THRESH) & \
               (rl_arr[:, :, 2] >= SEP_THRESH)
    row_w_rl = rl_white.mean(axis=1)
    row_sep_rl = find_sep_groups(row_w_rl, thresh=SEP_FRAC)
    row_ranges_rl = get_tile_ranges(row_sep_rl)
    print(f"  {len(row_ranges_rl)} row bands")

    for ri, (ry0, ry1) in enumerate(row_ranges_rl):
        saved = process_content_sprites(
            img, arr,
            x_start=513, x_end=942,
            y_start=ry0, y_end=ry1,
            label=f"RL{ri}", out_dir=OUT_DIR, counter=counter,
            min_w=14, min_h=14
        )
        print(f"  band {ri} (y={ry0}..{ry1}): {len(saved)} sprites")
        total += len(saved)

    # ── 右-右セクション (x=960..1517): 建物・家具・ドア ──────────────────────
    print(f"\n右-右セクション (x=960..1517):")
    rr_arr = arr[:, 960:1517, :]
    rr_white = (rr_arr[:, :, 0] >= SEP_THRESH) & \
               (rr_arr[:, :, 1] >= SEP_THRESH) & \
               (rr_arr[:, :, 2] >= SEP_THRESH)
    row_w_rr = rr_white.mean(axis=1)
    row_sep_rr = find_sep_groups(row_w_rr, thresh=SEP_FRAC)
    row_ranges_rr = get_tile_ranges(row_sep_rr)
    print(f"  {len(row_ranges_rr)} row bands")

    for ri, (ry0, ry1) in enumerate(row_ranges_rr):
        saved = process_content_sprites(
            img, arr,
            x_start=960, x_end=1517,
            y_start=ry0, y_end=ry1,
            label=f"RR{ri}", out_dir=OUT_DIR, counter=counter,
            min_w=20, min_h=20
        )
        print(f"  band {ri} (y={ry0}..{ry1}): {len(saved)} sprites")
        total += len(saved)

    print(f"\nDone. {total} chip tiles saved to {OUT_DIR}")
    print(f"Total files: {len(sorted(os.listdir(OUT_DIR)))}")


if __name__ == "__main__":
    process()
