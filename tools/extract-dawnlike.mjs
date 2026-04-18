/**
 * DawnLike tileset extractor - extracts 16x16 tiles and saves to tiles/ folder
 * Maps DawnLike spritesheet positions to game TILE_NAMES indices
 */
import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";

const DAWN = "tileset_preview/DawnLike";
const OUT = "public/tiles";
const TS = 16;

// Mapping: tileName -> { file, col, row, flipV? }
// file is relative to DAWN folder
const MAPPING = {
  // === Terrain ===
  wall:        { file: "Objects/Wall.png",  col: 2, row: 3 },
  floor:       { file: "Objects/Floor.png", col: 2, row: 2 },
  stairs_down: { file: "Objects/Tile.png",  col: 1, row: 1 },
  stairs_up:   { file: "Objects/Tile.png",  col: 5, row: 1, flipV: true },
  corridor:    { file: "Objects/Floor.png", col: 3, row: 2 },

  // === Player (all directions use same character: r0,c0 knight) ===
  player:           { file: "Characters/Player0.png", col: 0, row: 0 },
  player_down:      { file: "Characters/Player0.png", col: 0, row: 0 },
  player_up:        { file: "Characters/Player0.png", col: 0, row: 0 },
  player_left:      { file: "Characters/Player0.png", col: 0, row: 0 },
  player_right:     { file: "Characters/Player0.png", col: 0, row: 0 },
  player_down_left: { file: "Characters/Player0.png", col: 0, row: 0 },
  player_down_right:{ file: "Characters/Player0.png", col: 0, row: 0 },
  player_up_left:   { file: "Characters/Player0.png", col: 0, row: 0 },
  player_up_right:  { file: "Characters/Player0.png", col: 0, row: 0 },

  // === Monsters ===
  rat:         { file: "Characters/Rodent0.png",    col: 0, row: 0 },
  kobold:      { file: "Characters/Humanoid0.png",  col: 0, row: 3 },
  goblin:      { file: "Characters/Humanoid0.png",  col: 4, row: 3 },
  skeleton:    { file: "Characters/Undead0.png",    col: 0, row: 0 },
  zombie:      { file: "Characters/Undead0.png",    col: 0, row: 2 },
  orc:         { file: "Characters/Humanoid0.png",  col: 0, row: 5 },
  snake:       { file: "Characters/Reptile0.png",   col: 0, row: 4 },
  troll:       { file: "Characters/Humanoid0.png",  col: 0, row: 7 },
  dragon:      { file: "Characters/Demon0.png",     col: 0, row: 4 },
  vampire:     { file: "Characters/Undead0.png",    col: 0, row: 4 },
  shopkeeper:  { file: "Characters/Humanoid0.png",  col: 4, row: 8 },
  archer:      { file: "Characters/Humanoid0.png",  col: 2, row: 1 },
  wizard:      { file: "Characters/Humanoid0.png",  col: 0, row: 14 },
  gargoyle:    { file: "Characters/Demon0.png",     col: 4, row: 2 },
  imp:         { file: "Characters/Demon0.png",     col: 0, row: 0 },
  wind_mage:   { file: "Characters/Elemental0.png", col: 0, row: 6 },
  shaman:      { file: "Characters/Humanoid0.png",  col: 0, row: 10 },
  wolf:        { file: "Characters/Dog0.png",       col: 0, row: 0 },
  golem:       { file: "Characters/Elemental0.png", col: 0, row: 2 },
  demon:       { file: "Characters/Demon0.png",     col: 0, row: 6 },
  guard:       { file: "Characters/Humanoid0.png",  col: 4, row: 4 },
  firedemon:   { file: "Characters/Elemental0.png", col: 0, row: 4 },
  witchdoctor: { file: "Characters/Humanoid0.png",  col: 0, row: 12 },
  wokka:       { file: "Characters/Misc0.png",      col: 0, row: 0 },
  rockspirit:  { file: "Characters/Elemental0.png", col: 0, row: 3 },
  thief:       { file: "Characters/Humanoid0.png",  col: 0, row: 9 },
  runner:      { file: "Characters/Humanoid0.png",  col: 6, row: 9 },
  wateri:      { file: "Characters/Aquatic0.png",   col: 0, row: 3 },
  leprechaun:  { file: "Characters/Humanoid0.png",  col: 0, row: 26 },

  // === Items ===
  potion:       { file: "Items/Potion.png",   col: 0, row: 0 },
  potion2:      { file: "Items/Potion.png",   col: 1, row: 0 },
  scroll:       { file: "Items/Scroll.png",   col: 0, row: 0 },
  food:         { file: "Items/Food.png",     col: 3, row: 0 },
  food_cooked:  { file: "Items/Food.png",     col: 5, row: 1 },
  weapon:       { file: "Items/ShortWep.png", col: 0, row: 0 },
  armor:        { file: "Items/Armor.png",    col: 0, row: 0 },
  gold:         { file: "Items/Money.png",    col: 0, row: 0 },
  arrow:        { file: "Items/Ammo.png",     col: 0, row: 0 },
  wand:         { file: "Items/Wand.png",     col: 0, row: 0 },
  ring:         { file: "Items/Ring.png",     col: 0, row: 0 },
  spellbook:    { file: "Items/Book.png",     col: 0, row: 0 },
  magic_marker: { file: "Items/Wand.png",     col: 0, row: 5 },
  pen:          { file: "Items/Tool.png",     col: 3, row: 2 },

  // === Traps (using Trap.png grid) ===
  trap_mine:         { file: "Objects/Trap.png", col: 0, row: 0 },
  trap_arrow:        { file: "Objects/Trap.png", col: 1, row: 0 },
  trap_pit:          { file: "Objects/Trap.png", col: 2, row: 0 },
  trap_rust:         { file: "Objects/Trap.png", col: 3, row: 0 },
  trap_spin:         { file: "Objects/Trap.png", col: 4, row: 0 },
  trap_sleep:        { file: "Objects/Trap.png", col: 5, row: 0 },
  trap_poison_arrow: { file: "Objects/Trap.png", col: 6, row: 0 },
  trap_summon:       { file: "Objects/Trap.png", col: 7, row: 0 },
  trap_slow:         { file: "Objects/Trap.png", col: 0, row: 1 },
  trap_seal:         { file: "Objects/Trap.png", col: 1, row: 1 },
  trap_steal:        { file: "Objects/Trap.png", col: 2, row: 1 },
  trap_hunger:       { file: "Objects/Trap.png", col: 3, row: 1 },
  trap_blowback:     { file: "Objects/Trap.png", col: 4, row: 1 },
  trap_shadow:       { file: "Objects/Trap.png", col: 5, row: 1 },
  trap_rockfall:     { file: "Objects/Trap.png", col: 6, row: 1 },
  trap_timebomb:     { file: "Objects/Trap.png", col: 7, row: 1 },

  // === Special ===
  pot:     { file: "Objects/Decor0.png", col: 0, row: 3 },
  bigbox:  { file: "Items/Chest0.png",   col: 0, row: 0 },
  // NOTE: spring.png and pentacle.png are custom-created (not from DawnLike).
  // They are kept in tiles/ but not extracted by this script.
};

