export const MW = 60,
  MH = 30;

export const T = { WALL: "#", FLOOR: ".", DOOR: "+", SD: ">", SU: "<", BWALL: "B", WATER: "~" };

/* Tile indices in spritesheet (8 cols x 4 rows, 16x16 each) */
export const TI = {
  WALL: 0,
  FLOOR: 1,
  SD: 2,
  SU: 3,
  CORR: 4,
  PLAYER: 5,
  SPRING: 31,
  POT: 32,
  PLAYER_DOWN: 33,
  PLAYER_UP: 34,
  PLAYER_LEFT: 35,
  PLAYER_RIGHT: 36,
  SHOPKEEPER: 37,
  BIGBOX: 38,
  PLAYER_DOWN_LEFT: 62,
  PLAYER_DOWN_RIGHT: 63,
  PLAYER_UP_LEFT: 64,
  PLAYER_UP_RIGHT: 65,
  FOOD_COOKED: 66,
};

export const rng = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
export const pick = (arr) => arr[rng(0, arr.length - 1)];
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const removeFloorItem = (dg, item) => { dg.items = dg.items.filter(i => i !== item); };
export const monsterAt = (dg, x, y) => dg.monsters.find(m => m.x === x && m.y === y);
export const itemAt = (dg, x, y) => dg.items.find(i => i.x === x && i.y === y);
export const removeMonster = (dg, mon) => { dg.monsters = dg.monsters.filter(m => m !== mon); };

/**
 * ランダムテレポート先を返す。
 * 現在いる部屋以外のフロアタイルを優先する。
 * 部屋が1つしかない（または廊下にいる）場合はチェビシェフ距離8以上を優先。
 * @param {object} dg - ダンジョン (dg.map, dg.rooms)
 * @param {number} cx - 現在x
 * @param {number} cy - 現在y
 * @param {function} [filter] - 追加フィルタ (x, y) => bool
 * @returns {{x, y}|null}
 */
export function randomTeleportDest(dg, cx, cy, filter = null) {
  const rooms = dg.rooms || [];
  const curRoom = rooms.find(r => cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h);
  const inCur = (x, y) => curRoom
    ? (x >= curRoom.x && x < curRoom.x + curRoom.w && y >= curRoom.y && y < curRoom.y + curRoom.h)
    : false;
  const ok = (x, y) => dg.map[y]?.[x] === T.FLOOR && (!filter || filter(x, y));

  // 別の部屋・廊下へ優先テレポート
  const others = [];
  for (let fy = 0; fy < MH; fy++)
    for (let fx = 0; fx < MW; fx++)
      if (ok(fx, fy) && !inCur(fx, fy)) others.push({ x: fx, y: fy });
  if (others.length > 0) return pick(others);

  // 部屋が1つ → チェビシェフ距離8以上を優先
  const far = [];
  for (let fy = 0; fy < MH; fy++)
    for (let fx = 0; fx < MW; fx++)
      if (ok(fx, fy) && Math.max(Math.abs(fx - cx), Math.abs(fy - cy)) >= 8) far.push({ x: fx, y: fy });
  if (far.length > 0) return pick(far);

  // 最終フォールバック
  const any = [];
  for (let fy = 0; fy < MH; fy++)
    for (let fx = 0; fx < MW; fx++)
      if (ok(fx, fy)) any.push({ x: fx, y: fy });
  return any.length > 0 ? pick(any) : null;
}

let _u = 0;
export const uid = () => `u${++_u}_${Date.now()}`;

/* Drop/search offsets: centre first, then expanding ring */
export const DRO = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
  [-2, 0],
  [2, 0],
  [0, -2],
  [0, 2],
  [-2, -1],
  [-2, 1],
  [2, -1],
  [2, 1],
  [-1, -2],
  [1, -2],
  [-1, 2],
  [1, 2],
  [-2, -2],
  [2, -2],
  [-2, 2],
  [2, 2],
];

const _WH_ORDER = ["weapon","armor","ring","arrow","potion","scroll","food","wand","marker","pen","pot","bottle","gold"];
export function sortWarehouseItems(items) {
  return [...items].sort((a, b) => {
    const oa = _WH_ORDER.indexOf(a.type), ob = _WH_ORDER.indexOf(b.type);
    const ca = oa >= 0 ? oa : _WH_ORDER.length, cb = ob >= 0 ? ob : _WH_ORDER.length;
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name, "ja");
  });
}

/* ショップ配列の正規化: shops || [shop] || [] */
export const getShops = (dg) => dg.shops || (dg.shop ? [dg.shop] : []);

/* アビリティ判定: ability(単体) or abilities(配列) のどちらかにあるか */
export const hasAbility = (item, id) => item?.ability === id || !!item?.abilities?.includes(id);

/* 1マス通路判定：上下左右の床隣接数が2以下 */
export const isNarrowPassage = (map, x, y) => {
  let n = 0;
  for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const t = map[y+dy]?.[x+dx]; if (t === T.FLOOR || t === T.SU || t === T.SD) n++;
  }
  return n <= 2;
};

/* 脆弱の魔方陣チェック: 指定座標が属する部屋内に vulnerability pentacle があるか */
export function findVulnPentacle(dg, x, y) {
  const room = [...(dg.rooms || []), ...(dg.hiddenRooms || [])].find(
    r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
  );
  if (!room) return null;
  return dg.pentacles?.find(pc => pc.kind === "vulnerability" &&
    pc.x >= room.x && pc.x < room.x + room.w && pc.y >= room.y && pc.y < room.y + room.h) || null;
}

