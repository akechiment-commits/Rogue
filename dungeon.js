import { rng, pick, uid, clamp, MW, MH, T, TI, getShops, isNarrowPassage, shuffle } from './utils.js';
import { MONS, MON_LEVELS, BOSSES, INTERMEDIATE_BOSSES, makeMonster, makeMonsterFromBase, pickMonsterDef, monLevelUp } from './monsters.js';
import {
  ITEMS, POTS, TRAPS, BB_TYPES, WANDS, WEAPON_ABILITIES, ARMOR_ABILITIES,
  SPELLBOOKS, MAGIC_MARKER, ARROW_T, genFood, makePot, randPotCapacity, itemPrice, pickLootFromPool, pickTrap, RINGS,
  GEM_TYPES, RAW_FOODS, COOKED_FOODS, penInitialCharges, markItemIdentifiedForDungeon,
} from './items.js';
import { scatterFloorGimmicks } from './fixtures.js';
import { pushPlayerTeleportAnim } from './animEvents.js';
import { monSubmergesProjectiles } from './monTraits.js';

function mkOcc(...lists) {
  return (x, y) => lists.some(l => l.some(e => e.x === x && e.y === y));
}

function makeRing(context = "floor") {
  const t = pickLootFromPool(RINGS, context);
  const ring = { ...t, id: uid() };
  if (ring.effect === "power_ring" || ring.effect === "defense_ring" || ring.effect === "life_ring") ring.plus = rng(1, 3);
  const roll = Math.random();
  if (roll < 0.10) ring.blessed = true;
  else if (roll < 0.25) ring.cursed = true;
  return ring;
}

/** 生成時の祝福・呪い抽選。壺だけは祝呪フラグではなく容量へ変換する。 */
export function applyGeneratedBlessCurse(item, blessedThreshold, cursedThreshold, randomFn = Math.random) {
  if (!item || item.type === "gold" || item.type === "arrow") return item;
  const roll = randomFn();
  if (item.type === "pot") {
    delete item.blessed;
    delete item.cursed;
    if (roll < blessedThreshold) item.capacity = (item.capacity ?? 0) + 1;
    else if (roll < cursedThreshold) item.capacity = Math.max(0, (item.capacity ?? 0) - 1);
    return item;
  }
  if (roll < blessedThreshold) {
    item.blessed = true;
    item.cursed = false;
  } else if (roll < cursedThreshold) {
    item.cursed = true;
    item.blessed = false;
  }
  return item;
}

function pickBB(exclude = []) {
  /* レア大箱は20%の確率でのみ候補に含まれる */
  const base = Math.random() < 0.20 ? BB_TYPES : BB_TYPES.filter(b => !b.rare);
  const pool = exclude.length ? base.filter(b => !exclude.includes(b.kind)) : base;
  return pickLootFromPool(pool.length > 0 ? pool : base, "floor");
}

/* ===== BIG ROOM DUNGEON GENERATOR ===== */
function genBigRoom(depth, dungeonType = null) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
  const rw = MW - 4, rh = MH - 4;
  const rx = 2, ry = 2;
  for (let dy = 0; dy < rh; dy++)
    for (let dx = 0; dx < rw; dx++) map[ry + dy][rx + dx] = T.FLOOR;
  const room = { x: rx, y: ry, w: rw, h: rh, cx: Math.floor(rx + rw / 2), cy: Math.floor(ry + rh / 2) };
  const rooms = [room];
  /* 階段：左半分にSU、右半分にSD（ランダム位置） */
  let su = null, sd = null;
  for (let a = 0; a < 200 && !su; a++) { const x = rng(rx+1, rx+Math.floor(rw/2)-1), y = rng(ry+1, ry+rh-2); if (map[y][x]===T.FLOOR) su={x,y}; }
  if (!su) su = { x: rx + 1, y: ry + 1 };
  map[su.y][su.x] = T.SU;
  for (let a = 0; a < 200 && !sd; a++) { const x = rng(rx+Math.floor(rw/2), rx+rw-2), y = rng(ry+1, ry+rh-2); if (map[y][x]===T.FLOOR && !(x===su.x&&y===su.y)) sd={x,y}; }
  if (!sd) sd = { x: rx + rw - 2, y: ry + rh - 2 };
  map[sd.y][sd.x] = T.SD;
  const mons = [];
  const monCount = rng(8, 14) + depth;
  for (let i = 0; i < monCount * 20 && mons.length < monCount; i++) {
    const mx = rng(rx + 1, rx + rw - 2), my = rng(ry + 1, ry + rh - 2);
    if (map[my]?.[mx] !== T.FLOOR) continue;
    if (mx === su.x && my === su.y) continue;
    if (mx === sd.x && my === sd.y) continue;
    if (mons.some((m) => m.x === mx && m.y === my)) continue;
    mons.push(mkMon(depth, mx, my, 0.15, null, null, dungeonType));
  }
  const items = [];
  const occ = mkOcc(items, mons);
  const placeInRoom = (obj) => {
    for (let a = 0; a < 200; a++) {
      const ix = rng(rx + 1, rx + rw - 2), iy = rng(ry + 1, ry + rh - 2);
      if (map[iy][ix] !== T.FLOOR) continue;
      if (ix === su.x && iy === su.y) continue;
      if (ix === sd.x && iy === sd.y) continue;
      if (occ(ix, iy)) continue;
      obj.x = ix; obj.y = iy;
      return true;
    }
    return false;
  };
  const _bgPick = buildUniPool(depth, dungeonType);
  for (let i = 0; i < rng(18, 28); i++) {
    const it = applyStdMods(_bgPick(), depth);
    it.x = 0; it.y = 0;
    if (placeInRoom(it)) items.push(it);
  }
  const traps = [];
  const trapOcc = (x, y) => traps.some((t) => t.x === x && t.y === y) || occ(x, y);
  for (let i = 0; i < rng(10, 20) + depth * 2; i++) {
    for (let a = 0; a < 100; a++) {
      const tx = rng(rx + 1, rx + rw - 2), ty = rng(ry + 1, ry + rh - 2);
      if (map[ty][tx] !== T.FLOOR) continue;
      if (tx === su.x && ty === su.y) continue;
      if (tx === sd.x && ty === sd.y) continue;
      if (trapOcc(tx, ty)) continue;
      const t = pickTrap();
      traps.push({ ...t, id: uid(), x: tx, y: ty, revealed: false });
      break;
    }
  }
  const springs = [];
  for (let i = 0; i < rng(2, 4); i++) {
    for (let a = 0; a < 100; a++) {
      const sx = rng(rx + 1, rx + rw - 2), sy = rng(ry + 1, ry + rh - 2);
      if (map[sy][sx] !== T.FLOOR) continue;
      if (occ(sx, sy) || traps.some(t => t.x === sx && t.y === sy) || springs.some(s => s.x === sx && s.y === sy)) continue;
      springs.push({ id: uid(), x: sx, y: sy, tile: TI.SPRING, contents: [] });
      break;
    }
  }
  const bigboxes = [];
  for (let bi = 0; bi < rng(3, 6); bi++) {
    for (let a = 0; a < 100; a++) {
      const bx = rng(rx + 1, rx + rw - 2), by = rng(ry + 1, ry + rh - 2);
      if (map[by][bx] !== T.FLOOR) continue;
      if (occ(bx, by) || traps.some(t => t.x === bx && t.y === by) || springs.some(s => s.x === bx && s.y === by) || bigboxes.some(b => b.x === bx && b.y === by)) continue;
      const bbt = pickBB();
      bigboxes.push({ id: uid(), x: bx, y: by, tile: TI.BIGBOX, kind: bbt.kind, name: bbt.name, capacity: bbt.cap(), contents: [] });
      break;
    }
  }
  const vis = Array.from({ length: MH }, () => Array(MW).fill(false));
  const exp = Array.from({ length: MH }, () => Array(MW).fill(false));
  let _bgMHRoom = null;
  if (Math.random() < 0.15) {
    genMonsterHouseContent(rooms[0], depth, map, mons, items, traps, springs, bigboxes, su, sd, dungeonType);
    _bgMHRoom = rooms[0];
  }
  return { map, rooms, monsters: mons, items, traps, springs, bigboxes, stairUp: su, stairDown: sd,
    visible: vis, explored: exp, shop: null, pentacles: [], waterItems: [], isBigRoom: true, floorType: "bigRoom", monsterHouseRoom: _bgMHRoom };
}

/* ===== MONSTER HOUSE CONTENT GENERATOR ===== */
/**
 * @param {{ levelBoost?: number, awake?: boolean, avoid?: {x:number,y:number}[], statues?: {x:number,y:number}[] }} [opts]
 *   levelBoost: 生成後 monLevelUp を何回かけるか（強モンスターハウス）
 *   awake: true なら dormantHouse にせず即認識（部屋内で巻物を読んだとき）
 *   avoid: 配置を避ける座標（プレイヤー足元など）
 *   statues: 石像配列（重なり禁止用）
 */
function genMonsterHouseContent(room, depth, map, mons, items, traps, springs, bigboxes, su, sd, dungeonType = null, opts = {}) {
  const levelBoost = opts.levelBoost || 0;
  const awake = !!opts.awake;
  const avoid = opts.avoid || [];
  const statues = opts.statues || [];
  const isAvoid = (x, y) => avoid.some((a) => a.x === x && a.y === y);
  /* 罠・アイテム・大箱・泉・石像・階段・avoid はすべて重ならない */
  const fixtureOcc = (x, y) =>
    isAvoid(x, y) ||
    (x === su.x && y === su.y) ||
    (x === sd.x && y === sd.y) ||
    items.some((i) => i.x === x && i.y === y) ||
    traps.some((t) => t.x === x && t.y === y) ||
    bigboxes.some((b) => b.x === x && b.y === y) ||
    springs.some((s) => s.x === x && s.y === y) ||
    statues.some((s) => s.x === x && s.y === y);
  const monOcc = (x, y) => mons.some((m) => m.x === x && m.y === y);
  const allOcc = (x, y) => monOcc(x, y) || fixtureOcc(x, y);

  /* 既存モンスターは残す。空きマスに新規を追加（既存マスには重ねない） */
  const roomFloorTiles = [];
  for (let fy = room.y; fy < room.y + room.h; fy++)
    for (let fx = room.x; fx < room.x + room.w; fx++)
      if (map[fy]?.[fx] === T.FLOOR && !fixtureOcc(fx, fy) && !monOcc(fx, fy))
        roomFloorTiles.push([fx, fy]);
  /* Fisher-Yatesシャッフル */
  for (let i = roomFloorTiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roomFloorTiles[i], roomFloorTiles[j]] = [roomFloorTiles[j], roomFloorTiles[i]];
  }
  /* モンスターハウス：空きが十分なら最低8・最大25、足りなければ空き全部 */
  const monPlace = roomFloorTiles.length >= 8
    ? Math.min(25, Math.max(8, Math.floor(roomFloorTiles.length * 0.65)))
    : roomFloorTiles.length;
  const spawned = [];
  for (let i = 0; i < monPlace; i++) {
    const [mx, my] = roomFloorTiles[i];
    const _mh = mkMon(depth, mx, my, 0, map, springs, dungeonType);
    if (awake) {
      _mh.dormantHouse = false;
      _mh.aware = true;
      _mh._justWoke = true;
    } else {
      _mh.dormantHouse = true;
    }
    mons.push(_mh);
    spawned.push(_mh);
  }
  if (levelBoost > 0) {
    const _silent = [];
    for (const _m of spawned) {
      for (let b = 0; b < levelBoost; b++) monLevelUp(_m, { monsters: mons }, _silent);
    }
  }
  /* アイテムと罠：モンスター配置後の空き（既存フィクスチャも除外） */
  const freeTiles = [];
  for (let fy2 = room.y; fy2 < room.y + room.h; fy2++)
    for (let fx2 = room.x; fx2 < room.x + room.w; fx2++)
      if (map[fy2]?.[fx2] === T.FLOOR && !allOcc(fx2, fy2))
        freeTiles.push([fx2, fy2]);
  for (let i = freeTiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [freeTiles[i], freeTiles[j]] = [freeTiles[j], freeTiles[i]];
  }
  const _half = Math.floor(freeTiles.length / 2);
  const itemSlots = freeTiles.slice(0, Math.min(rng(5, 9), _half));
  const trapSlots = freeTiles.slice(itemSlots.length, itemSlots.length + Math.min(rng(5, 9), freeTiles.length - itemSlots.length));
  for (const [ix, iy] of itemSlots) {
    if (allOcc(ix, iy)) continue;
    const t = pickLootFromPool(ITEMS);
    const it = applyInitialItemCharges({ ...t, id: uid(), x: ix, y: iy });
    if (it.type === "gold") it.value = rng(50, 150 + depth * 40);
    applyGeneratedBlessCurse(it, 0.12, 0.28);
    items.push(it);
  }
  for (const [tx, ty] of trapSlots) {
    if (allOcc(tx, ty)) continue;
    const t = pickTrap();
    traps.push({ ...t, id: uid(), x: tx, y: ty, revealed: false });
  }
  /* 高確率で大箱・泉を追加 */
  for (let bi = 0; bi < rng(2, 4); bi++) {
    for (let a = 0; a < 80; a++) {
      const bx = rng(room.x + 1, room.x + room.w - 2);
      const by = rng(room.y + 1, room.y + room.h - 2);
      if (map[by]?.[bx] !== T.FLOOR) continue;
      if (allOcc(bx, by)) continue;
      const bbt = pickBB();
      bigboxes.push({ id: uid(), x: bx, y: by, tile: TI.BIGBOX, kind: bbt.kind, name: bbt.name, capacity: bbt.cap(), contents: [] });
      break;
    }
  }
  for (let si = 0; si < rng(1, 3); si++) {
    for (let a = 0; a < 80; a++) {
      const sx = rng(room.x + 1, room.x + room.w - 2);
      const sy = rng(room.y + 1, room.y + room.h - 2);
      if (map[sy]?.[sx] !== T.FLOOR) continue;
      if (allOcc(sx, sy)) continue;
      springs.push({ id: uid(), x: sx, y: sy, tile: TI.SPRING, contents: [] });
      break;
    }
  }
}

/* ===== TRIGGER MONSTER HOUSE ===== */
export function triggerMonsterHouse(dg, p, ml) {
  if (!dg.monsterHouseRoom) return;
  const r = dg.monsterHouseRoom;
  /* プレイヤーが部屋内に入ったときのみ発動 */
  if (p.x < r.x || p.x >= r.x + r.w || p.y < r.y || p.y >= r.y + r.h) return;
  const sleeping = dg.monsters.filter(m => m.dormantHouse);
  if (sleeping.length === 0) {
    dg.monsterHouseRoom = null;
    return;
  }
  sleeping.forEach(m => { m.dormantHouse = false; m.aware = true; m._justWoke = true; });
  ml.push(`モンスターハウスだ！敵が一斉に目覚めた！(${sleeping.length}体)`);
  dg.monsterSenseActive = true; /* このフロアの全モンスター位置が見えるようになる */
  dg.monsterHouseRoom = null;
}

/** 店部屋かどうか（モンスターハウス対象外） */
function isShopRoom(dg, room) {
  if (!room) return false;
  return getShops(dg).some((s) =>
    s.room && s.room.x === room.x && s.room.y === room.y && s.room.w === room.w && s.room.h === room.h
  );
}

/** モンスターハウス化できる部屋一覧（店を除く） */
function getMonsterHouseCandidateRooms(dg) {
  const rooms = dg.rooms || [];
  const nonShop = rooms.filter((r) => !isShopRoom(dg, r));
  return nonShop.length > 0 ? nonShop : rooms;
}

/**
 * 部屋をモンスターハウス化する（モンスターの巻物用）。
 * @param {{ strong?: boolean, playerInRoom?: boolean }} opts
 *   strong: 敵を1レベル上げて配置（祝福）
 *   playerInRoom: プレイヤーがその部屋にいる（即覚醒）
 */
export function applyMonsterHouseToRoom(dg, room, p, ml, opts = {}) {
  if (!dg || !room) return false;
  const strong = !!opts.strong;
  const playerInRoom = !!opts.playerInRoom;
  if (!dg.monsters) dg.monsters = [];
  if (!dg.items) dg.items = [];
  if (!dg.traps) dg.traps = [];
  if (!dg.springs) dg.springs = [];
  if (!dg.bigboxes) dg.bigboxes = [];
  if (!dg.statues) dg.statues = [];
  const depth = Math.max(0, (p?.depth || 1) - 1);
  const su = dg.stairUp || { x: -99, y: -99 };
  const sd = dg.stairDown || { x: -99, y: -99 };
  const avoid = playerInRoom && p ? [{ x: p.x, y: p.y }] : [];
  genMonsterHouseContent(
    room, depth, dg.map, dg.monsters, dg.items, dg.traps, dg.springs, dg.bigboxes,
    su, sd, dg.dungeonType || null,
    { levelBoost: strong ? 1 : 0, awake: playerInRoom, avoid, statues: dg.statues },
  );
  if (playerInRoom) {
    ml.push(strong
      ? "強モンスターハウスだ！強力な敵が一斉に現れた！"
      : "モンスターハウスだ！敵が一斉に現れた！");
    dg.monsterSenseActive = true;
    dg.monsterHouseRoom = null;
  } else {
    dg.monsterHouseRoom = room;
    ml.push(strong
      ? "どこかの部屋が強モンスターハウスになった気配がする..."
      : "どこかの部屋がモンスターハウスになった気配がする...");
  }
  return true;
}

/**
 * モンスターの巻物の効果を実行。
 * 通常/祝福: 部屋をモンスターハウス化（廊下・店では別部屋へテレポートしてから）
 * 呪い: 同部屋の敵を別部屋へ飛ばす
 */
