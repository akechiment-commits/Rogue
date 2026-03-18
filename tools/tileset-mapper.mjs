#!/usr/bin/env node
/**
 * タイルセット自動マッパー
 *
 * Claude Vision API を使ってタイルセット画像の各タイルを自動識別し、
 * ゲームのグラフィックとして ./tiles/{name}.png に書き出します。
 *
 * 使い方:
 *   ANTHROPIC_API_KEY=... node tools/tileset-mapper.mjs <tileset.png> [tile_w=16] [tile_h=16]
 *
 * 例:
 *   node tools/tileset-mapper.mjs my_tileset.png 16 16
 *   node tools/tileset-mapper.mjs my_tileset.png 32 32
 *
 * 出力: ./tiles/{name}.png  ← Vite が /tiles/{name}.png として配信しゲームが自動ロード
 */

import Anthropic from '@anthropic-ai/sdk';
import { createCanvas, loadImage } from 'canvas';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ================================================================
 * ゲームエンティティの説明（Claude が識別しやすいように日英両記）
 * ================================================================ */
const ENTITIES = {
  // ── 地形 ──
  wall:             "石造りの壁 / stone wall tile (dungeon wall)",
  floor:            "石畳の床 / stone floor tile",
  stairs_down:      "下り階段 / stairs going down (> or downward steps)",
  stairs_up:        "上り階段 / stairs going up (< or upward steps)",
  corridor:         "通路・廊下 / dark corridor/hallway",
  spring:           "泉・水源 / water spring or fountain",
  // ── プレイヤー ──
  player:           "主人公・冒険者（正面向き）/ hero character facing forward (@-like figure)",
  player_down:      "プレイヤー（下向き）/ hero facing down",
  player_up:        "プレイヤー（上向き）/ hero facing up",
  player_left:      "プレイヤー（左向き）/ hero facing left",
  player_right:     "プレイヤー（右向き）/ hero facing right",
  player_down_left: "プレイヤー（左下向き）/ hero facing down-left",
  player_down_right:"プレイヤー（右下向き）/ hero facing down-right",
  player_up_left:   "プレイヤー（左上向き）/ hero facing up-left",
  player_up_right:  "プレイヤー（右上向き）/ hero facing up-right",
  // ── 敵モンスター ──
  rat:              "ネズミ（小型齧歯類）/ small rat or mouse enemy",
  kobold:           "コボルド（小型爬虫類人型）/ kobold lizard-man enemy",
  goblin:           "ゴブリン（緑色小型人型）/ small green goblin enemy",
  skeleton:         "スケルトン（骸骨アンデッド）/ skeleton undead enemy",
  zombie:           "ゾンビ（腐乱アンデッド）/ zombie undead enemy",
  orc:              "オーク（大型緑色人型）/ large orc enemy",
  snake:            "大蛇（蛇の敵）/ large snake enemy",
  troll:            "トロル（大型怪物）/ troll enemy",
  dragon:           "ドラゴン（翼のある竜）/ dragon with wings",
  vampire:          "ヴァンパイア（吸血鬼）/ vampire enemy",
  archer:           "アーチャー（弓使い）/ archer with bow",
  wizard:           "ウィザード（魔法使い）/ wizard or mage",
  imp:              "インプ（小型悪魔・浮遊）/ small flying imp/demon",
  gargoyle:         "ガーゴイル（石像翼ある敵）/ gargoyle with wings",
  wolf:             "ウルフ（オオカミ）/ wolf enemy",
  golem:            "ゴーレム（岩製大型敵）/ large stone golem",
  demon:            "デーモン（大型悪魔）/ large demon",
  shaman:           "シャーマン（呪術師）/ shaman/witch doctor",
  wind_mage:        "ウィンドメイジ（風魔法使い）/ wind mage",
  firedemon:        "火ダルマ（炎の悪魔）/ fire demon engulfed in flames",
  witchdoctor:      "呪術師（暗い魔法使い）/ dark witch doctor",
  rockspirit:       "岩霊（岩の精霊）/ rock spirit or earth elemental",
  // ── NPC ──
  shopkeeper:       "ショップキーパー（商人）/ merchant/shopkeeper NPC",
  guard:            "ガード（警備員）/ guard NPC",
  // ── アイテム ──
  potion:           "薬瓶（小さい）/ small potion bottle (! symbol)",
  potion2:          "大きな薬瓶 / large potion bottle",
  scroll:           "巻物 / scroll (? symbol or rolled paper)",
  food:             "食料（果物・食べ物）/ food item (fruit/food, % symbol)",
  weapon:           "武器（剣・斧など）/ weapon: sword or axe (/ symbol)",
  armor:            "防具・鎧 / armor or shield ([ symbol)",
  gold:             "金貨 / gold coins ($ symbol)",
  arrow:            "矢 / arrow or quiver (| symbol)",
  wand:             "杖（魔法の杖）/ magic wand or staff",
  ring:             "指輪 / ring (= symbol)",
  pot:              "壺（陶器）/ pot or jar",
  bigbox:           "大箱・宝箱 / large chest or box",
  magic_marker:     "魔法のマーカー・ペン / magic marker or pen",
  spellbook:        "魔法書 / spellbook (+ symbol or book)",
  // ── 罠 ──
  trap_mine:        "地雷罠 / mine/explosion trap (^ symbol)",
  trap_arrow:       "矢罠 / arrow trap",
  trap_pit:         "落とし穴罠 / pit trap",
  trap_rust:        "錆罠 / rust trap",
  trap_spin:        "回転罠 / spinning trap",
  trap_sleep:       "睡眠罠 / sleep trap",
  trap_poison_arrow:"毒矢罠 / poison arrow trap",
  trap_summon:      "召喚罠 / summon monster trap",
  trap_slow:        "鈍足罠 / slow trap",
  trap_seal:        "封印罠 / seal/magic trap",
  trap_steal:       "盗み罠 / steal trap",
  trap_hunger:      "空腹罠 / hunger trap",
  trap_blowback:    "吹き飛ばし罠 / knockback trap",
};

