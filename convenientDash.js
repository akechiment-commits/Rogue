import { T } from "./utils.js";

const CARDINALS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

const DIRECTIONS8 = [
  ...CARDINALS,
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

function samePos(a, b) {
  return a?.x === b?.x && a?.y === b?.y;
}

function roomAt(dg, x, y) {
  return [...(dg.rooms || []), ...(dg.hiddenRooms || [])].find((room) =>
    x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h
  ) || null;
}

function insideRoom(room, x, y) {
  return !!room && x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
}

function key(x, y) {
  return `${x},${y}`;
}

function orderedCardinals(dx, dy) {
  const preferred = [Math.sign(dx), Math.sign(dy)];
  const dirs = CARDINALS.map(([x, y]) => [x, y]);
  dirs.sort((a, b) => {
    const aScore = a[0] === preferred[0] && a[1] === preferred[1] ? 0
      : a[0] === preferred[0] || a[1] === preferred[1] ? 1 : 2;
    const bScore = b[0] === preferred[0] && b[1] === preferred[1] ? 0
      : b[0] === preferred[0] || b[1] === preferred[1] ? 1 : 2;
    return aScore - bScore;
  });
  return dirs;
}

function orderedDirections(dx, dy) {
  const preferred = [Math.sign(dx), Math.sign(dy)];
  const dirs = DIRECTIONS8.map(([x, y]) => [x, y]);
  dirs.sort((a, b) => {
    const score = ([x, y]) => {
      const dot = x * preferred[0] + y * preferred[1];
      const exact = x === preferred[0] && y === preferred[1];
      return exact ? 0 : dot > 0 ? 1 : 2;
    };
    return score(a) - score(b);
  });
  return dirs;
}

function isWalkable(dg, x, y, canWalkOnWater) {
  const tile = dg.map?.[y]?.[x];
  if (tile === undefined || tile === T.WALL || tile === T.BWALL) return false;
  if (tile === T.WATER && !canWalkOnWater(x, y)) return false;
  return true;
}

function isBlockedByActor(dg, x, y) {
  if ((dg.monsters || []).some((monster) => monster.x === x && monster.y === y)) return true;
  if ((dg.statues || []).some((statue) => statue.x === x && statue.y === y)) return true;
  return false;
}

function hasFloorObject(dg, x, y) {
  if ((dg.items || []).some((item) => item.x === x && item.y === y)) return true;
  if ([T.SD, T.SU].includes(dg.map?.[y]?.[x])) return true;
  return [
    ...(dg.springs || []),
    ...(dg.bigboxes || []),
    ...(dg.gachaMachines || []),
    ...(dg.altars || []),
    ...(dg.dimensionalVaults || []),
    ...(dg.pentacles || []),
  ].some((object) => object.x === x && object.y === y);
}

function roomExitCells(dg, room, canWalkOnWater) {
  const exits = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (!isWalkable(dg, x, y, canWalkOnWater) || isBlockedByActor(dg, x, y)) continue;
      const outside = CARDINALS.some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return !insideRoom(room, nx, ny) && isWalkable(dg, nx, ny, canWalkOnWater);
      });
      if (outside) exits.push({ x, y });
    }
  }
  return exits;
}

function isInInputDirection(start, target, dx, dy) {
  const vx = target.x - start.x;
  const vy = target.y - start.y;
  if (dx !== 0 && dy !== 0) {
    return vx * dx >= 0 && vy * dy >= 0 && (vx !== 0 || vy !== 0);
  }
  return dx !== 0 ? vx * dx > 0 : vy * dy > 0;
}

function orderedDirectionsToward(current, target) {
  const remainingX = Math.sign(target.x - current.x);
  const remainingY = Math.sign(target.y - current.y);
  const distanceAfter = ([dx, dy]) => Math.max(
    Math.abs(target.x - (current.x + dx)),
    Math.abs(target.y - (current.y + dy)),
  );
  const axisDeviation = ([dx, dy]) =>
    (remainingX === 0 ? Math.abs(dx) : 0) +
    (remainingY === 0 ? Math.abs(dy) : 0);
  const wrongAxis = ([dx, dy]) =>
    (remainingX !== 0 && dx !== 0 && dx !== remainingX ? 1 : 0) +
    (remainingY !== 0 && dy !== 0 && dy !== remainingY ? 1 : 0);
  return DIRECTIONS8.map(([dx, dy]) => [dx, dy]).sort((a, b) => {
    const aScore = [axisDeviation(a), distanceAfter(a), wrongAxis(a)];
    const bScore = [axisDeviation(b), distanceAfter(b), wrongAxis(b)];
    for (let i = 0; i < aScore.length; i++) {
      if (aScore[i] !== bScore[i]) return aScore[i] - bScore[i];
    }
    return 0;
  });
}

function targetTieScore(start, target, dx, dy) {
  const vx = target.x - start.x;
  const vy = target.y - start.y;
  // 同じ歩数なら、入力方向の軸から横にずれていない対象を優先する。
  // 斜め入力では入力ベクトルからの外れ量（外積）を使う。
  const lateral = dx === 0
    ? Math.abs(vx)
    : dy === 0
      ? Math.abs(vy)
      : Math.abs(vx * dy - vy * dx);
  const forward = dx !== 0 ? Math.abs(vx) : Math.abs(vy);
  return [lateral, forward, Math.abs(vx) + Math.abs(vy), target.y, target.x];
}