export function applyMonsterScroll(dg, p, ml, { blessed = false, cursed = false } = {}) {
  if (!dg || !p) return;
  const _tpBlocked = dg.pentacles?.some((pc) => pc.kind === "teleport_trap" && pc.cursed);

  if (cursed) {
    const _sumRoom = findRoomLocal(dg, p.x, p.y);
    const _inRoom = _sumRoom
      ? dg.monsters.filter((m) =>
          m.type !== "shopkeeper" && m.type !== "guard" &&
          m.x >= _sumRoom.x && m.x < _sumRoom.x + _sumRoom.w &&
          m.y >= _sumRoom.y && m.y < _sumRoom.y + _sumRoom.h)
      : [];
    if (_tpBlocked) {
      ml.push("呪われたテレポートの魔方陣に阻まれて効果が無効化された！【呪】");
      return;
    }
    if (!_sumRoom || _inRoom.length === 0) {
      ml.push("部屋に飛ばせる敵がいなかった。【呪】");
      return;
    }
    const _otherRooms = (dg.rooms || []).filter((r) => r !== _sumRoom);
    let _teleportedCount = 0;
    for (const _sm of _inRoom) {
      if (monSubmergesProjectiles(_sm)) {
        ml.push(`${_sm.name}が潜って召喚の呪いをかわした！`);
        continue;
      }
      if (_sm.magicImmune && !_sm.sealed) { ml.push(`魔法は${_sm.name}に効かない！`); continue; }
      const _tr = pick(_otherRooms);
      if (!_tr) continue;
      for (let _att = 0; _att < 30; _att++) {
        const _tx = rng(_tr.x, _tr.x + _tr.w - 1);
        const _ty = rng(_tr.y, _tr.y + _tr.h - 1);
        if (dg.map[_ty]?.[_tx] !== T.FLOOR) continue;
        if (dg.monsters.some((m) => m.x === _tx && m.y === _ty)) continue;
        if (_tx === p.x && _ty === p.y) continue;
        _sm.x = _tx; _sm.y = _ty; _sm.aware = false;
        _teleportedCount++;
        break;
      }
    }
    if (_teleportedCount > 0) ml.push(`${_teleportedCount}体の敵が別の部屋へ飛んだ！【呪】`);
    else ml.push("敵はどこへも飛ばなかった。【呪】");
    return;
  }

  /* 通常・祝福 */
  const cands = getMonsterHouseCandidateRooms(dg);
  if (cands.length === 0) {
    ml.push("モンスターハウスにできる部屋がない。");
    return;
  }
  let room = findRoomLocal(dg, p.x, p.y);
  const inUsableRoom = room && cands.includes(room);

  if (!inUsableRoom) {
    /* 廊下・店など：どこかの部屋へテレポートしてからハウス化 */
    const dest = pick(cands);
    let teleported = false;
    if (!_tpBlocked) {
      for (let a = 0; a < 40; a++) {
        const tx = rng(dest.x, dest.x + dest.w - 1);
        const ty = rng(dest.y, dest.y + dest.h - 1);
        if (dg.map[ty]?.[tx] !== T.FLOOR) continue;
        if (dg.monsters.some((m) => m.x === tx && m.y === ty)) continue;
        const _tpFromX = p.x, _tpFromY = p.y;
        p.x = tx; p.y = ty;
        pushPlayerTeleportAnim(_tpFromX, _tpFromY, p.x, p.y);
        if ((p.immobileTurns || 0) > 0) { p.immobileTurns = 0; ml.push("テレポートして移動封じが解けた！"); }
        ml.push("巻物の力で別の部屋へテレポートした！");
        teleported = true;
        room = dest;
        break;
      }
    } else {
      ml.push("呪われたテレポートの魔方陣に阻まれてテレポートできない！");
    }
    if (teleported) {
      applyMonsterHouseToRoom(dg, room, p, ml, { strong: blessed, playerInRoom: true });
    } else {
      /* ワープせず、どこかの部屋をハウス化（プレイヤー未入室 → 休眠配置） */
      applyMonsterHouseToRoom(dg, dest, p, ml, { strong: blessed, playerInRoom: false });
    }
    return;
  }

  applyMonsterHouseToRoom(dg, room, p, ml, { strong: blessed, playerInRoom: true });
}

/** dungeon.js 内用（monsters.findRoom と同等） */
function findRoomLocal(dg, x, y) {
  return (dg.rooms || []).find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) || null;
}

/* ===== HIDDEN ROOM GENERATOR ===== */
function genHiddenRooms(map, depth) {
  const hiddenRooms = [];
  const count = rng(0, 2);
  for (let attempt = 0; attempt < count * 60 && hiddenRooms.length < count; attempt++) {
    const rw = rng(3, 5), rh = rng(3, 4);
    const rx = rng(2, MW - rw - 2);
    const ry = rng(2, MH - rh - 2);
    /* 既存の床タイルから2マス離れていること（通常部屋・廊下と確実に分離） */
    let ok = true;
    for (let dy = -2; dy <= rh + 1 && ok; dy++)
      for (let dx = -2; dx <= rw + 1 && ok; dx++) {
        const nx = rx + dx, ny = ry + dy;
        if (nx < 0 || nx >= MW || ny < 0 || ny >= MH) { ok = false; break; }
        if (map[ny][nx] !== T.WALL) { ok = false; break; }
      }
    if (!ok) continue;
    for (let dy = 0; dy < rh; dy++)
      for (let dx = 0; dx < rw; dx++) map[ry + dy][rx + dx] = T.FLOOR;
    hiddenRooms.push({ x: rx, y: ry, w: rw, h: rh, cx: Math.floor(rx + rw / 2), cy: Math.floor(ry + rh / 2), hidden: true });
  }
  return hiddenRooms;
}

/* ── 隠し部屋・浮島用：B/A/Sレアリティ限定アイテム生成 ── */
function pickRareItem(depth) {
  const _rPool = ITEMS.filter(i => i.rarity === "C" || i.rarity === "B" || i.rarity === "A" || i.rarity === "S");
  const gens = [
    { w: 6, fn: () => { const t = pickLootFromPool(_rPool.filter(i => i.type === "potion")); return { ...t, id: uid() }; } },
    { w: 5, fn: () => { const t = pickLootFromPool(_rPool.filter(i => i.type === "scroll")); return { ...t, id: uid() }; } },
    { w: 5, fn: () => { const t = pickLootFromPool(WANDS); return { ...t, id: uid(), charges: (t.effect === "wish" || t.noChargeBoost || t.effect === "curse_wand" || t.effect === "bless_wand") ? 1 : t.charges + rng(0, 2) }; } },
    { w: 4, fn: () => { const t = pickLootFromPool(_rPool.filter(i => i.type === "weapon")); return { ...t, id: uid() }; } },
    { w: 3, fn: () => { const t = pickLootFromPool(_rPool.filter(i => i.type === "armor")); return { ...t, id: uid() }; } },
    { w: 3, fn: () => { const t = pickLootFromPool(SPELLBOOKS); return { ...t, id: uid() }; } },
    { w: 3, fn: () => makeRing() },
    { w: 2, fn: () => makePot() },
    { w: 6, fn: () => ({ name:"金貨", type:"gold", value: rng(200, 500+depth*50), tile:22, id: uid() }) },
  ];
  const _rt = gens.reduce((s, g) => s + g.w, 0);
  let r = Math.random() * _rt;
  for (const g of gens) { r -= g.w; if (r <= 0) return g.fn(); }
  return gens[gens.length - 1].fn();
}
function applyInitialItemCharges(it) {
  if (it?.type === "pen") it.charges = penInitialCharges(it);
  return it;
}
function applyRareMods(it, depth) {
  applyGeneratedBlessCurse(it, 0.30, 0.40);
  if (it.type === "weapon" || it.type === "armor") {
    const pr = Math.random();
    if (pr < 0.15 + depth * 0.02) it.plus = rng(2, 4);
    else if (pr < 0.40 + depth * 0.03) it.plus = 1;
    else it.plus = 0;
    if (!it.ability && Math.random() < 0.35)
      it.ability = pick(it.type === "weapon" ? WEAPON_ABILITIES : ARMOR_ABILITIES).id;
    if (it.ability === "pickaxe" && it.durability == null) it.durability = rng(15, 45);
  }
  return it;
}

/* ── 特殊フロア用：統合アイテムプール生成 ── */
function buildUniPool(depth, dungeonType) {
  const iPool = dungeonType === "beginner"
    ? ITEMS.filter(i => i.type !== "pen" && !(i.type === "scroll" && i.effect === "identify"))
    : ITEMS.filter(i => i.type !== "pen");
  const sbPool = dungeonType === "beginner"
    ? SPELLBOOKS.filter(sb => sb.spell !== "identify_magic")
    : SPELLBOOKS;
  const _pens = ITEMS.filter(i => i.type === "pen");
  const gens = [
    { w: 10, fn: () => ({ ...genFood(), id: uid() }) },
    { w: 10, fn: () => { const t = pickLootFromPool(iPool.filter(i => i.type === "potion")); return { ...t, id: uid() }; } },
    { w:  8, fn: () => { const t = pickLootFromPool(iPool.filter(i => i.type === "scroll")); return { ...t, id: uid() }; } },
    { w:  8, fn: () => { const t = pickLootFromPool(WANDS); return { ...t, id: uid(), charges: (t.effect==="curse_wand"||t.effect==="bless_wand"||t.effect==="wish"||t.noChargeBoost) ? 1 : t.charges+rng(-1,2) }; } },
    { w:  6, fn: () => { const t = pickLootFromPool(iPool.filter(i => i.type === "weapon")); return { ...t, id: uid() }; } },
    { w:  5, fn: () => { const t = pickLootFromPool(iPool.filter(i => i.type === "armor")); return { ...t, id: uid() }; } },
    { w:  6, fn: () => ({ ...ARROW_T, id: uid(), count: rng(3, 15) }) },
    { w: 14, fn: () => ({ name:"金貨", type:"gold", value: rng(30, 100+depth*30), tile:22, id: uid() }) },
    { w:  4, fn: () => { const t = pickLootFromPool(sbPool); return { ...t, id: uid() }; } },
    { w:  4, fn: () => makePot() },
    { w:  2, fn: () => makeRing() },
    { w:  2, fn: () => { if (!_pens.length) return { ...genFood(), id: uid() }; const t = pick(_pens); return { ...t, id: uid(), charges: penInitialCharges(t) }; } },
    { w:  1, fn: () => ({ ...MAGIC_MARKER, id: uid(), charges: rng(1, 2) }) },
  ];
  const _ut = gens.reduce((s, g) => s + g.w, 0);
  return () => { let r = Math.random() * _ut; for (const g of gens) { r -= g.w; if (r <= 0) return g.fn(); } return gens[gens.length-1].fn(); };
}
function applyStdMods(it, depth) {
  applyInitialItemCharges(it);
  applyGeneratedBlessCurse(it, 0.10, 0.25);
  if (it.type === "weapon" || it.type === "armor") {
    const pr = Math.random();
    if (pr < 0.05 + depth * 0.01) it.plus = rng(2, 3);
    else if (pr < 0.20 + depth * 0.02) it.plus = 1;
    else it.plus = 0;
    if (!it.ability && Math.random() < 0.25)
      it.ability = pick(it.type === "weapon" ? WEAPON_ABILITIES : ARMOR_ABILITIES).id;
    if (it.ability === "pickaxe" && it.durability == null) it.durability = rng(15, 45);
  }
  return it;
}

export function populateHiddenRoom(hr, map, depth, items, bigboxes, springs, traps) {
  const allOcc = (x, y) =>
    items.some(i => i.x === x && i.y === y) ||
    bigboxes.some(b => b.x === x && b.y === y) ||
    springs.some(s => s.x === x && s.y === y) ||
    traps.some(t => t.x === x && t.y === y);
  const floorTiles = [];
  for (let dy = 0; dy < hr.h; dy++)
    for (let dx = 0; dx < hr.w; dx++) {
      const fx = hr.x + dx, fy = hr.y + dy;
      if (map[fy][fx] === T.FLOOR) floorTiles.push([fx, fy]);
    }
  if (floorTiles.length === 0) return;
  /* 20% の確率で宝物庫（金貨びっしり）になる */
  if (Math.random() < 0.20) {
    hr.isTreasureVault = true;
    const shuffled = shuffle([...floorTiles]);
    const goldCount = Math.min(shuffled.length, rng(5, 10));
    let gPlaced = 0;
    for (const [ix, iy] of shuffled) {
      if (gPlaced >= goldCount) break;
      if (allOcc(ix, iy)) continue;
      items.push({ name:"金貨", type:"gold", value: rng(150, 500 + depth * 80), tile:22, id: uid(), x: ix, y: iy });
      gPlaced++;
    }
    if (Math.random() < 0.70) {
      for (let a = 0; a < 40; a++) {
        const [bx, by] = pick(floorTiles);
        if (allOcc(bx, by)) continue;
        const bbt = pickBB();
        bigboxes.push({ id: uid(), x: bx, y: by, tile: TI.BIGBOX, kind: bbt.kind, name: bbt.name, capacity: bbt.cap(), contents: [] });
        break;
      }
    }
  } else {
  /* アイテム 2〜4個（B/A/Sレアリティ限定、祝福30%呪い10%） */
  const itemCount = rng(2, Math.min(4, floorTiles.length));
  let placed = 0;
  for (let i = 0; i < itemCount * 30 && placed < itemCount; i++) {
    const [ix, iy] = pick(floorTiles);
    if (allOcc(ix, iy)) continue;
    const it = applyRareMods(pickRareItem(depth), depth);
    it.x = ix; it.y = iy;
    items.push(it);
    placed++;
  }
  /* 収納上手の巻物（30%で追加配置） */
  if (Math.random() < 0.30) {
    const _expSc = ITEMS.find(i => i.effect === "expand_inv");
    if (_expSc) {
      for (let a = 0; a < 40; a++) {
        const [ix, iy] = pick(floorTiles);
        if (allOcc(ix, iy)) continue;
        items.push({ ..._expSc, id: uid(), x: ix, y: iy });
        break;
      }
    }
  }
  /* 大箱 (75%) */
  if (Math.random() < 0.75) {
    for (let a = 0; a < 40; a++) {
      const [bx, by] = pick(floorTiles);
      if (allOcc(bx, by)) continue;
      const bbt = pickBB();
      bigboxes.push({ id: uid(), x: bx, y: by, tile: TI.BIGBOX, kind: bbt.kind, name: bbt.name, capacity: bbt.cap(), contents: [] });
      break;
    }
  }
  /* 泉 (55%) */
  if (Math.random() < 0.55) {
    for (let a = 0; a < 40; a++) {
      const [sx, sy] = pick(floorTiles);
      if (allOcc(sx, sy)) continue;
      springs.push({ id: uid(), x: sx, y: sy, tile: TI.SPRING, contents: [] });
      break;
    }
  }
  }
  /* 回転板を必ず1枚配置（宝物庫を含む全隠し部屋） */
  const spinTrap = { name: "回転板", effect: "spin", tile: 29, permanent: true };
  for (const [tx, ty] of shuffle([...floorTiles])) {
    if (allOcc(tx, ty)) continue;
    traps.push({ ...spinTrap, id: uid(), x: tx, y: ty, revealed: false });
    break;
  }
}

/* ===== ROOM PROTRUSION GENERATOR ===== */
/* 部屋の壁から小さな突起（出っ張り）を生成し、怪しい壁タイルの座標セットを返す */
function genProtrusions(map, rooms) {
  const suspicious = new Set(); // "x,y" 形式の怪しい壁座標
  const DIRS = [
    { side: 0, ddx: 0, ddy: -1 }, // top
    { side: 1, ddx: 0, ddy:  1 }, // bottom
    { side: 2, ddx: -1, ddy: 0 }, // left
    { side: 3, ddx:  1, ddy: 0 }, // right
  ];
  for (const room of rooms) {
    if (room.w < 4 || room.h < 4) continue;
    // 部屋前の1マス突起（無意味な廊下っぽい凹凸）を減らす
    // 82% なし、15% 1個、3% 2個（旧: 60%/35%/5%）
    const numP = Math.random() < 0.82 ? 0 : Math.random() < 0.94 ? 1 : 2;
    let placed = 0;
    for (let attempt = 0; attempt < numP * 8 && placed < numP; attempt++) {
      const { side, ddx, ddy } = pick(DIRS);
      const isHoriz = ddy !== 0; // 上下方向に突き出す
      const wallLen = isHoriz ? room.w : room.h;   // 壁の長さ
      if (wallLen < 5) continue; // 狭い壁には付けない
      const pw = rng(2, Math.min(3, wallLen - 2));  // 突起の幅（壁に沿う方向）
      /* 奥行き1（部屋前の無意味な1マス廊下）は稀に。通常は2マスの出っ張り */
      const pd = Math.random() < 0.25 ? 1 : 2;
      const maxOfs = wallLen - pw - 1;
      if (maxOfs < 1) continue;
      const ofs = rng(1, maxOfs);
      // 突起の左上角座標を計算
      let sx, sy;
      if (isHoriz) {
        sx = room.x + ofs;
        sy = side === 0 ? room.y - pd : room.y + room.h;
      } else {
        sx = side === 2 ? room.x - pd : room.x + room.w;
        sy = room.y + ofs;
      }
      const ex = sx + (isHoriz ? pw : pd); // 突起の右端+1
      const ey = sy + (isHoriz ? pd : pw); // 突起の下端+1
      // 境界チェック
      if (sx < 1 || ex > MW - 1 || sy < 1 || ey > MH - 1) continue;
      // 他のルームと重ならないか（1タイルマージン付き）
      const clash = rooms.some(r => r !== room &&
        sx - 1 < r.x + r.w && ex + 1 > r.x &&
        sy - 1 < r.y + r.h && ey + 1 > r.y);
      if (clash) continue;
      // 突起エリアが全部 WALL であること（通路に上書きしない）
      let allWall = true;
      for (let cy = sy; cy < ey && allWall; cy++)
        for (let cx = sx; cx < ex && allWall; cx++)
          if (map[cy][cx] !== T.WALL) allWall = false;
      if (!allWall) continue;
      // 床として開通
      for (let cy = sy; cy < ey; cy++)
        for (let cx = sx; cx < ex; cx++)
          map[cy][cx] = T.FLOOR;
      // 突起周辺の壁を走査して「怪しい壁」を登録
      for (let cy = sy - 1; cy <= ey; cy++) {
        for (let cx = sx - 1; cx <= ex; cx++) {
          if (cy < 0 || cy >= MH || cx < 0 || cx >= MW) continue;
          if (map[cy][cx] !== T.WALL) continue;
          let fa = 0;
          for (const [ddx2, ddy2] of [[-1,0],[1,0],[0,-1],[0,1]])
            if (map[cy + ddy2]?.[cx + ddx2] === T.FLOOR) fa++;
          if (fa >= 2) suspicious.add(`${cx},${cy}`);
        }
      }
      placed++;
    }
  }
  return suspicious;
}

/* ===== WALL-EMBEDDED ITEM GENERATOR ===== */
function genWallItems(map, depth, items, suspicious = new Set(), chance = 0.70) {
  /* 床タイルに2方向以上隣接する壁タイルを候補とする（L字型の出っ張り角など） */
  /* 突起コーナー（suspicious）は重みを高くして選ばれやすくする */
  const wallCands = [];
  for (let y = 1; y < MH - 1; y++) {
    for (let x = 1; x < MW - 1; x++) {
      if (map[y][x] !== T.WALL) continue;
      let floorAdj = 0;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]])
        if (map[y + dy]?.[x + dx] === T.FLOOR) floorAdj++;
      if (floorAdj >= 2) {
        const weight = suspicious.has(`${x},${y}`) ? 5 : 1;
        for (let w = 0; w < weight; w++) wallCands.push([x, y]);
      }
    }
  }
  if (wallCands.length === 0) return;
  /* 壁埋めアイテムは控えめ（旧 2〜5 → 0〜3）。 */
  if (Math.random() >= chance) return;
  const count = rng(1, Math.min(3, wallCands.length));
  if (count <= 0) return;
  const used = new Set();
  let placed = 0;
  for (let i = 0; i < count * 30 && placed < count; i++) {
    const [wx, wy] = pick(wallCands);
    const key = `${wx},${wy}`;
    if (used.has(key) || items.some(it => it.x === wx && it.y === wy)) continue;
    used.add(key);
    /* 壁埋めアイテムは75%の確率で埋蔵金（金貨） */
    let it;
    if (Math.random() < 0.75) {
      it = { name:"金貨", type:"gold", value: rng(80, 300 + depth * 50), tile:22, id: uid(), x: wx, y: wy, wallEmbedded: true };
    } else {
      const t = pickLootFromPool(ITEMS);
      it = applyInitialItemCharges({ ...t, id: uid(), x: wx, y: wy, wallEmbedded: true });
      if (it.type === 'gold') it.value = rng(80, 300 + depth * 50);
    }
    items.push(it);
    placed++;
  }
}

