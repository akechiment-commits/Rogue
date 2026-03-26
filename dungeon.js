import { rng, pick, uid, clamp, MW, MH, T, TI, getShops, isNarrowPassage } from './utils.js';
import { MONS, MON_LEVELS, BOSSES, makeMonster, pickMonsterDef } from './monsters.js';
import {
  ITEMS, POTS, TRAPS, BB_TYPES, WANDS, WEAPON_ABILITIES, ARMOR_ABILITIES,
  SPELLBOOKS, MAGIC_MARKER, ARROW_T, genFood, makePot, itemPrice, pickWeighted, RINGS,
} from './items.js';

function mkOcc(...lists) {
  return (x, y) => lists.some(l => l.some(e => e.x === x && e.y === y));
}

function makeRing() {
  const t = pickWeighted(RINGS);
  const ring = { ...t, id: uid() };
  if (ring.effect === "power_ring" || ring.effect === "defense_ring" || ring.effect === "life_ring") ring.plus = rng(1, 3);
  const roll = Math.random();
  if (roll < 0.10) ring.blessed = true;
  else if (roll < 0.25) ring.cursed = true;
  return ring;
}

function pickBB() {
  /* レア大箱は20%の確率でのみ候補に含まれる */
  const pool = Math.random() < 0.20 ? BB_TYPES : BB_TYPES.filter(b => !b.rare);
  return pick(pool);
}

