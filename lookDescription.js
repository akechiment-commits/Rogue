import { T } from "./utils.js";

/**
 * 調べるモードで 1 マスに表示する説明を組み立てる。
 * 表示名の解決は呼び出し側から注入し、React の状態や UI には依存しない。
 */
export function describeLookCell({
  x,
  y,
  dungeon,
  session,
  itemDisplayName,
  bigboxDisplayName,
}) {
  if (!dungeon) return "";
  const tile = dungeon.map[y]?.[x];
  if (!dungeon.explored[y]?.[x]) return "未探索";

  if (tile === T.WALL || tile === T.BWALL) {
    if (dungeon.itemsRevealed) {
      const wallItem = dungeon.items.find((item) => item.x === x && item.y === y && item.wallEmbedded);
      if (wallItem) return `壁の中: ${itemDisplayName(wallItem)}`;
    }
    return tile === T.BWALL ? "壊せる壁" : "壁";
  }

  const parts = [];
  if (tile === T.SD) parts.push("下り階段");
  else if (tile === T.SU) parts.push("上り階段");
  else {
    const disguisedTrap = dungeon.traps?.find((trap) => trap.x === x && trap.y === y && trap.disguise && !trap.revealed);
    if (disguisedTrap) parts.push(disguisedTrap.disguise === "stair_up" ? "上り階段" : "下り階段");
  }

  const monster = dungeon.visible[y]?.[x] && dungeon.monsters.find((mon) => mon.x === x && mon.y === y);
  if (monster) parts.push(`${monster.name} HP:${monster.hp}/${monster.maxHp}`);

  for (const item of dungeon.items.filter((entry) => entry.x === x && entry.y === y && !entry.wallEmbedded)) {
    const name = itemDisplayName(item);
    parts.push(item.shopPrice ? `${name}(${item.shopPrice}G)` : name);
  }

  const trap = dungeon.traps.find((entry) => entry.x === x && entry.y === y && entry.revealed);
  if (trap) parts.push(`罠:${trap.name}`);
  const spring = dungeon.springs?.find((entry) => entry.x === x && entry.y === y);
  if (spring) parts.push(spring.name || "泉");
  const bigbox = dungeon.bigboxes?.find((entry) => entry.x === x && entry.y === y);
  if (bigbox) parts.push(bigboxDisplayName(bigbox, bigbox.revealed === true || !!session?.allBcKnown));
  if (dungeon.pentacles?.some((entry) => entry.x === x && entry.y === y)) parts.push(dungeon.pentacles.find((entry) => entry.x === x && entry.y === y).name);
  if (dungeon.vents?.some((entry) => entry.x === x && entry.y === y)) parts.push("風穴");
  if (dungeon.statues?.some((entry) => entry.x === x && entry.y === y)) parts.push("石像");
  return parts.length > 0 ? parts.join(" / ") : "何もない";
}
