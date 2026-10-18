import json
import os
import colorsys
import numpy as np
from PIL import Image

SPRITE_DIR = r"tiles/sprites/mon1"

with open('monsters_data.json', 'r', encoding='utf-8') as f:
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
        3: {'mode': 'corrosive'}   # 腐食虫: dark corrosive crimson
    },
    'serpent': {
        2: {'mode': 'yellow'},      # 猛毒大蛇: warning amber/venom yellow
        3: {'mode': 'dark'}        # 暗黒ヘビ: obsidian pitch black
    },
    'trapthrower': {
        2: {'mode': 'yellow'},      # トラバサミ: warning amber yellow
        3: {'mode': 'gold'}        # ゴールドタイガー: shimmering bright gold
    },
    'gargoyle': {
        2: {'mode': 'dark'},       # 黒曜ガーゴイル: obsidian black
        3: {'mode': 'adamant'}     # アダマントガーゴイル: adamant crimson + gold
    },
    'stealthrower': {
        2: {'mode': 'dark'},       # 闇盗投士: dark ninja
        3: {'mode': 'dark'}        # 影盗投士: shadow dark ninja
    },
    'sleepingLion': {
        2: {'mode': 'yellow'},      # 黄金獅子
        3: {'mode': 'red'}         # 眠れる赤獅子: crimson mane
    }
}

