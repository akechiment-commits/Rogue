import { MH, MW } from "./utils.js";

function revealRoom(dungeon, room) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      dungeon.visible[y][x] = true;
      dungeon.explored[y][x] = true;
    }
  }
}

function restrictToAdjacent(dungeon, player) {
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      if (Math.abs(x - player.x) > 1 || Math.abs(y - player.y) > 1) dungeon.visible[y][x] = false;
    }
  }
}

/** refreshFOV 後に、明かりの魔方陣と視界操作モンスターの効果を上書きする。 */
export function applyVisibilityOverrides(dungeon, player, { findRoom, inMagicSealRoom }) {
  if (dungeon.pentacles?.length > 0 && player.hp > 0) {
    const playerRoom = findRoom(dungeon.rooms, player.x, player.y);
    for (const pentacle of dungeon.pentacles) {
      if (pentacle.kind !== "light" || inMagicSealRoom(pentacle.x, pentacle.y, dungeon)) continue;
      if (pentacle.cursed) {
        const room = findRoom(dungeon.rooms, pentacle.x, pentacle.y);
        if (playerRoom && room && playerRoom === room) restrictToAdjacent(dungeon, player);
      } else if (pentacle.blessed) {
        for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
          dungeon.visible[y][x] = true;
          dungeon.explored[y][x] = true;
        }
      } else {
        const room = findRoom(dungeon.rooms, pentacle.x, pentacle.y);
        if (room) revealRoom(dungeon, room);
      }
    }
  }
  if (player.hp <= 0) return;
  const playerRoom = findRoom(dungeon.rooms, player.x, player.y);
  for (const monster of dungeon.monsters) {
    if (monster.baseKind !== "starlight" || monster.hp <= 0) continue;
    const room = findRoom(dungeon.rooms, monster.x, monster.y);
    if (room) revealRoom(dungeon, room);
  }
  for (const monster of dungeon.monsters) {
    if (monster.baseKind !== "darkness" || monster.hp <= 0) continue;
    const room = findRoom(dungeon.rooms, monster.x, monster.y);
    if (room && playerRoom && room === playerRoom) {
      restrictToAdjacent(dungeon, player);
      break;
    }
  }
}
