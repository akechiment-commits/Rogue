import { afterEach, describe, expect, it, vi } from "vitest";
import { fireTrapPlayer } from "../traps.js";
import { placeItemAt, splashPotion, throwItemAlongLine } from "../items.js";
import { applyWandEffect } from "../wands.js";
import { drainItemArcs } from "../animEvents.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T, MW, MH } from "../utils.js";

afterEach(() => vi.restoreAllMocks());

describe("矢罠", () => {
  it("正面側からプレイヤーまで矢が飛ぶアニメーションを出す", () => {
    drainItemArcs();
    const map = Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR));
    for (let x = 0; x < MW; x++) map[0][x] = T.WALL;
    const player = makePlayer({ x: 10, y: 10, facing: { dx: 0, dy: -1 } });
    const trap = { id: "arrow-animation", name: "矢の罠", effect: "arrow_trap", x: player.x, y: player.y, permanent: true };
    const dg = makeEmptyDg({ map, traps: [trap] });

    fireTrapPlayer(trap, player, dg, []);

    const arrowFlight = drainItemArcs().flat().find(event => event.type === "itemArc");
    expect(arrowFlight).toMatchObject({ fromX: 10, fromY: 1, toX: 10, toY: 10, straight: true });
    expect(arrowFlight.path.at(-1)).toEqual({ x: player.x, y: player.y });
  });

  it("落下したアイテムで起動後に壊れた矢罠は予備矢を残さない", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const map = Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR));
    for (let x = 0; x < MW; x++) map[0][x] = T.WALL;
    const player = makePlayer({ x: 1, y: 1 });
    const trap = { id: "arrow-activated", name: "矢の罠", effect: "arrow_trap", x: 5, y: 5 };
    const dg = makeEmptyDg({ map, traps: [trap] });
    const messages = [];

    placeItemAt(dg, trap.x, trap.y, { id: "trigger-stone", name: "石", type: "misc", tile: 23 }, messages, new Set(), 0, player);

    expect(dg.traps).not.toContain(trap);
    const firedArrows = dg.items.filter(item => item.type === "arrow");
    expect(firedArrows).toHaveLength(1);
    expect(firedArrows[0].count).toBe(1);
  });

  it("投擲物で起動後に壊れた矢罠も予備矢を残さない", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const map = Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR));
    for (let x = 0; x < MW; x++) map[0][x] = T.WALL;
    const player = makePlayer({ x: 1, y: 1 });
    const trap = { id: "arrow-thrown-item", name: "矢の罠", effect: "arrow_trap", x: 5, y: 5 };
    const dg = makeEmptyDg({ map, traps: [trap] });

    throwItemAlongLine(
      { x: 5, y: 1, name: "投擲者" }, dg,
      { id: "thrown-stone", name: "石", type: "misc", tile: 23 },
      0, 1, 4, [], player, null, { hitChance: 1 },
    );

    expect(dg.traps).not.toContain(trap);
    const firedArrows = dg.items.filter(item => item.type === "arrow");
    expect(firedArrows).toHaveLength(1);
    expect(firedArrows[0].count).toBe(1);
  });

  it("踏んで起動後に壊れた矢罠は残弾を落とさない", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = makePlayer({ x: 5, y: 5 });
    const trap = { id: "arrow-stepped", name: "矢の罠", effect: "arrow_trap", x: 5, y: 5 };
    const dg = makeEmptyDg({ traps: [trap] });

    fireTrapPlayer(trap, player, dg, []);

    expect(dg.traps).not.toContain(trap);
    expect(dg.items.filter(item => item.type === "arrow")).toHaveLength(0);
  });

  it("薬液で壊した矢罠は残弾を落とす", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = makePlayer({ x: 1, y: 1 });
    const trap = { id: "arrow-potion-break", name: "矢の罠", effect: "arrow_trap", x: 5, y: 5 };
    const dg = makeEmptyDg({ traps: [trap] });

    splashPotion(dg, trap.x, trap.y, "fire", 10, player, [], null);

    expect(dg.traps).not.toContain(trap);
    expect(dg.items.filter(item => item.type === "arrow").reduce((sum, item) => sum + item.count, 0)).toBeGreaterThanOrEqual(2);
  });

  it("杖の効果で壊した矢罠も残弾を落とす", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = makePlayer({ x: 1, y: 1 });
    const trap = { id: "arrow-wand-break", name: "矢の罠", effect: "arrow_trap", x: 5, y: 5 };
    const dg = makeEmptyDg({ traps: [trap] });

    applyWandEffect("soften", "trap", trap, 0, 0, dg, player, [], () => {});

    expect(dg.traps).not.toContain(trap);
    expect(dg.items.filter(item => item.type === "arrow").reduce((sum, item) => sum + item.count, 0)).toBeGreaterThanOrEqual(2);
  });
});
