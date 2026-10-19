import json
import os
import colorsys
import numpy as np
from PIL import Image

SPRITE_DIR = r"tiles/sprites/mon1"

with open('all_monsters_verified.json', 'r', encoding='utf-8') as f:
    monsters = json.load(f)

# Families that already have separate tiles and images
SKIP_BASE_KINDS = {'mushroom', 'machodragon', 'manaEater'}

# Explicit exceptions based on verified level names
NAME_EXCEPTIONS = {
    'bat': {
        2: {'mode': 'blue_bat'},    # 青バット: cobalt blue wings + white belly
        3: {'mode': 'dark_red_eye'} # ゴルァバット: charcoal black wings + red eyes
    },
    'slime': {
        2: {'mode': 'green_slime'}, # 緑分裂スライム: vibrant emerald green
        3: {'mode': 'red_slime'}   # 赤分裂スライム: crimson red
    },
    'rustbug': {
        2: {'mode': 'red_rust'},   # 赤錆虫: reddish brown rust
        3: {'mode': 'corrosive'}   # 錆喰い蟲: dark corrosive crimson
    },
    'serpent': {
        2: {'mode': 'yellow'},      # スパークヘビ: electric amber/yellow
        3: {'mode': 'dark'}        # 暗黒ヘビ: obsidian pitch black
    },
    'gargoyle': {
        2: {'mode': 'dark'},       # 黒曜ガーゴイル: obsidian black
        3: {'mode': 'adamant'}     # アダマントガーゴイル: adamant crimson + gold
    },
    'stealthrower': {
        2: {'mode': 'dark'},       # 闇透破: dark ninja
        3: {'mode': 'dark'}        # 草: shadow grass ninja
    },
    'sleepingLion': {
        2: {'mode': 'lion_lv2'},   # 眠れる大獅子: golden lion
        3: {'mode': 'red'}         # 眠れる赤獅子: crimson mane
    }
}

def prefers_dark_for_lv3(mon):
    name = (mon.get('l3') or (mon.get('lv3') or {}).get('name') or '').lower()
    base = mon.get('baseKind', '').lower()
    dark_keywords = ['黒', '闇', 'ナイト', '冥', '死', '影', 'デス', 'アンデッド', 'ゴースト', '悪魔', 'デビル', 'シャドウ', '亡霊', 'スケルトン', '草']
    for kw in dark_keywords:
        if kw in name or kw in base:
            return True
    if mon.get('kind') == 'undead':
        return True
    return False

