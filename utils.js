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
  SIGN: 110,
  BREAKABLE_WALL: 134,
  OUTER_WALL: 135,
  WATER: 136,
  PENTACLE: 74,
  BONES: 107,
  STATUE: 129,
  FIXED_PORTAL: 130,
  ITEM_POTION: 4001,
  ITEM_BOTTLE: 4002,
  ITEM_PEN: 4003,
};

/**
 * シードから再現可能な 0 以上 1 未満の乱数関数を作る。
 * 乱数を受け取れるドメイン関数に渡して、生成・抽選のテストを固定できる。
 */
export function createSeededRng(seed) {
  let state = 2166136261;
  for (const char of String(seed)) {
    state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  }
  state = (state >>> 0) || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rng = (a, b, randomFn = Math.random) => Math.floor(randomFn() * (b - a + 1)) + a;

/**
 * 攻撃 vs 防御のダメージ計算。
 * 1) 従来: floor(atk^2 / (atk + floor(def * defWeight)))
 * 2) 防御のソフト割合軽減: 最終ダメージ *= (1 - min(maxRed, def/(def+softK)))
 *    softK が大きいほど割合軽減は弱い。maxRed で上限を切る（デフォルト40%）。
 * 3) 乱数 ±2（variance）
 *
 * 敵→プレイヤーは defWeight=1.5、プレイヤー→敵・矢は defWeight=1（従来どおり）。
 */
export const DEF_SOFT_K = 80;
export const DEF_SOFT_MAX_RED = 0.40;

export function calcAtkDefDmg(atk, def, {
  defWeight = 1,
  softK = DEF_SOFT_K,
  maxRed = DEF_SOFT_MAX_RED,
  variance = true,
  rngFn = rng,
} = {}) {
  const ap = Math.max(1, Math.floor(Number(atk) || 0));
  const df = Math.max(0, Math.floor(Number(def) || 0));
  const denom = ap + Math.floor(df * defWeight);
  let base = Math.floor((ap * ap) / Math.max(1, denom));
  if (base === 0) base = 1;
  /* 割合軽減：def15 ≒ 15.8%、def30 ≒ 27%、def80 ≒ 40%（上限） */
  const red = Math.min(maxRed, df / (df + softK));
  base = Math.max(1, Math.floor(base * (1 - red)));
  if (variance) base = Math.max(1, base + rngFn(-2, 2));
  return base;
}

/** 風穴 5x5 内なら風向き、なければ null（dg.vents 依存・循環 import 回避のため utils に置く） */
export function getWindAt(dg, x, y) {
  for (const v of dg?.vents || []) {
    if (Math.abs(x - v.x) <= 2 && Math.abs(y - v.y) <= 2) {
      return { dx: v.dx, dy: v.dy, vent: v };
    }
  }
  return null;
}

/** 飛び道具の進行方向を風で上書き */
export function applyWindDir(dg, x, y, dx, dy) {
  const w = getWindAt(dg, x, y);
  if (!w) return { dx, dy, bent: false };
  if (w.dx === dx && w.dy === dy) return { dx, dy, bent: false };
  return { dx: w.dx, dy: w.dy, bent: true };
}

/**
 * 飛び道具を1マス進める。
 * wind:true のとき風穴で方向上書き（物理弾・ブレス・石）。
 * wind:false は魔法弾・杖（曲がらない）。
 * @returns {{ x: number, y: number, dx: number, dy: number, bent: boolean }}
 */
export function stepProjectile(dg, cx, cy, dx, dy, { wind = true } = {}) {
  let fdx = Math.sign(dx || 0), fdy = Math.sign(dy || 0);
  if (fdx === 0 && fdy === 0) fdy = 1;
  const origDx = fdx, origDy = fdy;
  if (wind) {
    let w = applyWindDir(dg, cx, cy, fdx, fdy);
    if (w.bent) { fdx = w.dx; fdy = w.dy; }
    /* 進入先が風域なら、入る瞬間に曲がる */
    let nx = cx + fdx, ny = cy + fdy;
    w = applyWindDir(dg, nx, ny, fdx, fdy);
    if (w.bent) {
      fdx = w.dx; fdy = w.dy;
      nx = cx + fdx; ny = cy + fdy;
    }
    return {
      x: nx, y: ny, dx: fdx, dy: fdy,
      bent: fdx !== origDx || fdy !== origDy,
    };
  }
  return { x: cx + fdx, y: cy + fdy, dx: fdx, dy: fdy, bent: false };
}

/**
 * 飛び道具の経路をトレース。
 * @returns {{ path: {x,y}[], hitSelf: boolean, bent: boolean, endX: number, endY: number, dx: number, dy: number }}
 * path[0] は発射点。
 */
export function traceProjectilePath(dg, sx, sy, dx, dy, maxRange, {
  stopAtWall = true,
  stopAtMon = true,
  stopAtPlayer = null, /* {x,y} を渡すと自分ヒット検出（発射点は無視） */
  stopAtContainers = false,
  passWall = false,
  wind = true,
} = {}) {
  const path = [{ x: sx, y: sy }];
  let fdx = Math.sign(dx || 0), fdy = Math.sign(dy || 0);
  if (fdx === 0 && fdy === 0) fdy = 1;
  let cx = sx, cy = sy, bent = false, hitSelf = false;
  for (let d = 1; d <= maxRange; d++) {
    const st = stepProjectile(dg, cx, cy, fdx, fdy, { wind });
    if (st.bent) bent = true;
    fdx = st.dx; fdy = st.dy;
    const tx = st.x, ty = st.y;
    if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
    if (stopAtWall && !passWall && (dg.map[ty]?.[tx] === T.WALL || dg.map[ty]?.[tx] === T.BWALL)) break;
    path.push({ x: tx, y: ty });
    cx = tx; cy = ty;
    if (stopAtPlayer && (tx !== sx || ty !== sy) && tx === stopAtPlayer.x && ty === stopAtPlayer.y) {
      hitSelf = true;
      break;
    }
    if (stopAtMon && monsterAt(dg, tx, ty)) break;
    if (stopAtContainers) {
      if (dg.springs?.some(s => s.x === tx && s.y === ty)) break;
      if (dg.bigboxes?.some(b => b.x === tx && b.y === ty)) break;
    }
  }
  const end = path[path.length - 1];
  return { path, hitSelf, bent, endX: end.x, endY: end.y, dx: fdx, dy: fdy };
}

/** 折れ線 path 上の progress(0..1) におけるピクセル/マス座標 */
export function pointOnPath(path, t) {
  if (!path?.length) return { x: 0, y: 0 };
  if (path.length === 1) return { x: path[0].x, y: path[0].y };
  const segs = path.length - 1;
  const u = Math.max(0, Math.min(1, t)) * segs;
  const i = Math.min(segs - 1, Math.floor(u));
  const f = u - i;
  const a = path[i], b = path[i + 1];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}
export const pick = (arr, randomFn = Math.random) => arr[rng(0, arr.length - 1, randomFn)];
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** Fisher-Yates シャッフル（in-place）。配列自体を返す */
export function shuffle(arr, randomFn = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
/* アイテムモドキは、化けている間だけ「床アイテム」として存在する。
 * 通常の床アイテム処理から消された時は本体も消滅するが、杖の
 * 吹き飛ばし・引き寄せで一時的に床から外す場合だけ保持できる。 */
export const ITEM_MIMIC_ITEM_TYPE = "item_mimic";

/* 偽アイテムに使う、実際に床で見かけるアイテムのタイル群。
 * 画像だけを借りるため、正体を現すまでは元アイテムの効果や種別は持たせない。 */
const ITEM_MIMIC_DISGUISE_TILES = [
  16, 17, 18, 19, 20, 21, 22, 23, 24,
  32, 41, 42, 43, 60, 66,
  87, 88, 89, 90, 91, 92, 101, 102,
  184, 185, 186, 187, 188, 189, 190, 191, 192, 193,
];

function pickItemMimicDisguiseTile() {
  return ITEM_MIMIC_DISGUISE_TILES[Math.floor(Math.random() * ITEM_MIMIC_DISGUISE_TILES.length)];
}

export function destroyItemMimicFloorItem(dg, item) {
  if (!dg || !item?.itemMimicId) return;
  const mimic = dg.monsters?.find(m => m.id === item.itemMimicId);
  if (mimic) {
    mimic._itemMimicDestroyed = true;
    mimic.disguisedAsItem = false;
    dg.monsters = dg.monsters.filter(m => m !== mimic);
  }
}

/** 化けているアイテムモドキの床アイテムを必ず生成・同期する。 */
export function ensureItemMimicFloorItems(dg) {
  if (!dg || !Array.isArray(dg.monsters) || !Array.isArray(dg.items)) return;
  const activeIds = new Set();
  for (const mimic of dg.monsters) {
    if (mimic.subtype !== "itemMimic" || mimic._itemMimicDestroyed || mimic.disguisedAsItem === false) continue;
    mimic.disguisedAsItem = true;
    const itemId = mimic.disguiseItemId || `item-mimic-${mimic.id}`;
    let item = dg.items.find(i => i.itemMimicId === mimic.id || i.id === itemId);
    if (!item) {
      const disguiseTile = mimic.disguiseTile || pickItemMimicDisguiseTile();
      item = {
        id: itemId,
        name: "アイテムモドキ",
        type: ITEM_MIMIC_ITEM_TYPE,
        tile: disguiseTile,
        disguiseTile,
        x: mimic.x,
        y: mimic.y,
        discovered: true,
        itemMimicId: mimic.id,
      };
      dg.items.unshift(item);
    } else {
      if (!item.disguiseTile) item.disguiseTile = mimic.disguiseTile || pickItemMimicDisguiseTile();
      item.itemMimicId = mimic.id;
      item.type = ITEM_MIMIC_ITEM_TYPE;
      item.name = "アイテムモドキ";
      item.tile = item.disguiseTile;
      /* 杖などで床アイテムが移動した場合はアイテム側を正とする。 */
      mimic.x = item.x;
      mimic.y = item.y;
    }
    mimic.disguiseTile = item.disguiseTile;
    mimic.disguiseItemId = item.id;
    activeIds.add(item.id);
  }
  /* 正体を現した／破壊された後に残った偽アイテムは掃除する。 */
  dg.items = dg.items.filter(i => !i.itemMimicId || activeIds.has(i.id));
}

export const removeFloorItem = (dg, item, { preserveItemMimic = false } = {}) => {
  dg.items = dg.items.filter(i => i !== item);
  if (item?.itemMimicId && !preserveItemMimic) destroyItemMimicFloorItem(dg, item);
};
export const monsterAt = (dg, x, y) => {
  ensureItemMimicFloorItems(dg);
  return dg.monsters.find(m => !m.disguisedAsItem && m.x === x && m.y === y);
};
export const itemAt = (dg, x, y) => {
  ensureItemMimicFloorItems(dg);
  return dg.items.find(i => i.x === x && i.y === y);
};
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

/* 魔封じの魔方陣アクティブ判定（循環インポート回避のためutils.js内インライン実装） */
function _isMagicSealActive(dg, x, y) {
  if (!dg.pentacles?.length || !dg.rooms) return false;
  if (dg.pentacles.some(pc => pc.kind === "magic_seal" && pc.blessed && !pc.cursed)) return true;
  const room = dg.rooms.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  if (!room) return false;
  return dg.pentacles.some(pc => pc.kind === "magic_seal" && !pc.cursed &&
    pc.x >= room.x && pc.x < room.x + room.w && pc.y >= room.y && pc.y < room.y + room.h);
}

/* 脆弱の魔方陣チェック: 指定座標が属する部屋内に vulnerability pentacle があるか */
export function findVulnPentacle(dg, x, y) {
  if (_isMagicSealActive(dg, x, y)) return null;
  const room = [...(dg.rooms || []), ...(dg.hiddenRooms || [])].find(
    r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
  );
  if (!room) return null;
  return dg.pentacles?.find(pc => pc.kind === "vulnerability" &&
    pc.x >= room.x && pc.x < room.x + room.w && pc.y >= room.y && pc.y < room.y + room.h) || null;
}

/* 部屋に座標が含まれるか（インライン版）。posRoom 既知の場合にpc座標が同部屋か判定 */
const _inRoom = (room, x, y) => x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;

/* 重力の魔方陣チェック（通常/祝福）: 座標が非呪い重力ペンタクルの影響下か */
export function hasGravityPentacle(dg, x, y) {
  if (!dg.pentacles?.length) return false;
  if (_isMagicSealActive(dg, x, y)) return false;
  /* 1パス目：フロア全体祝福を早期判定。通常があれば後で部屋判定 */
  let _hasNormal = false;
  for (const pc of dg.pentacles) {
    if (pc.kind !== "gravity" || pc.cursed) continue;
    if (pc.blessed) return true;
    _hasNormal = true;
  }
  if (!_hasNormal) return false;
  /* 2パス目：通常ペンタクルの同部屋判定（posRoomを1度だけ計算） */
  const allRooms = [...(dg.rooms || []), ...(dg.hiddenRooms || [])];
  const posRoom = allRooms.find(r => _inRoom(r, x, y));
  if (!posRoom) return false;
  for (const pc of dg.pentacles) {
    if (pc.kind !== "gravity" || pc.cursed || pc.blessed) continue;
    if (_inRoom(posRoom, pc.x, pc.y)) return true;
  }
  return false;
}

/* 呪われた重力の魔方陣チェック: 座標が呪い重力ペンタクルの影響下か */
export function hasCursedGravityPentacle(dg, x, y) {
  if (!dg.pentacles?.length) return false;
  if (_isMagicSealActive(dg, x, y)) return false;
  /* 呪い重力は同部屋判定のみ。posRoomを1度だけ計算 */
  let _hasCursed = false;
  for (const pc of dg.pentacles) {
    if (pc.kind === "gravity" && pc.cursed) { _hasCursed = true; break; }
  }
  if (!_hasCursed) return false;
  const allRooms = [...(dg.rooms || []), ...(dg.hiddenRooms || [])];
  const posRoom = allRooms.find(r => _inRoom(r, x, y));
  if (!posRoom) return false;
  for (const pc of dg.pentacles) {
    if (pc.kind !== "gravity" || !pc.cursed) continue;
    if (_inRoom(posRoom, pc.x, pc.y)) return true;
  }
  return false;
}

/* みかわしの魔方陣チェック: ターゲット座標(x,y)に対するdodgeペンタクル効果。
 * 祝福: フロア全体でdodge、呪い: フロア全体でsure-hit、通常: 同部屋でdodge
 * 戻り値: "dodge" | "sure" | null */
export function getDodgePentacleMode(dg, x, y) {
  if (!dg.pentacles?.length) return null;
  if (_isMagicSealActive(dg, x, y)) return null;
  /* 1パス目：フロア全体祝福/呪い早期判定。通常があれば後で部屋判定 */
  let _hasNormal = false;
  for (const pc of dg.pentacles) {
    if (pc.kind !== "dodge") continue;
    if (pc.blessed) return "dodge";
    if (pc.cursed) return "sure";
    _hasNormal = true;
  }
  if (!_hasNormal) return null;
  const allRooms = [...(dg.rooms || []), ...(dg.hiddenRooms || [])];
  const posRoom = allRooms.find(r => _inRoom(r, x, y));
  if (!posRoom) return null;
  for (const pc of dg.pentacles) {
    if (pc.kind !== "dodge" || pc.blessed || pc.cursed) continue;
    if (_inRoom(posRoom, pc.x, pc.y)) return "dodge";
  }
  return null;
}

/* 通常の回避判定を行えない状態。みかわしの魔方陣などの絶対回避は別途優先する。 */
export function isEvasionDisabledByStatus(target) {
  return (target?.immobileTurns || 0) > 0 ||
    (target?.slowTurns || 0) > 0 ||
    !!target?.paralyzed ||
    (target?.paralyzeTurns || 0) > 0 ||
    (target?.sleepTurns || 0) > 0 ||
    (target?.frozenTurns || 0) > 0;
}

export function corridorRange(depth) {
  return depth >= 2 ? 2 : 6;
}

/**
 * この冒険で既に訪れた階層一覧（昇順）。
 * 現在階 + floors キャッシュに残っている階。
 * @param {{ floors?: Record<string|number, unknown>, player?: { depth?: number } }|null} session
 * @param {number} [currentDepth] 省略時は session.player.depth
 */
export function getVisitedFloors(session, currentDepth) {
  const set = new Set();
  const d = currentDepth ?? session?.player?.depth;
  if (d != null && Number(d) > 0) set.add(Number(d));
  for (const k of Object.keys(session?.floors || {})) {
    const n = Number(k);
    if (Number.isFinite(n) && n > 0) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * @param {number} rad 廊下レイキャスト半径（マス単位。斜めも同じ2マス扱い）
 * @param {{ roomVision?: boolean }} [opts] roomVision 未指定時は rad>1 で部屋全体表示
 */
export function computeFOV(map, px, py, rad, vis, exp, rooms = [], opts = {}) {
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) vis[y][x] = false;

  // 部屋内なら同じ部屋全体（+ 隣接壁）を表示（暗闇の薬など roomVision=false のとき無効）
  // 暗闇の指輪は廊下半径のみ減らし、部屋視界は維持する
  const roomVision = opts.roomVision !== undefined ? opts.roomVision : rad > 1;
  if (roomVision) {
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

  // 通路視界（レイキャスト）。
  // rad はゲーム上のマス距離。セルの中心から角へ届くぶんだけ余白を足し、
  // 斜め2マス先は含めつつ、軸方向の3マス先までは含めない。
  const rayLength = Math.max(0, rad) + 0.49;
  const rayStep = 0.25;
  for (let a = 0; a < 360; a++) {
    const r = (a * Math.PI) / 180,
      ddx = Math.cos(r),
      ddy = Math.sin(r);
    /* レイの進行度をチェビシェフ距離にそろえる（斜めでも1マス分）。 */
    const rayScale = 1 / Math.max(Math.abs(ddx), Math.abs(ddy));
    let x = px + 0.5,
      y = py + 0.5;
    for (let d = 0; d <= rayLength; d += rayStep) {
      const ix = Math.floor(x),
        iy = Math.floor(y);
      if (ix < 0 || ix >= MW || iy < 0 || iy >= MH) break;
      vis[iy][ix] = true;
      exp[iy][ix] = true;
      if ((map[iy][ix] === T.WALL || map[iy][ix] === T.BWALL) && !(ix === px && iy === py)) break;
      x += ddx * rayScale * rayStep;
      y += ddy * rayScale * rayStep;
    }
  }
}

/* FOV再計算 + アイテム発見マーキングを一括実行するラッパー */
export function refreshFOV(dg, p) {
  const torchBonus = (p.visionBonus || 0);
  const darknessTurns = (p.darknessTurns || 0) > 0;
  const darkRingPen = (p.rings || []).filter(r => r && r.effect === "darkness_ring").length;
  const base = darknessTurns ? 1 : corridorRange(p.depth);
  /* 暗闇の指輪は廊下視界のみ-1（部屋全体表示は維持）。下限1 */
  const corridorRad = Math.max(1, base + torchBonus - darkRingPen);
  const roomVision = !darknessTurns && (base + torchBonus) > 1;
  computeFOV(dg.map, p.x, p.y, corridorRad, dg.visible, dg.explored, [...(dg.rooms || []), ...(dg.hiddenRooms || [])], { roomVision });
  for (const it of dg.items) { if (dg.visible[it.y]?.[it.x]) it.discovered = true; }
}

/* ===== バリア判定：非近接攻撃を一定回数無効化する ===== */
/* 近接以外の攻撃（杖・矢・爆発・状態異常など）が命中した時に呼ぶ。
   バリアがあれば1回分消費してtrueを返す（呼び出し側はダメージをスキップ）。
   barrier は数値（残り回数）。0 またはfalsy なら無効。 */
export function consumeBarrier(m, ml) {
  /* 封印中はバリア特性も無効 */
  if (!m.barrier || m.sealed) return false;
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
  /* 封印中は固定ダメ特性を無効化 */
  if (m.fixedDamageOnly && !m.sealed && isPhysical) return Math.min(damage, 1);
  return damage;
}

/**
 * 最終被ダメ軽減（防具 ability: dmg_reduce）。
 * HP 代入フックでも使う。メッセージ表示前に使うと表示と実減が一致する。
 */
export function reduceFinalPlayerDamage(p, dmg) {
  if (!p || !Number.isFinite(dmg) || dmg <= 0) return dmg;
  if (!hasAbility(p.armor, "dmg_reduce")) return dmg;
  return Math.max(1, Math.floor(dmg * 0.9));
}

/**
 * プレイヤーに対するHP効果の表示ラベルを返す。
 * 実際のHP変化と同じく、逆転状態ではダメージと回復を入れ替える。
 * amount は表示したい効果量（ダメージ軽減など適用後）を渡す。
 */
export function playerHpEffectLabel(p, amount, intent = "damage") {
  const reversed = (p?.reverseTurns || 0) > 0;
  const isDamage = reversed ? intent !== "damage" : intent === "damage";
  return `${amount}${isDamage ? "ダメージ" : "回復"}`;
}

function rewritePlayerHpMessage(message, p, effect) {
  if (!effect || (p?.reverseTurns || 0) <= 0) return message;
  const text = typeof message === "string" ? message : message?.text;
  if (typeof text !== "string") return message;
  const amount = String(effect.amount);
  let next = text;
  if (effect.intent === "damage") {
    const mutual = `お互いに${amount}ダメージ`;
    if (next.includes(mutual)) {
      next = next.replace(mutual, `自分は${amount}回復、相手は${amount}ダメージ`);
    } else {
      next = next.replaceAll(`${amount}ダメージを受けた`, `${amount}回復した`);
      next = next.replaceAll(`${amount}ダメージ！`, `${amount}回復！`);
      next = next.replaceAll(`${amount}ダメージ`, `${amount}回復`);
      next = next.replaceAll(`${amount}HP吸収`, `${amount}回復`);
      next = next.replaceAll(`HP-${amount}`, `HPが${amount}回復`);
    }
  } else {
    next = next.replaceAll(`${amount}回復した`, `${amount}ダメージを受けた`);
    next = next.replaceAll(`${amount}回復！`, `${amount}ダメージ！`);
    next = next.replaceAll(`${amount}回復`, `${amount}ダメージ`);
    next = next.replaceAll(`HP+${amount}`, `HPが${amount}ダメージ`);
  }
  if (next === text) return message;
  return typeof message === "string" ? next : { ...message, text: next };
}

/**
 * プレイヤーHPの直後に追加されるログを、逆転状態の実際の効果に合わせる。
 * ゲーム側の各HP処理を個別に書き換えなくても、既存のログ形式を保ったまま補正できる。
 */
export function installPlayerHpMessageHook(messages, p) {
  if (!Array.isArray(messages) || !p || messages._playerHpMessageHook) return messages;
  const rawPush = messages.push.bind(messages);
  Object.defineProperty(messages, "_playerHpMessageHook", { value: true, enumerable: false });
  messages.push = (...items) => {
    const effect = p._lastHpEffectForMessage;
    delete p._lastHpEffectForMessage;
    const nextItems = effect
      ? items.map((message) => rewritePlayerHpMessage(message, p, effect))
      : items;
    return rawPush(...nextItems);
  };
  return messages;
}

/**
 * プレイヤーの hp 代入をフックし、
 * - reverseTurns 中は増減を反転する（ダメージ→回復、回復→ダメージ）
 * - 防具 dmg_reduce 時は減少分を1割軽減する（最終被ダメ）
 * 回復意図が逆転して HP0 以下になった場合は死因を設定する。
 * セーブ後の復元時も呼ぶこと。
 */
export function installPlayerHpReverseHook(p) {
  if (!p || p._hpReverseHook) return p;
  let raw = Number(p.hp) || 0;
  Object.defineProperty(p, "hp", {
    configurable: true,
    enumerable: true,
    get() { return raw; },
    set(v) {
      const n = Number(v);
      if (!Number.isFinite(n)) { raw = v; return; }
      if ((this.reverseTurns || 0) > 0) {
        const delta = n - raw;
        if (delta !== 0) {
          const effect = {
            amount: Math.abs(delta),
            intent: delta < 0 ? "damage" : "heal",
          };
          if (Object.prototype.hasOwnProperty.call(this, "_lastHpEffectForMessage")) {
            this._lastHpEffectForMessage = effect;
          } else {
            Object.defineProperty(this, "_lastHpEffectForMessage", {
              configurable: true,
              enumerable: false,
              writable: true,
              value: effect,
            });
          }
          let next = raw - delta;
          /* ダメージ意図（delta<0）→回復：maxHp を超えない */
          if (delta < 0) next = Math.min(this.maxHp ?? next, next);
          /* 回復意図（delta>0）→ダメージ：致死ならクライン逆転の死因 */
          if (delta > 0 && next <= 0) {
            this.deathCause = "逆転状態での回復により";
          }
          raw = next;
          return;
        }
      }
      /* 被ダメ軽減：HP が減る代入に適用。
         p.hp=0 / p.hp=1 のような絶対指定は「即死・1残し」意図なので軽減しない */
      if (n < raw && hasAbility(this.armor, "dmg_reduce")) {
        const loss = raw - n;
        if (loss > 0 && !(n <= 1 && loss > 1)) {
          const reducedLoss = Math.max(1, Math.floor(loss * 0.9));
          raw = Math.max(0, raw - reducedLoss);
          return;
        }
      }
      raw = n;
    },
  });
  p._hpReverseHook = true;
  return p;
}

/** 逆転状態を付与（ターン加算） */
export function applyReverseStatus(p, turns = 20) {
  if (!p || turns <= 0) return;
  installPlayerHpReverseHook(p);
  p.reverseTurns = (p.reverseTurns || 0) + turns;
}
