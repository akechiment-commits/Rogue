/**
 * ダンジョン固定ギミック：偽階段・風穴・石像・固定転送
 */
import { rng, pick, uid, MW, MH, T } from "./utils.js";
import {
  findFixedPortalPair,
  statueAt,
  wandEffectBreaksStatue,
  wandEffectStatueLootOnly,
} from "./fixtureQueries.js";

export {
  findFixedPortalPair,
  statueAt,
  wandEffectBreaksStatue,
  wandEffectStatueLootOnly,
} from "./fixtureQueries.js";

let statueSpawnHandler = null;
export function setStatueSpawnHandler(handler) {
  statueSpawnHandler = handler;
}

export const FIXTURE_TILE = {
  vent: 128,
  statue: 129,
  fixedPortal: 130,
};

/** 罠として生成する偽階段（未看破時は階段に見える） */
export function makeFakeStairTrap(x, y, dir = "down") {
  return {
    id: uid(),
    x,
    y,
    name: dir === "up" ? "偽の上り階段" : "偽の下り階段",
    effect: "fake_stair",
    tile: dir === "up" ? 3 : 2, /* 看破後も階段タイル寄り。発動時に本物の罠tileへ */
    revealed: false,
    disguise: dir === "up" ? "stair_up" : "stair_down",
    desc: "階段に化けた罠。踏むと別の罠に姿を変えて発動する。",
  };
}

/** 偽階段をランダムな通常罠に差し替えて返す（同一オブジェクトを破壊的に更新） */
export function materializeFakeStair(trap, itemDeps) {
  if (!trap || trap.effect !== "fake_stair") return trap;
  const { traps, pickTrap: chooseTrap } = itemDeps;
  const pool = traps.filter((t) => t.effect !== "fake_stair");
  const t = chooseTrap(pool.length ? pool : traps);
  const id = trap.id, x = trap.x, y = trap.y;
  Object.keys(trap).forEach((k) => { delete trap[k]; });
  Object.assign(trap, { ...t, id, x, y, revealed: true });
  delete trap.disguise;
  delete trap.permanent;
  return trap;
}

export function isDisguisedStairTrap(trap) {
  return !!(trap && trap.disguise && !trap.revealed);
}

/** 描画・look 用：未看破の偽階段なら階段扱い */
export function trapDisplayAsStair(trap) {
  if (!trap?.disguise || trap.revealed) return null;
  return trap.disguise; /* "stair_down" | "stair_up" */
}

/* ===== 風穴 ===== */
export function makeVent(x, y, dx, dy) {
  const fdx = Math.sign(dx || 0), fdy = Math.sign(dy || 0);
  return {
    id: uid(),
    type: "vent",
    x, y,
    dx: fdx === 0 && fdy === 0 ? 1 : fdx,
    dy: fdx === 0 && fdy === 0 ? 0 : fdy,
    tile: FIXTURE_TILE.vent,
    name: "風穴",
    desc: "一定範囲の物理飛び道具（投擲・矢・石・ブレスなど）の向きを風向きに変える。杖や魔法弾は曲がらない。",
  };
}

export { getWindAt, applyWindDir } from "./utils.js";

/* ===== 石像 ===== */
export function makeStatue(x, y) {
  return {
    id: uid(),
    type: "statue",
    x, y,
    tile: FIXTURE_TILE.statue,
    name: "石像",
  };
}

const _STATUE_NEI = [
  [0, -1], [0, 1], [-1, 0], [1, 0],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
  [0, -2], [0, 2], [-2, 0], [2, 0],
];

/** 石像マスに置ける空き隣マス（石像・壁・他オブジェクトなし） */
function _freeNeighborOffStatue(dg, x, y) {
  for (const [dx, dy] of _STATUE_NEI) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || nx >= MW || ny < 0 || ny >= MH) continue;
    const tile = dg.map[ny]?.[nx];
    if (tile !== T.FLOOR) continue;
    if (statueAt(dg, nx, ny)) continue;
    if (dg.items?.some(i => i.x === nx && i.y === ny)) continue;
    if (dg.traps?.some(t => t.x === nx && t.y === ny)) continue;
    if (dg.springs?.some(s => s.x === nx && s.y === ny)) continue;
    if (dg.bigboxes?.some(b => b.x === nx && b.y === ny)) continue;
    if (dg.pentacles?.some(pc => pc.x === nx && pc.y === ny)) continue;
    if (dg.vents?.some(v => v.x === nx && v.y === ny)) continue;
    if (dg.oilyTiles?.some(t => t.x === nx && t.y === ny)) continue;
    return { x: nx, y: ny };
  }
  return null;
}

/**
 * 石像マス上に重なっているオブジェクトを隣へ退ける。
 * 石像の移動先や、誤って重なった場合の救済用（破壊直後の報酬配置は石像削除後なので対象外）。
 */