/* ================================================================
 * ユーティリティ
 * ================================================================ */

/** タイルセット画像からアノテーション済みの解析用画像を生成（行範囲指定可）
 *  各タイルに「r,c」ラベルを重ねて Claude が位置を識別しやすくする */
function buildAnnotatedImage(srcCanvas, cols, tileW, tileH, rowStart, rowEnd) {
  const rows = rowEnd - rowStart;
  // 大きいタイルセット向けにスケールを抑える（最大2×）
  const scale = Math.min(2, Math.max(1, Math.floor(32 / Math.max(tileW, tileH))));
  const dw = tileW * scale;
  const dh = tileH * scale;

  const out = createCanvas(cols * dw, rows * dh);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, out.width, out.height);

  for (let ri = 0; ri < rows; ri++) {
    const r = rowStart + ri;
    for (let c = 0; c < cols; c++) {
      ctx.drawImage(srcCanvas,
        c * tileW, r * tileH, tileW, tileH,
        c * dw,    ri * dh,   dw,    dh);

      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth   = 1;
      ctx.strokeRect(c * dw + 0.5, ri * dh + 0.5, dw - 1, dh - 1);

      const fontSize = Math.max(6, Math.floor(dh * 0.22));
      ctx.font      = `${fontSize}px monospace`;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(c * dw, ri * dh, dw * 0.6, fontSize + 2);
      ctx.fillStyle = '#fff';
      ctx.fillText(`${r},${c}`, c * dw + 1, ri * dh + fontSize);
    }
  }
  return out;
}

