#!/usr/bin/env node
/**
 * タイル切り出しスクリプト（APIなし版）
 * [Base]BaseChip_pipo.png (256x7968, 16x16タイル, 16列×498行) から
 * 目視で特定したタイルを ./tiles/{name}.png に切り出す
 *
 * 使い方: node tools/cut-tiles.mjs [tileset.png] [tile_size=16]
 */

import { createCanvas, loadImage } from 'canvas';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC    = process.argv[2] ?? path.join(ROOT, '[Base]BaseChip_pipo.png');
const TSIZE  = parseInt(process.argv[3] ?? '16', 10);
const OUTDIR = path.join(ROOT, 'tiles');

/* ================================================================
 * 目視マッピング (row, col) — 0始まり
 * 画像: [Base]BaseChip_pipo.png / 16px タイル / 16列×498行
 * ================================================================ */
const MAPPING = {
  // ── 地形 ──
  wall:              { row: 268, col: 2 },  // 茶色ダンジョン石壁（内部）
  floor:             { row: 270, col: 2 },  // 青灰石床
  corridor:          { row: 270, col: 0 },  // 青灰石床（通路）
  spring:            { row:  56, col: 6 },  // 木樽（湧き水代用）

  // ── プレイヤー（全方向同一タイル） ──
  player:            { row: 256, col: 0 },  // 騎士ヘルメット
  player_down:       { row: 256, col: 0 },
  player_up:         { row: 256, col: 0 },
  player_left:       { row: 256, col: 0 },
  player_right:      { row: 256, col: 0 },
  player_down_left:  { row: 256, col: 0 },
  player_down_right: { row: 256, col: 0 },
  player_up_left:    { row: 256, col: 0 },
  player_up_right:   { row: 256, col: 0 },

  // ── 敵モンスター（row 259 = キャラローブ） ──
  zombie:            { row: 259, col: 0 },  // 灰ローブ（アンデッド）
  skeleton:          { row: 259, col: 0 },
  orc:               { row: 259, col: 0 },
  troll:             { row: 259, col: 0 },
  goblin:            { row: 259, col: 2 },  // 緑ローブ
  wolf:              { row: 259, col: 2 },
  rat:               { row: 259, col: 2 },
  snake:             { row: 259, col: 2 },
  kobold:            { row: 259, col: 2 },
  dragon:            { row: 259, col: 4 },  // 赤ローブ（炎系）
  firedemon:         { row: 259, col: 4 },
  demon:             { row: 259, col: 4 },
  golem:             { row: 259, col: 6 },  // 青ローブ（岩系）
  rockspirit:        { row: 259, col: 6 },
  vampire:           { row: 259, col: 8 },  // 紫ローブ（闇系）
  wizard:            { row: 259, col: 8 },
  shaman:            { row: 259, col: 8 },
  wind_mage:         { row: 259, col: 8 },
  witchdoctor:       { row: 259, col: 8 },
  imp:               { row: 259, col: 8 },
  archer:            { row: 256, col: 2 },  // 緑帽子（弓使い代用）
  gargoyle:          { row: 256, col: 0 },  // 騎士ヘルメット（ガーゴイル代用）

  // ── NPC ──
  shopkeeper:        { row: 259, col: 12 }, // 金ゴブレット（商人代用）
  guard:             { row: 256, col: 0 },  // 騎士ヘルメット（衛兵）

  // ── アイテム ──
  weapon:            { row: 254, col: 12 }, // 銀の長剣
  pot:               { row: 242, col: 10 }, // 茶色クロック
  bigbox:            { row: 248, col: 2 },  // 赤い宝箱
  gold:              { row: 248, col: 4 },  // 金貨
  food:              { row: 240, col: 1 },  // 料理皿
  potion:            { row: 242, col: 8 },  // 緑ポーション瓶
  potion2:           { row: 242, col: 9 },  // 茶色ポーション瓶
  scroll:            { row: 244, col: 0 },  // 古い巻物
  armor:             { row: 256, col: 0 },  // 騎士ヘルメット（防具）
  arrow:             { row: 252, col: 4 },  // 短剣（矢代用）
  wand:              { row: 262, col: 0 },  // 金トーチ（杖代用）
  ring:              { row: 254, col: 4 },  // 紫ベルベット指輪展示
  magic_marker:      { row: 262, col: 14 }, // 金の鍵（魔法ペン代用）
  spellbook:         { row: 238, col: 0 },  // 赤い魔法書

  // ── 罠 ──
  trap_mine:         { row: 252, col: 2 },  // 黒い爆弾
  trap_arrow:        { row: 252, col: 4 },  // 短剣
  trap_pit:          { row: 270, col: 2 },  // 床（落とし穴代用）
  trap_rust:         { row: 252, col: 4 },  // 短剣（錆）
  trap_spin:         { row: 246, col: 4 },  // 水晶玉（回転）
  trap_sleep:        { row: 246, col: 4 },  // 水晶玉（眠り）
  trap_poison_arrow: { row: 252, col: 4 },  // 短剣（毒矢）
  trap_summon:       { row: 262, col: 12 }, // 骸骨（召喚）
  trap_slow:         { row: 246, col: 4 },  // 水晶玉（鈍足）
  trap_seal:         { row: 238, col: 0 },  // 赤い本（封印）
  trap_steal:        { row: 248, col: 4 },  // 金貨（盗難）
  trap_hunger:       { row: 240, col: 1 },  // 料理皿（空腹）
  trap_blowback:     { row: 252, col: 2 },  // 黒い爆弾（吹き飛ばし）

  // ── 階段 ──
  stairs_down:       { row:  72, col: 12 }, // 金フェンス（下り口）
  stairs_up:         { row:  72, col: 13 }, // 金フェンス（上り口）
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
