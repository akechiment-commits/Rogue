"""
スプライトシートから個別タイルを切り出して tiles/sprites/ に保存するスクリプト。
各シートごとに実際のスプライト位置をコンテンツ検出で特定し正確に切り出す。
"""

import os
import numpy as np
from PIL import Image

TILES_DIR = os.path.join(os.path.dirname(__file__), "tiles")
OUT_BASE   = os.path.join(TILES_DIR, "sprites")
CHARA_CELL = 418

MONSTER_SHEET_MAP = {
    77:  (0, 0),
    79:  (0, 1),
    93:  (0, 5),
    61:  (0, 6),
    52:  (1, 0),
    9:   (1, 1),
    10:  (1, 3),
    40:  (1, 5),
    81:  (1, 5),
    82:  (1, 5),
    83:  (1, 5),
    54:  (1, 5),
    111: (1, 5),
    15:  (1, 7),
    8:   (2, 0),
    11:  (2, 1),
    7:   (2, 2),
    56:  (2, 3),
    6:   (2, 7),
    67:  (3, 0),
    13:  (3, 4),
    76:  (3, 4),
    112: (4, 1),
    75:  (4, 2),
    12:  (4, 3),
    78:  (4, 5),
    108: (4, 6),
    14:  (6, 0),
    57:  (7, 0),
    68:  (7, 1),
    80:  (7, 2),
    37:  (9, 1),
    44:  (9, 1),
    55:  (9, 1),
    53:  (9, 3),
    58:  (9, 3),
    109: (9, 6),
    59:  (10, 0),
    39:  (10, 1),
    69:  (10, 2),
    70:  (10, 3),
    86:  (10, 3),
}

PLAYER_SHEET_MAP = {
    5:  (1, 1),
    33: (2, 1),
    34: (0, 1),
    35: (1, 0),
    36: (1, 2),
    62: (2, 2),
    63: (2, 0),
    64: (0, 2),
    65: (0, 0),
}

MONSTER_SHEETS = ['mon1', 'mon2', 'mon3', 'mon4', 'mon5', 'mon6']

# mon1基準のシート行中心y座標（行0〜10）
MON1_ROW_CENTERS = [65, 177, 292, 406, 515, 625, 740, 846, 945, 1042, 1166]

WHITE_THRESH = 210
MIN_SPRITE_W = 12
OUT_W, OUT_H = 130, 110
PAD = 5


def get_content_mask(arr):
    white = (arr[:, :, 0] >= WHITE_THRESH) & \
            (arr[:, :, 1] >= WHITE_THRESH) & \
            (arr[:, :, 2] >= WHITE_THRESH)
    return ~white


def find_sprite_ranges(col_density):
    """列密度からスプライトのx範囲リストを返す（細い区切り線を除外）"""
    sprites = []
    in_s = False
    sx = None
    n = len(col_density)
    for x in range(n):
        if col_density[x] > 0:
            if not in_s:
                sx = x
                in_s = True
        else:
            if in_s:
                if x - sx >= MIN_SPRITE_W:
                    sprites.append((sx, x))
                in_s = False
    if in_s and n - sx >= MIN_SPRITE_W:
        sprites.append((sx, n))
    return sprites


def detect_row_bands(content):
    """
    コンテンツ行バンドを検出して (y_start, y_end, center_y) のリストを返す。
    高さ > 10px かつ スプライト数 >= 2 のバンドのみ残す。
    """
    row_density = content.sum(axis=1)
    h = content.shape[0]
    bands = []
    in_c = False
    bs = None
    THRESH = 30  # 低めに設定して薄い行も拾う

    for y in range(h):
        if row_density[y] > THRESH:
            if not in_c:
                bs = y
                in_c = True
        else:
            if in_c:
                bands.append((bs, y))
                in_c = False
    if in_c:
        bands.append((bs, h))

    result = []
    for y0, y1 in bands:
        if y1 - y0 < 10:
            continue
        strip = content[y0:y1, :]
        col_d = strip.sum(axis=0)
        sprites = find_sprite_ranges(col_d)
        if len(sprites) >= 2:
            cy = (y0 + y1) // 2
            result.append((y0, y1, cy))

    return result