/* 重力の魔方陣チェック（通常/祝福）: 座標が非呪い重力ペンタクルの影響下か */
export function hasGravityPentacle(dg, x, y) {
  if (!dg.pentacles) return false;
  const allRooms = [...(dg.rooms || []), ...(dg.hiddenRooms || [])];
  return dg.pentacles.some(pc => {
    if (pc.kind !== "gravity" || pc.cursed) return false;
    if (pc.blessed) return true;
    const pcRoom = allRooms.find(r => pc.x >= r.x && pc.x < r.x + r.w && pc.y >= r.y && pc.y < r.y + r.h);
    const posRoom = allRooms.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    return !!(pcRoom && posRoom && pcRoom === posRoom);
  });
}

/* 呪われた重力の魔方陣チェック: 座標が呪い重力ペンタクルの影響下か */
export function hasCursedGravityPentacle(dg, x, y) {
  if (!dg.pentacles) return false;
  const allRooms = [...(dg.rooms || []), ...(dg.hiddenRooms || [])];
  return dg.pentacles.some(pc => {
    if (pc.kind !== "gravity" || !pc.cursed) return false;
    const pcRoom = allRooms.find(r => pc.x >= r.x && pc.x < r.x + r.w && pc.y >= r.y && pc.y < r.y + r.h);
    const posRoom = allRooms.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    return !!(pcRoom && posRoom && pcRoom === posRoom);
  });
}

/* みかわしの魔方陣チェック: ターゲット座標(x,y)に対するdodgeペンタクル効果。
 * 祝福: フロア全体でdodge、呪い: フロア全体でsure-hit、通常: 同部屋でdodge
 * 戻り値: "dodge" | "sure" | null */
export function getDodgePentacleMode(dg, x, y) {
  if (!dg.pentacles?.length) return null;
  const allRooms = [...(dg.rooms || []), ...(dg.hiddenRooms || [])];
  for (const pc of dg.pentacles) {
    if (pc.kind !== "dodge") continue;
    if (pc.blessed) return "dodge";
    if (pc.cursed) return "sure";
    const pcRoom = allRooms.find(r => pc.x >= r.x && pc.x < r.x + r.w && pc.y >= r.y && pc.y < r.y + r.h);
    const posRoom = allRooms.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    if (pcRoom && posRoom && pcRoom === posRoom) return "dodge";
  }
  return null;
}

export function corridorRange(depth) {
  return depth >= 2 ? 2 : 6;
}

export function computeFOV(map, px, py, rad, vis, exp, rooms = []) {
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) vis[y][x] = false;

  // 部屋内なら同じ部屋全体（+ 隣接壁）を表示（暗闇中は無効）
  if (rad > 1) {
    const playerRoom = rooms.find(r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
    if (playerRoom) {
      for (let ry = playerRoom.y - 1; ry <= playerRoom.y + playerRoom.h; ry++) {
        for (let rx = playerRoom.x - 1; rx <= playerRoom.x + playerRoom.w; rx++) {
          if (rx >= 0 && rx < MW && ry >= 0 && ry < MH) {
            vis[ry][rx] = true;
            exp[ry][rx] = true;
          }
        }
      }
    }
  }

  // 通路視界（レイキャスト）
  for (let a = 0; a < 360; a++) {
    const r = (a * Math.PI) / 180,
      ddx = Math.cos(r),
      ddy = Math.sin(r);
    let x = px + 0.5,
      y = py + 0.5;
    for (let d = 0; d <= rad; d += 0.5) {
      const ix = Math.floor(x),
        iy = Math.floor(y);
      if (ix < 0 || ix >= MW || iy < 0 || iy >= MH) break;
      vis[iy][ix] = true;
      exp[iy][ix] = true;
      if ((map[iy][ix] === T.WALL || map[iy][ix] === T.BWALL) && !(ix === px && iy === py)) break;
      x += ddx * 0.5;
      y += ddy * 0.5;
    }
  }
}

/* FOV再計算 + アイテム発見マーキングを一括実行するラッパー */
export function refreshFOV(dg, p) {
  const torchBonus = (p.visionBonus || 0);
  const rad = ((p.darknessTurns || 0) > 0 ? 1 : corridorRange(p.depth)) + torchBonus;
  computeFOV(dg.map, p.x, p.y, rad, dg.visible, dg.explored, dg.rooms);
  for (const it of dg.items) { if (dg.visible[it.y]?.[it.x]) it.discovered = true; }
}

/* ===== バリア判定：非近接攻撃を一定回数無効化する ===== */
/* 近接以外の攻撃（杖・矢・爆発・状態異常など）が命中した時に呼ぶ。
   バリアがあれば1回分消費してtrueを返す（呼び出し側はダメージをスキップ）。
   barrier は数値（残り回数）。0 またはfalsy なら無効。 */
export function consumeBarrier(m, ml) {
  if (!m.barrier) return false;
  m.barrier -= 1;
  if (m.barrier > 0) {
    ml.push(`${m.name}のバリアが攻撃を弾いた！残り${m.barrier}回！`);
  } else {
    ml.push(`${m.name}のバリアが攻撃を弾いた！バリアが砕けた！`);
  }
  return true;
}

/* ===== 水晶スライム：物理攻撃ダメージを1に丸める ===== */
/* fixedDamageOnlyを持つモンスターへの物理攻撃に適用する。
   近接・矢・投擲など物理扱いにはisPhysical=trueを渡す。
   杖・魔法・爆発はisPhysical=false（デフォルト）でスキップ。 */
export function clampDmgFixed(m, damage, isPhysical = false) {
  if (m.fixedDamageOnly && isPhysical) return Math.min(damage, 1);
  return damage;
}
