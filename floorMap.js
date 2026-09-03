import { MH, MW, T } from "./utils.js";

export const FLOOR_MAP_MARKERS = Object.freeze({
  player: { color: "#ffffff", label: "自分" },
  item: { color: "#38bdf8", label: "アイテム" },
  enemy: { color: "#ef4444", label: "敵" },
  merchant: { color: "#fb923c", label: "行商人" },
  stairs: { color: "#84cc16", label: "階段" },
  trap: { color: "#eab308", label: "罠" },
  spring: { color: "#06b6d4", label: "泉" },
  bigbox: { color: "#f59e0b", label: "大箱" },
  gacha: { color: "#10b981", label: "ガチャ" },
  altar: { color: "#ec4899", label: "祭壇" },
  dimensionalVault: { color: "#7c3aed", label: "宝物庫" },
  pentacle: { color: "#d946ef", label: "魔方陣" },
  statue: { color: "#a16207", label: "石像" },
  vent: { color: "#14b8a6", label: "風穴" },
  portal: { color: "#2563eb", label: "転送" },
  oil: { color: "#854d0e", label: "油" },
  bone: { color: "#d1d5db", label: "骨" },
});

export const FLOOR_MAP_TERRAIN = Object.freeze({
  unknown: "#070a12",
  wall: "#283246",
  breakableWall: "#694a2a",
  floor: "#717c8a",
  corridor: "#596575",
  water: "#164f72",
});

function inBounds(x, y) {
  return x >= 0 && x < MW && y >= 0 && y < MH;
}

export function isFloorMapCellKnown(dg, x, y) {
  return !!(dg?.visible?.[y]?.[x] || dg?.explored?.[y]?.[x]);
}

function isVisible(dg, x, y) {
  return !!dg?.visible?.[y]?.[x];
}

function canShowSensedMonster(dg, p, x, y) {
  if (isVisible(dg, x, y)) return true;
  return !!(
    (p?.monsterSenseTurns || 0) > 0 ||
    dg?.monsterSenseActive ||
    p?.rings?.some((ring) => ring.effect === "clairvoyance_ring")
  );
}

function canShowItem(dg, item, x, y) {
  return isVisible(dg, x, y) || !!item?.discovered || !!dg?.itemsRevealed ||
    !!dg?.visible?.[y]?.[x];
}

function getTerrain(dg, x, y) {
  if (!isFloorMapCellKnown(dg, x, y)) return "unknown";
  const tile = dg.map?.[y]?.[x];
  if (tile === T.WALL) return "wall";
  if (tile === T.BWALL) return "breakableWall";
  if (tile === T.WATER) return "water";
  if (tile === T.FLOOR && (dg.rooms || []).every((room) =>
    !(x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h))) {
    return "corridor";
  }
  return "floor";
}

export function getFloorMapMarker(dg, p, x, y) {
  if (!isFloorMapCellKnown(dg, x, y)) return null;
  if (p?.x === x && p?.y === y) return "player";

  const monster = (dg.monsters || []).find((entry) => entry.x === x && entry.y === y && entry.hp > 0);
  if (monster && canShowSensedMonster(dg, p, x, y) &&
      !(monster.subtype === "itemMimic" && monster.disguisedAsItem !== false)) {
    return monster.isWanderingMerchant ? "merchant" : "enemy";
  }

  const item = (dg.items || []).find((entry) => entry.x === x && entry.y === y && !entry.wallEmbedded);
  if (item && canShowItem(dg, item, x, y)) return "item";

  const disguisedStair = (dg.traps || []).find((entry) =>
    entry.x === x && entry.y === y && entry.disguise && !entry.revealed);
  if (disguisedStair) return "stairs";

  const trap = (dg.traps || []).find((entry) => entry.x === x && entry.y === y && entry.revealed);
  if (trap) return trap.effect === "bone" ? "bone" : "trap";

  if ((dg.map?.[y]?.[x] === T.SD) || (dg.map?.[y]?.[x] === T.SU)) return "stairs";
  if ((dg.springs || []).some((entry) => entry.x === x && entry.y === y)) return "spring";
  if ((dg.bigboxes || []).some((entry) => entry.x === x && entry.y === y)) return "bigbox";
  if ((dg.gachaMachines || []).some((entry) => entry.x === x && entry.y === y)) return "gacha";
  if ((dg.altars || []).some((entry) => entry.x === x && entry.y === y)) return "altar";
  if ((dg.dimensionalVaults || []).some((entry) => entry.x === x && entry.y === y)) return "dimensionalVault";
  const pentacle = (dg.pentacles || []).find((entry) => entry.x === x && entry.y === y);
  if (pentacle) return pentacle.kind === "fixed_portal" ? "portal" : "pentacle";
  if ((dg.statues || []).some((entry) => entry.x === x && entry.y === y)) return "statue";
  if ((dg.vents || []).some((entry) => entry.x === x && entry.y === y)) return "vent";
  if ((dg.oilyTiles || []).some((entry) => entry.x === x && entry.y === y)) return "oil";
  return null;
}

export function buildFloorMap(dg, p) {
  const cells = [];
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      cells.push({ x, y, terrain: getTerrain(dg, x, y), marker: getFloorMapMarker(dg, p, x, y) });
    }
  }
  return { width: MW, height: MH, cells };
}