export function displaceObjectsFromStatue(dg, x, y, ml = null, itemDeps) {
  if (!dg || statueAt(dg, x, y) == null) return;
  const { resolveItemName: itemName } = itemDeps;
  const moveList = (arr, label) => {
    if (!arr?.length) return;
    for (const o of [...arr]) {
      if (o.x !== x || o.y !== y) continue;
      const dest = _freeNeighborOffStatue(dg, x, y);
      if (dest) {
        o.x = dest.x; o.y = dest.y;
        if (ml) ml.push(`${label || (o.type ? itemName(o) : o.name) || "何か"}が石像を避けてずれた。`);
      } else if (arr === dg.items) {
        dg.items = dg.items.filter(i => i !== o);
        if (ml) ml.push(`${o.type ? itemName(o) : o.name}は行き場がなく消えた。`);
      } else if (arr === dg.traps && !o.permanent) {
        dg.traps = dg.traps.filter(t => t !== o);
      } else if (arr === dg.oilyTiles) {
        dg.oilyTiles = dg.oilyTiles.filter(t => t !== o);
      } else if (arr === dg.pentacles && !o.fixed && o.kind !== "fixed_portal") {
        dg.pentacles = dg.pentacles.filter(pc => pc !== o);
      }
      /* 泉・大箱・固定転送・永続罠は移動失敗時そのまま（稀） */
    }
  };
  moveList(dg.items, null);
  moveList(dg.traps, "罠");
  moveList(dg.springs, "泉");
  moveList(dg.bigboxes, "大箱");
  moveList(dg.pentacles, "魔方陣");
  moveList(dg.vents, "風穴");
  moveList(dg.oilyTiles, "油");
}

/**
 * 石像を破壊。レア寄りアイテムを出す。通常は強敵も出す。
 * @param {{ spawnItem?: boolean, spawnMonster?: boolean, breakMessage?: string }} opts
 *   spawnItem:false / spawnMonster:false で中身ごと消滅（爆発）
 */
export function breakStatue(statue, dg, p, ml, luFn = null, depth = 1, opts = {}) {
  if (!statue || !dg) return false;
  const {
    items,
    wands,
    pickLootFromPool: chooseLoot,
    resolveItemName: itemName,
  } = opts.itemDeps;
  const spawnItem = opts.spawnItem !== false;
  const spawnMonster = opts.spawnMonster !== false;
  dg.statues = (dg.statues || []).filter((s) => s !== statue && s.id !== statue.id);
  ml.push(opts.breakMessage || `${statue.name}が砕け散った！`);

  /* ややレア寄りの床落ち */
  if (spawnItem) {
    const rarePool = [
      ...items.filter((i) => i.rarity === "C" || i.rarity === "B" || i.rarity === "A" || i.rarity === "S"),
      ...wands.filter((w) => w.rarity === "C" || w.rarity === "B" || w.rarity === "A" || w.rarity === "S"),
    ];
    const tmpl = (rarePool.length ? chooseLoot(rarePool, "drop") : null) || pick(items);
    if (tmpl && tmpl.type !== "goal") {
      const it = { ...tmpl, id: uid(), x: statue.x, y: statue.y };
      if (it.type === "wand" && it.charges != null && it.effect !== "wish") {
        it.charges = Math.max(1, (it.charges || 1) + rng(-1, 1));
      }
      /* placeItemAt を使うと items↔fixtures 循環になるため直接配置 */
      if (!dg.items) dg.items = [];
      dg.items.push(it);
      /* 未識別名を使う（render 循環回避のため nameFn / グローバルを参照） */
      const _dn = itemName(it, opts.itemNameFn);
      ml.push(`${_dn}が飛び出した！`);
    }
  }

  /* 出現敵の選択は monsters.js 側で行う（循環 import を作らない）。 */
  if (spawnMonster) {
    statueSpawnHandler?.(statue, dg, p, ml, depth);
  }
  return true;
}

/**
 * ダメージ／状態異常を与えるアクションで石像破壊を試みる。
 * 場所替えなど無害アクションでは呼ばないこと。
 */
export function tryBreakStatueAt(dg, x, y, p, ml, luFn, depth, itemDeps) {
  const st = statueAt(dg, x, y);
  if (!st) return false;
  return breakStatue(st, dg, p, ml, luFn, depth, { itemDeps });
}

/**
 * 杖・魔法の effect が石像を壊すか。
 * ダメージ／有害状態異常／攻撃的な効果 → true
 * 場所替え・テレポ・飛びつきなど位置系・祝福呪い → false
 * 穴掘り・軟化は壊す（敵は出さずアイテムのみ → wandEffectStatueLootOnly）
 */
/**
 * 投擲物が石像を壊すか（物理的に当たるもの・有害な薬など）。
 */
export function throwItemBreaksStatue(it) {
  if (!it) return true;
  if (it.type === "wand") return wandEffectBreaksStatue(it.effect);
  /* 巻物・ペンは投擲ダメージ自体はあるので壊す。白紙なども含む */
  return true;
}

/**
 * 石像タイルにダメージ行動が到達したら破壊を試す。
 * @param {{ breaks?: boolean, spawnItem?: boolean, spawnMonster?: boolean, breakMessage?: string }} opts
 * @returns {boolean} 壊した／石像があった
 */