/* ===== SHARED HELPERS FOR SPECIAL FLOORS ===== */
function mkVis() {
  return {
    visible:  Array.from({ length: MH }, () => Array(MW).fill(false)),
    explored: Array.from({ length: MH }, () => Array(MW).fill(false)),
  };
}
function mkMon(depth, x, y, dormantRate = 0.12, map = null, springs = null, dungeonType = null, spawnOpts = {}) {
  const _pickOpts = { excludeItemMimic: !!spawnOpts.excludeItemMimic };
  /* waterOnlyモンスターは水タイル・泉以外には出現しない。非水タイルの場合は通常モンスターを選び直す */
  let base, spawnLevel;
  for (let _mi = 0; _mi < 8; _mi++) {
    ({ base, spawnLevel } = pickMonsterDef(depth, dungeonType, false, _pickOpts));
    if (!base.waterOnly) break;
    const _isWater = map ? (map[y]?.[x] === T.WATER || springs?.some(s => s.x === x && s.y === y)) : false;
    if (_isWater) break;
  }
  /* ループ後も waterOnly が残っていた場合（mapなし等）は非waterOnlyに強制変更 */
  const _finalIsWater = map ? (map[y]?.[x] === T.WATER || springs?.some(s => s.x === x && s.y === y)) : false;
  if (base.waterOnly && !_finalIsWater) {
    ({ base, spawnLevel } = pickMonsterDef(depth, dungeonType, true, _pickOpts));
  }
  const { levels: _lvls, ...mt } = base;
  const st = spawnLevel >= 2 && base.levels?.[spawnLevel - 2]
    ? { ...mt, ...base.levels[spawnLevel - 2], monLevel: spawnLevel }
    : mt;
  return {
    ...st, id: uid(), x, y, maxHp: st.hp, turnAccum: 0, aware: false,
    dir: { x: [-1, 1][rng(0, 1)], y: 0 }, lastPx: 0, lastPy: 0,
    patrolTarget: null, dormant: Math.random() < dormantRate,
  };
}
/* 部屋の外周に接する通路タイル数を数える（=物理的な出入り口の数） */
function countRoomEntrances(room, map) {
  let n = 0;
  for (let xi = room.x - 1; xi <= room.x + room.w; xi++) {
    if (xi < 0 || xi >= MW) continue;
    if (room.y - 1 >= 0 && map[room.y - 1]?.[xi] === T.FLOOR) n++;
    if (room.y + room.h < MH && map[room.y + room.h]?.[xi] === T.FLOOR) n++;
  }
  for (let yi = room.y; yi < room.y + room.h; yi++) {
    if (room.x - 1 >= 0 && map[yi]?.[room.x - 1] === T.FLOOR) n++;
    if (room.x + room.w < MW && map[yi]?.[room.x + room.w] === T.FLOOR) n++;
  }
  return n;
}

/* ===== 通常フロアの変則レイアウト ===== */
/* 特殊フロアではなく、通常の部屋・通路生成にだけ適用する。 */
export function chooseNormalLayout(roll = Math.random()) {
  const r = Number.isFinite(roll) ? Math.max(0, Math.min(0.999999, roll)) : Math.random();
  /* 広い廊下・不規則な出入口の変則型は、通常フロアでは稀に出す。 */
  if (r < 0.02) return "centralCross";
  if (r < 0.04) return "courtyard";
  if (r < 0.10) return "wideRooms";
  return "standard";
}

function carveNormalFloor(map, x, y) {
  if (map[y]?.[x] === T.WALL) map[y][x] = T.FLOOR;
}

function carveNormalHorizontal(map, y, x1, x2, width = 1) {
  const xa = Math.min(x1, x2), xb = Math.max(x1, x2);
  const half = Math.floor((width - 1) / 2);
  for (let x = xa; x <= xb; x++)
    for (let dy = -half; dy < width - half; dy++) carveNormalFloor(map, x, y + dy);
}

function carveNormalVertical(map, x, y1, y2, width = 1) {
  const ya = Math.min(y1, y2), yb = Math.max(y1, y2);
  const half = Math.floor((width - 1) / 2);
  for (let y = ya; y <= yb; y++)
    for (let dx = -half; dx < width - half; dx++) carveNormalFloor(map, x + dx, y);
}

function carveNormalPath(map, x1, y1, x2, y2, width = 1, horizontalFirst = true) {
  if (horizontalFirst) {
    carveNormalHorizontal(map, y1, x1, x2, width);
    carveNormalVertical(map, x2, y1, y2, width);
  } else {
    carveNormalVertical(map, x1, y1, y2, width);
    carveNormalHorizontal(map, y2, x1, x2, width);
  }
}

function carveNormalRect(map, x, y, w, h) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) carveNormalFloor(map, x + dx, y + dy);
}

function applyNormalLayoutVariant(map, rooms, pairs, layout) {
  if (layout === "wideRooms") {
    /* 既存の接続を太くするだけなので、部屋の連結性は変わらない。 */
    for (const [ai, bi] of pairs) {
      if (Math.random() >= 0.82) continue;
      const a = rooms[ai], b = rooms[bi];
      carveNormalPath(map, a.cx, a.cy, b.cx, b.cy, 2, Math.random() < 0.5);
    }
    return;
  }

  const centerX = Math.floor(MW / 2), centerY = Math.floor(MH / 2);
  const roomDistance = (room) => Math.abs(room.cx - centerX) + Math.abs(room.cy - centerY);
  const targets = [...rooms]
    .sort((a, b) => roomDistance(a) - roomDistance(b))
    .slice(0, Math.min(layout === "centralCross" ? 3 : 4, rooms.length));

  if (layout === "centralCross") {
    /* 外周近くまで伸びる太い十字路。中央で進路を選べる。 */
    carveNormalHorizontal(map, centerY, 2, MW - 3, 3);
    carveNormalVertical(map, centerX, 2, MH - 3, 3);
    for (const room of targets)
      carveNormalPath(map, centerX, centerY, room.cx, room.cy, 2, Math.random() < 0.5);
    return;
  }

  if (layout === "courtyard") {
    /* 中央広場＋放射状の太い連絡路。部屋の外に広い歩行空間を作る。 */
    const plazaW = 14, plazaH = 8;
    const plazaX = Math.floor((MW - plazaW) / 2), plazaY = Math.floor((MH - plazaH) / 2);
    carveNormalRect(map, plazaX, plazaY, plazaW, plazaH);
    const plazaCX = plazaX + Math.floor(plazaW / 2), plazaCY = plazaY + Math.floor(plazaH / 2);
    for (const room of targets)
      carveNormalPath(map, plazaCX, plazaCY, room.cx, room.cy, 2, Math.random() < 0.5);
  }
}

/* 部屋をショップにセットアップし、shopDataを返す */
function setupShopRoom(room, map, depth, items, mons) {
  const shopId = uid();
  let entrance = null;
  for (let xi = room.x - 1; xi <= room.x + room.w && !entrance; xi++) {
    if (xi >= 0 && xi < MW && room.y - 1 >= 0 && map[room.y - 1]?.[xi] === T.FLOOR)
      entrance = { x: xi, y: room.y - 1 };
    if (xi >= 0 && xi < MW && room.y + room.h < MH && map[room.y + room.h]?.[xi] === T.FLOOR)
      entrance = { x: xi, y: room.y + room.h };
  }
  for (let yi = room.y; yi < room.y + room.h && !entrance; yi++) {
    if (room.x - 1 >= 0 && map[yi]?.[room.x - 1] === T.FLOOR) entrance = { x: room.x - 1, y: yi };
    if (room.x + room.w < MW && map[yi]?.[room.x + room.w] === T.FLOOR) entrance = { x: room.x + room.w, y: yi };
  }
  if (!entrance) entrance = { x: room.cx, y: room.cy };
  /* 入口の真正面を避けて1マス横にズラした位置を homePos にする */
  const _isFloor = (x, y) => map[y]?.[x] === T.FLOOR;
  const _tryInsidePos = (cx, cy) => _isFloor(cx, cy) ? { x: cx, y: cy } : null;
  let insidePos = null;
  if (entrance.y < room.y) {
    const bx = clamp(entrance.x, room.x, room.x + room.w - 1), by = room.y;
    insidePos = _tryInsidePos(clamp(bx + 1, room.x, room.x + room.w - 1), by)
             || _tryInsidePos(clamp(bx - 1, room.x, room.x + room.w - 1), by)
             || _tryInsidePos(bx, by);
  } else if (entrance.y >= room.y + room.h) {
    const bx = clamp(entrance.x, room.x, room.x + room.w - 1), by = room.y + room.h - 1;
    insidePos = _tryInsidePos(clamp(bx + 1, room.x, room.x + room.w - 1), by)
             || _tryInsidePos(clamp(bx - 1, room.x, room.x + room.w - 1), by)
             || _tryInsidePos(bx, by);
  } else if (entrance.x < room.x) {
    const bx = room.x, by = clamp(entrance.y, room.y, room.y + room.h - 1);
    insidePos = _tryInsidePos(bx, clamp(by + 1, room.y, room.y + room.h - 1))
             || _tryInsidePos(bx, clamp(by - 1, room.y, room.y + room.h - 1))
             || _tryInsidePos(bx, by);
  } else {
    const bx = room.x + room.w - 1, by = clamp(entrance.y, room.y, room.y + room.h - 1);
    insidePos = _tryInsidePos(bx, clamp(by + 1, room.y, room.y + room.h - 1))
             || _tryInsidePos(bx, clamp(by - 1, room.y, room.y + room.h - 1))
             || _tryInsidePos(bx, by);
  }
  if (!insidePos) {
    outer_s: for (let iy = room.y; iy < room.y + room.h; iy++)
      for (let ix = room.x; ix < room.x + room.w; ix++)
        if (map[iy][ix] === T.FLOOR) { insidePos = { x: ix, y: iy }; break outer_s; }
  }
  const socc = (x, y) => items.some(i => i.x === x && i.y === y);
  /* 宝石を候補に追加（originDepth を p.depth と合わせた 1-indexed で設定） */
  const gemCands = GEM_TYPES.map(g => ({ ...g, originDepth: depth + 1 }));
  /* 通常宝石は2セット、高級宝石（C以上）は1セットだけ通常店に加え、専門店より低確率にする */
  const _standardGemCands = gemCands.filter(g => g.rarity === "E" || g.rarity === "D");
  const _rareGemCands = gemCands.filter(g => g.rarity !== "E" && g.rarity !== "D");
  /* 食料候補：ランダムに5〜8種生成して候補に加える */
  const _foodCands = Array.from({ length: rng(5, 8) }, () => genFood());
  /* 専門店の抽選（30%） */
  const _wandsCands = (pool) => pool.map(w => ({ ...w, charges: (w.effect === "curse_wand" || w.effect === "bless_wand" || w.effect === "wish" || w.noChargeBoost) ? 1 : Math.max(1, w.charges + rng(-1, 1)) }));
  const _specialtyOptions = [
    /* luxury: B 以上（weight≤2）。旧 A/S 相当の希少枠 */
    { type: "weapon",    name: "武器屋",   cands: () => [...ITEMS.filter(i => i.type === "weapon"), { ...ARROW_T }, { ...MAGIC_MARKER, charges: rng(1, 2) }], luxury: () => ITEMS.filter(i => i.type === "weapon" && (i.rarity === "B" || i.rarity === "A" || i.rarity === "S")) },
    { type: "armor",     name: "防具屋",   cands: () => ITEMS.filter(i => i.type === "armor"),    luxury: () => ITEMS.filter(i => i.type === "armor"    && (i.rarity === "B" || i.rarity === "A" || i.rarity === "S")) },
    { type: "potion",    name: "薬屋",     cands: () => ITEMS.filter(i => i.type === "potion"),   luxury: () => ITEMS.filter(i => i.type === "potion"   && (i.rarity === "B" || i.rarity === "A" || i.rarity === "S")) },
    { type: "scroll",    name: "巻物屋",   cands: () => ITEMS.filter(i => i.type === "scroll"),   luxury: () => ITEMS.filter(i => i.type === "scroll"   && (i.rarity === "B" || i.rarity === "A" || i.rarity === "S")) },
    { type: "wand",      name: "杖屋",     cands: () => _wandsCands(WANDS),                       luxury: () => _wandsCands(WANDS.filter(w => w.rarity === "B" || w.rarity === "A" || w.rarity === "S")) },
    { type: "ring",      name: "指輪屋",   cands: () => [...RINGS],                               luxury: () => RINGS.filter(r => r.rarity === "B" || r.rarity === "A" || r.rarity === "S") },
    { type: "food",      name: "食料屋",   cands: () => Array.from({ length: rng(8, 14) }, () => genFood()), luxury: () => [] },
    { type: "pot",       name: "壺屋",     cands: () => [...POTS],                                luxury: () => POTS.filter(p => p.rarity === "B" || p.rarity === "A" || p.rarity === "S") },
    { type: "spellbook", name: "魔法書屋", cands: () => [...SPELLBOOKS],                          luxury: () => SPELLBOOKS.filter(sb => sb.rarity === "B" || sb.rarity === "A" || sb.rarity === "S") },
    { type: "gem",       name: "宝石店",   cands: () => GEM_TYPES.map(g => ({ ...g, originDepth: depth + 1 })), luxury: () => [] },
  ];
  let specialtyType = null, specialtyName = null, cands, luxuryPool;
  if (Math.random() < 0.30) {
    const _sp = pick(_specialtyOptions);
    specialtyType = _sp.type;
    specialtyName = _sp.name;
    cands = _sp.cands();
    luxuryPool = _sp.luxury();
  } else {
    cands = [
      ...ITEMS.filter(i => i.type !== 'gold'),
      ..._wandsCands(WANDS),
      ...POTS,
      ...RINGS,
      ...SPELLBOOKS, { ...ARROW_T }, { ...MAGIC_MARKER, charges: rng(1, 2) },
      ..._foodCands,
      ..._standardGemCands, ..._standardGemCands, ..._rareGemCands,
    ];
    luxuryPool = [
      ...ITEMS.filter(i => i.type !== 'gold' && (i.rarity === 'B' || i.rarity === 'A' || i.rarity === 'S')),
      ..._wandsCands(WANDS.filter(w => w.rarity === 'B' || w.rarity === 'A' || w.rarity === 'S')),
      ...POTS.filter(p => p.rarity === 'B' || p.rarity === 'A' || p.rarity === 'S'),
      ...RINGS.filter(r => r.rarity === 'B' || r.rarity === 'A' || r.rarity === 'S'),
      ...SPELLBOOKS.filter(sb => sb.rarity === 'B' || sb.rarity === 'A' || sb.rarity === 'S'),
    ];
  }
  const makeShopItem = (base, x, y) => {
    const sit = { ...base, id: uid(), x, y };
    if (sit.type === 'arrow') sit.count = rng(5, 20);
    if (sit.type === 'pot') sit.capacity = randPotCapacity(sit.potEffect);
    if (sit.type === 'pen') sit.charges = penInitialCharges(sit);
    sit.shopPrice = itemPrice(sit);
    sit._shopId = shopId;
    return sit;
  };
  /* グリッドを部屋内に収めて最低6スロット確保できるサイズを計算 */
  const maxCols = Math.max(2, Math.min(room.w - 1, 6));
  const maxRows = Math.max(2, Math.min(room.h - 1, 6));
  let cols = clamp(Math.floor(room.w / 2), 2, maxCols);
  let rows2 = clamp(Math.floor(room.h / 2), 2, maxRows);
  /* スロット数が6未満なら行・列を拡張 */
  while (cols * rows2 < 6 && (cols < maxCols || rows2 < maxRows)) {
    if (cols <= rows2 && cols < maxCols) cols++;
    else if (rows2 < maxRows) rows2++;
    else cols++;
  }
  const sx0 = room.x + Math.floor((room.w - cols) / 2);
  const sy0 = room.y + Math.floor((room.h - rows2) / 2);
  /* グリッド内の空きスロットを収集（グリッド形状を維持） */
  const gridSlots = [];
  for (let r = 0; r < rows2; r++)
    for (let c = 0; c < cols; c++) {
      const six = sx0 + c, siy = sy0 + r;
      if (map[siy]?.[six] === T.FLOOR && !socc(six, siy) && !(six === insidePos.x && siy === insidePos.y))
        gridSlots.push({ x: six, y: siy });
    }
  /* 目玉商品をグリッド先頭スロットに配置 */
  if (luxuryPool.length > 0 && gridSlots.length > 0) {
    const slot = gridSlots.shift();
    const luxItem = makeShopItem(pickLootFromPool(luxuryPool, "shop") || pick(luxuryPool), slot.x, slot.y);
    luxItem.shopPrice = Math.ceil(luxItem.shopPrice * 1.2);
    items.push(luxItem);
  }
  /* 残りスロットに通常商品を配置（グリッド内のみ） */
  const _lootContext = specialtyType === "gem" ? "shop_gem" : "shop";
  for (const slot of gridSlots) {
    items.push(makeShopItem(pickLootFromPool(cands, _lootContext) || pick(cands), slot.x, slot.y));
  }
  const sk = {
    id: uid(), name: '店主', hp: 200, maxHp: 200, atk: 100, def: 100, exp: 0,
    speed: 1, tile: TI.SHOPKEEPER, type: 'shopkeeper', state: 'friendly',
    blockPos: { ...entrance }, homePos: { ...insidePos },
    x: insidePos.x, y: insidePos.y, turnAccum: 0, aware: false,
    dir: { x: 0, y: 1 }, lastPx: 0, lastPy: 0, patrolTarget: null, sleepTurns: 0,
  };
  mons.push(sk);
  return { id: shopId, room, entrance, shopkeeperId: sk.id, unpaidTotal: 0, specialtyType, specialtyName };
}