function compareScores(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function findRoomTarget(dg, room, start, dx, dy, canWalkOnWater) {
  const objectTargets = [];
  const addObjects = (objects = []) => {
    for (const object of objects) {
      if (insideRoom(room, object.x, object.y)) objectTargets.push({ x: object.x, y: object.y });
    }
  };
  addObjects(dg.items);
  addObjects(dg.springs);
  addObjects(dg.bigboxes);
  addObjects(dg.gachaMachines);
  addObjects(dg.altars);
  addObjects(dg.dimensionalVaults);
  addObjects(dg.pentacles);
  for (const [y, row] of (dg.map || []).entries()) {
    for (const [x, tile] of (row || []).entries()) {
      if (insideRoom(room, x, y) && (tile === T.SD || tile === T.SU)) objectTargets.push({ x, y });
    }
  }
  const uniqueObjects = new Map(objectTargets.map((target) => [key(target.x, target.y), target]));
  const directionalObjects = [...uniqueObjects.values()].filter((target) => isInInputDirection(start, target, dx, dy));
  if (directionalObjects.length) return directionalObjects;

  const exits = roomExitCells(dg, room, canWalkOnWater);
  const uniqueExits = new Map(exits.map((target) => [key(target.x, target.y), target]));
  return [...uniqueExits.values()].filter((target) => isInInputDirection(start, target, dx, dy));
}

function buildPathToTarget(dg, start, first, room, target, canWalkOnWater) {
  if (!isWalkable(dg, first.x, first.y, canWalkOnWater) || isBlockedByActor(dg, first.x, first.y)) return null;
  const queue = [{ x: first.x, y: first.y, path: [[first.x - start.x, first.y - start.y]] }];
  const seen = new Set([key(start.x, start.y)]);
  while (queue.length) {
    const current = queue.shift();
    if (samePos(current, target)) return current.path;
    for (const [ndx, ndy] of orderedDirectionsToward(current, target)) {
      const nx = current.x + ndx, ny = current.y + ndy;
      const nk = key(nx, ny);
      if (seen.has(nk) || !insideRoom(room, nx, ny)) continue;
      if (!isWalkable(dg, nx, ny, canWalkOnWater) || isBlockedByActor(dg, nx, ny)) continue;
      seen.add(nk);
      queue.push({ x: nx, y: ny, path: [...current.path, [ndx, ndy]] });
    }
  }
  return null;
}

function buildPathToRoomTarget(dg, start, room, targets, canWalkOnWater, dx, dy) {
  const first = { x: start.x + dx, y: start.y + dy };
  if (!isWalkable(dg, first.x, first.y, canWalkOnWater) || isBlockedByActor(dg, first.x, first.y)) return null;
  let best = null;
  let bestScore = null;
  for (const target of targets) {
    const route = buildPathToTarget(dg, start, first, room, target, canWalkOnWater);
    if (!route) continue;
    const score = [route.length, ...targetTieScore(start, target, dx, dy)];
    if (!bestScore || compareScores(score, bestScore) < 0) {
      best = route;
      bestScore = score;
    }
  }
  return best;
}

function buildCorridorPath(dg, start, first, canWalkOnWater, dx, dy, maxSteps) {
  const path = [[first.x - start.x, first.y - start.y]];
  let previous = start;
  let current = first;
  for (let step = 0; step < maxSteps; step++) {
    if (roomAt(dg, current.x, current.y) || hasFloorObject(dg, current.x, current.y)) return path;
    const next = orderedCardinals(dx, dy)
      .map(([ndx, ndy]) => ({ x: current.x + ndx, y: current.y + ndy, dx: ndx, dy: ndy }))
      .filter(({ x, y }) => !samePos({ x, y }, previous))
      .filter(({ x, y }) => isWalkable(dg, x, y, canWalkOnWater))
      .filter(({ x, y }) => !isBlockedByActor(dg, x, y));
    if (next.length !== 1) return path;
    previous = current;
    current = next[0];
    path.push([next[0].dx, next[0].dy]);
  }
  return path;
}

/**
 * Builds only the movement plan for the convenience dash.
 * Normal dash intentionally does not use this module.
 */
export function planConvenientDash(dg, player, dx, dy, { canWalkOnWater = () => false, maxSteps = 50 } = {}) {
  if (!dg?.map || !player || (dx === 0 && dy === 0)) return [];

  const room = roomAt(dg, player.x, player.y);
  if (room) {
    const targets = findRoomTarget(dg, room, player, dx, dy, canWalkOnWater);
    const route = buildPathToRoomTarget(dg, player, room, targets, canWalkOnWater, dx, dy);
    if (route) return route;

    const first = { x: player.x + dx, y: player.y + dy };
    if (!isWalkable(dg, first.x, first.y, canWalkOnWater) || isBlockedByActor(dg, first.x, first.y)) return [];
    return [[dx, dy]];
  }

  const first = { x: player.x + dx, y: player.y + dy };
  if (!isWalkable(dg, first.x, first.y, canWalkOnWater) || isBlockedByActor(dg, first.x, first.y)) return [];
  if (Math.abs(dx) + Math.abs(dy) !== 1) return [[dx, dy]];
  return buildCorridorPath(dg, player, first, canWalkOnWater, dx, dy, maxSteps);
}