def get_col_centers_from_row(content, y0, y1):
    """指定行バンドのスプライトx中心位置リストを返す（左から右順）"""
    strip = content[y0:y1, :]
    col_d = strip.sum(axis=0)
    sprites = find_sprite_ranges(col_d)
    return [(sx + ex) // 2 for sx, ex in sprites]


def find_band_for_row(bands, row_idx, ref_centers=MON1_ROW_CENTERS):
    """
    sheet_row インデックスに対応するバンドを返す。
    バンド数 == 11 なら直接マッピング、それ以外はy中心の近傍マッチング。
    """
    if len(bands) == 0:
        return None
    if len(bands) >= 11:
        if row_idx < len(bands):
            return bands[row_idx]
        return None

    # y中心でmon1基準に最も近いバンドを選択
    if row_idx >= len(ref_centers):
        return None
    target_y = ref_centers[row_idx]
    best = min(bands, key=lambda b: abs(b[2] - target_y))
    # 許容距離 100px 以内のみ
    if abs(best[2] - target_y) > 100:
        return None
    return best


def find_sprite_bbox(content, y0, y1, target_x, col_centers):
    """
    指定バンド内で target_x に最も近いスプライトのBBoxを返す。
    col_centers は参照用（フォールバック検索に使用）。
    """
    strip = content[y0:y1, :]
    col_d = strip.sum(axis=0)
    sprites = find_sprite_ranges(col_d)
    if not sprites:
        return None

    # target_x に最も近いスプライトを選択
    best = min(sprites, key=lambda s: abs((s[0] + s[1]) // 2 - target_x))
    cx = (best[0] + best[1]) // 2
    if abs(cx - target_x) > 130:  # 許容距離 130px
        return None

    sx, ex = best
    # y方向のコンテンツBBoxを取得
    region = content[y0:y1, sx:ex]
    rows_any = region.any(axis=1)
    if not rows_any.any():
        return None
    ry0 = np.where(rows_any)[0][0]
    ry1 = np.where(rows_any)[0][-1] + 1
    return (sx, y0 + ry0, ex, y0 + ry1)


def cut_to_canvas(img, bbox, out_w=OUT_W, out_h=OUT_H, pad=PAD):
    """BBoxをパディング付きでクロップし固定サイズのRGBAキャンバスに中央配置"""
    ax0, ay0, ax1, ay1 = bbox
    ax0 = max(0, ax0 - pad)
    ay0 = max(0, ay0 - pad)
    ax1 = min(img.width, ax1 + pad)
    ay1 = min(img.height, ay1 + pad)

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
    canvas.paste(sprite, ((out_w - sw) // 2, (out_h - sh) // 2))
    return canvas


def process_monster_sheet(sheet_name, out_dir):
    mon_path = os.path.join(TILES_DIR, f"{sheet_name}.png")
    if not os.path.exists(mon_path):
        print(f"  SKIP: {mon_path} not found")
        return 0

    img = Image.open(mon_path).convert("RGBA")
    arr = np.array(img)
    content = get_content_mask(arr)

    row_bands = detect_row_bands(content)
    print(f"  {sheet_name}: {len(row_bands)} content rows")

    # カラム基準位置の決定: 9-10スプライトを持つ最初の行を使う
    # (マージされた行や異常な行を避けるため)
    col_centers = []
    ref_band = None
    for band in row_bands:
        centers = get_col_centers_from_row(content, band[0], band[1])
        if 9 <= len(centers) <= 10:
            col_centers = centers
            ref_band = band
            break
    if not col_centers:
        # フォールバック: 最もスプライト数が多い行
        ref_band = max(row_bands, key=lambda b: len(
            find_sprite_ranges(content[b[0]:b[1], :].sum(axis=0))
        ))
        col_centers = get_col_centers_from_row(content, ref_band[0], ref_band[1])
    print(f"  {len(col_centers)} cols from row y={ref_band[0]}..{ref_band[1]}: {col_centers}")

    saved = 0
    missing = []
    for tile_id, (sheet_row, sheet_col) in MONSTER_SHEET_MAP.items():
        band = find_band_for_row(row_bands, sheet_row)
        if band is None:
            missing.append((tile_id, sheet_row, sheet_col, "no_band"))
            continue
        if sheet_col >= len(col_centers):
            missing.append((tile_id, sheet_row, sheet_col, "col_oob"))
            continue

        y0, y1, _ = band
        target_x = col_centers[sheet_col]
        bbox = find_sprite_bbox(content, y0, y1, target_x, col_centers)
        if bbox is None:
            missing.append((tile_id, sheet_row, sheet_col, "no_bbox"))
            continue

        canvas = cut_to_canvas(img, bbox)
        out_path = os.path.join(out_dir, f"tile_{tile_id}.png")
        canvas.save(out_path, "PNG")
        saved += 1

    if missing:
        print(f"  WARNING: {len(missing)} missing: {missing[:3]}...")

    return saved


def process_chara_sheet(out_dir, img):
    if img is None:
        return 0
    arr = np.array(img)
    content = get_content_mask(arr)
    saved = 0
    for tile_id, (row, col) in PLAYER_SHEET_MAP.items():
        x0, y0 = col * CHARA_CELL, row * CHARA_CELL
        x1, y1 = x0 + CHARA_CELL, y0 + CHARA_CELL
        region = content[y0:y1, x0:x1]
        rows_any = region.any(axis=1)
        cols_any = region.any(axis=0)
        if rows_any.any() and cols_any.any():
            ry0 = np.where(rows_any)[0][0]
            ry1 = np.where(rows_any)[0][-1] + 1
            cx0 = np.where(cols_any)[0][0]
            cx1 = np.where(cols_any)[0][-1] + 1
            bbox = (x0 + cx0, y0 + ry0, x0 + cx1, y0 + ry1)
        else:
            bbox = (x0, y0, x1, y1)
        canvas = cut_to_canvas(img, bbox)
        out_path = os.path.join(out_dir, f"tile_{tile_id}.png")
        canvas.save(out_path, "PNG")
        saved += 1
    return saved


def process():
    chara_path = os.path.join(TILES_DIR, "chara1.png")
    chara_img = Image.open(chara_path).convert("RGBA") if os.path.exists(chara_path) else None

    total = 0
    for sheet_name in MONSTER_SHEETS:
        out_dir = os.path.join(OUT_BASE, sheet_name)
        os.makedirs(out_dir, exist_ok=True)
        print(f"\nProcessing {sheet_name}...")
        saved = process_monster_sheet(sheet_name, out_dir)
        saved += process_chara_sheet(out_dir, chara_img)
        print(f"  → {saved} sprites saved")
        total += saved

    print(f"\nDone. {total} files total.")


if __name__ == "__main__":
    process()
