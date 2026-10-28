import { afterEach, describe, expect, it } from "vitest";
import { drainAnims, drainItemArcs, pushItemFlyAnim } from "../animEvents.js";
import { throwItemAlongLine } from "../items.js";
import "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => drainItemArcs());

describe("プレイヤー投擲の放物線演出", () => {
  it("指定した投擲だけ高い弧と地面影を持つ", () => {
    pushItemFlyAnim(2, 3, 5, 3, 23, null, { flightArc: true });

    const [flight] = drainItemArcs().flat();
    expect(flight).toMatchObject({
      type: "itemArc",
      fromX: 2,
      fromY: 3,
      toX: 5,
      toY: 3,
      straight: true,
      flightArc: true,
      flightArcHeight: 0.9,
    });
  });

  it("指定しない通常投擲の弧は従来のまま", () => {
    pushItemFlyAnim(2, 3, 5, 3, 23);

    const [flight] = drainItemArcs().flat();
    expect(flight).not.toHaveProperty("flightArc");
  });

  it("ワッカの指輪用の放物線アイテム弾は通常の丸い弾アニメを重ねない", () => {
    const player = makePlayer({ x: 5, y: 5, atk: 12 });
    const target = { id: "arc-target", name: "敵", x: 8, y: 5, hp: 50, maxHp: 50, def: 0 };
    const dg = makeEmptyDg({ monsters: [target] });
    pushItemFlyAnim(player.x, player.y, target.x, target.y, 20, null, { flightArc: true });

    throwItemAlongLine(player, dg, { name: "短剣", type: "weapon", atk: 4, tile: 20 }, 0, 0, 10, [], player, null, {
      homingTarget: target,
      skipProjectileAnim: true,
    });

    expect(drainItemArcs().flat().filter(event => event.flightArc)).toHaveLength(1);
    expect(drainAnims().filter(event => event.type === "projectile")).toHaveLength(0);
  });
});