def process_sprite(tile, baseKind, kind, mon_info):
    src_path = os.path.join(SPRITE_DIR, f"tile_{tile}.png")
    if not os.path.exists(src_path):
        print(f"Skipping tile_{tile}: source file not found")
        return False
        
    img = Image.open(src_path).convert("RGBA")
    arr_orig = np.array(img, dtype=np.float32)
    h, w, _ = arr_orig.shape
    
    for level in (2, 3):
        out_path = os.path.join(SPRITE_DIR, f"tile_{tile}_lv{level}.png")
        arr = arr_orig.copy()
        
        # 1. Tiger (trapthrower: tile 149) - Dedicated smooth anti-aliased shift
        if baseKind == 'trapthrower':
            for y in range(h):
                for x in range(w):
                    if arr[y, x, 3] < 10:
                        continue
                    r, g, b = arr[y, x, :3] / 255.0
                    hh, ss, vv = colorsys.rgb_to_hsv(r, g, b)
                    
                    fur_factor = float(np.clip((vv - 0.22) / 0.28, 0.0, 1.0))
                    
                    if level == 2:
                        # White Tiger (白虎): Smooth desaturation of fur, keeping sharp dark stripes & outlines
                        if 0.04 <= hh <= 0.18:
                            new_h = 0.58 # Cool ice tint
                            new_s = ss * (1.0 - fur_factor * 0.88)
                            new_v = vv + (1.0 - vv) * 0.30 * fur_factor
                        else:
                            new_h = hh
                            new_s = ss * (1.0 - fur_factor * 0.80)
                            new_v = vv
                    elif level == 3:
                        # Crimson Tiger (紅蓮猛虎): Smooth hue shift to deep crimson
                        if 0.04 <= hh <= 0.18:
                            new_h = 0.005 # Crimson red
                            new_s = min(1.0, ss * 1.15)
                            new_v = vv
                        else:
                            new_h = hh
                            new_s = ss
                            new_v = vv
                            
                    nr, ng, nb = colorsys.hsv_to_rgb(new_h, new_s, new_v)
                    arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                    
            out_img = Image.fromarray(arr.astype(np.uint8))
            out_img.save(os.path.abspath(out_path))
            continue

        # 2. Golem (golem: tile 57 & timeoutPunisher) - Dedicated smooth metallic tone
        if baseKind in ('golem', 'timeoutPunisher'):
            for y in range(h):
                for x in range(w):
                    if arr[y, x, 3] < 10:
                        continue
                    r, g, b = arr[y, x, :3] / 255.0
                    hh, ss, vv = colorsys.rgb_to_hsv(r, g, b)
                    
                    if level == 2:
                        # Bronze / Antique Copper: smooth saturation enhancement
                        new_h = 0.105
                        new_s = min(0.70, ss * 2.8)
                        new_v = vv
                    elif level == 3:
                        # Obsidian Stone: smooth darkening
                        new_h = 0.65
                        new_s = ss * 0.40
                        new_v = 0.12 + (vv ** 1.35) * 0.35
                        
                    nr, ng, nb = colorsys.hsv_to_rgb(new_h, new_s, new_v)
                    arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                    
            out_img = Image.fromarray(arr.astype(np.uint8))
            out_img.save(os.path.abspath(out_path))
            continue

        # 3. Dragon (Red Dragon / Ancient Black-Gold Dragon)
        if baseKind == 'dragon':
            for y in range(h):
                for x in range(w):
                    if arr[y, x, 3] < 12:
                        continue
                    r, g, b = arr[y, x, :3] / 255.0
                    hh, ss, vv = colorsys.rgb_to_hsv(r, g, b)
                    if vv < 0.12: continue
                    
                    is_mouth = (50 <= y <= 58 and 42 <= x <= 54 and ss > 0.40)
                    in_crest = (12 <= y <= 45 and 40 <= x <= 62)
                    in_horn_l = (15 <= y <= 38 and 22 <= x <= 36)
                    in_horn_r = (15 <= y <= 38 and 64 <= x <= 78)
                    in_belly = (56 <= y <= 86 and 34 <= x <= 68)
                    in_claws = (y >= 82 and 30 <= x <= 80)
                    in_gold_region = (in_crest or in_horn_l or in_horn_r or in_belly or in_claws)

                    is_bh = False
                    if not is_mouth and in_gold_region:
                        if (0.055 <= hh <= 0.24 and vv > 0.35 and ss < 0.65):
                            is_bh = True
                        elif (ss < 0.30 and vv > 0.40):
                            is_bh = True

                    is_eye_area = (40 <= x <= 68 and 45 <= y <= 53)
                    if is_eye_area and ss < 0.15 and vv > 0.85:
                        arr[y, x, 0] = 255; arr[y, x, 1] = 255; arr[y, x, 2] = 255
                        continue

                    if is_bh:
                        if level == 2:
                            bh = 0.11; bs = min(0.40, ss * 0.9); bv = min(1.0, vv * 1.05)
                        elif level == 3:
                            bv = 0.50 + (vv ** 1.05) * 0.50
                            bs = 0.60 + (1.0 - vv) * 0.30
                            bh = 0.125
                        nr, ng, nb = colorsys.hsv_to_rgb(bh, min(1.0, bs), min(1.0, bv))
                        arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                        continue

                    if level == 2:
                        hh = 0.005; ss = min(1.0, ss * 1.25); vv = min(1.0, vv * 1.05)
                    elif level == 3:
                        if vv >= 0.88:
                            scale_v = 0.42 + (vv - 0.88) * 1.6
                            scale_s = 0.15
                            scale_h = 0.60
                        elif vv >= 0.60:
                            scale_v = 0.22 + (vv - 0.60) * 0.55
                            scale_s = 0.20
                            scale_h = 0.62
                        else:
                            scale_v = 0.13 + (vv / 0.60) * 0.10
                            scale_s = 0.24
                            scale_h = 0.65
                        hh, ss, vv = scale_h, scale_s, scale_v

                    nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
                    arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
            out_img = Image.fromarray(arr.astype(np.uint8))
            out_img.save(os.path.abspath(out_path))
            continue

        # 4. Ice Dragon
        if baseKind == 'icedragon':
            for y in range(h):
                for x in range(w):
                    if arr[y, x, 3] < 12:
                        continue
                    r, g, b = arr[y, x, :3] / 255.0
                    hh, ss, vv = colorsys.rgb_to_hsv(r, g, b)
                    if vv < 0.12: continue
                    
                    if x <= 38 and 0.49 <= hh <= 0.56 and y >= 34:
                        continue
                    is_ice_crystal_or_belly = (ss < 0.28 and vv > 0.65)
                    if is_ice_crystal_or_belly:
                        if level == 2:
                            hh = 0.55; ss = 0.10; vv = min(1.0, vv * 1.05)
                        elif level == 3:
                            hh = 0.68; ss = 0.08; vv = min(1.0, vv * 1.1)
                        nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
                        arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                        continue
                    if 38 < x < 48 and 53 < y < 63 and (hh < 0.05 or hh > 0.95) and ss > 0.4:
                        continue
                    if x > 68 and 18 <= y <= 65 and 0.50 <= hh <= 0.70 and ss < 0.45:
                        if level == 2:
                            hh = 0.56; ss = 0.35; vv = min(1.0, vv * 1.05)
                        elif level == 3:
                            hh = 0.60; ss = 0.45; vv = min(1.0, vv * 1.05)
                        nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
                        arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                        continue
                    if level == 2:
                        hh = 0.58; ss = min(1.0, ss * 1.25); vv = min(1.0, vv * 1.02)
                    elif level == 3:
                        hh = 0.62; ss = min(1.0, ss * 1.35); vv = min(1.0, vv * 0.95)
                        
                    nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
                    arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
            out_img = Image.fromarray(arr.astype(np.uint8))
            out_img.save(os.path.abspath(out_path))
            continue

        # 5. General monsters - Safe, smooth, non-destructive color shifts
        exc = NAME_EXCEPTIONS.get(baseKind, {}).get(level)
        is_dark_lv3 = (level == 3 and prefers_dark_for_lv3(mon_info))
        
        for y in range(h):
            for x in range(w):
                if arr[y, x, 3] < 12:
                    continue
                r, g, b = arr[y, x, :3] / 255.0
                hh, ss, vv = colorsys.rgb_to_hsv(r, g, b)
                
                # Dark outlines preserved 100%
                if vv < 0.12:
                    continue
                    
                # Metal / Blade preservation
                is_metal = (ss < 0.16 and vv > 0.35)
                if is_metal and kind in ('humanoid', 'undead'):
                    hh = 0.58; ss = 0.04; vv = min(1.0, vv * 1.05)
                    nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
                    arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                    continue
                    
                # Mouth / Tongue / Pink features
                is_mouth = ((hh < 0.05 or hh > 0.94) and ss > 0.40 and vv > 0.40)
                if is_mouth:
                    nr, ng, nb = colorsys.hsv_to_rgb(0.98, min(1.0, ss * 1.1), vv)
                    arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                    continue

                # Ivory / Cream belly & muzzle (Preserve soft highlights)
                is_ivory = (ss < 0.35 and vv > 0.60)
                if is_ivory:
                    if level == 2:
                        hh = 0.115; ss = min(0.20, ss * 0.50); vv = min(1.0, 0.88 + vv * 0.12)
                    elif level == 3:
                        if is_dark_lv3:
                            hh = 0.65; ss = 0.12; vv = min(1.0, vv * 1.05)
                        else:
                            hh = 0.02; ss = min(0.25, ss * 0.60); vv = min(1.0, 0.85 + vv * 0.15)
                    nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
                    arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                    continue

                # Clothing separation (Gentle, smooth)
                is_blue_purple = (0.50 <= hh <= 0.82 and ss > 0.25)
                is_red_cloth = ((hh <= 0.06 or hh >= 0.92) and ss > 0.35 and vv < 0.65)
                
                if exc:
                    mode = exc['mode']
                    if mode == 'green_slime':
                        hh = 0.33; ss = min(1.0, ss * 1.25); vv = min(1.0, vv * 1.1)
                    elif mode == 'red_slime':
                        hh = 0.00; ss = min(1.0, ss * 1.2); vv = min(1.0, vv * 1.05)
                    elif mode == 'red_rust':
                        hh = 0.04; ss = 0.85; vv = vv * 0.85
                    elif mode == 'corrosive':
                        hh = 0.01; ss = 0.95; vv = vv * 0.75
                    elif mode == 'dark':
                        ss = max(0.08, ss * 0.35)
                        vv = max(0.15, vv * 0.40)
                    elif mode == 'red':
                        hh = 0.01; ss = min(1.0, ss * 1.2); vv = min(1.0, vv * 1.0)
                    elif mode == 'yellow':
                        hh = 0.12; ss = min(1.0, ss * 1.2); vv = min(1.0, vv * 1.05)
                    elif mode == 'lion_lv2':
                        hh = 0.11; ss = min(1.0, ss * 1.25); vv = min(1.0, vv * 1.08)
                else:
                    if level == 2:
                        if is_blue_purple:
                            hh = 0.61; ss = min(0.85, max(0.55, ss * 1.15)); vv = vv * 0.85
                        elif is_red_cloth:
                            hh = 0.98; ss = min(0.90, max(0.60, ss * 1.1)); vv = vv * 0.88
                        else:
                            hh = 0.122; ss = min(1.0, ss * 1.20); vv = min(1.0, vv * 1.05)
                    elif level == 3:
                        if is_dark_lv3:
                            if is_blue_purple:
                                hh = 0.70; ss = 0.35; vv = vv * 0.50
                            else:
                                ss = max(0.08, ss * 0.28)
                                vv = max(0.14, vv * 0.38)
                        else:
                            if is_blue_purple:
                                if vv > 0.6: hh = 0.13; ss = 0.95; vv = min(1.0, vv * 1.1)
                                else: ss = 0.08; vv = vv * 0.40
                            else:
                                hh = 0.01; ss = min(1.0, ss * 1.2); vv = min(1.0, vv * 0.98)

                nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
                arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                
        out_img = Image.fromarray(arr.astype(np.uint8))
        out_img.save(os.path.abspath(out_path))

    return True

if __name__ == '__main__':
    count = 0
    for mon in monsters:
        baseKind = mon['baseKind']
        if baseKind in SKIP_BASE_KINDS:
            continue
        tile = mon['tile']
        kind = mon['kind']
        if process_sprite(tile, baseKind, kind, mon):
            count += 1

    print(f"\nSuccessfully re-generated level 2 and level 3 sprites for {count} monster families!")