/* ===== BIG ROOM DUNGEON GENERATOR ===== */
function genBigRoom(depth) {
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
    mons.push(mkMon(depth, mx, my, 0.15));
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
  for (let i = 0; i < rng(20, 30); i++) {
    const t = pickWeighted(ITEMS);
    const it = { ...t, id: uid(), x: 0, y: 0 };
if (it.type === "gold") it.value = rng(20, 80 + depth * 30);
    if (it.type !== "gold" && it.type !== "arrow") {
      const _blessRoll = Math.random();
      if (_blessRoll < 0.10) it.blessed = true;
      else if (_blessRoll < 0.25) it.cursed = true;
    }
    if (placeInRoom(it)) items.push(it);
  }
  /* 指輪：フロアに0〜1個 (30%の確率) */
  if (Math.random() < 0.30) {
    const _ring = { ...makeRing(), x: 0, y: 0 };
    if (placeInRoom(_ring)) items.push(_ring);
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
      const t = pick(TRAPS);
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
  return { map, rooms, monsters: mons, items, traps, springs, bigboxes, stairUp: su, stairDown: sd,
    visible: vis, explored: exp, shop: null, pentacles: [], waterItems: [], isBigRoom: true, floorType: "bigRoom" };
}

/* ===== MONSTER HOUSE CONTENT GENERATOR ===== */
function genMonsterHouseContent(room, depth, map, mons, items, traps, springs, bigboxes, su, sd) {
  const allOcc = (x, y) =>
    mons.some(m => m.x === x && m.y === y) ||
    items.some(i => i.x === x && i.y === y) ||
    traps.some(t => t.x === x && t.y === y) ||
    springs.some(s => s.x === x && s.y === y) ||
    bigboxes.some(b => b.x === x && b.y === y);
  /* 部屋の床タイル数の約40%を敵で埋める（みっちり） */
  const roomFloorTiles = [];
  for (let fy = room.y + 1; fy < room.y + room.h - 1; fy++)
    for (let fx = room.x + 1; fx < room.x + room.w - 1; fx++)
      if (map[fy][fx] === T.FLOOR && !(fx === su.x && fy === su.y) && !(fx === sd.x && fy === sd.y))
        roomFloorTiles.push([fx, fy]);
  const monCount = Math.max(10, Math.floor(roomFloorTiles.length * 0.4) + depth * 2);
  for (let i = 0; i < monCount * 40 && mons.filter(m => m.dormantHouse).length < monCount; i++) {
    const mx = rng(room.x + 1, room.x + room.w - 2);
    const my = rng(room.y + 1, room.y + room.h - 2);
    if (map[my]?.[mx] !== T.FLOOR) continue;
    if ((mx === su.x && my === su.y) || (mx === sd.x && my === sd.y)) continue;
    if (mons.some(m => m.x === mx && m.y === my)) continue;
    const { levels: _tlvls, ...t } = MONS[clamp(rng(0, depth + 2), 0, MONS.length - 1)];
    mons.push({ ...t, id: uid(), x: mx, y: my, maxHp: t.hp, turnAccum: 0, aware: false,
      dir: { x: [-1,1][rng(0,1)], y: 0 }, lastPx: 0, lastPy: 0, patrolTarget: null,
      dormantHouse: true });
  }
  /* 多めのアイテム */
  const itemCount = rng(8, 14);
  let itemsPlaced = 0;
  for (let i = 0; i < itemCount * 20 && itemsPlaced < itemCount; i++) {
    const ix = rng(room.x, room.x + room.w - 1);
    const iy = rng(room.y, room.y + room.h - 1);
    if (map[iy][ix] !== T.FLOOR) continue;
    if (allOcc(ix, iy)) continue;
    const t = pickWeighted(ITEMS);
    const it = { ...t, id: uid(), x: ix, y: iy };
    if (it.type === "gold") it.value = rng(50, 150 + depth * 40);
    if (it.type !== "gold" && it.type !== "arrow") {
      const _br = Math.random();
      if (_br < 0.12) it.blessed = true;
      else if (_br < 0.28) it.cursed = true;
    }
    items.push(it);
    itemsPlaced++;
  }
  /* 多めの罠 */
  const trapCount = rng(4, 8);
  let trapsPlaced = 0;
  for (let i = 0; i < trapCount * 20 && trapsPlaced < trapCount; i++) {
    const tx = rng(room.x + 1, room.x + room.w - 2);
    const ty = rng(room.y + 1, room.y + room.h - 2);
    if (map[ty][tx] !== T.FLOOR) continue;
    if ((tx === su.x && ty === su.y) || (tx === sd.x && ty === sd.y)) continue;
    if (allOcc(tx, ty)) continue;
    const t = pick(TRAPS);
    traps.push({ ...t, id: uid(), x: tx, y: ty, revealed: false });
    trapsPlaced++;
  }
  /* 高確率で大箱・泉を追加 */
  for (let bi = 0; bi < rng(2, 4); bi++) {
    for (let a = 0; a < 80; a++) {
      const bx = rng(room.x + 1, room.x + room.w - 2);
      const by = rng(room.y + 1, room.y + room.h - 2);
      if (map[by][bx] !== T.FLOOR) continue;
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
      if (map[sy][sx] !== T.FLOOR) continue;
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
  sleeping.forEach(m => { m.dormantHouse = false; m.aware = true; });
  ml.push(`モンスターハウスだ！敵が一斉に目覚めた！(${sleeping.length}体)`);
  dg.monsterSenseActive = true; /* このフロアの全モンスター位置が見えるようになる */
  dg.monsterHouseRoom = null;
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

function populateHiddenRoom(hr, map, depth, items, bigboxes, springs, traps) {
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
  /* アイテム 2〜4個（床タイル数を超えない） */
  const itemCount = rng(2, Math.min(4, floorTiles.length));
  let placed = 0;
  for (let i = 0; i < itemCount * 30 && placed < itemCount; i++) {
    const [ix, iy] = pick(floorTiles);
    if (allOcc(ix, iy)) continue;
    const t = pickWeighted(ITEMS);
    const it = { ...t, id: uid(), x: ix, y: iy };
    if (it.type === 'gold') it.value = rng(100, 300 + depth * 60);
    items.push(it);
    placed++;
  }
  /* 大箱 (50%) */
  if (Math.random() < 0.5) {
    for (let a = 0; a < 40; a++) {
      const [bx, by] = pick(floorTiles);
      if (allOcc(bx, by)) continue;
      const bbt = pickBB();
      bigboxes.push({ id: uid(), x: bx, y: by, tile: TI.BIGBOX, kind: bbt.kind, name: bbt.name, capacity: bbt.cap(), contents: [] });
      break;
    }
  }
  /* 泉 (30%) */
  if (Math.random() < 0.3) {
    for (let a = 0; a < 40; a++) {
      const [sx, sy] = pick(floorTiles);
      if (allOcc(sx, sy)) continue;
      springs.push({ id: uid(), x: sx, y: sy, tile: TI.SPRING, contents: [] });
      break;
    }
  }
  /* 回転板を必ず1枚配置 */
  const spinTrap = { name: "回転板", effect: "spin", tile: 29, permanent: true };
  for (let a = 0; a < 60; a++) {
    const [tx, ty] = pick(floorTiles);
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
    // 60% で突起なし、35% で1個、5% で2個
    const numP = Math.random() < 0.60 ? 0 : Math.random() < 0.93 ? 1 : 2;
    let placed = 0;
    for (let attempt = 0; attempt < numP * 8 && placed < numP; attempt++) {
      const { side, ddx, ddy } = pick(DIRS);
      const isHoriz = ddy !== 0; // 上下方向に突き出す
      const wallLen = isHoriz ? room.w : room.h;   // 壁の長さ
      const pw = rng(2, Math.min(3, wallLen - 2));  // 突起の幅（壁に沿う方向）
      const pd = rng(1, 2);                         // 突起の奥行き（壁から外側）
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
function genWallItems(map, depth, items, suspicious = new Set()) {
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
  const count = rng(2, Math.min(5, wallCands.length));
  const used = new Set();
  let placed = 0;
  for (let i = 0; i < count * 30 && placed < count; i++) {
    const [wx, wy] = pick(wallCands);
    const key = `${wx},${wy}`;
    if (used.has(key) || items.some(it => it.x === wx && it.y === wy)) continue;
    used.add(key);
    const t = pickWeighted(ITEMS);
    const it = { ...t, id: uid(), x: wx, y: wy, wallEmbedded: true };
    if (it.type === 'gold') it.value = rng(50, 200 + depth * 40);
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
function mkMon(depth, x, y, dormantRate = 0.12, map = null, springs = null) {
  /* waterOnlyモンスターは水タイル・泉以外には出現しない。非水タイルの場合は通常モンスターを選び直す */
  let base, spawnLevel;
  for (let _mi = 0; _mi < 8; _mi++) {
    ({ base, spawnLevel } = pickMonsterDef(depth));
    if (!base.waterOnly) break;
    const _isWater = map ? (map[y]?.[x] === T.WATER || springs?.some(s => s.x === x && s.y === y)) : false;
    if (_isWater) break;
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
  let insidePos;
  if (entrance.y < room.y) insidePos = { x: clamp(entrance.x, room.x, room.x + room.w - 1), y: room.y };
  else if (entrance.y >= room.y + room.h) insidePos = { x: clamp(entrance.x, room.x, room.x + room.w - 1), y: room.y + room.h - 1 };
  else if (entrance.x < room.x) insidePos = { x: room.x, y: clamp(entrance.y, room.y, room.y + room.h - 1) };
  else insidePos = { x: room.x + room.w - 1, y: clamp(entrance.y, room.y, room.y + room.h - 1) };
  if (map[insidePos.y]?.[insidePos.x] !== T.FLOOR) {
    outer_s: for (let iy = room.y; iy < room.y + room.h; iy++)
      for (let ix = room.x; ix < room.x + room.w; ix++)
        if (map[iy][ix] === T.FLOOR) { insidePos = { x: ix, y: iy }; break outer_s; }
  }
  const socc = (x, y) => items.some(i => i.x === x && i.y === y);
  const cands = [
    ...ITEMS.filter(i => i.type !== 'gold'),
    ...WANDS.map(w => ({ ...w, charges: Math.max(1, w.charges + rng(-1, 1)) })),
    ...POTS,
    ...RINGS,
    ...SPELLBOOKS, { ...ARROW_T }, { ...MAGIC_MARKER, charges: rng(1, 2) },
  ];
  const cols = clamp(Math.floor(room.w / 2), 2, 5);
  const rows2 = clamp(Math.floor(room.h / 2), 2, 5);
  const sx0 = room.x + Math.floor((room.w - cols) / 2);
  const sy0 = room.y + Math.floor((room.h - rows2) / 2);
  for (let r = 0; r < rows2; r++)
    for (let c = 0; c < cols; c++) {
      const six = sx0 + c, siy = sy0 + r;
      if (map[siy]?.[six] === T.FLOOR && !socc(six, siy) && !(six === insidePos.x && siy === insidePos.y)) {
        const base = pick(cands);
        const sit = { ...base, id: uid(), x: six, y: siy };
        if (sit.type === 'arrow') sit.count = rng(5, 20);
        sit.shopPrice = Math.ceil(itemPrice(sit) * (1 + depth * 0.1));
        sit._shopId = shopId;
        items.push(sit);
      }
    }
  const sk = {
    id: uid(), name: '店主', hp: 200, maxHp: 200, atk: 100, def: 100, exp: 0,
    speed: 1, tile: TI.SHOPKEEPER, type: 'shopkeeper', state: 'friendly',
    blockPos: { ...entrance }, homePos: { ...insidePos },
    x: insidePos.x, y: insidePos.y, turnAccum: 0, aware: false,
    dir: { x: 0, y: 1 }, lastPx: 0, lastPy: 0, patrolTarget: null, sleepTurns: 0,
  };
  mons.push(sk);
  return { id: shopId, room, entrance, shopkeeperId: sk.id, unpaidTotal: 0 };
}

/* ===== MINI BIG ROOM (ビッグルーム小型版) ===== */
function genMiniRoom(depth) {
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
      mons.push(mkMon(depth, mx, my)); break;
    }
  }
  const items = [], traps = [], springs = [], bigboxes = [];
  const occ = mkOcc(items, mons, traps, springs, bigboxes);
  const rndFloor = () => { for (let a = 0; a < 80; a++) { const x = rng(rx, rx + rw - 1), y = rng(ry, ry + rh - 1); if (map[y][x] === T.FLOOR && !occ(x, y) && !(x === su.x && y === su.y) && !(x === sd.x && y === sd.y)) return [x, y]; } return null; };
  for (let i = 0; i < rng(12, 18); i++) { const p = rndFloor(); if (p) { const it = { ...pickWeighted(ITEMS), id: uid(), x: p[0], y: p[1] }; if (it.type === 'gold') it.value = rng(20, 80 + depth * 30); items.push(it); } }
  if (Math.random() < 0.30) { const _rp = rndFloor(); if (_rp) items.push({ ...makeRing(), x: _rp[0], y: _rp[1] }); }
  for (let i = 0; i < rng(6, 12) + depth; i++) { const p = rndFloor(); if (p) traps.push({ ...pick(TRAPS), id: uid(), x: p[0], y: p[1], revealed: false }); }
  for (let i = 0; i < rng(1, 3); i++) { const p = rndFloor(); if (p) springs.push({ id: uid(), x: p[0], y: p[1], tile: TI.SPRING, contents: [] }); }
  for (let i = 0; i < rng(2, 4); i++) { const p = rndFloor(); if (p) { const bbt = pickBB(); bigboxes.push({ id: uid(), x: p[0], y: p[1], tile: TI.BIGBOX, kind: bbt.kind, name: bbt.name, capacity: bbt.cap(), contents: [] }); } }
  const { visible, explored } = mkVis();
  return { map, rooms, monsters: mons, items, traps, springs, bigboxes, stairUp: su, stairDown: sd, visible, explored, shop: null, hiddenRooms: [], monsterHouseRoom: null, waterItems: [], isBigRoom: true, floorType: "miniRoom" };
}

/* ===== SHOPPING MALL (複数店舗フロア) ===== */
function genShoppingMall(depth, _retries = 0) {
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
    return genShoppingMall(depth, _retries + 1);
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
  /* 廊下にモンスター・罠を少量配置 */
  const occ = mkOcc(items, mons, traps);
  const inAnyRoom = (x, y) => validRooms.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  for (let i = 0; i < rng(2, 4); i++) {
    for (let a = 0; a < 80; a++) {
      const mx = rng(1, MW - 2), my = rng(1, MH - 2);
      if (map[my][mx] !== T.FLOOR || occ(mx, my) || inAnyRoom(mx, my)) continue;
      mons.push(mkMon(depth, mx, my)); break;
    }
  }
  for (let i = 0; i < rng(3, 6); i++) {
    for (let a = 0; a < 80; a++) {
      const tx = rng(1, MW - 2), ty = rng(1, MH - 2);
      if (map[ty][tx] !== T.FLOOR || occ(tx, ty) || inAnyRoom(tx, ty) || isNarrowPassage(map, tx, ty)) continue;
      traps.push({ ...pick(TRAPS), id: uid(), x: tx, y: ty, revealed: false }); break;
    }
  }
  const { visible, explored } = mkVis();
  return { map, rooms: validRooms, monsters: mons, items, traps, springs, bigboxes, stairUp: su, stairDown: sd, visible, explored, shop: shopData, shops: allShops, hiddenRooms: [], monsterHouseRoom: null, waterItems: [], floorType: "shoppingMall" };
}

/* ===== SPIN FLOOR (完全独立部屋＋回転板移動) ===== */
function genSpinFloor(depth, _retries = 0) {
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
    return genSpinFloor(depth, _retries + 1);
  }
  /* 階段は最初と最後の部屋 */
  const su = { x: rooms[0].cx, y: rooms[0].cy };
  map[su.y][su.x] = T.SU;
  const sd = { x: rooms[rooms.length - 1].cx, y: rooms[rooms.length - 1].cy };
  map[sd.y][sd.x] = T.SD;
  const mons = [], items = [], traps = [], springs = [], bigboxes = [];
  const occ = mkOcc(items, mons, traps, springs, bigboxes);
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
    /* アイテムを1〜3個 */
    const itemCount = Math.min(rng(1, 3), floorTiles.length);
    let iPlaced = 0;
    for (let a = 0; a < itemCount * 30 && iPlaced < itemCount; a++) {
      const [ix, iy] = pick(floorTiles);
      if (occ(ix, iy)) continue;
      const it = { ...pickWeighted(ITEMS), id: uid(), x: ix, y: iy };
      if (it.type === 'gold') it.value = rng(10, 50 + depth * 20);
      items.push(it); iPlaced++;
    }
    /* モンスターを1体 */
    for (let a = 0; a < 30; a++) {
      const [mx, my] = pick(floorTiles);
      if (occ(mx, my)) continue;
      mons.push(mkMon(depth, mx, my)); break;
    }
  }
  const { visible, explored } = mkVis();
  return { map, rooms, monsters: mons, items, traps, springs, bigboxes, stairUp: su, stairDown: sd, visible, explored, shop: null, hiddenRooms: [], monsterHouseRoom: null, waterItems: [], isBigRoom: true, floorType: "spinFloor" };
}

/* ===== CORRIDOR FLOOR (迷路状廊下フロア) ===== */
function genCorridorFloor(depth) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));

  /* ===== DFS迷路生成 ===== */
  const S = 4; // ノード間隔（ノード間に3タイルの廊下）
  const COLS = Math.floor((MW - 3) / S); // MW=60 → 14列
  const ROWS = Math.floor((MH - 3) / S); // MH=30 → 6行
  const nodeX = c => 2 + c * S;
  const nodeY = r => 2 + r * S;

  /* 全ノード位置をフロアに */
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      map[nodeY(r)][nodeX(c)] = T.FLOOR;

  /* 再帰的バックトラッキングで迷路生成 */
  const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const sc = rng(0, COLS - 1), sr = rng(0, ROWS - 1);
  visited[sr][sc] = true;
  const stack = [[sc, sr]];
  const DIRS4 = [[1,0],[-1,0],[0,1],[0,-1]];
  while (stack.length) {
    const [c, r] = stack[stack.length - 1];
    const unv = DIRS4.map(([dc, dr]) => [c+dc, r+dr])
      .filter(([nc, nr]) => nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS && !visited[nr][nc]);
    if (unv.length) {
      const [nc, nr] = pick(unv);
      const x1=nodeX(c), y1=nodeY(r), x2=nodeX(nc), y2=nodeY(nr);
      if (y1===y2) { const a=Math.min(x1,x2), b=Math.max(x1,x2); for(let x=a;x<=b;x++) map[y1][x]=T.FLOOR; }
      else         { const a=Math.min(y1,y2), b=Math.max(y1,y2); for(let y=a;y<=b;y++) map[y][x1]=T.FLOOR; }
      visited[nr][nc] = true;
      stack.push([nc, nr]);
    } else {
      stack.pop();
    }
  }

  /* ループ追加：袋小路を減らして迷路らしさを強化 */
  for (let i = 0; i < rng(8, 14); i++) {
    const c = rng(0, COLS - 2), r = rng(0, ROWS - 2);
    if (Math.random() < 0.5) {
      const y = nodeY(r); for (let x = nodeX(c); x <= nodeX(c+1); x++) map[y][x] = T.FLOOR;
    } else {
      const x = nodeX(c); for (let y = nodeY(r); y <= nodeY(r+1); y++) map[y][x] = T.FLOOR;
    }
  }

  /* ===== 階段をランダム配置（左1/3にSU、右1/3にSD） ===== */
  const leftNodes = [], rightNodes = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = nodeX(c), y = nodeY(r);
      if (x < MW / 3) leftNodes.push([x, y]);
      else if (x > MW * 2 / 3) rightNodes.push([x, y]);
    }
  }
  const [suX, suY] = pick(leftNodes.length ? leftNodes : [[nodeX(0), nodeY(0)]]);
  const [sdX, sdY] = pick(rightNodes.length ? rightNodes : [[nodeX(COLS-1), nodeY(ROWS-1)]]);
  map[suY][suX] = T.SU;
  map[sdY][sdX] = T.SD;
  const su = { x: suX, y: suY }, sd = { x: sdX, y: sdY };

  const rooms = [
    { x: suX-1, y: suY-1, w: 3, h: 3, cx: suX, cy: suY },
    { x: sdX-1, y: sdY-1, w: 3, h: 3, cx: sdX, cy: sdY },
  ];

  /* ===== スポーン ===== */
  const corTiles = [];
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++)
      if (map[y][x] === T.FLOOR) corTiles.push([x, y]);
  const mons = [], items = [], traps = [], springs = [], bigboxes = [];
  const occ = mkOcc(items, mons, traps, springs, bigboxes);
  const rndCor = () => { for(let a=0;a<60;a++){const[x,y]=pick(corTiles);if(!occ(x,y)&&!(x===su.x&&y===su.y)&&!(x===sd.x&&y===sd.y))return[x,y];}return null; };
  const rndCorWide = () => { for(let a=0;a<120;a++){const[x,y]=pick(corTiles);if(!occ(x,y)&&!(x===su.x&&y===su.y)&&!(x===sd.x&&y===sd.y)&&!isNarrowPassage(map,x,y))return[x,y];}return null; };
  for(let i=0;i<rng(6,10)+depth;i++){const p=rndCor();if(p)mons.push(mkMon(depth,p[0],p[1]));}
  for(let i=0;i<rng(8,14)+depth;i++){const p=rndCor();if(p){const it={...pickWeighted(ITEMS),id:uid(),x:p[0],y:p[1]};if(it.type==='gold')it.value=rng(20,80+depth*30);items.push(it);}}
  for(let i=0;i<rng(5,9)+depth;i++){const p=rndCorWide();if(p)traps.push({...pick(TRAPS),id:uid(),x:p[0],y:p[1],revealed:false});}
  for(let i=0;i<rng(1,3);i++){const p=rndCor();if(p)springs.push({id:uid(),x:p[0],y:p[1],tile:TI.SPRING,contents:[]});}
  const { visible, explored } = mkVis();
  return { map, rooms, monsters: mons, items, traps, springs, bigboxes, stairUp: su, stairDown: sd, visible, explored, shop: null, hiddenRooms: [], monsterHouseRoom: null, waterItems: [], floorType: "corridorFloor" };
}

