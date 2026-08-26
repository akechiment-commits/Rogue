import { describe, expect, it } from "vitest";
import { getFloorMapMarker, buildFloorMap } from "../floorMap.js";
import { MH, MW, T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

const allKnown = () => Array.from({ length: MH }, () => Array(MW).fill(true));

describe("フロアマップ", () => {
  it("既知の地形だけを描画し、オブジェクトを種類別マーカーにする", () => {
    const dg = makeEmptyDg({
      rooms: [],
      visible: allKnown(),
      explored: allKnown(),
      items: [{ id: "item", type: "potion", x: 2, y: 1 }],
      monsters: [{ id: "enemy", name: "敵", hp: 10, x: 3, y: 1 }],
      traps: [{ id: "trap", effect: "land_mine", x: 4, y: 1, revealed: true }, { id: "bone", effect: "bone", x: 5, y: 1, revealed: true }],
      springs: [{ x: 6, y: 1, revealed: true }],
      bigboxes: [{ x: 7, y: 1, revealed: true }],
      pentacles: [{ x: 8, y: 1, kind: "magic_seal", revealed: true }, { x: 9, y: 1, kind: "fixed_portal", revealed: true }],
      statues: [{ x: 10, y: 1, revealed: true }],
      vents: [{ x: 11, y: 1, revealed: true }],
      oilyTiles: [{ x: 12, y: 1 }],
    });
    dg.map[1][13] = T.SD;
    const player = makePlayer({ x: 1, y: 1 });

    expect(getFloorMapMarker(dg, player, 1, 1)).toBe("player");
    expect(getFloorMapMarker(dg, player, 2, 1)).toBe("item");
    expect(getFloorMapMarker(dg, player, 3, 1)).toBe("enemy");
    expect(getFloorMapMarker(dg, player, 4, 1)).toBe("trap");
    expect(getFloorMapMarker(dg, player, 5, 1)).toBe("bone");
    expect(getFloorMapMarker(dg, player, 6, 1)).toBe("spring");
    expect(getFloorMapMarker(dg, player, 7, 1)).toBe("bigbox");
    expect(getFloorMapMarker(dg, player, 8, 1)).toBe("pentacle");
    expect(getFloorMapMarker(dg, player, 9, 1)).toBe("portal");
    expect(getFloorMapMarker(dg, player, 10, 1)).toBe("statue");
    expect(getFloorMapMarker(dg, player, 11, 1)).toBe("vent");
    expect(getFloorMapMarker(dg, player, 12, 1)).toBe("oil");
    expect(getFloorMapMarker(dg, player, 13, 1)).toBe("stairs");
  });

  it("未探索セルには地形もマーカーも表示しない", () => {
    const dg = makeEmptyDg({ rooms: [], visible: allKnown(), explored: allKnown() });
    dg.visible[0][0] = false;
    dg.explored[0][0] = false;
    dg.items.push({ id: "hidden-item", type: "potion", x: 0, y: 0 });
    const map = buildFloorMap(dg, makePlayer({ x: 1, y: 1 }));
    expect(map.cells[0]).toMatchObject({ x: 0, y: 0, terrain: "unknown", marker: null });
  });
});
