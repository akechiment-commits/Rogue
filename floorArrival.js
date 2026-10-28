import { syncSpawnFloorMeta } from "./utils.js";
import { placeFallenEntities } from "./pitfallPlacement.js";

/** 別階への到着では滞在カウント・到達階・次回湧きを一緒に更新する。 */
export function synchronizeFloorArrival(state, dungeon, { floorChanged = true, spawnDelay = 30 } = {}) {
  if (floorChanged) state.floorTurns = 0;
  syncSpawnFloorMeta(state, dungeon);
  if (state.dungeonType !== "tutorial") dungeon.nextSpawnTurn = (state.player.turns || 0) + spawnDelay;
  placeFallenEntities(dungeon, [], { player: state.player, actionTime: state.player.actionTime || 0 });
}
