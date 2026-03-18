#!/usr/bin/env node
/**
 * タイル切り出しスクリプト（APIなし版）
 * 448a28beb468-20211216.png (384x384, 32x32タイル, 12x12グリッド) から
 * 目視で特定したタイルを ./tiles/{name}.png に切り出す
 *
 * 使い方: node tools/cut-tiles.mjs [tileset.png] [tile_size=32]
 */

import { createCanvas, loadImage } from 'canvas';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC    = process.argv[2] ?? path.join(ROOT, '448a28beb468-20211216.png');
const TSIZE  = parseInt(process.argv[3] ?? '32', 10);
const OUTDIR = path.join(ROOT, 'tiles');

/* ================================================================
 * 目視マッピング (row, col) — 0始まり
 * 画像: 384x384px / 32px タイル / 12列×12行
 * ================================================================ */
const MAPPING = {
  // ── 地形 ──
  wall:              { row: 2, col: 0 },   // 蔦の絡まった壁柱
  floor:             { row: 2, col: 2 },   // 割れた石畳
  corridor:          { row: 2, col: 1 },   // 蔦壁（通路代用）
  spring:            { row: 1, col: 6 },   // 石の井戸

  // ── プレイヤー（全方向同一タイル） ──
  player:            { row: 2, col: 4 },
  player_down:       { row: 2, col: 4 },
  player_up:         { row: 2, col: 4 },
  player_left:       { row: 2, col: 4 },
  player_right:      { row: 2, col: 4 },
  player_down_left:  { row: 2, col: 4 },
  player_down_right: { row: 2, col: 4 },
  player_up_left:    { row: 2, col: 4 },
  player_up_right:   { row: 2, col: 4 },

  // ── 敵モンスター ──
  zombie:            { row: 2, col: 3 },   // 両腕広げたシルエット
  goblin:            { row: 2, col: 5 },   // 小型シルエット
  skeleton:          { row: 2, col: 3 },
  orc:               { row: 2, col: 3 },
  troll:             { row: 2, col: 3 },
  dragon:            { row: 2, col: 3 },
  vampire:           { row: 2, col: 5 },
  archer:            { row: 2, col: 5 },
  wizard:            { row: 2, col: 5 },
  imp:               { row: 2, col: 5 },
  gargoyle:          { row: 2, col: 3 },
  wolf:              { row: 2, col: 5 },
  golem:             { row: 2, col: 3 },
  demon:             { row: 2, col: 3 },
  shaman:            { row: 2, col: 5 },
  wind_mage:         { row: 2, col: 5 },
  firedemon:         { row: 2, col: 3 },
  witchdoctor:       { row: 2, col: 5 },
  rockspirit:        { row: 2, col: 3 },
  rat:               { row: 2, col: 5 },
  kobold:            { row: 2, col: 5 },
  snake:             { row: 2, col: 5 },

  // ── NPC ──
  shopkeeper:        { row: 2, col: 4 },
  guard:             { row: 2, col: 4 },

  // ── アイテム ──
  weapon:            { row: 1, col: 7 },   // 交差した剣/斧
  pot:               { row: 0, col: 10 },  // 茶色の壺
  bigbox:            { row: 0, col: 8 },   // 木箱・宝箱
  gold:              { row: 0, col: 9 },   // 小箱（金貨代用）
  food:              { row: 2, col: 6 },   // 野菜畑（食料代用）
  potion:            { row: 1, col: 5 },   // 吊り下がった容器（薬瓶代用）
  potion2:           { row: 1, col: 5 },
  scroll:            { row: 0, col: 7 },   // 木製十字（巻物代用）
  armor:             { row: 0, col: 4 },   // 黒い砲台（防具代用）
  arrow:             { row: 1, col: 7 },   // 武器と同じ
  wand:              { row: 0, col: 5 },   // 黒い筒（杖代用）
  ring:              { row: 0, col: 6 },   // 小さい丸いもの（指輪代用）
  magic_marker:      { row: 0, col: 5 },
  spellbook:         { row: 0, col: 7 },

  // ── 罠（全部同じタイル） ──
  trap_mine:         { row: 0, col: 4 },
  trap_arrow:        { row: 1, col: 7 },
  trap_pit:          { row: 2, col: 2 },
  trap_rust:         { row: 0, col: 5 },
  trap_spin:         { row: 0, col: 6 },
  trap_sleep:        { row: 0, col: 6 },
  trap_poison_arrow: { row: 1, col: 7 },
  trap_summon:       { row: 0, col: 4 },
  trap_slow:         { row: 0, col: 6 },
  trap_seal:         { row: 0, col: 7 },
  trap_steal:        { row: 0, col: 9 },
  trap_hunger:       { row: 2, col: 6 },
  trap_blowback:     { row: 0, col: 4 },

  // ── 階段（十字/墓石代用） ──
  stairs_down:       { row: 0, col: 7 },
  stairs_up:         { row: 0, col: 7 },
};

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`エラー: ファイルが見つかりません → ${SRC}`);
    process.exit(1);
  }

  const img  = await loadImage(SRC);
  const cols = Math.floor(img.width  / TSIZE);
  const rows = Math.floor(img.height / TSIZE);
  console.log(`タイルセット: ${img.width}×${img.height}px → ${cols}列×${rows}行（各${TSIZE}px）`);

  const src = createCanvas(img.width, img.height);
  src.getContext('2d').drawImage(img, 0, 0);

  fs.mkdirSync(OUTDIR, { recursive: true });

  let saved = 0, skipped = 0;
  for (const [name, pos] of Object.entries(MAPPING)) {
    const { row: r, col: c } = pos;
    if (r < 0 || r >= rows || c < 0 || c >= cols) {
      console.warn(`  ⚠ ${name}: 範囲外 (${r},${c}) — スキップ`);
      skipped++;
      continue;
    }
    const tile = createCanvas(TSIZE, TSIZE);
    tile.getContext('2d').drawImage(src, c * TSIZE, r * TSIZE, TSIZE, TSIZE, 0, 0, TSIZE, TSIZE);
    fs.writeFileSync(path.join(OUTDIR, `${name}.png`), tile.toBuffer('image/png'));
    console.log(`  ✓ ${name.padEnd(20)} (${r},${c})`);
    saved++;
  }

  console.log(`\n完了: ${saved}タイル保存 → ./tiles/`);
  if (skipped) console.log(`スキップ: ${skipped}タイル`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