/* ===== GRID ROOM (格子状壁の大部屋) ===== */
function genGridRoom(depth) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
  const rx = 2, ry = 2, rw = MW - 4, rh = MH - 4;
  for (let dy = 0; dy < rh; dy++)
    for (let dx = 0; dx < rw; dx++) map[ry + dy][rx + dx] = T.FLOOR;
  /* 格子状に柱を配置（3マスおきに1マスの壁） */
  for (let gy = ry + 2; gy < ry + rh - 1; gy += 3)
    for (let gx = rx + 2; gx < rx + rw - 1; gx += 3)
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
  for (let i = 0; i < rng(8, 13) + depth; i++) { const p = rndFloor(); if (p) mons.push(mkMon(depth, p[0], p[1])); }
  for (let i = 0; i < rng(15, 22); i++) { const p = rndFloor(); if (p) { const it = { ...pickWeighted(ITEMS), id: uid(), x: p[0], y: p[1] }; if (it.type === 'gold') it.value = rng(20, 80 + depth * 30); items.push(it); } }
  if (Math.random() < 0.40) { const _rp2 = rndFloor(); if (_rp2) items.push({ ...makeRing(), x: _rp2[0], y: _rp2[1] }); }
  for (let i = 0; i < rng(12, 18) + depth; i++) { const p = rndFloor(); if (p) traps.push({ ...pick(TRAPS), id: uid(), x: p[0], y: p[1], revealed: false }); }
  for (let i = 0; i < rng(2, 4); i++) { const p = rndFloor(); if (p) springs.push({ id: uid(), x: p[0], y: p[1], tile: TI.SPRING, contents: [] }); }
  for (let i = 0; i < rng(2, 4); i++) { const p = rndFloor(); if (p) { const bbt = pickBB(); bigboxes.push({ id: uid(), x: p[0], y: p[1], tile: TI.BIGBOX, kind: bbt.kind, name: bbt.name, capacity: bbt.cap(), contents: [] }); } }
  const { visible, explored } = mkVis();
  return { map, rooms, monsters: mons, items, traps, springs, bigboxes, stairUp: su, stairDown: sd, visible, explored, shop: null, hiddenRooms: [], monsterHouseRoom: null, waterItems: [], isBigRoom: true, floorType: "gridRoom" };
}