/* ===== MINI BIG ROOM (ビッグルーム小型版) ===== */
function genMiddleRoom(depth, dungeonType = null) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
  const rw = Math.floor(MW * 0.55), rh = Math.floor(MH * 0.60);
  const rx = Math.floor((MW - rw) / 2), ry = Math.floor((MH - rh) / 2);
  for (let dy = 0; dy < rh; dy++)
    for (let dx = 0; dx < rw; dx++) map[ry + dy][rx + dx] = T.FLOOR;
  const room = { x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw / 2), cy: ry + Math.floor(rh / 2) };
  const rooms = [room];
  /* 階段：左半分にSU、右半分にSD（ランダム位置） */
  let su = null, sd = null;
  for (let a = 0; a < 200 && !su; a++) { const x = rng(rx+1, rx+Math.floor(rw/2)-1), y = rng(ry+1, ry+rh-2); if (map[y][x]===T.FLOOR) su={x,y}; }
  if (!su) su = { x: rx + 1, y: ry + 1 };
  map[su.y][su.x] = T.SU;
  for (let a = 0; a < 200 && !sd; a++) { const x = rng(rx+Math.floor(rw/2), rx+rw-2), y = rng(ry+1, ry+rh-2); if (map[y][x]===T.FLOOR && !(x===su.x&&y===su.y)) sd={x,y}; }
  if (!sd) sd = { x: rx + rw - 2, y: ry + rh - 2 };
  map[sd.y][sd.x] = T.SD;
  const mons = [];
  for (let i = 0; i < rng(5, 9) + depth; i++) {
    for (let a = 0; a < 40; a++) {
      const mx = rng(rx, rx + rw - 1), my = rng(ry, ry + rh - 1);
      if (map[my][mx] !== T.FLOOR || (mx === su.x && my === su.y) || (mx === sd.x && my === sd.y)) continue;
      if (mons.some(m => m.x === mx && m.y === my)) continue;
      mons.push(mkMon(depth, mx, my, 0.12, null, null, dungeonType)); break;
    }
  }
  const items = [], traps = [], springs = [], bigboxes = [];
  const occ = mkOcc(items, mons, traps, springs, bigboxes);
  const rndFloor = () => { for (let a = 0; a < 80; a++) { const x = rng(rx, rx + rw - 1), y = rng(ry, ry + rh - 1); if (map[y][x] === T.FLOOR && !occ(x, y) && !(x === su.x && y === su.y) && !(x === sd.x && y === sd.y)) return [x, y]; } return null; };
  const _mdPick = buildUniPool(depth, dungeonType);
  for (let i = 0; i < rng(14, 22); i++) { const p = rndFloor(); if (p) { items.push(Object.assign(applyStdMods(_mdPick(), depth), { x: p[0], y: p[1] })); } }
  for (let i = 0; i < rng(6, 12) + depth; i++) { const p = rndFloor(); if (p) traps.push({ ...pickTrap(), id: uid(), x: p[0], y: p[1], revealed: false }); }
  for (let i = 0; i < rng(1, 3); i++) { const p = rndFloor(); if (p) springs.push({ id: uid(), x: p[0], y: p[1], tile: TI.SPRING, contents: [] }); }
  for (let i = 0; i < rng(2, 4); i++) { const p = rndFloor(); if (p) { const bbt = pickBB(); bigboxes.push({ id: uid(), x: p[0], y: p[1], tile: TI.BIGBOX, kind: bbt.kind, name: bbt.name, capacity: bbt.cap(), contents: [] }); } }
  let _mdMHRoom = null;
  if (Math.random() < 0.20) { genMonsterHouseContent(rooms[0], depth, map, mons, items, traps, springs, bigboxes, su, sd, dungeonType); _mdMHRoom = rooms[0]; }
  const { visible, explored } = mkVis();
  return { map, rooms, monsters: mons, items, traps, springs, bigboxes, stairUp: su, stairDown: sd, visible, explored, shop: null, hiddenRooms: [], monsterHouseRoom: _mdMHRoom, waterItems: [], isBigRoom: true, floorType: "middleRoom" };
}

/* ===== MINI ROOM (超小型1部屋フロア) ===== */
export function genMiniRoom(depth, dungeonType = null) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
  /* 60×30マップでは12×8。名前どおり、階段以外が密集する小空間にする。 */
  const rw = Math.floor(MW * 0.20), rh = Math.floor(MH * 0.27);
  const rx = Math.floor((MW - rw) / 2), ry = Math.floor((MH - rh) / 2);
  for (let dy = 0; dy < rh; dy++)
    for (let dx = 0; dx < rw; dx++) map[ry + dy][rx + dx] = T.FLOOR;
  const room = { x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw / 2), cy: ry + Math.floor(rh / 2) };
  const rooms = [room];
  let su = null, sd = null;
  for (let a = 0; a < 200 && !su; a++) { const x = rng(rx+1, rx+Math.floor(rw/2)-1), y = rng(ry+1, ry+rh-2); if (map[y][x]===T.FLOOR) su={x,y}; }
  if (!su) su = { x: rx + 1, y: ry + 1 };
  map[su.y][su.x] = T.SU;
  for (let a = 0; a < 200 && !sd; a++) { const x = rng(rx+Math.floor(rw/2), rx+rw-2), y = rng(ry+1, ry+rh-2); if (map[y][x]===T.FLOOR && !(x===su.x&&y===su.y)) sd={x,y}; }
  if (!sd) sd = { x: rx + rw - 2, y: ry + rh - 2 };
  map[sd.y][sd.x] = T.SD;
  const mons = [];
  for (let i = 0; i < rng(3, 5) + Math.floor(depth / 2); i++) {
    for (let a = 0; a < 40; a++) {
      const mx = rng(rx, rx + rw - 1), my = rng(ry, ry + rh - 1);
      if (map[my][mx] !== T.FLOOR || (mx === su.x && my === su.y) || (mx === sd.x && my === sd.y)) continue;
      if (mons.some(m => m.x === mx && m.y === my)) continue;
      mons.push(mkMon(depth, mx, my, 0.12, null, null, dungeonType)); break;
    }
  }
  const items = [], traps = [], springs = [], bigboxes = [];
  const occ = mkOcc(items, mons, traps, springs, bigboxes);
  const rndFloor = () => { for (let a = 0; a < 80; a++) { const x = rng(rx, rx + rw - 1), y = rng(ry, ry + rh - 1); if (map[y][x] === T.FLOOR && !occ(x, y) && !(x === su.x && y === su.y) && !(x === sd.x && y === sd.y)) return [x, y]; } return null; };
  const _mnPick = buildUniPool(depth, dungeonType);
  for (let i = 0; i < rng(7, 13); i++) { const p = rndFloor(); if (p) { items.push(Object.assign(applyStdMods(_mnPick(), depth), { x: p[0], y: p[1] })); } }
  for (let i = 0; i < rng(3, 6) + Math.floor(depth / 2); i++) { const p = rndFloor(); if (p) traps.push({ ...pickTrap(), id: uid(), x: p[0], y: p[1], revealed: false }); }
  if (Math.random() < 0.5) { const p = rndFloor(); if (p) springs.push({ id: uid(), x: p[0], y: p[1], tile: TI.SPRING, contents: [] }); }
  for (let i = 0; i < rng(1, 2); i++) { const p = rndFloor(); if (p) { const bbt = pickBB(); bigboxes.push({ id: uid(), x: p[0], y: p[1], tile: TI.BIGBOX, kind: bbt.kind, name: bbt.name, capacity: bbt.cap(), contents: [] }); } }
  let _mnMHRoom = null;
  if (Math.random() < 0.20) { genMonsterHouseContent(rooms[0], depth, map, mons, items, traps, springs, bigboxes, su, sd, dungeonType); _mnMHRoom = rooms[0]; }
  const { visible, explored } = mkVis();
  return { map, rooms, monsters: mons, items, traps, springs, bigboxes, stairUp: su, stairDown: sd, visible, explored, shop: null, hiddenRooms: [], monsterHouseRoom: _mnMHRoom, waterItems: [], isBigRoom: true, floorType: "miniRoom" };
}

/* ===== SHOPPING MALL (複数店舗フロア) ===== */
function genShoppingMall(depth, dungeonType = null, _retries = 0) {
  /* 3列×2行のグリッドに部屋を配置 */
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
  const rooms = [];
  const COLS = 3, ROWS = 2;
  const cellW = Math.floor(MW / COLS), cellH = Math.floor(MH / ROWS);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const rw = rng(4, Math.min(8, cellW - 4)), rh = rng(3, Math.min(6, cellH - 4));
      const rx = col * cellW + Math.floor((cellW - rw) / 2);
      const ry = row * cellH + Math.floor((cellH - rh) / 2);
      if (rx < 1 || ry < 1 || rx + rw >= MW - 1 || ry + rh >= MH - 1) { rooms.push(null); continue; }
      for (let dy = 0; dy < rh; dy++)
        for (let dx = 0; dx < rw; dx++) map[ry + dy][rx + dx] = T.FLOOR;
      rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw / 2), cy: ry + Math.floor(rh / 2) });
    }
  }
  const validRooms = rooms.filter(Boolean);
  if (validRooms.length < 2) {
    if (_retries > 10) return genBigRoom(depth);
    return genShoppingMall(depth, dungeonType, _retries + 1);
  }
  /* 水平・垂直廊下で隣接セルを接続 */
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS - 1; col++) {
      const a = rooms[row * COLS + col], b = rooms[row * COLS + col + 1];
      if (!a || !b) continue;
      let x = a.cx, y = a.cy;
      while (x !== b.cx) { map[y][x] = T.FLOOR; x += x < b.cx ? 1 : -1; }
      while (y !== b.cy) { map[y][x] = T.FLOOR; y += y < b.cy ? 1 : -1; }
    }
  }
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS - 1; row++) {
      const a = rooms[row * COLS + col], b = rooms[(row + 1) * COLS + col];
      if (!a || !b) continue;
      let x = a.cx, y = a.cy;
      while (y !== b.cy) { map[y][x] = T.FLOOR; y += y < b.cy ? 1 : -1; }
      while (x !== b.cx) { map[y][x] = T.FLOOR; x += x < b.cx ? 1 : -1; }
    }
  }
  const mons = [], items = [], traps = [], springs = [], bigboxes = [];
  /* 階段は廊下上（最初の有効部屋の外）に配置。fr.x-1/lr.x+lr.w で部屋に隣接させる */
  const fr = validRooms[0], lr = validRooms[validRooms.length - 1];
  const su = { x: clamp(fr.x - 1, 1, MW - 2), y: fr.cy };
  map[su.y][su.x] = T.SU;
  const sd = { x: clamp(lr.x + lr.w, 1, MW - 2), y: lr.cy };
  map[sd.y][sd.x] = T.SD;
  /* 各部屋をショップにセットアップ */
  const allShops = [];
  for (const room of validRooms) {
    allShops.push(setupShopRoom(room, map, depth, items, mons));
  }
  const shopData = allShops[0] || null;
  /* 廊下にモンスター・罠を少量配置（商品を置かないためアイテムモドキは除外） */
  const occ = mkOcc(items, mons, traps);
  const inAnyRoom = (x, y) => validRooms.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  for (let i = 0; i < rng(2, 4); i++) {
    for (let a = 0; a < 80; a++) {
      const mx = rng(1, MW - 2), my = rng(1, MH - 2);
      if (map[my][mx] !== T.FLOOR || occ(mx, my) || inAnyRoom(mx, my)) continue;
      mons.push(mkMon(depth, mx, my, 0.12, null, null, dungeonType, { excludeItemMimic: true })); break;
    }
  }
  for (let i = 0; i < rng(3, 6); i++) {
    for (let a = 0; a < 80; a++) {
      const tx = rng(1, MW - 2), ty = rng(1, MH - 2);
      if (map[ty][tx] !== T.FLOOR || occ(tx, ty) || inAnyRoom(tx, ty) || isNarrowPassage(map, tx, ty)) continue;
      traps.push({ ...pickTrap(), id: uid(), x: tx, y: ty, revealed: false }); break;
    }
  }
  const { visible, explored } = mkVis();
  return { map, rooms: validRooms, monsters: mons, items, traps, springs, bigboxes, stairUp: su, stairDown: sd, visible, explored, shop: shopData, shops: allShops, hiddenRooms: [], monsterHouseRoom: null, waterItems: [], floorType: "shoppingMall" };
}

/* ===== SPIN FLOOR (完全独立部屋＋回転板移動) ===== */
function genSpinFloor(depth, dungeonType = null, _retries = 0) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
  const rooms = [];
  const spinTrap = { name: '回転板', effect: 'spin', tile: 29, permanent: true };
  /* 独立した部屋を5〜7個ランダム配置（2タイルバッファ） */
  const roomCount = rng(5, 7);
  for (let attempt = 0; attempt < roomCount * 80 && rooms.length < roomCount; attempt++) {
    const rw = rng(4, 7), rh = rng(3, 5);
    const rx = rng(2, MW - rw - 2), ry = rng(2, MH - rh - 2);
    let ok = true;
    for (let dy = -2; dy <= rh + 1 && ok; dy++)
      for (let dx = -2; dx <= rw + 1 && ok; dx++) {
        const nx = rx + dx, ny = ry + dy;
        if (nx < 0 || nx >= MW || ny < 0 || ny >= MH) { ok = false; break; }
        if (map[ny][nx] !== T.WALL) { ok = false; break; }
      }
    if (!ok) continue;
    for (let dy = 0; dy < rh; dy++)
      for (let dx = 0; dx < rw; dx++) map[ry + dy][rx + dx] = T.FLOOR;
    rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw / 2), cy: ry + Math.floor(rh / 2) });
  }
  if (rooms.length < 2) {
    if (_retries > 10) return genBigRoom(depth);
    return genSpinFloor(depth, dungeonType, _retries + 1);
  }
  /* 階段は最初と最後の部屋 */
  const su = { x: rooms[0].cx, y: rooms[0].cy };
  map[su.y][su.x] = T.SU;
  const sd = { x: rooms[rooms.length - 1].cx, y: rooms[rooms.length - 1].cy };
  map[sd.y][sd.x] = T.SD;
  const mons = [], items = [], traps = [], springs = [], bigboxes = [];
  const occ = mkOcc(items, mons, traps, springs, bigboxes);
  let _spPick = null;
  for (const room of rooms) {
    const floorTiles = [];
    for (let dy = 0; dy < room.h; dy++)
      for (let dx = 0; dx < room.w; dx++) {
        const fx = room.x + dx, fy = room.y + dy;
        if (map[fy][fx] === T.FLOOR && !(fx === su.x && fy === su.y) && !(fx === sd.x && fy === sd.y)) floorTiles.push([fx, fy]);
      }
    if (floorTiles.length === 0) continue;
    /* 回転板を2〜3枚 */
    const spinCount = Math.min(rng(2, 3), floorTiles.length);
    let placed = 0;
    for (let a = 0; a < spinCount * 30 && placed < spinCount; a++) {
      const [tx, ty] = pick(floorTiles);
      if (occ(tx, ty)) continue;
      traps.push({ ...spinTrap, id: uid(), x: tx, y: ty, revealed: false });
      placed++;
    }
    /* アイテムを1〜4個 */
    if (!_spPick) _spPick = buildUniPool(depth, dungeonType);
    const itemCount = Math.min(rng(1, 4), floorTiles.length);
    let iPlaced = 0;
    for (let a = 0; a < itemCount * 30 && iPlaced < itemCount; a++) {
      const [ix, iy] = pick(floorTiles);
      if (occ(ix, iy)) continue;
      items.push(Object.assign(applyStdMods(_spPick(), depth), { x: ix, y: iy })); iPlaced++;
    }
    /* モンスターを1体 */
    for (let a = 0; a < 30; a++) {
      const [mx, my] = pick(floorTiles);
      if (occ(mx, my)) continue;
      mons.push(mkMon(depth, mx, my, 0.12, null, null, dungeonType)); break;
    }
  }
  let _spMHRoom = null;
  if (Math.random() < 0.25) {
    const _spMHCands = rooms.filter((_, i) => i > 0 && i < rooms.length - 1);
    if (_spMHCands.length > 0) { _spMHRoom = pick(_spMHCands); genMonsterHouseContent(_spMHRoom, depth, map, mons, items, traps, springs, bigboxes, su, sd, dungeonType); }
  }
  const { visible, explored } = mkVis();
  return { map, rooms, monsters: mons, items, traps, springs, bigboxes, stairUp: su, stairDown: sd, visible, explored, shop: null, hiddenRooms: [], monsterHouseRoom: _spMHRoom, waterItems: [], isBigRoom: true, floorType: "spinFloor" };
}

/* ===== CORRIDOR FLOOR (迷路状廊下フロア) ===== */
export function genCorridorFloor(depth, dungeonType = null) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));

  /* ── DFS完全迷路 ─────────────────────────────────────────────────────── */
  /* S=2: ノード座標 nodeX(c)=2+2c, nodeY(r)=2+2r
   * 隣接ノードの間に壁を1枚残す、細い廊下主体の古典的な迷路。 */
  const S = 2;
  const COLS = Math.floor((MW - 4) / S) + 1;
  const ROWS = Math.floor((MH - 4) / S) + 1;
  const nodeX = c => 2 + c * S;
  const nodeY = r => 2 + r * S;
  const DIRS4 = [[1,0],[-1,0],[0,1],[0,-1]];

  /* 再帰的バックトラッキング（完全迷路 = 袋小路・分岐・L字曲がりが豊富） */
  const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const sc = rng(0, COLS - 1), sr = rng(0, ROWS - 1);
  visited[sr][sc] = true;
  const stack = [[sc, sr]];
  while (stack.length) {
    const [c, r] = stack[stack.length - 1];
    const unv = DIRS4.map(([dc,dr]) => [c+dc, r+dr])
      .filter(([nc,nr]) => nc>=0 && nc<COLS && nr>=0 && nr<ROWS && !visited[nr][nc]);
    if (unv.length) {
      const [nc, nr] = pick(unv);
      const x1=nodeX(c), y1=nodeY(r), x2=nodeX(nc), y2=nodeY(nr);
      if (y1===y2) { const a=Math.min(x1,x2),b=Math.max(x1,x2); for(let x=a;x<=b;x++) map[y1][x]=T.FLOOR; }
      else         { const a=Math.min(y1,y2),b=Math.max(y1,y2); for(let y=a;y<=b;y++) map[y][x1]=T.FLOOR; }
      visited[nr][nc] = true;
      stack.push([nc, nr]);
    } else { stack.pop(); }
  }

  /* 既存の壁を候補化してからループを追加。無効な重複開通を避ける。 */
  const loopEdges = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = nodeX(c), y = nodeY(r);
      if (c + 1 < COLS && map[y][x + 1] === T.WALL) loopEdges.push([x + 1, y]);
      if (r + 1 < ROWS && map[y + 1][x] === T.WALL) loopEdges.push([x, y + 1]);
    }
  }
  shuffle(loopEdges);
  for (const [x, y] of loopEdges.slice(0, Math.min(loopEdges.length, rng(10, 18)))) map[y][x] = T.FLOOR;

  /* ── 階段配置（左1/3 ↑・右1/3 ↓） ─────────────────────────────────── */
  const leftNC = [], rightNC = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = nodeX(c);
      if (x < MW / 3) leftNC.push([c, r]);
      else if (x > MW * 2 / 3) rightNC.push([c, r]);
    }
  }
  const [suC, suR] = pick(leftNC.length  ? leftNC  : [[0, 0]]);
  const [sdC, sdR] = pick(rightNC.length ? rightNC : [[COLS-1, ROWS-1]]);
  const suX=nodeX(suC), suY=nodeY(suR), sdX=nodeX(sdC), sdY=nodeY(sdR);
  map[suY][suX] = T.SU;
  map[sdY][sdX] = T.SD;
  const su = { x:suX, y:suY }, sd = { x:sdX, y:sdY };

  /* ── 行き止まりノード検出 ───────────────────────────────────────────── */
  /* 隣接ノードとの間の廊下タイル（中間 = (x+x2)/2）があるか確認 */
  const deadEnds = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c===suC&&r===suR || c===sdC&&r===sdR) continue;
      let exits = 0;
      for (const [dc,dr] of DIRS4) {
        const nc=c+dc, nr=r+dr;
        if (nc<0||nc>=COLS||nr<0||nr>=ROWS) continue;
        const mx=(nodeX(c)+nodeX(nc))>>1, my=(nodeY(r)+nodeY(nr))>>1;
        if (map[my][mx]===T.FLOOR||map[my][mx]===T.SU||map[my][mx]===T.SD) exits++;
      }
      if (exits===1) deadEnds.push([c, r]);
    }
  }

  /* ── 階段周辺＋一部行き止まりにだけ小さな退避空間を配置 ──────────────── */
  /* 以前のように多数の3×3部屋を作らず、迷路の細い廊下を維持する。 */
  shuffle(deadEnds);
  const roomNodes = [[suC,suR],[sdC,sdR]];
  const pocketCount = rng(3, 5);
  for (const [nc, nr] of deadEnds) {
    if (roomNodes.some(([pc, pr]) => Math.abs(pc - nc) <= 1 && Math.abs(pr - nr) <= 1)) continue;
    roomNodes.push([nc, nr]);
    if (roomNodes.length >= pocketCount + 2) break;
  }
  const roomTiles = new Set();
  const rooms = [];
  for (let ri = 0; ri < roomNodes.length; ri++) {
    const [nc, nr] = roomNodes[ri];
    const cx=nodeX(nc), cy=nodeY(nr);
    const radius = ri < 2 ? 1 : 0;
    for (let dy=-radius; dy<=radius; dy++) {
      for (let dx=-radius; dx<=radius; dx++) {
        const sx=cx+dx, sy=cy+dy;
        if (sx>=1&&sx<MW-1&&sy>=1&&sy<MH-1) {
          if (map[sy][sx]===T.WALL) map[sy][sx]=T.FLOOR;
          roomTiles.add(`${sx},${sy}`);
        }
      }
    }
    rooms.push({ x:cx-radius, y:cy-radius, w:radius * 2 + 1, h:radius * 2 + 1, cx, cy });
  }

  /* ── スポーン ──────────────────────────────────────────────────────── */
  const corTiles = [];
  for (let y=0;y<MH;y++) for (let x=0;x<MW;x++) if (map[y][x]===T.FLOOR) corTiles.push([x,y]);
  const roomTileList = corTiles.filter(([x,y]) => roomTiles.has(`${x},${y}`));
  const mons=[],items=[],traps=[],springs=[],bigboxes=[];
  const occ = mkOcc(items,mons,traps,springs,bigboxes);
  const notSt = (x,y) => !(x===su.x&&y===su.y)&&!(x===sd.x&&y===sd.y);
  /* モンスター・アイテムは廊下全体に配置 */
  const rndCor  = ()=>{ for(let a=0;a<60;a++){const[x,y]=pick(corTiles);if(!occ(x,y)&&notSt(x,y))return[x,y];}return null;};
  /* 罠・泉・大箱・階段は小部屋内にのみ配置 */
  const rndRoom = ()=>{ for(let a=0;a<120;a++){const[x,y]=pick(roomTileList);if(!occ(x,y)&&notSt(x,y))return[x,y];}return null;};
  for(let i=0;i<rng(6,10)+depth;i++){const p=rndCor();if(p)mons.push(mkMon(depth,p[0],p[1],0.12,null,null,dungeonType));}
  for(let i=0;i<rng(8,14)+depth;i++){const p=rndCor();if(p){const it=applyInitialItemCharges({...pickLootFromPool(ITEMS),id:uid(),x:p[0],y:p[1]});if(it.type==='gold')it.value=rng(20,80+depth*30);items.push(it);}}
  for(let i=0;i<rng(4,8)+depth;i++){const p=rndRoom();if(p)traps.push({...pickTrap(),id:uid(),x:p[0],y:p[1],revealed:false});}
  for(let i=0;i<rng(1,3);i++){const p=rndRoom();if(p)springs.push({id:uid(),x:p[0],y:p[1],tile:TI.SPRING,contents:[]});}
  for(let i=0;i<rng(1,2);i++){const p=rndRoom();if(p){const bbt=pickBB();bigboxes.push({id:uid(),x:p[0],y:p[1],tile:TI.BIGBOX,kind:bbt.kind,name:bbt.name,capacity:bbt.cap(),contents:[]});}}
  const { visible, explored } = mkVis();
  return { map, rooms, monsters:mons, items, traps, springs, bigboxes, stairUp:su, stairDown:sd, visible, explored, shop:null, hiddenRooms:[], monsterHouseRoom:null, waterItems:[], floorType:"corridorFloor" };
}

