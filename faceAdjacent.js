import { monsterAt } from "./utils.js";

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