/* ===== RING CORRIDOR FLOOR (環状回廊の間) ===== */
function genRingCorridorFloor(depth) {
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

  /* リング間の接続通路 */
  const carveV = (x, ya, yb) => { const a=Math.min(ya,yb), b=Math.max(ya,yb); for(let y=a;y<=b;y++) map[y][x]=T.FLOOR; };
  const carveH = (y, xa, xb) => { const a=Math.min(xa,xb), b=Math.max(xa,xb); for(let x=a;x<=b;x++) map[y][x]=T.FLOOR; };

  /* 外周⟺中周：上下各2本・左右各1本 */
  for (let i = 0; i < 2; i++) carveV(rng(RINGS[1].x1+1, RINGS[1].x2-1), RINGS[0].y1, RINGS[1].y1);
  for (let i = 0; i < 2; i++) carveV(rng(RINGS[1].x1+1, RINGS[1].x2-1), RINGS[1].y2, RINGS[0].y2);
  carveH(rng(RINGS[1].y1+1, RINGS[1].y2-1), RINGS[0].x1, RINGS[1].x1);
  carveH(rng(RINGS[1].y1+1, RINGS[1].y2-1), RINGS[1].x2, RINGS[0].x2);

  /* 中周⟺内周：上下各2本・左右各1本 */
  for (let i = 0; i < 2; i++) carveV(rng(RINGS[2].x1+1, RINGS[2].x2-1), RINGS[1].y1, RINGS[2].y1);
  for (let i = 0; i < 2; i++) carveV(rng(RINGS[2].x1+1, RINGS[2].x2-1), RINGS[2].y2, RINGS[1].y2);
  carveH(rng(RINGS[2].y1+1, RINGS[2].y2-1), RINGS[1].x1, RINGS[2].x1);
  carveH(rng(RINGS[2].y1+1, RINGS[2].y2-1), RINGS[2].x2, RINGS[1].x2);

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
  map[suY][suX] = T.SU; map[sdY][sdX] = T.SD;
  const su = { x: suX, y: suY }, sd = { x: sdX, y: sdY };

  const rooms = [
    { x: suX-1, y: suY-1, w: 3, h: 3, cx: suX, cy: suY },
    { x: sdX-1, y: sdY-1, w: 3, h: 3, cx: sdX, cy: sdY },
  ];

  const corTiles = [];
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++)
      if (map[y][x] === T.FLOOR) corTiles.push([x, y]);
  const mons = [], items = [], traps = [], springs = [], bigboxes = [];
  const occ = mkOcc(items, mons, traps, springs, bigboxes);
  const rndCor = () => { for(let a=0;a<60;a++){const[x,y]=pick(corTiles);if(!occ(x,y)&&!(x===su.x&&y===su.y)&&!(x===sd.x&&y===sd.y))return[x,y];}return null; };
  const rndCorWide = () => { for(let a=0;a<120;a++){const[x,y]=pick(corTiles);if(!occ(x,y)&&!(x===su.x&&y===su.y)&&!(x===sd.x&&y===sd.y)&&!isNarrowPassage(map,x,y))return[x,y];}return null; };
  for(let i=0;i<rng(5,9)+depth;i++){const p=rndCor();if(p)mons.push(mkMon(depth,p[0],p[1]));}
  for(let i=0;i<rng(8,14)+depth;i++){const p=rndCor();if(p){const it={...pickWeighted(ITEMS),id:uid(),x:p[0],y:p[1]};if(it.type==='gold')it.value=rng(20,80+depth*30);items.push(it);}}
  for(let i=0;i<rng(4,8)+depth;i++){const p=rndCorWide();if(p)traps.push({...pick(TRAPS),id:uid(),x:p[0],y:p[1],revealed:false});}
  for(let i=0;i<rng(1,2);i++){const p=rndCor();if(p)springs.push({id:uid(),x:p[0],y:p[1],tile:TI.SPRING,contents:[]});}
  const { visible, explored } = mkVis();
  return { map, rooms, monsters: mons, items, traps, springs, bigboxes, stairUp: su, stairDown: sd, visible, explored, shop: null, hiddenRooms: [], monsterHouseRoom: null, waterItems: [], floorType: "ringCorridorFloor" };
}