/* ===== GRID ROOM (格子状壁の大部屋) ===== */
export function genGridRoom(depth, dungeonType = null) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
  const rx = 2, ry = 2, rw = MW - 4, rh = MH - 4;
  for (let dy = 0; dy < rh; dy++)
    for (let dx = 0; dx < rw; dx++) map[ry + dy][rx + dx] = T.FLOOR;
  /* 格子状に柱を配置（通路1マス・壁1マスの交互配置） */
  for (let gy = ry + 1; gy < ry + rh - 1; gy += 2)
    for (let gx = rx + 1; gx < rx + rw - 1; gx += 2)
      map[gy][gx] = T.WALL;
  const room = { x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw / 2), cy: ry + Math.floor(rh / 2) };
  const rooms = [room];
  /* 階段：左半分にSU、右半分にSD（ランダム位置、格子の柱を避ける） */
  let su = null, sd = null;
  for (let a = 0; a < 200 && !su; a++) { const x = rng(rx+1, rx+Math.floor(rw/2)-1), y = rng(ry+1, ry+rh-2); if (map[y][x]===T.FLOOR) su={x,y}; }
  if (!su) su = { x: rx + 1, y: ry + 1 };
  map[su.y][su.x] = T.SU;
  for (let a = 0; a < 200 && !sd; a++) { const x = rng(rx+Math.floor(rw/2), rx+rw-2), y = rng(ry+1, ry+rh-2); if (map[y][x]===T.FLOOR && !(x===su.x&&y===su.y)) sd={x,y}; }
  if (!sd) sd = { x: rx + rw - 2, y: ry + rh - 2 };
  map[sd.y][sd.x] = T.SD;
  const mons = [], items = [], traps = [], springs = [], bigboxes = [];
  const occ = mkOcc(items, mons, traps, springs, bigboxes);
  const rndFloor = () => { for (let a = 0; a < 100; a++) { const x = rng(rx, rx + rw - 1), y = rng(ry, ry + rh - 1); if (map[y][x] === T.FLOOR && !occ(x, y) && !(x === su.x && y === su.y) && !(x === sd.x && y === sd.y)) return [x, y]; } return null; };
  for (let i = 0; i < rng(8, 13) + depth; i++) { const p = rndFloor(); if (p) mons.push(mkMon(depth, p[0], p[1], 0.12, null, null, dungeonType)); }
  const _grPick = buildUniPool(depth, dungeonType);
  for (let i = 0; i < rng(16, 24); i++) { const p = rndFloor(); if (p) { items.push(Object.assign(applyStdMods(_grPick(), depth), { x: p[0], y: p[1] })); } }
  /* 格子の柱に埋まるアイテムは稀にだけ配置する。 */
  if (Math.random() < 0.15) genWallItems(map, depth, items, new Set(), 1);
  for (let i = 0; i < rng(12, 18) + depth; i++) { const p = rndFloor(); if (p) traps.push({ ...pickTrap(), id: uid(), x: p[0], y: p[1], revealed: false }); }
  for (let i = 0; i < rng(2, 4); i++) { const p = rndFloor(); if (p) springs.push({ id: uid(), x: p[0], y: p[1], tile: TI.SPRING, contents: [] }); }
  for (let i = 0; i < rng(2, 4); i++) { const p = rndFloor(); if (p) { const bbt = pickBB(); bigboxes.push({ id: uid(), x: p[0], y: p[1], tile: TI.BIGBOX, kind: bbt.kind, name: bbt.name, capacity: bbt.cap(), contents: [] }); } }
  let _grMHRoom = null;
  if (Math.random() < 0.20) { genMonsterHouseContent(rooms[0], depth, map, mons, items, traps, springs, bigboxes, su, sd, dungeonType); _grMHRoom = rooms[0]; }
  const { visible, explored } = mkVis();
  return { map, rooms, monsters: mons, items, traps, springs, bigboxes, stairUp: su, stairDown: sd, visible, explored, shop: null, hiddenRooms: [], monsterHouseRoom: _grMHRoom, waterItems: [], isBigRoom: true, floorType: "gridRoom" };
}


/* ===== RING CORRIDOR FLOOR (環状回廊の間) ===== */
function genRingCorridorFloor(depth, dungeonType = null) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));

  /* 3つの同心矩形廊下 */
  const RINGS = [
    { x1: 2,  y1: 2,  x2: MW-3,  y2: MH-3  },  // 外周
    { x1: 9,  y1: 6,  x2: MW-10, y2: MH-7  },  // 中周
    { x1: 18, y1: 11, x2: MW-19, y2: MH-12 },  // 内周
  ];

  for (const { x1, y1, x2, y2 } of RINGS) {
    if (x2 <= x1 || y2 <= y1) continue;
    for (let x = x1; x <= x2; x++) { map[y1][x] = T.FLOOR; map[y2][x] = T.FLOOR; }
    for (let y = y1+1; y < y2; y++) { map[y][x1] = T.FLOOR; map[y][x2] = T.FLOOR; }
  }

  /* リング間の接続通路 ＋ 内側端点（ポケット生成用）を収集 */
  const carveV = (x, ya, yb) => { const a=Math.min(ya,yb), b=Math.max(ya,yb); for(let y=a;y<=b;y++) map[y][x]=T.FLOOR; };
  const carveH = (y, xa, xb) => { const a=Math.min(xa,xb), b=Math.max(xa,xb); for(let x=a;x<=b;x++) map[y][x]=T.FLOOR; };
  const pocketCenters = []; // 9×9ポケットの中心座標一覧

  /* 外周⟺中周：上下各2本・左右各1本。内側端点=中周との合流点 */
  for (let i = 0; i < 2; i++) { const cx=rng(RINGS[1].x1+1, RINGS[1].x2-1); carveV(cx, RINGS[0].y1, RINGS[1].y1); pocketCenters.push([cx, RINGS[1].y1]); }
  for (let i = 0; i < 2; i++) { const cx=rng(RINGS[1].x1+1, RINGS[1].x2-1); carveV(cx, RINGS[1].y2, RINGS[0].y2); pocketCenters.push([cx, RINGS[1].y2]); }
  { const cy=rng(RINGS[1].y1+1, RINGS[1].y2-1); carveH(cy, RINGS[0].x1, RINGS[1].x1); pocketCenters.push([RINGS[1].x1, cy]); }
  { const cy=rng(RINGS[1].y1+1, RINGS[1].y2-1); carveH(cy, RINGS[1].x2, RINGS[0].x2); pocketCenters.push([RINGS[1].x2, cy]); }

  /* 中周⟺内周：上下各2本・左右各1本。内側端点=内周との合流点 */
  for (let i = 0; i < 2; i++) { const cx=rng(RINGS[2].x1+1, RINGS[2].x2-1); carveV(cx, RINGS[1].y1, RINGS[2].y1); pocketCenters.push([cx, RINGS[2].y1]); }
  for (let i = 0; i < 2; i++) { const cx=rng(RINGS[2].x1+1, RINGS[2].x2-1); carveV(cx, RINGS[2].y2, RINGS[1].y2); pocketCenters.push([cx, RINGS[2].y2]); }
  { const cy=rng(RINGS[2].y1+1, RINGS[2].y2-1); carveH(cy, RINGS[1].x1, RINGS[2].x1); pocketCenters.push([RINGS[2].x1, cy]); }
  { const cy=rng(RINGS[2].y1+1, RINGS[2].y2-1); carveH(cy, RINGS[2].x2, RINGS[1].x2); pocketCenters.push([RINGS[2].x2, cy]); }

  /* 階段：SU=外周ランダム位置, SD=内周ランダム位置 */
  const collectRingTiles = ({ x1, y1, x2, y2 }) => {
    const t = [];
    for (let x = x1; x <= x2; x++) {
      if (map[y1][x] === T.FLOOR) t.push([x, y1]);
      if (y2 !== y1 && map[y2][x] === T.FLOOR) t.push([x, y2]);
    }
    for (let y = y1+1; y < y2; y++) {
      if (map[y][x1] === T.FLOOR) t.push([x1, y]);
      if (x2 !== x1 && map[y][x2] === T.FLOOR) t.push([x2, y]);
    }
    return t;
  };
  const outerTiles = collectRingTiles(RINGS[0]);
  const innerTiles = collectRingTiles(RINGS[2]);
  const [suX, suY] = pick(outerTiles.length ? outerTiles : [[RINGS[0].x1, RINGS[0].y1]]);
  const [sdX, sdY] = pick(innerTiles.length ? innerTiles : [[RINGS[2].x1, RINGS[2].y1]]);

  /* 階段周辺もポケットリストに追加 */
  pocketCenters.push([suX, suY], [sdX, sdY]);

  /* ── 9×9のポケット空間を生成（部屋扱いなし、罠専用配置ゾーン） ── */
  const pocketTileSet = new Set();
  for (const [cx, cy] of pocketCenters) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = cx + dx, py = cy + dy;
        if (px >= 1 && px < MW-1 && py >= 1 && py < MH-1) {
          map[py][px] = T.FLOOR;
          pocketTileSet.add(`${px},${py}`);
        }
      }
    }
  }

  /* 階段をポケット生成後に配置（T.FLOORを上書き） */
  map[suY][suX] = T.SU; map[sdY][sdX] = T.SD;
  const su = { x: suX, y: suY }, sd = { x: sdX, y: sdY };

  const rooms = [
    { x: suX-1, y: suY-1, w: 3, h: 3, cx: suX, cy: suY },
    { x: sdX-1, y: sdY-1, w: 3, h: 3, cx: sdX, cy: sdY },
  ];

  /* 全床タイル（モンスター・アイテム配置用） */
  const corTiles = [];
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++)
      if (map[y][x] === T.FLOOR) corTiles.push([x, y]);

  /* ポケット内タイル（罠配置専用） */
  const pocketTilesArr = [...pocketTileSet]
    .map(k => k.split(',').map(Number))
    .filter(([x,y]) => map[y][x] === T.FLOOR);

  const mons = [], items = [], traps = [], springs = [], bigboxes = [];
  const occ = mkOcc(items, mons, traps, springs, bigboxes);
  const rndCor   = () => { for(let a=0;a<60;a++){const[x,y]=pick(corTiles);if(!occ(x,y)&&!(x===su.x&&y===su.y)&&!(x===sd.x&&y===sd.y))return[x,y];}return null; };
  /* 罠はポケット空間にのみ配置 */
  const rndPocket = () => {
    if (!pocketTilesArr.length) return null;
    for(let a=0;a<120;a++){const[x,y]=pick(pocketTilesArr);if(!occ(x,y)&&!(x===su.x&&y===su.y)&&!(x===sd.x&&y===sd.y))return[x,y];}
    return null;
  };

  for(let i=0;i<rng(5,9)+depth;i++){const p=rndCor();if(p)mons.push(mkMon(depth,p[0],p[1],0.12,null,null,dungeonType));}
  for(let i=0;i<rng(8,14)+depth;i++){const p=rndCor();if(p){const it=applyInitialItemCharges({...pickLootFromPool(ITEMS),id:uid(),x:p[0],y:p[1]});if(it.type==='gold')it.value=rng(20,80+depth*30);items.push(it);}}
  for(let i=0;i<rng(4,8)+depth;i++){const p=rndPocket();if(p)traps.push({...pickTrap(),id:uid(),x:p[0],y:p[1],revealed:false});}
  for(let i=0;i<rng(1,2);i++){const p=rndCor();if(p)springs.push({id:uid(),x:p[0],y:p[1],tile:TI.SPRING,contents:[]});}
  const { visible, explored } = mkVis();
  return { map, rooms, monsters: mons, items, traps, springs, bigboxes, stairUp: su, stairDown: sd, visible, explored, shop: null, hiddenRooms: [], monsterHouseRoom: null, waterItems: [], floorType: "ringCorridorFloor" };
}

/* ===== CAVE FLOOR (洞窟の間) ===== */
function genCaveFloor(depth, dungeonType = null) {
  let map, mainTiles;

  for (let attempt = 0; attempt < 5; attempt++) {
    map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));

    /* 初期配置（内側のみ、境界はWALL固定） */
    for (let y = 1; y < MH-1; y++)
      for (let x = 1; x < MW-1; x++)
        if (Math.random() < 0.44) map[y][x] = T.FLOOR;

    /* セルオートマトン4回：5個以上の隣接フロアがあればフロア */
    for (let iter = 0; iter < 4; iter++) {
      const tmp = map.map(r => [...r]);
      for (let y = 1; y < MH-1; y++) {
        for (let x = 1; x < MW-1; x++) {
          let f = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if ((dx||dy) && map[y+dy]?.[x+dx] === T.FLOOR) f++;
          tmp[y][x] = f >= 5 ? T.FLOOR : T.WALL;
        }
      }
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) map[y][x] = tmp[y][x];
    }

    /* 最大連結成分を抽出 */
    const seen = new Uint8Array(MW * MH);
    let best = [];
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const idx = y*MW+x;
        if (map[y][x] !== T.FLOOR || seen[idx]) continue;
        const comp = [], stk = [[x, y]];
        while (stk.length) {
          const [cx, cy] = stk.pop();
          const ci = cy*MW+cx;
          if (cx<0||cx>=MW||cy<0||cy>=MH||seen[ci]||map[cy][cx]!==T.FLOOR) continue;
          seen[ci] = 1; comp.push([cx, cy]);
          stk.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
        }
        if (comp.length > best.length) best = comp;
      }
    }

    /* 連結成分外をWALLに */
    const flSet = new Set(best.map(([x,y]) => y*MW+x));
    for (let y = 0; y < MH; y++)
      for (let x = 0; x < MW; x++)
        if (map[y][x] === T.FLOOR && !flSet.has(y*MW+x)) map[y][x] = T.WALL;

    mainTiles = best;
    if (mainTiles.length >= 280) break;
  }

  if (!mainTiles || mainTiles.length < 50) return genBigRoom(depth); // フォールバック

  /* 階段配置：左40%にSU、右40%にSD */
  const lt = mainTiles.filter(([x]) => x < MW * 0.4);
  const rt = mainTiles.filter(([x]) => x > MW * 0.6);
  const [suX, suY] = pick(lt.length ? lt : mainTiles);
  let sdCandidate = null;
  if (rt.length) { for(let a=0;a<100;a++){const[x,y]=pick(rt);if(x!==suX||y!==suY){sdCandidate=[x,y];break;}} }
  if (!sdCandidate) { const f=mainTiles.filter(([x,y])=>!(x===suX&&y===suY)); sdCandidate=pick(f.length?f:mainTiles); }
  const [sdX, sdY] = sdCandidate;
  map[suY][suX] = T.SU; map[sdY][sdX] = T.SD;
  const su = { x: suX, y: suY }, sd = { x: sdX, y: sdY };

  const corTiles = mainTiles.filter(([x,y]) => !(x===su.x&&y===su.y) && !(x===sd.x&&y===sd.y));
  const rooms = [
    { x: suX-1, y: suY-1, w: 3, h: 3, cx: suX, cy: suY },
    { x: sdX-1, y: sdY-1, w: 3, h: 3, cx: sdX, cy: sdY },
  ];

  const mons = [], items = [], traps = [], springs = [], bigboxes = [];
  const occ = mkOcc(items, mons, traps, springs, bigboxes);
  const rndCor = () => { for(let a=0;a<80;a++){const[x,y]=pick(corTiles);if(!occ(x,y))return[x,y];}return null; };
  const rndCorWide = () => { for(let a=0;a<160;a++){const[x,y]=pick(corTiles);if(!occ(x,y)&&!isNarrowPassage(map,x,y))return[x,y];}return null; };
  for(let i=0;i<rng(6,11)+depth;i++){const p=rndCor();if(p)mons.push(mkMon(depth,p[0],p[1],0.12,null,null,dungeonType));}
  const _cvPick = buildUniPool(depth, dungeonType);
  for(let i=0;i<rng(12,20)+depth;i++){const p=rndCor();if(p){items.push(Object.assign(applyStdMods(_cvPick(),depth),{x:p[0],y:p[1]}));}}
  for(let i=0;i<rng(5,10)+depth;i++){const p=rndCorWide();if(p)traps.push({...pickTrap(),id:uid(),x:p[0],y:p[1],revealed:false});}
  for(let i=0;i<rng(1,3);i++){const p=rndCor();if(p)springs.push({id:uid(),x:p[0],y:p[1],tile:TI.SPRING,contents:[]});}
  const { visible, explored } = mkVis();
  return { map, rooms, monsters: mons, items, traps, springs, bigboxes, stairUp: su, stairDown: sd, visible, explored, shop: null, hiddenRooms: [], monsterHouseRoom: null, waterItems: [], floorType: "caveFloor" };
}

