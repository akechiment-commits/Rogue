"""
スプライトシートから個別タイルを切り出して tiles/sprites/ に保存するスクリプト。
各スタイル(mon1-6)ごとにサブディレクトリを作成し、tile_<id>.png として保存する。
"""

import os
from PIL import Image

TILES_DIR = os.path.join(os.path.dirname(__file__), "tiles")
OUT_BASE   = os.path.join(TILES_DIR, "sprites")

MON_CELL  = 114
CHARA_CELL = 418

# tilesetMap.js と同じマッピング
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

def cut_sprite(sheet_img, row, col, cell):
    x = col * cell
    y = row * cell
    return sheet_img.crop((x, y, x + cell, y + cell))

def process():
    # chara1.png を一度だけ読む
    chara_path = os.path.join(TILES_DIR, "chara1.png")
    chara_img = Image.open(chara_path).convert("RGBA") if os.path.exists(chara_path) else None

    for sheet_name in MONSTER_SHEETS:
        mon_path = os.path.join(TILES_DIR, f"{sheet_name}.png")
        if not os.path.exists(mon_path):
            print(f"SKIP: {mon_path} not found")
            continue

        out_dir = os.path.join(OUT_BASE, sheet_name)
        os.makedirs(out_dir, exist_ok=True)

        mon_img = Image.open(mon_path).convert("RGBA")
        print(f"Processing {sheet_name}.png ({mon_img.size}) → {out_dir}/")

        # モンスター切り出し
        for tile_id, (row, col) in MONSTER_SHEET_MAP.items():
            sprite = cut_sprite(mon_img, row, col, MON_CELL)
            out_path = os.path.join(out_dir, f"tile_{tile_id}.png")
            sprite.save(out_path, "PNG")

        # プレイヤー切り出し (chara1 は共通)
        if chara_img:
            for tile_id, (row, col) in PLAYER_SHEET_MAP.items():
                sprite = cut_sprite(chara_img, row, col, CHARA_CELL)
                out_path = os.path.join(out_dir, f"tile_{tile_id}.png")
                sprite.save(out_path, "PNG")

        total = len(MONSTER_SHEET_MAP) + (len(PLAYER_SHEET_MAP) if chara_img else 0)
        print(f"  → {total} sprites saved")

    print("Done.")

if __name__ == "__main__":
    process()
