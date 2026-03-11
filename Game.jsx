import { useState, useEffect, useCallback, useRef } from "react";
import { MW, MH, T, TI, rng, uid, clamp, DRO, computeFOV } from "./utils.js";
import {
  MONS,
  hasLOS,
  bfsNext,
  findRoom,
  getOpenDirs,
  monsterAI,
} from "./monsters.js";
import {
  ITEM_TILES,
  ITEMS,
  ARROW_T,
  EMPTY_BOTTLE,
  WATER_BOTTLE,
  BLANK_SCROLL,
  MAGIC_MARKER,
  SPELLBOOKS,
  SPELLS,
  WANDS,
  POTS,
  TRAPS,
  RAW_FOODS,
  COOKED_FOODS,
  RAW_SIZES,
  COOKED_SIZES,
  FOOD_EFFECTS,
  FOOD_DESCS,
  POT_FOOD_PREFIX,
  POT_FOOD_DESCS,
  POTION_FOOD_PREFIX,
  itemPrice,
  wPick,
  genFood,
  makeArrow,
  makePoisonArrow,
  makePiercingArrow,
  addArrowsInv,
  applyPotEffect,
  makePot,
  scatterPotContents,
  applyPotionEffect,
  applyPotionToItem,
  splashPotion,
  applyWaterSplash,
  soakItemIntoSpring,
  placeItemAt,
  pushEntity,
  fireTrapItem,
  setPitfallBag,
  clearPitfallBag,
  applyWandEffect,
  fireWandBolt,
  getBlessMultiplier,
  breakWandAoE,
  shootArrow,
  monsterFireLightning,
  checkShopTheft,
  castSpellBolt,
  applySpellEffect,
  WEAPON_ABILITIES,
  ARMOR_ABILITIES,
  BB_TYPES,
  inMagicSealRoom,
  inCursedMagicSealRoom,
  getFarcastMode,
  monsterDrop,
  getIdentKey,
  generateFakeNames,
} from "./items.js";
import { fireTrapPlayer } from "./traps.js";
/* Tile name mapping — place images at CUSTOM_TILE_PATH/{name}.png to override spritesheet */ const TILE_NAMES =
  {
    0: "wall",
    1: "floor",
    2: "stairs_down",
    3: "stairs_up",
    4: "corridor",
    5: "player",
    6: "rat",
    7: "kobold",
    8: "goblin",
    9: "skeleton",
    10: "zombie",
    11: "orc",
    12: "snake",
    13: "troll",
    14: "dragon",
    15: "vampire",
    16: "potion",
    17: "potion2",
    18: "scroll",
    19: "food",
    20: "weapon",
    21: "armor",
    22: "gold",
    23: "arrow",
    24: "wand",
    25: "trap_mine",
    26: "trap_arrow",
    27: "trap_pit",
    28: "trap_rust",
    29: "trap_spin",
    30: "trap_sleep",
    31: "spring",
    32: "pot",
    33: "player_down",
    34: "player_up",
    35: "player_left",
    36: "player_right",
    37: "shopkeeper",
    38: "bigbox",
    39: "archer",
    40: "wizard",
    41: "magic_marker",
    45: "trap_poison_arrow",
    46: "trap_summon",
    47: "trap_slow",
    48: "trap_seal",
    49: "trap_steal",
    50: "trap_hunger",
    51: "trap_blowback",
  };
const CUSTOM_TILE_PATH = "./tiles";
let customTileImages = {};
const ST = 16;
function genDungeon(depth) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
  const rooms = [];
  const tgt = rng(4, 7);
  for (let i = 0; i < tgt * 60 && rooms.length < tgt; i++) {
    const roll = Math.random();
    let rw,
      rh,
      isL = false;
    if (roll < 0.06) {
      rw = rng(3, 4);
      rh = rng(3, 4);
    } else if (roll < 0.12) {
      rw = rng(12, Math.min(15, MW - 4));
      rh = rng(8, Math.min(10, MH - 4));
    } else if (roll < 0.2) {
      isL = true;
      rw = rng(6, 10);
      rh = rng(5, 8);
    } else {
      rw = rng(4, 9);
      rh = rng(3, 6);
    }
    const rx = rng(1, MW - rw - 2),
      ry = rng(1, MH - rh - 2);
    if (rx < 1 || ry < 1 || rx + rw > MW - 1 || ry + rh > MH - 1) continue;
    if (
      rooms.some(
        (r) =>
          rx < r.x + r.w && rx + rw > r.x && ry < r.y + r.h && ry + rh > r.y,
      )
    )
      continue;
    let rcx, rcy;
    if (isL) {
      const qx = rng(0, 1),
        qy = rng(0, 1),
        hw = Math.floor(rw / 2),
        hh = Math.floor(rh / 2);
      rcx = qx === 0 ? Math.floor(rx + (rw * 3) / 4) : Math.floor(rx + rw / 4);
      rcy = qy === 0 ? Math.floor(ry + (rh * 3) / 4) : Math.floor(ry + rh / 4);
      rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: rcx, cy: rcy });
      for (let dy = 0; dy < rh; dy++)
        for (let dx = 0; dx < rw; dx++) {
          const inQX = qx === 0 ? dx < hw : dx >= rw - hw;
          const inQY = qy === 0 ? dy < hh : dy >= rh - hh;
          if (!(inQX && inQY)) map[ry + dy][rx + dx] = T.FLOOR;
        }
    } else {
      rcx = Math.floor(rx + rw / 2);
      rcy = Math.floor(ry + rh / 2);
      rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: rcx, cy: rcy });
      for (let dy = 0; dy < rh; dy++)
        for (let dx = 0; dx < rw; dx++) map[ry + dy][rx + dx] = T.FLOOR;
    }
  }
  if (rooms.length < 2) return genDungeon(depth);
  const conn = new Set([0]),
    pairs = [];
  while (conn.size < rooms.length) {
    let best = Infinity,
      fromI = -1,
      toJ = -1;
    for (const i of conn)
      for (let j = 0; j < rooms.length; j++) {
        if (conn.has(j)) continue;
        const d =
          Math.abs(rooms[i].cx - rooms[j].cx) +
          Math.abs(rooms[i].cy - rooms[j].cy);
        if (d < best) {
          best = d;
          fromI = i;
          toJ = j;
        }
      }
    if (fromI === -1) break;
    pairs.push([fromI, toJ]);
    conn.add(toJ);
  }
  for (const [ai, bi] of pairs) {
    let { cx: x1, cy: y1 } = rooms[ai],
      { cx: x2, cy: y2 } = rooms[bi];
    if (Math.random() < 0.15) {
      const mx = clamp(x1 + rng(-5, 5), 2, MW - 3),
        my = clamp(y1 + rng(-5, 5), 2, MH - 3);
      let tx = x1,
        ty = y1;
      while (tx !== mx) {
        map[ty][tx] = T.FLOOR;
        tx += tx < mx ? 1 : -1;
      }
      while (ty !== my) {
        map[ty][tx] = T.FLOOR;
        ty += ty < my ? 1 : -1;
      }
      while (tx !== x2) {
        map[ty][tx] = T.FLOOR;
        tx += tx < x2 ? 1 : -1;
      }
      while (ty !== y2) {
        map[ty][tx] = T.FLOOR;
        ty += ty < y2 ? 1 : -1;
      }
    } else if (Math.random() < 0.5) {
      while (x1 !== x2) {
        map[y1][x1] = T.FLOOR;
        x1 += x1 < x2 ? 1 : -1;
      }
      while (y1 !== y2) {
        map[y1][x1] = T.FLOOR;
        y1 += y1 < y2 ? 1 : -1;
      }
    } else {
      while (y1 !== y2) {
        map[y1][x1] = T.FLOOR;
        y1 += y1 < y2 ? 1 : -1;
      }
      while (x1 !== x2) {
        map[y1][x1] = T.FLOOR;
        x1 += x1 < x2 ? 1 : -1;
      }
    }
  }
  const roomConn = Array(rooms.length).fill(0);
  for (const [ai2, bi2] of pairs) {
    roomConn[ai2]++;
    roomConn[bi2]++;
  }
  const shopLeaves = rooms
    .map((_, i) => i)
    .filter((i) => roomConn[i] === 1 && i !== 0 && i !== rooms.length - 1);
  const shopFallback = rooms
    .map((_, i) => i)
    .filter((i) => i !== 0 && i !== rooms.length - 1);
  const shopPool = shopLeaves.length > 0 ? shopLeaves : shopFallback;
  let shopRoomIdx =
    shopPool.length > 0 ? shopPool[rng(0, shopPool.length - 1)] : -1;
  const inShop = (x, y) =>
    shopRoomIdx >= 0 &&
    rooms[shopRoomIdx] &&
    x >= rooms[shopRoomIdx].x &&
    x < rooms[shopRoomIdx].x + rooms[shopRoomIdx].w &&
    y >= rooms[shopRoomIdx].y &&
    y < rooms[shopRoomIdx].y + rooms[shopRoomIdx].h;
  const su = { x: rooms[0].cx, y: rooms[0].cy };
  map[su.y][su.x] = T.SU;
  const sd = { x: rooms[rooms.length - 1].cx, y: rooms[rooms.length - 1].cy };
  map[sd.y][sd.x] = T.SD;
  const mons = [];
  for (let i = 0; i < rng(6, 10) + depth; i++) {
    const rm = rooms[rng(1, rooms.length - 1)];
    if (!rm || rm === rooms[shopRoomIdx]) continue;
    const mx = rng(rm.x + 1, rm.x + rm.w - 2),
      my = rng(rm.y + 1, rm.y + rm.h - 2);
    if (
      map[my]?.[mx] === T.FLOOR &&
      !mons.some((m) => m.x === mx && m.y === my)
    ) {
      const t = MONS[clamp(rng(0, depth + 1), 0, MONS.length - 1)];
      mons.push({
        ...t,
        id: uid(),
        x: mx,
        y: my,
        maxHp: t.hp,
        turnAccum: 0,
        aware: false,
        dir: { x: [-1, 1][rng(0, 1)], y: 0 },
        lastPx: 0,
        lastPy: 0,
        patrolTarget: null,
      });
    }
  }
  /* 呪術師スポーン (2階以降に1体確定) */
  if (depth >= 1) {
    const _cwDef = MONS.find((m) => m.wandEffect === "curse_wand");
    if (_cwDef) {
      const _cwRm = rooms[rng(1, rooms.length - 1)];
      if (_cwRm) {
        const _cwx = rng(_cwRm.x + 1, _cwRm.x + _cwRm.w - 2);
        const _cwy = rng(_cwRm.y + 1, _cwRm.y + _cwRm.h - 2);
        if (map[_cwy]?.[_cwx] === T.FLOOR && !mons.some((m) => m.x === _cwx && m.y === _cwy)) {
          mons.push({
            ..._cwDef, id: uid(), x: _cwx, y: _cwy, maxHp: _cwDef.hp,
            turnAccum: 0, aware: false, dir: { x: 1, y: 0 },
            lastPx: 0, lastPy: 0, patrolTarget: null,
          });
        }
      }
    }
  }
  /* 岩霊スポーン (2階以降に1体確定) */
  if (depth >= 2) {
    const _wwDef = MONS.find((m) => m.wallWalker);
    if (_wwDef) {
      const _wwRm = rooms[rng(1, rooms.length - 1)];
      if (_wwRm) {
        const _wwx = rng(_wwRm.x + 1, _wwRm.x + _wwRm.w - 2);
        const _wwy = rng(_wwRm.y + 1, _wwRm.y + _wwRm.h - 2);
        if (map[_wwy]?.[_wwx] === T.FLOOR && !mons.some((m) => m.x === _wwx && m.y === _wwy)) {
          mons.push({
            ..._wwDef, id: uid(), x: _wwx, y: _wwy, maxHp: _wwDef.hp,
            turnAccum: 0, aware: false, dir: { x: 1, y: 0 },
            lastPx: 0, lastPy: 0, patrolTarget: null,
          });
        }
      }
    }
  }
  const items = [];
  const occ = (x, y) =>
    inShop(x, y) || items.some((i) => i.x === x && i.y === y);
  for (let i = 0; i < rng(15, 25); i++) {
    const rm = rooms[rng(0, rooms.length - 1)];
    const ix = rng(rm.x, rm.x + rm.w - 1),
      iy = rng(rm.y, rm.y + rm.h - 1);
    if (map[iy][ix] === T.FLOOR && !occ(ix, iy)) {
      const t = ITEMS[rng(0, ITEMS.length - 1)];
      const it = { ...t, id: uid(), x: ix, y: iy };
      if (it.type === "gold") it.value = rng(5, 20 + depth * 10);
      if (it.type !== "gold" && it.type !== "arrow") {
        const _blessRoll = Math.random();
        if (_blessRoll < 0.10)      it.blessed = true;
        else if (_blessRoll < 0.25) it.cursed  = true;
      }
      if (it.type === "weapon" || it.type === "armor") {
        const pr = Math.random();
        if (pr < 0.05 + depth * 0.01) it.plus = rng(2, 3);
        else if (pr < 0.2 + depth * 0.02) it.plus = 1;
        if (Math.random() < 0.25) {
          const abls =
            it.type === "weapon" ? WEAPON_ABILITIES : ARMOR_ABILITIES;
          it.ability = abls[rng(0, abls.length - 1)].id;
        }
      }
      items.push(it);
    }
  }
  for (let i = 0; i < rng(3, 6); i++) {
    const rm = rooms[rng(0, rooms.length - 1)];
    const ix = rng(rm.x, rm.x + rm.w - 1),
      iy = rng(rm.y, rm.y + rm.h - 1);
    if (map[iy][ix] === T.FLOOR && !occ(ix, iy))
      items.push({ ...ARROW_T, id: uid(), x: ix, y: iy, count: rng(3, 15) });
  }
  for (let i = 0; i < rng(2, 4); i++) {
    const rm = rooms[rng(0, rooms.length - 1)];
    const ix = rng(rm.x, rm.x + rm.w - 1),
      iy = rng(rm.y, rm.y + rm.h - 1);
    if (map[iy][ix] === T.FLOOR && !occ(ix, iy)) {
      const t = WANDS[rng(0, WANDS.length - 1)];
      items.push({
        ...t,
        id: uid(),
        x: ix,
        y: iy,
        charges: t.charges + rng(-1, 2),
      });
    }
  }
  for (let i = 0; i < rng(0, 2); i++) {
    const rm = rooms[rng(0, rooms.length - 1)];
    const ix = rng(rm.x, rm.x + rm.w - 1),
      iy = rng(rm.y, rm.y + rm.h - 1);
    if (map[iy][ix] === T.FLOOR && !occ(ix, iy)) {
      items.push({
        ...MAGIC_MARKER,
        id: uid(),
        x: ix,
        y: iy,
        charges: rng(1, 2),
      });
    }
  }
  /* Pen spawn (0〜1個/フロア) */
  if (Math.random() < 0.4) {
    const _penPool = ITEMS.filter((it) => it.type === "pen");
    if (_penPool.length > 0) {
      const rm = rooms[rng(0, rooms.length - 1)];
      const ix = rng(rm.x, rm.x + rm.w - 1),
        iy = rng(rm.y, rm.y + rm.h - 1);
      if (map[iy][ix] === T.FLOOR && !occ(ix, iy)) {
        const _pt = _penPool[rng(0, _penPool.length - 1)];
        items.push({ ..._pt, id: uid(), x: ix, y: iy, charges: rng(2, 3) });
      }
    }
  }
  for (let i = 0; i < rng(1, 3); i++) {
    const rm = rooms[rng(0, rooms.length - 1)];
    const ix = rng(rm.x, rm.x + rm.w - 1),
      iy = rng(rm.y, rm.y + rm.h - 1);
    if (map[iy][ix] === T.FLOOR && !occ(ix, iy)) {
      const sb = SPELLBOOKS[rng(0, SPELLBOOKS.length - 1)];
      items.push({ ...sb, id: uid(), x: ix, y: iy });
    }
  }
  for (let i = 0; i < rng(5, 10); i++) {
    const rm = rooms[rng(0, rooms.length - 1)];
    const ix = rng(rm.x, rm.x + rm.w - 1),
      iy = rng(rm.y, rm.y + rm.h - 1);
    if (map[iy][ix] === T.FLOOR && !occ(ix, iy)) {
      const f = genFood();
      items.push({ ...f, id: uid(), x: ix, y: iy });
    }
  }
  for (let i = 0; i < rng(1, 3); i++) {
    const rm = rooms[rng(0, rooms.length - 1)];
    const ix = rng(rm.x, rm.x + rm.w - 1),
      iy = rng(rm.y, rm.y + rm.h - 1);
    if (map[iy][ix] === T.FLOOR && !occ(ix, iy)) {
      const pt = makePot();
      pt.x = ix;
      pt.y = iy;
      items.push(pt);
    }
  }
  const traps = [];
  const tc = rng(8, 15) + depth * 2;
  for (let i = 0; i < tc; i++) {
    const rm = rooms[rng(0, rooms.length - 1)];
    const tx = rng(rm.x + 1, rm.x + rm.w - 2),
      ty = rng(rm.y + 1, rm.y + rm.h - 2);
    if (
      map[ty][tx] === T.FLOOR &&
      !(tx === su.x && ty === su.y) &&
      !(tx === sd.x && ty === sd.y) &&
      !traps.some((t) => t.x === tx && t.y === ty) &&
      !occ(tx, ty)
    ) {
      const t = TRAPS[rng(0, TRAPS.length - 1)];
      traps.push({ ...t, id: uid(), x: tx, y: ty, revealed: false });
    }
  }
  const springs = [];
  for (let i = 0; i < rng(1, 3); i++) {
    const rm = rooms[rng(0, rooms.length - 1)];
    const sx2 = rng(rm.x + 1, rm.x + rm.w - 2),
      sy2 = rng(rm.y + 1, rm.y + rm.h - 2);
    if (
      map[sy2][sx2] === T.FLOOR &&
      !(sx2 === su.x && sy2 === su.y) &&
      !(sx2 === sd.x && sy2 === sd.y) &&
      !traps.some((t) => t.x === sx2 && t.y === sy2) &&
      !occ(sx2, sy2) &&
      !springs.some((s) => s.x === sx2 && s.y === sy2)
    ) {
      springs.push({
        id: uid(),
        x: sx2,
        y: sy2,
        tile: TI.SPRING,
        contents: [],
      });
    }
  }
  const bigboxes = [];
  for (let bi = 0; bi < 3; bi++) {
    {
      const br = rooms[rng(0, rooms.length - 1)];
      for (let ba = 0; ba < 60; ba++) {
        const bx = rng(br.x + 1, br.x + br.w - 2),
          by = rng(br.y + 1, br.y + br.h - 2);
        if (map[by][bx] !== T.FLOOR) continue;
        if (bx === su.x && by === su.y) continue;
        if (bx === sd.x && by === sd.y) continue;
        if (traps.some((t) => t.x === bx && t.y === by)) continue;
        if (springs.some((s) => s.x === bx && s.y === by)) continue;
        if (items.some((i) => i.x === bx && i.y === by)) continue;
        if (bigboxes.some((b) => b.x === bx && b.y === by)) continue;
        if (occ(bx, by)) continue;
        const bbt = BB_TYPES[rng(0, BB_TYPES.length - 1)];
        bigboxes.push({
          id: uid(),
          x: bx,
          y: by,
          tile: TI.BIGBOX,
          kind: bbt.kind,
          name: bbt.name,
          capacity: bbt.cap(),
          contents: [],
        });
        break;
      }
    }
  }
  const vis = Array.from({ length: MH }, () => Array(MW).fill(false));
  const exp = Array.from({ length: MH }, () => Array(MW).fill(false));
  let shopData = null;
  if (shopRoomIdx >= 0) {
    const sr2 = rooms[shopRoomIdx];
    let entrance = null;
    for (let xi = sr2.x - 1; xi <= sr2.x + sr2.w && !entrance; xi++) {
      if (
        xi >= 0 &&
        xi < MW &&
        sr2.y - 1 >= 0 &&
        map[sr2.y - 1]?.[xi] === T.FLOOR
      )
        entrance = { x: xi, y: sr2.y - 1 };
      if (
        xi >= 0 &&
        xi < MW &&
        sr2.y + sr2.h < MH &&
        map[sr2.y + sr2.h]?.[xi] === T.FLOOR
      )
        entrance = { x: xi, y: sr2.y + sr2.h };
    }
    for (let yi = sr2.y; yi < sr2.y + sr2.h && !entrance; yi++) {
      if (sr2.x - 1 >= 0 && map[yi]?.[sr2.x - 1] === T.FLOOR)
        entrance = { x: sr2.x - 1, y: yi };
      if (sr2.x + sr2.w < MW && map[yi]?.[sr2.x + sr2.w] === T.FLOOR)
        entrance = { x: sr2.x + sr2.w, y: yi };
    }
    if (!entrance) entrance = { x: sr2.cx, y: sr2.cy };
    let insidePos;
    if (entrance.y < sr2.y) insidePos = { x: entrance.x, y: sr2.y };
    else if (entrance.y >= sr2.y + sr2.h)
      insidePos = { x: entrance.x, y: sr2.y + sr2.h - 1 };
    else if (entrance.x < sr2.x) insidePos = { x: sr2.x, y: entrance.y };
    else insidePos = { x: sr2.x + sr2.w - 1, y: entrance.y };
    const socc2 = (x, y) => items.some((i) => i.x === x && i.y === y);
    const shopCands = [
      ...ITEMS.filter((i) => i.type !== "gold"),
      ...WANDS.map((w) => ({
        ...w,
        charges: Math.max(1, w.charges + rng(-1, 1)),
      })),
      ...SPELLBOOKS,
      { ...ARROW_T },
      { ...MAGIC_MARKER, charges: rng(1, 2) },
    ];
    const shopCols = clamp(Math.floor(sr2.w / 2), 2, 5);
    const shopRows = clamp(Math.floor(sr2.h / 2), 2, 5);
    const shopStartX = sr2.x + Math.floor((sr2.w - shopCols) / 2);
    const shopStartY = sr2.y + Math.floor((sr2.h - shopRows) / 2);
    for (let row = 0; row < shopRows; row++) {
      for (let col = 0; col < shopCols; col++) {
        const six = shopStartX + col;
        const siy = shopStartY + row;
        if (
          map[siy]?.[six] === T.FLOOR &&
          !socc2(six, siy) &&
          !(six === insidePos.x && siy === insidePos.y)
        ) {
          const base = shopCands[rng(0, shopCands.length - 1)];
          const sit = { ...base, id: uid(), x: six, y: siy };
          if (sit.type === "arrow") sit.count = rng(5, 20);
          sit.shopPrice = Math.ceil(itemPrice(sit) * (1 + depth * 0.1));
          items.push(sit);
        }
      }
    }
    const sk = {
      id: uid(),
      name: "店主",
      hp: 100,
      maxHp: 100,
      atk: 12,
      def: 6,
      exp: 0,
      speed: 1,
      tile: TI.SHOPKEEPER,
      type: "shopkeeper",
      state: "friendly",
      blockPos: { ...entrance },
      homePos: { ...insidePos },
      x: insidePos.x,
      y: insidePos.y,
      turnAccum: 0,
      aware: false,
      dir: { x: 0, y: 1 },
      lastPx: 0,
      lastPy: 0,
      patrolTarget: null,
      sleepTurns: 0,
    };
    mons.push(sk);
    shopData = {
      roomIdx: shopRoomIdx,
      room: sr2,
      entrance,
      shopkeeperId: sk.id,
      unpaidTotal: 0,
    };
  }
  return {
    map,
    rooms,
    monsters: mons,
    items,
    traps,
    springs,
    bigboxes,
    stairUp: su,
    stairDown: sd,
    visible: vis,
    explored: exp,
    shop: shopData,
    pentacles: [],
  };
}
/* Canvas drawing helper */ function drawTile(ctx, ts, idx, dx, dy, sz) {
  const ci = customTileImages[idx];
  if (ci) {
    ctx.drawImage(ci, dx, dy, sz, sz);
    return;
  }
  if (idx === TI.SPRING) {
    ctx.fillStyle = "#1a3a5a";
    ctx.fillRect(dx, dy, sz, sz);
    ctx.fillStyle = "#4af";
    ctx.font = `bold ${Math.floor(sz * 0.7)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("♨", dx + sz / 2, dy + sz / 2);
    ctx.textAlign = "start";
    return;
  }
  if (idx === TI.POT) {
    ctx.fillStyle = "#3a2a1a";
    ctx.fillRect(dx + sz * 0.2, dy + sz * 0.15, sz * 0.6, sz * 0.7);
    ctx.fillStyle = "#5a3a1a";
    ctx.fillRect(dx + sz * 0.15, dy + sz * 0.3, sz * 0.7, sz * 0.5);
    ctx.fillStyle = "#7a5a2a";
    ctx.fillRect(dx + sz * 0.3, dy + sz * 0.1, sz * 0.4, sz * 0.25);
    ctx.textAlign = "start";
    return;
  }
  const TILE_RENDER = {
    0: { bg: "#1a1a22", fg: "#3a3a4a", ch: "#" },
    1: { bg: "#0c0c14", fg: "#252530", ch: "." },
    2: { bg: "#0c0c14", fg: "#0ff", ch: ">" },
    3: { bg: "#0c0c14", fg: "#0f0", ch: "<" },
    4: { bg: "#080810", fg: "#1a1a22", ch: ":" },
    5: { bg: null, fg: "#ffe030", ch: "@" },
    6: { bg: null, fg: "#c08050", ch: "r" },
    7: { bg: null, fg: "#70a050", ch: "k" },
    8: { bg: null, fg: "#40a070", ch: "g" },
    9: { bg: null, fg: "#c0c0b0", ch: "s" },
    10: { bg: null, fg: "#60a050", ch: "z" },
    11: { bg: null, fg: "#90a040", ch: "O" },
    12: { bg: null, fg: "#40b040", ch: "~" },
    13: { bg: null, fg: "#806030", ch: "T" },
    14: { bg: null, fg: "#f04020", ch: "D" },
    15: { bg: null, fg: "#9040d0", ch: "V" },
    16: { bg: null, fg: "#f050e0", ch: "\!" },
    17: { bg: null, fg: "#f090f0", ch: "\!" },
    18: { bg: null, fg: "#f0f050", ch: "?" },
    19: { bg: null, fg: "#50c050", ch: "%" },
    20: { bg: null, fg: "#a0a0a0", ch: "/" },
    21: { bg: null, fg: "#5090c0", ch: "[" },
    22: { bg: null, fg: "#f0d000", ch: "$" },
    23: { bg: null, fg: "#d0a050", ch: "|" },
    24: { bg: null, fg: "#a050f0", ch: "\\" },
    25: { bg: null, fg: "#f03030", ch: "^" },
    26: { bg: null, fg: "#f08030", ch: "^" },
    27: { bg: null, fg: "#804040", ch: "^" },
    28: { bg: null, fg: "#909090", ch: "^" },
    29: { bg: null, fg: "#4080f0", ch: "^" },
    30: { bg: null, fg: "#80f040", ch: "^" },
    37: { bg: null, fg: "#f0c040", ch: "S" },
    38: { bg: "#1a1008", fg: "#c07830", ch: "B" },
    39: { bg: null, fg: "#e09030", ch: "A" },
    40: { bg: null, fg: "#60a0ff", ch: "W" },
    41: { bg: null, fg: "#ff80c0", ch: "P" },
    42: { bg: null, fg: "#a060ff", ch: "◇" },
    43: { bg: null, fg: "#9988cc", ch: "Φ" },
    44: { bg: null, fg: "#b020e0", ch: "C" },
    45: { bg: null, fg: "#60d060", ch: "^" },
    46: { bg: null, fg: "#d020d0", ch: "^" },
    47: { bg: null, fg: "#20d0d0", ch: "^" },
    48: { bg: null, fg: "#8040e0", ch: "^" },
    49: { bg: null, fg: "#d0d020", ch: "^" },
    50: { bg: null, fg: "#d06000", ch: "^" },
    51: { bg: null, fg: "#20e0c0", ch: "^" },
  };
  const td = TILE_RENDER[idx];
  if (td) {
    if (td.bg) {
      ctx.fillStyle = td.bg;
      ctx.fillRect(dx, dy, sz, sz);
    }
    ctx.fillStyle = td.fg;
    ctx.font = "bold " + Math.floor(sz * 0.75) + "px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(td.ch, dx + sz / 2, dy + sz / 2);
    ctx.textAlign = "start";
  }
}
const VW_M = 21,
  VH_M = 15,
  VW_D = 60,
  VH_D = 28,
  VW_L = 36,
  VH_L = 18;
/* 拾い/置き/商品メッセージ用：杖・ペン・マーカーは残り回数、対象アイテムは祝呪を付加 */
function _itemPickupSuffix(it, ident) {
  if (!it) return "";
  const _key = getIdentKey(it);
  const _isIdent = !_key || ident?.has(_key);
  if (!_isIdent) return "";  // 未識別なら何も表示しない
  /* 識別対象アイテムはfullIdentのみ回数・祝呪を表示 */
  if (_key && !it.fullIdent) return "";
  const _chgTypes = new Set(["wand", "pen", "marker"]);
  const _bcTypes  = new Set(["wand", "pen", "marker", "potion", "scroll", "bottle"]);
  if (!_bcTypes.has(it.type)) return "";
  const charge = _chgTypes.has(it.type) && it.charges != null ? `[${it.charges}回]` : "";
  const state  = it.blessed ? "【祝】" : it.cursed ? "【呪】" : "";
  return (charge || state) ? ` ${charge}${state}` : "";
}

/* 落とし穴バッグを処理して落下エンティティを次の階に配置する */
function processPitfallBag(bag, floors, depth) {
  if (!bag || bag.length === 0) return;
  const nd = depth + 1;
  if (!floors[nd]) floors[nd] = genDungeon(nd - 1);
  const nf = floors[nd];
  for (const { kind, entity } of bag) {
    const room = nf.rooms[rng(0, nf.rooms.length - 1)];
    entity.x = rng(room.x, room.x + room.w - 1);
    entity.y = rng(room.y, room.y + room.h - 1);
    if (kind === 'item') nf.items.push(entity);
    else if (kind === 'monster') nf.monsters.push(entity);
  }
}

/* アイテム表示名を返す（未識別なら偽名 or ニックネーム、識別済みなら本名優先） */
function itemDisplayName(it, fakeNames, ident, nicknames) {
  const key = getIdentKey(it);
  if (!key) return it.name;
  // 識別済みなら本名を優先（ニックネームより優先）
  if (ident?.has(key)) return it.name;
  if (nicknames?.[key]) {
    const _pfx = key[0]==='p' ? '薬' : key[0]==='s' ? '巻' : key[0]==='w' ? '杖' : key[0]==='n' ? 'ペン' : key[0]==='b' ? '書' : '壺';
    return `${_pfx}:${nicknames[key]}`;
  }
  return fakeNames?.[key] ?? it.name;
}

export default function RoguelikeGame() {
  const [gs, setGs] = useState(null);
  const [msgs, setMsgs] = useState(["冒険が始まった！"]);
  const [showInv, setShowInv] = useState(false);
  const [dropMode, setDropMode] = useState(false);
  const dropModeRef = useRef(false);
  const [selIdx, setSelIdx] = useState(null);
  const [invPage, setInvPage] = useState(0);
  const [invMenuSel, setInvMenuSel] = useState(null);
  const [showDesc, setShowDesc] = useState(null);
  const [throwMode, setThrowMode] = useState(null);
  const [springMode, setSpringMode] = useState(null);
  const [springMenuSel, setSpringMenuSel] = useState(0);
  const [springPage, setSpringPage] = useState(0);
  const [bigboxMode, setBigboxMode] = useState(null);
  const [bigboxMenuSel, setBigboxMenuSel] = useState(0);
  const [bigboxPage, setBigboxPage] = useState(0);
  const bigboxRef = useRef(null);
  const [facingMode, setFacingMode] = useState(false);
  const springTargetRef = useRef(null);
  const [shopMode, setShopMode] = useState(null);
  const [shopMenuSel, setShopMenuSel] = useState(0);
  const [putMenuSel, setPutMenuSel] = useState(0);
  const [putPage, setPutPage] = useState(0);
  /* null | "menu" | "soak" */ const [putMode, setPutMode] = useState(null);
  /* null | {markerIdx,step:"select_blank"|"select_type",blankIdx:number|null} */
  const [markerMode, setMarkerMode] = useState(null);
  const [markerMenuSel, setMarkerMenuSel] = useState(0);
  const [spellListMode, setSpellListMode] = useState(false);
  const [spellMenuSel, setSpellMenuSel] = useState(0);
  /* null | {potIdx:number} */ const [dashMode, setDashMode] = useState(false);
  /* null | {cx:number, cy:number} */ const [tpSelectMode, setTpSelectMode] = useState(null);
  /* null | { mode:'identify'|'unidentify' } */ const [identifyMode, setIdentifyMode] = useState(null);
  /* null | { identKey:string } */ const [nicknameMode, setNicknameMode] = useState(null);
  /* null | { pendingMsgs:string[] } */ const [revealMode, setRevealMode] = useState(null);
  const [nicknameInput, setNicknameInput] = useState('');
  /* mobile dash toggle */ const [dead, setDead] = useState(false);
  const [showScores, setShowScores] = useState(false);
  const [gameOverSel, setGameOverSel] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [ctLoaded, setCtLoaded] = useState(0);
  const [showTileEditor, setShowTileEditor] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [portraitSrc, setPortraitSrc] = useState(null);
  const loadCustomTile = (idx, file) => {
    const r = new FileReader();
    r.onload = (e) => {
      const d = e.target.result;
      const img = new Image();
      img.onload = () => {
        customTileImages[idx] = img;
        setCtLoaded((c) => c + 1);
      };
      img.src = d;
      const name = TILE_NAMES[idx];
      if (name) {
        fetch("/api/save-tile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, data: d }),
        }).catch(() => {});
      }
      try {
        localStorage.setItem(`roguelike_tile_${idx}`, d);
      } catch (e) {}
    };
    r.readAsDataURL(file);
  };
  const clearCustomTile = (idx) => {
    delete customTileImages[idx];
    setCtLoaded((c) => c + 1);
    const name = TILE_NAMES[idx];
    if (name) {
      fetch("/api/delete-tile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).catch(() => {});
    }
    localStorage.removeItem(`roguelike_tile_${idx}`);
  };
  const loadPortrait = (file) => {
    const r = new FileReader();
    r.onload = (e) => {
      const d = e.target.result;
      setPortraitSrc(d);
      fetch("/api/save-portrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: d }),
      }).catch(() => {});
      try {
        localStorage.setItem("roguelike_portrait", d);
      } catch (ex) {}
    };
    r.readAsDataURL(file);
  };
  const clearPortrait = () => {
    setPortraitSrc(null);
    fetch("/api/delete-portrait", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => {});
    localStorage.removeItem("roguelike_portrait");
  };
  const ref = useRef(null),
    sr = useRef(null),
    msgRef = useRef(null),
    execRef = useRef(null),
    invActRef = useRef(null),
    doMarkerWriteRef = useRef(null);
  const canvasRef = useRef(null);
  useEffect(() => {
    const c = () => {
      setMobile(Math.min(window.innerWidth, window.innerHeight) < 700);
      setLandscape(window.innerWidth > window.innerHeight);
    };
    c();
    window.addEventListener("resize", c);
    return () => window.removeEventListener("resize", c);
  }, []);
  /* Load custom tile images (silently fail if not found — spritesheet fallback) */ useEffect(() => {
    customTileImages = {};
    Object.entries(TILE_NAMES).forEach(([idx, name]) => {
      const iidx = parseInt(idx);
      const img = new Image();
      img.onload = () => {
        customTileImages[iidx] = img;
        setCtLoaded((c) => c + 1);
      };
      img.onerror = () => {
        const saved = localStorage.getItem(`roguelike_tile_${idx}`);
        if (saved) {
          const i2 = new Image();
          i2.onload = () => {
            customTileImages[iidx] = i2;
            setCtLoaded((c) => c + 1);
          };
          i2.src = saved;
        }
      };
      img.src = `/tiles/${name}.png`;
    });
  }, []);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setPortraitSrc("/portraits/player.png?v=" + Date.now());
    img.onerror = () => {
      const s = localStorage.getItem("roguelike_portrait");
      if (s) setPortraitSrc(s);
    };
    img.src = "/portraits/player.png?v=" + Date.now();
  }, []);
  const init = useCallback(() => {
    setDead(false);
    setMsgs(["冒険が始まった！"]);
    setShowInv(false);
    setSelIdx(null);
    setShowDesc(null);
    setThrowMode(null);
    setSpringMode(null);
    setPutMode(null);
    setDashMode(false);
    const d = genDungeon(0);
    d.nextSpawnTurn = rng(10, 50);
    const p = {
      x: d.stairUp.x,
      y: d.stairUp.y,
      hp: 30,
      maxHp: 30,
      mp: 20,
      maxMp: 20,
      atk: 5,
      def: 2,
      level: 1,
      exp: 0,
      nextExp: 20,
      hunger: 100,
      maxHunger: 100,
      gold: 0,
      depth: 1,
      weapon: null,
      armor: null,
      arrow: null,
      inventory: [
        { name:"識別の巻物",   type:"scroll",    effect:"identify",   desc:"持ち物から1つ選んで識別する。祝福：全識別。呪い：識別を解除。", tile:18 },
        { name:"識別の魔法書", type:"spellbook", spell:"identify_magic", desc:"識別の魔法を習得できる。火に弱い。", tile:18 },
        { name:"祝福の魔法書", type:"spellbook", spell:"bless_magic",    desc:"祝福の魔法を習得できる。火に弱い。", tile:18 },
        { name:"呪いの魔法書", type:"spellbook", spell:"curse_magic",    desc:"呪いの魔法を習得できる。火に弱い。", tile:18 },
        { name:"加熱の壺",     type:"pot",       potEffect:"boil",    capacity:3, contents:[], desc:"薬を入れると部屋中に薬効が広がる。", tile:32 },
        { name:"遠投のペン",   type:"pen",       effect:"farcast",    charges:2, desc:"足元に遠投の魔方陣を描く。部屋内で投げたものが壁まで貫通して飛ぶ。チャージ制。", tile:42 },
        { name:"識別の巻物",   type:"scroll",    effect:"identify",   blessed:true, desc:"持ち物から1つ選んで識別する。祝福：全識別。呪い：識別を解除。", tile:18 },
        { name:"マップの巻物", type:"scroll",    effect:"reveal",     blessed:true, desc:"フロア全体と罠が明らかになる。",                                 tile:18 },
        { name:"収納上手の巻物", type:"scroll",  effect:"expand_inv", desc:"最大所持数が1～3増える。祝福：2～6増える。呪い：1～3減る。", tile:18 },
        { name:"複製の巻物",   type:"scroll",    effect:"duplicate",  blessed:true, desc:"持ち物から1つ選んで複製する。祝福：2つ増える。呪い：選んだものが消える。", tile:18 },
        { name:"複製の巻物",   type:"scroll",    effect:"duplicate",  blessed:true, desc:"持ち物から1つ選んで複製する。祝福：2つ増える。呪い：選んだものが消える。", tile:18 },
        { name:"複製の巻物",   type:"scroll",    effect:"duplicate",  blessed:true, desc:"持ち物から1つ選んで複製する。祝福：2つ増える。呪い：選んだものが消える。", tile:18 },
        { name:"複製の巻物",   type:"scroll",    effect:"duplicate",  blessed:true, desc:"持ち物から1つ選んで複製する。祝福：2つ増える。呪い：選んだものが消える。", tile:18 },
        { name:"複製の巻物",   type:"scroll",    effect:"duplicate",  blessed:true, desc:"持ち物から1つ選んで複製する。祝福：2つ増える。呪い：選んだものが消える。", tile:18 },
        { name:"マップの巻物", type:"scroll",    effect:"reveal",     blessed:true, desc:"フロア全体と罠が明らかになる。",                                 tile:18 },
        { name:"マップの巻物", type:"scroll",    effect:"reveal",     blessed:true, desc:"フロア全体と罠が明らかになる。",                                 tile:18 },
        { name:"マップの巻物", type:"scroll",    effect:"reveal",     blessed:true, desc:"フロア全体と罠が明らかになる。",                                 tile:18 },
        { name:"マップの巻物", type:"scroll",    effect:"reveal",     blessed:true, desc:"フロア全体と罠が明らかになる。",                                 tile:18 },
        { name:"マップの巻物", type:"scroll",    effect:"reveal",     blessed:true, desc:"フロア全体と罠が明らかになる。",                                 tile:18 },
        { name:"道具寄せの巻物", type:"scroll",  effect:"item_gather",blessed:true, desc:"フロアのアイテムを自分の周りに引き寄せる。",                     tile:18 },
        { name:"道具寄せの巻物", type:"scroll",  effect:"item_gather",blessed:true, desc:"フロアのアイテムを自分の周りに引き寄せる。",                     tile:18 },
        { name:"道具寄せの巻物", type:"scroll",  effect:"item_gather",blessed:true, desc:"フロアのアイテムを自分の周りに引き寄せる。",                     tile:18 },
        { name:"道具寄せの巻物", type:"scroll",  effect:"item_gather",blessed:true, desc:"フロアのアイテムを自分の周りに引き寄せる。",                     tile:18 },
        { name:"道具寄せの巻物", type:"scroll",  effect:"item_gather",blessed:true, desc:"フロアのアイテムを自分の周りに引き寄せる。",                     tile:18 },
        { name:"雷の巻物",     type:"scroll",    effect:"thunder",    blessed:true, desc:"視界内の敵全てに雷ダメージを与える。",                           tile:18 },
      ],
      spells: [],
      spellLevels: {},
      turns: 0,
      sleepTurns: 0,
      paralyzeTurns: 0,
      slowTurns: 0,
      slowSkip: false,
      hasteTurns: 0,
      hasteUsed: false,
      confusedTurns: 0,
      poisoned: false,
      poisonAtkLoss: 0,
      sealedTurns: 0,
      maxInventory: 100,
      facing: { dx: 0, dy: 1 },
      isThief: false,
      deathCause: "不明の原因により",
    };
    computeFOV(d.map, p.x, p.y, (p.darknessTurns || 0) > 0 ? 1 : 6, d.visible, d.explored);
    const s = { player: p, dungeon: d, floors: {}, ident: new Set(), fakeNames: generateFakeNames([...ITEMS, ...WANDS], POTS, SPELLBOOKS), nicknames: {} };
    sr.current = s;
    setGs(s);
    ref.current?.focus();
  }, []);
  useEffect(init, [init]);
  useEffect(() => {
    if (msgRef.current) msgRef.current.scrollTop = msgRef.current.scrollHeight;
  }, [msgs]);

  /* Canvas render */ useEffect(() => {
    if (!gs || !canvasRef.current) return;
    const cvs = canvasRef.current,
      ctx = cvs.getContext("2d");
    const ts = null;
    const { player: p, dungeon: dg } = gs;
    const vw = mobile ? (landscape ? VW_L : VW_M) : VW_D;
    const contW = cvs.parentElement?.clientWidth || 600;
    const sz = Math.max(12, Math.floor(contW / vw));
    /* モバイル縦：画面高さからUI要素分を引いてマップ表示行数を動的計算 */
    let vh;
    if (mobile && !landscape) {
      const uiH = 224; /* ステータスバー+HPバー+メッセージログ(4行)+操作ボタン+余白 */
      const availH = window.innerHeight - uiH;
      vh = Math.max(VH_M, Math.min(Math.floor(availH / sz), MH));
    } else {
      vh = mobile ? VH_L : VH_D;
    }
    const cw = vw * sz,
      ch = vh * sz;
    cvs.width = cw;
    cvs.height = ch;
    cvs.style.width = cw + "px";
    cvs.style.height = ch + "px";
    ctx.imageSmoothingEnabled = false;
    const hw = Math.floor(vw / 2),
      hh = Math.floor(vh / 2);
    const _camCx = tpSelectMode ? tpSelectMode.cx : p.x;
    const _camCy = tpSelectMode ? tpSelectMode.cy : p.y;
    const sx = clamp(_camCx - hw, 0, Math.max(0, MW - vw)),
      sy = clamp(_camCy - hh, 0, Math.max(0, MH - vh));
    ctx.fillStyle = "#080810";
    ctx.fillRect(0, 0, cw, ch);
    for (let vy = 0; vy < vh; vy++) {
      for (let vx = 0; vx < vw; vx++) {
        const x = sx + vx,
          y = sy + vy;
        if (x < 0 || x >= MW || y < 0 || y >= MH) continue;
        const px2 = vx * sz,
          py2 = vy * sz;
        const vis = dg.visible[y][x],
          exp2 = dg.explored[y][x];
        if (!vis && !exp2) {
          if (tpSelectMode && dg.map[y][x] !== T.WALL && dg.map[y][x] !== T.BWALL) {
            ctx.fillStyle = "#0d0d1a";
            ctx.fillRect(px2, py2, sz, sz);
          }
          continue;
        }
        /* Draw base tile */ const t = dg.map[y][x];
        let ti = TI.FLOOR;
        if (t === T.WALL || t === T.BWALL) ti = TI.WALL;
        else if (t === T.SD) ti = TI.SD;
        else if (t === T.SU) ti = TI.SU;
        /* Check if in corridor (not in any room) */ if (
          t === T.FLOOR &&
          !dg.rooms.some(
            (r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h,
          )
        )
          ti = TI.CORR;
        drawTile(ctx, ts, ti, px2, py2, sz);
        /* 壊せる壁にヒビ表示 */
        if (t === T.BWALL && (vis || exp2)) {
          if (!vis) ctx.globalAlpha = 0.4;
          ctx.strokeStyle = "#aa8844";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px2 + sz * 0.3, py2 + sz * 0.15);
          ctx.lineTo(px2 + sz * 0.5, py2 + sz * 0.5);
          ctx.lineTo(px2 + sz * 0.7, py2 + sz * 0.85);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(px2 + sz * 0.5, py2 + sz * 0.5);
          ctx.lineTo(px2 + sz * 0.7, py2 + sz * 0.35);
          ctx.stroke();
          if (!vis) ctx.globalAlpha = 1;
        }
        /* Spring */ const spr = dg.springs?.find(
          (s) => s.x === x && s.y === y,
        );
        if (spr && (vis || exp2)) {
          if (!vis) ctx.globalAlpha = 0.4;
          drawTile(ctx, ts, TI.SPRING, px2, py2, sz);
          if (!vis) ctx.globalAlpha = 1;
        }
        const bba = dg.bigboxes?.find((b) => b.x === x && b.y === y);
        if (bba && (vis || exp2)) {
          if (!vis) ctx.globalAlpha = 0.4;
          drawTile(ctx, ts, TI.BIGBOX, px2, py2, sz);
          if (!vis) ctx.globalAlpha = 1;
        }
        /* Pentacle (魔方陣) */
        const _pent = dg.pentacles?.find((pc) => pc.x === x && pc.y === y);
        if (_pent && vis) {
          const _pentClr =
            _pent.kind === "sanctuary"    ? (_pent.blessed ? "#c0ffd8" : _pent.cursed ? "#800040" : "#40ff80") :
            _pent.kind === "vulnerability"? (_pent.blessed ? "#ff9060" : _pent.cursed ? "#804020" : "#ff6020") :
            _pent.kind === "magic_seal"   ? (_pent.blessed ? "#c0a0ff" : _pent.cursed ? "#403080" : "#8060ff") :
            _pent.kind === "thunder_trap" ? (_pent.blessed ? "#ffffa0" : _pent.cursed ? "#806020" : "#ffe040") :
            _pent.kind === "farcast"      ? (_pent.blessed ? "#a0ffff" : _pent.cursed ? "#204060" : "#40c0e0") : "#ff6020";
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = _pentClr;
          ctx.fillRect(px2, py2, sz, sz);
          ctx.globalAlpha = 1;
          ctx.fillStyle = _pentClr;
          ctx.font = `bold ${Math.floor(sz * 0.78)}px monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("✦", px2 + sz / 2, py2 + sz / 2);
        }
        if (vis) {
          /* Player */ if (x === p.x && y === p.y) {
            const pf = p.facing || { dx: 0, dy: 1 };
            const pti =
              pf.dy > 0
                ? TI.PLAYER_DOWN
                : pf.dy < 0
                  ? TI.PLAYER_UP
                  : pf.dx < 0
                    ? TI.PLAYER_LEFT
                    : TI.PLAYER_RIGHT;
            drawTile(
              ctx,
              ts,
              customTileImages[pti] ? pti : TI.PLAYER,
              px2,
              py2,
              sz,
            );
            continue;
          }
          /* Monster (壁歩きは別パスで描画) */ const mon = dg.monsters.find(
            (m) => m.x === x && m.y === y && !m.wallWalker,
          );
          if (mon) {
            const _monTile = (p.bewitchedTurns || 0) > 0
              ? [16, 17, 18, 20, 21, 22, 23, 24, 32][(x * 7 + y * 13) % 9]
              : mon.tile;
            drawTile(ctx, ts, _monTile, px2, py2, sz);
            /* HP bar */ if (mon.hp < mon.maxHp) {
              const bw = sz - 2,
                bh = 2,
                hpR = mon.hp / mon.maxHp;
              ctx.fillStyle = "#300";
              ctx.fillRect(px2 + 1, py2, bw, bh);
              ctx.fillStyle = hpR > 0.5 ? "#0c0" : hpR > 0.25 ? "#cc0" : "#f22";
              ctx.fillRect(px2 + 1, py2, Math.max(1, bw * hpR), bh);
            }
            continue;
          }
          /* Item */ const it = dg.items.find((i) => i.x === x && i.y === y);
          if (it) {
            const _itTile = (p.bewitchedTurns || 0) > 0
              ? [16, 17, 18, 20, 21, 22, 23, 24, 32][(x * 11 + y * 19) % 9]
              : it.tile;
            drawTile(ctx, ts, _itTile, px2, py2, sz);
            continue;
          }
          /* Trap */ const tr = dg.traps.find(
            (t2) => t2.x === x && t2.y === y && t2.revealed,
          );
          if (tr) {
            drawTile(ctx, ts, tr.tile, px2, py2, sz);
          }
        } else if (exp2) {
          /* Dim explored tiles */ ctx.fillStyle = "rgba(0,0,8,0.6)";
          ctx.fillRect(px2, py2, sz, sz);
          /* 祝福マップ：探索済みタイルにアイテムを薄く表示 */
          if (dg.itemsRevealed) {
            const ri = dg.items.find((i) => i.x === x && i.y === y);
            if (ri) { ctx.globalAlpha = 0.35; drawTile(ctx, ts, ri.tile, px2, py2, sz); ctx.globalAlpha = 1; }
          }
          /* Show revealed traps dimly */ const tr = dg.traps.find(
            (t2) => t2.x === x && t2.y === y && t2.revealed,
          );
          if (tr) {
            ctx.globalAlpha = 0.3;
            drawTile(ctx, ts, tr.tile, px2, py2, sz);
            ctx.globalAlpha = 1;
          }
        }
      }
    }
    /* ===== 壁歩きモンスターを常に最前面に描画（壁の中でも可視） ===== */
    for (const _wm of dg.monsters) {
      if (!_wm.wallWalker) continue;
      if (_wm.x < sx || _wm.x >= sx + vw || _wm.y < sy || _wm.y >= sy + vh) continue;
      const _wpx = (_wm.x - sx) * sz, _wpy = (_wm.y - sy) * sz;
      const _onWall = dg.map[_wm.y]?.[_wm.x] === T.WALL;
      if (_onWall) ctx.globalAlpha = 0.75;
      drawTile(ctx, ts, _wm.tile, _wpx, _wpy, sz);
      ctx.globalAlpha = 1;
      if (_wm.hp < _wm.maxHp) {
        const bw = sz - 2, bh = 2, hpR = _wm.hp / _wm.maxHp;
        ctx.fillStyle = "#300"; ctx.fillRect(_wpx + 1, _wpy, bw, bh);
        ctx.fillStyle = hpR > 0.5 ? "#0c0" : hpR > 0.25 ? "#cc0" : "#f22";
        ctx.fillRect(_wpx + 1, _wpy, Math.max(1, bw * hpR), bh);
      }
    }
    /* tpSelectMode cursor overlay */
    if (tpSelectMode) {
      const { cx: _tcx, cy: _tcy } = tpSelectMode;
      if (_tcx >= sx && _tcx < sx + vw && _tcy >= sy && _tcy < sy + vh) {
        const _cpx = (_tcx - sx) * sz, _cpy = (_tcy - sy) * sz;
        const _tgtWall = dg.map[_tcy]?.[_tcx] === T.WALL || dg.map[_tcy]?.[_tcx] === T.BWALL;
        ctx.fillStyle = _tgtWall ? "rgba(255,60,60,0.25)" : "rgba(255,220,40,0.25)";
        ctx.fillRect(_cpx, _cpy, sz, sz);
        ctx.strokeStyle = _tgtWall ? "#ff4040" : "#ffe040";
        ctx.lineWidth = 2;
        ctx.strokeRect(_cpx + 1, _cpy + 1, sz - 2, sz - 2);
      }
    }
  }, [gs, mobile, landscape, ctLoaded, tpSelectMode]);
  const lu = useCallback((p, ml) => {
    while (p.exp >= p.nextExp) {
      p.level++;
      p.exp -= p.nextExp;
      p.nextExp = Math.floor(p.nextExp * 1.5);
      p.maxHp += 5;
      p.hp = Math.min(p.hp + 10, p.maxHp);
      p.atk++;
      p.def++;
      ml.push(`レベルアップ！Lv.${p.level}！`);
    }
  }, []);
  const autoPickup = useCallback((p, dg, ml) => {
    let go = true;
    while (go) {
      go = false;
      const it = dg.items.find((i) => i.x === p.x && i.y === p.y);
      if (!it) break;
      if (it.type === "gold") {
        p.gold += it.value;
        ml.push(`${it.value}枚の金貨を拾った！`);
        dg.items = dg.items.filter((i) => i !== it);
        go = true;
      } else if (it.type === "arrow" && !it.shopPrice) {
        if (addArrowsInv(p.inventory, it.count, !!it.poison, !!it.pierce, p.maxInventory || 30)) {
          ml.push(`${it.name || "矢"}(${it.count}本)を拾った。`);
          dg.items = dg.items.filter((i) => i !== it);
          go = true;
        } else {
          ml.push(`${it.name || "矢"}がある。持ち物がいっぱいだ！`);
          break;
        }
      } else if (it.shopPrice) {
        ml.push(`${itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}${_itemPickupSuffix(it, sr.current?.ident)}がある（商品：${it.shopPrice}G）gキーで拾う`);
        break;
      } else if (p.inventory.length < (p.maxInventory || 30)) {
        p.inventory.push(it);
        {
          const _w = it.type === "weapon",
            _a = it.type === "armor";
          let _lbl = itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
          if (_w || _a) {
            if (it.plus) _lbl += (it.plus > 0 ? "+" : "") + it.plus;
            _lbl += _w
              ? " (攻+" + (it.atk + (it.plus || 0)) + ")"
              : " (防+" + (it.def + (it.plus || 0)) + ")";
            const _AB = _w ? WEAPON_ABILITIES : ARMOR_ABILITIES;
            const _ids = [
              ...new Set([
                ...(it.abilities || []),
                ...(it.ability ? [it.ability] : []),
              ]),
            ];
            const _ns = _ids
              .map((id) => _AB.find((a) => a.id === id)?.name)
              .filter(Boolean);
            if (_ns.length) _lbl += " [" + _ns.join("・") + "]";
          }
          ml.push(_lbl + _itemPickupSuffix(it, sr.current?.ident) + "を拾った。");
        }
        dg.items = dg.items.filter((i) => i !== it);
        go = true;
      } else {
        ml.push(`${itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}がある。持ち物がいっぱいだ！`);
        break;
      }
    }
  }, []);
  const checkTrap = useCallback((p, dg, ml, isDash = false) => {
    const trap = dg.traps.find((t) => t.x === p.x && t.y === p.y);
    if (!trap) return null;
    if (isDash && trap.revealed) return null;
    const _nameFn = (it) => itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
    return fireTrapPlayer(trap, p, dg, ml, _nameFn);
  }, []);
  const moveMons = useCallback((dg, pl, ml) => {
    const opts = {
      bbFn: bigboxAddItem,
      fireTrapFn: (trap, p, dg2, ml2) => fireTrapPlayer(trap, p, dg2, ml2),
      monsterWandFn: (m, dx, dy) => {
        const _we = m.wandEffect || "lightning";
        if (_we === "lightning") {
          ml.push(`${m.name}が雷の杖を振った！`);
          monsterFireLightning(m.x, m.y, dg, pl, dx, dy, ml, lu, bigboxAddItem, m.name);
        } else if (_we === "curse_wand") {
          ml.push(`${m.name}が呪いの杖を振った！`);
          /* 呪いボルトを発射（魔封じチェック・障害物チェックあり） */
          let _cwHit = false;
          for (let _d = 1; _d < 20; _d++) {
            const _tx = m.x + dx * _d, _ty = m.y + dy * _d;
            if (inMagicSealRoom(_tx, _ty, dg)) { ml.push("魔法弾が魔封じの魔方陣で消えた！"); _cwHit = true; break; }
            if (_tx < 0 || _tx >= MW || _ty < 0 || _ty >= MH || dg.map[_ty][_tx] === T.WALL || dg.map[_ty][_tx] === T.BWALL) { ml.push("呪いの魔法弾は壁に消えた。"); _cwHit = true; break; }
            if (_tx === pl.x && _ty === pl.y) {
              /* 聖域チェック */
              if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y)) {
                ml.push("祝福された聖域の加護が呪いを防いだ！");
              } else {
                /* ランダムな所持品を呪う（金貨・矢を除く） */
                const _inv = pl.inventory.filter(i => i.type !== "gold" && i.type !== "arrow");
                if (_inv.length === 0) {
                  ml.push("所持品がないので呪いは無効だった。");
                } else {
                  const _cit = _inv[rng(0, _inv.length - 1)];
                  const _citDN = itemDisplayName(_cit, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
                  if (_cit.cursed) {
                    ml.push(`${_citDN}は既に呪われていた！（効果なし）`);
                  } else if (_cit.blessed) {
                    _cit.blessed = false; _cit.bcKnown = true;
                    ml.push(`${_citDN}の祝福が解けた！`);
                  } else {
                    _cit.cursed = true; _cit.bcKnown = true;
                    ml.push(`${_citDN}が呪われた！【呪】`);
                  }
                }
              }
              _cwHit = true; break;
            }
            const _hm = dg.monsters.find(mn => mn.x === _tx && mn.y === _ty);
            if (_hm) {
              _hm.speed = Math.max(0.25, (_hm.speed || 1) * 0.5);
              ml.push(`呪いの魔法弾が${_hm.name}に命中！鈍足になった！`);
              _cwHit = true; break;
            }
            const _hbb = dg.bigboxes?.find(b => b.x === _tx && b.y === _ty);
            if (_hbb) {
              const _newCap = Math.max(0, (_hbb.capacity || 1) - 1);
              if ((_hbb.contents?.length || 0) > _newCap) {
                const _fts2 = new Set();
                for (const _ci of (_hbb.contents || [])) placeItemAt(dg, _hbb.x, _hbb.y, _ci, ml, _fts2);
                dg.bigboxes = dg.bigboxes.filter(b => b !== _hbb);
                ml.push(`呪いの魔法弾が${_hbb.name}に命中！容量オーバーで壊れた！中身が飛び出した！`);
              } else {
                _hbb.capacity = _newCap;
                ml.push(`呪いの魔法弾が${_hbb.name}に命中！(容量-1 → ${_hbb.capacity})`);
              }
              _cwHit = true; break;
            }
            const _hit = dg.items.find(i => i.x === _tx && i.y === _ty);
            if (_hit) {
              const _hitDN = itemDisplayName(_hit, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
              if (_hit.type !== "gold" && _hit.type !== "arrow") {
                if (_hit.blessed) {
                  _hit.blessed = false;
                  ml.push(`呪いの魔法弾が${_hitDN}に命中！祝福が解けた！`);
                } else if (!_hit.cursed) {
                  _hit.cursed = true;
                  ml.push(`呪いの魔法弾が${_hitDN}に命中！呪われた！【呪】`);
                } else {
                  ml.push(`呪いの魔法弾が${_hitDN}に命中！（既に呪われている）`);
                }
              } else {
                ml.push(`呪いの魔法弾が${_hitDN}に命中したが効果がなかった。`);
              }
              _cwHit = true; break;
            }
            const _htr = dg.traps.find(t => t.x === _tx && t.y === _ty);
            if (_htr) {
              _htr.revealed = true;
              ml.push(`呪いの魔法弾が${_htr.name}に命中！罠が露わになった！`);
              _cwHit = true; break;
            }
          }
          if (!_cwHit) ml.push("呪いの魔法弾は虚空に消えた。");
        }
      },
      monsterDropFn: (m, dg2, ml2) => monsterDrop(m, dg2, ml2, pl),
    };
    dg.monsters.forEach((m) => {
      m.turnAccum += m.speed;
      while (m.turnAccum >= 1) {
        m.turnAccum -= 1;
        monsterAI(m, dg, pl, ml, opts);
      }
    });
  }, []);
  const chgFloor = useCallback((pl, dir, pitfall = false) => {
    const nd = pl.depth + dir;
    if (nd < 1) return null;
    if (!sr.current.floors) sr.current.floors = {};
    sr.current.floors[pl.depth] = sr.current.dungeon;
    const _saved = sr.current.floors[nd];
    let d;
    if (_saved) {
      d = _saved;
      delete sr.current.floors[nd];
    } else {
      d = genDungeon(nd - 1);
    }
    pl.depth = nd;
    if (pitfall) {
      const _pr = d.rooms[rng(0, d.rooms.length - 1)];
      pl.x = rng(_pr.x, _pr.x + _pr.w - 1);
      pl.y = rng(_pr.y, _pr.y + _pr.h - 1);
    } else {
      pl.x = dir > 0 ? d.stairUp.x : d.stairDown.x;
      pl.y = dir > 0 ? d.stairUp.y : d.stairDown.y;
    }
    computeFOV(d.map, pl.x, pl.y, (pl.darknessTurns || 0) > 0 ? 1 : 6, d.visible, d.explored);
    d.nextSpawnTurn = pl.turns + rng(10, 50);
    return d;
  }, []);
  const endTurn = useCallback(
    (st, p, ml) => {
      /* 落とし穴バッグをセット — moveMons内のmonsterDropなどで発動した落とし穴を収集 */
      const _etPfBag = [];
      setPitfallBag(_etPfBag);
      p.turns++;
      if (p.hp > 0 && p.hp < p.maxHp) {
        const regenAmt =
          Math.max(1, Math.floor(p.maxHp / 100)) +
          (p.armor?.ability === "regen" ||
          !!p.armor?.abilities?.includes("regen")
            ? 1
            : 0);
        p.hp = Math.min(p.maxHp, p.hp + regenAmt);
      }
      const hd =
        p.armor?.ability === "slow_hunger" ||
        !!p.armor?.abilities?.includes("slow_hunger")
          ? 2
          : 1;
      if (p.turns % (15 * hd) === 0) {
        p.hunger = Math.max(0, p.hunger - 1);
        if (p.hunger === 0) {
          p.deathCause = "空腹により";
          p.hp--;
          if (p.turns % (30 * hd) === 0) ml.push("空腹でHPが減っている...");
        }
      }
      /* MPクールダウンカウント */
      if ((p.mpCooldownTurns || 0) > 0) p.mpCooldownTurns--;
      /* 封印カウントダウン */
      if ((p.sealedTurns || 0) > 0) {
        p.sealedTurns--;
        if (p.sealedTurns === 0) ml.push("封印が解けた！");
      }
      /* 毒：3ターンごとに攻撃力-1 */
      if (p.poisoned && p.turns % 3 === 0) {
        if ((p.poisonAtkLoss || 0) >= 3) {
          p.poisoned = false;
          ml.push("毒の効果が切れた。攻撃力の低下は残っている...");
        } else if (p.atk > 1) {
          p.atk--;
          p.poisonAtkLoss = (p.poisonAtkLoss || 0) + 1;
          ml.push("毒に冒されている！攻撃力が下がった...");
          if (p.poisonAtkLoss >= 3) {
            p.poisoned = false;
            ml.push("毒の効果が切れた。");
          }
        }
      }
      /* 呪われた聖域の魔方陣：強制的に上に乗ると即死 */
      const _cursedSancOn = st.dungeon.pentacles?.find((pc) => pc.kind === "sanctuary" && pc.cursed && pc.x === p.x && pc.y === p.y);
      if (_cursedSancOn && p.hp > 0) {
        p.deathCause = `${_cursedSancOn.name}により`;
        p.hp = 0;
        ml.push(`${_cursedSancOn.name}に触れた！呪いの力で即死した！`);
      }
      /* 雷の魔方陣：真上にいると毎ターンダメージ（呪いは回復） */
      const _thunderPent = st.dungeon.pentacles?.find((pc) => pc.kind === "thunder_trap" && pc.x === p.x && pc.y === p.y);
      if (_thunderPent && p.hp > 0) {
        if (_thunderPent.cursed) {
          const _theal = Math.min(25, p.maxHp - p.hp);
          if (_theal > 0) { p.hp += _theal; ml.push(`${_thunderPent.name}の力でHPが${_theal}回復した！`); }
        } else {
          const _tdmg = _thunderPent.blessed ? 50 : 25;
          p.deathCause = `${_thunderPent.name}の雷撃により`;
          p.hp -= _tdmg;
          ml.push(`${_thunderPent.name}に打たれた！${_tdmg}ダメージ！`);
        }
      }
      checkShopTheft(p, st.dungeon, ml);
      moveMons(st.dungeon, p, ml);
      /* 雷の魔方陣：モンスターにも適用（moveMons後に最終位置で判定） */
      if (st.dungeon.pentacles?.some((pc) => pc.kind === "thunder_trap")) {
        for (const _m of [...st.dungeon.monsters]) {
          const _tp = st.dungeon.pentacles.find((pc) => pc.kind === "thunder_trap" && pc.x === _m.x && pc.y === _m.y);
          if (_tp) {
            if (_tp.cursed) {
              const _mheal = Math.min(25, _m.maxHp - _m.hp);
              if (_mheal > 0) { _m.hp += _mheal; ml.push(`${_tp.name}の力で${_m.name}のHPが${_mheal}回復した！`); }
            } else {
              const _tmdmg = _tp.blessed ? 50 : 25;
              _m.hp -= _tmdmg;
              ml.push(`${_tp.name}が${_m.name}を打った！${_tmdmg}ダメージ！`);
              if (_m.hp <= 0) {
                ml.push(`${_m.name}を倒した！(+${_m.exp}exp)`);
                p.exp += _m.exp;
                monsterDrop(_m, st.dungeon, ml, p);
                st.dungeon.monsters = st.dungeon.monsters.filter((mn) => mn !== _m);
                lu(p, ml);
              }
            }
          }
        }
      }
      computeFOV(
        st.dungeon.map,
        p.x,
        p.y,
        6,
        st.dungeon.visible,
        st.dungeon.explored,
      );
      {
        const _dg = st.dungeon;
        if (
          _dg.nextSpawnTurn !== undefined &&
          p.turns >= _dg.nextSpawnTurn &&
          p.hp > 0
        ) {
          const _cands = [];
          for (let _sy = 0; _sy < MH; _sy++) {
            for (let _sx = 0; _sx < MW; _sx++) {
              if (
                _dg.map[_sy][_sx] === T.FLOOR &&
                !_dg.visible[_sy][_sx] &&
                !(_sx === p.x && _sy === p.y) &&
                !_dg.monsters.find((m) => m.x === _sx && m.y === _sy)
              ) {
                _cands.push([_sx, _sy]);
              }
            }
          }
          if (_cands.length > 0) {
            const [_cx, _cy] = _cands[rng(0, _cands.length - 1)];
            const _mt = MONS[clamp(rng(0, p.depth), 0, MONS.length - 1)];
            _dg.monsters.push({
              ..._mt,
              id: uid(),
              x: _cx,
              y: _cy,
              maxHp: _mt.hp,
              turnAccum: 0,
              aware: false,
              dir: { x: 0, y: 1 },
              lastPx: 0,
              lastPy: 0,
              patrolTarget: null,
            });
          }
          _dg.nextSpawnTurn = p.turns + rng(10, 50);
        }
      }
      if (p.hp <= 0) {
        if ((p.mp || 0) > 0) {
          /* MPが残っていれば残MP分のHPで復活 */
          const revHp = p.mp;
          p.hp = revHp;
          p.mp = 0;
          p.mpCooldownTurns = 1000;
          ml.push(`HPがゼロになった！残りMP${revHp}でHP${revHp}として復活！MPは1000ターン回復しない。`);
        } else {
          ml.push("あなたは死んだ...ゲームオーバー。");
          try {
            const _scores = JSON.parse(localStorage.getItem("roguelike_scores") || "[]");
            _scores.unshift({
              cause: p.deathCause || "不明",
              gold: p.gold,
              level: p.level,
              depth: p.depth,
              turns: p.turns,
              date: new Date().toLocaleDateString("ja-JP"),
            });
            localStorage.setItem("roguelike_scores", JSON.stringify(_scores.slice(0, 20)));
          } catch (_e) {}
          setGameOverSel(0);
          setDead(true);
        }
      }
      /* 落下エンティティを次の階に配置 */
      clearPitfallBag();
      if (!st.floors) st.floors = {};
      processPitfallBag(_etPfBag, st.floors, p.depth);
    },
    [moveMons, lu],
  );

  /* auto-advance turns while player is sleeping, paralyzed, or slow-skipping */
  useEffect(() => {
    if (!gs?.player) return;
    const { sleepTurns = 0, paralyzeTurns = 0, slowSkip = false } = gs.player;
    if (sleepTurns <= 0 && paralyzeTurns <= 0 && !slowSkip) return;
    setShowInv(false);
    setThrowMode(null);
    const timer = setTimeout(() => {
      if (!sr.current) return;
      const st = sr.current;
      const { player: p } = st;
      if (p.sleepTurns <= 0 && p.paralyzeTurns <= 0 && !p.slowSkip) return;
      const ml = [];
      if (p.sleepTurns > 0) {
        p.sleepTurns--;
        ml.push(p.sleepTurns > 0
          ? `眠っている...あと${p.sleepTurns}ターン`
          : "目が覚めた！");
      } else if (p.paralyzeTurns > 0) {
        p.paralyzeTurns--;
        ml.push(p.paralyzeTurns > 0
          ? `金縛りにあっている...あと${p.paralyzeTurns}ターン`
          : "金縛りが解けた！");
      } else if (p.slowSkip) {
        /* 鈍足スキップターン：モンスターだけ行動してプレイヤーはスキップ */
        p.slowSkip = false;
        p.slowTurns = Math.max(0, (p.slowTurns || 0) - 1);
        if (p.slowTurns <= 0) {
          ml.push("鈍足が解けた！");
        } else {
          ml.push("鈍足でターンがスキップされた...");
        }
      }
      endTurn(st, p, ml);
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
      sr.current = { ...st };
      setGs({ ...st });
    }, 400);
    return () => clearTimeout(timer);
  }, [gs, endTurn]);

  const act = useCallback(
    (type, dx = 0, dy = 0) => {
      if (dead || !sr.current) return;
      if (revealMode) return;
      if (bigboxMode) return;
      if (springMode) return;
      if (putMode) return;
      if (markerMode) return;
      if (spellListMode) return;
      if (throwMode !== null && type !== "inventory") return;
      if (showInv && type !== "inventory") return;
      const st = sr.current,
        { player: p, dungeon: dg } = st;
      let acted = false;
      const ml = [];
      if (p.sleepTurns > 0 || p.paralyzeTurns > 0 || p.slowSkip) return;
      if (type === "inventory") {
        setShowInv((v) => {
          if (v) { dropModeRef.current = false; setDropMode(false); }
          return !v;
        });
        setSelIdx(null);
        setShowDesc(null);
        setThrowMode(null);
        setTimeout(() => ref.current?.focus(), 0);
        return;
      }
      if (p.sleepTurns > 0) {
        p.sleepTurns--;
        ml.push(p.sleepTurns > 0
          ? `眠っている...あと${p.sleepTurns}ターン`
          : "目が覚めた！");
        endTurn(st, p, ml);
        setMsgs((prev) => [...prev.slice(-80), ...ml]);
        sr.current = { ...st };
        setGs({ ...st });
        return;
      }
      if (p.paralyzeTurns > 0) {
        p.paralyzeTurns--;
        ml.push(p.paralyzeTurns > 0
          ? `金縛りにあっている...あと${p.paralyzeTurns}ターン`
          : "金縛りが解けた！");
        endTurn(st, p, ml);
        setMsgs((prev) => [...prev.slice(-80), ...ml]);
        sr.current = { ...st };
        setGs({ ...st });
        return;
      }
      if (type === "move" && (dx || dy)) {
        /* ===== 混乱状態：移動方向をランダム化 ===== */
        if ((p.confusedTurns || 0) > 0) {
          const _cdirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
          const _crd = _cdirs[rng(0, _cdirs.length - 1)];
          dx = _crd[0]; dy = _crd[1];
          ml.push("混乱して違う方向に動いた！");
        }
        const nx = p.x + dx,
          ny = p.y + dy;
        p.facing = { dx, dy };
        if (nx >= 0 && nx < MW && ny >= 0 && ny < MH) {
          const wab = p.weapon?.ability;
          const wabHas = (id) =>
            id === wab || p.weapon?.abilities?.includes(id) || false;
          const mon = dg.monsters.find((m) => m.x === nx && m.y === ny);
          let reachMon = null;
          if (
            !mon &&
            wabHas("reach") &&
            nx >= 0 &&
            nx < MW &&
            ny >= 0 &&
            ny < MH &&
            dg.map[ny]?.[nx] !== T.WALL && dg.map[ny]?.[nx] !== T.BWALL
          ) {
            const rx = nx + dx,
              ry = ny + dy;
            if (rx >= 0 && rx < MW && ry >= 0 && ry < MH)
              reachMon =
                dg.monsters.find((m) => m.x === rx && m.y === ry) || null;
          }
          const attackMon = mon || reachMon;
          if (attackMon) {
            if (
              attackMon.type === "shopkeeper" &&
              attackMon.state !== "hostile"
            ) {
              ml.push("店主に話しかけるにはキーで。");
            } else {
              if (attackMon.paralyzed) {
                attackMon.paralyzed = false;
                ml.push(`${attackMon.name}の金縛りが解けた！`);
              }
              let ap = p.atk + (p.weapon?.atk || 0) + (p.weapon?.plus || 0);
              if (wab?.startsWith("bane_") && attackMon.kind === wab.slice(5))
                ap *= 2;
              let d = Math.max(1, ap - attackMon.def + rng(-2, 2));
              let crit = false;
              if (wabHas("critical") && Math.random() < 0.25) {
                d *= 2;
                crit = true;
              }
              /* 脆弱の魔方陣チェック：祝福4倍/通常2倍/呪い半減 */
              const _vulnRoom = findRoom(dg.rooms, attackMon.x, attackMon.y);
              const _vulnPc = _vulnRoom && dg.pentacles?.find((pc) => pc.kind === "vulnerability" && pc.x >= _vulnRoom.x && pc.x < _vulnRoom.x + _vulnRoom.w && pc.y >= _vulnRoom.y && pc.y < _vulnRoom.y + _vulnRoom.h);
              if (_vulnPc) d = _vulnPc.cursed ? Math.max(1, Math.floor(d / 2)) : d * (_vulnPc.blessed ? 4 : 2);
              /* 壁の中の壁歩きモンスターへの攻撃：ダメージ半減 */
              const _atkInWall = attackMon.wallWalker && dg.map[attackMon.y]?.[attackMon.x] === T.WALL;
              if (_atkInWall) d = Math.max(1, Math.floor(d / 2));
              attackMon.hp -= d;
              if (attackMon.type === "shopkeeper") attackMon.state = "hostile";
              const atkSfx =
                (crit ? "会心！" : "") +
                (wab?.startsWith("bane_") && attackMon.kind === wab.slice(5)
                  ? "特効！"
                  : "") +
                (_atkInWall ? "（壁越し・半減）" : "");
              ml.push(`${attackMon.name}に${d}ダメージ！${atkSfx}`);
              if (wabHas("knockback") && attackMon.hp > 0) {
                const kx = attackMon.x + dx,
                  ky = attackMon.y + dy;
                if (
                  kx >= 0 &&
                  kx < MW &&
                  ky >= 0 &&
                  ky < MH &&
                  dg.map[ky][kx] !== T.WALL && dg.map[ky][kx] !== T.BWALL &&
                  !dg.monsters.some(
                    (m2) => m2 !== attackMon && m2.x === kx && m2.y === ky,
                  )
                ) {
                  attackMon.x = kx;
                  attackMon.y = ky;
                  ml.push(`${attackMon.name}は吹き飛んだ！`);
                }
              }
              if (attackMon.hp <= 0) {
                ml.push(`${attackMon.name}を倒した！(+${attackMon.exp}exp)`);
                p.exp += attackMon.exp;
                monsterDrop(attackMon, dg, ml, p);
                dg.monsters = dg.monsters.filter((m) => m !== attackMon);
                lu(p, ml);
              }
              acted = true;
            }
          } else if (dg.map[ny][nx] !== T.WALL && dg.map[ny][nx] !== T.BWALL) {
            /* 呪われた聖域の魔方陣：プレイヤーは通行できない */
            const _cursedSanc = dg.pentacles?.find(pc => pc.kind === "sanctuary" && pc.cursed && pc.x === nx && pc.y === ny);
            if (_cursedSanc) {
              ml.push("呪われた魔方陣が行く手を阻んでいる！");
            } else {
            p.x = nx;
            p.y = ny;
            acted = true;
            const tr = checkTrap(p, dg, ml);
            if (tr === "pitfall") {
              const nd = chgFloor(p, 1, true);
              if (nd) {
                st.dungeon = nd;
                ml.push(`地下${p.depth}階に落ちた！`);
              }
            }
            autoPickup(p, st.dungeon, ml);
            if (dg.map[p.y][p.x] === T.SD) ml.push("下り階段がある。");
            if (dg.map[p.y][p.x] === T.SU) ml.push("上り階段がある。");
            const _bbStep = st.dungeon.bigboxes?.find(b => b.x === p.x && b.y === p.y);
            if (_bbStep) ml.push(`${_bbStep.name}がある。`);
            const _sprStep = st.dungeon.springs?.find((s) => s.x === p.x && s.y === p.y);
            if (_sprStep) ml.push("泉がある。");
            const _pentStep = st.dungeon.pentacles?.find((pc) => pc.x === p.x && pc.y === p.y);
            if (_pentStep) ml.push(`${_pentStep.name}の上にいる。`);
            }
          }
        }
      } else if (type === "wait") acted = true;
      else if (type === "search_traps") {
        const found = [];
        for (let sdx = -1; sdx <= 1; sdx++) {
          for (let sdy = -1; sdy <= 1; sdy++) {
            if (sdx === 0 && sdy === 0) continue;
            const st2 = dg.traps.find(
              (t) => t.x === p.x + sdx && t.y === p.y + sdy && !t.revealed,
            );
            if (st2) {
              st2.revealed = true;
              found.push(st2.name);
            }
          }
        }
        if (found.length > 0) ml.push(`罠を発見！：${found.join("、")}`);
        else ml.push("周囲に罠はない。");
        acted = true;
      } else if (type === "grab") {
        const it = dg.items.find((i) => i.x === p.x && i.y === p.y);
        if (it) {
          if (it.type === "gold") {
            p.gold += it.value;
            ml.push(`${it.value}枚の金貨を拾った！`);
            dg.items = dg.items.filter((i) => i !== it);
          } else if (it.type === "arrow" && !it.shopPrice) {
            if (addArrowsInv(p.inventory, it.count, !!it.poison, !!it.pierce, p.maxInventory || 30)) {
              ml.push(`${it.name || "矢"}(${it.count}本)を拾った。`);
              dg.items = dg.items.filter((i) => i !== it);
            } else ml.push("持ち物がいっぱいだ！");
          } else if (p.inventory.length >= (p.maxInventory || 30)) ml.push("持ち物がいっぱいだ！");
          else {
            p.inventory.push(it);
            if (it.shopPrice && dg.shop) {
              dg.shop.unpaidTotal += it.shopPrice;
              const sk2 = dg.monsters.find(
                (m) => m.type === "shopkeeper" && m.state === "friendly",
              );
              if (sk2) sk2.state = "blocking";
              ml.push(
                `${itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}を取った！(${it.shopPrice}G) 店主が入り口をふさいだ。`,
              );
            } else {
              const _w2 = it.type === "weapon",
                _a2 = it.type === "armor";
              let _lbl2 = itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
              if (_w2 || _a2) {
                if (it.plus) _lbl2 += (it.plus > 0 ? "+" : "") + it.plus;
                _lbl2 += _w2
                  ? " (攻+" + (it.atk + (it.plus || 0)) + ")"
                  : " (防+" + (it.def + (it.plus || 0)) + ")";
                const _AB2 = _w2 ? WEAPON_ABILITIES : ARMOR_ABILITIES;
                const _ids2 = [
                  ...new Set([
                    ...(it.abilities || []),
                    ...(it.ability ? [it.ability] : []),
                  ]),
                ];
                const _ns2 = _ids2
                  .map((id) => _AB2.find((a) => a.id === id)?.name)
                  .filter(Boolean);
                if (_ns2.length) _lbl2 += " [" + _ns2.join("・") + "]";
              }
              ml.push(_lbl2 + _itemPickupSuffix(it, sr.current?.ident) + "を拾った。");
            }
            dg.items = dg.items.filter((i) => i !== it);
          }
          acted = true;
        } else {
          const trapHere = dg.traps.find((t) => t.x === p.x && t.y === p.y);
          if (trapHere) {
            const _tnFn = (it) => itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
            const tr2 = fireTrapPlayer(trapHere, p, dg, ml, _tnFn);
            if (tr2 === "pitfall") {
              const nd2 = chgFloor(p, 1, true);
              if (nd2) {
                st.dungeon = nd2;
                ml.push(`地下${p.depth}階に落ちた！`);
              }
            }
            acted = true;
          } else ml.push("ここには何もない。");
        }
      } else if (type === "shoot_arrow") {
        if (p.arrow && p.arrow.count > 0) {
          setThrowMode({ idx: -1, mode: "shoot_equipped" });
          setMsgs((prev) => [
            ...prev.slice(-80),
            "矢を射る方向を選んでください...",
          ]);
          sr.current = { ...st };
          setGs({ ...st });
          return;
        } else ml.push("矢を装備していない。");
      } else if (type === "stairs_down") {
        if (dg.map[p.y][p.x] === T.SD) {
          const nd = chgFloor(p, 1);
          if (nd) {
            st.dungeon = nd;
            ml.push(`地下${p.depth}階に降りた。`);
            acted = true;
          }
        } else ml.push("ここに下り階段はない。");
      } else if (type === "stairs_up") {
        if (dg.map[p.y][p.x] === T.SU) {
          if (p.depth === 1) ml.push("まだ帰れない！");
          else {
            const nd = chgFloor(p, -1);
            if (nd) {
              st.dungeon = nd;
              ml.push(`地下${p.depth}階に昇った。`);
              acted = true;
            }
          }
        } else ml.push("ここに上り階段はない。");
      } else if (type === "interact") {
        /* 足元の階段チェック */
        if (dg.map[p.y][p.x] === T.SD) {
          const nd = chgFloor(p, 1);
          if (nd) { st.dungeon = nd; ml.push(`地下${p.depth}階に降りた。`); acted = true; }
        } else if (dg.map[p.y][p.x] === T.SU) {
          if (p.depth === 1) ml.push("まだ帰れない！");
          else {
            const nd = chgFloor(p, -1);
            if (nd) { st.dungeon = nd; ml.push(`地下${p.depth}階に昇った。`); acted = true; }
          }
        } else {
          /* 足元の大箱チェック（前方は除く） */
          const bb2 = dg.bigboxes?.find((b) => b.x === p.x && b.y === p.y);
          if (bb2) {
            bigboxRef.current = bb2;
            setBigboxMode("menu"); setBigboxMenuSel(0);
            setMsgs((prev) => [...prev.slice(-80), `${bb2.name}がある。どうする？`]);
            sr.current = { ...st }; setGs({ ...st }); return;
          }
          const spr = dg.springs?.find((s) => s.x === p.x && s.y === p.y);
          if (spr) {
            springTargetRef.current = spr;
            setSpringMode("menu"); setSpringMenuSel(0);
            setMsgs((prev) => [...prev.slice(-80), "泉がある。どうする？"]);
            sr.current = { ...st }; setGs({ ...st }); return;
          } else ml.push("ここには何もない。");
        }
      }
      if (acted) {
        /* 2倍速：1回目の行動はendTurnせず、2回目でendTurn */
        if ((p.hasteTurns || 0) > 0 && !p.hasteUsed) {
          p.hasteUsed = true;
          /* FOVだけ更新して行動完了（モンスターは動かない） */
          computeFOV(st.dungeon.map, p.x, p.y, (p.darknessTurns || 0) > 0 ? 1 : 6, st.dungeon.visible, st.dungeon.explored);
        } else {
          if (p.hasteUsed) p.hasteUsed = false;
          endTurn(st, p, ml);
        }
        /* 2倍速ターン減少 */
        if ((p.hasteTurns || 0) > 0) {
          p.hasteTurns--;
          if (p.hasteTurns <= 0) { p.hasteUsed = false; ml.push("2倍速が解けた！"); }
        }
        /* 鈍足：行動後に次のターンをスキップ予約 */
        if ((p.slowTurns || 0) > 0) {
          p.slowTurns--;
          if (p.slowTurns > 0) {
            p.slowSkip = true;
          } else {
            ml.push("鈍足が解けた！");
          }
        }
        /* 混乱：行動後にターン数を減らす */
        if ((p.confusedTurns || 0) > 0) {
          p.confusedTurns--;
          if (p.confusedTurns <= 0) ml.push("混乱が解けた！");
        }
        /* 暗闇：視界が1マスになる */
        if ((p.darknessTurns || 0) > 0) {
          p.darknessTurns--;
          if (p.darknessTurns <= 0) ml.push("暗闇が晴れた！視界が戻った！");
        }
        /* 幻惑：周囲の見た目が狂う */
        if ((p.bewitchedTurns || 0) > 0) {
          p.bewitchedTurns--;
          if (p.bewitchedTurns <= 0) ml.push("幻惑が解けた！周囲の見た目が正常に戻った！");
        }
        /* 状態異常防止 */
        if ((p.statusImmune || 0) > 0) {
          p.statusImmune--;
          if (p.statusImmune <= 0) ml.push("状態防止が切れた！");
        }
        /* 必中 */
        if ((p.sureHitTurns || 0) > 0) {
          p.sureHitTurns--;
          if (p.sureHitTurns <= 0) ml.push("必中状態が切れた！");
        }
      }
      if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
      sr.current = { ...st };
      setGs({ ...st });
    },
    [
      dead,
      showInv,
      throwMode,
      springMode,
      putMode,
      markerMode,
      moveMons,
      chgFloor,
      autoPickup,
      checkTrap,
      lu,
      endTurn,
      revealMode,
    ],
  );
  /* 目の前を調べる（zキー・モバイル調べるボタン共通） */
  const doExamineFront = useCallback(() => {
    if (!sr.current) return;
    const { player: p, dungeon: dg } = sr.current;
    const fd = p.facing || { dx: 0, dy: 1 };
    const nx = p.x + fd.dx, ny = p.y + fd.dy;
    const mon = dg.monsters.find((m) => m.x === nx && m.y === ny);
    if (mon) {
      if (mon.type === "shopkeeper" && mon.state !== "hostile") {
        if (sr.current?.dungeon?.shop) {
          const dg6 = sr.current.dungeon;
          const fis2 = dg6.items.filter(
            (i) => !i.shopPrice && i.x >= dg6.shop.room.x && i.x < dg6.shop.room.x + dg6.shop.room.w &&
              i.y >= dg6.shop.room.y && i.y < dg6.shop.room.y + dg6.shop.room.h,
          );
          if (fis2.length > 0) {
            setShopMode("sell"); setShopMenuSel(0);
            setMsgs((prev) => [...prev.slice(-80), "店主：「買い取りましょうか？」"]);
          } else if (dg6.shop.unpaidTotal > 0) {
            setShopMode("pay"); setShopMenuSel(0);
            setMsgs((prev) => [...prev.slice(-80), `店主：「お代は${dg6.shop.unpaidTotal}Gです。」`]);
          } else {
            setMsgs((prev) => [...prev.slice(-80), "店主：「いらっしゃいませ！」"]);
          }
        }
      } else act("move", fd.dx, fd.dy);
    } else {
      /* BWALLチェックを最優先（大箱・泉の上に壁がある場合は壁破壊のみ） */
      if (ny >= 0 && ny < MH && nx >= 0 && nx < MW && dg.map[ny]?.[nx] === T.BWALL) {
        dg.map[ny][nx] = T.FLOOR;
        act("wait");
        setMsgs((prev) => [...prev.slice(-80), "壁を叩き壊した！"]);
      } else if (ny >= 0 && ny < MH && nx >= 0 && nx < MW && dg.map[ny]?.[nx] === T.WALL) {
        act("wait");
        setMsgs((prev) => [...prev.slice(-80), "壁を叩いた。ゴツン！"]);
      } else {
        const spr = dg.springs?.find((s) => s.x === nx && s.y === ny);
        const bb6 = dg.bigboxes?.find((b) => b.x === nx && b.y === ny);
        if (spr) {
          springTargetRef.current = spr;
          setSpringMode("menu"); setSpringMenuSel(0);
          setMsgs((prev) => [...prev.slice(-80), "泉がある。どうする？"]);
        } else if (bb6) {
          bigboxRef.current = bb6;
          setBigboxMode("menu"); setBigboxMenuSel(0);
          setMsgs((prev) => [...prev.slice(-80), `${bb6.name}がある。どうする？`]);
        } else {
          setMsgs((prev) => [...prev.slice(-80), "何もない。"]);
        }
      }
    }
  }, [act]);
  const doDash = useCallback(
    (dx, dy) => {
      if (dead || !sr.current) return;
      if (springMode || putMode || markerMode || spellListMode || throwMode || showInv) return;
      const st = sr.current,
        { player: p, dungeon: dg } = st;
      if (p.sleepTurns > 0 || p.paralyzeTurns > 0 || (p.slowTurns || 0) > 0 || (p.confusedTurns || 0) > 0) return;
      const ml = [];
      let steps = 0;
      const startInRoom =
        dg.rooms?.some(
          (r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h,
        ) ?? false;
      const getP = (x, y) =>
        (dx !== 0
          ? [
              [0, -1],
              [0, 1],
            ]
          : [
              [-1, 0],
              [1, 0],
            ]
        ).filter(([sdx, sdy]) => {
          const sx = x + sdx,
            sy = y + sdy;
          return (
            sx >= 0 &&
            sx < MW &&
            sy >= 0 &&
            sy < MH &&
            dg.map[sy][sx] !== T.WALL && dg.map[sy][sx] !== T.BWALL
          );
        }).length;
      let prevPerps = getP(p.x, p.y);
      while (steps < 50) {
        const nx = p.x + dx,
          ny = p.y + dy;
        if (
          nx < 0 ||
          nx >= MW ||
          ny < 0 ||
          ny >= MH ||
          dg.map[ny][nx] === T.WALL || dg.map[ny][nx] === T.BWALL
        )
          break;
        if (dg.monsters.find((m) => m.x === nx && m.y === ny)) break;
        if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.cursed && pc.x === nx && pc.y === ny)) break;
        p.x = nx;
        p.y = ny;
        steps++;
        const tr = checkTrap(p, dg, ml, true);
        if (tr === "pitfall") {
          const nd = chgFloor(p, 1, true);
          if (nd) {
            st.dungeon = nd;
            ml.push(`地下${p.depth}階に落ちた！`);
          }
          endTurn(st, p, ml);
          break;
        }
        if (tr) {
          endTurn(st, p, ml);
          break;
        }
        const _dashRevTrap = dg.traps.find((t) => t.x === p.x && t.y === p.y && t.revealed);
        if (_dashRevTrap) {
          ml.push(`${_dashRevTrap.name}がある。`);
          endTurn(st, p, ml);
          break;
        }
        {
          const _dashIt = st.dungeon.items.find((i) => i.x === p.x && i.y === p.y);
          if (_dashIt) {
            const _w = _dashIt.type === "weapon", _a = _dashIt.type === "armor";
            let _lbl = itemDisplayName(_dashIt, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
            if (_w || _a) {
              if (_dashIt.plus) _lbl += (_dashIt.plus > 0 ? "+" : "") + _dashIt.plus;
              _lbl += _w
                ? " (攻+" + (_dashIt.atk + (_dashIt.plus || 0)) + ")"
                : " (防+" + (_dashIt.def + (_dashIt.plus || 0)) + ")";
              const _AB2 = _w ? WEAPON_ABILITIES : ARMOR_ABILITIES;
              const _ids2 = [...new Set([...(_dashIt.abilities || []), ...(_dashIt.ability ? [_dashIt.ability] : [])])];
              const _ns2 = _ids2.map((id) => _AB2.find((a) => a.id === id)?.name).filter(Boolean);
              if (_ns2.length) _lbl += " [" + _ns2.join("・") + "]";
            }
            ml.push(_lbl + _itemPickupSuffix(_dashIt, sr.current?.ident) + "がある。");
            endTurn(st, p, ml);
            break;
          }
        }
        if (dg.map[p.y][p.x] === T.SD) {
          ml.push("下り階段がある。");
          endTurn(st, p, ml);
          break;
        }
        if (dg.map[p.y][p.x] === T.SU) {
          ml.push("上り階段がある。");
          endTurn(st, p, ml);
          break;
        }
        const _dashSpr = st.dungeon.springs?.find((s) => s.x === p.x && s.y === p.y);
        if (_dashSpr) {
          ml.push("泉がある。");
          endTurn(st, p, ml);
          break;
        }
        const _dashBb = st.dungeon.bigboxes?.find((b) => b.x === p.x && b.y === p.y);
        if (_dashBb) {
          ml.push(`${_dashBb.name}がある。`);
          endTurn(st, p, ml);
          break;
        }
        const curInRoom =
          dg.rooms?.some(
            (r) =>
              p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h,
          ) ?? false;
        const curPerps = getP(p.x, p.y);
        const fnx = p.x + dx,
          fny = p.y + dy;
        const blocked =
          fnx < 0 ||
          fnx >= MW ||
          fny < 0 ||
          fny >= MH ||
          dg.map[fny][fnx] === T.WALL || dg.map[fny][fnx] === T.BWALL ||
          !!dg.monsters.find((m) => m.x === fnx && m.y === fny);
        const _hpBefore = p.hp;
        endTurn(st, p, ml);
        if (p.hp <= 0 || p.hp < _hpBefore || p.sleepTurns > 0 || p.paralyzeTurns > 0) break;
        if (startInRoom) {
          if (!curInRoom || blocked) break;
        } else {
          if ((curPerps > prevPerps && curPerps > 0) || blocked) break;
        }
        prevPerps = curPerps;
      }
      if (steps > 0) {
        setDashMode(false);
        if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
        sr.current = { ...st };
        setGs({ ...st });
      } else {
        setMsgs((prev) => [...prev.slice(-80), "進めない。"]);
        setDashMode(false);
      }
    },
    [
      dead,
      springMode,
      putMode,
      markerMode,
      throwMode,
      showInv,
      checkTrap,
      chgFloor,
      endTurn,
    ],
  );
  const springTryDry = useCallback((dg, p, ml) => {
    if (Math.random() < 0.25) {
      const sprTarget = springTargetRef.current;
      springTargetRef.current = null;
      const spr =
        sprTarget || dg.springs?.find((s) => s.x === p.x && s.y === p.y);
      if (spr) {
        dg.springs = dg.springs.filter((s) => s !== spr);
        if (spr.contents?.length > 0) {
          ml.push("泉が干上がり、中のアイテムが現れた！");
          const ft = new Set();
          for (const item of spr.contents)
            placeItemAt(dg, spr.x, spr.y, item, ml, ft);
        }
        ml.push("泉は干上がってしまった...");
      }
    }
  }, []);
  const breakBigbox = useCallback((bb, dg, ml) => {
    ml.push(`${bb.name}が壊れた！中身がばらまかれた！`);
    const ft = new Set();
    for (const item of bb.contents) placeItemAt(dg, bb.x, bb.y, item, ml, ft);
    dg.bigboxes = dg.bigboxes.filter((b) => b !== bb);
  }, []);
  const trySynthesize = useCallback(
    (bb, ml) => {
      const mks = bb.contents.filter((i) => i.type === "marker");
      if (mks.length >= 2) {
        const [mb, mm] = mks;
        const add = mm.charges || 0;
        mb.charges = (mb.charges || 0) + add;
        ml.push(
          `合成完了！${mb.name}の容量が${add}増えた！(${mb.charges}回)`,
        );
        bb.contents = bb.contents.filter((i) => i !== mm);
        bb.capacity = bb.contents.length;
        return;
      }
      const pns = bb.contents.filter((i) => i.type === "pen");
      if (pns.length >= 2) {
        const [pb, pm] = pns;
        if (pb.effect === pm.effect) {
          const add = pm.charges || 0;
          pb.charges = (pb.charges || 0) + add;
          ml.push(`合成完了！${pb.name}の回数が${add}増えた！(${pb.charges}回)`);
          bb.contents = bb.contents.filter((i) => i !== pm);
          bb.capacity = bb.contents.length;
        } else {
          const add = Math.max(1, Math.floor((pm.charges || 0) / 2));
          pb.charges = (pb.charges || 0) + add;
          ml.push(`${pm.name}の回数の半分が${pb.name}に加算された！(+${add}回 → ${pb.charges}回)`);
          bb.contents = bb.contents.filter((i) => i !== pm);
          bb.capacity = bb.contents.length;
        }
        return;
      }
      const wds = bb.contents.filter((i) => i.type === "wand");
      if (wds.length >= 2) {
        const [wb, wm] = wds;
        if (wb.name === wm.name) {
          wb.charges = (wb.charges || 0) + (wm.charges || 0);
          ml.push(
            `合成完了！${wb.name}の回数が${wm.charges}増えた！(${wb.charges}回)`,
          );
        } else {
          const _ad = Math.max(1, Math.floor((wm.charges || 0) / 2));
          wb.charges = (wb.charges || 0) + _ad;
          ml.push(
            `合成完了！${wb.name}の回数が${_ad}増えた！(${wb.charges}回)`,
          );
        }
        bb.contents = bb.contents.filter((i) => i !== wm);
        bb.capacity = bb.contents.length;
        return;
      }
      const ws = bb.contents.filter((i) => i.type === "weapon");
      const as = bb.contents.filter((i) => i.type === "armor");
      const pair = ws.length >= 2 ? ws : as.length >= 2 ? as : null;
      if (!pair) return;
      const [base, mat] = pair;
      const _toAA = (it) => [
        ...new Set(
          [...(it.abilities || []), ...(it.ability ? [it.ability] : [])].filter(
            Boolean,
          ),
        ),
      ];
      const _mabs = [...new Set([..._toAA(base), ..._toAA(mat)])];
      const merged = {
        ...base,
        id: uid(),
        plus: (base.plus || 0) + (mat.plus || 0),
        ability: _mabs[0] || undefined,
        abilities: _mabs.length ? _mabs : undefined,
      };
      bb.contents = bb.contents.filter((i) => i !== base && i !== mat);
      bb.contents.push(merged);
      bb.capacity = bb.contents.length;
      ml.push(`合成完了！${base.name}と${mat.name}が融合した！`);
    },
    [uid],
  );
  const bigboxAddItem = useCallback(
    (bb, item, dg, ml) => {
      const wasFull = bb.contents.length >= bb.capacity;
      bb.contents.push(item);
      const _idn = itemDisplayName(item, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
      ml.push(
        `${_idn}を${bb.name}に入れた。(${bb.contents.length}/${bb.capacity})`,
      );
      if (bb.kind === "synthesis") {
        trySynthesize(bb, ml);
      } else if (bb.kind === "change") {
        const kinds = ["potion", "weapon", "armor", "food", "wand", "arrow", "pot"];
        const rt = kinds[rng(0, kinds.length - 1)];
        let nit;
        if (rt === "food") {
          nit = { ...genFood(), id: uid() };
        } else if (rt === "wand") {
          const wt = WANDS[rng(0, WANDS.length - 1)];
          nit = { ...wt, id: uid() };
        } else if (rt === "arrow") {
          nit = makeArrow(rng(3, 15));
        } else if (rt === "pot") {
          nit = makePot();
        } else {
          const pool = ITEMS.filter((i) => i.type === rt);
          nit = {
            ...(pool.length
              ? pool[rng(0, pool.length - 1)]
              : ITEMS[rng(0, ITEMS.length - 1)]),
            id: uid(),
          };
        }
        const idx = bb.contents.indexOf(item);
        if (idx >= 0) bb.contents[idx] = nit;
        ml.push(`${_idn}が${itemDisplayName(nit, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}に変化した！`);
      } else if (bb.kind === "enhance") {
        if (item.type === "weapon" || item.type === "armor") {
          const before = item.plus || 0;
          item.plus = before + 1;
          const fp = (v) => (v > 0 ? `+${v}` : v === 0 ? "無印" : `${v}`);
          ml.push(`${item.name}が強化された！(${fp(before)}→${fp(item.plus)})`);
        } else {
          ml.push(`${_idn}には効果がなかった。`);
        }
      } else if (bb.kind === "satiety") {
        if (item.type === "food") {
          const szLevels = item.cooked
            ? [
                { l: "一口", v: 10 },
                { l: "小盛り", v: 20 },
                { l: "普通の", v: 35 },
                { l: "大盛り", v: 55 },
                { l: "特盛り", v: 80 },
              ]
            : [
                { l: "極小の", v: 10 },
                { l: "小さい", v: 20 },
                { l: "普通の", v: 35 },
                { l: "大きい", v: 55 },
                { l: "特大", v: 80 },
              ];
          let upgraded = false;
          for (let si = 0; si < szLevels.length - 1; si++) {
            if (item.name.includes(szLevels[si].l)) {
              const oldName = item.name;
              const cur = szLevels[si];
              const next = szLevels[si + 1];
              item.name = item.name.replace(cur.l, next.l);
              item.value = Math.round((item.value * next.v) / cur.v);
              ml.push(`${oldName}が大きくなった！→${item.name}`);
              upgraded = true;
              break;
            }
          }
          if (!upgraded) ml.push(`${item.name}はすでに最大サイズだ。`);
        } else {
          ml.push(`${_idn}には効果がなかった。`);
        }
      } else if (bb.kind === "refill") {
        if (item.type === "wand") {
          const add = rng(1, 3);
          item.charges = (item.charges || 0) + add;
          ml.push(`${_idn}の回数が${add}増えた！(${item.charges}回)`);
        } else if (item.type === "marker") {
          const add = rng(1, 2);
          item.charges = (item.charges || 0) + add;
          ml.push(`${item.name}のインクが${add}回分補充された！(${item.charges}回)`);
        } else if (item.type === "pen") {
          item.charges = (item.charges || 0) + 1;
          ml.push(`${item.name}のインクが1回分補充された！(${item.charges}回)`);
        } else {
          ml.push(`${_idn}には効果がなかった。`);
        }
      }
      if (wasFull || bb.contents.length > bb.capacity) breakBigbox(bb, dg, ml);
    },
    [trySynthesize, breakBigbox],
  );
  const springDrink = useCallback(() => {
    if (!sr.current) return;
    const { player: p, dungeon: dg } = sr.current;
    const ml = ["泉の水を飲んだ。"];
    const r = Math.random();
    if (r < 0.3) {
      const h = rng(5, 15);
      const ah = Math.min(h, p.maxHp - p.hp);
      p.hp += ah;
      ml.push(`体に活力が戻った。HP+${ah}`);
    } else if (r < 0.5) {
      p.atk += 1;
      ml.push("力が湧いてきた！攻撃力+1");
    } else if (r < 0.65) {
      p.def += 1;
      ml.push("体が強くなった気がする。防御力+1");
    } else if (r < 0.8) {
      p.maxHp += 3;
      p.hp += 3;
      ml.push("生命力が満ちてきた。最大HP+3");
    } else if (r < 0.9) {
      p.hunger = Math.min(p.maxHunger, p.hunger + 20);
      ml.push("喉が潤った。");
    } else {
      const d = rng(3, 8);
      p.deathCause = "苦い泉水により";
      p.hp -= d;
      ml.push(`苦い...！${d}ダメージ！`);
    }
    springTryDry(dg, p, ml);
    endTurn(sr.current, p, ml);
    setMsgs((prev) => [...prev.slice(-80), ...ml]);
    setSpringMode(null);
    sr.current = { ...sr.current };
    setGs({ ...sr.current });
  }, [endTurn, springTryDry]);
  const springDoSoak = useCallback(
    (idx) => {
      if (!sr.current) return;
      const { player: p, dungeon: dg } = sr.current;
      const it = p.inventory[idx];
      if (!it) return;
      const ml = [];
      if (it.type === "bottle") {
        p.inventory.splice(idx, 1);
        const wb = { ...WATER_BOTTLE, id: uid() };
        if (it.blessed) { wb.blessed = true; wb.bcKnown = true; }
        else if (it.cursed) { wb.cursed = true; wb.bcKnown = true; }
        const _sfx = it.blessed ? "【祝】" : it.cursed ? "【呪】" : "";
        p.inventory.push(wb);
        ml.push(`${it.name}に水を汲んだ。${wb.name}を手に入れた！${_sfx}`);
      } else if (it.type === "weapon" || it.type === "armor") {
        const _op = it.plus || 0;
        it.plus = _op - 1;
        const _fp = (v) =>
          v > 0 ? `+${v}` : v === 0 ? `\u7121\u5370` : `${v}`;
        ml.push(
          `${it.name}が水に浸かり...錆びてしまった！(${_fp(_op)}→${_fp(it.plus)})`,
        );
      } else if (it.type === "scroll") {
        if (it.effect !== "blank") {
          const _scrDN = dnameRef(it);
          it.name = "白紙の巻物";
          it.effect = "blank";
          it.desc = "何も書かれていない。魔法のマーカーで書き込める。";
          ml.push(`巻物「${_scrDN}」を泉に浸した...文字が消えた！`);
        } else {
          ml.push("白紙の巻物を泉に浸した...何も起こらなかった。");
        }
      } else {
        ml.push(`${dnameRef(it)}を泉に浸した...何も起こらなかった。`);
      }
      springTryDry(dg, p, ml);
      endTurn(sr.current, p, ml);
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
      setSpringMode(null);
      sr.current = { ...sr.current };
      setGs({ ...sr.current });
    },
    [endTurn, springTryDry],
  );
  const bigboxPutItem = useCallback(
    (itemIdx) => {
      if (!sr.current || !bigboxRef.current) return;
      const { player: p, dungeon: dg } = sr.current;
      const it = p.inventory[itemIdx];
      if (!it) return;
      const bb = bigboxRef.current;
      const ml = [];
      if (bb.contents.length >= bb.capacity) {
        ml.push(`${bb.name}はもういっぱいだ。`);
        setMsgs((prev) => [...prev.slice(-80), ...ml]);
        return;
      }
      p.inventory.splice(itemIdx, 1);
      bigboxAddItem(bb, it, dg, ml);
      endTurn(sr.current, p, ml);
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
      setBigboxMode("menu");
      setBigboxMenuSel(0);
      setBigboxPage(0);
      sr.current = { ...sr.current };
      setGs({ ...sr.current });
    },
    [bigboxAddItem, endTurn],
  );
  const sortInventory = useCallback(() => {
    if (!sr.current) return;
    const p = sr.current.player;
    const ORDER = [
      "weapon",
      "armor",
      "arrow",
      "potion",
      "scroll",
      "food",
      "wand",
      "marker",
      "pen",
      "pot",
      "bottle",
      "gold",
    ];
    p.inventory.sort((a, b) => {
      const oa = ORDER.indexOf(a.type);
      const ob = ORDER.indexOf(b.type);
      const ca = oa >= 0 ? oa : ORDER.length;
      const cb = ob >= 0 ? ob : ORDER.length;
      if (ca !== cb) return ca - cb;
      return a.name.localeCompare(b.name, "ja");
    });
    setInvPage(0);
    setSelIdx(null);
    setInvMenuSel(null);
    setShowDesc(null);
    sr.current = { ...sr.current };
    setGs({ ...sr.current });
  }, []);
  const shiftRef = useRef(false);
  useEffect(() => {
    const onUp = (e) => {
      if (e.key === "Shift") shiftRef.current = false;
    };
    window.addEventListener("keyup", onUp);
    return () => window.removeEventListener("keyup", onUp);
  }, []);
  const handleKey = useCallback(
    (e) => {
      const k = e.key.toLowerCase();
      if (k === "shift") {
        shiftRef.current = true;
      }
      if (dead) {
        if (!showScores) {
          if (k === "arrowleft" || k === "arrowup" || k === "h" || k === "a") {
            e.preventDefault(); setGameOverSel(0);
          } else if (k === "arrowright" || k === "arrowdown" || k === "l" || k === "d") {
            e.preventDefault(); setGameOverSel(1);
          } else if (k === "enter" || k === " " || k === "z") {
            e.preventDefault();
            if (gameOverSel === 0) init();
            else setShowScores(true);
          }
        } else {
          if (k === "escape" || k === "enter" || k === " " || k === "z") {
            e.preventDefault(); setShowScores(false);
          }
        }
        return;
      }
      if (tpSelectMode) {
        e.preventDefault();
        const { player: p, dungeon: dg } = sr.current || {};
        if (!p || !dg) return;
        const { cx, cy } = tpSelectMode;
        const isUp    = k === "arrowup"    || k === "w" || e.code === "Numpad8";
        const isDown  = k === "arrowdown"  || k === "s" || e.code === "Numpad2";
        const isLeft  = k === "arrowleft"  || k === "a" || e.code === "Numpad4";
        const isRight = k === "arrowright" || k === "d" || e.code === "Numpad6";
        const isUL = e.code === "Numpad7", isUR = e.code === "Numpad9";
        const isDL = e.code === "Numpad1", isDR = e.code === "Numpad3";
        let ncx = cx, ncy = cy;
        if (isUp)    ncy = Math.max(0, cy - 1);
        else if (isDown)  ncy = Math.min(MH - 1, cy + 1);
        else if (isLeft)  ncx = Math.max(0, cx - 1);
        else if (isRight) ncx = Math.min(MW - 1, cx + 1);
        else if (isUL) { ncx = Math.max(0, cx - 1); ncy = Math.max(0, cy - 1); }
        else if (isUR) { ncx = Math.min(MW - 1, cx + 1); ncy = Math.max(0, cy - 1); }
        else if (isDL) { ncx = Math.max(0, cx - 1); ncy = Math.min(MH - 1, cy + 1); }
        else if (isDR) { ncx = Math.min(MW - 1, cx + 1); ncy = Math.min(MH - 1, cy + 1); }
        if (ncx !== cx || ncy !== cy) { setTpSelectMode({ cx: ncx, cy: ncy }); return; }
        const doTpConfirm = (tx, ty) => {
          const ml = [];
          const isWalkable = dg.map[ty]?.[tx] !== T.WALL && dg.map[ty]?.[tx] !== T.BWALL && dg.map[ty]?.[tx] !== undefined;
          if (isWalkable) {
            p.x = tx; p.y = ty;
            ml.push("テレポートした！（目的地指定）【祝】");
          } else {
            const rm = dg.rooms[rng(0, dg.rooms.length - 1)];
            p.x = rng(rm.x, rm.x + rm.w - 1);
            p.y = rng(rm.y, rm.y + rm.h - 1);
            ml.push("壁の中！ランダムにテレポートした。");
          }
          endTurn(sr.current, p, ml);
          computeFOV(dg.map, p.x, p.y, (p.darknessTurns || 0) > 0 ? 1 : 6, dg.visible, dg.explored);
          setTpSelectMode(null);
          setMsgs((prev) => [...prev.slice(-80), ...ml]);
          sr.current = { ...sr.current };
          setGs({ ...sr.current });
        };
        if (k === "z" || k === "enter") { doTpConfirm(cx, cy); return; }
        if (k === "x" || k === "escape") {
          const rm = dg.rooms[rng(0, dg.rooms.length - 1)];
          doTpConfirm(rng(rm.x, rm.x + rm.w - 1), rng(rm.y, rm.y + rm.h - 1));
          return;
        }
        return;
      }
      if (showInv) {
        const inv = sr.current?.player?.inventory || [];
        const totalPages = Math.ceil(inv.length / 10) || 1;
        const pageItems = inv.slice(invPage * 10, (invPage + 1) * 10);
        const len = pageItems.length;
        const absIdx = selIdx !== null ? invPage * 10 + selIdx : null;
        const getActs = (it, ai) => {
          const a = [];
          if (canUse(it))
            a.push({
              label: useLabel(it),
              fn: () => invActRef.current?.use?.(ai),
            });
          if (it.type === "spellbook")
            a.push({ label: "読む", fn: () => invActRef.current?.readSpellbook?.(ai) });
          if (it.type === "arrow")
            a.push({ label: "射る", fn: () => invActRef.current?.shoot?.(ai) });
          if (it.type === "wand")
            a.push({ label: "振る", fn: () => invActRef.current?.wave?.(ai) });
          if (it.type === "wand")
            a.push({
              label: "壊す",
              fn: () => invActRef.current?.breakWand?.(ai),
            });
          if (it.type === "marker")
            a.push({ label: "書く", fn: () => invActRef.current?.useMarker?.(ai) });
          if (it.type === "pot")
            a.push({
              label: "割る",
              fn: () => invActRef.current?.breakPot?.(ai),
            });
          a.push({ label: "置く", fn: () => invActRef.current?.drop?.(ai) });
          a.push({
            label: it.type === "arrow" ? "投げる(束)" : "投げる",
            fn: () => invActRef.current?.throw?.(ai),
          });
          a.push({
            label: "説明",
            fn: () => setShowDesc((p) => (p === ai ? null : ai)),
          });
          const _nik = getIdentKey(it);
          if (_nik && gs?.ident && !gs.ident.has(_nik)) {
            a.push({
              label: "名付ける",
              fn: () => {
                setNicknameMode({ identKey: _nik });
                setNicknameInput(gs?.nicknames?.[_nik] || '');
                setShowInv(false); setSelIdx(null); setShowDesc(null);
              },
            });
          }
          return a;
        };
        if (invMenuSel !== null) {
          if (k === "escape" || k === "x") {
            e.preventDefault();
            setInvMenuSel(null);
            return;
          }
          const isLeft = k === "arrowleft" || e.code === "Numpad4";
          const isRight = k === "arrowright" || e.code === "Numpad6";
          if ((isLeft || isRight) && selIdx !== null && pageItems[selIdx]) {
            e.preventDefault();
            const acts = getActs(pageItems[selIdx], absIdx);
            setInvMenuSel(
              (p) => (p + (isRight ? 1 : -1) + acts.length) % acts.length,
            );
            return;
          }
          if (
            (k === "enter" || k === "z") &&
            selIdx !== null &&
            pageItems[selIdx]
          ) {
            e.preventDefault();
            const acts = getActs(pageItems[selIdx], absIdx);
            if (invMenuSel >= 0 && invMenuSel < acts.length) {
              acts[invMenuSel].fn();
              setInvMenuSel(null);
            }
            return;
          }
          return;
        }
        const isUp = k === "arrowup" || e.code === "Numpad8";
        const isDown = k === "arrowdown" || e.code === "Numpad2";
        const isLeft = k === "arrowleft" || e.code === "Numpad4";
        const isRight = k === "arrowright" || e.code === "Numpad6";
        if (k === "escape" || k === "x" || k === "i") {
          e.preventDefault();
          if (selIdx !== null) {
            setSelIdx(null);
            setShowDesc(null);
          } else {
            setShowInv(false);
            dropModeRef.current = false;
            setDropMode(false);
            setInvPage(0);
          }
          return;
        }
        if ((isUp || isDown) && len > 0) {
          e.preventDefault();
          setSelIdx((prev) => {
            if (prev === null) return isDown ? 0 : len - 1;
            return (prev + (isDown ? 1 : -1) + len) % len;
          });
          setShowDesc(null);
          return;
        }
        if (isLeft || isRight) {
          e.preventDefault();
          const newPage =
            (invPage + (isRight ? 1 : -1) + totalPages) % totalPages;
          setInvPage(newPage);
          setSelIdx(null);
          setInvMenuSel(null);
          setShowDesc(null);
          return;
        }
        if (
          (k === "enter" || k === "z") &&
          selIdx !== null &&
          pageItems[selIdx]
        ) {
          e.preventDefault();
          if (dropModeRef.current) {
            doDropItem(invPage * 10 + selIdx);
          } else {
            setInvMenuSel(0);
          }
          return;
        }
        if (k === "s") {
          e.preventDefault();
          sortInventory();
          return;
        }
        if (k === "d") {
          e.preventDefault();
          const newMode = !dropModeRef.current;
          dropModeRef.current = newMode;
          setDropMode(newMode);
          return;
        }
        return;
      }
      if (facingMode) {
        const npm2 = {
          Numpad8: [0, -1],
          Numpad2: [0, 1],
          Numpad4: [-1, 0],
          Numpad6: [1, 0],
          Numpad7: [-1, -1],
          Numpad9: [1, -1],
          Numpad1: [-1, 1],
          Numpad3: [1, 1],
        };
        const fdir =
          npm2[e.code] ||
          (k === "arrowup"
            ? [0, -1]
            : k === "arrowdown"
              ? [0, 1]
              : k === "arrowleft"
                ? [-1, 0]
                : k === "arrowright"
                  ? [1, 0]
                  : null);
        if (fdir) {
          e.preventDefault();
          if (sr.current) {
            sr.current.player.facing = { dx: fdir[0], dy: fdir[1] };
            setGs({ ...sr.current });
          }
          setFacingMode(false);
          return;
        }
        if (k === "t" || k === "escape") {
          e.preventDefault();
          setFacingMode(false);
          return;
        }
        return;
      }
      if (e.code && e.code.startsWith("Numpad")) {
        const npm = {
          Numpad1: [-1, 1],
          Numpad2: [0, 1],
          Numpad3: [1, 1],
          Numpad4: [-1, 0],
          Numpad5: [0, 0],
          Numpad6: [1, 0],
          Numpad7: [-1, -1],
          Numpad8: [0, -1],
          Numpad9: [1, -1],
        };
        if (
          npm[e.code] !== undefined &&
          !putMode &&
          !springMode &&
          !bigboxMode &&
          !markerMode
        ) {
          e.preventDefault();
          const [dx, dy] = npm[e.code];
          if (throwMode !== null) {
            execRef.current?.(dx, dy);
          } else if (!showInv) {
            if (dx === 0 && dy === 0) act("wait");
            else if (e.shiftKey || shiftRef.current) doDash(dx, dy);
            else act("move", dx, dy);
          }
          return;
        }
      }
      if (revealMode) {
        // 何かキーで続きのメッセージを表示
        if (revealMode.pendingMsgs.length) setMsgs(prev => [...prev.slice(-80), ...revealMode.pendingMsgs]);
        setRevealMode(null);
        e.preventDefault();
        return;
      }
      if (nicknameMode) {
        // input要素がフォーカスを持つのでキー入力はinputが処理する。ESCのみ対応
        if (k === "escape") { e.preventDefault(); setNicknameMode(null); }
        return;
      }
      if (identifyMode) {
        e.preventDefault();
        if (!sr.current) return;
        const _p_id = sr.current.player;
        const _isBCMode = identifyMode.mode === 'bless' || identifyMode.mode === 'curse';
        const _isDupMode = identifyMode.mode === 'duplicate';
        const _filt_id = _p_id.inventory
          .map((_it, _i) => ({ it: _it, i: _i }))
          .filter(({ it, i }) => {
            if (_isBCMode || _isDupMode) return it.type !== "gold";
            if (identifyMode.scrollIdx === i) return false;
            if (it.type === 'weapon' || it.type === 'armor') {
              return identifyMode.mode === 'identify' ? (!it.fullIdent && !it.bcKnown) : (it.fullIdent || it.bcKnown);
            }
            const _k = getIdentKey(it);
            if (!_k) return false;
            if (identifyMode.mode === 'identify') return !sr.current.ident.has(_k) || (!it.fullIdent && !it.bcKnown);
            return sr.current.ident.has(_k);
          });
        const _len_id = _filt_id.length;
        const _idPage    = identifyMode.page || 0;
        const _idTotalPg = Math.max(1, Math.ceil(_len_id / 10));
        const _idPageItems = _filt_id.slice(_idPage * 10, (_idPage + 1) * 10);
        const _idPageLen   = _idPageItems.length;
        const _isUp_id    = k === "arrowup"    || e.code === "Numpad8";
        const _isDown_id  = k === "arrowdown"  || e.code === "Numpad2";
        const _isLeft_id  = k === "arrowleft"  || e.code === "Numpad4";
        const _isRight_id = k === "arrowright" || e.code === "Numpad6";
        if (_isUp_id || _isDown_id) {
          if (_idPageLen > 0) setIdentifyMode({ ...identifyMode, sel: ((identifyMode.sel || 0) + (_isDown_id ? 1 : -1) + _idPageLen) % _idPageLen });
          return;
        }
        if (_isLeft_id || _isRight_id) {
          if (_idTotalPg > 1) setIdentifyMode({ ...identifyMode, page: ((_idPage + (_isRight_id ? 1 : -1)) + _idTotalPg) % _idTotalPg, sel: 0 });
          return;
        }
        if (k === "escape" || k === "x") {
          setIdentifyMode(null);
          setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
          return;
        }
        if ((k === "enter" || k === "z") && _idPageLen > 0) {
          const _curSel_id = Math.min(identifyMode.sel || 0, _idPageLen - 1);
          const { it: _selIt } = _idPageItems[_curSel_id];
          let _msgResult;
          if (identifyMode.mode === 'bless') {
            if (_selIt.type === 'pot') {
              _selIt.capacity = (_selIt.capacity || 1) + 1;
              _msgResult = `${_selIt.name}を祝福した！(容量+1 → ${_selIt.capacity})【祝】`;
            } else { _selIt.blessed = true; _selIt.cursed = false; _selIt.bcKnown = true; _msgResult = `${_selIt.name}を祝福した！【祝】`; }
          } else if (identifyMode.mode === 'curse') {
            if (_selIt.type === 'pot') {
              const _nc = Math.max(0, (_selIt.capacity || 1) - 1);
              if ((_selIt.contents?.length || 0) > _nc) {
                const _rmIdx = _p_id.inventory.indexOf(_selIt);
                if (_rmIdx !== -1) { const _fts2 = new Set(); for (const _ci of (_selIt.contents || [])) placeItemAt(sr.current.dungeon, _p_id.x, _p_id.y, _ci, [], _fts2); _p_id.inventory.splice(_rmIdx, 1); }
                _msgResult = `${_selIt.name}が呪いで割れた！中身が足元に落ちた！【呪】`;
              } else { _selIt.capacity = _nc; _msgResult = `${_selIt.name}を呪った！(容量-1 → ${_selIt.capacity})【呪】`; }
            } else { _selIt.cursed = true; _selIt.blessed = false; _selIt.bcKnown = true; _msgResult = `${_selIt.name}を呪った！【呪】`; }
          } else if (identifyMode.mode === 'duplicate') {
            const _dupCount = identifyMode.blessed ? 2 : identifyMode.cursed ? 0 : 1;
            if (_dupCount === 0) {
              const _rmIdx = _p_id.inventory.indexOf(_selIt);
              if (_rmIdx !== -1) _p_id.inventory.splice(_rmIdx, 1);
              _msgResult = `${_selIt.name}が消えてしまった！【呪】`;
            } else {
              for (let _di = 0; _di < _dupCount; _di++) _p_id.inventory.push({ ..._selIt, id: uid() });
              _msgResult = identifyMode.blessed ? `${_selIt.name}が2つ増えた！【祝】` : `${_selIt.name}が1つ増えた！`;
            }
          } else {
            const _isWA = _selIt.type === 'weapon' || _selIt.type === 'armor';
            const _selKey = _isWA ? null : getIdentKey(_selIt);
            if (identifyMode.mode === 'identify') {
              const _wasAlreadyNamed = !_isWA && _selKey && sr.current.ident.has(_selKey);
              if (_selKey) sr.current.ident.add(_selKey);
              _selIt.fullIdent = true; _selIt.bcKnown = true;
              _msgResult = (_isWA || _wasAlreadyNamed) ? `${_selIt.name}の祝呪が判明した！` : `${_selIt.name}と判明した！`;
            } else {
              if (_selKey) sr.current.ident.delete(_selKey);
              _selIt.fullIdent = false; _selIt.bcKnown = false;
              _msgResult = `${_selIt.name}の識別が失われた...`;
            }
          }
          if (identifyMode.mode !== 'duplicate' && identifyMode.scrollIdx != null) {
            sr.current.player.inventory.splice(identifyMode.scrollIdx, 1);
          }
          if (identifyMode.spellCost != null) {
            sr.current.player.mp -= identifyMode.spellCost;
          }
          endTurn(sr.current, sr.current.player, []);
          const _ml_id = identifyMode.spellMsg ? [identifyMode.spellMsg, _msgResult] : [_msgResult];
          setIdentifyMode(null);
          setMsgs((prev) => [...prev.slice(-80), ..._ml_id]);
          sr.current = { ...sr.current }; setGs({ ...sr.current });
          return;
        }
        return;
      }
      if (putMode) {
        e.preventDefault();
        if (k === "escape" || k === "x") {
          setPutMode(null);
          setPutPage(0);
          setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
          return;
        }
        if (!sr.current) return;
        const inv4 = sr.current.player.inventory;
        const pItems4 = inv4
          .map((it, i) => ({ it, i }))
          .filter(({ i }) => i !== putMode.potIdx);
        const _ps4 = 10;
        const _tp4 = Math.max(1, Math.ceil(pItems4.length / _ps4));
        const _pg4 = pItems4.slice(putPage * _ps4, (putPage + 1) * _ps4);
        const _plen4 = _pg4.length;
        const isUp4 = k === "arrowup" || e.code === "Numpad8";
        const isDown4 = k === "arrowdown" || e.code === "Numpad2";
        const isLeft4 = k === "arrowleft" || e.code === "Numpad4";
        const isRight4 = k === "arrowright" || e.code === "Numpad6";
        if ((isUp4 || isDown4) && _plen4 > 0) {
          setPutMenuSel((s) => (s + (isDown4 ? 1 : -1) + _plen4) % _plen4);
          return;
        }
        if ((isLeft4 || isRight4) && _tp4 > 1) {
          setPutPage((p) => (p + (isRight4 ? 1 : -1) + _tp4) % _tp4);
          setPutMenuSel(0);
          return;
        }
        if ((k === "enter" || k === "z") && _plen4 > 0) {
          const sel4 = _pg4[Math.min(putMenuSel, _plen4 - 1)];
          if (sel4.it.type === "pot")
            setMsgs((prev) => [
              ...prev.slice(-80),
              "壺の中に壺は入れられない。",
            ]);
          else invActRef.current?.put?.(sel4.i);
        }
        return;
      }
      if (markerMode) {
        e.preventDefault();
        if (k === "escape" || k === "x") {
          setMarkerMode(null);
          setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
          return;
        }
        if (!sr.current) return;
        const inv5 = sr.current.player.inventory;
        const isUp5   = k === "arrowup"   || e.code === "Numpad8";
        const isDown5 = k === "arrowdown"  || e.code === "Numpad2";
        if (markerMode.step === "select_blank") {
          const blanks5 = inv5
            .map((it, i) => ({ it, i }))
            .filter(({ it }) => (it.type === "scroll" && it.effect === "blank") || (it.type === "spellbook" && !it.spell));
          const _blen5 = blanks5.length;
          if ((isUp5 || isDown5) && _blen5 > 0) {
            setMarkerMenuSel((s) => (s + (isDown5 ? 1 : -1) + _blen5) % _blen5);
            return;
          }
          if ((k === "enter" || k === "z") && _blen5 > 0) {
            const sel5 = blanks5[Math.min(markerMenuSel, _blen5 - 1)];
            const kind5 = sel5.it.type === "spellbook" ? "spellbook" : "scroll";
            const nextStep5 = kind5 === "spellbook" ? "select_spellbook_type" : "select_type";
            setMarkerMode((prev) => ({ ...prev, step: nextStep5, blankIdx: sel5.i, blankKind: kind5 }));
            setMarkerMenuSel(0);
            const msg5 = kind5 === "spellbook" ? "どの魔法書に変えますか...(インク5回消費)" : "どの魔法を書き込みますか...";
            setMsgs((prev) => [...prev.slice(-80), msg5]);
          }
        } else if (markerMode.step === "select_type") {
          const types5 = ITEMS.filter((it) => it.type === "scroll");
          const _tlen5 = types5.length;
          if ((isUp5 || isDown5) && _tlen5 > 0) {
            setMarkerMenuSel((s) => (s + (isDown5 ? 1 : -1) + _tlen5) % _tlen5);
            return;
          }
          if ((k === "enter" || k === "z") && _tlen5 > 0) {
            const tmpl5 = types5[Math.min(markerMenuSel, _tlen5 - 1)];
            doMarkerWriteRef.current?.(markerMode.blankIdx, tmpl5);
          }
        } else if (markerMode.step === "select_spellbook_type") {
          const sbTypes5 = SPELLBOOKS.filter((it) => it.spell);
          const _sbLen5 = sbTypes5.length;
          if ((isUp5 || isDown5) && _sbLen5 > 0) {
            setMarkerMenuSel((s) => (s + (isDown5 ? 1 : -1) + _sbLen5) % _sbLen5);
            return;
          }
          if ((k === "enter" || k === "z") && _sbLen5 > 0) {
            const tmpl5 = sbTypes5[Math.min(markerMenuSel, _sbLen5 - 1)];
            doMarkerWriteRef.current?.(markerMode.blankIdx, tmpl5);
          }
        }
        return;
      }
      if (spellListMode) {
        e.preventDefault();
        if (k === "escape" || k === "x") { setSpellListMode(false); return; }
        const knownSpells = (sr.current?.player?.spells || []).map((id) => {
          const s = SPELLS.find((sp) => sp.id === id);
          if (!s) return null;
          const _lv = (sr.current?.player?.spellLevels?.[id] || 1);
          return { ...s, mpCost: s.fixedMpCost ? s.mpCost : Math.max(1, 20 - (_lv - 1) * 3), spellLevel: _lv };
        }).filter(Boolean);
        const slen = knownSpells.length;
        const isUpS = k === "arrowup" || e.code === "Numpad8";
        const isDownS = k === "arrowdown" || e.code === "Numpad2";
        if ((isUpS || isDownS) && slen > 0) { setSpellMenuSel((s) => (s + (isDownS ? 1 : -1) + slen) % slen); return; }
        if ((k === "enter" || k === "z") && slen > 0) {
          const spell = knownSpells[Math.min(spellMenuSel, slen - 1)];
          if (!spell) return;
          if ((sr.current?.player?.mp || 0) < spell.mpCost) {
            setMsgs((prev) => [...prev.slice(-80), `MPが足りない！(必要:${spell.mpCost} 現在:${sr.current?.player?.mp || 0})`]);
            setSpellListMode(false); return;
          }
          setSpellListMode(false);
          if (!spell.needsDir) {
            // 非指向魔法：即時発動
            if (!sr.current) return;
            const { player: p2, dungeon: dg2 } = sr.current;
            const ml2 = [];
            if (inMagicSealRoom(p2.x, p2.y, dg2) || (p2.sealedTurns || 0) > 0) {
              ml2.push(`魔法が封印されている！MPは消費しない。`);
              endTurn(sr.current, p2, ml2); setMsgs((prev) => [...prev.slice(-80), ...ml2]); sr.current = { ...sr.current }; setGs({ ...sr.current });
            } else if (spell.effect === "identify_magic") {
              const _idt = p2.inventory.filter(_ii => {
                if (_ii.type === 'weapon' || _ii.type === 'armor') return !_ii.fullIdent && !_ii.bcKnown;
                const _k = getIdentKey(_ii); return !!_k && (!sr.current.ident.has(_k) || (!_ii.fullIdent && !_ii.bcKnown));
              });
              if (_idt.length === 0) {
                p2.mp -= spell.mpCost;
                ml2.push(`${spell.name}を唱えた！[MP -${spell.mpCost}]`);
                ml2.push("未識別のアイテムがない。");
                endTurn(sr.current, p2, ml2); setMsgs((prev) => [...prev.slice(-80), ...ml2]); sr.current = { ...sr.current }; setGs({ ...sr.current });
              } else {
                setMsgs((prev) => [...prev.slice(-80), "識別するアイテムを選んでください。"]);
                setIdentifyMode({ mode: 'identify', sel: 0, spellCost: spell.mpCost, spellMsg: `${spell.name}を唱えた！[MP -${spell.mpCost}]` });
                setShowInv(false); setSelIdx(null); setShowDesc(null);
                sr.current = { ...sr.current }; setGs({ ...sr.current });
              }
            } else if (spell.effect === "bless_magic" || spell.effect === "curse_magic") {
              const _bcMode = spell.effect === "bless_magic" ? 'bless' : 'curse';
              const _bcPrompt = _bcMode === 'bless' ? "祝福するアイテムを選んでください。" : "呪うアイテムを選んでください。";
              setMsgs((prev) => [...prev.slice(-80), _bcPrompt]);
              setIdentifyMode({ mode: _bcMode, sel: 0, spellCost: spell.mpCost, spellMsg: `${spell.name}を唱えた！[MP -${spell.mpCost}]` });
              setShowInv(false); setSelIdx(null); setShowDesc(null);
              sr.current = { ...sr.current }; setGs({ ...sr.current });
            } else {
            p2.mp -= spell.mpCost;
            ml2.push(`${spell.name}を唱えた！[MP -${spell.mpCost}]`);
            applySpellEffect(spell.effect, "self", null, 0, 0, dg2, p2, ml2, lu);
            endTurn(sr.current, p2, ml2);
            setMsgs((prev) => [...prev.slice(-80), ...ml2]);
            sr.current = { ...sr.current }; setGs({ ...sr.current });
            }
          } else {
            setThrowMode({ idx: spell.id, mode: "cast_spell" });
            setMsgs((prev) => [...prev.slice(-80), `${spell.name}：方向を選んでください (矢印キー)`]);
          }
        }
        return;
      }
      if (shopMode) {
        e.preventDefault();
        if (k === "escape" || k === "x") {
          setShopMode(null);
          return;
        }
        const isUp3 = k === "arrowup" || e.code === "Numpad8";
        const isDown3 = k === "arrowdown" || e.code === "Numpad2";
        if (shopMode === "pay") {
          if (isUp3 || isDown3) {
            setShopMenuSel((p2) => (p2 + (isDown3 ? 1 : -1) + 2) % 2);
            return;
          }
          if (k === "enter" || k === "z" || k === "1") {
            if (shopMenuSel === 0) {
              if (sr.current) {
                const { player: p2, dungeon: dg2 } = sr.current;
                if (p2.gold >= dg2.shop.unpaidTotal) {
                  p2.gold -= dg2.shop.unpaidTotal;
                  dg2.shop.unpaidTotal = 0;
                  p2.inventory.forEach((it2) => {
                    if (it2.shopPrice) delete it2.shopPrice;
                  });
                  dg2.items.forEach((it2) => {
                    if (it2.shopPrice) delete it2.shopPrice;
                  });
                  const sk5 = dg2.monsters.find((m) => m.type === "shopkeeper");
                  if (sk5) {
                    sk5.state = "friendly";
                    sk5.x = sk5.homePos.x;
                    sk5.y = sk5.homePos.y;
                  }
                  setMsgs((prev) => [
                    ...prev.slice(-80),
                    "代金を支払った。ありがとうございます！",
                  ]);
                  setShopMode(null);
                  sr.current = { ...sr.current };
                  setGs({ ...sr.current });
                } else
                  setMsgs((prev) => [...prev.slice(-80), "お金が足りない！"]);
              }
            } else setShopMode(null);
            return;
          }
          if (k === "2") {
            setShopMode(null);
            return;
          }
          return;
        }
        if (shopMode === "sell") {
          if (!sr.current) {
            setShopMode(null);
            return;
          }
          const { player: p2, dungeon: dg2 } = sr.current;
          const fis3 = dg2.items.filter(
            (i) =>
              !i.shopPrice &&
              dg2.shop &&
              i.x >= dg2.shop.room.x &&
              i.x < dg2.shop.room.x + dg2.shop.room.w &&
              i.y >= dg2.shop.room.y &&
              i.y < dg2.shop.room.y + dg2.shop.room.h,
          );
          const mlen3 = fis3.length + 1;
          if (isUp3 || isDown3) {
            setShopMenuSel((p2) => (p2 + (isDown3 ? 1 : -1) + mlen3) % mlen3);
            return;
          }
          if (k === "enter" || k === "z") {
            if (shopMenuSel < fis3.length) {
              const it2 = fis3[shopMenuSel];
              const bp = Math.ceil(itemPrice(it2) * 0.5);
              p2.gold += bp;
              it2.shopPrice = itemPrice(it2);
              setMsgs((prev) => [
                ...prev.slice(-80),
                `${it2.name}を${bp}Gで買い取った。`,
              ]);
              setShopMenuSel(
                Math.min(shopMenuSel, Math.max(0, fis3.length - 2)),
              );
              sr.current = { ...sr.current };
              setGs({ ...sr.current });
              if (fis3.length <= 1) {
                const dt = dg2.shop.unpaidTotal;
                if (dt > 0) {
                  setShopMode("pay");
                  setShopMenuSel(0);
                  setMsgs((prev) => [
                    ...prev.slice(-80),
                    `店主：「お代は${dt}Gです。」`,
                  ]);
                } else setShopMode(null);
              }
            } else {
              const dt = dg2.shop.unpaidTotal;
              if (dt > 0) {
                setShopMode("pay");
                setShopMenuSel(0);
                setMsgs((prev) => [
                  ...prev.slice(-80),
                  `店主：「お代は${dt}Gです。」`,
                ]);
              } else setShopMode(null);
            }
            return;
          }
          return;
        }
        return;
      }
      if (bigboxMode) {
        e.preventDefault();
        const isUpBB = k === "arrowup" || e.code === "Numpad8";
        const isDownBB = k === "arrowdown" || e.code === "Numpad2";
        if (bigboxMode === "menu") {
          const mlen2 = 2;
          if (isUpBB || isDownBB) {
            setBigboxMenuSel((p) => (p + (isDownBB ? 1 : -1) + mlen2) % mlen2);
            return;
          }
          if (k === "enter" || k === "z" || k === "x" || k === "escape") {
            if ((k === "enter" || k === "z") && bigboxMenuSel === 0) {
              setBigboxMode("put");
              setBigboxMenuSel(0);
              setBigboxPage(0);
            } else {
              setBigboxMode(null);
              bigboxRef.current = null;
              setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
            }
            return;
          }
          if (k === "1") {
            setBigboxMode("put");
            setBigboxMenuSel(0);
            setBigboxPage(0);
          } else if (k === "2") {
            setBigboxMode(null);
            bigboxRef.current = null;
            setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
          }
          return;
        }
        if (bigboxMode === "put") {
          const inv2 = sr.current?.player?.inventory || [];
          const il2 = inv2.length;
          const _ps = 10;
          const _tp = Math.max(1, Math.ceil(il2 / _ps));
          const _pi = inv2.slice(bigboxPage * _ps, (bigboxPage + 1) * _ps);
          const _pil = _pi.length;
          const isLeftBB = k === "arrowleft" || e.code === "Numpad4";
          const isRightBB = k === "arrowright" || e.code === "Numpad6";
          if ((isUpBB || isDownBB) && _pil > 0) {
            setBigboxMenuSel((p) => (p + (isDownBB ? 1 : -1) + _pil) % _pil);
            return;
          }
          if ((isLeftBB || isRightBB) && _tp > 1) {
            setBigboxPage((p) => (p + (isRightBB ? 1 : -1) + _tp) % _tp);
            setBigboxMenuSel(0);
            return;
          }
          if (k === "enter" || k === "z") {
            if (_pil > 0) bigboxPutItem(bigboxPage * _ps + bigboxMenuSel);
            return;
          }
          if (k === "x" || k === "escape") {
            setBigboxMode("menu");
            setBigboxMenuSel(0);
            setBigboxPage(0);
            return;
          }
          return;
        }
        return;
      }
      if (springMode) {
        e.preventDefault();
        const isUp = k === "arrowup" || e.code === "Numpad8";
        const isDown = k === "arrowdown" || e.code === "Numpad2";
        if (k === "escape" || k === "x") {
          if (springMode === "soak") {
            setSpringMode("menu");
            setSpringMenuSel(0);
          } else {
            setSpringMode(null);
            setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
          }
          return;
        }
        if (springMode === "menu") {
          const mlen = 3;
          if (isUp || isDown) {
            setSpringMenuSel((p) => (p + (isDown ? 1 : -1) + mlen) % mlen);
            return;
          }
          if (k === "enter" || k === "z") {
            if (springMenuSel === 0) springDrink();
            else if (springMenuSel === 1) {
              setSpringMode("soak");
              setSpringMenuSel(0);
            } else {
              setSpringMode(null);
              setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
            }
            return;
          }
          if (k === "1") springDrink();
          else if (k === "2") {
            setSpringMode("soak");
            setSpringMenuSel(0);
          } else if (k === "3") {
            setSpringMode(null);
            setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
          }
          return;
        }
        if (springMode === "soak") {
          const inv = sr.current?.player?.inventory || [];
          const ilen = inv.length;
          const _spTotalPg = Math.max(1, Math.ceil(ilen / 10));
          const isLeft = k === "arrowleft" || e.code === "Numpad4";
          const isRight = k === "arrowright" || e.code === "Numpad6";
          if ((isUp || isDown) && ilen > 0) {
            setSpringMenuSel((s) => (s + (isDown ? 1 : -1) + 10) % 10);
            return;
          }
          if (isLeft) { setSpringPage((pg) => (pg - 1 + _spTotalPg) % _spTotalPg); setSpringMenuSel(0); return; }
          if (isRight) { setSpringPage((pg) => (pg + 1) % _spTotalPg); setSpringMenuSel(0); return; }
          if ((k === "enter" || k === "z") && ilen > 0) {
            const _spAbsIdx = springPage * 10 + springMenuSel;
            if (inv[_spAbsIdx]) { springDoSoak(_spAbsIdx); setSpringPage(0); setSpringMenuSel(0); }
            return;
          }
          return;
        }
        return;
      }
      if (throwMode !== null) {
        if (k === "escape") {
          e.preventDefault();
          setThrowMode(null);
          setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
          return;
        }
        const numpadThrow = {
          Numpad1: [-1, 1],
          Numpad2: [0, 1],
          Numpad3: [1, 1],
          Numpad4: [-1, 0],
          Numpad6: [1, 0],
          Numpad7: [-1, -1],
          Numpad8: [0, -1],
          Numpad9: [1, -1],
        };
        if (e.code in numpadThrow) {
          e.preventDefault();
          execRef.current?.(numpadThrow[e.code][0], numpadThrow[e.code][1]);
          return;
        }
        const km = {
          arrowup: [0, -1],
          arrowdown: [0, 1],
          arrowleft: [-1, 0],
          arrowright: [1, 0],
        };
        if (km[k]) {
          e.preventDefault();
          if (bigboxMode || springMode || putMode || markerMode || spellListMode) {
            return;
          }
          execRef.current?.(km[k][0], km[k][1]);
        }
        return;
      }
      if (k === "i" || k === "escape") {
        e.preventDefault();
        act("inventory");
        return;
      }
      if (showInv) return;
      const numpadGame = {
        Numpad1: [-1, 1],
        Numpad2: [0, 1],
        Numpad3: [1, 1],
        Numpad4: [-1, 0],
        Numpad5: null,
        Numpad6: [1, 0],
        Numpad7: [-1, -1],
        Numpad8: [0, -1],
        Numpad9: [1, -1],
      };
      if (e.code in numpadGame && !bigboxMode && !springMode && !putMode && !markerMode && !spellListMode) {
        e.preventDefault();
        const nd = numpadGame[e.code];
        if (nd === null) {
          act("wait");
        } else if (e.shiftKey || shiftRef.current) {
          doDash(nd[0], nd[1]);
        } else {
          act("move", nd[0], nd[1]);
        }
        return;
      }
      const km = {
        arrowup: [0, -1],
        arrowdown: [0, 1],
        arrowleft: [-1, 0],
        arrowright: [1, 0],
      };
      if (km[k]) {
        e.preventDefault();
        if (bigboxMode || springMode || putMode || markerMode || spellListMode) {
          return;
        }
        if (e.shiftKey || shiftRef.current) {
          doDash(km[k][0], km[k][1]);
        } else {
          act("move", km[k][0], km[k][1]);
        }
        return;
      }
      if (k === "." || k === " ") {
        e.preventDefault();
        act("wait");
      } else if (k === "s") {
        e.preventDefault();
        act("search_traps");
      } else if (k === "g" || k === ",") act("grab");
      else if (k === "q") act("shoot_arrow");
      else if (k === ">") act("stairs_down");
      else if (k === "<") act("stairs_up");
      else if (k === "f") act("interact");
      else if (
        k === "z" &&
        !showInv &&
        !bigboxMode &&
        !springMode &&
        !throwMode &&
        !putMode
      ) {
        e.preventDefault();
        doExamineFront();
      } else if (
        k === "c" &&
        !showInv &&
        !springMode &&
        !throwMode &&
        !putMode &&
        !markerMode
      ) {
        e.preventDefault();
        setSpellListMode((f) => !f);
        setSpellMenuSel(0);
      } else if (
        k === "t" &&
        !showInv &&
        !springMode &&
        !throwMode &&
        !putMode
      ) {
        e.preventDefault();
        setFacingMode((f) => !f);
      }
    },
    [
      act,
      doDash,
      showInv,
      selIdx,
      invPage,
      invMenuSel,
      throwMode,
      springMode,
      springMenuSel,
      springDrink,
      springDoSoak,
      putMode,
      putMenuSel,
      facingMode,
      setFacingMode,
      shopMode,
      shopMenuSel,
      bigboxMode,
      bigboxMenuSel,
      bigboxPutItem,
      bigboxPage,
      sortInventory,
      putPage,
      markerMode,
      markerMenuSel,
      spellListMode,
      spellMenuSel,
      dead,
      gameOverSel,
      showScores,
      nicknameMode,
      identifyMode,
      revealMode,
      tpSelectMode,
    ],
  );
  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);
  const useLabel = (it) => {
    const _p = gs?.player;
    if (it.type === "weapon") return _p?.weapon === it ? "外す" : "装備";
    if (it.type === "armor")  return _p?.armor  === it ? "外す" : "装備";
    if (it.type === "arrow")  return _p?.arrow  === it ? "外す" : "装備";
    if (it.type === "food") return "食べる";
    if (it.type === "scroll") return "読む";
    if (it.type === "pen") return "描く";
    if (it.type === "pot") return "入れる";
    return "使う";
  };
  const canUse = (it) =>
    ["potion", "food", "scroll", "weapon", "armor", "arrow", "pot", "pen"].includes(
      it.type,
    );
  const doUseItem = useCallback((idx) => {
    if (!sr.current) return;
    const { player: p, dungeon: dg } = sr.current;
    const it = p.inventory[idx];
    if (!it) return;
    if (p.sleepTurns > 0 || p.paralyzeTurns > 0) return;
    const ml = [];
    // 未識別消耗品の判定（使用前に取得）
    const _ik_reveal = (it.type === 'potion' || it.type === 'scroll') ? getIdentKey(it) : null;
    const _wasUnknown = !!(_ik_reveal && !sr.current.ident.has(_ik_reveal));
    const _revFake = _wasUnknown ? itemDisplayName(it, sr.current.fakeNames, sr.current.ident, sr.current.nicknames) : null;
    const _revReal = _wasUnknown ? it.name : null;
    if (it.type === "potion") {
      const _potBm = getBlessMultiplier(it);
      p.inventory.splice(idx, 1);
      { const _ik = getIdentKey(it); if (_ik) sr.current.ident.add(_ik); }
      // 毒回復ヘルパー
      const _curePoison = () => {
        if (p.poisoned) {
          p.poisoned = false;
          if ((p.poisonAtkLoss || 0) > 0) { p.atk += p.poisonAtkLoss; p.poisonAtkLoss = 0; }
          return true;
        }
        return false;
      };
      if (it.effect === "heal") {
        if (it.cursed) {
          // 呪い：反転→ダメージ
          const d = Math.max(1, Math.round(it.value * 0.7));
          p.deathCause = "呪われた回復薬を飲んで";
          p.hp -= d;
          ml.push(`${it.name}を飲んだ。まずい！${d}ダメージ！【呪】`);
        } else {
          // 通常/祝福：HP回復（祝福=1.5x + 全状態異常回復）
          const h = Math.min(Math.round(it.value * _potBm), p.maxHp - p.hp);
          p.hp += h;
          let _hMsg = `${it.name}を飲んだ。HP+${h}${it.blessed ? "（祝福）" : ""}`;
          if (it.blessed) {
            const _cured = [];
            if ((p.sleepTurns || 0) > 0) { p.sleepTurns = 0; _cured.push("睡眠"); }
            if ((p.confusedTurns || 0) > 0) { p.confusedTurns = 0; _cured.push("混乱"); }
            if ((p.slowTurns || 0) > 0) { p.slowTurns = 0; _cured.push("鈍足"); }
            if (_curePoison()) _cured.push("毒");
            if (!p.poisoned && (p.poisonAtkLoss || 0) > 0) { p.atk += p.poisonAtkLoss; p.poisonAtkLoss = 0; _cured.push("毒による攻撃力低下"); }
            if (_cured.length > 0) _hMsg += ` ${_cured.join("・")}も解消！`;
          }
          ml.push(_hMsg);
        }
      } else if (it.effect === "poison") {
        if (it.cursed) {
          // 呪い：反転→解毒薬
          const _wasPoison = _curePoison();
          const _hadAtkLoss = !p.poisoned && (p.poisonAtkLoss || 0) > 0;
          if (_hadAtkLoss) { p.atk += p.poisonAtkLoss; p.poisonAtkLoss = 0; }
          if (_wasPoison || _hadAtkLoss) {
            ml.push(`${it.name}を飲んだ。毒が体から消えた！攻撃力も回復！【呪→解毒】`);
          } else {
            ml.push(`${it.name}を飲んだ。変な味がするが…毒はかかっていなかった。【呪→解毒】`);
          }
        } else {
          // 通常：毒状態を付与。祝福=即時ATK-3の追加ペナルティ
          p.poisoned = true;
          if (it.blessed) {
            const _extraLoss = Math.min(3, p.atk - 1);
            p.atk -= _extraLoss;
            p.poisonAtkLoss = (p.poisonAtkLoss || 0) + _extraLoss;
            ml.push(`${it.name}を飲んだ。強烈な毒を浴びた！毒状態になり攻撃力が${_extraLoss}下がった！【祝=強毒】`);
          } else {
            ml.push(`${it.name}を飲んだ。毒状態になった！攻撃力が徐々に下がっていく…`);
          }
        }
      } else if (it.effect === "fire") {
        if (it.cursed) {
          // 呪い：反転→HP回復
          const h = Math.min(it.value, p.maxHp - p.hp);
          p.hp += h;
          ml.push(`${it.name}を飲んだ。体が温まりHP+${h}回復した！【呪→回復】`);
        } else {
          // 通常/祝福：炎ダメージ（祝福=1.5x）
          const rd = Math.max(1, Math.round((it.value + rng(-5, 5)) * _potBm));
          const d =
            p.armor?.ability === "fire_resist" ||
            !!p.armor?.abilities?.includes("fire_resist")
              ? Math.floor(rd / 2)
              : rd;
          p.deathCause = "炎の薬を飲んで";
          p.hp -= d;
          ml.push(
            `${it.name}を飲んだ。体が燃えるように熱い！${d}ダメージ！${p.armor?.ability === "fire_resist" || !!p.armor?.abilities?.includes("fire_resist") ? "(耘火)" : ""}${it.blessed ? "【祝=強炎】" : ""}`,
          );
        }
      } else if (it.effect === "sleep") {
        if (it.cursed) {
          // 呪い：反転→眠気が吹き飛び2倍速
          p.sleepTurns = 0;
          p.hasteTurns = (p.hasteTurns || 0) + 5;
          ml.push(`${it.name}を飲んだ。眠気が吹き飛んだ！体が覚醒した！(2倍速5ターン)【呪→覚醒】`);
        } else {
          // 通常/祝福：プレイヤーを眠らせる（祝福=2倍ターン）
          const t = Math.max(1, Math.round((it.value + rng(-1, 1)) * (it.blessed ? 2 : 1)));
          if (
            p.armor?.ability === "sleep_proof" ||
            !!p.armor?.abilities?.includes("sleep_proof")
          ) {
            ml.push(`${it.name}を飲んだ。なんとも無い。(耔眠)`);
          } else if ((p.statusImmune || 0) > 0) {
            ml.push(`${it.name}を飲んだ。状態防止中のため効かなかった！`);
          } else {
            p.sleepTurns = (p.sleepTurns || 0) + t;
            ml.push(
              `${it.name}を飲んだ。眠くなってきた...(${t}ターン)${it.blessed ? "【祝=強眠】" : ""}`,
            );
          }
        }
      } else if (it.effect === "power") {
        if (it.cursed) {
          // 呪い：反転→攻撃力減少
          const _pv = Math.max(1, Math.round(it.value * 0.5));
          p.atk = Math.max(1, p.atk - _pv);
          ml.push(`${it.name}を飲んだ。力が抜けた...攻撃力-${_pv}【呪】`);
        } else {
          // 通常/祝福：攻撃力増加（祝福=1.5x）
          const _pv = Math.max(1, Math.round(it.value * _potBm));
          p.atk += _pv;
          ml.push(`${it.name}を飲んだ。力が湧いてきた！攻撃力+${_pv}${it.blessed ? "（祝福）" : ""}`);
        }
      } else if (it.effect === "slow") {
        if (it.cursed) {
          // 呪い：反転→2倍速
          p.hasteTurns = (p.hasteTurns || 0) + 10;
          ml.push(`${it.name}を飲んだ。体が軽くなった！(2倍速10ターン)【呪→加速】`);
        } else {
          // 通常/祝福：鈍足（祝福=2倍ターン）
          const _st = it.blessed ? 20 : 10;
          if ((p.statusImmune || 0) > 0) {
            ml.push(`${it.name}を飲んだ。状態防止中のため効かなかった！`);
          } else {
            p.slowTurns = (p.slowTurns || 0) + _st;
            ml.push(`${it.name}を飲んだ。体が重くなった...(鈍足${_st}ターン)${it.blessed ? "【祝=強鈍】" : ""}`);
          }
        }
      } else if (it.effect === "confuse") {
        if (it.cursed) {
          // 呪い：混乱解消 + 必中100ターン
          p.confusedTurns = 0;
          p.sureHitTurns = (p.sureHitTurns || 0) + 100;
          ml.push(`${it.name}を飲んだ。頭が冴えた！混乱が消え、必中状態になった！(100ターン)【呪→必中】`);
        } else {
          // 通常/祝福：混乱（祝福=2倍ターン）
          const _cturns = it.blessed ? 10 : 5;
          p.confusedTurns = (p.confusedTurns || 0) + _cturns;
          ml.push(`${it.name}を飲んだ。頭がくらくらする！(混乱${p.confusedTurns}ターン)${it.blessed ? "【祝=強混乱】" : ""}`);
        }
      } else if (it.effect === "paralyze") {
        if (it.cursed) {
          // 呪い→状態異常防止200ターン
          p.statusImmune = (p.statusImmune || 0) + 200;
          ml.push(`${it.name}を飲んだ。状態異常を防ぐ力が宿った！(200ターン)【呪→状態防止】`);
        } else {
          // 通常/祝福：金縛り（祝福=2倍ターン）
          if ((p.statusImmune || 0) > 0) {
            ml.push(`${it.name}を飲んだ。状態防止中のため効かなかった！`);
          } else {
            const _pt = it.blessed ? 20 : 10;
            p.paralyzeTurns = _pt;
            ml.push(`${it.name}を飲んだ。体が動かない！(${_pt}ターン金縛り)${it.blessed ? "【祝=強金縛り】" : ""}`);
          }
        }
      } else if (it.effect === "mana") {
        if (it.cursed) {
          // 呪い：反転→MP封印
          p.mpCooldownTurns = (p.mpCooldownTurns || 0) + 10;
          ml.push(`${it.name}を飲んだ。魔力が封じられた！(MP封印10ターン)【呪】`);
        } else if ((p.mpCooldownTurns || 0) > 0) {
          ml.push(`${it.name}を飲んだ。MPが封印中のため回復できない！(残り${p.mpCooldownTurns}ターン)`);
        } else {
          // 通常/祝福：MP回復（祝福=1.5x）
          const _madd = Math.min(Math.round(it.value * _potBm), (p.maxMp || 20) - (p.mp || 0));
          p.mp = (p.mp || 0) + _madd;
          ml.push(`${it.name}を飲んだ。MP+${_madd}${it.blessed ? "（祝福）" : ""}`);
        }
      }
      if (p.inventory.length < (p.maxInventory || 30)) {
        const bottle = { ...EMPTY_BOTTLE, id: uid() };
        p.inventory.push(bottle);
        ml.push("空き瓶が残った。");
      }
    } else if (it.type === "food") {
      const _foodBm = getBlessMultiplier(it);
      const _foodVal = Math.max(1, Math.round(it.value * _foodBm));
      p.inventory.splice(idx, 1);
      const _foodAdded = Math.min(_foodVal, p.maxHunger - p.hunger);
      p.hunger = Math.min(p.maxHunger, p.hunger + _foodVal);
      ml.push(
        `${it.name}を食べた。(満腹度+${_foodAdded})${it.blessed ? "（祝福：よく味わえた）" : it.cursed ? "（呪い：まずかった）" : ""}`,
      );
      const fe = it.effect;
      if (fe === "heal_food") {
        const h = rng(10, 20);
        const ah = Math.min(h, p.maxHp - p.hp);
        p.hp += ah;
        if (ah > 0) ml.push(`体が温まりHPが${ah}回復した。`);
      } else if (fe === "power_food") {
        p.atk += 1;
        ml.push("力が湧いてきた！攻撃力+1");
      } else if (fe === "speed_food") {
        if (p.sleepTurns > 0) {
          p.sleepTurns = 0;
          ml.push("目が覚めた！");
        } else ml.push("体が軽くなった！");
      } else if (fe === "def_food") {
        p.def += 1;
        ml.push("体が頑丈になった！防御力+1");
      } else if (fe === "vitality_food") {
        p.maxHp += 2;
        p.hp += 2;
        ml.push("生命力が増した！最大HP+2");
      } else if (fe === "exp_food") {
        const ex = rng(5, 10 + p.level * 3);
        p.exp += ex;
        ml.push(`知恵が付いた。経験値+${ex}`);
        lu(p, ml);
      } else if (fe === "luck_food") {
        const g = rng(10, 30);
        p.gold += g;
        ml.push(`幸運だ！${g}ゴールドを見つけた。`);
      } else if (fe === "reveal_food") {
        for (let y2 = 0; y2 < MH; y2++)
          for (let x2 = 0; x2 < MW; x2++) dg.explored[y2][x2] = true;
        dg.traps.forEach((t2) => (t2.revealed = true));
        ml.push("目が冴えてフロア全体が見えた！");
      } else if (fe === "antidote_food") {
        const _acured = [];
        if (p.sleepTurns > 0) { p.sleepTurns = 0; _acured.push("睡眠"); }
        if (p.paralyzeTurns > 0) { p.paralyzeTurns = 0; _acured.push("金縛り"); }
        if (p.poisoned) {
          p.poisoned = false;
          if ((p.poisonAtkLoss || 0) > 0) { p.atk += p.poisonAtkLoss; p.poisonAtkLoss = 0; }
          _acured.push("毒");
        } else if ((p.poisonAtkLoss || 0) > 0) {
          p.atk += p.poisonAtkLoss; p.poisonAtkLoss = 0;
          _acured.push("毒による攻撃力低下");
        }
        if (_acured.length > 0) ml.push(`状態異常が消えた！(${_acured.join("・")})`);
        const h2 = rng(3, 8);
        p.hp = Math.min(p.maxHp, p.hp + h2);
        ml.push(`体の調子が良くなった。HP+${h2}`);
      } else if (fe === "satiate_food") {
        ml.push("とても腹持ちが良い！");
      }
      if (it.potionEffects && it.potionEffects.length > 0) {
        for (const pe of it.potionEffects) {
          if (pe === "heal") {
            const ph = rng(10, 25);
            const pah = Math.min(ph, p.maxHp - p.hp);
            p.hp += pah;
            if (pah > 0) ml.push(`回復効果でHP+${pah}`);
          } else if (pe === "poison") {
            p.poisoned = true;
            ml.push("毒が混じっていた！毒状態になった！攻撃力が徐々に下がっていく…");
          } else if (pe === "sleep") {
            const st = rng(3, 6);
            if ((p.statusImmune || 0) > 0) ml.push("睡眠効果！状態防止中のため効かなかった！");
            else { p.sleepTurns = (p.sleepTurns || 0) + st; ml.push(`睡眠効果で${st}ターン眠ってしまった...`); }
          } else if (pe === "power") {
            p.atk += 2;
            ml.push("強化効果で攻撃力+2！");
          } else if (pe === "mana") {
            if ((p.mpCooldownTurns || 0) > 0) {
              ml.push(`MP封印中のため魔力効果は発揮されなかった！(残り${p.mpCooldownTurns}ターン)`);
            } else {
              const _mpRec = Math.min(10, (p.maxMp || 0) - (p.mp || 0));
              p.mp = (p.mp || 0) + _mpRec;
              if (_mpRec > 0) ml.push(`魔力効果でMP+${_mpRec}`);
            }
          } else if (pe === "confuse") {
            const _ct = rng(3, 8);
            p.confusedTurns = (p.confusedTurns || 0) + _ct;
            ml.push(`混乱成分が！頭がくらくらする...(${_ct}ターン)`);
          }
        }
      }
    } else if (it.type === "scroll") {
      if (it.effect === "blank") {
        ml.push("白紙の巻物だ。魔法のマーカーで書き込めるかもしれない。");
        endTurn(sr.current, p, ml);
        setMsgs((prev) => [...prev.slice(-80), ...ml]);
        setSelIdx(null);
        setShowDesc(null);
        setShowInv(false);
        sr.current = { ...sr.current };
        setGs({ ...sr.current });
        return;
      }
      // 識別の巻物でダイアログが必要な場合は消費せず early-return（魔封じの魔方陣内は除く）
      if (it.effect === "identify" && !it.blessed && !inMagicSealRoom(p.x, p.y, dg)) {
        const _ik_scr = getIdentKey(it); // "s:identify"
        if (it.cursed) {
          const _tgts = p.inventory.filter((_ii, _i) => {
            if (_i === idx) return false;
            if (_ii.type === 'weapon' || _ii.type === 'armor') return _ii.fullIdent || _ii.bcKnown;
            const _k = getIdentKey(_ii); return _k && sr.current.ident.has(_k);
          });
          if (_tgts.length > 0) {
            if (_ik_scr) sr.current.ident.add(_ik_scr);
            const _rp = (_wasUnknown && _revFake && _revFake !== _revReal) ? [`${_revFake}は${_revReal}だった！`] : [];
            setMsgs((prev) => [...prev.slice(-80), ..._rp, "どのアイテムの識別を解除する？【呪】"]);
            setIdentifyMode({ mode: 'unidentify', sel: 0, scrollIdx: idx });
            setShowInv(false); setSelIdx(null); setShowDesc(null);
            sr.current = { ...sr.current }; setGs({ ...sr.current });
            return;
          }
        } else {
          const _tgts = p.inventory.filter((_ii, _i) => {
            if (_i === idx) return false;
            if (_ii.type === 'weapon' || _ii.type === 'armor') return !_ii.fullIdent && !_ii.bcKnown;
            const _k = getIdentKey(_ii); return !!_k && (!sr.current.ident.has(_k) || (!_ii.fullIdent && !_ii.bcKnown));
          });
          if (_tgts.length > 0) {
            if (_ik_scr) sr.current.ident.add(_ik_scr);
            const _rp = (_wasUnknown && _revFake && _revFake !== _revReal) ? [`${_revFake}は${_revReal}だった！`] : [];
            setMsgs((prev) => [...prev.slice(-80), ..._rp, "識別するアイテムを選んでください。"]);
            setIdentifyMode({ mode: 'identify', sel: 0, scrollIdx: idx });
            setShowInv(false); setSelIdx(null); setShowDesc(null);
            sr.current = { ...sr.current }; setGs({ ...sr.current });
            return;
          }
        }
      }
      const _scrBm = getBlessMultiplier(it);
      p.inventory.splice(idx, 1);
      { const _ik = getIdentKey(it); if (_ik) sr.current.ident.add(_ik); }
      if (inMagicSealRoom(p.x, p.y, dg) || (p.sealedTurns || 0) > 0) {
        ml.push(`${it.name}を読んだが、魔法が封印されている！`);
      } else if (it.effect === "teleport") {
        if (it.cursed) {
          const _adjCands = DRO.filter(([adx, ady]) => {
            const tx = p.x + adx, ty = p.y + ady;
            return tx >= 0 && tx < MW && ty >= 0 && ty < MH && dg.map[ty][tx] !== T.WALL && dg.map[ty][tx] !== T.BWALL;
          });
          if (_adjCands.length > 0) {
            const [adx, ady] = _adjCands[rng(0, _adjCands.length - 1)];
            p.x += adx; p.y += ady;
            ml.push("テレポートしたが...すぐ近くだ！【呪】");
          } else {
            ml.push("テレポートしようとしたが動けなかった！【呪】");
          }
        } else if (it.blessed) {
          setTpSelectMode({ cx: p.x, cy: p.y });
          { const _rp = (_wasUnknown && _revFake && _revFake !== _revReal) ? [`${_revFake}は${_revReal}だった！`] : [];
            setMsgs((prev) => [...prev.slice(-80), ..._rp, "テレポート先を選んでください... (Z/Enter:決定 X:キャンセル→ランダム)"]); }
          setSelIdx(null); setShowDesc(null); setShowInv(false);
          sr.current = { ...sr.current };
          setGs({ ...sr.current });
          return;
        } else {
          const rm = dg.rooms[rng(0, dg.rooms.length - 1)];
          p.x = rng(rm.x, rm.x + rm.w - 1);
          p.y = rng(rm.y, rm.y + rm.h - 1);
          ml.push("テレポートした！");
        }
      } else if (it.effect === "reveal") {
        if (it.cursed) {
          // 呪い：マップも罠の位置も全て忘れる
          for (let y = 0; y < MH; y++)
            for (let x = 0; x < MW; x++) dg.explored[y][x] = false;
          dg.traps.forEach((t) => (t.revealed = false));
          ml.push("記憶が消えた…マップと罠の位置を全て忘れてしまった！【呪】");
        } else {
          for (let y = 0; y < MH; y++)
            for (let x = 0; x < MW; x++) dg.explored[y][x] = true;
          dg.traps.forEach((t) => (t.revealed = true));
          if (it.blessed) {
            // 祝福：全開示＋アイテム位置も地図に表示
            dg.itemsRevealed = true;
            ml.push("フロア全体・罠・アイテムの位置が明らかになった！【祝】");
          } else {
            ml.push("フロア全体と罠が明らかになった！");
          }
        }
      } else if (it.effect === "weapon_up") {
        if (p.weapon) {
          const _bef = p.weapon.plus || 0;
          const _gain = it.blessed ? 2 : it.cursed ? -1 : 1;
          p.weapon.plus = _bef + _gain;
          const _fp = (v) => (v > 0 ? `+${v}` : v === 0 ? "無印" : `${v}`);
          let _wMsg = `${p.weapon.name}が${_gain > 0 ? "輝いた" : "くすんだ"}！(${_fp(_bef)}→${_fp(p.weapon.plus)})${it.blessed ? "（祝福）" : it.cursed ? "（呪い）" : ""}`;
          if (p.weapon.cursed) { p.weapon.cursed = false; _wMsg += " 呪いが解けた！"; }
          ml.push(_wMsg);
        } else {
          ml.push("武器を装備していないので効果がなかった。");
        }
      } else if (it.effect === "armor_up") {
        if (p.armor) {
          const _bef = p.armor.plus || 0;
          const _gain = it.blessed ? 2 : it.cursed ? -1 : 1;
          p.armor.plus = _bef + _gain;
          const _fp = (v) => (v > 0 ? `+${v}` : v === 0 ? "無印" : `${v}`);
          let _aMsg = `${p.armor.name}が${_gain > 0 ? "輝いた" : "くすんだ"}！(${_fp(_bef)}→${_fp(p.armor.plus)})${it.blessed ? "（祝福）" : it.cursed ? "（呪い）" : ""}`;
          if (p.armor.cursed) { p.armor.cursed = false; _aMsg += " 呪いが解けた！"; }
          ml.push(_aMsg);
        } else {
          ml.push("防具を装備していないので効果がなかった。");
        }
      } else if (it.effect === "thunder") {
        // 祝福：フロア全モンスターに雷、通常：視界内のみ、呪い：視界内＋自分にも雷
        const _tTargets = it.blessed
          ? dg.monsters
          : dg.monsters.filter((m) => dg.visible[m.y]?.[m.x]);
        if (_tTargets.length === 0 && !it.cursed) {
          ml.push("雷が走るが、視界に敵はいない。");
        } else {
          if (it.blessed && _tTargets.length === 0) {
            ml.push("雷が走るが、フロアに敵はいない。【祝】");
          }
          for (const _m of _tTargets) {
            let _dmg = Math.max(1, Math.round(rng(20, 30) * _scrBm));
            if (inCursedMagicSealRoom(_m.x, _m.y, dg)) _dmg *= 2;
            _m.hp -= _dmg;
            ml.push(`雷が${_m.name}を直撃！${_dmg}ダメージ！${it.blessed ? "（祝福）" : it.cursed ? "（呪い）" : ""}`);
            if (_m.hp <= 0) {
              ml.push(`${_m.name}を倒した！(+${_m.exp}exp)`);
              p.exp += _m.exp;
              monsterDrop(_m, dg, ml, p);
              dg.monsters = dg.monsters.filter((mn) => mn !== _m);
              lu(p, ml);
            }
          }
          // 呪い：自分にも雷が落ちる
          if (it.cursed) {
            const _selfDmg = Math.max(1, rng(10, 20));
            p.hp -= _selfDmg;
            p.deathCause = "呪われた雷の巻物で";
            ml.push(`呪われた雷が自分にも落ちた！${_selfDmg}ダメージ！【呪】`);
          }
        }
      } else if (it.effect === "recovery") {
        if (it.cursed) {
          // 呪い：自分がダメージ、視界内モンスターが回復
          const _rdmg = Math.max(1, rng(10, 20));
          p.hp -= _rdmg;
          p.deathCause = "呪われた回復の巻物で";
          ml.push(`体が焼けるような痛みが走った！${_rdmg}ダメージ！【呪】`);
          const _rvisC = dg.monsters.filter((m) => dg.visible[m.y]?.[m.x]);
          for (const _m of _rvisC) {
            const _ma = Math.min(rng(10, 20), _m.maxHp - _m.hp);
            if (_ma > 0) { _m.hp += _ma; ml.push(`${_m.name}が回復した！HP+${_ma}`); }
          }
        } else {
          const _rh = Math.max(1, Math.round(rng(15, 25) * _scrBm));
          const _ra = Math.min(_rh, p.maxHp - p.hp);
          p.hp += _ra;
          if (it.blessed) {
            // 祝福：自分だけ回復（敵は回復しない）
            ml.push(`体が癒された！HP+${_ra}（祝福：自分だけ回復！）`);
          } else {
            // 通常：自分と視界内モンスターも回復
            ml.push(`体が回復した！HP+${_ra}`);
            const _rvis = dg.monsters.filter((m) => dg.visible[m.y]?.[m.x]);
            for (const _m of _rvis) {
              const _mh = Math.max(1, Math.round(rng(10, 20)));
              const _ma = Math.min(_mh, _m.maxHp - _m.hp);
              if (_ma > 0) { _m.hp += _ma; ml.push(`${_m.name}も回復した！HP+${_ma}`); }
            }
          }
        }
      } else if (it.effect === "item_gather") {
        const _toG = dg.items.filter((gi) => !gi.shopPrice);
        const _cnt = _toG.length;
        if (_cnt === 0) {
          ml.push("引き寄せるアイテムがなかった。");
        } else if (it.cursed) {
          // 呪い：フロアのアイテムをランダムな場所に飛ばす
          dg.items = dg.items.filter((gi) => gi.shopPrice);
          const _floorCands = [];
          for (let _fy = 0; _fy < MH; _fy++)
            for (let _fx = 0; _fx < MW; _fx++)
              if (dg.map[_fy][_fx] !== T.WALL && dg.map[_fy][_fx] !== T.BWALL &&
                  dg.map[_fy][_fx] !== T.SD && dg.map[_fy][_fx] !== T.SU)
                _floorCands.push([_fx, _fy]);
          for (const gi of _toG) {
            const [_rx, _ry] = _floorCands[rng(0, _floorCands.length - 1)];
            gi.x = _rx; gi.y = _ry;
            dg.items.push(gi);
          }
          ml.push(`${_cnt}個のアイテムがフロアに散らばった！【呪】`);
        } else if (it.blessed) {
          // 祝福：フロアのアイテムを直接インベントリに吸収（満杯分は通常の落下ルールで配置）
          dg.items = dg.items.filter((gi) => gi.shopPrice);
          let _picked = 0, _dropped = 0;
          const _blessFt = new Set();
          for (const gi of _toG) {
            if (p.inventory.length < (p.maxInventory || 30)) {
              p.inventory.push(gi);
              _picked++;
            } else {
              placeItemAt(dg, p.x, p.y, gi, ml, _blessFt, 0, p);
              _dropped++;
            }
          }
          ml.push(`${_picked}個のアイテムを拾った！【祝】${_dropped > 0 ? `（${_dropped}個は満杯で周囲に配置）` : ""}`);
        } else {
          // 通常：隣接マスに引き寄せる
          dg.items = dg.items.filter((gi) => gi.shopPrice);
          const _gft = new Set();
          const _igPfBag = [];
          setPitfallBag(_igPfBag);
          for (const gi of _toG) {
            let _placed = false;
            for (const [_dx, _dy] of DRO) {
              const _cx = p.x + _dx, _cy = p.y + _dy;
              if (_cx < 0 || _cx >= MW || _cy < 0 || _cy >= MH) continue;
              if (dg.map[_cy][_cx] === T.WALL || dg.map[_cy][_cx] === T.BWALL || dg.map[_cy][_cx] === T.SD || dg.map[_cy][_cx] === T.SU) continue;
              const _gb = dg.bigboxes?.find((b) => b.x === _cx && b.y === _cy);
              if (_gb) { bigboxAddItem(_gb, gi, dg, ml); _placed = true; break; }
              const _gs = dg.springs?.find((s) => s.x === _cx && s.y === _cy);
              if (_gs) { soakItemIntoSpring(_gs, gi, ml, dg); _placed = true; break; }
              const _gt = dg.traps.find((t) => t.x === _cx && t.y === _cy && !_gft.has(t.id));
              if (_gt) {
                _gft.add(_gt.id);
                _gt.revealed = true;
                const _gr = fireTrapItem(_gt, gi, dg, _cx, _cy, ml, _gft, p, dnameRef);
                if (Math.random() < 0.3) { dg.traps = dg.traps.filter((t) => t !== _gt); ml.push(`${_gt.name}は壊れた。`); }
                if (_gr === "destroyed") { _placed = true; break; }
                if (_gr === "restart") { placeItemAt(dg, _cx, _cy, gi, ml, _gft, 0, p); _placed = true; break; }
                continue;
              }
              if (dg.items.some((i) => i.x === _cx && i.y === _cy)) continue;
              gi.x = _cx; gi.y = _cy;
              dg.items.push(gi);
              _placed = true;
              break;
            }
            if (!_placed) ml.push(`${gi.name}は引き寄せられなかった！`);
          }
          clearPitfallBag();
          if (!sr.current.floors) sr.current.floors = {};
          processPitfallBag(_igPfBag, sr.current.floors, p.depth);
          ml.push(`${_cnt}個のアイテムを引き寄せた！`);
        }
      } else if (it.effect === "sleep_scroll") {
        if (it.cursed) {
          // 呪い：プレイヤーが眠る
          const _pst = Math.max(2, rng(3, 5));
          if ((p.statusImmune || 0) > 0) ml.push("眠気が自分を襲った！状態防止中のため効かなかった！【呪】");
          else { p.sleepTurns = (p.sleepTurns || 0) + _pst; ml.push(`眠気が自分を襲った！${_pst}ターン眠ってしまう…【呪】`); }
        } else {
          // 通常：視界内、祝福：フロア全モンスター
          const _sSleep = it.blessed ? dg.monsters : dg.monsters.filter((m) => dg.visible[m.y]?.[m.x]);
          if (_sSleep.length === 0) {
            ml.push(it.blessed ? "眠気が漂うが、フロアに敵はいない。【祝】" : "眠気が漂うが、視界に敵はいない。");
          } else {
            for (const _m of _sSleep) {
              const _st = Math.max(1, Math.round(rng(3, 6) * _scrBm));
              if ((_m.statusImmune || 0) > 0) { ml.push(`${_m.name}には効かなかった！(状態防止中)`); continue; }
              _m.sleepTurns = (_m.sleepTurns || 0) + _st;
              ml.push(`${_m.name}が眠りに落ちた！(${_st}ターン)${it.blessed ? "【祝】" : ""}`);
            }
          }
        }
      } else if (it.effect === "identify") {
        if (it.blessed) {
          // 全アイテム完全識別（武器・防具も含む）
          for (const _ii of p.inventory) {
            const _k = getIdentKey(_ii);
            if (_k) { sr.current.ident.add(_k); _ii.fullIdent = true; }
            else if (_ii.type === 'weapon' || _ii.type === 'armor') { _ii.fullIdent = true; }
          }
          ml.push("全てのアイテムが識別された！");
        } else if (it.cursed) {
          // 識別済みアイテムを1つ選んで未識別に戻す（武器・防具も含む）
          const _targets = p.inventory.filter(_ii => {
            if (_ii.type === 'weapon' || _ii.type === 'armor') return _ii.fullIdent || _ii.bcKnown;
            const _k = getIdentKey(_ii); return _k && sr.current.ident.has(_k);
          });
          if (_targets.length === 0) {
            ml.push("未識別に戻せるアイテムがない。");
          } else {
            { const _rp = (_wasUnknown && _revFake && _revFake !== _revReal) ? [`${_revFake}は${_revReal}だった！`] : [];
              setMsgs((prev) => [...prev.slice(-80), ..._rp, ...ml, "どのアイテムの識別を解除する？【呪】"]); }
            setIdentifyMode({ mode: 'unidentify' });
            setShowInv(false); setSelIdx(null); setShowDesc(null);
            sr.current = { ...sr.current }; setGs({ ...sr.current });
            return;
          }
        } else {
          // 通常: 1つ選んで識別（武器・防具も含む）
          const _targets = p.inventory.filter(_ii => {
            if (_ii.type === 'weapon' || _ii.type === 'armor') return !_ii.fullIdent && !_ii.bcKnown;
            const _k = getIdentKey(_ii); return !!_k && (!sr.current.ident.has(_k) || (!_ii.fullIdent && !_ii.bcKnown));
          });
          if (_targets.length === 0) {
            ml.push("未識別のアイテムがない。");
          } else {
            { const _rp = (_wasUnknown && _revFake && _revFake !== _revReal) ? [`${_revFake}は${_revReal}だった！`] : [];
              setMsgs((prev) => [...prev.slice(-80), ..._rp, ...ml, "識別するアイテムを選んでください。"]); }
            setIdentifyMode({ mode: 'identify' });
            setShowInv(false); setSelIdx(null); setShowDesc(null);
            sr.current = { ...sr.current }; setGs({ ...sr.current });
            return;
          }
        }
      } else if (it.effect === "duplicate") {
        // 複製の巻物：アイテムを選んで複製（巻物はすでにsplice済み）
        const _dupTargets = p.inventory.filter((_ii) => _ii.type !== "gold");
        if (_dupTargets.length === 0) {
          ml.push("複製できるアイテムがない。");
        } else {
          { const _rp = (_wasUnknown && _revFake && _revFake !== _revReal) ? [`${_revFake}は${_revReal}だった！`] : [];
            setMsgs((prev) => [...prev.slice(-80), ..._rp, ...ml]); }
          setIdentifyMode({ mode: 'duplicate', blessed: it.blessed || false, cursed: it.cursed || false });
          setShowInv(false); setSelIdx(null); setShowDesc(null);
          sr.current = { ...sr.current }; setGs({ ...sr.current });
          return;
        }
      } else if (it.effect === "summon") {
        // 召喚の巻物
        if (it.cursed) {
          // 呪い：同じ部屋の敵を別の部屋に飛ばす
          const _sumRoom = findRoom(dg.rooms, p.x, p.y);
          const _inRoom = _sumRoom
            ? dg.monsters.filter((m) => findRoom(dg.rooms, m.x, m.y) === _sumRoom)
            : [];
          if (_inRoom.length === 0) {
            ml.push("部屋に敵がいないのに呪いが発動した…【呪】");
          } else {
            const _otherRooms = dg.rooms.filter((r) => r !== _sumRoom);
            for (const _sm of _inRoom) {
              const _tr = _otherRooms[rng(0, _otherRooms.length - 1)];
              if (!_tr) continue;
              for (let _att = 0; _att < 20; _att++) {
                const _tx = rng(_tr.x + 1, _tr.x + _tr.w - 2);
                const _ty = rng(_tr.y + 1, _tr.y + _tr.h - 2);
                if (dg.map[_ty]?.[_tx] === T.FLOOR && !dg.monsters.some((m) => m.x === _tx && m.y === _ty) && (_tx !== p.x || _ty !== p.y)) {
                  _sm.x = _tx; _sm.y = _ty; _sm.aware = false; break;
                }
              }
            }
            ml.push(`${_inRoom.length}体の敵が別の部屋へ飛んだ！【呪】`);
          }
        } else {
          // 通常4体、祝福8体召喚
          const _sumCount = it.blessed ? 8 : 4;
          let _spawned = 0;
          // 祝福時は隣接マスから優先
          if (it.blessed) {
            const _dirs8 = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
            for (const [_dy, _dx] of _dirs8) {
              const _nx = p.x + _dx, _ny = p.y + _dy;
              if (dg.map[_ny]?.[_nx] === T.FLOOR && !dg.monsters.some((m) => m.x === _nx && m.y === _ny)) {
                const _mt = MONS[clamp(rng(0, p.depth + 1), 0, MONS.length - 1)];
                dg.monsters.push({ ..._mt, id: uid(), x: _nx, y: _ny, maxHp: _mt.hp, turnAccum: 0, aware: true, dir: { x: 1, y: 0 }, lastPx: p.x, lastPy: p.y, patrolTarget: null });
                _spawned++;
              }
            }
          }
          // 残り分（または通常時）: フロア内ランダム
          for (let _si = _spawned; _si < _sumCount; _si++) {
            for (let _att = 0; _att < 30; _att++) {
              const _sRoom = dg.rooms[rng(0, dg.rooms.length - 1)];
              const _sx = rng(_sRoom.x + 1, _sRoom.x + _sRoom.w - 2);
              const _sy = rng(_sRoom.y + 1, _sRoom.y + _sRoom.h - 2);
              if (dg.map[_sy]?.[_sx] === T.FLOOR && !dg.monsters.some((m) => m.x === _sx && m.y === _sy) && (_sx !== p.x || _sy !== p.y)) {
                const _mt = MONS[clamp(rng(0, p.depth + 1), 0, MONS.length - 1)];
                dg.monsters.push({ ..._mt, id: uid(), x: _sx, y: _sy, maxHp: _mt.hp, turnAccum: 0, aware: false, dir: { x: 1, y: 0 }, lastPx: 0, lastPy: 0, patrolTarget: null });
                _spawned++;
                break;
              }
            }
          }
          ml.push(it.blessed ? `${_spawned}体の敵に囲まれた！【祝】` : `${_spawned}体の敵が召喚された！`);
        }
      } else if (it.effect === "expand_inv") {
        // 収納上手の巻物
        const _curMax = p.maxInventory || 30;
        if (it.cursed) {
          const _loss = rng(1, 3);
          const _newMax = Math.max(10, _curMax - _loss);
          const _actual = _curMax - _newMax;
          p.maxInventory = _newMax;
          // 超過分のアイテムを足元に落とす
          if (p.inventory.length > _newMax) {
            const _excess = p.inventory.splice(_newMax);
            const _fts = new Set();
            for (const _ei of _excess) placeItemAt(dg, p.x, p.y, _ei, ml, _fts, 0, p);
            ml.push(`最大所持数が${_actual}減った…(${_curMax}→${_newMax}) 超過分が落ちた！【呪】`);
          } else {
            ml.push(`最大所持数が${_actual}減った…(${_curMax}→${_newMax})【呪】`);
          }
        } else {
          const _gain = it.blessed ? rng(2, 6) : rng(1, 3);
          p.maxInventory = _curMax + _gain;
          ml.push(it.blessed
            ? `収納が上手くなった！最大所持数が${_gain}増えた！(${_curMax}→${p.maxInventory})【祝】`
            : `収納が上手くなった！最大所持数が${_gain}増えた！(${_curMax}→${p.maxInventory})`);
        }
      }
    } else if (it.type === "pen") {
      if ((it.charges || 0) <= 0) {
        ml.push(`${it.name}のインクが尽きている。充填の大箱で補充できる。`);
        endTurn(sr.current, p, ml);
        setMsgs((prev) => [...prev.slice(-80), ...ml]);
        setSelIdx(null); setShowDesc(null); setShowInv(false);
        sr.current = { ...sr.current }; setGs({ ...sr.current });
        return;
      }
      const _exPen = dg.pentacles?.find((pc) => pc.x === p.x && pc.y === p.y);
      const _penBlocked =
        dg.items.some((gi) => gi.x === p.x && gi.y === p.y) ||
        dg.traps.some((tr) => tr.x === p.x && tr.y === p.y) ||
        dg.springs?.some((s) => s.x === p.x && s.y === p.y) ||
        dg.bigboxes?.some((b) => b.x === p.x && b.y === p.y) ||
        dg.map[p.y][p.x] === T.SD ||
        dg.map[p.y][p.x] === T.SU;
      if (_exPen) {
        ml.push(`すでに${_exPen.name}がある。`);
      } else if (_penBlocked) {
        ml.push("足元に別のものがあって魔方陣を描けない。");
      } else {
        dg.pentacles = dg.pentacles || [];
        const _isBlessed = it.blessed || false;
        const _isCursed = it.cursed || false;
        const _penIK = getIdentKey(it); // "n:sanctuary" etc
        const _penIsIdent = !_penIK || sr.current.ident.has(_penIK);
        const _bcPrefix = _isBlessed ? "祝福された" : _isCursed ? "呪われた" : "";
        let _pName;
        if (_penIsIdent) {
          const _baseName =
            it.effect === "sanctuary"    ? "聖域の魔方陣" :
            it.effect === "vulnerability"? "脆弱の魔方陣" :
            it.effect === "magic_seal"   ? "魔封じの魔方陣" :
            it.effect === "thunder_trap" ? "雷の魔方陣" :
            it.effect === "farcast"      ? "遠投の魔方陣" : "魔方陣";
          _pName = _bcPrefix + _baseName;
        } else {
          const _nick = sr.current.nicknames?.[_penIK];
          let _circleBase;
          if (_nick) {
            _circleBase = `${_nick}の魔方陣`;
          } else {
            const _fake = sr.current.fakeNames?.[_penIK] ?? it.name;
            _circleBase = _fake.replace(/ペン$/, '魔方陣'); // "朱色のペン"→"朱色の魔方陣"
          }
          _pName = _bcPrefix ? `${_bcPrefix}${_circleBase}` : _circleBase;
        }
        dg.pentacles.push({ x: p.x, y: p.y, kind: it.effect, name: _pName, blessed: _isBlessed, cursed: _isCursed });
        it.charges = (it.charges || 1) - 1;
        if (it.charges <= 0) {
          ml.push(`足元に${_pName}を描いた！ペンのインクが尽きた。(充填の大箱で補充できる)`);
        } else {
          ml.push(`足元に${_pName}を描いた！(残り${it.charges}回)`);
        }
        /* 呪われた聖域の魔方陣：描いた直後に隣のマスに弾き出される */
        if (it.effect === "sanctuary" && _isCursed) {
          const _dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
          let _pushed = false;
          for (const [_pdx, _pdy] of _dirs) {
            const _px = p.x + _pdx, _py = p.y + _pdy;
            if (_px >= 0 && _px < MW && _py >= 0 && _py < MH && dg.map[_py][_px] !== T.WALL && dg.map[_py][_px] !== T.BWALL &&
                !dg.monsters.some(m => m.x === _px && m.y === _py) &&
                !dg.pentacles.some(pc => pc.kind === "sanctuary" && pc.cursed && pc.x === _px && pc.y === _py)) {
              p.x = _px; p.y = _py;
              ml.push("呪われた魔方陣に弾き出された！");
              _pushed = true;
              break;
            }
          }
          if (!_pushed) ml.push("逃げ場がない！");
        }
        /* 雷の魔方陣：描いたそのターンにも即座に発動 */
        if (it.effect === "thunder_trap") {
          if (_isCursed) {
            const _drawHeal = Math.min(25, p.maxHp - p.hp);
            if (_drawHeal > 0) { p.hp += _drawHeal; ml.push(`描いた瞬間、癒しの力が湧き上がった！HPが${_drawHeal}回復！`); }
          } else {
            const _tdrawDmg = _isBlessed ? 50 : 25;
            if (p.hp > 0) {
              p.deathCause = `${_pName}の雷撃により`;
              p.hp -= _tdrawDmg;
              ml.push(`描いた瞬間、雷が落ちた！${_tdrawDmg}ダメージ！`);
            }
            for (const _tm of [...dg.monsters]) {
              if (_tm.x === p.x && _tm.y === p.y) {
                _tm.hp -= _tdrawDmg;
                ml.push(`${_pName}が${_tm.name}を打った！${_tdrawDmg}ダメージ！`);
                if (_tm.hp <= 0) {
                  ml.push(`${_tm.name}を倒した！(+${_tm.exp}exp)`);
                  p.exp += _tm.exp;
                  monsterDrop(_tm, dg, ml, p);
                  dg.monsters = dg.monsters.filter((mn) => mn !== _tm);
                  lu(p, ml);
                }
              }
            }
          }
        }
      }
    } else if (it.type === "weapon") {
      if (p.weapon === it) {
        if (it.cursed) { ml.push(`${it.name}は呪われていて外せない！泉か強化の巻物で呪いを解こう。`); }
        else { p.weapon = null; ml.push(`${it.name}を外した。`); }
      } else {
        p.weapon = it;
        it.bcKnown = true;
        ml.push(`${it.name}を装備した。${it.cursed ? "【呪】呪われている！外せなくなった！" : ""}`);
      }
    } else if (it.type === "armor") {
      if (p.armor === it) {
        if (it.cursed) { ml.push(`${it.name}は呪われていて外せない！泉か強化の巻物で呪いを解こう。`); }
        else { p.armor = null; ml.push(`${it.name}を外した。`); }
      } else {
        p.armor = it;
        it.bcKnown = true;
        ml.push(`${it.name}を装備した。${it.cursed ? "【呪】呪われている！外せなくなった！" : ""}`);
      }
    } else if (it.type === "arrow") {
      if (p.arrow === it) { p.arrow = null; ml.push(`${it.name}を外した。`); }
      else { p.arrow = it; ml.push(`${it.name}(${it.count}本)を装備した。`); }
    } else if (it.type === "pot") {
      if (it.contents.length >= it.capacity) {
        ml.push(`${itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}はいっぱいだ。`);
      } else {
        setPutMode({ potIdx: idx });
        setPutMenuSel(0);
        setPutPage(0);
        setShowInv(false);
        setSelIdx(null);
        setShowDesc(null);
        setMsgs((prev) => [
          ...prev.slice(-80),
          `${itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}に入れるアイテムを選んでください...(${it.contents.length}/${it.capacity})`,
        ]);
        sr.current = { ...sr.current };
        setGs({ ...sr.current });
        return;
      }
    }
    if (_wasUnknown && _revFake && _revFake !== _revReal) {
      setMsgs(prev => [...prev.slice(-80), `${_revFake}は${_revReal}だった！`]);
      if (ml.length) setRevealMode({ pendingMsgs: [...ml] });
    } else {
      if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
    }
    endTurn(sr.current, p, ml);
    computeFOV(dg.map, p.x, p.y, (p.darknessTurns || 0) > 0 ? 1 : 6, dg.visible, dg.explored);
    setSelIdx(null);
    setShowDesc(null);
    setShowInv(false);
    sr.current = { ...sr.current };
    setGs({ ...sr.current });
  }, [lu, endTurn]);
  const doDropItem = useCallback((idx) => {
    if (!sr.current) return;
    const { player: p, dungeon: dg } = sr.current;
    const it = p.inventory[idx];
    if (!it) return;
    if (p.weapon === it) p.weapon = null;
    if (p.armor  === it) p.armor  = null;
    if (p.arrow  === it) p.arrow  = null;
    p.inventory.splice(idx, 1);
    const ml = [],
      ft = new Set();
    const prevDebt = dg.shop?.unpaidTotal ?? 0;
    /* 足元に泉があればアイテムを泉に落とす */
    const _dropSpr = dg.springs?.find((s) => s.x === p.x && s.y === p.y);
    if (_dropSpr) {
      soakItemIntoSpring(_dropSpr, it, ml, dg);
    } else {
      const _dropPfBag = [];
      setPitfallBag(_dropPfBag);
      const _dr = placeItemAt(dg, p.x, p.y, it, ml, ft, 0, p);
      clearPitfallBag();
      if (!sr.current.floors) sr.current.floors = {};
      processPitfallBag(_dropPfBag, sr.current.floors, p.depth);
      if (_dr === "pitfall_player") {
        const _nd = chgFloor(p, 1, true);
        if (_nd) {
          sr.current.dungeon = _nd;
          ml.push(`地下${p.depth}階に落ちた！`);
        }
      }
    }
    if (
      it.shopPrice &&
      dg.shop &&
      dg.shop.unpaidTotal < prevDebt &&
      dg.shop.unpaidTotal > 0
    )
      ml.push(`${itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}を戻した。（残り${dg.shop.unpaidTotal}G）`);
    if (ml.length === 0) ml.push(`${itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}${_itemPickupSuffix(it, sr.current?.ident)}を置いた。`);
    endTurn(sr.current, p, ml);
    setMsgs((prev) => [...prev.slice(-80), ...ml]);
    setSelIdx(null);
    setShowDesc(null);
    if (!dropModeRef.current) {
      setShowInv(false);
    }
    sr.current = { ...sr.current };
    setGs({ ...sr.current });
  }, [endTurn]);
  const doThrow = useCallback((idx) => {
    setShowInv(false);
    setSelIdx(null);
    setShowDesc(null);
    setThrowMode({ idx, mode: "throw" });
    setMsgs((prev) => [...prev.slice(-80), "投げる方向を選んでください..."]);
  }, []);
  const doShoot = useCallback((idx) => {
    setShowInv(false);
    setSelIdx(null);
    setShowDesc(null);
    setThrowMode({ idx, mode: "shoot" });
    setMsgs((prev) => [...prev.slice(-80), "矢を射る方向を選んでください..."]);
  }, []);
  const doWaveWand = useCallback((idx) => {
    if (!sr.current) return;
    const it = sr.current.player.inventory[idx];
    if (!it || it.type !== "wand") return;
    if (it.charges <= 0) {
      setMsgs((prev) => [...prev.slice(-80), "杖の力が残っていない..."]);
      return;
    }
    setShowInv(false);
    setSelIdx(null);
    setShowDesc(null);
    setThrowMode({ idx, mode: "wand_wave" });
    setMsgs((prev) => [
      ...prev.slice(-80),
      `${itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}を振る方向を選んでください...`,
    ]);
  }, []);
  const doBreakWand = useCallback(
    (idx) => {
      if (!sr.current) return;
      const { player: p, dungeon: dg } = sr.current;
      const it = p.inventory[idx];
      if (!it || it.type !== "wand") return;
      p.inventory.splice(idx, 1);
      const ml = [];
      ml.push(`${dnameRef(it)}を壊した！`);
      if (inMagicSealRoom(p.x, p.y, dg) || (p.sealedTurns || 0) > 0) {
        ml.push("魔法が封印されている！効果は発動しなかった。");
      } else {
        const times = Math.max(1, Math.ceil(it.charges / 2));
        const _bwBlMult = it.blessed ? 1.5 : it.cursed ? 0.5 : 1;
        for (let t = 0; t < times; t++) breakWandAoE(p, dg, it.effect, ml, lu, _bwBlMult);
      }
      endTurn(sr.current, p, ml);
      if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
      setSelIdx(null);
      setShowDesc(null);
      setShowInv(false);
      sr.current = { ...sr.current };
      setGs({ ...sr.current });
    },
    [lu, endTurn],
  );
  const doUseMarker = useCallback((idx) => {
    if (!sr.current) return;
    const { player: p } = sr.current;
    const it = p.inventory[idx];
    if (!it || it.type !== "marker") return;
    if (it.charges <= 0) {
      setMsgs((prev) => [...prev.slice(-80), "マーカーのインクが切れている..."]);
      return;
    }
    const blanks = p.inventory.filter((b) =>
      (b.type === "scroll" && b.effect === "blank") ||
      (b.type === "spellbook" && !b.spell)
    );
    if (blanks.length === 0) {
      setMsgs((prev) => [...prev.slice(-80), "白紙の巻物も白紙の魔法書もない。"]);
      return;
    }
    setShowInv(false);
    setSelIdx(null);
    setShowDesc(null);
    setMarkerMode({ markerIdx: idx, step: "select_blank", blankIdx: null, blankKind: null });
    setMarkerMenuSel(0);
    setMsgs((prev) => [...prev.slice(-80), "書き込む白紙アイテムを選んでください..."]);
    sr.current = { ...sr.current };
    setGs({ ...sr.current });
  }, []);
  const doReadSpellbook = useCallback((idx) => {
    if (!sr.current) return;
    const { player: p, dungeon: dg } = sr.current;
    const it = p.inventory[idx];
    if (!it || it.type !== "spellbook") return;
    const ml = [];
    if (!p.spells) p.spells = [];
    /* 未識別チェック（dnameRef は render後に定義されているが closure で参照可能） */
    const _sbIK = getIdentKey(it); // "b:fire_bolt" etc
    const _wasUnknown = !!(_sbIK && !sr.current.ident.has(_sbIK));
    const _revFake = _wasUnknown ? itemDisplayName(it, sr.current.fakeNames, sr.current.ident, sr.current.nicknames) : null;
    const _revReal = _wasUnknown ? it.name : null;
    /* 識別 */
    if (_sbIK && _wasUnknown) sr.current.ident.add(_sbIK);
    if (inMagicSealRoom(p.x, p.y, dg) || (p.sealedTurns || 0) > 0) {
      p.inventory.splice(idx, 1);
      ml.push(`${it.name}を読んだが、魔法が封印されている！魔法書は消えた。`);
    } else if (it.cursed) {
      // 呪い：この魔法以外のランダムな魔法を1つ選んで習得 or レベルアップ
      if (!p.spellLevels) p.spellLevels = {};
      const _otherSpells = SPELLS.filter((s) => s.id !== it.spell);
      const _candidates = _otherSpells.filter((s) => {
        if (!p.spells.includes(s.id)) return true;          // 未習得 → 習得できる
        return (p.spellLevels[s.id] || 1) < 6;              // 習得済みでも最大未満ならLvUP
      });
      p.inventory.splice(idx, 1);
      if (_candidates.length === 0) {
        ml.push(`${it.name}を読んだが、呪いで魔力が乱れ何も起きなかった。【呪】`);
      } else {
        const _tgt = _candidates[rng(0, _candidates.length - 1)];
        if (p.spells.includes(_tgt.id)) {
          const _curLv = p.spellLevels[_tgt.id] || 1;
          const _newLv = _curLv + 1;
          p.spellLevels[_tgt.id] = _newLv;
          ml.push(`${it.name}を読んだ。呪いで魔力が乱れ「${_tgt.name}」がレベルアップした！(Lv.${_newLv})【呪】`);
        } else {
          p.spells = [...p.spells, _tgt.id];
          p.spellLevels[_tgt.id] = 1;
          ml.push(`${it.name}を読んだ。呪いで魔力が乱れ「${_tgt.name}」を習得した！(Lv.1)【呪】`);
        }
      }
    } else if (p.spells.includes(it.spell)) {
      // 既習得 → レベルアップ（祝福なら+2）
      if (!p.spellLevels) p.spellLevels = {};
      const _curLv = p.spellLevels[it.spell] || 1;
      const spellDef = SPELLS.find((s) => s.id === it.spell);
      const _spName = spellDef ? spellDef.name : it.spell;
      if (_curLv >= 6) {
        ml.push(`「${_spName}」はすでに最大レベルだ。(Lv.${_curLv} MP:${Math.max(1, 20 - (_curLv - 1) * 3)})`);
        // 最大レベルの場合は魔法書を消費しない
      } else {
        const _gain = it.blessed ? 2 : 1;
        const _newLv = Math.min(6, _curLv + _gain);
        p.spellLevels[it.spell] = _newLv;
        p.inventory.splice(idx, 1);
        const _newCost = Math.max(1, 20 - (_newLv - 1) * 3);
        ml.push(`${it.name}を読んだ。「${_spName}」がレベルアップ！(Lv.${_newLv} 消費MP:${_newCost})${it.blessed ? "【祝】" : ""}`);
      }
    } else {
      // 未習得 → 習得（祝福ならLv.2から）
      if (!p.spellLevels) p.spellLevels = {};
      const _startLv = it.blessed ? 2 : 1;
      p.spellLevels[it.spell] = _startLv;
      p.spells = [...p.spells, it.spell];
      p.inventory.splice(idx, 1);
      const spellDef = SPELLS.find((s) => s.id === it.spell);
      const _initCost = Math.max(1, 20 - (_startLv - 1) * 3);
      ml.push(`${it.name}を読んだ。「${spellDef ? spellDef.name : it.spell}」を習得した！(Lv.${_startLv} 消費MP:${_initCost})${it.blessed ? "【祝】" : ""}`);
    }
    setShowInv(false); setSelIdx(null); setShowDesc(null);
    endTurn(sr.current, p, ml);
    /* リビールメッセージ */
    if (_wasUnknown && _revFake && _revFake !== _revReal) {
      setMsgs(prev => [...prev.slice(-80), `${_revFake}は${_revReal}だった！`]);
      if (ml.length) setRevealMode({ pendingMsgs: [...ml] });
    } else {
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
    }
    sr.current = { ...sr.current }; setGs({ ...sr.current });
  }, [endTurn]);
  const doMarkerWrite = useCallback(
    (blankIdx, template) => {
      if (!sr.current || !markerMode) return;
      const { player: p } = sr.current;
      const marker = p.inventory[markerMode.markerIdx];
      const blank = p.inventory[blankIdx];
      if (!marker || marker.type !== "marker") { setMarkerMode(null); return; }
      const ml = [];
      if (markerMode.blankKind === "spellbook") {
        if (!blank || blank.type !== "spellbook" || blank.spell) { setMarkerMode(null); return; }
        if (marker.charges < 5) {
          ml.push(`インクが足りない！(必要:5回 現在:${marker.charges}回)`);
          setMarkerMode(null);
          setMsgs((prev) => [...prev.slice(-80), ...ml]);
          return;
        }
        blank.name = template.name;
        blank.spell = template.spell;
        blank.desc = template.desc;
        marker.charges -= 5;
        ml.push(`${template.name}に変化した！[${marker.name} 残り${marker.charges}回]`);
      } else {
        if (!blank || blank.effect !== "blank") { setMarkerMode(null); return; }
        blank.name = template.name;
        blank.effect = template.effect;
        blank.desc = template.desc;
        if (marker.blessed) { blank.blessed = true; blank.cursed = false; }
        else if (marker.cursed) { blank.cursed = true; blank.blessed = false; }
        marker.charges--;
        const _mBcLabel = marker.blessed ? "【祝】" : marker.cursed ? "【呪】" : "";
        ml.push(`${template.name}${_mBcLabel}に変化した！[${marker.name} 残り${marker.charges}回]`);
      }
      if (marker.charges <= 0) {
        p.inventory.splice(markerMode.markerIdx, 1);
        ml.push(`${marker.name}のインクが切れた。`);
      }
      setMarkerMode(null);
      endTurn(sr.current, p, ml);
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
      sr.current = { ...sr.current };
      setGs({ ...sr.current });
    },
    [markerMode, endTurn],
  );
  doMarkerWriteRef.current = doMarkerWrite;
  const doPutItem = useCallback(
    (itemIdx) => {
      if (!sr.current || !putMode) return;
      const { player: p, dungeon: dg } = sr.current;
      const pot = p.inventory[putMode.potIdx];
      if (!pot || pot.type !== "pot") {
        setPutMode(null);
        return;
      }
      const it = p.inventory[itemIdx];
      if (!it) return;
      if (it.type === "pot") {
        setMsgs((prev) => [...prev.slice(-80), "壺の中に壺は入れられない。"]);
        return;
      }
      if (pot.contents.length >= pot.capacity) {
        setMsgs((prev) => [...prev.slice(-80), `${itemDisplayName(pot, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}はいっぱいだ。`]);
        setPutMode(null);
        return;
      }
      if (p.weapon === it) p.weapon = null;
      if (p.armor  === it) p.armor  = null;
      if (p.arrow  === it) p.arrow  = null;
      p.inventory.splice(itemIdx, 1);
      if (itemIdx < putMode.potIdx) putMode.potIdx--;
      const ml = [];
      if (pot.potEffect === "boil") {
        if (it.type === "potion") {
          ml.push(`${dnameRef(it)}を加熱の壺に投じた！薬効が部屋中に広がった！`);
          const _boilRoom = findRoom(dg.rooms, p.x, p.y);
          if (_boilRoom) {
            applyPotionEffect(it.effect, it.value || 0, "player", p, dg, p, ml, lu, it.blessed || false, it.cursed || false);
            const _boilMons = dg.monsters.filter(
              (m) => m.x >= _boilRoom.x && m.x < _boilRoom.x + _boilRoom.w &&
                     m.y >= _boilRoom.y && m.y < _boilRoom.y + _boilRoom.h,
            );
            for (const _bm of _boilMons) {
              applyPotionEffect(it.effect, it.value || 0, "monster", _bm, dg, p, ml, lu, it.blessed || false, it.cursed || false);
            }
            const _boilBurnSet = [];
            for (const _bi of dg.items.filter(
              (fi) => fi.x >= _boilRoom.x && fi.x < _boilRoom.x + _boilRoom.w &&
                      fi.y >= _boilRoom.y && fi.y < _boilRoom.y + _boilRoom.h,
            )) {
              const _br = applyPotionToItem(it.effect, it.value || 0, _bi, dg, ml);
              if (_br === "burn") _boilBurnSet.push(_bi);
            }
            if (_boilBurnSet.length > 0) dg.items = dg.items.filter((fi) => !_boilBurnSet.includes(fi));
          } else {
            ml.push("（回廊では薬効が拡散しにくい…自分にだけ効いた）");
            applyPotionEffect(it.effect, it.value || 0, "player", p, dg, p, ml, lu, it.blessed || false, it.cursed || false);
          }
          pot.capacity = Math.max(0, pot.capacity - 1);
        } else if (it.type === "scroll" || it.type === "spellbook") {
          ml.push(`${dnameRef(it)}は加熱の壺の熱で燃えてなくなった！`);
          pot.capacity = Math.max(0, pot.capacity - 1);
          /* 壺には残さない */
        } else if (it.type === "food" && !it.cooked) {
          it.value = it.value * 2;
          it.cooked = true;
          it.name = "焼いた" + it.name;
          ml.push(`加熱の壺で${it.name}になった！`);
          pot.contents.push(it);
        } else {
          ml.push(`${dnameRef(it)}を加熱の壺に入れた。`);
          pot.contents.push(it);
        }
      } else {
        applyPotEffect(pot, it, ml, dnameRef);
        pot.contents.push(it);
      }
      if (pot.contents.length >= pot.capacity)
        ml.push(`${itemDisplayName(pot, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}はいっぱいになった。`);
      endTurn(sr.current, p, ml);
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
      if (pot.contents.length < pot.capacity) {
        setPutMode({ potIdx: p.inventory.indexOf(pot) });
        setPutMenuSel(0);
        setPutPage(0);
        sr.current = { ...sr.current };
        setGs({ ...sr.current });
      } else {
        setPutMode(null);
        sr.current = { ...sr.current };
        setGs({ ...sr.current });
      }
    },
    [putMode, endTurn],
  );
  const doBreakPot = useCallback(
    (idx) => {
      if (!sr.current) return;
      const { player: p, dungeon: dg } = sr.current;
      const it = p.inventory[idx];
      if (!it || it.type !== "pot") return;
      p.inventory.splice(idx, 1);
      const ml = [];
      ml.push(`${dnameRef(it)}を割った！`);
      scatterPotContents(it, dg, p.x, p.y, p, ml, lu, dnameRef);
      endTurn(sr.current, p, ml);
      if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
      setSelIdx(null);
      setShowDesc(null);
      setShowInv(false);
      sr.current = { ...sr.current };
      setGs({ ...sr.current });
    },
    [lu, endTurn],
  );
  invActRef.current = {
    use: doUseItem,
    drop: doDropItem,
    throw: doThrow,
    shoot: doShoot,
    wave: doWaveWand,
    breakWand: doBreakWand,
    breakPot: doBreakPot,
    put: doPutItem,
    useMarker: doUseMarker,
    readSpellbook: doReadSpellbook,
  };
  const execDirection = useCallback(
    (dx, dy) => {
      if (!throwMode || !sr.current) return;
      const { idx, mode } = throwMode;
      const { player: p, dungeon: dg } = sr.current;
      const ml = [];
      /* 遠投判定（投げ・射撃にのみ影響） */
      const _fcMode = (mode === "shoot_equipped" || mode === "shoot" || mode === "throw" || !mode)
        ? getFarcastMode(p.x, p.y, dg) : false;
      const _isFarcast = _fcMode === "farcast";
      const _isCursedFc = _fcMode === "cursed";
      const _maxRange = _isCursedFc ? 1 : _isFarcast ? 50 : 10;
      if (mode === "shoot_equipped") {
        if (!p.arrow || p.arrow.count <= 0) {
          ml.push("矢がない！");
          setThrowMode(null);
          if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
          return;
        }
        const _arItem = p.arrow;
        const _arIsPoison = !!_arItem.poison;
        const _arIsPierce = !!_arItem.pierce;
        const _arName = _arItem.name || "矢";
        const _arPierceMode = _arIsPierce || _isFarcast;
        const _arMaxRange = _isCursedFc ? 1 : _arPierceMode ? 50 : 10;
        const _arDropItem = () => _arIsPierce ? makePiercingArrow(1) : _arIsPoison ? makePoisonArrow(1) : makeArrow(1);
        p.arrow.count--;
        const dmg = (_arItem.atk || 4) + rng(1, 4);
        let lx = p.x,
          ly = p.y,
          hit = false;
        for (let d = 1; d <= _arMaxRange; d++) {
          const tx = p.x + dx * d,
            ty = p.y + dy * d;
          if (
            tx < 0 ||
            tx >= MW ||
            ty < 0 ||
            ty >= MH ||
            dg.map[ty][tx] === T.WALL ||
            dg.map[ty][tx] === T.BWALL
          )
            break;
          const m = dg.monsters.find((m2) => m2.x === tx && m2.y === ty);
          if (m) {
            m.hp -= dmg;
            if (_arIsPoison) m.atk = Math.max(1, Math.floor((m.atk || 1) / 2));
            ml.push(`${_arName}が${m.name}に命中！${dmg}ダメージ！${_arIsPoison ? "攻撃力が半減した！" : ""}`);
            if (m.hp <= 0) {
              ml.push(`${m.name}を倒した！(+${m.exp}exp)`);
              p.exp += m.exp;
              monsterDrop(m, dg, ml, p);
              dg.monsters = dg.monsters.filter((m2) => m2 !== m);
              lu(p, ml);
            }
            if (!_arPierceMode) { hit = true; break; }
            /* 貫通：飛び続ける */
          }
          if (!_arPierceMode) {
            const bb = dg.bigboxes?.find((b) => b.x === tx && b.y === ty);
            if (bb) {
              ml.push(`${_arName}を射った。`);
              bigboxAddItem(bb, _arDropItem(), dg, ml);
              hit = true;
              break;
            }
          }
          lx = tx;
          ly = ty;
        }
        if (_arPierceMode || _isCursedFc) {
          ml.push(`${_arName}を射った。矢は消滅した。`);
          hit = true;
        }
        if (!hit) {
          ml.push(`${_arName}を射った。`);
          const ft = new Set();
          const _arPfBag = [];
          setPitfallBag(_arPfBag);
          placeItemAt(dg, lx, ly, _arDropItem(), ml, ft);
          clearPitfallBag();
          if (!sr.current.floors) sr.current.floors = {};
          processPitfallBag(_arPfBag, sr.current.floors, p.depth);
        }
        if (p.arrow.count <= 0) {
          const _ex = p.arrow;
          p.arrow = null;
          p.inventory = p.inventory.filter(i => i !== _ex);
          ml.push(`${_arName}を撃ち尽くした。`);
        }
      } else if (mode === "shoot") {
        const it = p.inventory[idx];
        if (!it) {
          setThrowMode(null);
          return;
        }
        shootArrow(p, dg, idx, dx, dy, ml, lu, bigboxAddItem);
        if (p.arrow && !p.inventory.includes(p.arrow)) p.arrow = null;
      } else if (mode === "wand_wave") {
        const it = p.inventory[idx];
        if (!it || it.type !== "wand") {
          setThrowMode(null);
          return;
        }
        const _wandBm = getBlessMultiplier(it);
        it.charges--;
        if (inMagicSealRoom(p.x, p.y, dg) || (p.sealedTurns || 0) > 0) {
          ml.push(`${dnameRef(it)}を振ったが、魔法が封印されている！[残${it.charges}回]`);
        } else {
          ml.push(`${dnameRef(it)}を振った！[残${it.charges}回]${it.blessed ? "（祝福）" : it.cursed ? "（呪い）" : ""}`);
          const _wandItemDName = (gi) => itemDisplayName(gi, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
          fireWandBolt(p, dg, it.effect, dx, dy, ml, lu, bigboxAddItem, _wandBm, _wandItemDName);
        }
        if (it.charges <= 0) {
          ml.push(`${dnameRef(it)}は力を失った...`);
          p.inventory.splice(idx, 1);
        }
      } else if (mode === "cast_spell") {
        const spellDef = SPELLS.find((s) => s.id === idx);
        if (!spellDef) { setThrowMode(null); return; }
        const _csLv = (p.spellLevels?.[spellDef.id] || 1);
        const _csCost = Math.max(1, 20 - (_csLv - 1) * 3);
        if (inMagicSealRoom(p.x, p.y, dg) || (p.sealedTurns || 0) > 0) {
          ml.push(`魔法が封印されている！MPは消費しない。`);
        } else if ((p.mp || 0) < _csCost) {
          ml.push(`MPが足りない！(必要:${_csCost} 現在:${p.mp || 0})`);
        } else {
          p.mp = (p.mp || 0) - _csCost;
          ml.push(`${spellDef.name}を唱えた！[MP -${_csCost}]`);
          castSpellBolt(p, dg, spellDef, dx, dy, ml, lu);
        }
      } else {
        const it = p.inventory[idx];
        if (!it) {
          setThrowMode(null);
          return;
        }
        if (p.weapon === it) p.weapon = null;
        if (p.armor  === it) p.armor  = null;
        if (p.arrow  === it) p.arrow  = null;
        p.inventory.splice(idx, 1);
        if (it.type === "potion") {
          let lx = p.x, ly = p.y, sprHit = null;
          const _potHits = []; /* 遠投時：軌道上のモンスターを全て記録 */
          for (let d = 1; d <= _maxRange; d++) {
            const tx = p.x + dx * d, ty = p.y + dy * d;
            if (tx < 0 || tx >= MW || ty < 0 || ty >= MH || dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) break;
            const m = dg.monsters.find((m2) => m2.x === tx && m2.y === ty);
            if (m) {
              if (_isFarcast) {
                /* 遠投：splash せず個別に薬効果を適用、貫通 */
                _potHits.push(m);
              } else {
                lx = tx; ly = ty; break;
              }
            }
            if (!_isFarcast) {
              const spr = dg.springs?.find((s) => s.x === tx && s.y === ty);
              if (spr) { lx = tx; ly = ty; sprHit = spr; break; }
              const bb3 = dg.bigboxes?.find((b) => b.x === tx && b.y === ty);
              if (bb3) { lx = tx; ly = ty; sprHit = bb3; break; }
            }
            lx = tx; ly = ty;
          }
          ml.push(`${dnameRef(it)}を投げた！`);
          if (_isFarcast) {
            /* 遠投：軌道上の全モンスターに個別に効果 */
            if (_potHits.length > 0) {
              for (const _pm of _potHits) {
                applyPotionEffect(it.effect, it.value || 0, "monster", _pm, dg, p, ml, lu, it.blessed || false, it.cursed || false);
                if (_pm.hp <= 0) {
                  ml.push(`${_pm.name}を倒した！(+${_pm.exp}exp)`);
                  p.exp += _pm.exp;
                  monsterDrop(_pm, dg, ml, p);
                  dg.monsters = dg.monsters.filter((m2) => m2 !== _pm);
                  lu(p, ml);
                }
              }
            }
            ml.push(`${dnameRef(it)}は消滅した。`);
          } else if (_isCursedFc) {
            /* 呪い遠投：1マスで落ちてsplash */
            if (it.effect === "water") applyWaterSplash(dg, lx, ly, it.blessed || false, it.cursed || false, ml);
            else splashPotion(dg, lx, ly, it.effect, it.value || 0, p, ml, lu, it.blessed || false, it.cursed || false);
          } else if (sprHit?.kind) {
            bigboxAddItem(sprHit, it, dg, ml);
          } else if (sprHit && !sprHit.kind) {
            soakItemIntoSpring(sprHit, it, ml, dg);
          } else if (!sprHit) {
            if (it.effect === "water") applyWaterSplash(dg, lx, ly, it.blessed || false, it.cursed || false, ml);
            else splashPotion(dg, lx, ly, it.effect, it.value || 0, p, ml, lu, it.blessed || false, it.cursed || false);
          }
        } else if (it.type === "pot") {
          let lx = p.x, ly = p.y, sprHit = null;
          for (let d = 1; d <= _maxRange; d++) {
            const tx = p.x + dx * d, ty = p.y + dy * d;
            if (tx < 0 || tx >= MW || ty < 0 || ty >= MH || dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) break;
            const m = dg.monsters.find((m2) => m2.x === tx && m2.y === ty);
            if (m) {
              const td = 3 + rng(0, 3);
              m.hp -= td;
              ml.push(`${dnameRef(it)}が${m.name}に命中！${td}ダメージ！`);
              if (m.hp <= 0) {
                ml.push(`${m.name}を倒した！(+${m.exp}exp)`);
                p.exp += m.exp;
                monsterDrop(m, dg, ml, p);
                dg.monsters = dg.monsters.filter((m2) => m2 !== m);
                lu(p, ml);
              }
              if (!_isFarcast) { lx = tx; ly = ty; break; }
            }
            if (!_isFarcast) {
              const spr = dg.springs?.find((s) => s.x === tx && s.y === ty);
              if (spr) { lx = tx; ly = ty; sprHit = spr; break; }
              const bb4 = dg.bigboxes?.find((b) => b.x === tx && b.y === ty);
              if (bb4) { lx = tx; ly = ty; sprHit = bb4; break; }
            }
            lx = tx; ly = ty;
          }
          ml.push(`${dnameRef(it)}を投げた！`);
          if (_isFarcast) {
            /* 遠投：壺は消滅（中身もろとも） */
            ml.push(`${dnameRef(it)}は消滅した。`);
          } else if (sprHit?.kind) {
            bigboxAddItem(sprHit, it, dg, ml);
          } else if (sprHit && !sprHit.kind) {
            soakItemIntoSpring(sprHit, it, ml, dg);
          } else {
            scatterPotContents(it, dg, lx, ly, p, ml, lu, dnameRef);
          }
        } else {
          const td =
            (it.type === "weapon"
              ? it.atk || 3
              : it.type === "arrow"
                ? it.atk * Math.min(it.count, 5) + it.count
                : 3) + rng(0, 3);
          let lx = p.x, ly = p.y, hit = false, sprHit = null;
          for (let d = 1; d <= _maxRange; d++) {
            const tx = p.x + dx * d, ty = p.y + dy * d;
            if (tx < 0 || tx >= MW || ty < 0 || ty >= MH || dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) break;
            const m = dg.monsters.find((m2) => m2.x === tx && m2.y === ty);
            if (m) {
              m.hp -= td;
              const lb = it.type === "arrow" ? `矢の束(${it.count}本)` : it.name;
              ml.push(`${lb}が${m.name}に命中！${td}ダメージ！`);
              if (m.hp <= 0) {
                ml.push(`${m.name}を倒した！(+${m.exp}exp)`);
                p.exp += m.exp;
                monsterDrop(m, dg, ml, p);
                dg.monsters = dg.monsters.filter((m2) => m2 !== m);
                lu(p, ml);
              }
              if (!_isFarcast) { lx = tx; ly = ty; hit = true; break; }
            }
            if (!_isFarcast) {
              const spr = dg.springs?.find((s) => s.x === tx && s.y === ty);
              if (spr) { lx = tx; ly = ty; sprHit = spr; break; }
              const bb5 = dg.bigboxes?.find((b) => b.x === tx && b.y === ty);
              if (bb5) { lx = tx; ly = ty; sprHit = bb5; break; }
            }
            lx = tx; ly = ty;
          }
          if (_isFarcast) {
            const lb = it.type === "arrow" ? `矢の束(${it.count}本)` : it.name;
            ml.push(`${lb}を投げた。${lb}は消滅した。`);
          } else if (!hit) {
            const lb = it.type === "arrow" ? `矢の束(${it.count}本)` : it.name;
            ml.push(`${lb}を投げた。`);
            if (sprHit?.kind) {
              bigboxAddItem(sprHit, it, dg, ml);
            } else if (sprHit && !sprHit.kind) {
              soakItemIntoSpring(sprHit, it, ml, dg);
            } else if (it.type === "bottle") {
              ml.push(`${it.name}は割れてしまった！`);
            } else {
              const ft = new Set();
              const _thPfBag = [];
              setPitfallBag(_thPfBag);
              placeItemAt(dg, lx, ly, it, ml, ft);
              clearPitfallBag();
              if (!sr.current.floors) sr.current.floors = {};
              processPitfallBag(_thPfBag, sr.current.floors, p.depth);
            }
          }
        }
      }
      endTurn(sr.current, p, ml);
      if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
      setThrowMode(null);
      sr.current = { ...sr.current };
      setGs({ ...sr.current });
    },
    [throwMode, lu, endTurn],
  );
  execRef.current = execDirection;
  if (!gs) return null;
  const { player: p } = gs;
  const hpP = (p.hp / p.maxHp) * 100,
    hunP = (p.hunger / p.maxHunger) * 100,
    expP = (p.exp / p.nextExp) * 100;
  const hpC = hpP > 50 ? "#0c0" : hpP > 25 ? "#cc0" : "#f22";
  const tmI =
    throwMode &&
    (throwMode.mode === "shoot_equipped"
      ? p.arrow
      : p.inventory[throwMode.idx]);
  const tmL = throwMode
    ? {
        shoot_equipped: "矢を射る方向",
        shoot: "矢を射る方向",
        wand_wave: "杖を振る方向",
        throw: "投げる方向",
      }[throwMode.mode] || "方向選択"
    : "";
  const B = ({ label, onClick, w = 40, h = 40, fs = 15, style: s = {} }) => (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      style={{
        width: w,
        height: h,
        background: "#181828",
        color: "#8f8",
        border: "1px solid #3a3a4a",
        borderRadius: 8,
        fontSize: fs,
        fontWeight: "bold",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        touchAction: "manipulation",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
        ...s,
      }}
    >
      {label}
    </button>
  );
  const AB = ({ label, sub, onClick, color = "#8f8" }) => (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      style={{
        flex: 1,
        minWidth: 38,
        height: 36,
        background: "#181828",
        color,
        border: "1px solid #3a3a4a",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: "bold",
        cursor: "pointer",
        touchAction: "manipulation",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2px 3px",
      }}
    >
      <span style={{ fontSize: 15 }}>{label}</span>
      {sub && <span style={{ fontSize: 8, opacity: 0.5 }}>{sub}</span>}
    </button>
  );
  const tbs = {
    background: "#2a1a1a",
    border: "1px solid #5a3a3a",
    color: "#f88",
  };
  const dbs = {
    background: "#1a1a2a",
    border: "1px solid #4a3a6a",
    color: "#c8f",
  };
  const DPad = ({ onClick }) => {
    const ds = throwMode ? tbs : dashMode ? dbs : {};
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: 2 }}>
          <B
            label="↖"
            onClick={() => onClick(-1, -1)}
            w={32}
            h={32}
            fs={12}
            style={ds}
          />
          <B label="↑" onClick={() => onClick(0, -1)} style={ds} />
          <B
            label="↗"
            onClick={() => onClick(1, -1)}
            w={32}
            h={32}
            fs={12}
            style={ds}
          />
        </div>
        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          <B
            label="←"
            onClick={() => onClick(-1, 0)}
            style={
              facingMode
                ? { background: "#2a2a0a", border: "1px solid #aa0" }
                : ds
            }
          />
          <B
            label={facingMode ? "✕" : throwMode ? "✕" : dashMode ? "⇒" : "向"}
            fs={facingMode || throwMode || dashMode ? 15 : 11}
            onClick={() => {
              if (facingMode) {
                setFacingMode(false);
              } else if (throwMode) {
                setThrowMode(null);
                setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
              } else if (dashMode) {
                setDashMode(false);
              } else {
                setFacingMode((f) => !f);
              }
            }}
            style={
              facingMode
                ? {
                    background: "#2a2a0a",
                    border: "1px solid #aa0",
                    color: "#ff4",
                  }
                : throwMode
                  ? {
                      background: "#1a1a1a",
                      border: "1px solid #555",
                      color: "#888",
                    }
                  : dashMode
                    ? {
                        background: "#1a1a2a",
                        border: "1px solid #4a3a6a",
                        color: "#c8f",
                      }
                    : { opacity: 0.7 }
            }
          />
          <B
            label="→"
            onClick={() => onClick(1, 0)}
            style={
              facingMode
                ? { background: "#2a2a0a", border: "1px solid #aa0" }
                : ds
            }
          />
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          <B
            label="↙"
            onClick={() => onClick(-1, 1)}
            w={32}
            h={32}
            fs={12}
            style={ds}
          />
          <B label="↓" onClick={() => onClick(0, 1)} style={ds} />
          <B
            label="↘"
            onClick={() => onClick(1, 1)}
            w={32}
            h={32}
            fs={12}
            style={ds}
          />
        </div>
      </div>
    );
  };
  /* 表示名ヘルパー (gsを参照) */
  const dname = (it) => itemDisplayName(it, gs?.fakeNames, gs?.ident, gs?.nicknames);
  /* callbacks内で sr.current を参照するバージョン */
  const dnameRef = (it) => itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);

  const iLabel = (it) => {
    const _ep = gs?.player;
    const _eq = _ep?.weapon === it ? "【武器】" : _ep?.armor === it ? "【防具】" : _ep?.arrow === it ? "【矢】" : "";
    const _key = getIdentKey(it);
    const _isIdent = !_key || gs?.ident?.has(_key);
    /* 識別対象アイテムはfullIdentまたはbcKnownのみ祝呪表示、それ以外(武器・防具等)は常に表示 */
    const _needFullIdent = !!_key || it.type === 'weapon' || it.type === 'armor';
    const _showBC = _needFullIdent ? (it.fullIdent || it.bcKnown) : true;
    const _bc = _showBC ? (it.blessed ? "【祝】" : it.cursed ? "【呪】" : "") : "";
    let s = (_eq ? _eq : "") + _bc + dname(it);
    if (it.type === "arrow") s += ` (${it.count}本)`;
    else if (it.type === "weapon") {
      if (it.plus) s += (it.plus > 0 ? "+" : "") + it.plus;
      s += ` (攻+${it.atk + (it.plus || 0)})`;
      const _waIds = [
        ...new Set(
          [...(it.abilities || []), ...(it.ability ? [it.ability] : [])].filter(
            Boolean,
          ),
        ),
      ];
      const _waNames = _waIds
        .map((id) => WEAPON_ABILITIES.find((a) => a.id === id)?.name)
        .filter(Boolean);
      if (_waNames.length) s += ` [${_waNames.join("・")}]`;
    } else if (it.type === "armor") {
      if (it.plus) s += (it.plus > 0 ? "+" : "") + it.plus;
      s += ` (防+${it.def + (it.plus || 0)})`;
      const _aaIds = [
        ...new Set(
          [...(it.abilities || []), ...(it.ability ? [it.ability] : [])].filter(
            Boolean,
          ),
        ),
      ];
      const _aaNames = _aaIds
        .map((id) => ARMOR_ABILITIES.find((a) => a.id === id)?.name)
        .filter(Boolean);
      if (_aaNames.length) s += ` [${_aaNames.join("・")}]`;
    } else if (it.type === "potion" && it.effect === "heal" && _isIdent)
      s += ` (HP+${it.value})`;
    else if (it.type === "food") {
      s += `(満+${it.value})`;
      if (!it.cooked) s += " 生";
      if (it.potionEffects?.length) s += " ★";
      s += ")";
    } else if (it.type === "wand")   s += it.fullIdent ? ` [${it.charges}回]` : "";
    else if (it.type === "marker") s += ` [${it.charges}回]`;
    else if (it.type === "pen")    s += it.fullIdent ? ` [${it.charges || 0}回]` : "";
    else if (it.type === "pot")    s += _isIdent ? ` [${it.contents?.length || 0}/${it.capacity}]` : "";
    if (it.shopPrice) s += ` 〔未払:${it.shopPrice}G〕`;
    return s;
  };
  const iBtn = (l, c, fn) => (
    <button
      onClick={fn}
      style={{
        flex: 1,
        minWidth: 50,
        padding: "6px 8px",
        background: c[0],
        color: c[1],
        border: `1px solid ${c[2]}`,
        borderRadius: 5,
        fontSize: 12,
        cursor: "pointer",
        fontWeight: "bold",
        touchAction: "manipulation",
      }}
    >
      {l}
    </button>
  );
  return (
    <div
      ref={ref}
      tabIndex={0}
      onClick={() => ref.current?.focus()}
      style={{
        width: "100%",
        maxWidth: mobile ? "100%" : 1200,
        margin: "0 auto",
        background: "#0c0c14",
        color: "#ccc",
        fontFamily: "'Courier New','MS Gothic',monospace",
        fontSize: mobile ? "11px" : "12px",
        padding: mobile ? "4px" : "8px",
        paddingRight: mobile ? (landscape ? 148 : 4) : 228,
        outline: "none",
        userSelect: "none",
        position: "relative",
        border: mobile ? "none" : "2px solid #2a2a3a",
        borderRadius: mobile ? 0 : 6,
        boxShadow: "0 0 30px rgba(0,60,0,0.12)",
        display: "flex",
        flexDirection: "column",
        minHeight: mobile ? "100dvh" : "auto",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {" "}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1px 8px",
          padding: "3px 2px 4px",
          borderBottom: "1px solid #252530",
          fontSize: mobile ? "10px" : "12px",
          marginBottom: 2,
        }}
      >
        {" "}
        <span>Lv.{p.level}</span>{" "}
        <span>
          B<span style={{ color: "#0ff" }}>{p.depth}</span>F
        </span>{" "}
        <span>
          HP:
          <span style={{ color: hpC }}>
            {p.hp}/{p.maxHp}
          </span>
        </span>{" "}
        <span>
          MP:
          <span style={{ color: (p.mpCooldownTurns || 0) > 0 ? "#888" : "#60c0ff" }}>
            {p.mp || 0}/{p.maxMp || 0}
          </span>
          {(p.mpCooldownTurns || 0) > 0 && (
            <span style={{ color: "#f84", fontSize: "0.8em" }}> 封印:{p.mpCooldownTurns}</span>
          )}
        </span>{" "}
        <span>
          攻:
          {(p.poisonAtkLoss || 0) > 0 ? (
            <span style={{ color: "#fa0" }}>
              {p.atk + (p.weapon?.atk || 0)}/
              <span style={{ color: "#aaa", fontSize: "0.9em" }}>{p.atk + (p.poisonAtkLoss || 0) + (p.weapon?.atk || 0)}</span>
            </span>
          ) : (
            <span style={{ color: "#fa0" }}>{p.atk + (p.weapon?.atk || 0)}</span>
          )}
        </span>{" "}
        <span>
          防:
          <span style={{ color: "#08f" }}>{p.def + (p.armor?.def || 0)}</span>
        </span>{" "}
        <span>
          食:
          <span style={{ color: hunP > 40 ? "#0a0" : "#f80" }}>
            {Math.floor(hunP)}%
          </span>
        </span>{" "}
        <span style={{ color: "#ffd700" }}>${p.gold}</span>{" "}
        {p.arrow && (
          <span style={{ color: "#dda050" }}>矢:{p.arrow.count}</span>
        )}{" "}
        {p.poisoned && (
          <span style={{ color: "#80ff40" }}>☠毒</span>
        )}{" "}
        {p.sleepTurns > 0 && (
          <span style={{ color: "#af0" }}>💤{p.sleepTurns}</span>
        )}{" "}
        {(p.slowTurns || 0) > 0 && (
          <span style={{ color: "#80c0ff" }}>🐢{p.slowTurns}</span>
        )}{" "}
        {(p.hasteTurns || 0) > 0 && (
          <span style={{ color: "#ff4040" }}>⚡{p.hasteTurns}</span>
        )}{" "}
        {(p.confusedTurns || 0) > 0 && (
          <span style={{ color: "#ff9020" }}>🌀{p.confusedTurns}</span>
        )}{" "}
        {(p.darknessTurns || 0) > 0 && (
          <span style={{ color: "#4040a0" }}>🌑{p.darknessTurns}</span>
        )}{" "}
        {(p.statusImmune || 0) > 0 && (
          <span style={{ color: "#40c080" }}>🛡{p.statusImmune}</span>
        )}{" "}
        {(p.sureHitTurns || 0) > 0 && (
          <span style={{ color: "#ffe000" }}>🎯{p.sureHitTurns}</span>
        )}{" "}
        {(p.bewitchedTurns || 0) > 0 && (
          <span style={{ color: "#c040c0" }}>👁{p.bewitchedTurns}</span>
        )}{" "}
        {(p.sealedTurns || 0) > 0 && (
          <span style={{ color: "#8040e0" }}>🔒{p.sealedTurns}</span>
        )}{" "}
      </div>{" "}
      <div
        style={{ display: "flex", gap: 4, padding: "0 2px", marginBottom: 2 }}
      >
        {" "}
        <div
          style={{
            flex: 3,
            height: 3,
            background: "#1a1a24",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${hpP}%`,
              background: hpC,
              transition: "width 0.15s",
            }}
          />
        </div>{" "}
        <div
          style={{
            flex: 1,
            height: 3,
            background: "#1a1a24",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${expP}%`,
              background: "#cc0",
              transition: "width 0.15s",
            }}
          />
        </div>{" "}
      </div>
      <canvas
        ref={canvasRef}
        style={{
          imageRendering: "pixelated",
          display: "block",
          margin: "0 auto",
          borderTop: "1px solid #252530",
          borderBottom: "1px solid #252530",
          maxWidth: "100%",
        }}
      />{" "}
      <div
        ref={msgRef}
        style={{
          height: mobile ? 52 : 52,
          overflowY: "auto",
          borderTop: "1px solid #252530",
          padding: "2px",
          fontSize: mobile ? "9.5px" : "11px",
          color: "#8f8",
          lineHeight: "1.3em",
          cursor: revealMode ? "pointer" : "default",
          WebkitOverflowScrolling: "touch",
        }}
        onClick={revealMode ? () => {
          if (revealMode.pendingMsgs.length) setMsgs(prev => [...prev.slice(-80), ...revealMode.pendingMsgs]);
          setRevealMode(null);
        } : undefined}
      >
        {msgs.slice(-50).map((m, i, a) => (
          <div key={i} style={{ opacity: i === a.length - 1 ? 1 : 0.5 }}>
            {m}
          </div>
        ))}
        {revealMode && (
          <div style={{ color: "#fa8", animation: "blink 1s step-end infinite" }}>
            ▼ {mobile ? "タップで続ける" : "何かキーを押す..."}
          </div>
        )}
      </div>{" "}
      {mobile && (
        <div
          style={{
            borderTop: `1px solid ${throwMode ? "#5a3a3a" : "#252530"}`,
            padding: "4px 2px 6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
          }}
        >
          {" "}
          <DPad
            onClick={(dx, dy) => {
              if (revealMode) {
                if (revealMode.pendingMsgs.length) setMsgs(prev => [...prev.slice(-80), ...revealMode.pendingMsgs]);
                setRevealMode(null);
                return;
              }
              /* === テレポート先選択モード === */
              if (tpSelectMode) {
                setTpSelectMode({ cx: Math.max(0, Math.min(MW - 1, tpSelectMode.cx + dx)), cy: Math.max(0, Math.min(MH - 1, tpSelectMode.cy + dy)) });
                return;
              }
              /* === インベントリ表示中：上下で選択、左右でページ送り === */
              if (showInv) {
                const inv = sr.current?.player?.inventory || [];
                const totalPages = Math.ceil(inv.length / 10) || 1;
                const pageItems = inv.slice(invPage * 10, (invPage + 1) * 10);
                const len = pageItems.length;
                if (dy !== 0 && dx === 0 && len > 0) {
                  setSelIdx((prev) => {
                    if (prev === null) return dy > 0 ? 0 : len - 1;
                    return (prev + dy + len) % len;
                  });
                  setShowDesc(null);
                } else if (dx !== 0 && dy === 0 && totalPages > 1) {
                  setInvPage((p) => (p + dx + totalPages) % totalPages);
                  setSelIdx(null); setInvMenuSel(null); setShowDesc(null);
                }
                return;
              }
              /* === 識別モード：上下で選択、左右でページ送り === */
              if (identifyMode) {
                if (!sr.current) return;
                const _p = sr.current.player;
                const _isBCMode_t = identifyMode.mode === 'bless' || identifyMode.mode === 'curse';
                const _isDupMode_t = identifyMode.mode === 'duplicate';
                const _filt = _p.inventory
                  .map((_it, _i) => ({ it: _it, i: _i }))
                  .filter(({ it, i }) => {
                    if (_isBCMode_t || _isDupMode_t) return it.type !== "gold";
                    if (identifyMode.scrollIdx === i) return false;
                    if (it.type === 'weapon' || it.type === 'armor') {
                      return identifyMode.mode === 'identify' ? (!it.fullIdent && !it.bcKnown) : (it.fullIdent || it.bcKnown);
                    }
                    const _k = getIdentKey(it);
                    if (!_k) return false;
                    if (identifyMode.mode === 'identify') return !sr.current.ident.has(_k) || (!it.fullIdent && !it.bcKnown);
                    return sr.current.ident.has(_k);
                  });
                const _len = _filt.length;
                const _idPg_t = identifyMode.page || 0;
                const _idTotalPg_t = Math.max(1, Math.ceil(_len / 10));
                const _idPgLen_t = Math.min(10, Math.max(0, _len - _idPg_t * 10));
                if (dy !== 0 && dx === 0 && _idPgLen_t > 0) {
                  setIdentifyMode({ ...identifyMode, sel: ((identifyMode.sel || 0) + dy + _idPgLen_t) % _idPgLen_t });
                } else if (dx !== 0 && dy === 0 && _idTotalPg_t > 1) {
                  setIdentifyMode({ ...identifyMode, page: ((_idPg_t + dx) + _idTotalPg_t) % _idTotalPg_t, sel: 0 });
                }
                return;
              }
              /* === 壺に入れるモード：上下で選択、左右でページ送り === */
              if (putMode) {
                if (!sr.current) return;
                const inv4 = sr.current.player.inventory;
                const pItems4 = inv4.map((it, i) => ({ it, i })).filter(({ i }) => i !== putMode.potIdx);
                const _ps4 = 10;
                const _tp4 = Math.max(1, Math.ceil(pItems4.length / _ps4));
                const _plen4 = pItems4.slice(putPage * _ps4, (putPage + 1) * _ps4).length;
                if (dy !== 0 && dx === 0 && _plen4 > 0) {
                  setPutMenuSel((s) => (s + dy + _plen4) % _plen4);
                } else if (dx !== 0 && dy === 0 && _tp4 > 1) {
                  setPutPage((p) => (p + dx + _tp4) % _tp4);
                  setPutMenuSel(0);
                }
                return;
              }
              /* === マーカーモード：上下で選択 === */
              if (markerMode) {
                if (!sr.current) return;
                if (dy !== 0 && dx === 0) {
                  const inv5 = sr.current.player.inventory;
                  let listLen = 0;
                  if (markerMode.step === "select_blank") {
                    listLen = inv5.filter(it => (it.type === "scroll" && it.effect === "blank") || (it.type === "spellbook" && !it.spell)).length;
                  } else if (markerMode.step === "select_type") {
                    listLen = ITEMS.filter(it => it.type === "scroll").length;
                  } else if (markerMode.step === "select_spellbook_type") {
                    listLen = SPELLBOOKS.filter(it => it.spell).length;
                  }
                  if (listLen > 0) setMarkerMenuSel((s) => (s + dy + listLen) % listLen);
                }
                return;
              }
              /* === 大箱モード：上下で選択、左右でページ送り === */
              if (bigboxMode) {
                if (bigboxMode === "menu") {
                  if (dy !== 0 && dx === 0) setBigboxMenuSel((p) => (p + dy + 2) % 2);
                } else if (bigboxMode === "put") {
                  const inv2 = sr.current?.player?.inventory || [];
                  const _ps = 10;
                  const _tp = Math.max(1, Math.ceil(inv2.length / _ps));
                  const _pil = inv2.slice(bigboxPage * _ps, (bigboxPage + 1) * _ps).length;
                  if (dy !== 0 && dx === 0 && _pil > 0) {
                    setBigboxMenuSel((p) => (p + dy + _pil) % _pil);
                  } else if (dx !== 0 && dy === 0 && _tp > 1) {
                    setBigboxPage((p) => (p + dx + _tp) % _tp);
                    setBigboxMenuSel(0);
                  }
                }
                return;
              }
              /* === 泉モード：上下で選択 === */
              if (springMode) {
                if (dy !== 0 && dx === 0) {
                  if (springMode === "menu") {
                    setSpringMenuSel((p) => (p + dy + 3) % 3);
                  } else if (springMode === "soak") {
                    const inv = sr.current?.player?.inventory || [];
                    if (inv.length > 0) setSpringMenuSel((s) => (s + dy + 10) % 10);
                  }
                }
                return;
              }
              /* === 魔法選択モード：上下で選択 === */
              if (spellListMode) {
                if (dy !== 0 && dx === 0) {
                  const knownSpells = sr.current?.player?.spells || [];
                  const slen = knownSpells.length;
                  if (slen > 0) setSpellMenuSel((s) => (s + dy + slen) % slen);
                }
                return;
              }
              if (facingMode) {
                if (sr.current) {
                  sr.current.player.facing = { dx, dy };
                  setGs({ ...sr.current });
                }
                setFacingMode(false);
                return;
              }
              if (throwMode) execDirection(dx, dy);
              else if (dashMode) {
                doDash(dx, dy);
              } else act("move", dx, dy);
            }}
          />{" "}
          {!throwMode ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                flex: 1,
                maxWidth: 200,
              }}
            >
              {" "}
              <div style={{ display: "flex", gap: 3 }}>
                <AB label="拾" sub="grab" onClick={() => act("grab")} />
                <AB
                  label="矢"
                  sub="shoot"
                  onClick={() => act("shoot_arrow")}
                  color={p.arrow ? "#fc0" : "#555"}
                />
                <AB
                  label="袋"
                  sub="items"
                  onClick={() => act("inventory")}
                  color="#ff0"
                />
              </div>{" "}
              <div style={{ display: "flex", gap: 3 }}>
                <AB
                  label="足"
                  sub="足元"
                  onClick={() => act("interact")}
                  color="#0ff"
                />
                <AB
                  label="調"
                  sub="調べる"
                  onClick={() => doExamineFront()}
                  color="#4af"
                />
                <AB
                  label="待"
                  sub="wait"
                  onClick={() => act("wait")}
                  color="#666"
                />
              </div>{" "}
              <div style={{ display: "flex", gap: 3 }}>
                <AB
                  label="走"
                  sub={dashMode ? "ON" : "dash"}
                  onClick={() => { if (revealMode) return; setDashMode((v) => !v); }}
                  color={dashMode ? "#f44" : "#a8f"}
                />
                <AB
                  label="魔"
                  sub="魔法"
                  onClick={() => { if (revealMode) return; setSpellListMode((f) => !f); setSpellMenuSel(0); }}
                  color={spellListMode ? "#4af" : "#60a0e0"}
                />
                <AB
                  label="🎨"
                  sub="タイル"
                  onClick={() => { if (revealMode) return; setShowTileEditor(true); }}
                  color="#888"
                />
                <AB
                  label="📜"
                  sub="記録"
                  onClick={() => { if (revealMode) return; setShowScores(true); }}
                  color="#8cf"
                />
              </div>{" "}
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                textAlign: "center",
                color: "#f88",
                fontSize: 12,
                lineHeight: "1.5em",
              }}
            >
              {" "}
              <div style={{ fontWeight: "bold", marginBottom: 2 }}>
                {tmL}
              </div>{" "}
              <div style={{ color: "#a66", fontSize: 10 }}>
                {tmI?.name || "?"}
                {tmI?.type === "arrow"
                  ? ` (${tmI.count}本)`
                  : tmI?.type === "wand"
                    ? ` [${tmI.charges}回]`
                    : ""}
              </div>{" "}
              <button
                onClick={() => {
                  setThrowMode(null);
                  setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
                }}
                style={{
                  marginTop: 6,
                  padding: "5px 16px",
                  background: "#222",
                  color: "#888",
                  border: "1px solid #444",
                  borderRadius: 5,
                  fontSize: 11,
                  cursor: "pointer",
                  touchAction: "manipulation",
                }}
              >
                キャンセル
              </button>{" "}
            </div>
          )}{" "}
        </div>
      )}{" "}
      {!mobile && !throwMode && !springMode && !putMode && !markerMode && !spellListMode && (
        <div
          style={{
            fontSize: 10,
            color: "#444",
            textAlign: "center",
            marginTop: 2,
          }}
        >
          矢印/WASD/hjkl:移動　Shift+矢印/テンキー:ダッシュ　yubn:斜め　.:待機　g:拾う　i:所持品(↑↓で選択/Z:使用/X:閉じる)　
          {"<>"}:階段　q:矢を射る　z:アクション　f:調べる　t:向き変更
        </div>
      )}{" "}
      {!mobile && throwMode && (
        <div
          style={{
            fontSize: 12,
            color: "#f88",
            textAlign: "center",
            marginTop: 2,
            padding: "4px 0",
            background: "#1a1010",
            border: "1px solid #3a2020",
            borderRadius: 4,
          }}
        >
          <span style={{ fontWeight: "bold" }}>{tmL}</span>
          <span style={{ color: "#a66", marginLeft: 8 }}>
            [{tmI?.name}
            {tmI?.type === "wand" ? ` ${tmI.charges}回` : ""}]
          </span>
          <span style={{ color: "#666", marginLeft: 8 }}>
            方向キー — Esc:キャンセル
          </span>
        </div>
      )}{" "}
      {tpSelectMode && (
        <div
          style={{
            fontSize: 12,
            color: "#ffe040",
            textAlign: "center",
            marginTop: 2,
            padding: "4px 8px",
            background: "#1a1800",
            border: "1px solid #5a5000",
            borderRadius: 4,
          }}
        >
          <span style={{ fontWeight: "bold" }}>テレポート先選択【祝】</span>
          <span style={{ color: "#cc0", marginLeft: 8 }}>
            ({tpSelectMode.cx}, {tpSelectMode.cy})
            {(gs?.dungeon?.map?.[tpSelectMode.cy]?.[tpSelectMode.cx] === T.WALL || gs?.dungeon?.map?.[tpSelectMode.cy]?.[tpSelectMode.cx] === T.BWALL) ? " ⚠ 壁→ランダム" : ""}
          </span>
          <span style={{ color: "#888", marginLeft: 8 }}>
            方向キー:移動 Z/Enter:決定 X:キャンセル(ランダム)
          </span>
          {mobile && (
            <span style={{ marginLeft: 8 }}>
              <button onClick={() => {
                const { player: _p, dungeon: _dg } = sr.current || {};
                if (!_p || !_dg) return;
                const { cx: _tx, cy: _ty } = tpSelectMode;
                const _ml = [];
                const _walk = _dg.map[_ty]?.[_tx] !== T.WALL && _dg.map[_ty]?.[_tx] !== T.BWALL && _dg.map[_ty]?.[_tx] !== undefined;
                if (_walk) { _p.x = _tx; _p.y = _ty; _ml.push("テレポートした！（目的地指定）【祝】"); }
                else { const _rm = _dg.rooms[rng(0, _dg.rooms.length - 1)]; _p.x = rng(_rm.x, _rm.x + _rm.w - 1); _p.y = rng(_rm.y, _rm.y + _rm.h - 1); _ml.push("壁の中！ランダムにテレポートした。"); }
                endTurn(sr.current, _p, _ml);
                computeFOV(_dg.map, _p.x, _p.y, (_p.darknessTurns || 0) > 0 ? 1 : 6, _dg.visible, _dg.explored);
                setTpSelectMode(null);
                setMsgs(prev => [...prev.slice(-80), ..._ml]);
                sr.current = { ...sr.current };
                setGs({ ...sr.current });
              }} style={{ background: "#363", color: "#afa", border: "1px solid #6a6", borderRadius: 4, padding: "2px 8px", cursor: "pointer", marginRight: 4, touchAction: "manipulation" }}>決定</button>
              <button onClick={() => {
                const { player: _p, dungeon: _dg } = sr.current || {};
                if (!_p || !_dg) return;
                const _ml = [];
                const _rm = _dg.rooms[rng(0, _dg.rooms.length - 1)]; _p.x = rng(_rm.x, _rm.x + _rm.w - 1); _p.y = rng(_rm.y, _rm.y + _rm.h - 1);
                _ml.push("テレポートした！");
                endTurn(sr.current, _p, _ml);
                computeFOV(_dg.map, _p.x, _p.y, (_p.darknessTurns || 0) > 0 ? 1 : 6, _dg.visible, _dg.explored);
                setTpSelectMode(null);
                setMsgs(prev => [...prev.slice(-80), ..._ml]);
                sr.current = { ...sr.current };
                setGs({ ...sr.current });
              }} style={{ background: "#333", color: "#aaa", border: "1px solid #666", borderRadius: 4, padding: "2px 8px", cursor: "pointer", touchAction: "manipulation" }}>キャンセル</button>
            </span>
          )}
        </div>
      )}{" "}
      {putMode &&
        (() => {
          const pot = p.inventory[putMode.potIdx];
          if (!pot) return null;
          return (
            <div
              style={{
                position: "absolute",
                top: mobile ? 8 : 28,
                left: mobile ? 4 : 16,
                right: mobile ? 4 : 16,
                background: "#1a1408",
                border: "1px solid #5a4a2a",
                padding: mobile ? 10 : 14,
                zIndex: 12,
                borderRadius: 8,
                boxShadow: "0 4px 20px rgba(40,30,0,0.7)",
                maxHeight: mobile ? "65dvh" : "80%",
                overflowY: "auto",
              }}
            >
              {" "}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{ color: "#fc6", fontSize: 13, fontWeight: "bold" }}
                >
                  {dname(pot)} ({pot.contents?.length || 0}/{pot.capacity})
                </span>
                <button
                  onClick={() => setPutMode(null)}
                  style={{
                    background: "#333",
                    color: "#aaa",
                    border: "1px solid #555",
                    borderRadius: 4,
                    padding: "3px 12px",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  ✕
                </button>
              </div>{" "}
              {pot.contents?.length > 0 && (
                <div
                  style={{
                    color: "#a86",
                    fontSize: 10,
                    marginBottom: 6,
                    padding: "4px 6px",
                    background: "#1a1a08",
                    borderRadius: 3,
                    border: "1px solid #3a3a1a",
                  }}
                >
                  中身: {pot.contents.map((c) => dname(c)).join(", ")}
                </div>
              )}{" "}
              <div style={{ color: "#ca8", fontSize: 11, marginBottom: 6 }}>
                入れるアイテムを選んでください
              </div>{" "}
              {(() => {
                const pItems = p.inventory
                  .map((it, i) => ({ it, i }))
                  .filter(({ i }) => i !== putMode.potIdx);
                const _psp = 10;
                const _tpp = Math.max(1, Math.ceil(pItems.length / _psp));
                const _pgp = pItems.slice(putPage * _psp, (putPage + 1) * _psp);
                return pItems.length === 0 ? (
                  <div style={{ color: "#666", fontSize: 11 }}>
                    入れるアイテムがない。
                  </div>
                ) : (
                  <div>
                    {_tpp > 1 && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          gap: 8,
                          marginBottom: 6,
                          color: "#888",
                          fontSize: 11,
                        }}
                      >
                        <span>←→でページ切替</span>
                        <span style={{ color: "#ccc" }}>
                          {putPage + 1}/{_tpp}ページ
                        </span>
                        <span>
                          ({putPage * _psp + 1}〜
                          {Math.min((putPage + 1) * _psp, pItems.length)}件)
                        </span>
                      </div>
                    )}
                    {_pgp.map(({ it: it2, i: i2 }, vi) => {
                      const isPot = it2.type === "pot";
                      const isFood = it2.type === "food";
                      const isEquip =
                        it2.type === "weapon" || it2.type === "armor";
                      const isSel = vi === putMenuSel;
                      const isDisabled = isPot;
                      const _isUnidentPut = (() => { const _k2 = getIdentKey(it2); return _k2 && !gs?.ident?.has(_k2); })();
                      return (
                        <div
                          key={i2}
                          onClick={() => {
                            if (!isDisabled) doPutItem(i2);
                          }}
                          style={{
                            padding: "5px 8px",
                            margin: "2px 0",
                            background: isSel
                              ? isDisabled
                                ? "#3a1a1a"
                                : isFood
                                  ? "#3a3a08"
                                  : isEquip
                                    ? "#3a2008"
                                    : "#28285a"
                              : isDisabled
                                ? "#1a1a1a"
                                : isFood
                                  ? "#1a1a08"
                                  : isEquip
                                    ? "#1a1008"
                                    : "#18182a",
                            border:
                              "1px solid " +
                              (isSel
                                ? "#88c"
                                : isDisabled
                                  ? "#333"
                                  : isFood
                                    ? "#5a5a2a"
                                    : isEquip
                                      ? "#5a3a2a"
                                      : "#3a3a5a"),
                            borderRadius: 4,
                            cursor: isDisabled ? "not-allowed" : "pointer",
                            fontSize: 11,
                            color: isDisabled
                              ? "#555"
                              : isFood
                                ? "#fc6"
                                : isEquip
                                  ? "#fa8"
                                  : _isUnidentPut
                                    ? "#ff8"
                                    : "#aab",
                            opacity: isDisabled ? 0.5 : 1,
                          }}
                        >
                          {iLabel(it2)}
                          {isDisabled && " (入れられない)"}
                        </div>
                      );
                    })}
                    {"}"}
                  </div>
                );
              })()}{" "}
              <div style={{ color: "#556", fontSize: 10, marginTop: 4 }}>
                {p.inventory.length > 11
                  ? "↑↓:選択 ←→:ページ Z:決定 X:閉じる"
                  : "↑↓:選択 Z:決定 X:閉じる"}
              </div>{" "}
              <button
                onClick={() => setPutMode(null)}
                style={{
                  marginTop: 8,
                  padding: "5px 16px",
                  background: "#222",
                  color: "#888",
                  border: "1px solid #444",
                  borderRadius: 5,
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                やめる
              </button>{" "}
            </div>
          );
        })()}{" "}
      {markerMode && (() => {
        if (!sr.current) return null;
        const inv = sr.current.player.inventory;
        const marker = inv[markerMode.markerIdx];
        if (!marker) return null;
        const isBlankStep = markerMode.step === "select_blank";
        const isSpellbookTypeStep = markerMode.step === "select_spellbook_type";
        const listItems = isBlankStep
          ? inv.map((it, i) => ({ it, i })).filter(({ it }) => (it.type === "scroll" && it.effect === "blank") || (it.type === "spellbook" && !it.spell))
          : isSpellbookTypeStep
            ? SPELLBOOKS.filter((it) => it.spell).map((it, i) => ({ it, i }))
            : ITEMS.filter((it) => it.type === "scroll").map((it, i) => ({ it, i }));
        const _mlen = listItems.length;
        const safeSel = Math.min(markerMenuSel, Math.max(0, _mlen - 1));
        return (
          <div
            style={{
              position: "absolute",
              top: mobile ? 8 : 28,
              left: mobile ? 4 : 16,
              right: mobile ? 4 : 16,
              background: "#0a0a18",
              border: "1px solid #a040c0",
              padding: mobile ? 10 : 14,
              zIndex: 12,
              borderRadius: 8,
              boxShadow: "0 4px 20px rgba(80,0,120,0.6)",
              maxHeight: mobile ? "65dvh" : "80%",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ color: "#d080ff", fontSize: 13, fontWeight: "bold" }}>
                {marker.name} [{marker.charges}回]
              </span>
              <button
                onClick={() => setMarkerMode(null)}
                style={{ background: "#333", color: "#aaa", border: "1px solid #555", borderRadius: 4, padding: "3px 12px", cursor: "pointer", fontSize: 13 }}
              >
                ✕
              </button>
            </div>
            <div style={{ color: "#c090ee", fontSize: 11, marginBottom: 6 }}>
              {isBlankStep ? "書き込む白紙アイテムを選んでください" : isSpellbookTypeStep ? "変える魔法書の種類を選んでください (インク5回消費)" : "書き込む魔法を選んでください"}
            </div>
            {_mlen === 0 ? (
              <div style={{ color: "#666", fontSize: 11 }}>
                {isBlankStep ? "白紙の巻物も白紙の魔法書もない。" : "選択肢がない。"}
              </div>
            ) : (
              <div>
                {listItems.map(({ it, i }, vi) => {
                  const isSel = vi === safeSel;
                  return (
                    <div
                      key={isBlankStep ? i : (it.spell || it.effect || i)}
                      onClick={() => {
                        if (isBlankStep) {
                          const kind = it.type === "spellbook" ? "spellbook" : "scroll";
                          const nextStep = kind === "spellbook" ? "select_spellbook_type" : "select_type";
                          setMarkerMode((prev) => ({ ...prev, step: nextStep, blankIdx: i, blankKind: kind }));
                          setMarkerMenuSel(0);
                          setMsgs((prev) => [...prev.slice(-80), kind === "spellbook" ? "どの魔法書に変えますか...(インク5回消費)" : "どの魔法を書き込みますか..."]);
                        } else {
                          doMarkerWrite(markerMode.blankIdx, it);
                        }
                      }}
                      style={{
                        padding: "5px 8px",
                        margin: "2px 0",
                        background: isSel ? "#2a1040" : "#14101e",
                        border: "1px solid " + (isSel ? "#a040c0" : "#3a2050"),
                        borderRadius: 4,
                        cursor: "pointer",
                        fontSize: 11,
                        color: isSel ? "#e080ff" : "#aa88cc",
                      }}
                    >
                      {it.name}
                      {isBlankStep && it.type === "spellbook" ? <span style={{ color: "#5090cc", marginLeft: 6, fontSize: 10 }}>[魔法書]</span> : null}
                      {isBlankStep && it.type === "scroll" ? <span style={{ color: "#888855", marginLeft: 6, fontSize: 10 }}>[巻物]</span> : null}
                      {!isBlankStep && it.desc ? <span style={{ color: "#776688", marginLeft: 6, fontSize: 10 }}>{it.desc}</span> : null}
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ color: "#556", fontSize: 10, marginTop: 4 }}>↑↓:選択 Z:決定 X:閉じる</div>
            <button
              onClick={() => setMarkerMode(null)}
              style={{ marginTop: 8, padding: "5px 16px", background: "#222", color: "#888", border: "1px solid #444", borderRadius: 5, fontSize: 11, cursor: "pointer" }}
            >
              やめる
            </button>
          </div>
        );
      })()}{" "}
      {spellListMode && (() => {
        const knownSpells = (gs?.player?.spells || []).map((id) => {
          const s = SPELLS.find((sp) => sp.id === id);
          if (!s) return null;
          const _lv = (gs?.player?.spellLevels?.[id] || 1);
          return { ...s, mpCost: s.fixedMpCost ? s.mpCost : Math.max(1, 20 - (_lv - 1) * 3), spellLevel: _lv };
        }).filter(Boolean);
        const safeSel = Math.min(spellMenuSel, Math.max(0, knownSpells.length - 1));
        return (
          <div style={{
            position: "absolute", top: mobile ? 8 : 28,
            left: mobile ? 4 : 16, right: mobile ? 4 : 16,
            background: "#080d18", border: "1px solid #2050a0",
            padding: mobile ? 10 : 14, zIndex: 12, borderRadius: 8,
            boxShadow: "0 4px 20px rgba(0,40,120,0.7)",
            maxHeight: mobile ? "65dvh" : "80%", overflowY: "auto",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ color: "#80c0ff", fontSize: 13, fontWeight: "bold" }}>
                ✨ 魔法リスト [MP: {gs?.player?.mp ?? 0}/{gs?.player?.maxMp ?? 0}]
              </span>
              <button onClick={() => setSpellListMode(false)}
                style={{ background: "#333", color: "#aaa", border: "1px solid #555", borderRadius: 4, padding: "3px 12px", cursor: "pointer", fontSize: 13 }}>
                ✕
              </button>
            </div>
            {knownSpells.length === 0 ? (
              <div style={{ color: "#666", fontSize: 11 }}>習得した魔法がない。魔法書を読んで覚えよう。</div>
            ) : (
              <div>
                {knownSpells.map((spell, vi) => {
                  const isSel = vi === safeSel;
                  const canCast = (gs?.player?.mp ?? 0) >= spell.mpCost;
                  return (
                    <div key={spell.id} onClick={() => {
                      if (!canCast) { setMsgs((prev) => [...prev.slice(-80), `MPが足りない！(必要:${spell.mpCost} 現在:${gs?.player?.mp ?? 0})`]); return; }
                      setSpellListMode(false);
                      if (!spell.needsDir) {
                        if (!sr.current) return;
                        const { player: p2, dungeon: dg2 } = sr.current;
                        const ml2 = [];
                        if (inMagicSealRoom(p2.x, p2.y, dg2) || (p2.sealedTurns || 0) > 0) {
                          ml2.push(`魔法が封印されている！MPは消費しない。`);
                          endTurn(sr.current, p2, ml2); setMsgs((prev) => [...prev.slice(-80), ...ml2]); sr.current = { ...sr.current }; setGs({ ...sr.current });
                        } else if (spell.effect === "identify_magic") {
                          const _idt = p2.inventory.filter(_ii => {
                if (_ii.type === 'weapon' || _ii.type === 'armor') return !_ii.fullIdent && !_ii.bcKnown;
                const _k = getIdentKey(_ii); return !!_k && (!sr.current.ident.has(_k) || (!_ii.fullIdent && !_ii.bcKnown));
              });
                          if (_idt.length === 0) {
                            p2.mp -= spell.mpCost;
                            ml2.push(`${spell.name}を唱えた！[MP -${spell.mpCost}]`);
                            ml2.push("未識別のアイテムがない。");
                            endTurn(sr.current, p2, ml2); setMsgs((prev) => [...prev.slice(-80), ...ml2]); sr.current = { ...sr.current }; setGs({ ...sr.current });
                          } else {
                            setMsgs((prev) => [...prev.slice(-80), "識別するアイテムを選んでください。"]);
                            setIdentifyMode({ mode: 'identify', sel: 0, spellCost: spell.mpCost, spellMsg: `${spell.name}を唱えた！[MP -${spell.mpCost}]` });
                            setShowInv(false); setSelIdx(null); setShowDesc(null);
                            sr.current = { ...sr.current }; setGs({ ...sr.current });
                          }
                        } else if (spell.effect === "bless_magic" || spell.effect === "curse_magic") {
                          const _bcMode = spell.effect === "bless_magic" ? 'bless' : 'curse';
                          const _bcPrompt = _bcMode === 'bless' ? "祝福するアイテムを選んでください。" : "呪うアイテムを選んでください。";
                          setMsgs((prev) => [...prev.slice(-80), _bcPrompt]);
                          setIdentifyMode({ mode: _bcMode, sel: 0, spellCost: spell.mpCost, spellMsg: `${spell.name}を唱えた！[MP -${spell.mpCost}]` });
                          setShowInv(false); setSelIdx(null); setShowDesc(null);
                          sr.current = { ...sr.current }; setGs({ ...sr.current });
                        } else {
                        p2.mp -= spell.mpCost;
                        ml2.push(`${spell.name}を唱えた！[MP -${spell.mpCost}]`);
                        applySpellEffect(spell.effect, "self", null, 0, 0, dg2, p2, ml2, lu);
                        endTurn(sr.current, p2, ml2);
                        setMsgs((prev) => [...prev.slice(-80), ...ml2]);
                        sr.current = { ...sr.current }; setGs({ ...sr.current });
                        }
                      } else {
                        setThrowMode({ idx: spell.id, mode: "cast_spell" });
                        setMsgs((prev) => [...prev.slice(-80), `${spell.name}：方向を選んでください`]);
                      }
                    }} style={{
                      padding: "6px 8px", margin: "2px 0",
                      background: isSel ? "#0a1a30" : "#060e1a",
                      border: "1px solid " + (isSel ? "#2060c0" : "#152040"),
                      borderRadius: 4, cursor: canCast ? "pointer" : "not-allowed",
                      fontSize: 11, opacity: canCast ? 1 : 0.5,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: isSel ? "#a0d0ff" : "#7090c0", fontWeight: isSel ? "bold" : "normal" }}>
                          {spell.name}
                        </span>
                        <span style={{ color: canCast ? "#40a0ff" : "#555", fontSize: 10 }}>
                          Lv.{spell.spellLevel ?? 1} MP:{spell.mpCost}{spell.needsDir ? " 🎯" : " ✨"}
                          {spell.spellLevel >= 6 && <span style={{ color: "#ffd700", marginLeft: 3 }}>MAX</span>}
                        </span>
                      </div>
                      <div style={{ color: "#4060a0", fontSize: 10, marginTop: 2 }}>{spell.desc}</div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ color: "#304060", fontSize: 10, marginTop: 6 }}>↑↓:選択  Z:決定  X:閉じる  🎯=方向指定</div>
          </div>
        );
      })()}{" "}
      {shopMode && gs?.dungeon?.shop && (
        <div
          style={{
            position: "absolute",
            top: mobile ? 8 : 28,
            left: mobile ? 4 : 16,
            right: mobile ? 4 : 16,
            background: "#1a0e00",
            border: "1px solid #8a5a0a",
            padding: mobile ? 10 : 14,
            zIndex: 11,
            borderRadius: 8,
            boxShadow: "0 4px 20px rgba(80,40,0,0.7)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <span style={{ color: "#fa8", fontSize: 13, fontWeight: "bold" }}>
              🏪 お店
            </span>
            <button
              onClick={() => setShopMode(null)}
              style={{
                background: "#333",
                color: "#aaa",
                border: "1px solid #555",
                borderRadius: 4,
                padding: "2px 8px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
          {shopMode === "pay" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ color: "#fa8", fontSize: 12, marginBottom: 4 }}>
                店主：「お代は{gs.dungeon.shop.unpaidTotal}Gです。」
              </div>
              {[
                {
                  label: `支払う (${gs.dungeon.shop.unpaidTotal}G)`,
                  fn: () => {
                    if (sr.current) {
                      const { player: p2, dungeon: dg2 } = sr.current;
                      if (p2.gold >= dg2.shop.unpaidTotal) {
                        p2.gold -= dg2.shop.unpaidTotal;
                        dg2.shop.unpaidTotal = 0;
                        p2.inventory.forEach((it2) => {
                          if (it2.shopPrice) delete it2.shopPrice;
                        });
                        dg2.items.forEach((it2) => {
                          if (it2.shopPrice) delete it2.shopPrice;
                        });
                        const sk5 = dg2.monsters.find(
                          (m) => m.type === "shopkeeper",
                        );
                        if (sk5) {
                          sk5.state = "friendly";
                          sk5.x = sk5.homePos.x;
                          sk5.y = sk5.homePos.y;
                        }
                        setMsgs((prev) => [
                          ...prev.slice(-80),
                          "代金を支払った。ありがとうございます！",
                        ]);
                        sr.current = { ...sr.current };
                        setGs({ ...sr.current });
                      } else
                        setMsgs((prev) => [
                          ...prev.slice(-80),
                          "お金が足りない！",
                        ]);
                    }
                    setShopMode(null);
                  },
                },
                { label: "やめる", fn: () => setShopMode(null) },
              ].map((item, mi) => (
                <button
                  key={mi}
                  onClick={item.fn}
                  style={{
                    padding: "6px 10px",
                    background: shopMenuSel === mi ? "#4a2a00" : "#2a1a00",
                    border: `1px solid ${shopMenuSel === mi ? "#fa8" : "#6a4a20"}`,
                    borderRadius: 4,
                    color: shopMenuSel === mi ? "#ffa" : "#fa8",
                    fontSize: 12,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
          {shopMode === "sell" &&
            (() => {
              const dg2 = gs.dungeon;
              const fis = dg2.items.filter(
                (i) =>
                  !i.shopPrice &&
                  dg2.shop &&
                  i.x >= dg2.shop.room.x &&
                  i.x < dg2.shop.room.x + dg2.shop.room.w &&
                  i.y >= dg2.shop.room.y &&
                  i.y < dg2.shop.room.y + dg2.shop.room.h,
              );
              const allOpts = [
                ...fis.map((it) => ({
                  label: `${it.name}  →  ${Math.ceil(itemPrice(it) * 0.5)}G`,
                  fn: () => {
                    if (sr.current) {
                      const { player: p2, dungeon: dg3 } = sr.current;
                      const bp = Math.ceil(itemPrice(it) * 0.5);
                      p2.gold += bp;
                      it.shopPrice = itemPrice(it);
                      setMsgs((prev) => [
                        ...prev.slice(-80),
                        `${it.name}を${bp}Gで買い取った。`,
                      ]);
                      const rem = dg3.items.filter(
                        (i2) =>
                          !i2.shopPrice &&
                          dg3.shop &&
                          i2.x >= dg3.shop.room.x &&
                          i2.x < dg3.shop.room.x + dg3.shop.room.w &&
                          i2.y >= dg3.shop.room.y &&
                          i2.y < dg3.shop.room.y + dg3.shop.room.h,
                      );
                      sr.current = { ...sr.current };
                      setGs({ ...sr.current });
                      if (rem.length <= 1) setShopMode(null);
                      else setShopMenuSel((s) => Math.min(s, rem.length - 2));
                    }
                  },
                })),
                { label: "やめる", fn: () => setShopMode(null) },
              ];
              return (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  <div style={{ color: "#fa8", fontSize: 12, marginBottom: 4 }}>
                    店主：「買い取りましょうか？」
                  </div>
                  <div style={{ maxHeight: "50dvh", overflowY: "auto" }}>
                    {allOpts.map((item, mi) => (
                      <button
                        key={mi}
                        onClick={item.fn}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "6px 10px",
                          marginBottom: 2,
                          background:
                            shopMenuSel === mi ? "#4a2a00" : "#2a1a00",
                          border: `1px solid ${shopMenuSel === mi ? "#fa8" : "#6a4a20"}`,
                          borderRadius: 4,
                          color: shopMenuSel === mi ? "#ffa" : "#fa8",
                          fontSize: 12,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
        </div>
      )}
      {bigboxMode && (
        <div
          style={{
            position: "absolute",
            top: mobile ? 8 : 28,
            left: mobile ? 4 : 16,
            right: mobile ? 4 : 16,
            background: "#1a0c0a",
            border: "1px solid #7a4a2a",
            padding: mobile ? 10 : 14,
            zIndex: 11,
            borderRadius: 8,
            boxShadow: "0 4px 20px rgba(80,20,0,0.7)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <span style={{ color: "#fa8", fontSize: 13, fontWeight: "bold" }}>
              📦 {bigboxRef.current?.name}
            </span>
            <button
              onClick={() => {
                setBigboxMode(null);
                bigboxRef.current = null;
              }}
              style={{
                background: "#333",
                color: "#aaa",
                border: "1px solid #555",
                borderRadius: 4,
                padding: "3px 12px",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              ✕
            </button>
          </div>
          {bigboxRef.current && (
            <div style={{ color: "#a86", fontSize: 11, marginBottom: 6 }}>
              内容: {bigboxRef.current.contents.length}/
              {bigboxRef.current.capacity}
              {bigboxRef.current.contents.length > 0 &&
                ": " + bigboxRef.current.contents.map((i) => i.name).join(", ")}
            </div>
          )}
          {bigboxMode === "menu" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                {
                  label: "入れる",
                  desc: "手持ちからアイテムを入れる",
                  fn: () => {
                    setBigboxMode("put");
                    setBigboxMenuSel(0);
                    setBigboxPage(0);
                  },
                  dis:
                    bigboxRef.current?.contents.length >=
                    bigboxRef.current?.capacity,
                },
                {
                  label: "やめる",
                  desc: "",
                  fn: () => {
                    setBigboxMode(null);
                    bigboxRef.current = null;
                    setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
                  },
                },
              ].map((item, mi) => (
                <button
                  key={mi}
                  onClick={item.dis ? undefined : item.fn}
                  style={{
                    padding: "8px 12px",
                    background: item.dis
                      ? "#1a1a1a"
                      : bigboxMenuSel === mi
                        ? "#3a2a1a"
                        : "#1a1a0a",
                    color: item.dis
                      ? "#444"
                      : bigboxMenuSel === mi
                        ? "#fca"
                        : "#ca8",
                    border:
                      bigboxMenuSel === mi
                        ? "1px solid #a84"
                        : "1px solid #5a3a1a",
                    borderRadius: 5,
                    cursor: item.dis ? "not-allowed" : "pointer",
                    fontSize: 12,
                    textAlign: "left",
                    fontWeight: bigboxMenuSel === mi ? "bold" : "normal",
                    opacity: item.dis ? 0.5 : 1,
                  }}
                >
                  {mi + 1}. {item.label}
                  {item.desc && (
                    <span
                      style={{
                        color: bigboxMenuSel === mi ? "#a88" : "#664",
                        marginLeft: 8,
                      }}
                    >
                      — {item.desc}
                    </span>
                  )}
                </button>
              ))}
              <div style={{ color: "#556", fontSize: 10, marginTop: 2 }}>
                ↑↓:選択 Z:決定 X:閉じる
              </div>
            </div>
          )}
          {bigboxMode === "put" &&
            (() => {
              const _inv = gs.player.inventory;
              const _ps = 10;
              const _tp = Math.max(1, Math.ceil(_inv.length / _ps));
              const _pi = _inv.slice(bigboxPage * _ps, (bigboxPage + 1) * _ps);
              return (
                <div
                  style={{
                    maxHeight: mobile ? "50dvh" : "60%",
                    overflowY: "auto",
                  }}
                >
                  <div style={{ color: "#a86", fontSize: 11, marginBottom: 6 }}>
                    入れるアイテムを選んでください
                  </div>
                  {_tp > 1 && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 4,
                      }}
                    >
                      <button
                        onClick={() => {
                          setBigboxPage((p) => (p - 1 + _tp) % _tp);
                          setBigboxMenuSel(0);
                        }}
                        style={{
                          background: "#333",
                          color: "#aaa",
                          border: "1px solid #555",
                          borderRadius: 3,
                          padding: "2px 8px",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        ◀
                      </button>
                      <span style={{ color: "#888", fontSize: 10 }}>
                        {bigboxPage + 1}/{_tp}ページ
                      </span>
                      <button
                        onClick={() => {
                          setBigboxPage((p) => (p + 1) % _tp);
                          setBigboxMenuSel(0);
                        }}
                        style={{
                          background: "#333",
                          color: "#aaa",
                          border: "1px solid #555",
                          borderRadius: 3,
                          padding: "2px 8px",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        ▶
                      </button>
                    </div>
                  )}
                  {_inv.length === 0 ? (
                    <div style={{ color: "#666", fontSize: 11 }}>
                      持ち物がない。
                    </div>
                  ) : (
                    _pi.map((it, i) => (
                      <div
                        key={bigboxPage * _ps + i}
                        onClick={() => bigboxPutItem(bigboxPage * _ps + i)}
                        style={{
                          padding: "5px 8px",
                          margin: "2px 0",
                          background:
                            bigboxMenuSel === i ? "#3a2a0a" : "#1a1a08",
                          border:
                            "1px solid " +
                            (bigboxMenuSel === i ? "#ca6" : "#4a3a1a"),
                          borderRadius: 4,
                          cursor: "pointer",
                          fontSize: 11,
                          color:
                            it.type === "weapon" || it.type === "armor"
                              ? "#fa8"
                              : "#ca8",
                          fontWeight: bigboxMenuSel === i ? "bold" : "normal",
                        }}
                      >
                        {iLabel(it)}
                        {(it.type === "weapon" || it.type === "armor") && " ✓"}
                      </div>
                    ))
                  )}
                  <div style={{ color: "#556", fontSize: 10, marginTop: 4 }}>
                    ↑↓:選択 ←→:ページ Z:決定 X:戻る
                  </div>
                  <button
                    onClick={() => {
                      setBigboxMode("menu");
                      setBigboxMenuSel(0);
                      setBigboxPage(0);
                    }}
                    style={{
                      marginTop: 4,
                      padding: "5px 16px",
                      background: "#222",
                      color: "#888",
                      border: "1px solid #444",
                      borderRadius: 5,
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    戻る
                  </button>
                </div>
              );
            })()}
        </div>
      )}
      {identifyMode && gs && (() => {
        const _p = gs.player;
        const _isBCMode_ui = identifyMode.mode === 'bless' || identifyMode.mode === 'curse';
        const _isDupMode_ui = identifyMode.mode === 'duplicate';
        const _filtered = _p.inventory
          .map((it, i) => ({ it, i }))
          .filter(({ it, i }) => {
            if (_isBCMode_ui || _isDupMode_ui) return it.type !== "gold";
            if (identifyMode.scrollIdx === i) return false;
            if (it.type === 'weapon' || it.type === 'armor') {
              return identifyMode.mode === 'identify' ? (!it.fullIdent && !it.bcKnown) : (it.fullIdent || it.bcKnown);
            }
            const k = getIdentKey(it);
            if (!k) return false;
            if (identifyMode.mode === 'identify') return !gs.ident?.has(k) || (!it.fullIdent && !it.bcKnown);
            return gs.ident?.has(k);
          });
        const _idPage_ui   = identifyMode.page || 0;
        const _idTotalPg_ui = Math.max(1, Math.ceil(_filtered.length / 10));
        const _idPageItems_ui = _filtered.slice(_idPage_ui * 10, (_idPage_ui + 1) * 10);
        const _curSel_ui = Math.min(identifyMode.sel || 0, Math.max(0, _idPageItems_ui.length - 1));
        const doConfirmUI = (vi) => {
          if (!sr.current) return;
          const _absIdx = _idPage_ui * 10 + vi;
          const { it: _selIt } = _filtered[_absIdx] ?? _filtered[_idPage_ui * 10 + _curSel_ui] ?? {};
          if (!_selIt) return;
          let _msgResult;
          if (identifyMode.mode === 'bless') {
            if (_selIt.type === 'pot') {
              _selIt.capacity = (_selIt.capacity || 1) + 1;
              _msgResult = `${_selIt.name}を祝福した！(容量+1 → ${_selIt.capacity})【祝】`;
            } else { _selIt.blessed = true; _selIt.cursed = false; _selIt.bcKnown = true; _msgResult = `${_selIt.name}を祝福した！【祝】`; }
          } else if (identifyMode.mode === 'curse') {
            if (_selIt.type === 'pot') {
              const _nc = Math.max(0, (_selIt.capacity || 1) - 1);
              const _p_ui = sr.current.player;
              if ((_selIt.contents?.length || 0) > _nc) {
                const _rmIdx2 = _p_ui.inventory.indexOf(_selIt);
                if (_rmIdx2 !== -1) { const _fts3 = new Set(); for (const _ci of (_selIt.contents || [])) placeItemAt(sr.current.dungeon, _p_ui.x, _p_ui.y, _ci, [], _fts3); _p_ui.inventory.splice(_rmIdx2, 1); }
                _msgResult = `${_selIt.name}が呪いで割れた！中身が足元に落ちた！【呪】`;
              } else { _selIt.capacity = _nc; _msgResult = `${_selIt.name}を呪った！(容量-1 → ${_selIt.capacity})【呪】`; }
            } else { _selIt.cursed = true; _selIt.blessed = false; _selIt.bcKnown = true; _msgResult = `${_selIt.name}を呪った！【呪】`; }
          } else if (identifyMode.mode === 'duplicate') {
            const _dupCount = identifyMode.blessed ? 2 : identifyMode.cursed ? 0 : 1;
            const _p_dup = sr.current.player;
            if (_dupCount === 0) {
              const _rmIdx = _p_dup.inventory.indexOf(_selIt);
              if (_rmIdx !== -1) _p_dup.inventory.splice(_rmIdx, 1);
              _msgResult = `${_selIt.name}が消えてしまった！【呪】`;
            } else {
              for (let _di = 0; _di < _dupCount; _di++) _p_dup.inventory.push({ ..._selIt, id: uid() });
              _msgResult = identifyMode.blessed ? `${_selIt.name}が2つ増えた！【祝】` : `${_selIt.name}が1つ増えた！`;
            }
          } else {
            const _isWA = _selIt.type === 'weapon' || _selIt.type === 'armor';
            const _selKey = _isWA ? null : getIdentKey(_selIt);
            if (identifyMode.mode === 'identify') {
              const _wasAlreadyNamed = !_isWA && _selKey && sr.current.ident.has(_selKey);
              if (_selKey) sr.current.ident.add(_selKey);
              _selIt.fullIdent = true; _selIt.bcKnown = true;
              _msgResult = (_isWA || _wasAlreadyNamed) ? `${_selIt.name}の祝呪が判明した！` : `${_selIt.name}と判明した！`;
            } else {
              if (_selKey) sr.current.ident.delete(_selKey);
              _selIt.fullIdent = false; _selIt.bcKnown = false;
              _msgResult = `${_selIt.name}の識別が失われた...`;
            }
          }
          if (identifyMode.mode !== 'duplicate' && identifyMode.scrollIdx != null) {
            sr.current.player.inventory.splice(identifyMode.scrollIdx, 1);
          }
          if (identifyMode.spellCost != null) {
            sr.current.player.mp -= identifyMode.spellCost;
          }
          endTurn(sr.current, sr.current.player, []);
          const _ml_id = identifyMode.spellMsg ? [identifyMode.spellMsg, _msgResult] : [_msgResult];
          setIdentifyMode(null);
          setMsgs((prev) => [...prev.slice(-80), ..._ml_id]);
          sr.current = { ...sr.current }; setGs({ ...sr.current });
        };
        return (
          <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.85)",
                        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", zIndex:300 }}>
            <div style={{ background:"#1a2a3a", padding:16, borderRadius:8, maxWidth:400, width:"90%", maxHeight:"80dvh", overflowY:"auto" }}>
              <div style={{ color:"#ff0", marginBottom:4, fontWeight:"bold" }}>
                {identifyMode.mode === 'bless' ? "祝福するアイテムを選んでください【祝】"
                  : identifyMode.mode === 'curse' ? "呪うアイテムを選んでください【呪】"
                  : identifyMode.mode === 'duplicate' ? (identifyMode.blessed ? "複製するアイテムを選んでください（2つ増える）【祝】" : identifyMode.cursed ? "複製するアイテムを選んでください（消えてしまう）【呪】" : "複製するアイテムを選んでください")
                  : identifyMode.mode === 'identify' ? "識別するアイテムを選んでください"
                  : "識別を解除するアイテムを選んでください【呪】"}
              </div>
              <div style={{ color:"#556", fontSize:10, marginBottom:4 }}>↑↓/8,2:選択　←→/4,6:ページ　Ｚ/Enter:決定　ESC:キャンセル</div>
              {_idTotalPg_ui > 1 && (
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                  <button onClick={() => setIdentifyMode({ ...identifyMode, page: ((_idPage_ui - 1 + _idTotalPg_ui) % _idTotalPg_ui), sel: 0 })}
                    style={{ background:"#1a3a5a", color:"#8af", border:"1px solid #4060a0", borderRadius:4, padding:"2px 8px", cursor:"pointer", touchAction:"manipulation" }}>◀</button>
                  <span style={{ color:"#8af", fontSize:11 }}>{_idPage_ui + 1} / {_idTotalPg_ui}</span>
                  <button onClick={() => setIdentifyMode({ ...identifyMode, page: ((_idPage_ui + 1) % _idTotalPg_ui), sel: 0 })}
                    style={{ background:"#1a3a5a", color:"#8af", border:"1px solid #4060a0", borderRadius:4, padding:"2px 8px", cursor:"pointer", touchAction:"manipulation" }}>▶</button>
                </div>
              )}
              {_idPageItems_ui.length === 0 && <div style={{ color:"#888" }}>該当するアイテムがない。</div>}
              {_idPageItems_ui.map(({ it, i }, vi) => {
                const _isSel = vi === _curSel_ui;
                return (
                  <div key={i} onClick={() => doConfirmUI(vi)}
                    style={{ padding:"4px 8px", cursor:"pointer",
                             background: _isSel ? "#2a4a6a" : "#1a3a5a",
                             border: `1px solid ${_isSel ? "#4080c0" : "transparent"}`,
                             margin:"2px 0", borderRadius:4,
                             color: _isSel ? "#fff" : "#ccc",
                             fontWeight: _isSel ? "bold" : "normal" }}>
                    {_isSel ? "▶ " : "\u3000"}{iLabel(it)}
                  </div>
                );
              })}
              <button onClick={() => { setIdentifyMode(null); setMsgs((prev) => [...prev.slice(-80), "やめた。"]); }}
                style={{ marginTop:8, color:"#888", background:"#0a1a2a", border:"1px solid #446", borderRadius:4, padding:"4px 12px", cursor:"pointer" }}>
                やめる (ESC)
              </button>
            </div>
          </div>
        );
      })()}
      {nicknameMode && (() => {
        const _typePrefix = nicknameMode.identKey[0];
        const _knownNames = [...(gs?.ident || [])]
          .filter(k => k[0] === _typePrefix)
          .map(k => {
            const _eff = k.slice(2);
            const _item = ITEMS.find(i =>
              (_typePrefix === 'p' && i.type === 'potion' && i.effect === _eff) ||
              (_typePrefix === 's' && i.type === 'scroll' && i.effect === _eff) ||
              (_typePrefix === 'w' && i.type === 'wand' && i.effect === _eff) ||
              (_typePrefix === 'n' && i.type === 'pen' && i.effect === _eff)
            ) || POTS.find(pp => _typePrefix === 'o' && pp.potEffect === _eff);
            return _item?.name;
          })
          .filter(Boolean);
        return (
          <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.85)",
                        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", zIndex:300 }}>
            <div style={{ background:"#1a2a3a", padding:16, borderRadius:8, maxWidth:400, width:"90%" }}>
              <div style={{ color:"#ff0", marginBottom:8, fontWeight:"bold" }}>アイテムに名前をつける</div>
              <div style={{ color:"#888", fontSize:11, marginBottom:4 }}>偽名: {gs?.fakeNames?.[nicknameMode.identKey] ?? "?"}</div>
              <input
                value={nicknameInput}
                onChange={e2 => setNicknameInput(e2.target.value)}
                onKeyDown={e2 => {
                  if (e2.key === 'Enter') {
                    const _k = nicknameMode.identKey;
                    if (nicknameInput.trim()) sr.current.nicknames[_k] = nicknameInput.trim();
                    else delete sr.current.nicknames[_k];
                    setNicknameMode(null);
                    sr.current = { ...sr.current }; setGs({ ...sr.current });
                  }
                  if (e2.key === 'Escape') setNicknameMode(null);
                }}
                placeholder="名前を入力（空欄でリセット）"
                autoFocus
                style={{ width:"100%", background:"#0a1a2a", color:"#fff", border:"1px solid #446", padding:4, borderRadius:4, boxSizing:"border-box" }}
              />
              {_knownNames.length > 0 && (
                <div style={{ marginTop:8 }}>
                  <div style={{ color:"#888", fontSize:11 }}>識別済みの名前から選ぶ：</div>
                  {_knownNames.map((n, ni) => (
                    <div key={ni} onClick={() => setNicknameInput(n)}
                      style={{ padding:"2px 6px", cursor:"pointer", color:"#8cf", background:"#1a3a5a", margin:"1px 0", borderRadius:3 }}>
                      {n}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display:"flex", gap:8, marginTop:12 }}>
                <button onClick={() => {
                  const _k = nicknameMode.identKey;
                  if (nicknameInput.trim()) sr.current.nicknames[_k] = nicknameInput.trim();
                  else delete sr.current.nicknames[_k];
                  setNicknameMode(null);
                  sr.current = { ...sr.current }; setGs({ ...sr.current });
                }} style={{ background:"#0a2a4a", border:"1px solid #446", color:"#cfc", borderRadius:4, padding:"4px 12px", cursor:"pointer" }}>決定</button>
                <button onClick={() => setNicknameMode(null)}
                  style={{ background:"#0a1a2a", border:"1px solid #446", color:"#888", borderRadius:4, padding:"4px 12px", cursor:"pointer" }}>キャンセル</button>
              </div>
            </div>
          </div>
        );
      })()}
      {springMode && (
        <div
          style={{
            position: "absolute",
            top: mobile ? 8 : 28,
            left: mobile ? 4 : 16,
            right: mobile ? 4 : 16,
            background: "#0c1a2a",
            border: "1px solid #3a5a7a",
            padding: mobile ? 10 : 14,
            zIndex: 11,
            borderRadius: 8,
            boxShadow: "0 4px 20px rgba(0,40,80,0.7)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <span style={{ color: "#4af", fontSize: 13, fontWeight: "bold" }}>
              ♨ 泉
            </span>
            <button
              onClick={() => {
                setSpringMode(null);
                setSpringMenuSel(0);
              }}
              style={{
                background: "#333",
                color: "#aaa",
                border: "1px solid #555",
                borderRadius: 4,
                padding: "3px 12px",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              ✕
            </button>
          </div>
          {springMode === "menu" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { label: "飲む", desc: "泉の水を飲む", fn: springDrink },
                {
                  label: "浸す",
                  desc: "アイテムを泉に浸す",
                  fn: () => {
                    setSpringMode("soak");
                    setSpringMenuSel(0);
                  },
                },
                {
                  label: "やめる",
                  desc: "",
                  fn: () => {
                    setSpringMode(null);
                    setMsgs((prev) => [...prev.slice(-80), "やめた。"]);
                  },
                },
              ].map((item, mi) => (
                <button
                  key={mi}
                  onClick={item.fn}
                  style={{
                    padding: "8px 12px",
                    background: springMenuSel === mi ? "#2a4a6a" : "#1a2a3a",
                    color: springMenuSel === mi ? "#8df" : "#6cf",
                    border:
                      springMenuSel === mi
                        ? "1px solid #6af"
                        : "1px solid #3a5a7a",
                    borderRadius: 5,
                    cursor: "pointer",
                    fontSize: 12,
                    textAlign: "left",
                    fontWeight: springMenuSel === mi ? "bold" : "normal",
                  }}
                >
                  {mi + 1}. {item.label}
                  {item.desc && (
                    <span
                      style={{
                        color: springMenuSel === mi ? "#88c" : "#668",
                        marginLeft: 8,
                      }}
                    >
                      — {item.desc}
                    </span>
                  )}
                </button>
              ))}
              <div style={{ color: "#556", fontSize: 10, marginTop: 2 }}>
                ↑↓:選択 Z:決定 X:閉じる
              </div>
            </div>
          )}
          {springMode === "soak" && (() => {
            const _spInv = p.inventory;
            const _spLen = _spInv.length;
            const _spTotalPg = Math.max(1, Math.ceil(_spLen / 10));
            const _spCurPg = Math.min(springPage, _spTotalPg - 1);
            const _spPageItems = _spInv.slice(_spCurPg * 10, (_spCurPg + 1) * 10);
            return (
              <div style={{ maxHeight: mobile ? "50dvh" : "60%", overflowY: "auto" }}>
                <div style={{ color: "#8ac", fontSize: 11, marginBottom: 4 }}>
                  泉に浸すアイテムを選んでください
                </div>
                {_spLen > 10 && (
                  <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 4 }}>
                    <button onClick={() => { setSpringPage(pg => (pg - 1 + _spTotalPg) % _spTotalPg); setSpringMenuSel(0); }}
                      style={{ padding: "2px 8px", background: "#223", color: "#8ac", border: "1px solid #446", borderRadius: 3, fontSize: 11, cursor: "pointer" }}>◀</button>
                    <span style={{ color: "#8ac", fontSize: 11 }}>{_spCurPg + 1}/{_spTotalPg}</span>
                    <button onClick={() => { setSpringPage(pg => (pg + 1) % _spTotalPg); setSpringMenuSel(0); }}
                      style={{ padding: "2px 8px", background: "#223", color: "#8ac", border: "1px solid #446", borderRadius: 3, fontSize: 11, cursor: "pointer" }}>▶</button>
                  </div>
                )}
                {_spLen === 0 ? (
                  <div style={{ color: "#666", fontSize: 11 }}>持ち物がない。</div>
                ) : (
                  _spPageItems.map((it, pi) => {
                    const absI = _spCurPg * 10 + pi;
                    const isSel = springMenuSel === pi;
                    return (
                      <div key={absI} onClick={() => { springDoSoak(absI); setSpringPage(0); setSpringMenuSel(0); }}
                        style={{
                          padding: "5px 8px", margin: "2px 0", borderRadius: 4, cursor: "pointer", fontSize: 11,
                          background: isSel ? (it.type === "bottle" ? "#2a4a2a" : it.type === "weapon" || it.type === "armor" ? "#4a2a2a" : "#2a2a4a")
                                           : (it.type === "bottle" ? "#1a2a1a" : it.type === "weapon" || it.type === "armor" ? "#2a1a1a" : "#18182a"),
                          border: "1px solid " + (isSel ? (it.type === "bottle" ? "#6afa6a" : it.type === "weapon" || it.type === "armor" ? "#fa6a6a" : "#6a6afa")
                                                       : (it.type === "bottle" ? "#3a6a3a" : it.type === "weapon" || it.type === "armor" ? "#6a3a3a" : "#3a3a5a")),
                          color: it.type === "bottle" ? "#6f6" : it.type === "weapon" || it.type === "armor" ? "#f88" : "#aab",
                          fontWeight: isSel ? "bold" : "normal",
                        }}
                      >
                        {iLabel(it)}
                        {it.type === "bottle" && " → 水を汲める"}
                        {(it.type === "weapon" || it.type === "armor") && " ⚠ 錆びる"}
                      </div>
                    );
                  })
                )}
                <div style={{ color: "#556", fontSize: 10, marginTop: 4 }}>
                  ↑↓:選択　←→:ページ　Z:決定　X:戻る
                </div>
                <button onClick={() => { setSpringMode("menu"); setSpringMenuSel(0); setSpringPage(0); }}
                  style={{ marginTop: 4, padding: "5px 16px", background: "#222", color: "#888", border: "1px solid #444", borderRadius: 5, fontSize: 11, cursor: "pointer" }}>
                  戻る
                </button>
              </div>
            );
          })()}
        </div>
      )}{" "}
      {showInv && (
        <div
          style={{
            position: "absolute",
            top: mobile ? 8 : 28,
            left: mobile ? 4 : 16,
            right: mobile ? 4 : 16,
            background: "#12121c",
            border: "1px solid #4a4a5a",
            padding: mobile ? 10 : 14,
            zIndex: 10,
            maxHeight: mobile ? "65dvh" : "80%",
            overflowY: "auto",
            borderRadius: 8,
            boxShadow: "0 4px 20px rgba(0,0,0,0.7)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <span style={{ color: "#ff0", fontSize: 13, fontWeight: "bold" }}>
              所持品 ({p.inventory.length}/{p.maxInventory || 30})
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={sortInventory}
                style={{
                  background: "#1a2a1a",
                  color: "#6c6",
                  border: "1px solid #3a5a3a",
                  borderRadius: 4,
                  padding: "3px 8px",
                  cursor: "pointer",
                  fontSize: 11,
                  touchAction: "manipulation",
                }}
              >
                整頓[S]
              </button>
              <button
                onClick={() => {
                  const newMode = !dropModeRef.current;
                  dropModeRef.current = newMode;
                  setDropMode(newMode);
                }}
                style={{
                  background: dropMode ? "#2a1a1a" : "#1a1a2a",
                  color: dropMode ? "#f88" : "#aaa",
                  border: `1px solid ${dropMode ? "#8a3030" : "#3a3a5a"}`,
                  borderRadius: 4,
                  padding: "3px 8px",
                  cursor: "pointer",
                  fontSize: 11,
                  touchAction: "manipulation",
                  fontWeight: dropMode ? "bold" : "normal",
                }}
              >
                置く[D]
              </button>
              <button
                onClick={() => {
                  setShowInv(false);
                  dropModeRef.current = false;
                  setDropMode(false);
                  setSelIdx(null);
                  setShowDesc(null);
                  setInvPage(0);
                  setInvMenuSel(null);
                }}
                style={{
                  background: "#333",
                  color: "#aaa",
                  border: "1px solid #555",
                  borderRadius: 4,
                  padding: "3px 12px",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                ✕
              </button>
            </div>
          </div>
          {p.weapon && (
            <div style={{ color: "#aaa", fontSize: 11, marginBottom: 2 }}>
              武器:{" "}
              <span style={{ color: "#fa0" }}>
                {p.weapon.name}
                {p.weapon.plus ? "+" + p.weapon.plus : ""}
              </span>{" "}
              (攻+{p.weapon.atk + (p.weapon.plus || 0)})
              {(p.weapon.ability || p.weapon.abilities?.length > 0) && (
                <span style={{ color: "#fc6", fontSize: 9 }}>
                  {" "}
                  [
                  {[
                    ...new Set([
                      ...(p.weapon.abilities || []),
                      ...(p.weapon.ability ? [p.weapon.ability] : []),
                    ]),
                  ]
                    .map(
                      (id) => WEAPON_ABILITIES.find((a) => a.id === id)?.name,
                    )
                    .filter(Boolean)
                    .join("・")}
                  ]
                </span>
              )}
            </div>
          )}
          {p.armor && (
            <div style={{ color: "#aaa", fontSize: 11, marginBottom: 2 }}>
              防具:{" "}
              <span style={{ color: "#08f" }}>
                {p.armor.name}
                {p.armor.plus ? "+" + p.armor.plus : ""}
              </span>{" "}
              (防+{p.armor.def + (p.armor.plus || 0)})
              {(p.armor.ability || p.armor.abilities?.length > 0) && (
                <span style={{ color: "#6cf", fontSize: 9 }}>
                  {" "}
                  [
                  {[
                    ...new Set([
                      ...(p.armor.abilities || []),
                      ...(p.armor.ability ? [p.armor.ability] : []),
                    ]),
                  ]
                    .map((id) => ARMOR_ABILITIES.find((a) => a.id === id)?.name)
                    .filter(Boolean)
                    .join("・")}
                  ]
                </span>
              )}
            </div>
          )}
          {p.arrow ? (
            <div style={{ color: "#aaa", fontSize: 11, marginBottom: 6 }}>
              矢: <span style={{ color: "#dda050" }}>{p.arrow.name}</span> (
              {p.arrow.count}本)
            </div>
          ) : (
            <div style={{ color: "#555", fontSize: 11, marginBottom: 6 }}>
              矢: なし
            </div>
          )}
          {p.inventory.length > 10 && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 8,
                marginBottom: 6,
                color: "#888",
                fontSize: 11,
              }}
            >
              <span>←→でページ移動</span>
              <span style={{ color: "#ccc" }}>
                {invPage + 1}/{Math.ceil(p.inventory.length / 10)}ページ
              </span>
              <span>
                ({invPage * 10 + 1}〜
                {Math.min((invPage + 1) * 10, p.inventory.length)}件)
              </span>
            </div>
          )}
          {p.inventory.length === 0 ? (
            <div style={{ color: "#555", padding: 8 }}>何も持っていない。</div>
          ) : (
            p.inventory.slice(invPage * 10, (invPage + 1) * 10).map((it, j) => {
              const i = invPage * 10 + j;
              const acts = [];
              if (canUse(it))
                acts.push({
                  label: useLabel(it),
                  fn: () => {
                    doUseItem(i);
                    setInvMenuSel(null);
                  },
                });
              if (it.type === "spellbook")
                acts.push({
                  label: "読む",
                  fn: () => {
                    doReadSpellbook(i);
                    setInvMenuSel(null);
                  },
                });
              if (it.type === "arrow")
                acts.push({
                  label: "射る",
                  fn: () => {
                    doShoot(i);
                    setInvMenuSel(null);
                  },
                });
              if (it.type === "wand")
                acts.push({
                  label: "振る",
                  fn: () => {
                    doWaveWand(i);
                    setInvMenuSel(null);
                  },
                });
              if (it.type === "wand")
                acts.push({
                  label: "壊す",
                  fn: () => {
                    doBreakWand(i);
                    setInvMenuSel(null);
                  },
                });
              if (it.type === "marker")
                acts.push({
                  label: "書く",
                  fn: () => {
                    doUseMarker(i);
                    setInvMenuSel(null);
                  },
                });
              if (it.type === "pot")
                acts.push({
                  label: "割る",
                  fn: () => {
                    doBreakPot(i);
                    setInvMenuSel(null);
                  },
                });
              acts.push({
                label: "置く",
                fn: () => {
                  doDropItem(i);
                  setInvMenuSel(null);
                },
              });
              acts.push({
                label: it.type === "arrow" ? "投げる(束)" : "投げる",
                fn: () => {
                  doThrow(i);
                  setInvMenuSel(null);
                },
              });
              acts.push({
                label: "説明",
                fn: () => {
                  setShowDesc((p) => (p === i ? null : i));
                  setInvMenuSel(null);
                },
              });
              {
                const _nik = getIdentKey(it);
                if (_nik && gs?.ident && !gs.ident.has(_nik)) {
                  acts.push({
                    label: "名付ける",
                    fn: () => {
                      setNicknameMode({ identKey: _nik });
                      setNicknameInput(gs?.nicknames?.[_nik] || '');
                      setShowInv(false); setSelIdx(null); setShowDesc(null);
                      setInvMenuSel(null);
                    },
                  });
                }
              }
              const _isUnidentInv = (() => { const _kk = getIdentKey(it); return !!(_kk && gs?.ident && !gs.ident.has(_kk)); })();
              /* 名前は識別済みだが祝呪未判明（緑表示）：武器・防具も対象 */
              const _isIdentBCUnknown = (() => {
                if (it.type === 'weapon' || it.type === 'armor') return !it.fullIdent && !it.bcKnown;
                const _kk = getIdentKey(it); return !!(_kk && gs?.ident?.has(_kk) && !it.fullIdent && !it.bcKnown);
              })();
              return (
                <div
                  key={i}
                  style={{
                    borderBottom: "1px solid #222",
                    borderRadius: 4,
                    marginBottom: 1,
                  }}
                >
                  <div
                    onClick={() => {
                      if (dropModeRef.current) {
                        doDropItem(i);
                        setTimeout(() => ref.current?.focus(), 0);
                        return;
                      }
                      setSelIdx(selIdx === j ? null : j);
                      setInvMenuSel(null);
                      setShowDesc(null);
                      setTimeout(() => ref.current?.focus(), 0);
                    }}
                    style={{
                      padding: "7px 8px",
                      cursor: "pointer",
                      fontSize: mobile ? 13 : 12,
                      background: selIdx === j ? "#252540" : "transparent",
                      borderRadius: 4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      color: _isUnidentInv ? "#ff8" : _isIdentBCUnknown ? "#6d6" : "#ccc",
                    }}
                  >
                    <span>{iLabel(it)}</span>
                    <span style={{ color: "#555", fontSize: 10 }}>
                      {selIdx === j ? (invMenuSel !== null ? "▶" : "▲") : "▼"}
                    </span>
                  </div>
                  {selIdx === j && (
                    <div style={{ padding: "4px 8px 8px" }}>
                      <div
                        style={{ display: "flex", gap: 4, flexWrap: "wrap" }}
                      >
                        {acts.map((a, ai) => (
                          <button
                            key={ai}
                            onClick={() => a.fn()}
                            style={{
                              background:
                                invMenuSel === ai ? "#3a3a6a" : "#1a1a2a",
                              color: invMenuSel === ai ? "#fff" : "#aaa",
                              border:
                                invMenuSel === ai
                                  ? "1px solid #88f"
                                  : "1px solid #333",
                              borderRadius: 4,
                              padding: "4px 10px",
                              cursor: "pointer",
                              fontSize: mobile ? 13 : 12,
                              fontWeight: invMenuSel === ai ? "bold" : "normal",
                            }}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                      {invMenuSel !== null && (
                        <div
                          style={{ color: "#888", fontSize: 10, marginTop: 2 }}
                        >
                          ←→:選択 Z:決定 X:キャンセル
                        </div>
                      )}
                      {showDesc === i && (
                        <div
                          style={{
                            background: "#18182a",
                            border: "1px solid #3a3a5a",
                            borderRadius: 5,
                            padding: "8px 10px",
                            color: "#aab",
                            fontSize: 11,
                            lineHeight: "1.5em",
                            marginTop: 4,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: "bold",
                              marginBottom: 4,
                              fontSize: 12,
                            }}
                          >
                            {it.name}
                            {it.type === "weapon" && ` — 武器 (攻+${it.atk})`}
                            {it.type === "armor" && ` — 防具 (防+${it.def})`}
                            {it.type === "arrow" &&
                              ` — 矢 (攻${it.atk}, ${it.count}本)`}
                            {it.type === "wand" && ` — 杖 [残${it.charges}回]`}
                            {it.type === "marker" && ` — マーカー [残${it.charges}回]`}
                            {it.type === "potion" && " — 薬"}
                            {it.type === "bottle" && " — 瓶"}
                            {it.type === "scroll" && " — 巻物"}
                            {it.type === "food" &&
                              ` — 食料${it.cooked ? "(調理済)" : "(生)"}`}
                            {it.type === "pot" &&
                              ` — 壺 [${it.contents?.length || 0}/${it.capacity}]`}
                          </div>
                          {it.desc || "特に情報はない。"}
                          {it.ability &&
                            (() => {
                              const _ab = [
                                ...WEAPON_ABILITIES,
                                ...ARMOR_ABILITIES,
                              ].find((a) => a.id === it.ability);
                              return _ab ? (
                                <div style={{ color: "#fa0", marginTop: 3 }}>
                                  【特性】{_ab.name}：{_ab.desc}
                                </div>
                              ) : null;
                            })()}
                          {it.potionEffects?.length > 0 && (
                            <div style={{ color: "#fc6", marginTop: 3 }}>
                              薬効果:{" "}
                              {it.potionEffects
                                .map(
                                  (e) =>
                                    ({
                                      heal: "回復",
                                      poison: "猛毒",
                                      sleep: "睡眠",
                                      power: "強化",
                                    })[e] || e,
                                )
                                .join(", ")}
                            </div>
                          )}
                          {it.type === "pot" && it.contents?.length > 0 && (
                            <div style={{ color: "#ca8", marginTop: 3 }}>
                              中身: {it.contents.map((c) => c.name).join(", ")}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}{" "}
      {dead && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.9)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
            borderRadius: 6,
          }}
        >
          <div
            style={{
              color: "#f33",
              fontSize: mobile ? 20 : 26,
              fontWeight: "bold",
              textShadow: "0 0 12px #f00",
              marginBottom: 6,
            }}
          >
            *** GAME OVER ***
          </div>
          <div
            style={{
              color: "#f88",
              fontSize: mobile ? 13 : 16,
              marginBottom: 6,
              textAlign: "center",
            }}
          >
            {p.deathCause || "不明の原因により"}倒れた
          </div>
          <div
            style={{
              color: "#777",
              fontSize: mobile ? 11 : 13,
              marginBottom: 4,
            }}
          >
            Lv.{p.level} | B{p.depth}F | T:{p.turns} | G:{p.gold}
          </div>
          <div style={{ color: "#555", fontSize: 11, marginBottom: 10 }}>
            ← → で選択 / Enter で決定
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={init}
              style={{
                padding: "10px 28px",
                background: gameOverSel === 0 ? "#162816" : "#181828",
                color: "#0f0",
                border: `1px solid ${gameOverSel === 0 ? "#0f0" : "#2a4a2a"}`,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 14,
                borderRadius: 6,
                boxShadow: gameOverSel === 0 ? "0 0 8px #0a0" : "none",
              }}
            >
              {gameOverSel === 0 ? "▶ " : "　"}もう一度挑戦する
            </button>
            <button
              onClick={() => setShowScores(true)}
              style={{
                padding: "10px 20px",
                background: gameOverSel === 1 ? "#101828" : "#181828",
                color: "#8cf",
                border: `1px solid ${gameOverSel === 1 ? "#8cf" : "#2a3a4a"}`,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 14,
                borderRadius: 6,
                boxShadow: gameOverSel === 1 ? "0 0 8px #08f" : "none",
              }}
            >
              {gameOverSel === 1 ? "▶ " : "　"}スコアを見る
            </button>
          </div>
        </div>
      )}
      {showScores && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.95)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            zIndex: 30,
            borderRadius: 6,
            padding: "20px 10px",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              color: "#8cf",
              fontSize: mobile ? 16 : 20,
              fontWeight: "bold",
              marginBottom: 14,
            }}
          >
            ── 冒険の記録 ──
          </div>
          {(() => {
            let _sc = [];
            try { _sc = JSON.parse(localStorage.getItem("roguelike_scores") || "[]"); } catch (_e) {}
            if (_sc.length === 0) {
              return <div style={{ color: "#555", fontSize: 14 }}>記録なし</div>;
            }
            return _sc.map((_s, _i) => (
              <div
                key={_i}
                style={{
                  width: "100%",
                  maxWidth: 400,
                  background: "#0d0d1a",
                  border: "1px solid #223",
                  borderRadius: 5,
                  padding: "8px 12px",
                  marginBottom: 6,
                  fontSize: mobile ? 11 : 13,
                  color: "#ccc",
                }}
              >
                <span style={{ color: "#f88", fontWeight: "bold" }}>#{_i + 1}</span>
                {" "}
                <span style={{ color: "#fa0" }}>{_s.cause}倒れた</span>
                <br />
                <span style={{ color: "#aaa" }}>
                  Lv.{_s.level} | B{_s.depth}F | {_s.turns}ターン | G:{_s.gold}
                </span>
                <span style={{ color: "#555", marginLeft: 8 }}>{_s.date}</span>
              </div>
            ));
          })()}
          <button
            onClick={() => setShowScores(false)}
            style={{
              marginTop: 16,
              padding: "8px 24px",
              background: "#181828",
              color: "#8cf",
              border: "1px solid #8cf",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 14,
              borderRadius: 6,
            }}
          >
            閉じる
          </button>
        </div>
      )}
      {(!mobile || landscape) && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: mobile ? 140 : 220,
            background: "#080810",
            borderLeft: "1px solid #1a1a2a",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 4px",
            boxSizing: "border-box",
            zIndex: 10,
          }}
        >
          <div
            style={{
              flex: 1,
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {portraitSrc ? (
              <img
                src={portraitSrc}
                alt="portrait"
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  imageRendering: "pixelated",
                }}
              />
            ) : (
              <div
                style={{
                  color: "#333",
                  fontSize: mobile ? 40 : 60,
                  textAlign: "center",
                  lineHeight: "1",
                }}
              >
                🧙
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              width: "100%",
            }}
          >
            <label
              style={{
                display: "block",
                textAlign: "center",
                cursor: "pointer",
              }}
            >
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files[0]) loadPortrait(e.target.files[0]);
                  e.target.value = "";
                }}
              />
              <span
                style={{
                  background: "#1a1a2a",
                  border: "1px solid #333",
                  borderRadius: 3,
                  padding: "2px 6px",
                  fontSize: 10,
                  color: "#888",
                  display: "block",
                  textAlign: "center",
                }}
              >
                🖼 変更
              </span>
            </label>
            {portraitSrc && (
              <button
                onClick={clearPortrait}
                style={{
                  background: "none",
                  border: "1px solid #333",
                  color: "#555",
                  fontSize: 10,
                  borderRadius: 3,
                  cursor: "pointer",
                  padding: "2px 0",
                  width: "100%",
                }}
              >
                ✕ 消去
              </button>
            )}
            <button
              onClick={() => setShowScores(true)}
              style={{
                background: "#0d0d1a",
                border: "1px solid #336",
                color: "#8cf",
                fontSize: 10,
                borderRadius: 3,
                cursor: "pointer",
                padding: "3px 0",
                width: "100%",
                marginTop: 2,
              }}
            >
              📜 冒険記録
            </button>
          </div>
        </div>
      )}
      {showTileEditor && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.92)",
            zIndex: 200,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "10px 6px",
          }}
        >
          <div
            style={{
              background: "#111",
              border: "1px solid #333",
              borderRadius: 8,
              maxWidth: 520,
              width: "100%",
              padding: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span style={{ color: "#0f0", fontSize: 15, fontWeight: "bold" }}>
                🎨 タイル画像設定
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => {
                    Object.keys(TILE_NAMES).forEach((k) => {
                      delete customTileImages[parseInt(k)];
                      localStorage.removeItem(`roguelike_tile_${k}`);
                    });
                    setCtLoaded((c) => c + 1);
                  }}
                  style={{
                    padding: "3px 8px",
                    background: "#2a1515",
                    color: "#f44",
                    border: "1px solid #4a2020",
                    borderRadius: 3,
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  全消去
                </button>
                <button
                  onClick={() => setShowTileEditor(false)}
                  style={{
                    background: "none",
                    border: "1px solid #444",
                    color: "#888",
                    cursor: "pointer",
                    borderRadius: 4,
                    padding: "2px 8px",
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
            <div style={{ color: "#666", fontSize: 11, marginBottom: 10 }}>
              各タイルに好きな画像（PNG/JPG/GIF等）を設定できます。設定はブラウザに保存されます。
            </div>
            {Object.entries(TILE_NAMES).map(([idx, name]) => {
              const ii = parseInt(idx);
              const hasCust = !!customTileImages[ii];
              const fb = {
                0: { bg: "#1a1a22", fg: "#3a3a4a", ch: "#" },
                1: { bg: "#0c0c14", fg: "#252530", ch: "." },
                2: { bg: "#0c0c14", fg: "#0ff", ch: ">" },
                3: { bg: "#0c0c14", fg: "#0f0", ch: "<" },
                4: { bg: "#080810", fg: "#1a1a22", ch: ":" },
                5: { bg: null, fg: "#ffe030", ch: "@" },
                6: { bg: null, fg: "#c08050", ch: "r" },
                7: { bg: null, fg: "#70a050", ch: "k" },
                8: { bg: null, fg: "#40a070", ch: "g" },
                9: { bg: null, fg: "#c0c0b0", ch: "s" },
                10: { bg: null, fg: "#60a050", ch: "z" },
                11: { bg: null, fg: "#90a040", ch: "O" },
                12: { bg: null, fg: "#40b040", ch: "~" },
                13: { bg: null, fg: "#806030", ch: "T" },
                14: { bg: null, fg: "#f04020", ch: "D" },
                15: { bg: null, fg: "#9040d0", ch: "V" },
                16: { bg: null, fg: "#f050e0", ch: "!" },
                17: { bg: null, fg: "#f090f0", ch: "!" },
                18: { bg: null, fg: "#f0f050", ch: "?" },
                19: { bg: null, fg: "#50c050", ch: "%" },
                20: { bg: null, fg: "#a0a0a0", ch: "/" },
                21: { bg: null, fg: "#5090c0", ch: "[" },
                22: { bg: null, fg: "#f0d000", ch: "$" },
                23: { bg: null, fg: "#d0a050", ch: "|" },
                24: { bg: null, fg: "#a050f0", ch: "\\" },
                25: { bg: null, fg: "#f03030", ch: "^" },
                26: { bg: null, fg: "#f08030", ch: "^" },
                27: { bg: null, fg: "#804040", ch: "^" },
                28: { bg: null, fg: "#909090", ch: "^" },
                29: { bg: null, fg: "#4080f0", ch: "^" },
                30: { bg: null, fg: "#80f040", ch: "^" },
                31: { bg: "#1a3a5a", fg: "#4af", ch: "♨" },
                32: { bg: "#3a2a1a", fg: "#7a5a2a", ch: "壺" },
              }[ii];
              return (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 5,
                    padding: "4px 6px",
                    background: "#151520",
                    borderRadius: 4,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      flexShrink: 0,
                      background: fb?.bg || "#0c0c14",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "monospace",
                      fontSize: 18,
                      color: fb?.fg || "#555",
                      overflow: "hidden",
                      borderRadius: 2,
                    }}
                  >
                    {hasCust ? (
                      <img
                        src={customTileImages[ii].src}
                        style={{
                          width: 32,
                          height: 32,
                          imageRendering: "pixelated",
                        }}
                      />
                    ) : (
                      fb?.ch || "?"
                    )}
                  </div>
                  <span
                    style={{
                      color: "#aaa",
                      fontSize: 11,
                      flex: 1,
                      lineHeight: 1.4,
                    }}
                  >
                    {name}
                    <br />
                    <span style={{ color: "#444" }}>#{idx}</span>
                  </span>
                  <label style={{ cursor: "pointer" }}>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        if (e.target.files[0])
                          loadCustomTile(ii, e.target.files[0]);
                      }}
                    />
                    <span
                      style={{
                        padding: "3px 8px",
                        background: hasCust ? "#1a2a3a" : "#1a2a1a",
                        color: hasCust ? "#4af" : "#0c0",
                        border: `1px solid ${hasCust ? "#2a4a6a" : "#2a4a2a"}`,
                        borderRadius: 3,
                        fontSize: 11,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {hasCust ? "変更" : "選択"}
                    </span>
                  </label>
                  {hasCust && (
                    <button
                      onClick={() => clearCustomTile(ii)}
                      style={{
                        padding: "3px 8px",
                        background: "#2a1515",
                        color: "#f44",
                        border: "1px solid #4a2020",
                        borderRadius: 3,
                        fontSize: 11,
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      消去
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