export function hitStatueWithAction(dg, x, y, p, ml, luFn, depth, {
  breaks = true,
  spawnItem = true,
  spawnMonster = true,
  breakMessage,
  itemDeps,
} = {}) {
  const st = statueAt(dg, x, y);
  if (!st) return false;
  if (!breaks) {
    ml.push(`${st.name}には効果がなかった。`);
    return true; /* 当たったが壊さない */
  }
  return breakStatue(st, dg, p, ml, luFn, depth, {
    spawnItem,
    spawnMonster,
    breakMessage,
    itemDeps,
  });
}

/* ===== 固定転送（ポータル流用・ペア固定・ペンと非接続） ===== */
export function makeFixedPortalPair(x1, y1, x2, y2, depth) {
  const pairId = uid();
  const portalDesc =
    "対になる転送陣と常に繋がっている。乗ると反対側へ転送される。プレイヤー・敵・投げた物も通る。ペンのポータルとは繋がらない。";
  return [
    {
      id: uid(),
      x: x1, y: y1,
      kind: "fixed_portal",
      name: "転送の魔法陣",
      pairId,
      floor: depth,
      fixed: true,
      tile: FIXTURE_TILE.fixedPortal,
      desc: portalDesc,
    },
    {
      id: uid(),
      x: x2, y: y2,
      kind: "fixed_portal",
      name: "転送の魔法陣",
      pairId,
      floor: depth,
      fixed: true,
      tile: FIXTURE_TILE.fixedPortal,
      desc: portalDesc,
    },
  ];
}

/**
 * 床にギミックをばら撒く（通常生成の末尾で呼ぶ）
 * @returns {{ vents, statues, fakeStairs, portals }}
 */
export function scatterFloorGimmicks(map, rooms, depth, {
  traps = [],
  springs = [],
  bigboxes = [],
  pentacles = [],
  items = [],
  stairUp = null,
  stairDown = null,
  occ = null,
} = {}) {
  const vents = [];
  const statues = [];
  const addedTraps = [];
  const addedPentacles = [];

  const blocked = (x, y) => {
    if (map[y]?.[x] !== T.FLOOR) return true;
    if (stairUp && x === stairUp.x && y === stairUp.y) return true;
    if (stairDown && x === stairDown.x && y === stairDown.y) return true;
    if (traps.some((t) => t.x === x && t.y === y)) return true;
    if (addedTraps.some((t) => t.x === x && t.y === y)) return true;
    if (springs.some((s) => s.x === x && s.y === y)) return true;
    if (bigboxes.some((b) => b.x === x && b.y === y)) return true;
    if (pentacles.some((pc) => pc.x === x && pc.y === y)) return true;
    if (addedPentacles.some((pc) => pc.x === x && pc.y === y)) return true;
    if (vents.some((v) => v.x === x && v.y === y)) return true;
    if (statues.some((s) => s.x === x && s.y === y)) return true;
    /* 偽階段などは未看破時もアイテムと重ならないようにする */
    if (items.some((it) => it.x === x && it.y === y)) return true;
    if (occ && occ(x, y)) return true;
    return false;
  };

  const rndFloor = () => {
    for (let a = 0; a < 80; a++) {
      if (!rooms?.length) {
        const x = rng(1, MW - 2), y = rng(1, MH - 2);
        if (!blocked(x, y)) return [x, y];
        continue;
      }
      const rm = pick(rooms);
      const x = rng(rm.x, rm.x + rm.w - 1);
      const y = rng(rm.y, rm.y + rm.h - 1);
      if (!blocked(x, y)) return [x, y];
    }
    return null;
  };

  /* 偽階段 0〜2 */
  const fakeN = Math.random() < 0.35 ? rng(1, 2) : Math.random() < 0.5 ? 1 : 0;
  for (let i = 0; i < fakeN; i++) {
    const p = rndFloor();
    if (!p) break;
    const dir = Math.random() < 0.15 ? "up" : "down";
    addedTraps.push(makeFakeStairTrap(p[0], p[1], dir));
  }

  /* 風穴 0〜2 */
  const ventN = Math.random() < 0.30 ? rng(1, 2) : 0;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  for (let i = 0; i < ventN; i++) {
    const p = rndFloor();
    if (!p) break;
    const [dx, dy] = pick(dirs);
    vents.push(makeVent(p[0], p[1], dx, dy));
  }

  /* 石像 0〜2（約28%で1〜2体） */
  const stN = Math.random() < 0.28 ? rng(1, 2) : 0;
  for (let i = 0; i < stN; i++) {
    const p = rndFloor();
    if (!p) break;
    statues.push(makeStatue(p[0], p[1]));
  }

  /* 固定転送ペア 0〜1 */
  if (Math.random() < 0.22) {
    const a = rndFloor();
    const b = rndFloor();
    if (a && b && (a[0] !== b[0] || a[1] !== b[1])) {
      const pair = makeFixedPortalPair(a[0], a[1], b[0], b[1], depth + 1);
      addedPentacles.push(...pair);
    }
  }

  return { vents, statues, traps: addedTraps, pentacles: addedPentacles };
}