/* ===== 水地形生成 ===== */
function addWaterPools(map, rooms, su, sd) {
  for (const r of rooms) {
    if (r.w < 5 || r.h < 5) continue; /* 小さい部屋はスキップ */
    if (Math.random() >= 0.35) continue; /* 35%の確率で水溜まり */
    const pw = rng(1, Math.min(3, r.w - 4));
    const ph = rng(1, Math.min(2, r.h - 4));
    const px = rng(r.x + 2, r.x + r.w - 2 - pw);
    const py = rng(r.y + 2, r.y + r.h - 2 - ph);
    for (let wy = py; wy < py + ph; wy++) {
      for (let wx = px; wx < px + pw; wx++) {
        if (map[wy][wx] === T.FLOOR &&
            !(wx === su.x && wy === su.y) &&
            !(wx === sd.x && wy === sd.y)) {
          map[wy][wx] = T.WATER;
        }
      }
    }
  }
}

/* ===== FLOATING ISLANDS ===== */
/* 稀に部屋中央に水で囲まれた浮島を生成（浮遊の指輪なしでは到達不可） */
function addFloatingIslands(map, rooms, depth, items, bigboxes, traps, su, sd) {
  const permSpin = { name: "回転板", effect: "spin", tile: 29, permanent: true };
  for (const r of rooms) {
    if (r.w < 7 || r.h < 7) continue;
    if (Math.random() >= 0.18) continue; /* 18%の確率 */
    /* 島のサイズ：最小2×2、部屋が大きければ3×3まで */
    const iw = rng(2, Math.min(3, r.w - 4));
    const ih = rng(2, Math.min(3, r.h - 4));
    const cx = r.x + Math.floor(r.w / 2) - Math.floor(iw / 2);
    const cy = r.y + Math.floor(r.h / 2) - Math.floor(ih / 2);
    /* 水リング + 島が部屋内に収まること（端から2マス以上余裕） */
    if (cx - 1 <= r.x || cx + iw >= r.x + r.w - 1 ||
        cy - 1 <= r.y || cy + ih >= r.y + r.h - 1) continue;
    /* 階段が水リング/島エリアに被らないこと */
    const inIslandArea = (x, y) =>
      x >= cx - 1 && x <= cx + iw && y >= cy - 1 && y <= cy + ih;
    if (inIslandArea(su.x, su.y) || inIslandArea(sd.x, sd.y)) continue;
    /* 通路チェック：リング範囲の壁外に通路床タイルがあればキャンセル */
    let _corridorHit = false;
    for (let _ry = cy - 1; _ry <= cy + ih && !_corridorHit; _ry++) {
      if (map[_ry]?.[r.x - 1] === T.FLOOR) _corridorHit = true;
      if (map[_ry]?.[r.x + r.w] === T.FLOOR) _corridorHit = true;
    }
    for (let _rx = cx - 1; _rx <= cx + iw && !_corridorHit; _rx++) {
      if (map[r.y - 1]?.[_rx] === T.FLOOR) _corridorHit = true;
      if (map[r.y + r.h]?.[_rx] === T.FLOOR) _corridorHit = true;
    }
    if (_corridorHit) continue;
    /* リングエリアに既存アイテム/罠/大箱があればキャンセル */
    let _ringOcc = false;
    outer: for (let _wy = cy - 1; _wy <= cy + ih; _wy++) {
      for (let _wx = cx - 1; _wx <= cx + iw; _wx++) {
        if (_wx >= cx && _wx < cx + iw && _wy >= cy && _wy < cy + ih) continue;
        if (items.some(i => i.x === _wx && i.y === _wy) ||
            traps.some(t => t.x === _wx && t.y === _wy) ||
            bigboxes.some(b => b.x === _wx && b.y === _wy)) { _ringOcc = true; break outer; }
      }
    }
    if (_ringOcc) continue;
    /* 水リングを生成 */
    for (let wy = cy - 1; wy <= cy + ih; wy++) {
      for (let wx = cx - 1; wx <= cx + iw; wx++) {
        if (wx >= cx && wx < cx + iw && wy >= cy && wy < cy + ih) continue; /* 島 */
        if (map[wy][wx] === T.FLOOR) map[wy][wx] = T.WATER;
      }
    }
    /* 島タイルを確実にフロアに */
    for (let wy = cy; wy < cy + ih; wy++)
      for (let wx = cx; wx < cx + iw; wx++)
        map[wy][wx] = T.FLOOR;
    /* 島タイル一覧 */
    const islandTiles = [];
    for (let wy = cy; wy < cy + ih; wy++)
      for (let wx = cx; wx < cx + iw; wx++)
        islandTiles.push([wx, wy]);
    const isOcc = (x, y) =>
      items.some(i => i.x === x && i.y === y) ||
      traps.some(t => t.x === x && t.y === y) ||
      bigboxes.some(b => b.x === x && b.y === y);
    /* 永続回転板を1つ配置 */
    for (let a = 0; a < 30; a++) {
      const [tx2, ty2] = pick(islandTiles);
      if (isOcc(tx2, ty2)) continue;
      traps.push({ ...permSpin, id: uid(), x: tx2, y: ty2, revealed: false });
      break;
    }
    /* アイテムを3〜5個（B/A/Sレアリティ限定、祝福30%呪い10%） */
    const itemCount = rng(3, Math.max(3, Math.min(5, islandTiles.length - 1)));
    let iPlaced = 0;
    for (let a = 0; a < itemCount * 40 && iPlaced < itemCount; a++) {
      const [ix2, iy2] = pick(islandTiles);
      if (isOcc(ix2, iy2)) continue;
      items.push(Object.assign(applyRareMods(pickRareItem(depth), depth), { x: ix2, y: iy2 })); iPlaced++;
    }
    /* 大箱（60%） */
    if (Math.random() < 0.6) {
      for (let a = 0; a < 40; a++) {
        const [bx2, by2] = pick(islandTiles);
        if (isOcc(bx2, by2)) continue;
        const bbt = pickBB();
        bigboxes.push({ id: uid(), x: bx2, y: by2, tile: TI.BIGBOX, kind: bbt.kind, name: bbt.name, capacity: bbt.cap(), contents: [] });
        break;
      }
    }
  }
}

/* ===== ボスフロア生成 ===== */
function genBossFloor(depth, dungeonType = null) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));

  /* 中央アリーナ (40×14) */
  const arX = 10, arY = 8, arW = 40, arH = 14;
  for (let y = arY; y < arY + arH; y++)
    for (let x = arX; x < arX + arW; x++)
      map[y][x] = T.FLOOR;

  /* 北/南コリドー (6マス幅) */
  for (let y = 1; y < arY; y++)
    for (let x = 27; x <= 32; x++) map[y][x] = T.FLOOR;
  for (let y = arY + arH; y < MH - 1; y++)
    for (let x = 27; x <= 32; x++) map[y][x] = T.FLOOR;

  /* 装飾柱 BWALL 2×2 × 四隅 ＋ 中央左右 */
  for (const [px, py] of [
    [13,10],[14,10],[13,11],[14,11],   // NW
    [45,10],[46,10],[45,11],[46,11],   // NE
    [13,18],[14,18],[13,19],[14,19],   // SW
    [45,18],[46,18],[45,19],[46,19],   // SE
    [22,13],[22,14],[22,15],           // 中央左柱
    [37,13],[37,14],[37,15],           // 中央右柱
  ]) { if (map[py]?.[px] === T.FLOOR) map[py][px] = T.BWALL; }

  /* 階段：北端(入口) / 南端(出口) */
  const suX = 29, suY = 1;
  const sdX = 29, sdY = MH - 2;
  map[suY][suX] = T.SU;
  map[sdY][sdX] = T.SD;

  /* ボス配置 */
  const _bossPool = dungeonType === "intermediate" ? INTERMEDIATE_BOSSES : BOSSES;
  const bossIdx = Math.min(Math.floor(depth / 5), _bossPool.length - 1);
  const bt = _bossPool[bossIdx];
  const bossX = arX + (arW >> 1);
  const bossY = arY + (arH >> 1);

  /* クラーケン専用：ボス部屋中央に11×5の水地形を生成 */
  if (bt.baseKind === "im_boss_kraken") {
    const _wW = 11, _wH = 5;
    const _wX = bossX - Math.floor(_wW / 2);
    const _wY = bossY - Math.floor(_wH / 2);
    for (let _wy = _wY; _wy < _wY + _wH; _wy++)
      for (let _wx = _wX; _wx < _wX + _wW; _wx++)
        if (map[_wy]?.[_wx] === T.FLOOR) map[_wy][_wx] = T.WATER;
  }

  const boss = {
    ...bt,
    id: uid(),
    maxHp: bt.hp,
    x: bossX,
    y: bossY,
    baseSpeed: bt.speed || 1,
    turnAccum: 0,
    aware: false,
    dormant: true,
    dir: { x: 0, y: 0 },
    lastPx: bossX,
    lastPy: bossY,
    patrolTarget: null,
  };

  /* 取り巻き：ボスごとに固定種を配置 */
  /* { baseKind, level }[] の配列でボスごとに取り巻き種を定義 */
  const _minionSpec = (() => {
    switch (bt.baseKind) {
      case "im_boss_salamander": return [{ bk: "skeleton", lv: 1 }, { bk: "skeleton", lv: 1 }];
      case "im_boss_titan":      return [{ bk: "crystalslime", lv: 1 }, { bk: "crystalslime", lv: 1 }, { bk: "crystalslime", lv: 1 }];
      case "im_boss_kraken":     return [{ bk: "wateri", lv: 2 }, { bk: "wateri", lv: 2 }, { bk: "wateri", lv: 2 }, { bk: "wateri", lv: 2 }];
      case "im_boss_twohead":    return [{ bk: "monsterthrow", lv: 1 }, { bk: "monsterthrow", lv: 1 }, { bk: "grabber", lv: 2 }, { bk: "grabber", lv: 2 }, { bk: "grabber", lv: 2 }];
      default: return null;
    }
  })();
  const minionCount = _minionSpec ? _minionSpec.length : (bt.bossTier || 1) + 1;
  const minionMonsters = [];
  const DIRS8 = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const _occ = (x, y) => (x === bossX && y === bossY) || minionMonsters.some(mn => mn.x === x && mn.y === y);

  if (_minionSpec) {
    /* 固定種取り巻き：spec1体ずつ配置 */
    const _baseCache = {};
    for (const spec of _minionSpec) {
      const _base = (_baseCache[spec.bk] ??= MONS.find(m => m.baseKind === spec.bk));
      const _wantTile = _base?.waterOnly ? T.WATER : T.FLOOR;
      for (let _mi = 0; _mi < 80; _mi++) {
        const [_ddx, _ddy] = DIRS8[Math.floor(Math.random() * DIRS8.length)];
        const _mx = bossX + _ddx * (1 + Math.floor(_mi / 8));
        const _my = bossY + _ddy * (1 + Math.floor(_mi / 8));
        if (map[_my]?.[_mx] !== _wantTile) continue;
        if (_occ(_mx, _my)) continue;
        minionMonsters.push(makeMonsterFromBase(_base, spec.lv, _mx, _my, { dormant: true, aware: true, lastPx: bossX, lastPy: bossY }));
        break;
      }
    }
  } else {
    const minionDepth = Math.max(0, depth - 2);
    for (let _mi = 0; _mi < minionCount * 20 && minionMonsters.length < minionCount; _mi++) {
      const [_ddx, _ddy] = DIRS8[Math.floor(Math.random() * DIRS8.length)];
      const _mx = bossX + _ddx * (1 + Math.floor(_mi / 8));
      const _my = bossY + _ddy * (1 + Math.floor(_mi / 8));
      if (map[_my]?.[_mx] !== T.FLOOR) continue;
      if (_occ(_mx, _my)) continue;
      minionMonsters.push(makeMonster(minionDepth, _mx, _my, { dormant: true, aware: true, lastPx: bossX, lastPy: bossY, dungeonType }));
    }
  }

  const rooms = [{ x: arX, y: arY, w: arW, h: arH, cx: bossX, cy: bossY }];

  /* ── フロアポピュレーション ── */
  const allMons = [boss, ...minionMonsters];
  const isOccMon = (x, y) => allMons.some(mn => mn.x === x && mn.y === y);
  const isStair = (x, y) => (x === suX && y === suY) || (x === sdX && y === sdY);

  /* アイテム */
  const items = [];
  const itemOcc = (x, y) => isOccMon(x, y) || isStair(x, y) || items.some(i => i.x === x && i.y === y);
  for (let _ii = 0; _ii < rng(8, 14); _ii++) {
    for (let _a = 0; _a < 100; _a++) {
      const ix = rng(arX + 1, arX + arW - 2), iy = rng(arY + 1, arY + arH - 2);
      if (map[iy][ix] !== T.FLOOR || itemOcc(ix, iy)) continue;
      const _it = applyInitialItemCharges({ ...pickLootFromPool(ITEMS), id: uid(), x: ix, y: iy });
      if (_it.type === "gold") _it.value = rng(50, 100 + depth * 30);
      else applyGeneratedBlessCurse(_it, 0.10, 0.25);
      items.push(_it); break;
    }
  }

  /* 罠 */
  const traps = [];
  const trapOcc = (x, y) => isOccMon(x, y) || isStair(x, y) || itemOcc(x, y) || traps.some(t => t.x === x && t.y === y);
  for (let _ti = 0; _ti < rng(4, 8) + depth; _ti++) {
    for (let _a = 0; _a < 100; _a++) {
      const tx = rng(arX + 1, arX + arW - 2), ty = rng(arY + 1, arY + arH - 2);
      if (map[ty][tx] !== T.FLOOR || trapOcc(tx, ty)) continue;
      traps.push({ ...pickTrap(), id: uid(), x: tx, y: ty, revealed: false }); break;
    }
  }

  /* 泉 */
  const springs = [];
  const springOcc = (x, y) => trapOcc(x, y) || springs.some(s => s.x === x && s.y === y);
  for (let _si = 0; _si < rng(1, 3); _si++) {
    for (let _a = 0; _a < 100; _a++) {
      const sx = rng(arX + 1, arX + arW - 2), sy = rng(arY + 1, arY + arH - 2);
      if (map[sy][sx] !== T.FLOOR || springOcc(sx, sy)) continue;
      springs.push({ id: uid(), x: sx, y: sy, tile: TI.SPRING, contents: [] }); break;
    }
  }

  /* 大箱 */
  const bigboxes = [];
  const bbOcc = (x, y) => springOcc(x, y) || bigboxes.some(b => b.x === x && b.y === y);
  for (let _bi = 0; _bi < rng(2, 4); _bi++) {
    for (let _a = 0; _a < 100; _a++) {
      const bx = rng(arX + 1, arX + arW - 2), by = rng(arY + 1, arY + arH - 2);
      if (map[by][bx] !== T.FLOOR || bbOcc(bx, by)) continue;
      const bbt = pickBB();
      bigboxes.push({ id: uid(), x: bx, y: by, tile: TI.BIGBOX, kind: bbt.kind, name: bbt.name, capacity: bbt.cap(), contents: [] }); break;
    }
  }

  /* 隠し部屋（50%の確率で1部屋） */
  const hiddenRooms = Math.random() < 0.5 ? genHiddenRooms(map, depth) : [];
  for (const hr of hiddenRooms) populateHiddenRoom(hr, map, depth, items, bigboxes, springs, traps);

  const vis = Array.from({ length: MH }, () => Array(MW).fill(false));
  const exp = Array.from({ length: MH }, () => Array(MW).fill(false));

  return {
    map, rooms,
    monsters: [boss, ...minionMonsters],
    items, traps, springs, bigboxes,
    stairUp:   { x: suX, y: suY },
    stairDown: { x: sdX, y: sdY },
    visible: vis, explored: exp,
    shop: null, pentacles: [], waterItems: [],
    hiddenRooms, monsterHouseRoom: null,
    floorType: "bossFloor",
    isBossFloor: true,
  };
}

/** 偽階段・風穴・石像・固定転送をフロアにばら撒く */
function attachFloorGimmicks(dg, depth) {
  if (!dg) return dg;
  dg.vents = dg.vents || [];
  dg.statues = dg.statues || [];
  dg.pentacles = dg.pentacles || [];
  dg.traps = dg.traps || [];
  const g = scatterFloorGimmicks(dg.map, dg.rooms || [], depth, {
    traps: dg.traps,
    springs: dg.springs || [],
    bigboxes: dg.bigboxes || [],
    pentacles: dg.pentacles,
    items: dg.items || [],
    stairUp: dg.stairUp,
    stairDown: dg.stairDown,
  });
  if (g.traps?.length) dg.traps.push(...g.traps);
  if (g.vents?.length) dg.vents.push(...g.vents);
  if (g.statues?.length) dg.statues.push(...g.statues);
  if (g.pentacles?.length) dg.pentacles.push(...g.pentacles);
  return dg;
}

