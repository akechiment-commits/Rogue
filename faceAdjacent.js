import { monsterAt, itemAt } from "./utils.js";

/** 上から時計回り（斜め含む8方向） */
export const ADJACENT_DIRS_CW = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
];

/** プレイヤー隣接マスにいる敵の向き一覧（時計回り順） */
export function listAdjacentEnemyDirs(player, dungeon) {
  if (!player || !dungeon) return [];
  const out = [];
  for (const d of ADJACENT_DIRS_CW) {
    const m = monsterAt(dungeon, player.x + d.dx, player.y + d.dy);
    if (m) out.push({ dx: d.dx, dy: d.dy });
  }
  return out;
}

/**
 * 隣接敵がいればそちらを向く。
 * すでに敵の方を向いているときは、時計回りで次の隣接敵へ切り替える。
 * @returns {{dx:number,dy:number}|null} 向いた方向。隣接敵なしなら null
 */
export function cycleFaceAdjacentEnemy(player, dungeon) {
  const dirs = listAdjacentEnemyDirs(player, dungeon);
  if (!dirs.length) return null;
  const cur = player.facing || { dx: 0, dy: 1 };
  const idx = dirs.findIndex((d) => d.dx === cur.dx && d.dy === cur.dy);
  const next = idx === -1 ? dirs[0] : dirs[(idx + 1) % dirs.length];
  player.facing = { dx: next.dx, dy: next.dy };
  return next;
}

/** 隣接マスに「何かある」方向一覧（時計回り順）
 * 敵・落ちているアイテム・見えている罠・大箱・石像のいずれかがある方向 */
export function listAdjacentSomethingDirs(player, dungeon) {
  if (!player || !dungeon) return [];
  const out = [];
  for (const d of ADJACENT_DIRS_CW) {
    const x = player.x + d.dx, y = player.y + d.dy;
    const has =
      monsterAt(dungeon, x, y) ||
      itemAt(dungeon, x, y) ||
      (dungeon.traps || []).some((t) => t.x === x && t.y === y && t.revealed) ||
      (dungeon.bigboxes || []).some((b) => b.x === x && b.y === y) ||
      (dungeon.statues || []).some((s) => s.x === x && s.y === y);
    if (has) out.push({ dx: d.dx, dy: d.dy });
  }
  return out;
}

/**
 * 隣接マスに何かあればそちらを向く。
 * すでに何かの方を向いているときは、時計回りで次の「何かある」方向へ切り替える。
 * @returns {{dx:number,dy:number}|null} 向いた方向。周りに何もなければ null
 */
export function cycleFaceAdjacentSomething(player, dungeon) {
  const dirs = listAdjacentSomethingDirs(player, dungeon);
  if (!dirs.length) return null;
  const cur = player.facing || { dx: 0, dy: 1 };
  const idx = dirs.findIndex((d) => d.dx === cur.dx && d.dy === cur.dy);
  const next = idx === -1 ? dirs[0] : dirs[(idx + 1) % dirs.length];
  player.facing = { dx: next.dx, dy: next.dy };
  return next;
}
