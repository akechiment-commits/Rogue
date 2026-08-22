import { describe, expect, it } from "vitest";
import { RINGS, makeArrow, shootArrow, throwItemAlongLine } from "../items.js";
import "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("ワッカの指輪", () => {
  it("指輪カタログに必中ホーミング効果がある", () => {
    const ring = RINGS.find((item) => item.effect === "wakka_ring");
    expect(ring).toMatchObject({
      name: "ワッカの指輪",
      type: "ring",
      rarity: "A",
    });
    expect(ring.desc).toContain("ホーミング");
    expect(ring.desc).toContain("必中");
  });

  it("ホーミング投擲は壁越しでも指定敵へ届き、かわしモグラを貫通できる", () => {
    const p = makePlayer({ x: 5, y: 5, atk: 12 });
    const mole = {
      id: "wakka-mole",
      name: "かわしモグラ",
      baseKind: "dodgemole",
      x: 12,
      y: 5,
      hp: 50,
      maxHp: 50,
      def: 0,
    };
    const dg = makeEmptyDg({
      monsters: [mole],
      map: Array.from({ length: 30 }, () => Array(60).fill(0)),
    });
    const ml = [];

    throwItemAlongLine(p, dg, { name: "短剣", type: "weapon", atk: 4 }, 0, 0, 10, ml, p, null, {
      homingTarget: mole,
      bypassDodgemole: true,
    });

    expect(mole.hp).toBeLessThan(50);
  });

  it("ホーミング投擲の通常経路はかわしモグラを避ける", () => {
    const p = makePlayer({ x: 5, y: 5, atk: 12 });
    const mole = {
      id: "normal-mole",
      name: "かわしモグラ",
      baseKind: "dodgemole",
      x: 6,
      y: 5,
      hp: 50,
      maxHp: 50,
      def: 0,
    };
    const dg = makeEmptyDg({ monsters: [mole] });
    const ml = [];

    throwItemAlongLine(p, dg, { name: "短剣", type: "weapon", atk: 4 }, 1, 0, 10, ml, p, null, {
      homingTarget: mole,
    });

    expect(mole.hp).toBe(50);
  });

  it("射撃処理でもワッカの指輪は通常矢を必中ホーミングさせる", () => {
    const p = makePlayer({ x: 5, y: 5, atk: 12 });
    const arrow = makeArrow(1);
    p.inventory = [arrow];
    const target = { id: "shot-target", name: "遠くの敵", x: 12, y: 5, hp: 50, maxHp: 50, def: 0 };
    const dg = makeEmptyDg({
      monsters: [target],
      map: Array.from({ length: 30 }, () => Array(60).fill(0)),
    });
    const ml = [];

    shootArrow(p, dg, 0, 1, 0, ml, null, null, null, null, { wakka: true });

    expect(target.hp).toBeLessThan(50);
    expect(ml.some((message) => message.includes("ホーミング必中"))).toBe(true);
    expect(p.inventory).toHaveLength(0);
  });
});