export function genDungeon(depth, dungeonType = "beginner", _retries = 0) {
  /* ボスフロア：5の倍数階 (B5F=depth4, B10F=depth9, ...) */
  if (depth % 5 === 4) {
    const _bf = genBossFloor(depth, dungeonType);
    _bf.dungeonType = dungeonType;
    attachFloorGimmicks(_bf, depth);
    return _bf;
  }

  /* 特殊フロア選択（25%の確率でいずれかの特殊フロアになる） */
  /* B1F（depth=0）は特殊フロア一切なし（通常フロア確定） */
  if (depth > 0 && Math.random() < 0.25) {
    const specials = [genBigRoom, genMiddleRoom, genMiniRoom, genShoppingMall, genSpinFloor, genCorridorFloor, genGridRoom, genRingCorridorFloor, genCaveFloor];
    const _sf = pick(specials)(depth, dungeonType);
    _sf.dungeonType = dungeonType;
    attachFloorGimmicks(_sf, depth);
    return _sf;
  }
  const normalLayout = chooseNormalLayout();
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
  const rooms = [];
  const tgt = normalLayout === "wideRooms" ? rng(5, 8) : rng(4, 7);
  for (let i = 0; i < tgt * 60 && rooms.length < tgt; i++) {
    const roll = Math.random();
    let rw,
      rh,
      isL = false;
    if (normalLayout === "wideRooms") {
      if (roll < 0.28) {
        rw = rng(10, Math.min(14, MW - 4));
        rh = rng(6, Math.min(9, MH - 4));
      } else if (roll < 0.44) {
        isL = true;
        rw = rng(7, 11);
        rh = rng(5, 8);
      } else {
        rw = rng(5, 10);
        rh = rng(4, 7);
      }
    } else if (roll < 0.06) {
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
  if (rooms.length < 2) {
    if (_retries > 10) return genBigRoom(depth);
    return genDungeon(depth, dungeonType, _retries + 1);
  }
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
  applyNormalLayoutVariant(map, rooms, pairs, normalLayout);
  /* 部屋の壁に出っ張りを追加（アイテム埋め込み候補となる怪しい壁を生成） */
  const suspiciousWalls = genProtrusions(map, rooms);

  const roomConn = Array(rooms.length).fill(0);
  for (const [ai2, bi2] of pairs) {
    roomConn[ai2]++;
    roomConn[bi2]++;
  }
  /* 出入り口が1つだけの部屋のみ店候補にする（店主1人で塞げる条件） */
  const shopPool = rooms
    .map((_, i) => i)
    .filter((i) => i !== 0 && i !== rooms.length - 1
      && roomConn[i] === 1
      && countRoomEntrances(rooms[i], map) === 1);
  /* 店出現確率40%（B1Fは50%） */
  const _shopChance = depth === 0 ? 0.50 : 0.40;
  let shopRoomIdx =
    shopPool.length > 0 && Math.random() < _shopChance ? pick(shopPool) : -1;
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
      mons.push(mkMon(depth, mx, my, 0.12, null, null, dungeonType));
    }
  }
  const items = [];
  const traps = [];
  const occ = (x, y) =>
    inShop(x, y) || items.some((i) => i.x === x && i.y === y) || mons.some(m => m.x === x && m.y === y) || traps.some(t => t.x === x && t.y === y);
  /* 初心者ダンジョンでは識別系アイテムを除外。ペンは_itemCountループから除外（_penChance枠で管理） */
  const _ITEMS_POOL = dungeonType === "beginner"
    ? ITEMS.filter(it => it.type !== "pen" && !(it.type === "scroll" && it.effect === "identify"))
    : ITEMS.filter(it => it.type !== "pen");
  const _SB_POOL = dungeonType === "beginner"
    ? SPELLBOOKS.filter(sb => sb.spell !== "identify_magic")
    : SPELLBOOKS;
  const _BB_EXCLUDE = dungeonType === "beginner" ? ["identify"] : [];
  /* ── アイテム生成（統合重みプール・完全ランダム個数） ── */
  const _penPool = ITEMS.filter(i => i.type === "pen");
  const _ugGens = [
    { w: 10, fn: () => ({ ...genFood(), id: uid() }) },
    { w: 10, fn: () => { const t = pickLootFromPool(_ITEMS_POOL.filter(i => i.type === "potion")); return { ...t, id: uid() }; } },
    { w:  8, fn: () => { const t = pickLootFromPool(_ITEMS_POOL.filter(i => i.type === "scroll")); return { ...t, id: uid() }; } },
    { w:  8, fn: () => { const t = pickLootFromPool(WANDS); return { ...t, id: uid(), charges: (t.effect==="curse_wand"||t.effect==="bless_wand"||t.effect==="wish"||t.noChargeBoost) ? 1 : t.charges+rng(-1,2) }; } },
    { w:  6, fn: () => { const t = pickLootFromPool(_ITEMS_POOL.filter(i => i.type === "weapon")); return { ...t, id: uid() }; } },
    { w:  5, fn: () => { const t = pickLootFromPool(_ITEMS_POOL.filter(i => i.type === "armor"));  return { ...t, id: uid() }; } },
    { w:  6, fn: () => ({ ...ARROW_T, id: uid(), count: rng(3, 15) }) },
    { w: 14, fn: () => ({ name:"金貨", type:"gold", value: rng(30, 100+depth*30), tile:22, id: uid() }) },
    { w:  4, fn: () => { const t = pickLootFromPool(_SB_POOL); return { ...t, id: uid() }; } },
    { w:  4, fn: () => makePot() },
    { w:  2, fn: () => makeRing() },
    { w:  2, fn: () => { if (!_penPool.length) return { ...genFood(), id: uid() }; const t = pick(_penPool); return { ...t, id: uid(), charges: penInitialCharges(t) }; } },
    { w:  1, fn: () => ({ ...MAGIC_MARKER, id: uid(), charges: rng(1, 2) }) },
  ];
  const _ugTotal = _ugGens.reduce((s, g) => s + g.w, 0);
  const _pickUG = () => {
    let r = Math.random() * _ugTotal;
    for (const g of _ugGens) { r -= g.w; if (r <= 0) return g.fn(); }
    return _ugGens[_ugGens.length - 1].fn();
  };
  /* 床落ちアイテム数：最低を確保しつつ上限を抑える（1個フロアを避ける） */
  const _totalItems = dungeonType === "advanced" || dungeonType === "legend"
    ? rng(3, 6) : dungeonType === "intermediate" ? rng(4, 9) : rng(4, 8);
  for (let i = 0; i < _totalItems; i++) {
    const rm = pick(rooms);
    for (let _a = 0; _a < 30; _a++) {
      const ix = rng(rm.x, rm.x + rm.w - 1);
      const iy = rng(rm.y, rm.y + rm.h - 1);
      if (map[iy][ix] !== T.FLOOR || occ(ix, iy)) continue;
      const it = _pickUG();
      it.x = ix; it.y = iy;
      applyGeneratedBlessCurse(it, 0.10, 0.25);
      if (it.type === "weapon" || it.type === "armor") {
        const pr = Math.random();
        if (pr < 0.05 + depth * 0.01) it.plus = rng(2, 3);
        else if (pr < 0.2 + depth * 0.02) it.plus = 1;
        else it.plus = 0;
        if (!it.ability && Math.random() < 0.25)
          it.ability = pick(it.type === "weapon" ? WEAPON_ABILITIES : ARMOR_ABILITIES).id;
        if (it.ability === "pickaxe" && it.durability == null) it.durability = rng(15, 45);
      }
      items.push(it);
      break;
    }
  }
  /* 罠数：深さに比例して増加。浅い階は少なめ */
  const _trapBase = dungeonType === "advanced" || dungeonType === "legend" ? 0.5 : dungeonType === "intermediate" ? 0.3 : 0.2;
  const _trapGrowth = dungeonType === "advanced" || dungeonType === "legend" ? 1.0 : dungeonType === "intermediate" ? 0.7 : 0.4;
  const _trapMax = dungeonType === "advanced" || dungeonType === "legend" ? 20 : dungeonType === "intermediate" ? 14 : 8;
  const tc = Math.min(_trapMax, Math.max(0, Math.round(rooms.length * _trapBase + depth * _trapGrowth)));
  for (let i = 0; i < tc; i++) {
    const rm = pick(rooms);
    const tx = rng(rm.x + 1, rm.x + rm.w - 2),
      ty = rng(rm.y + 1, rm.y + rm.h - 2);
    if (
      map[ty][tx] === T.FLOOR &&
      !(tx === su.x && ty === su.y) &&
      !(tx === sd.x && ty === sd.y) &&
      !traps.some((t) => t.x === tx && t.y === ty) &&
      !occ(tx, ty)
    ) {
      const t = pickTrap();
      traps.push({ ...t, id: uid(), x: tx, y: ty, revealed: false });
    }
  }
  /* 泉: 60%→0個, 28%→1個, 9%→2個, 3%→3-4個 */
  const _springRoll = Math.random();
  const _springCount = _springRoll < 0.03 ? rng(3, 4) : _springRoll < 0.12 ? 2 : _springRoll < 0.40 ? 1 : 0;
  const springs = [];
  for (let _si = 0; _si < _springCount; _si++) {
    for (let _sa = 0; _sa < 60; _sa++) {
      const rm = pick(rooms);
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
        springs.push({ id: uid(), x: sx2, y: sy2, tile: TI.SPRING, contents: [] });
        break;
      }
    }
  }
  /* 大箱: 55%→0個, 30%→1個, 10%→2個, 5%→3-4個 */
  const _bbRoll = Math.random();
  const _bbCount = _bbRoll < 0.05 ? rng(3, 4) : _bbRoll < 0.15 ? 2 : _bbRoll < 0.45 ? 1 : 0;
  const bigboxes = [];
  for (let bi = 0; bi < _bbCount; bi++) {
    const br = pick(rooms);
    for (let ba = 0; ba < 60; ba++) {
      const bx = rng(br.x + 1, br.x + br.w - 2),
        by = rng(br.y + 1, br.y + br.h - 2);
      if (map[by][bx] !== T.FLOOR) continue;
      if (bx === su.x && by === su.y) continue;
      if (bx === sd.x && by === sd.y) continue;
      if (traps.some((t) => t.x === bx && t.y === by)) continue;
      if (springs.some((s) => s.x === bx && s.y === by)) continue;
      if (items.some((i) => i.x === bx && i.y === by)) continue;
      if (occ(bx, by)) continue;
      const bbt = pickBB(_BB_EXCLUDE);
      bigboxes.push({ id: uid(), x: bx, y: by, tile: TI.BIGBOX, kind: bbt.kind, name: bbt.name, capacity: bbt.cap(), contents: [] });
      break;
    }
  }
  const vis = Array.from({ length: MH }, () => Array(MW).fill(false));
  const exp = Array.from({ length: MH }, () => Array(MW).fill(false));
  let shopData = null;
  if (shopRoomIdx >= 0) {
    const sr2 = rooms[shopRoomIdx];
    shopData = setupShopRoom(sr2, map, depth, items, mons);
    shopData.roomIdx = shopRoomIdx;
  }
  /* 隠し部屋を生成してアイテム等を配置 */
  const hiddenRooms = genHiddenRooms(map, depth);
  for (const hr of hiddenRooms) populateHiddenRoom(hr, map, depth, items, bigboxes, springs, traps);
  /* 壁埋めアイテムを生成（突起コーナーは高確率） */
  genWallItems(map, depth, items, suspiciousWalls);
  /* 水地形を生成（一部部屋に水溜まり）— 店の部屋は除外 */
  const nonShopRooms = shopRoomIdx >= 0 ? rooms.filter((_, i) => i !== shopRoomIdx) : rooms;
  addWaterPools(map, nonShopRooms, su, sd);
  /* 水タイルに被った罠・アイテムを後処理 */
  for (let ti = traps.length - 1; ti >= 0; ti--) {
    if (map[traps[ti].y][traps[ti].x] === T.WATER) traps.splice(ti, 1);
  }
  const waterItems = [];
  for (let ii = items.length - 1; ii >= 0; ii--) {
    const it = items[ii];
    if (map[it.y]?.[it.x] !== T.WATER) continue;
    if (!waterItems.some(wi => wi.x === it.x && wi.y === it.y)) {
      let sunk = it;
      if (it.type === "scroll")   sunk = { ...it, effect: "blank", name: "白紙の巻物" };
      else if (it.type === "spellbook") { const { spell, ...rest } = it; sunk = { ...rest, name: "白紙の魔法書" }; }
      waterItems.push({ x: it.x, y: it.y, item: sunk });
    }
    items.splice(ii, 1);
  }
  /* 水タイルになった大箱を削除 */
  for (let bi = bigboxes.length - 1; bi >= 0; bi--) {
    if (map[bigboxes[bi].y]?.[bigboxes[bi].x] === T.WATER) bigboxes.splice(bi, 1);
  }
  /* 部屋センター周辺の水タイルを床に戻す（通路の連結を保証） */
  /* 通路は各部屋の中心(cx, cy)に繋がるため、その±1マスを水にしない */
  for (const r of nonShopRooms) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = r.cx + dx, ny = r.cy + dy;
        if (map[ny]?.[nx] === T.WATER) map[ny][nx] = T.FLOOR;
      }
    }
  }
  /* 浮島を生成 — 後処理の後に配置することで水リングのギャップを防ぐ */
  addFloatingIslands(map, nonShopRooms, depth, items, bigboxes, traps, su, sd);
  /* waterOnlyモンスター（わてり等）を水タイルに配置 — 全水面操作の後に行う */
  {
    const _waterTiles = [];
    for (let _wy = 0; _wy < MH; _wy++)
      for (let _wx = 0; _wx < MW; _wx++)
        if (map[_wy][_wx] === T.WATER && !mons.some(mn => mn.x === _wx && mn.y === _wy))
          _waterTiles.push([_wx, _wy]);
    const _wCount = Math.min(Math.floor(_waterTiles.length / 4), rng(0, 2) + (depth >= 5 ? 1 : 0));
    for (let _wi = 0; _wi < _wCount; _wi++) {
      if (_waterTiles.length === 0) break;
      const _idx = rng(0, _waterTiles.length - 1);
      const [_wx, _wy] = _waterTiles.splice(_idx, 1)[0];
      if (mons.some(mn => mn.x === _wx && mn.y === _wy)) continue;
      const { base: _wb, spawnLevel: _wsl } = pickMonsterDef(depth, dungeonType);
      /* waterOnlyモンスターが取れなかった場合は専用にわてりを選ぶ */
      const _wBase = _wb.waterOnly ? _wb : (MONS.find(m => m.waterOnly && m.minFloor <= depth + 1 && depth + 1 <= m.maxFloor && (!m.dungeons || !dungeonType || m.dungeons.includes(dungeonType))) ?? null);
      if (!_wBase || !_wBase.waterOnly) continue;
      const { levels: _wl, ...wmt } = _wBase;
      const _wst = _wsl >= 2 && _wBase.levels?.[_wsl - 2] ? { ...wmt, ..._wBase.levels[_wsl - 2], monLevel: _wsl } : wmt;
      mons.push({ ..._wst, id: uid(), x: _wx, y: _wy, maxHp: _wst.hp, turnAccum: 0, aware: false,
        dir: { x: 0, y: 0 }, lastPx: 0, lastPy: 0, patrolTarget: null, dormant: false });
    }
  }
  /* テスト用: 2階(depth=1)は必ずモンスターハウス */
  let monsterHouseRoom = null;
  if (depth === 1) {
    /* 部屋0(スタート)と最後(ゴール)と店以外から最大の部屋を選ぶ */
    const mhCands = rooms.filter((r, i) => i !== 0 && i !== rooms.length - 1 && i !== shopRoomIdx);
    if (mhCands.length > 0) {
      const mhRoom = mhCands.reduce((best, r) => (r.w * r.h > best.w * best.h ? r : best), mhCands[0]);
      genMonsterHouseContent(mhRoom, depth, map, mons, items, traps, springs, bigboxes, su, sd, dungeonType);
      monsterHouseRoom = mhRoom;
    }
  }
  const _floor = {
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
    waterItems,
    monsterHouseRoom,
    hiddenRooms,
    dungeonType,
    vents: [],
    statues: [],
    layoutVariant: normalLayout,
  };
  attachFloorGimmicks(_floor, depth);
  return _floor;
}

/* ===== 最下層変換 ===== */
export const GOAL_ITEMS = {
  tutorial:     { name:"訓練の証",         type:"goal", desc:"最深部で手に入れ、B1Fの上り階段から地上へ持ち帰ればチュートリアル完了。", tile:190 },
  beginner:     { name:"輝く宝玉",       type:"goal", desc:"地上に持ち帰ればダンジョン踏破の証となる。", tile:190 },
  intermediate: { name:"深紅の魔石",     type:"goal", desc:"強大な魔力を秘めた石。地上に持ち帰ろう。",   tile:191 },
  advanced:     { name:"伝説の王冠",     type:"goal", desc:"かつての王が残した冠。地上に持ち帰ろう。",   tile:192 },
  legend:       { name:"深淵の禁書",     type:"goal", desc:"深淵の底に封じられた禁断の書。地上に持ち帰れば真の伝説の冒険者だ。", tile:193 },
};

/** 最終フロアの目標アイテムを置く座標（本来の下り階段位置） */
export function getLastFloorGoalPosition(dg) {
  if (dg?.stairDown) return { x: dg.stairDown.x, y: dg.stairDown.y };
  if (dg?.lastFloorGoalPos) return { x: dg.lastFloorGoalPos.x, y: dg.lastFloorGoalPos.y };
  const gr = dg?.rooms?.[dg.rooms.length - 1];
  return gr
    ? { x: gr.cx ?? (gr.x + Math.floor(gr.w / 2)), y: gr.cy ?? (gr.y + Math.floor(gr.h / 2)) }
    : { x: 0, y: 0 };
}

export function prepareLastFloor(dg, dungeonType) {
  const _goalPos = getLastFloorGoalPosition(dg);
  /* 下り階段を床に変更 */
  if (dg.stairDown) {
    dg.map[dg.stairDown.y][dg.stairDown.x] = T.FLOOR;
    dg.stairDown = null;
  }
  /* 本来の下り階段位置を記録し、そこへ目標アイテムを配置 */
  dg.lastFloorGoalPos = _goalPos;
  const tmpl = GOAL_ITEMS[dungeonType] || GOAL_ITEMS.beginner;
  const goalItem = { ...tmpl, id: uid(), x: _goalPos.x, y: _goalPos.y };
  markItemIdentifiedForDungeon(goalItem, dg);
  dg.items.push(goalItem);
  dg.isLastFloor = true;
}

/* ===== 隠し宝部屋（最下層の落とし穴で到達） ===== */
export function genTreasureRoom(depth) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
  const rx = Math.floor(MW / 2) - 5, ry = Math.floor(MH / 2) - 3;
  const rw = 11, rh = 7;
  const room = { x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw / 2), cy: ry + Math.floor(rh / 2) };
  for (let dy = 0; dy < rh; dy++)
    for (let dx = 0; dx < rw; dx++)
      map[ry + dy][rx + dx] = T.FLOOR;
  /* 上り階段のみ（最下層に戻る） */
  const su = { x: rx + 1, y: ry + 1 };
  map[su.y][su.x] = T.SU;
  /* 宝アイテム配置 */
  const items = [];
  const treasures = [
    { name:"武器強化の巻物", type:"scroll", effect:"weapon_up", desc:"装備中の武器の＋値を1上げる。", tile:18, blessed:true },
    { name:"防具強化の巻物", type:"scroll", effect:"armor_up",  desc:"装備中の防具の＋値を1上げる。", tile:18, blessed:true },
    { name:"武器強化の巻物", type:"scroll", effect:"weapon_up", desc:"装備中の武器の＋値を1上げる。", tile:18, blessed:true },
    { name:"防具強化の巻物", type:"scroll", effect:"armor_up",  desc:"装備中の防具の＋値を1上げる。", tile:18, blessed:true },
    { name:"大回復薬",       type:"potion", effect:"heal_big", value:35, desc:"HPを大幅に回復する。", tile:17 },
    { name:"大回復薬",       type:"potion", effect:"heal_big", value:35, desc:"HPを大幅に回復する。", tile:17 },
  ];
  for (let i = 0; i < treasures.length; i++) {
    const ix = rx + 2 + (i % 5), iy = ry + 2 + Math.floor(i / 5);
    items.push({ ...treasures[i], id: uid(), x: ix, y: iy });
  }
  /* ゴールドを散りばめる */
  for (let i = 0; i < 8; i++) {
    const gx = rng(rx + 1, rx + rw - 2), gy = rng(ry + 1, ry + rh - 2);
    items.push({ name: "ゴールド", type: "gold", value: rng(100, 500 + depth * 50), tile: 22, id: uid(), x: gx, y: gy });
  }
  const vis = Array.from({ length: MH }, () => Array(MW).fill(false));
  const exp = Array.from({ length: MH }, () => Array(MW).fill(false));
  return {
    map, rooms: [room], monsters: [], items, traps: [], springs: [], bigboxes: [],
    stairUp: su, stairDown: null, visible: vis, explored: exp,
    shop: null, pentacles: [], waterItems: [], hiddenRooms: [], monsterHouseRoom: null,
    floorType: "treasureRoom", isTreasureRoom: true,
  };
}

