import json
import base64
import os

ARTIFACT_DIR = r"C:\Users\guile\.gemini\antigravity\brain\a36f57b3-0530-4fa6-b476-65ab15b9454e"
SPRITE_DIR = r"tiles/sprites/mon1"

with open('all_monsters_verified.json', 'r', encoding='utf-8') as f:
    monsters = json.load(f)

def get_b64(tile, lvl, baseKind):
    if baseKind == 'mushroom':
        t_id = {1: 238, 2: 239, 3: 240}.get(lvl, 238)
        p = os.path.join(SPRITE_DIR, f"tile_{t_id}.png")
    elif baseKind == 'machodragon':
        t_id = {1: 241, 2: 242, 3: 243}.get(lvl, 241)
        p = os.path.join(SPRITE_DIR, f"tile_{t_id}.png")
    elif baseKind == 'manaEater':
        t_id = {1: 244, 2: 245, 3: 246}.get(lvl, 244)
        p = os.path.join(SPRITE_DIR, f"tile_{t_id}.png")
    else:
        if lvl == 1:
            p = os.path.join(SPRITE_DIR, f"tile_{tile}.png")
        else:
            p = os.path.join(SPRITE_DIR, f"tile_{tile}_lv{lvl}.png")
    if os.path.exists(p):
        with open(p, 'rb') as f_img:
            return 'data:image/png;base64,' + base64.b64encode(f_img.read()).decode('ascii')
    return ''

html = """<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>ローグ2 全84系列モンスター レベル別グラフィック完全カタログ</title>
<style>
body { background: #121418; color: #e0e0e6; font-family: 'Segoe UI', Meiryo, sans-serif; margin: 0; padding: 20px; }
h1 { color: #f5f5fa; text-align: center; margin-bottom: 8px; font-size: 26px; }
.subtitle { text-align: center; color: #9aa0a6; margin-bottom: 24px; font-size: 14px; }
.controls { display: flex; justify-content: center; gap: 15px; margin-bottom: 20px; }
input[type="text"] { padding: 8px 16px; border-radius: 6px; border: 1px solid #3c4043; background: #202124; color: #fff; width: 340px; font-size: 14px; }
.monster-grid { display: flex; flex-direction: column; gap: 10px; max-width: 1100px; margin: 0 auto; }
.monster-card { display: grid; grid-template-columns: 180px 1fr 1fr 1fr; background: #1e2026; border-radius: 8px; border: 1px solid #2d3139; overflow: hidden; align-items: center; padding: 8px 16px; }
.monster-card:hover { border-color: #5f6368; background: #252830; }
.meta { display: flex; flex-direction: column; gap: 4px; }
.meta-no { font-size: 16px; font-weight: bold; color: #fbbc04; }
.meta-kind { font-size: 13px; color: #bdc1c6; }
.meta-tile { font-size: 12px; color: #80868b; }
.lvl-col { display: flex; align-items: center; gap: 12px; padding: 6px; border-radius: 6px; }
.lvl-1 { background: rgba(52, 168, 83, 0.08); border-left: 3px solid #34a853; }
.lvl-2 { background: rgba(251, 188, 4, 0.08); border-left: 3px solid #fbbc04; }
.lvl-3 { background: rgba(234, 67, 53, 0.08); border-left: 3px solid #ea4335; }
.sprite-box { width: 64px; height: 64px; background: #15161a; border-radius: 6px; display: flex; align-items: center; justify-content: center; border: 1px solid #33363f; }
.sprite-box img { max-width: 60px; max-height: 60px; image-rendering: pixelated; }
.lvl-info { display: flex; flex-direction: column; }
.lvl-tag { font-size: 11px; font-weight: bold; }
.lvl-1 .lvl-tag { color: #81c995; }
.lvl-2 .lvl-tag { color: #fdd663; }
.lvl-3 .lvl-tag { color: #f28b82; }
.lvl-name { font-size: 13px; font-weight: bold; color: #e8eaed; }
</style>
</head>
<body>
<h1>ローグ2 全84系列モンスター レベル別グラフィック完全カタログ</h1>
<div class="subtitle">虎（白虎・黒虎）、ゴーレム（青銅・黒曜石×紅蓮コア）、中級Lv2の部位別アクセント（クリーム白腹・濃紺衣服・白銀武器）反映版</div>
<div class="controls">
<input type="text" id="search" placeholder="モンスター名・種族名・タイルIDで検索..." oninput="filterMonsters()">
</div>
<div class="monster-grid" id="grid">
"""

for i, m in enumerate(monsters):
    l1 = m.get('l1') or m.get('name') or ''
    l2 = m.get('l2') or (m.get('lv2') or {}).get('name') or ''
    l3 = m.get('l3') or (m.get('lv3') or {}).get('name') or ''
    b1 = get_b64(m['tile'], 1, m['baseKind'])
    b2 = get_b64(m['tile'], 2, m['baseKind'])
    b3 = get_b64(m['tile'], 3, m['baseKind'])
    
    html += f"""
<div class="monster-card" data-text="{m['baseKind']} {m['tile']} {l1} {l2} {l3}">
  <div class="meta">
    <span class="meta-no">No.{i+1:02d}</span>
    <span class="meta-kind">{m['baseKind']}</span>
    <span class="meta-tile">Tile: {m['tile']} ({m.get('kind', '')})</span>
  </div>
  <div class="lvl-col lvl-1">
    <div class="sprite-box"><img src="{b1}"></div>
    <div class="lvl-info"><span class="lvl-tag">Lv1 基本</span><span class="lvl-name">{l1}</span></div>
  </div>
  <div class="lvl-col lvl-2">
    <div class="sprite-box"><img src="{b2}"></div>
    <div class="lvl-info"><span class="lvl-tag">Lv2 中級</span><span class="lvl-name">{l2}</span></div>
  </div>
  <div class="lvl-col lvl-3">
    <div class="sprite-box"><img src="{b3}"></div>
    <div class="lvl-info"><span class="lvl-tag">Lv3 最上位</span><span class="lvl-name">{l3}</span></div>
  </div>
</div>"""

html += """
</div>
<script>
function filterMonsters() {
  const query = document.getElementById('search').value.toLowerCase();
  const cards = document.querySelectorAll('.monster-card');
  cards.forEach(card => {
    const text = card.getAttribute('data-text').toLowerCase();
    card.style.display = text.includes(query) ? 'grid' : 'none';
  });
}
</script>
</body>
</html>"""

out_path = os.path.join(ARTIFACT_DIR, 'all_monsters_catalog.html')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(html)
print(f"HTML catalog saved to {out_path}")