def prefers_dark_for_lv3(mon):
    name = ((mon.get('lv3') or {}).get('name') or '').lower()
    base = mon.get('baseKind', '').lower()
    dark_keywords = ['黒', '闇', 'ナイト', '冥', '死', '影', 'デス', 'アンデッド', 'ゴースト', '悪魔', 'デビル', 'シャドウ', '亡霊', 'スケルトン']
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
        
        exc = NAME_EXCEPTIONS.get(baseKind, {}).get(level)
        is_dark_lv3 = (level == 3 and prefers_dark_for_lv3(mon_info))
        
        for y in range(h):
            for x in range(w):
                if arr[y, x, 3] < 12:
                    continue # transparent
                    
                r, g, b = arr[y, x, :3] / 255.0
                hh, ss, vv = colorsys.rgb_to_hsv(r, g, b)
                
                # 1. Outline protection
                if vv < 0.14:
                    continue
                    
                # 2. Skeleton specific handling
                if baseKind == 'skeleton':
                    if x <= 44 and y >= 45 and ss < 0.30 and vv > 0.35:
                        ss = 0.04
                        vv = min(1.0, vv * 1.1)
                    elif y >= 55 and (0.50 <= hh <= 0.75 or (0.08 <= hh <= 0.20 and ss > 0.5 and x >= 55)):
                        if level == 2:
                            if 0.50 <= hh <= 0.75:
                                hh = 0.0; ss = 0.85; vv = min(1.0, vv * 1.05)
                            elif 0.08 <= hh <= 0.20:
                                hh = 0.12; ss = 0.95
                        elif level == 3:
                            if 0.50 <= hh <= 0.75:
                                hh = 0.78; ss = 0.85; vv = vv * 0.75
                            elif 0.08 <= hh <= 0.20:
                                hh = 0.13; ss = 1.0; vv = min(1.0, vv * 1.1)
                    elif vv > 0.20:
                        if level == 2:
                            hh = 0.12; ss = 0.45; vv = min(1.0, vv * 1.05)
                        elif level == 3:
                            hh = 0.75; ss = 0.25; vv = max(0.14, vv * 0.35)
                            
                    nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
                    arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                    continue

                # 3. Bat specific handling
                if baseKind == 'bat':
                    is_eye = (0.08 <= hh <= 0.18 and ss > 0.5 and vv > 0.5)
                    is_wings = (0.60 <= hh <= 0.88 and ss > 0.2)
                    if is_eye:
                        if level == 2: hh = 0.14
                        elif level == 3: hh = 0.0; ss = 1.0; vv = 1.0
                    elif is_wings:
                        if level == 2: hh = 0.59; ss = 0.90; vv = min(1.0, vv * 1.1)
                        elif level == 3: ss = 0.15; vv = vv * 0.45
                    else:
                        if level == 2: hh = 0.55; ss = 0.20; vv = min(1.0, vv * 1.2)
                        elif level == 3: hh = 0.75; ss = 0.35; vv = vv * 0.55
                        
                    nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
                    arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                    continue

                # 4. Goblin specific handling
                if baseKind == 'goblin':
                    if 0.18 <= hh <= 0.42 and ss > 0.15:
                        if level == 2: hh = 0.12; ss = min(1.0, ss * 1.1); vv = min(1.0, vv * 1.05)
                        elif level == 3: hh = 0.01; ss = min(1.0, ss * 1.15); vv = min(1.0, vv * 0.95)
                    elif (hh < 0.10 or hh > 0.90) and ss > 0.3:
                        if level == 2: hh = 0.60; ss = 0.75; vv = vv * 0.75
                        elif level == 3:
                            if vv > 0.55: hh = 0.13; ss = 0.95; vv = min(1.0, vv * 1.1)
                            else: ss = 0.08; vv = vv * 0.4
                    elif x < 40 and y > 50 and 0.05 <= hh <= 0.16:
                        if level == 2: hh = 0.07; ss = 0.6; vv = vv * 0.7
                        elif level == 3: ss = 0.05; vv = min(1.0, vv * 1.1)
                        
                    nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
                    arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                    continue

                # 5. Dragon (Red Dragon / Ancient Black-Gold Dragon) dedicated handling
                if baseKind == 'dragon':
                    # Exclude mouth orange skin highlight
                    is_mouth = (50 <= y <= 58 and 42 <= x <= 54 and ss > 0.40)
                    
                    # Target regions for gold/belly/horn:
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

                    # Eye glint
                    is_eye_area = (40 <= x <= 68 and 45 <= y <= 53)
                    if is_eye_area and ss < 0.15 and vv > 0.85:
                        arr[y, x, 0] = 255; arr[y, x, 1] = 255; arr[y, x, 2] = 255
                        continue

                    if is_bh:
                        if level == 2:
                            # Level 2: Warm cream/amber belly & horn
                            bh = 0.11; bs = min(0.40, ss * 0.9); bv = min(1.0, vv * 1.05)
                        elif level == 3:
                            # Level 3: Radiant Imperial Gold (crest, horns, belly, claws)
                            bv = 0.50 + (vv ** 1.05) * 0.50
                            bs = 0.60 + (1.0 - vv) * 0.30
                            bh = 0.125
                        nr, ng, nb = colorsys.hsv_to_rgb(bh, min(1.0, bs), min(1.0, bv))
                        arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                        continue

                    if level == 2:
                        # Level 2 (Red Dragon): Rich crimson red
                        hh = 0.005; ss = min(1.0, ss * 1.25); vv = min(1.0, vv * 1.05)
                    elif level == 3:
                        # Level 3 (Ancient Black-Gold Dragon): Glossy obsidian with sharp contrast
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
                    continue

                # 6. Ice Dragon (Blue Dragon / Celestial Blue Dragon) dedicated handling
                if baseKind == 'icedragon':
                    # A. Ice Breath Effect: keep 100% original crystal ice breath!
                    if x <= 38 and 0.49 <= hh <= 0.56 and y >= 34:
                        continue
                    # B. Ice Horns, dorsal spikes, claws, belly scales (White / diamond ice crystals)
                    is_ice_crystal_or_belly = (ss < 0.28 and vv > 0.65)
                    if is_ice_crystal_or_belly:
                        if level == 2:
                            hh = 0.55; ss = 0.10; vv = min(1.0, vv * 1.05)
                        elif level == 3:
                            hh = 0.68; ss = 0.08; vv = min(1.0, vv * 1.1)
                        nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
                        arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                        continue
                    # C. Red mouth/tongue
                    if 38 < x < 48 and 53 < y < 63 and (hh < 0.05 or hh > 0.95) and ss > 0.4:
                        continue
                    # D. Wing membrane
                    if x > 68 and 18 <= y <= 65 and 0.50 <= hh <= 0.70 and ss < 0.45:
                        if level == 2:
                            hh = 0.56; ss = 0.35; vv = min(1.0, vv * 1.05)
                        elif level == 3:
                            hh = 0.60; ss = 0.45; vv = min(1.0, vv * 1.05)
                        nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
                        arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                        continue
                    # E. Body scales
                    if level == 2:
                        hh = 0.58; ss = min(1.0, ss * 1.25); vv = min(1.0, vv * 1.02)
                    elif level == 3:
                        hh = 0.62; ss = min(1.0, ss * 1.35); vv = min(1.0, vv * 0.95)
                        
                    nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
                    arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                    continue

                # 7. GENERAL SEGMENTATION FOR ALL OTHER MONSTERS:
                
                # A. Metal / Blade weapon protection
                is_metal = (ss < 0.18 and vv > 0.38)
                if is_metal and kind in ('humanoid', 'undead'):
                    if level == 3: vv = min(1.0, vv * 1.08)
                    nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
                    arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                    continue

                # B. Face / Flesh / Belly / Pink Skin protection
                is_flesh = (0.04 <= hh <= 0.14 and 0.15 <= ss <= 0.58 and vv > 0.65)
                if is_flesh and kind in ('beast', 'humanoid'):
                    if level == 2:
                        pass
                    elif level == 3:
                        ss = max(0.12, ss * 0.75)
                        vv = min(1.0, vv * 1.05)
                    nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
                    arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                    continue

                # C. Specific Named Exception handling
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
                    elif mode == 'gold':
                        hh = 0.12; ss = min(1.0, ss * 1.3); vv = min(1.0, vv * 1.15)
                    elif mode == 'adamant':
                        if vv > 0.65: hh = 0.13; ss = 0.95; vv = min(1.0, vv * 1.15)
                        else: hh = 0.01; ss = 0.85; vv = vv * 0.85
                    elif mode == 'dark':
                        ss = max(0.08, ss * 0.35)
                        vv = max(0.15, vv * 0.40)
                    elif mode == 'red':
                        hh = 0.01; ss = min(1.0, ss * 1.2); vv = min(1.0, vv * 1.0)
                    elif mode == 'yellow':
                        hh = 0.12; ss = min(1.0, ss * 1.2); vv = min(1.0, vv * 1.05)
                        
                    nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
                    arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                    continue

                # D. Body / Clothes General Transformation:
                if level == 2:
                    is_clothing = (0.50 <= hh <= 0.80 and ss > 0.3)
                    if is_clothing and kind == 'humanoid':
                        hh = 0.58; ss = min(1.0, ss * 1.1); vv = vv * 0.85
                    else:
                        hh = 0.125; ss = min(1.0, ss * 1.18); vv = min(1.0, vv * 1.06)
                elif level == 3:
                    if is_dark_lv3:
                        ss = max(0.08, ss * 0.28)
                        vv = max(0.14, vv * 0.38)
                    else:
                        is_clothing = (0.50 <= hh <= 0.80 and ss > 0.3)
                        if is_clothing and kind == 'humanoid':
                            if vv > 0.6: hh = 0.13; ss = 0.95; vv = min(1.0, vv * 1.1)
                            else: ss = 0.08; vv = vv * 0.4
                        else:
                            hh = 0.01; ss = min(1.0, ss * 1.2); vv = min(1.0, vv * 0.98)

                nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
                arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255

        out_img = Image.fromarray(arr.astype(np.uint8))
        abs_out = os.path.abspath(out_path)
        import time
        saved = False
        for attempt in range(5):
            try:
                out_img.save(abs_out)
                saved = True
                break
            except OSError:
                time.sleep(0.05)
        if not saved:
            out_img.save(abs_out)
        
    return True

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