/** Claude API に1チャンク分のタイル画像を送って JSON マッピングを受け取る */
async function identifyChunkWithClaude(client, annotatedCanvas, cols, tileW, tileH, rowStart, rowEnd, entityList, chunkLabel) {
  const base64 = annotatedCanvas.toBuffer('image/png').toString('base64');
  const rows   = rowEnd - rowStart;

  const prompt = `\
これはローグライクゲームのタイルセットの一部です。
チャンク: 行${rowStart}〜${rowEnd - 1}（${rows}行 × ${cols}列、各タイル ${tileW}×${tileH}px）
各タイルの左上に "行,列"（row,col）のラベルが付いています（0始まり、行番号はタイルセット全体での絶対値）。

以下のゲームエンティティそれぞれに最もふさわしいタイルを選んでください:
${entityList}

ルール:
- このチャンクに存在しないエンティティはスキップ（省略）
- 1つのタイルを複数エンティティに割り当ててよい
- 方向違いのプレイヤーが見当たらない場合は player のみ含める
- 見つからなければ空の {} を返す

以下の JSON のみで回答してください（他の説明は不要）:
{
  "エンティティ名": {"row": 数値, "col": 数値},
  ...
}`;

  console.log(`  ${chunkLabel} Claude API にリクエスト中...`);
  const stream = client.messages.stream({
    model:      'claude-opus-4-6',
    max_tokens: 2048,
    thinking:   { type: 'adaptive' },
    messages: [{
      role:    'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
        { type: 'text',  text: prompt },
      ],
    }],
  });

  let dots = 0;
  const ticker = setInterval(() => { process.stdout.write('.'); dots++; }, 1000);
  const msg = await stream.finalMessage();
  clearInterval(ticker);
  if (dots > 0) process.stdout.write('\n');

  const rawText = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn(`  ⚠ ${chunkLabel} JSON が取得できませんでした（スキップ）`);
    return {};
  }
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    console.warn(`  ⚠ ${chunkLabel} JSON のパースに失敗しました（スキップ）`);
    return {};
  }
}

/* ================================================================
 * メイン処理
 * ================================================================ */