/* ===== CAVE FLOOR (洞窟の間) ===== */
function genCaveFloor(depth) {
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
  for(let i=0;i<rng(6,11)+depth;i++){const p=rndCor();if(p)mons.push(mkMon(depth,p[0],p[1]));}
  for(let i=0;i<rng(10,16)+depth;i++){const p=rndCor();if(p){const it={...pickWeighted(ITEMS),id:uid(),x:p[0],y:p[1]};if(it.type==='gold')it.value=rng(20,80+depth*30);items.push(it);}}
  for(let i=0;i<rng(5,10)+depth;i++){const p=rndCorWide();if(p)traps.push({...pick(TRAPS),id:uid(),x:p[0],y:p[1],revealed:false});}
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
    /* 島のサイズ (1×1 or 2×1 or 1×2) */
    const iw = Math.random() < 0.4 ? 2 : 1;
    const ih = Math.random() < 0.4 ? 2 : 1;
    const cx = r.x + Math.floor(r.w / 2) - Math.floor(iw / 2);
    const cy = r.y + Math.floor(r.h / 2) - Math.floor(ih / 2);
    /* 水リング + 島が部屋内に収まること（端から2マス以上余裕） */
    if (cx - 1 <= r.x || cx + iw >= r.x + r.w - 1 ||
        cy - 1 <= r.y || cy + ih >= r.y + r.h - 1) continue;
    /* 階段が水リング/島エリアに被らないこと */
    const inIslandArea = (x, y) =>
      x >= cx - 1 && x <= cx + iw && y >= cy - 1 && y <= cy + ih;
    if (inIslandArea(su.x, su.y) || inIslandArea(sd.x, sd.y)) continue;
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
    /* アイテムを3〜5個 */
    const itemCount = rng(3, Math.min(5, islandTiles.length * 3));
    let iPlaced = 0;
    for (let a = 0; a < itemCount * 40 && iPlaced < itemCount; a++) {
      const [ix2, iy2] = pick(islandTiles);
      if (isOcc(ix2, iy2)) continue;
      const it = { ...pickWeighted(ITEMS), id: uid(), x: ix2, y: iy2 };
      if (it.type === "gold") it.value = rng(100, 300 + depth * 60);
      items.push(it); iPlaced++;
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
function genBossFloor(depth) {
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
  const bossIdx = Math.min(Math.floor(depth / 5), BOSSES.length - 1);
  const bt = BOSSES[bossIdx];
  const bossX = arX + (arW >> 1);
  const bossY = arY + (arH >> 1);
  const boss = {
    ...bt,
    id: uid(),
    maxHp: bt.hp,
    x: bossX,
    y: bossY,
    baseSpeed: bt.speed || 1,
    turnAccum: 0,
    aware: false,
    dir: { x: 0, y: 0 },
    lastPx: bossX,
    lastPy: bossY,
    patrolTarget: null,
  };

  /* 取り巻き：ボスの周囲にtier×1+1体を配置 */
  const minionCount = (bt.bossTier || 1) + 1;
  const minionDepth = Math.max(0, depth - 2);
  const minionMonsters = [];
  const DIRS8 = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const _occ = (x, y) => (x === bossX && y === bossY) || minionMonsters.some(mn => mn.x === x && mn.y === y);
  for (let _mi = 0; _mi < minionCount * 20 && minionMonsters.length < minionCount; _mi++) {
    const [_ddx, _ddy] = DIRS8[Math.floor(Math.random() * DIRS8.length)];
    const _mx = bossX + _ddx * (1 + Math.floor(_mi / 8));
    const _my = bossY + _ddy * (1 + Math.floor(_mi / 8));
    if (map[_my]?.[_mx] !== T.FLOOR) continue;
    if (_occ(_mx, _my)) continue;
    minionMonsters.push(makeMonster(minionDepth, _mx, _my, { aware: true, lastPx: bossX, lastPy: bossY }));
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
      const _it = { ...pickWeighted(ITEMS), id: uid(), x: ix, y: iy };
      if (_it.type === "gold") _it.value = rng(50, 100 + depth * 30);
      else { const _br = Math.random(); if (_br < 0.10) _it.blessed = true; else if (_br < 0.25) _it.cursed = true; }
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
      traps.push({ ...pick(TRAPS), id: uid(), x: tx, y: ty, revealed: false }); break;
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

export function genDungeon(depth, dungeonType = "beginner", _retries = 0) {
  /* ボスフロア：5の倍数階 (B5F=depth4, B10F=depth9, ...) */
  if (depth % 5 === 4) return genBossFloor(depth);

  /* 特殊フロア選択（25%の確率でいずれかの特殊フロアになる） */
  /* B1F（depth=0）は店のみ許可・それ以外の特殊フロアは出現しない */
  if (Math.random() < 0.25) {
    const specials = depth === 0
      ? [genShoppingMall]
      : [genBigRoom, genMiniRoom, genShoppingMall, genSpinFloor, genCorridorFloor, genGridRoom, genRingCorridorFloor, genCaveFloor];
    return pick(specials)(depth, dungeonType);
  }
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
  /* 部屋の壁に出っ張りを追加（アイテム埋め込み候補となる怪しい壁を生成） */
  const suspiciousWalls = genProtrusions(map, rooms);

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
    shopPool.length > 0 ? pick(shopPool) : -1;
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
      mons.push(mkMon(depth, mx, my));
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
  const traps = [];
  const occ = (x, y) =>
    inShop(x, y) || items.some((i) => i.x === x && i.y === y) || mons.some(m => m.x === x && m.y === y) || traps.some(t => t.x === x && t.y === y);
  const _itemCount = dungeonType === "advanced" || dungeonType === "legend" ? rng(1, 3) : dungeonType === "intermediate" ? rng(2, 4) : rng(4, 6);
  for (let i = 0; i < _itemCount; i++) {
    const rm = pick(rooms);
    const ix = rng(rm.x, rm.x + rm.w - 1),
      iy = rng(rm.y, rm.y + rm.h - 1);
    if (map[iy][ix] === T.FLOOR && !occ(ix, iy)) {
      const t = pickWeighted(ITEMS);
      const it = { ...t, id: uid(), x: ix, y: iy };
      if (it.type === "gold") it.value = rng(20, 80 + depth * 30);
      if (it.type !== "gold" && it.type !== "arrow") {
        const _blessRoll = Math.random();
        if (_blessRoll < 0.10)      it.blessed = true;
        else if (_blessRoll < 0.25) it.cursed  = true;
      }
      if (it.type === "weapon" || it.type === "armor") {
        const pr = Math.random();
        if (pr < 0.05 + depth * 0.01) it.plus = rng(2, 3);
        else if (pr < 0.2 + depth * 0.02) it.plus = 1;
        if (it.ability === "pickaxe") it.durability = rng(15, 45);
        if (!it.ability && Math.random() < 0.25) {
          const abls =
            it.type === "weapon" ? WEAPON_ABILITIES : ARMOR_ABILITIES;
          it.ability = pick(abls).id;
        }
      }
      items.push(it);
    }
  }
  /* サブアイテムをプール方式でランダム生成（系統ごとの上限なし・後で重み調整可） */
  const _subPoolSize = dungeonType === "advanced" || dungeonType === "legend" ? rng(2, 5) : dungeonType === "intermediate" ? rng(3, 6) : rng(4, 8);
  const _subGens = [
    /* 矢 */       () => ({ ...ARROW_T, id: uid(), count: rng(3, 15) }),
    /* 杖 */       () => { const t = pickWeighted(WANDS); return { ...t, id: uid(), charges: t.charges + rng(-1, 2) }; },
    /* 魔法書 */   () => { const sb = pickWeighted(SPELLBOOKS); return { ...sb, id: uid() }; },
    /* 食料 x2 */  () => { const f = genFood(); return { ...f, id: uid() }; },
    /* 食料 x2 */  () => { const f = genFood(); return { ...f, id: uid() }; },
    /* 壺 */       () => makePot(),
    /* 魔法筆 */   () => ({ ...MAGIC_MARKER, id: uid(), charges: rng(1, 2) }),
  ];
  for (let i = 0; i < _subPoolSize; i++) {
    const rm = pick(rooms);
    const ix = rng(rm.x, rm.x + rm.w - 1),
      iy = rng(rm.y, rm.y + rm.h - 1);
    if (map[iy][ix] === T.FLOOR && !occ(ix, iy)) {
      const it = pick(_subGens)();
      it.x = ix;
      it.y = iy;
      items.push(it);
    }
  }
  /* Pen spawn（特殊低確率、別枠） */
  const _penChance = dungeonType === "advanced" || dungeonType === "legend" ? 0.05 : dungeonType === "intermediate" ? 0.10 : 0.15;
  if (Math.random() < _penChance) {
    const _penPool = ITEMS.filter((it) => it.type === "pen");
    if (_penPool.length > 0) {
      const rm = pick(rooms);
      const ix = rng(rm.x, rm.x + rm.w - 1),
        iy = rng(rm.y, rm.y + rm.h - 1);
      if (map[iy][ix] === T.FLOOR && !occ(ix, iy)) {
        const _pt = pick(_penPool);
        items.push({ ..._pt, id: uid(), x: ix, y: iy, charges: rng(2, 3) });
      }
    }
  }
  const _trapsPerRoom = dungeonType === "advanced" || dungeonType === "legend" ? 3 : dungeonType === "intermediate" ? 2 : 1;
  const tc = rooms.length * _trapsPerRoom;
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
      const t = pick(TRAPS);
      traps.push({ ...t, id: uid(), x: tx, y: ty, revealed: false });
    }
  }
  const springs = [];
  for (let i = 0; i < rng(1, 3); i++) {
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
        if (bigboxes.some((b) => b.x === bx && b.y === by)) continue;
        if (occ(bx, by)) continue;
        const bbt = pickBB();
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
    if (entrance.y < sr2.y) insidePos = { x: clamp(entrance.x, sr2.x, sr2.x + sr2.w - 1), y: sr2.y };
    else if (entrance.y >= sr2.y + sr2.h)
      insidePos = { x: clamp(entrance.x, sr2.x, sr2.x + sr2.w - 1), y: sr2.y + sr2.h - 1 };
    else if (entrance.x < sr2.x) insidePos = { x: sr2.x, y: clamp(entrance.y, sr2.y, sr2.y + sr2.h - 1) };
    else insidePos = { x: sr2.x + sr2.w - 1, y: clamp(entrance.y, sr2.y, sr2.y + sr2.h - 1) };
    /* insidePos がフロアタイルでない場合は部屋内の最初のフロアに補正 */
    if (map[insidePos.y]?.[insidePos.x] !== T.FLOOR) {
      let _fixed = false;
      outer: for (let _iy = sr2.y; _iy < sr2.y + sr2.h; _iy++) {
        for (let _ix = sr2.x; _ix < sr2.x + sr2.w; _ix++) {
          if (map[_iy][_ix] === T.FLOOR) { insidePos = { x: _ix, y: _iy }; _fixed = true; break outer; }
        }
      }
      if (!_fixed) insidePos = { x: sr2.cx, y: sr2.cy };
    }
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
          const base = pick(shopCands);
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
      hp: 200,
      maxHp: 200,
      atk: 100,
      def: 100,
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
  /* 隠し部屋を生成してアイテム等を配置 */
  const hiddenRooms = genHiddenRooms(map, depth);
  for (const hr of hiddenRooms) populateHiddenRoom(hr, map, depth, items, bigboxes, springs, traps);
  /* 壁埋めアイテムを生成（突起コーナーは高確率） */
  genWallItems(map, depth, items, suspiciousWalls);
  /* 水地形を生成（一部部屋に水溜まり）— 店の部屋は除外 */
  const nonShopRooms = shopRoomIdx >= 0 ? rooms.filter((_, i) => i !== shopRoomIdx) : rooms;
  addWaterPools(map, nonShopRooms, su, sd);
  /* 浮島を生成 — 店の部屋は除外 */
  addFloatingIslands(map, nonShopRooms, depth, items, bigboxes, traps, su, sd);
  /* waterOnlyモンスター（わてり等）を水タイルに配置 */
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
      const { base: _wb, spawnLevel: _wsl } = pickMonsterDef(depth);
      /* waterOnlyモンスターが取れなかった場合は専用にわてりを選ぶ */
      const _wBase = _wb.waterOnly ? _wb : (MONS.find(m => m.waterOnly && m.minFloor <= depth + 1 && depth + 1 <= m.maxFloor) ?? null);
      if (!_wBase.waterOnly) continue;
      const { levels: _wl, ...wmt } = _wBase;
      const _wst = _wsl >= 2 && _wBase.levels?.[_wsl - 2] ? { ...wmt, ..._wBase.levels[_wsl - 2], monLevel: _wsl } : wmt;
      mons.push({ ..._wst, id: uid(), x: _wx, y: _wy, maxHp: _wst.hp, turnAccum: 0, aware: false,
        dir: { x: 0, y: 0 }, lastPx: 0, lastPy: 0, patrolTarget: null, dormant: false });
    }
  }
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
  /* テスト用: 2階(depth=1)は必ずモンスターハウス */
  let monsterHouseRoom = null;
  if (depth === 1) {
    /* 部屋0(スタート)と最後(ゴール)と店以外から最大の部屋を選ぶ */
    const mhCands = rooms.filter((r, i) => i !== 0 && i !== rooms.length - 1 && i !== shopRoomIdx);
    if (mhCands.length > 0) {
      const mhRoom = mhCands.reduce((best, r) => (r.w * r.h > best.w * best.h ? r : best), mhCands[0]);
      genMonsterHouseContent(mhRoom, depth, map, mons, items, traps, springs, bigboxes, su, sd);
      monsterHouseRoom = mhRoom;
    }
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
    waterItems,
    monsterHouseRoom,
    hiddenRooms,
  };
}

/* ===== 最下層変換 ===== */
export const GOAL_ITEMS = {
  beginner:     { name:"輝く宝玉",       type:"goal", desc:"地上に持ち帰ればダンジョン踏破の証となる。", tile:22 },
  intermediate: { name:"深紅の魔石",     type:"goal", desc:"強大な魔力を秘めた石。地上に持ち帰ろう。",   tile:22 },
  advanced:     { name:"伝説の王冠",     type:"goal", desc:"かつての王が残した冠。地上に持ち帰ろう。",   tile:22 },
  legend:       { name:"深淵の禁書",     type:"goal", desc:"深淵の底に封じられた禁断の書。地上に持ち帰れば真の伝説の冒険者だ。", tile:22 },
};

export function prepareLastFloor(dg, dungeonType) {
  /* 下り階段を床に変更 */
  if (dg.stairDown) {
    dg.map[dg.stairDown.y][dg.stairDown.x] = T.FLOOR;
    dg.stairDown = null;
  }
  /* 目標アイテムを最後の部屋の中央付近に配置 */
  const tmpl = GOAL_ITEMS[dungeonType] || GOAL_ITEMS.beginner;
  const gr = dg.rooms[dg.rooms.length - 1];
  const gx = gr.cx ?? (gr.x + Math.floor(gr.w / 2));
  const gy = gr.cy ?? (gr.y + Math.floor(gr.h / 2));
  dg.items.push({ ...tmpl, id: uid(), x: gx, y: gy });
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
    { name:"大回復薬",       type:"potion", effect:"heal", value:35, desc:"HPを大幅に回復する。", tile:17 },
    { name:"大回復薬",       type:"potion", effect:"heal", value:35, desc:"HPを大幅に回復する。", tile:17 },
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
      dormant: true,
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

  const { visible, explored } = mkVis();
  return {
    map, rooms, monsters: mons, items, traps, springs, bigboxes,
    stairUp: su, stairDown: sd, visible, explored,
    shop: null, hiddenRooms: [], monsterHouseRoom: null, waterItems: [],
    isBigRoom: true, floorType: "debugDungeon",
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
        dormant: true,
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
