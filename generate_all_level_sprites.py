import json
import os
import colorsys
import numpy as np
from PIL import Image

SPRITE_DIR = r"tiles/sprites/mon1"

with open('scratch_monsters_analysis.json', 'r', encoding='utf-8') as f:
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
    'dragon': {
        2: {'mode': 'red'},        # レッドドラゴン: deep vibrant red
        3: {'mode': 'dark_dragon'} # 暗黒竜: dark charcoal black
    },
    'icedragon': {
        2: {'mode': 'blue_dragon'}, # ブルードラゴン: brilliant azure blue
        3: {'mode': 'gold_cyan'}    # 天界の七竜: celestial gold & cyan
    },
    'sleepingLion': {
        2: {'mode': 'yellow'},      # 黄金獅子
        3: {'mode': 'red'}         # 眠れる赤獅子: crimson mane
    }
}

def prefers_dark_for_lv3(mon):
    name = (mon.get('lv3', {}).get('name') or '').lower()
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
                if vv < 0.16:
                    continue
                    
                # 2. Skeleton specific handling
                if baseKind == 'skeleton':
                    # Sword blade: x <= 44, y >= 45, low saturation metallic
                    if x <= 44 and y >= 45 and ss < 0.30 and vv > 0.35:
                        ss = 0.04
                        vv = min(1.0, vv * 1.1)
                    # Shield: y >= 55
                    elif y >= 55 and (0.50 <= hh <= 0.75 or (0.08 <= hh <= 0.20 and ss > 0.5 and x >= 55)):
                        if level == 2:
                            if 0.50 <= hh <= 0.75: # board -> crimson red
                                hh = 0.0; ss = 0.85; vv = min(1.0, vv * 1.05)
                            elif 0.08 <= hh <= 0.20: # cross -> gold
                                hh = 0.12; ss = 0.95
                        elif level == 3:
                            if 0.50 <= hh <= 0.75: # board -> royal purple
                                hh = 0.78; ss = 0.85; vv = vv * 0.75
                            elif 0.08 <= hh <= 0.20: # cross -> bright gold
                                hh = 0.13; ss = 1.0; vv = min(1.0, vv * 1.1)
                    # Bones: entire skull and body bones
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
                        if level == 2: hh = 0.59; ss = 0.90; vv = min(1.0, vv * 1.1) # blue wings
                        elif level == 3: ss = 0.15; vv = vv * 0.45 # charcoal wings
                    else: # belly
                        if level == 2: hh = 0.55; ss = 0.20; vv = min(1.0, vv * 1.2) # white/pale belly
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

                # 5. GENERAL SEGMENTATION FOR ALL OTHER MONSTERS:
                
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

                # C. Glowing Eyes / Gems
                is_eye_gem = (ss > 0.70 and vv > 0.80 and (0.05 <= hh <= 0.20 or 0.45 <= hh <= 0.65))
                if is_eye_gem and y < h * 0.55:
                    if level == 2:
                        hh = 0.13
                    elif level == 3:
                        hh = 0.0; ss = 1.0; vv = 1.0
                    nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
                    arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                    continue

                # D. Specific Named Exception handling
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
                    elif mode == 'blue_dragon':
                        hh = 0.60; ss = min(1.0, ss * 1.2); vv = min(1.0, vv * 1.1)
                    elif mode == 'gold_cyan':
                        if vv > 0.6: hh = 0.13; ss = 0.95; vv = min(1.0, vv * 1.15)
                        else: hh = 0.52; ss = 0.75
                    elif mode == 'gold':
                        hh = 0.12; ss = min(1.0, ss * 1.3); vv = min(1.0, vv * 1.15)
                    elif mode == 'adamant':
                        if vv > 0.65: hh = 0.13; ss = 0.95; vv = min(1.0, vv * 1.15)
                        else: hh = 0.01; ss = 0.85; vv = vv * 0.85
                    elif mode == 'dark' or mode == 'dark_dragon':
                        ss = max(0.08, ss * 0.35)
                        vv = max(0.15, vv * 0.40)
                    elif mode == 'red':
                        hh = 0.01; ss = min(1.0, ss * 1.2); vv = min(1.0, vv * 1.0)
                    elif mode == 'yellow':
                        hh = 0.12; ss = min(1.0, ss * 1.2); vv = min(1.0, vv * 1.05)
                        
                    nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
                    arr[y, x, 0] = nr * 255; arr[y, x, 1] = ng * 255; arr[y, x, 2] = nb * 255
                    continue

                # E. Body / Clothes General Transformation:
                if level == 2:
                    is_clothing = (0.50 <= hh <= 0.80 and ss > 0.3)
                    if is_clothing and kind == 'humanoid':
                        hh = 0.58; ss = min(1.0, ss * 1.1); vv = vv * 0.85
                    else:
                        hh = 0.125; ss = min(1.0, ss * 1.18); vv = min(1.0, vv * 1.06)
                elif level == 3:
                    if is_dark_lv3:
                        if vv > 0.75 and ss > 0.4:
                            hh = 0.00; ss = 1.0; vv = 1.0
                        else:
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
        out_img.save(out_path)
        
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

print(f"\nSuccessfully generated level 2 and level 3 sprites for {count} monster families!")
