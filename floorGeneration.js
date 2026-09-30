import { genDungeon, genTreasureRoom, genTutorialFloor, genDebugFloorByDepth, prepareLastFloor } from "./dungeon.js";

/** 階段移動と落下による先行生成で同じ冒険の生成条件を使う。depth は1始まり。 */
export function generateSessionFloor(session, depth, { pitfall = false, sourceDepth = session?.player?.depth ?? depth - 1 } = {}) {
  const dungeonType = session?.dungeonType || "beginner";
  const maxDepth = session?.maxDepth ?? null;
  const treasure = pitfall && maxDepth !== null && sourceDepth >= maxDepth && depth > sourceDepth;
  let floor;
  if (treasure) floor = genTreasureRoom(sourceDepth, dungeonType);
  else if (dungeonType === "tutorial") {
    const mobile = typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 700;
    floor = genTutorialFloor(depth, { mobile });
  } else if (session?.isDebugRun && depth >= 2) floor = genDebugFloorByDepth(depth, dungeonType);
  else floor = genDungeon(depth - 1, dungeonType);
  if (!treasure && maxDepth !== null && depth >= maxDepth && !floor.isLastFloor && dungeonType !== "tutorial") {
    prepareLastFloor(floor, dungeonType);
  }
  return floor;
}
