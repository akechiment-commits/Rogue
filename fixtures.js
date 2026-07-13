/**
 * ダンジョン固定ギミック：偽階段・風穴・石像・固定転送
 */
import { rng, pick, uid, MW, MH, T } from "./utils.js";
/* items.js との循環 import を避けるため、TRAPS/ITEMS のみ参照し placeItemAt は使わない */
import { TRAPS, pickLootFromPool, ITEMS, WANDS } from "./items.js";
import { pickMonsterDef, makeMonsterFromBase, setStatueBreakHandler } from "./monsters.js";

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
export function materializeFakeStair(trap) {
  if (!trap || trap.effect !== "fake_stair") return trap;
  const pool = TRAPS.filter((t) => t.effect !== "fake_stair");
  const t = pick(pool.length ? pool : TRAPS);
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

export function statueAt(dg, x, y) {
  return (dg.statues || []).find((s) => s.x === x && s.y === y) || null;
}

/**
 * 石像を破壊。レア寄りアイテム＋強敵を出す。
 * @param {{ cause?: string }} opts
 */
export function breakStatue(statue, dg, p, ml, luFn = null, depth = 1) {
  if (!statue || !dg) return false;
  dg.statues = (dg.statues || []).filter((s) => s !== statue && s.id !== statue.id);
  ml.push(`${statue.name}が砕け散った！`);

  /* ややレア寄りの床落ち */
  const rarePool = [
    ...ITEMS.filter((i) => i.rarity === "A" || i.rarity === "B" || i.rarity === "S"),
    ...WANDS.filter((w) => w.rarity === "A" || w.rarity === "B" || w.rarity === "S"),
  ];
  const tmpl = (rarePool.length ? pickLootFromPool(rarePool, "drop") : null) || pick(ITEMS);
  if (tmpl && tmpl.type !== "goal") {
    const it = { ...tmpl, id: uid(), x: statue.x, y: statue.y };
    if (it.type === "wand" && it.charges != null && it.effect !== "wish") {
      it.charges = Math.max(1, (it.charges || 1) + rng(-1, 1));
    }
    /* placeItemAt を使うと items↔fixtures 循環になるため直接配置 */
    if (!dg.items) dg.items = [];
    dg.items.push(it);
    ml.push(`${it.name}が飛び出した！`);
  }

  /* そのフロアで出る敵プールから1体、出現レベルを+1して出す */
  const d = Math.max(0, (typeof depth === "number" ? depth : null) ?? (p?.depth ? p.depth - 1 : 0));
  let mx = statue.x, my = statue.y;
  const blocked = (x, y) =>
    (p && p.x === x && p.y === y) ||
    (dg.monsters || []).some((m) => m.x === x && m.y === y) ||
    dg.map[y]?.[x] === T.WALL || dg.map[y]?.[x] === T.BWALL;
  if (blocked(mx, my)) {
    let placed = false;
    for (const [ox, oy] of [[0,1],[1,0],[0,-1],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const nx = statue.x + ox, ny = statue.y + oy;
      if (nx < 0 || nx >= MW || ny < 0 || ny >= MH || blocked(nx, ny)) continue;
      mx = nx; my = ny; placed = true; break;
    }
    if (!placed) {
      ml.push("強敵が出現しそうだったが、場所がなかった…");
      return true;
    }
  }
  try {
    const { base, spawnLevel } = pickMonsterDef(d, dg.dungeonType ?? null, false);
    const boosted = Math.min(3, (spawnLevel || 1) + 1);
    const mon = makeMonsterFromBase(base, boosted, mx, my, {
      aware: true,
      lastPx: p?.x ?? mx,
      lastPy: p?.y ?? my,
    });
    dg.monsters.push(mon);
    ml.push(`${mon.name}が現れた！`);
  } catch {
    ml.push("強敵が出現しそうだったが、うまく出られなかった…");
  }
  return true;
}

/**
 * ダメージ／状態異常を与えるアクションで石像破壊を試みる。
 * 場所替えなど無害アクションでは呼ばないこと。
 */
export function tryBreakStatueAt(dg, x, y, p, ml, luFn, depth) {
  const st = statueAt(dg, x, y);
  if (!st) return false;
  return breakStatue(st, dg, p, ml, luFn, depth);
}

/* ===== 固定転送（ポータル流用・ペア固定・ペンと非接続） ===== */
export function makeFixedPortalPair(x1, y1, x2, y2, depth) {
  const pairId = uid();
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
    },
  ];
}

export function findFixedPortalPair(dg, portal) {
  if (!portal || portal.kind !== "fixed_portal") return null;
  return (dg.pentacles || []).find(
    (pc) => pc.kind === "fixed_portal" && pc.pairId === portal.pairId && pc !== portal &&
      !(pc.x === portal.x && pc.y === portal.y),
  ) || null;
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

  /* 石像 0〜2 */
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

/* 弾の射線上破壊用ハンドラを monsters に登録（モジュール読込時） */
setStatueBreakHandler(tryBreakStatueAt);