// Cache loaded images
const imgCache = {};
async function getImage(relPath) {
  const full = path.join(DAWN, relPath);
  if (!imgCache[full]) imgCache[full] = await loadImage(full);
  return imgCache[full];
}

async function extractTile(name, spec) {
  const img = await getImage(spec.file);
  const canvas = createCanvas(TS, TS);
  const ctx = canvas.getContext("2d");

  if (spec.flipH || spec.flipV) {
    ctx.save();
    const sx = spec.flipH ? -1 : 1;
    const sy = spec.flipV ? -1 : 1;
    ctx.translate(spec.flipH ? TS : 0, spec.flipV ? TS : 0);
    ctx.scale(sx, sy);
  }

  ctx.drawImage(
    img,
    spec.col * TS, spec.row * TS, TS, TS,
    0, 0, TS, TS
  );

  if (spec.flipH || spec.flipV) ctx.restore();

  const outPath = path.join(OUT, name + ".png");
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  return outPath;
}

async function main() {
  // Backup existing tiles
  const backupDir = "tiles_backup";
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
    const existing = fs.readdirSync(OUT).filter(f => f.endsWith(".png"));
    for (const f of existing) {
      fs.copyFileSync(path.join(OUT, f), path.join(backupDir, f));
    }
    console.log(`Backed up ${existing.length} tiles to ${backupDir}/`);
  }

  let count = 0;
  for (const [name, spec] of Object.entries(MAPPING)) {
    try {
      const out = await extractTile(name, spec);
      count++;
    } catch (e) {
      console.error(`FAIL: ${name} - ${e.message}`);
    }
  }
  console.log(`\nExtracted ${count}/${Object.keys(MAPPING).length} tiles to ${OUT}/`);

  // Generate preview sheet
  const names = Object.keys(MAPPING);
  const cols = 10;
  const rows = Math.ceil(names.length / cols);
  const scale = 3;
  const ss = TS * scale;
  const labelH = 16;
  const cellW = ss + 4;
  const cellH = ss + labelH + 4;
  const preview = createCanvas(cols * cellW + 10, rows * cellH + 30);
  const pctx = preview.getContext("2d");
  pctx.fillStyle = "#111";
  pctx.fillRect(0, 0, preview.width, preview.height);
  pctx.fillStyle = "#fff";
  pctx.font = "bold 14px monospace";
  pctx.fillText("DawnLike Extracted Tiles Preview", 10, 18);

  for (let i = 0; i < names.length; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = c * cellW + 5;
    const y = r * cellH + 28;
    try {
      const tileImg = await loadImage(path.join(OUT, names[i] + ".png"));
      pctx.drawImage(tileImg, x, y, ss, ss);
    } catch (e) {}
    pctx.fillStyle = "#aaa";
    pctx.font = "9px monospace";
    pctx.textAlign = "center";
    pctx.fillText(names[i], x + ss / 2, y + ss + 12);
    pctx.textAlign = "start";
  }

  fs.writeFileSync("tileset_preview/extracted_preview.png", preview.toBuffer("image/png"));
  console.log("Preview saved: tileset_preview/extracted_preview.png");
}

main().catch(console.error);
