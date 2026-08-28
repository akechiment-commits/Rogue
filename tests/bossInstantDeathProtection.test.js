import { describe, expect, it } from "vitest";
import {
  bossInstantDeathDamage,
  drownMonsterIfNeeded,
  fireTrapItem,
  resolveSealedFloatOnWater,
} from "../items.js";
import { applyWandEffect } from "../wands.js";
import { T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

const noop = () => {};

function makeBoss(overrides = {}) {
  return {
    id: "boss-1",
    name: "遺物の番人",
    hp: 100,
    maxHp: 100,
    exp: 20,
    x: 5,
    y: 5,
    isBoss: true,
    ...overrides,
  };
}

describe("ボスの即死系効果保護", () => {
  it("即死効果の代替ダメージは現在HPの1/4", () => {
    expect(bossInstantDeathDamage(makeBoss({ hp: 100 }))).toBe(25);
    expect(bossInstantDeathDamage(makeBoss({ hp: 7 }))).toBe(1);
    expect(bossInstantDeathDamage({ hp: 100 })).toBe(0);
  });

  it("腐敗の罠ではボスが食料に変わらず割合ダメージを受ける", () => {
    const boss = makeBoss();
    const dg = makeEmptyDg({ monsters: [boss] });
    const messages = [];

    fireTrapItem(
      { id: "rot-1", name: "腐敗の罠", effect: "rot_trap", x: 5, y: 5 },
      { name: "石", type: "stone" },
      dg, 5, 5, messages, new Set(), makePlayer(),
    );

    expect(dg.monsters).toContain(boss);
    expect(boss.hp).toBe(75);
    expect(dg.items).toEqual([]);
    expect(messages.some((message) => message.includes("25ダメージ"))).toBe(true);
  });

  it("水への強制着地ではボスを即死させず割合ダメージにする", () => {
    const boss = makeBoss();
    const dg = makeEmptyDg({ monsters: [boss] });
    dg.map[5][5] = T.WATER;
    const messages = [];

    expect(drownMonsterIfNeeded(boss, dg, makePlayer(), messages, noop)).toBe(true);
    expect(dg.monsters).toContain(boss);
    expect(boss.hp).toBe(75);
    expect(messages.some((message) => message.includes("水没に耐えた"))).toBe(true);
  });

  it("封印解除時に水から出られないボスも即死しない", () => {
    const boss = makeBoss({ sealed: true });
    const dg = makeEmptyDg({ monsters: [boss] });
    dg.map[5][5] = T.WATER;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      dg.map[5 + dy][5 + dx] = T.WATER;
    }
    const messages = [];

    expect(resolveSealedFloatOnWater(boss, dg, makePlayer(), messages, noop)).toBe("damaged");
    expect(dg.monsters).toContain(boss);
    expect(boss.hp).toBe(75);
  });

  it("聖域へ強制移動されたボスも消滅せず割合ダメージを受ける", () => {
    const boss = makeBoss({ x: 6, y: 5 });
    const dg = makeEmptyDg({
      monsters: [boss],
      pentacles: [{ kind: "sanctuary", name: "聖域の魔方陣", x: 7, y: 5 }],
    });
    dg.map[5][8] = T.WALL;
    const messages = [];

    applyWandEffect("knockback", "monster", boss, 1, 0, dg, makePlayer(), messages, noop);

    expect(dg.monsters).toContain(boss);
    expect(boss.hp).toBe(68);
    expect(messages.some((message) => message.includes("聖域の力に耐えた"))).toBe(true);
  });

  it("ボスへの体力交換は与えたダメージをプレイヤーHPにする", () => {
    const boss = makeBoss();
    const dg = makeEmptyDg({ monsters: [boss] });
    const player = makePlayer({ hp: 80, maxHp: 100 });
    const messages = [];

    applyWandEffect("vitality_swap", "monster", boss, 1, 0, dg, player, messages, noop);

    expect(boss.hp).toBe(75);
    expect(player.hp).toBe(25);
    expect(messages.some((message) => message.includes("80→25"))).toBe(true);
  });
});
