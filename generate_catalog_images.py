import json
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ARTIFACT_DIR = r"C:\Users\guile\.gemini\antigravity\brain\a36f57b3-0530-4fa6-b476-65ab15b9454e"
SPRITE_DIR = r"tiles/sprites/mon1"

with open('all_monsters_verified.json', 'r', encoding='utf-8') as f:
    monsters = json.load(f)

# Fonts
FONT_PATH = r"C:\Windows\Fonts\meiryo.ttc"
font_title = ImageFont.truetype(FONT_PATH, 24)
font_header = ImageFont.truetype(FONT_PATH, 16)
font_label = ImageFont.truetype(FONT_PATH, 13)
font_sub = ImageFont.truetype(FONT_PATH, 11)

def get_sprite_image(tile, level, baseKind):
    # Special base kinds with dedicated tile IDs
    if baseKind == 'mushroom':
        t_id = {1: 238, 2: 239, 3: 240}.get(level, 238)
        p = os.path.join(SPRITE_DIR, f"tile_{t_id}.png")
    elif baseKind == 'machodragon':
        t_id = {1: 241, 2: 242, 3: 243}.get(level, 241)
        p = os.path.join(SPRITE_DIR, f"tile_{t_id}.png")
    elif baseKind == 'manaEater':
        t_id = {1: 244, 2: 245, 3: 246}.get(level, 244)
        p = os.path.join(SPRITE_DIR, f"tile_{t_id}.png")
    else:
        if level == 1:
            p = os.path.join(SPRITE_DIR, f"tile_{tile}.png")
        else:
            p = os.path.join(SPRITE_DIR, f"tile_{tile}_lv{level}.png")
            
    if os.path.exists(p):
        return Image.open(p).convert("RGBA")
    return None

def generate_part(sub_monsters, start_idx, part_num, total_parts):
    row_height = 80
    header_height = 80
    col_w_info = 190
    col_w_sprite = 230
    total_w = col_w_info + col_w_sprite * 3 + 40
    total_h = header_height + len(sub_monsters) * row_height + 40
    
    img = Image.new("RGBA", (total_w, total_h), (22, 24, 29, 255))
    draw = ImageDraw.Draw(img)
    
    # Title Banner
    draw.rectangle([0, 0, total_w, header_height], fill=(30, 33, 40, 255))
    title_text = f"ローグ2 全84系列モンスター レベル別グラフィック一覧 (Part {part_num}/{total_parts}: No.{start_idx:02d}〜No.{start_idx+len(sub_monsters)-1:02d})"
    draw.text((20, 15), title_text, fill=(240, 240, 245, 255), font=font_title)
    
    # Column Headers
    y_hdr = 50
    draw.text((20, y_hdr), "No. / 種族 / タイルID", fill=(170, 180, 200, 255), font=font_header)
    draw.text((col_w_info + 20, y_hdr), "【Lv1】 基本形態", fill=(120, 210, 150, 255), font=font_header)
    draw.text((col_w_info + col_w_sprite + 20, y_hdr), "【Lv2】 中級（新・部位別アクセント）", fill=(255, 215, 80, 255), font=font_header)
    draw.text((col_w_info + col_w_sprite * 2 + 20, y_hdr), "【Lv3】 最上位（漆黒/真紅/特化）", fill=(255, 110, 110, 255), font=font_header)
    
    draw.line([(0, header_height), (total_w, header_height)], fill=(50, 55, 65, 255), width=2)
    
    for i, mon in enumerate(sub_monsters):
        y = header_height + i * row_height
        bg_col = (26, 28, 34, 255) if i % 2 == 0 else (22, 24, 29, 255)
        draw.rectangle([0, y, total_w, y + row_height], fill=bg_col)
        draw.line([(0, y + row_height), (total_w, y + row_height)], fill=(38, 42, 50, 255), width=1)
        
        # Info Column
        num_str = f"No.{start_idx + i:02d}"
        kind_str = f"{mon['baseKind']} ({mon.get('kind', '')})"
        tile_str = f"Tile: {mon['tile']}"
        draw.text((20, y + 14), num_str, fill=(255, 215, 0, 255), font=font_label)
        draw.text((20, y + 34), kind_str, fill=(180, 190, 205, 255), font=font_sub)
        draw.text((20, y + 50), tile_str, fill=(130, 140, 155, 255), font=font_sub)
        
        # Level Sprites (1, 2, 3)
        for lvl in (1, 2, 3):
            x_col = col_w_info + (lvl - 1) * col_w_sprite + 10
            sp = get_sprite_image(mon['tile'], lvl, mon['baseKind'])
            
            # Name
            if lvl == 1:
                name = mon.get('l1') or mon.get('name') or ''
                name_col = (200, 230, 200, 255)
            elif lvl == 2:
                name = mon.get('l2') or (mon.get('lv2') or {}).get('name') or ''
                name_col = (255, 230, 140, 255)
            else:
                name = mon.get('l3') or (mon.get('lv3') or {}).get('name') or ''
                name_col = (255, 170, 170, 255)
                
            # Thumbnail container
            box_x = x_col + 5
            box_y = y + 8
            box_w = 64
            box_h = 64
            draw.rectangle([box_x, box_y, box_x + box_w, box_y + box_h], fill=(16, 17, 20, 255), outline=(45, 50, 60, 255))
            
            if sp:
                # Resize keeping aspect ratio to fit 60x60
                sp_thumb = sp.copy()
                sp_thumb.thumbnail((58, 58), Image.Resampling.LANCZOS)
                tw, th = sp_thumb.size
                paste_x = box_x + (box_w - tw) // 2
                paste_y = box_y + (box_h - th) // 2
                img.paste(sp_thumb, (paste_x, paste_y), sp_thumb)
                
            draw.text((box_x + box_w + 10, y + 25), f"Lv{lvl}: {name}", fill=name_col, font=font_label)
            
    out_name = f"all_monsters_catalog_part{part_num}.png"
    out_path = os.path.join(ARTIFACT_DIR, out_name)
    img.save(out_path)
    print(f"Saved: {out_path}")

# Split into 3 parts
part_size = 28
for p in range(3):
    start = p * part_size
    end = min(len(monsters), (p + 1) * part_size)
    generate_part(monsters[start:end], start + 1, p + 1, 3)

print("All 3 catalog images generated successfully!")