async function main() {
  const [, , tilesetPath, tileWArg = '16', tileHArg = '16'] = process.argv;

  if (!tilesetPath) {
    console.error([
      '使い方: node tools/tileset-mapper.mjs <tileset.png> [tile_w=16] [tile_h=16]',
      '',
      '例:',
      '  node tools/tileset-mapper.mjs my_tileset.png 16 16',
      '  node tools/tileset-mapper.mjs my_tileset.png 32',
    ].join('\n'));
    process.exit(1);
  }

  if (!fs.existsSync(tilesetPath)) {
    console.error(`エラー: ファイルが見つかりません → ${tilesetPath}`);
    process.exit(1);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('エラー: 環境変数 ANTHROPIC_API_KEY が設定されていません');
    process.exit(1);
  }

  const tileW = parseInt(tileWArg, 10);
  const tileH = parseInt(tileHArg, 10);
  if (isNaN(tileW) || isNaN(tileH) || tileW < 1 || tileH < 1) {
    console.error('エラー: タイルサイズは正の整数で指定してください');
    process.exit(1);
  }

  // ── タイルセット読み込み ──
  console.log(`\nタイルセット読み込み中: ${tilesetPath}`);
  const img = await loadImage(tilesetPath);
  const cols = Math.floor(img.width  / tileW);
  const rows = Math.floor(img.height / tileH);
  console.log(`  画像サイズ: ${img.width}×${img.height}px`);
  console.log(`  タイル数:   ${cols}列 × ${rows}行 = ${cols * rows}枚（各 ${tileW}×${tileH}px）`);

  if (cols === 0 || rows === 0) {
    console.error('エラー: タイルサイズが画像より大きいです');
    process.exit(1);
  }

  // ── ソース canvas に描画 ──
  const srcCanvas = createCanvas(img.width, img.height);
  srcCanvas.getContext('2d').drawImage(img, 0, 0);

  // ── 行範囲を決定（--rows START-END オプション対応）──
  const rowsArg = process.argv.find(a => a.startsWith('--rows='))?.slice(7)
               ?? process.argv[process.argv.indexOf('--rows') + 1];
  let rowStart = 0, rowEnd = rows;
  if (rowsArg) {
    const m = rowsArg.match(/^(\d+)-(\d+)$/);
    if (!m) { console.error('--rows の形式は START-END です（例: --rows=0-100）'); process.exit(1); }
    rowStart = Math.max(0, parseInt(m[1], 10));
    rowEnd   = Math.min(rows, parseInt(m[2], 10) + 1);
    console.log(`  行範囲指定: ${rowStart}〜${rowEnd - 1} 行目のみ解析`);
  }
  const totalRows = rowEnd - rowStart;

  // 1チャンクあたりの最大行数（大きいと画像が重くなるため制限）
  const CHUNK_ROWS = 40;
  const chunks = [];
  for (let s = rowStart; s < rowEnd; s += CHUNK_ROWS) {
    chunks.push({ start: s, end: Math.min(s + CHUNK_ROWS, rowEnd) });
  }
  console.log(`  チャンク分割: ${chunks.length}チャンク（各最大${CHUNK_ROWS}行）`);

  // ── デバッグ用にアノテーション画像を保存（最初のチャンクのみ）──
  fs.mkdirSync(path.join(ROOT, 'tiles'), { recursive: true });
  const debugAnnotated = buildAnnotatedImage(srcCanvas, cols, tileW, tileH, chunks[0].start, chunks[0].end);
  const debugPath = path.join(ROOT, 'tiles', '_debug_annotated.png');
  fs.writeFileSync(debugPath, debugAnnotated.toBuffer('image/png'));
  console.log(`  デバッグ画像（先頭チャンク）: ${debugPath}`);

  // ── Claude API でチャンクごとにタイルを識別 ──
  console.log('\nClaude Vision API でタイルを識別中...');
  const client = new Anthropic({ apiKey });
  const entityList = Object.entries(ENTITIES).map(([k, desc]) => `  "${k}": ${desc}`).join('\n');

  const mapping = {};
  for (let i = 0; i < chunks.length; i++) {
    const { start, end } = chunks[i];
    const label = `[チャンク ${i + 1}/${chunks.length} 行${start}〜${end - 1}]`;
    const annotated = buildAnnotatedImage(srcCanvas, cols, tileW, tileH, start, end);
    const result = await identifyChunkWithClaude(client, annotated, cols, tileW, tileH, start, end, entityList, label);
    // 後のチャンクで見つかったものは上書きしない（先に見つかった方を優先）
    for (const [k, v] of Object.entries(result)) {
      if (!(k in mapping)) mapping[k] = v;
    }
    const found = Object.keys(result).length;
    console.log(`  → ${found}エンティティ発見 / 累計: ${Object.keys(mapping).length}種`);
    // 全エンティティ発見済みなら早期終了
    if (Object.keys(mapping).length >= Object.keys(ENTITIES).length) {
      console.log('  全エンティティ発見！残りのチャンクをスキップします。');
      break;
    }
  }

  // ── タイルを切り出して保存 ──
  console.log('\nタイルを切り出して ./tiles/ に保存中...');
  const outDir = path.join(ROOT, 'tiles');
  fs.mkdirSync(outDir, { recursive: true });

  let saved = 0, skipped = 0, warned = 0;
  for (const [name, pos] of Object.entries(mapping)) {
    if (!pos || pos.row == null || pos.col == null) {
      console.warn(`  ⚠ ${name}: 座標が不正（スキップ）`);
      warned++; continue;
    }
    const r = parseInt(pos.row, 10);
    const c = parseInt(pos.col, 10);
    if (isNaN(r) || isNaN(c) || r < 0 || r >= rows || c < 0 || c >= cols) {
      console.warn(`  ⚠ ${name}: 範囲外の座標 row=${pos.row} col=${pos.col}（スキップ）`);
      warned++; continue;
    }

    // タイルを切り出し
    const tile    = createCanvas(tileW, tileH);
    const tileCtx = tile.getContext('2d');
    tileCtx.drawImage(srcCanvas, c * tileW, r * tileH, tileW, tileH, 0, 0, tileW, tileH);

    const outPath = path.join(outDir, `${name}.png`);
    fs.writeFileSync(outPath, tile.toBuffer('image/png'));
    console.log(`  ✓ ${name.padEnd(18)} row=${r} col=${c}`);
    saved++;
  }

  // ── 結果サマリー ──
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`保存:   ${saved} タイル → ./tiles/`);
  if (warned)   console.log(`警告:   ${warned} タイル（座標エラー）`);
  if (skipped)  console.log(`スキップ: ${skipped} タイル`);
  console.log('');
  console.log('ゲームを起動（または再起動）すると新しいタイルが自動で適用されます。');
  console.log(`デバッグ: ./tiles/_debug_annotated.png でアノテーション画像を確認できます。`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

main().catch(err => {
  console.error('\nエラーが発生しました:');
  console.error(err.message ?? err);
  process.exit(1);
});
