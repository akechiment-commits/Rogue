import { ACTION_TIME_BASE, syncActorsToClock } from "./actionClock.js";
import { T, hasGravityPentacle } from "./utils.js";
import { monEffectiveFloat, monEffectiveMagicImmune, monEffectiveWallWalker, monEffectiveSpeed } from "./monTraits.js";

export const ABSENCE_PATROL_INTERVAL = 4;
export const ABSENCE_PATROL_MAX_DISTANCE = 48;
const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const key = (x, y) => `${x},${y}`;

function recognizesPlayer(monster, dungeon, player) {
  if (monster.isWanderingMerchant && monster.state === "friendly") return false;
  if (monster.aware) return true;
  if (monster.dormant || monster.sleepTurns > 0 || monster.darknessTurns > 0 ||
      player.invisibleTurns > 0 || player.potConfinedTurns > 0) return false;
  const sameRoom = dungeon.rooms?.some(room =>
    [monster, player].every(pos => pos.x >= room.x && pos.x < room.x + room.w &&
      pos.y >= room.y && pos.y < room.y + room.h));
  return !!(sameRoom || dungeon.visible?.[monster.y]?.[monster.x] ||
    Math.max(Math.abs(monster.x - player.x), Math.abs(monster.y - player.y)) <= 1);
}

/** 不在フロアは更新せず、離脱時刻と待ち伏せする敵だけを保存する。 */
export function suspendFloor(dungeon, player, { stairs = false } = {}) {
  dungeon.absentSince = player.actionTime || 0;
  for (const monster of dungeon.monsters || []) {
    monster.absentSince = dungeon.absentSince;
    monster.waitDuringAbsence = stairs && recognizesPlayer(monster, dungeon, player);
  }
}

function canPatrol(monster) {
  return monster.hp > 0 && !monster.waitDuringAbsence && !monster.dormant &&
    !monster.stationary && !monster.paralyzed && !monster.waterOnly &&
    monster.subtype !== "grabber" && monster.baseKind !== "grabber" &&
    !(monster.subtype === "itemMimic" && monster.disguisedAsItem !== false) &&
    !(monster.type === "shopkeeper" && !monster.isWanderingMerchant) &&
    !["sleepTurns", "frozenTurns", "immobileTurns", "knockdownTurns"].some(k => monster[k] > 0);
}

function patrolDestination(monster, dungeon, occupied, blocked, distance, random) {
  const map = dungeon.map;
  const wallWalker = monEffectiveWallWalker(monster);
  const canFloat = monEffectiveFloat(monster);
  const canEnter = (x, y) => {
    if (y <= 0 || y >= map.length - 1 || x <= 0 || x >= map[y].length - 1) return false;
    const tile = map[y][x];
    if (!tile || tile === T.BWALL || (tile === T.WALL && !wallWalker)) return false;
    if (blocked.has(key(x, y)) || occupied.has(key(x, y))) return false;
    return tile !== T.WATER || monster.waterWalker ||
      (canFloat && (monEffectiveMagicImmune(monster) || !hasGravityPentacle(dungeon, x, y)));
  };
  // 到達可能な範囲だけを一度探索する。長期不在でもマップサイズ以上に仕事を増やさない。
  const queue = [{ x: monster.x, y: monster.y, distance: 0 }];
  const visited = new Set([key(monster.x, monster.y)]);
  const destinations = [];
  let farthest = 0;
  for (let i = 0; i < queue.length; i++) {
    const pos = queue[i];
    if (pos.distance >= distance) continue;
    for (const [dx, dy] of DIRECTIONS) {
      const x = pos.x + dx, y = pos.y + dy, id = key(x, y);
      if (visited.has(id) || !canEnter(x, y)) continue;
      visited.add(id);
      const next = { x, y, distance: pos.distance + 1, dx, dy };
      queue.push(next);
      if (map[y][x] !== T.WALL) {
        destinations.push(next);
        farthest = Math.max(farthest, next.distance);
      }
    }
  }
  const candidates = destinations.filter(pos => pos.distance >= Math.ceil(farthest / 2));
  return candidates.length ? candidates[Math.floor(random() * candidates.length)] : null;
}

/** 復帰時にだけ巡回後の配置を計算し、敵の未消化行動を残さない。 */
export function resumeFloor(dungeon, player, { random = Math.random } = {}) {
  const now = player.actionTime || 0;
  const monsters = dungeon.monsters || [];
  const occupied = new Set(monsters.filter(m => m.hp > 0).map(m => key(m.x, m.y)));
  const blocked = new Set([key(player.x, player.y)]);
  for (const pos of [dungeon.stairUp, dungeon.stairDown,
    ...(dungeon.statues || []), ...(dungeon.traps || []), ...(dungeon.pentacles || []),
    ...(dungeon.pendingBombs || [])]) {
    if (pos) blocked.add(key(pos.x, pos.y));
  }
  let moved = 0;
  for (const monster of monsters) {
    // 不在中に別階から落下・転送された敵は、その到着以降の時間だけを使う。
    const since = monster.absentSince ?? Math.max(dungeon.absentSince ?? now, monster.actionTime ?? now);
    const beats = Number.isFinite(since) ? Math.max(0, (now - since) / ACTION_TIME_BASE) : 0;
    const distance = Math.min(ABSENCE_PATROL_MAX_DISTANCE,
      Math.floor(beats * monEffectiveSpeed(monster) / ABSENCE_PATROL_INTERVAL));
    if (distance > 0 && canPatrol(monster)) {
      const destination = patrolDestination(monster, dungeon, occupied, blocked, distance, random);
      if (destination) {
        occupied.delete(key(monster.x, monster.y));
        monster.x = destination.x;
        monster.y = destination.y;
        monster.dir = { x: destination.dx, y: destination.dy };
        monster.aware = false;
        monster.lastPx = monster.x;
        monster.lastPy = monster.y;
        monster.patrolTarget = null;
        monster.posHistory = [];
        monster._idleStuck = 0;
        occupied.add(key(monster.x, monster.y));
        moved++;
      }
    }
    delete monster.absentSince;
    delete monster.waitDuringAbsence;
    delete monster._movedThisTurn;
    monster._phaseActionCount = 0;
    monster._movesMadeThisPhase = 0;
    monster.turnAttacks = 0;
  }
  delete dungeon.absentSince;
  syncActorsToClock(monsters, now);
  return moved;
}