/* ===== DEBUG DUNGEON SHARED HELPERS ===== */
/* アイテム部屋（上半分）とモンスター部屋（下半分）を分けた2部屋レイアウトを生成 */
function makeDebugLayout() {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));

  /* アイテム部屋: rows 1-17, cols 1-(MW-2) */
  const IR = { x: 1, y: 1, w: MW - 2, h: 17 };
  for (let dy = 0; dy < IR.h; dy++)
    for (let dx = 0; dx < IR.w; dx++) map[IR.y + dy][IR.x + dx] = T.FLOOR;

  /* モンスター部屋: rows 19-28, cols 1-(MW-2) — row 18は壁で隔離 */
  const MR = { x: 1, y: 19, w: MW - 2, h: 10 };
  for (let dy = 0; dy < MR.h; dy++)
    for (let dx = 0; dx < MR.w; dx++) map[MR.y + dy][MR.x + dx] = T.FLOOR;
  /* デバッグB1Fでは、全モンスターを実際に見に行けるよう中央に通路を1本だけ開ける */
  map[18][Math.floor(MW / 2)] = T.FLOOR;

  const su = { x: IR.x + 1, y: IR.y + 1 };
  map[su.y][su.x] = T.SU;
  const sd = { x: IR.x + IR.w - 2, y: IR.y + IR.h - 2 };
  map[sd.y][sd.x] = T.SD;

  /* アイテム部屋用nextPos */
  const items = [], traps = [], springs = [], bigboxes = [], mons = [];
  const occI = (x, y) =>
    items.some(i => i.x === x && i.y === y) ||
    traps.some(t => t.x === x && t.y === y) ||
    springs.some(s => s.x === x && s.y === y) ||
    bigboxes.some(b => b.x === x && b.y === y);
  let ic = IR.x + 2, ir = IR.y + 2;
  const nextItemPos = () => {
    while (occI(ic, ir) || (ic === su.x && ir === su.y) || (ic === sd.x && ir === sd.y)) {
      ic++;
      if (ic >= IR.x + IR.w - 1) { ic = IR.x + 2; ir++; }
      if (ir >= IR.y + IR.h - 1) break;
    }
    const pos = { x: ic, y: ir };
    ic++;
    if (ic >= IR.x + IR.w - 1) { ic = IR.x + 2; ir++; }
    return pos;
  };

  /* モンスター部屋用nextPos */
  const occM = (x, y) => mons.some(m => m.x === x && m.y === y);
  let mc = MR.x + 2, mr = MR.y + 1;
  const nextMonPos = () => {
    while (occM(mc, mr)) {
      mc++;
      if (mc >= MR.x + MR.w - 1) { mc = MR.x + 2; mr++; }
      if (mr >= MR.y + MR.h - 1) break;
    }
    const pos = { x: mc, y: mr };
    mc++;
    if (mc >= MR.x + MR.w - 1) { mc = MR.x + 2; mr++; }
    return pos;
  };

  const IR_room = { x: IR.x, y: IR.y, w: IR.w, h: IR.h, cx: IR.x + Math.floor(IR.w / 2), cy: IR.y + Math.floor(IR.h / 2) };
  const MR_room = { x: MR.x, y: MR.y, w: MR.w, h: MR.h, cx: MR.x + Math.floor(MR.w / 2), cy: MR.y + Math.floor(MR.h / 2) };
  return { map, su, sd, items, traps, springs, bigboxes, mons, nextItemPos, nextMonPos, rooms: [IR_room, MR_room] };
}

/* モンスター部屋に全MONSを配置（休眠状態） */
function placeDebugMons(mons, nextMonPos) {
  for (const tmpl of MONS) {
    const p = nextMonPos();
    mons.push({
      ...tmpl, id: uid(), x: p.x, y: p.y, maxHp: tmpl.hp,
      hp: tmpl.hp, turnAccum: 0, aware: false,
      dir: { x: 1, y: 0 }, lastPx: 0, lastPy: 0, patrolTarget: null,
      dormant: true, dormantHouse: true,
    });
  }
}

/* ===== DEBUG DUNGEON B1F (全アイテム・全杖・壺・魔法書・全罠 + 敵は隔離部屋) ===== */
export function genDebugDungeon() {
  const { map, su, sd, items, traps, springs, bigboxes, mons, nextItemPos, nextMonPos, rooms } = makeDebugLayout();

  /* アイテム部屋: ITEMS + WANDS + SPELLBOOKS + POTS + TRAPS + 泉 */
  for (const tmpl of ITEMS) {
    const p = nextItemPos();
    const it = { ...tmpl, id: uid(), x: p.x, y: p.y };
    if (it.type === 'gold') it.value = 9999;
    if (it.type === 'pen') it.charges = penInitialCharges(it);
    items.push(it);
  }
  for (const tmpl of WANDS) {
    const p = nextItemPos();
    items.push({ ...tmpl, charges: tmpl.maxCharges ?? tmpl.charges ?? 5, id: uid(), x: p.x, y: p.y });
  }
  for (const tmpl of SPELLBOOKS) {
    const p = nextItemPos();
    items.push({ ...tmpl, id: uid(), x: p.x, y: p.y });
  }
  for (const tmpl of POTS) {
    const p = nextItemPos();
    items.push({ ...tmpl, id: uid(), x: p.x, y: p.y, contents: [] });
  }
  for (const tmpl of TRAPS) {
    const p = nextItemPos();
    traps.push({ ...tmpl, id: uid(), x: p.x, y: p.y, revealed: true });
  }
  /* 食料（生×4, 調理済み×4） */
  for (let i = 0; i < 8; i++) {
    const p = nextItemPos();
    items.push({ ...genFood(), id: uid(), x: p.x, y: p.y });
  }
  /* 泉×4 */
  for (let i = 0; i < 4; i++) {
    const sp = nextItemPos();
    springs.push({ id: uid(), x: sp.x, y: sp.y, tile: TI.SPRING, contents: [] });
  }
  /* 大箱：各種1つずつ */
  for (const bbt of BB_TYPES) {
    const p = nextItemPos();
    bigboxes.push({ id: uid(), x: p.x, y: p.y, tile: TI.BIGBOX, kind: bbt.kind, name: bbt.name, capacity: bbt.cap(), contents: [] });
  }
  /* 指輪：全種類を1つずつ */
  for (const tmpl of RINGS) {
    const p = nextItemPos();
    items.push({ ...tmpl, id: uid(), x: p.x, y: p.y });
  }

  /* モンスター隔離部屋 */
  placeDebugMons(mons, nextMonPos);

  /* 水地形テスト用：アイテム部屋右下に5×5の水地形を設置 */
  for (let _wy = 12; _wy <= 16; _wy++)
    for (let _wx = 51; _wx <= 55; _wx++)
      if (map[_wy]?.[_wx] === T.FLOOR) map[_wy][_wx] = T.WATER;

  const { visible, explored } = mkVis();
  return {
    map, rooms, monsters: mons, items, traps, springs, bigboxes,
    stairUp: su, stairDown: sd, visible, explored,
    shop: null, hiddenRooms: [], monsterHouseRoom: null, waterItems: [],
    isBigRoom: true, floorType: "debugDungeon",
    noNaturalSpawn: true,
  };
}

/* ===== DEBUG DUNGEON B2F以降 (祝福・呪いアイテム + 敵は隔離部屋) ===== */
export function genDebugDungeonFloor2() {
  const { map, su, sd, items, traps, springs, bigboxes, mons, nextItemPos, nextMonPos, rooms } = makeDebugLayout();

  /* 祝福版・呪い版を各アイテム/杖/魔法書ごとに配置 */
  const blessedCursedTargets = [
    ...ITEMS.filter(t => t.type !== 'gold'),
    ...WANDS,
    ...SPELLBOOKS,
    ...RINGS,
  ];
  for (const variant of [{ blessed: true }, { cursed: true }]) {
    for (const tmpl of blessedCursedTargets) {
      const p = nextItemPos();
      const it = { ...tmpl, ...variant, id: uid(), x: p.x, y: p.y };
      if (tmpl.type === 'wand') it.charges = tmpl.maxCharges ?? tmpl.charges ?? 5;
      else if (tmpl.type === 'pen') it.charges = penInitialCharges(it);
      items.push(it);
    }
  }
  /* 壺（祝呪なし）*/
  for (const tmpl of POTS) {
    const p = nextItemPos();
    items.push({ ...tmpl, id: uid(), x: p.x, y: p.y, contents: [] });
  }
  /* 泉 */
  const sp = nextItemPos();
  springs.push({ id: uid(), x: sp.x, y: sp.y, tile: TI.SPRING, contents: [] });

  /* モンスター隔離部屋 */
  /* 2階デバッグ：ワッカとウィンドメイジのLv1〜3のみ配置 */
  const _f2Kinds = ["wokka", "windmage"];
  const _f2Mons = MONS.filter(m => _f2Kinds.includes(m.baseKind));
  for (const tmpl of _f2Mons) {
    for (let lv = 1; lv <= 3; lv++) {
      const _mp = nextMonPos();
      const _base = lv === 1 ? { ...tmpl } : { ...tmpl, ...(MON_LEVELS[tmpl.baseKind]?.[lv - 2] || {}) };
      mons.push({
        ..._base, id: uid(), x: _mp.x, y: _mp.y, maxHp: _base.hp,
        hp: _base.hp, turnAccum: 0, aware: false, monLevel: lv,
        dir: { x: 1, y: 0 }, lastPx: 0, lastPy: 0, patrolTarget: null,
        dormant: true, dormantHouse: true,
        ...(tmpl.subtype ? { subtype: tmpl.subtype } : {}),
        ...(tmpl.wandEffect ? { wandEffect: tmpl.wandEffect } : {}),
      });
    }
  }

  const { visible, explored } = mkVis();
  return {
    map, rooms, monsters: mons, items, traps, springs, bigboxes,
    stairUp: su, stairDown: sd, visible, explored,
    shop: null, hiddenRooms: [], monsterHouseRoom: null, waterItems: [],
    isBigRoom: true, floorType: "debugDungeon",
  };
}

/* ===== DEBUG DUNGEON フロア別生成 (2F=店, 3-4F=特殊, 5F=ボス) ===== */
export function genDebugFloorByDepth(nd, dungeonType = "beginner") {
  /* nd は実際の階数 (2,3,4,5...) */
  if (nd === 2) {
    const d = genShoppingMall(1, dungeonType); d.dungeonType = dungeonType; return d;
  }
  if (nd === 3 || nd === 4) {
    const specials = [genBigRoom, genMiddleRoom, genMiniRoom, genSpinFloor, genCorridorFloor, genGridRoom, genRingCorridorFloor, genCaveFloor];
    const d = pick(specials)(nd - 1, dungeonType); d.dungeonType = dungeonType; return d;
  }
  if (nd === 5) {
    const d = genBossFloor(4, dungeonType); d.dungeonType = dungeonType; return d;
  }
  /* 6階以降は通常生成 */
  return genDungeon(nd - 1, dungeonType);
}

/* ===== TUTORIAL DUNGEON (全3階固定コンテンツ) ===== */

/* 3部屋＋L字通路でチュートリアルマップを組み立てるヘルパー */
function buildTutorialMap(rs, corrs) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
  const rooms = rs.map(r => {
    for (let ry = r.y; ry < r.y + r.h; ry++)
      for (let rx = r.x; rx < r.x + r.w; rx++)
        map[ry][rx] = T.FLOOR;
    return { x: r.x, y: r.y, w: r.w, h: r.h, cx: r.x + Math.floor(r.w / 2), cy: r.y + Math.floor(r.h / 2) };
  });
  for (const [i, j] of corrs) {
    const a = rooms[i], b = rooms[j];
    const xMin = Math.min(a.cx, b.cx), xMax = Math.max(a.cx, b.cx);
    for (let x = xMin; x <= xMax; x++) if (map[a.cy]?.[x] !== undefined) map[a.cy][x] = T.FLOOR;
    const yMin = Math.min(a.cy, b.cy), yMax = Math.max(a.cy, b.cy);
    for (let y = yMin; y <= yMax; y++) if (map[y]?.[b.cx] !== undefined) map[y][b.cx] = T.FLOOR;
  }
  return { map, rooms };
}

export function genTutorialFloor(floorNum, opts = {}) {
  const mb = opts.mobile ?? false;
  const RA = { x: 6, y: 4, w: 9, h: 6 };
  const RB = { x: 22, y: 4, w: 9, h: 6 };
  const RC = { x: 22, y: 15, w: 9, h: 6 };
  const RD = { x: 6, y: 15, w: 9, h: 6 };
  const isChoiceFloor = floorNum === 2;
  const isReturnFloor = floorNum >= 3;
  const { map, rooms } = isChoiceFloor
    ? buildTutorialMap([RA, RB, RC, RD], [[0, 1], [1, 2], [0, 3], [3, 2]])
    : isReturnFloor
      ? buildTutorialMap([RA, RB, RC, RD], [[0, 1], [1, 2], [2, 3]])
      : buildTutorialMap([RA, RB, RC], [[0, 1], [1, 2]]);

  const su = { x: 7, y: 5 };
  const sd = { x: 29, y: 19 };
  map[su.y][su.x] = T.SU;
  if (!isReturnFloor) map[sd.y][sd.x] = T.SD;

  const items = [];
  const monsters = [];
  const traps = [];
  const springs = [];
  const bigboxes = [];

  const mkSign = (x, y, text) => {
    items.push({ id: uid(), type: "sign", name: "看板", x, y, tile: TI.SIGN, text, noPickup: true, discovered: true });
  };
  const mkMon = (kind, x, y) => {
    const tmpl = MONS.find(m => m.baseKind === kind);
    if (!tmpl) return;
    monsters.push({ ...tmpl, id: uid(), x, y, maxHp: tmpl.hp, baseSpeed: tmpl.speed, turnAccum: 0, aware: false, dir: { x: 0, y: 0 }, lastPx: x, lastPy: y, dormant: true, monLevel: 1, spawnLevel: 1, patrolTarget: null });
  };

  if (floorNum === 1) {
    mkSign(10, 5, [
      mb
        ? "矢印ボタンで移動。敵の方向へ進むと攻撃する。"
        : "矢印キー・テンキーで移動。敵の方向へ進むと攻撃する。",
      "こちらが1回行動すると、敵も1回行動する。まずは床の装備を拾おう。",
      mb
        ? "袋ボタンから、床のロングソードと鎖帷子を装備してみよう。"
        : "Xキーで持ち物を開き、床のロングソードと鎖帷子を装備してみよう。",
    ]);
    const sword = ITEMS.find(i => i.name === "ロングソード");
    const armor = ITEMS.find(i => i.name === "鎖帷子");
    items.push({ ...sword, id: uid(), x: 9, y: 8, plus: 0, fullIdent: true, bcKnown: true });
    items.push({ ...armor, id: uid(), x: 12, y: 8, plus: 0, fullIdent: true, bcKnown: true });
    mkMon("rat", 24, 7);
    mkMon("rat", 27, 18);
    mkSign(23, 16, [
      "傷ついても、満腹なら歩くうちにHPが回復する。食料は空腹になるまで取っておいてもいい。",
      mb ? "「>」の上で足ボタンを押すと次の階へ進む。" : "「>」の上でFキーを押すと次の階へ進む。",
    ]);

  } else if (floorNum === 2) {
    mkSign(10, 5, [
      "正面のゴブリンは殴り合うと危険。眠りの杖を使うか、別の道を探そう。",
      mb ? "杖は袋から「振る」を選び、方向ボタンで狙う。" : "杖は持ち物から「振る」を選び、方向キーで狙う。",
      "敵を全部倒す必要はない。階段へ着けば十分だ。",
    ]);
    const sleepWand = WANDS.find(w => w.effect === "sleep");
    const healPot = ITEMS.find(i => i.effect === "heal");
    if (sleepWand) items.push({ ...sleepWand, id: uid(), x: 9, y: 8, charges: 2, preIdent: true, fullIdent: true, bcKnown: true });
    if (healPot) items.push({ ...healPot, id: uid(), x: 12, y: 8, preIdent: true, fullIdent: true, bcKnown: true });
    mkMon("goblin", 26, 7);
    mkMon("rat", 10, 18);

  } else {
    mkSign(10, 5, [
      "最深部に「訓練の証」がある。手に入れたら、この上り階段まで生きて戻ろう。",
      "鑑定の大箱に道具を投げ入れると識別されるが、そのままでは取り出せない。",
      "さらに道具を投げ入れて容量オーバーさせ、大箱を壊して中身を回収しよう。",
      "道具を残すか今使うか、自分で決めよう。",
    ]);
    const sleepPot = ITEMS.find(i => i.effect === "sleep");
    const teleportScroll = ITEMS.find(i => i.effect === "teleport");
    if (sleepPot) items.push({ ...sleepPot, id: uid(), x: 24, y: 7 });
    if (teleportScroll) items.push({ ...teleportScroll, id: uid(), x: 26, y: 7 });
    const identBB = BB_TYPES.find(b => b.kind === "identify");
    if (identBB) bigboxes.push({ id: uid(), x: 29, y: 7, tile: TI.BIGBOX, kind: identBB.kind, name: identBB.name, capacity: 2, contents: [], revealed: true });
    mkSign(26, 11, [
      "この先の廊下には見えない罠がある。踏むと発動し、姿を現す。",
      "一度姿を現した罠は、歩いて通っても作動しない。",
    ]);
    const arrowTrap = TRAPS.find(t => t.effect === "arrow_trap");
    if (arrowTrap) traps.push({ ...arrowTrap, id: uid(), x: 26, y: 12, revealed: false, permanent: true });
    items.push({ ...genFood(), id: uid(), x: 24, y: 18 });
    items.push({ ...GOAL_ITEMS.tutorial, id: uid(), x: 8, y: 18 });
    mkMon("kobold", 12, 18);
    mkSign(12, 16, [
      "訓練の証を拾ったら引き返そう。敵を倒し切る必要はない。",
      "B1Fの上り階段から地上へ戻れば完了だ。",
    ]);
  }

  const vis = Array.from({ length: MH }, () => Array(MW).fill(false));
  const exp = Array.from({ length: MH }, () => Array(MW).fill(false));
  return {
    map, rooms, monsters, items, traps, springs, bigboxes,
    stairUp: su, stairDown: isReturnFloor ? null : sd, visible: vis, explored: exp,
    shop: null, hiddenRooms: [], monsterHouseRoom: null, waterItems: [], pentacles: [],
    floorType: "tutorialFloor", tutorialFloor: floorNum,
    tutorialObjective: floorNum === 1
      ? "装備を拾い、敵を越えて下り階段へ進もう"
      : floorNum === 2
        ? "杖・迂回・逃走を使い、下り階段へたどり着こう"
        : "訓練の証を手に入れ、B1Fの上り階段から生還しよう",
    isLastFloor: isReturnFloor,
  };
}
