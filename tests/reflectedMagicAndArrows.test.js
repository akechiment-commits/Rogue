import { afterEach, expect, it, vi } from "vitest";
import { applySpellEffect, castSpellBolt, makePoisonArrow, shootArrow } from "../items.js";
import { drainAnims } from "../animEvents.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
  drainAnims();
});

it("反射された毒矢は反射者を死因と毒の発生源に記録する", () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const player = makePlayer({ x: 5, y: 5, inventory: [makePoisonArrow(1)] });
  const reflector = { id: "mirror", name: "ミラーゴーレム", subtype: "reflector", x: 8, y: 5, hp: 40, maxHp: 40 };
  const dungeon = makeEmptyDg({ monsters: [reflector] });
  const messages = [];

  shootArrow(player, dungeon, 0, 1, 0, messages, () => {});

  expect(player.hp).toBeLessThan(100);
  expect(player.deathCause).toBe("ミラーゴーレムに跳ね返された毒矢で");
  expect(player.poisonSourceName).toBe("ミラーゴーレム");
});

it("反射された炎の魔法は耐火を適用し、反射者を死因に記録する", () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const player = makePlayer({ x: 5, y: 5, armor: { ability: "fire_resist" } });
  const reflector = { id: "mirror", name: "ミラーマン", subtype: "magicreflect", x: 7, y: 5, hp: 40, maxHp: 40 };
  const dungeon = makeEmptyDg({ monsters: [reflector] });
  const messages = [];

  castSpellBolt(player, dungeon, { effect: "fire_bolt", range: 8 }, 1, 0, messages, () => {});

  expect(player.hp).toBe(87);
  expect(player.deathCause).toBe("ミラーマンに炎の魔法を反射されて");
  expect(messages.some(message => message.includes("耐火"))).toBe(true);
});

it("反射された氷の魔法は通常通り移動封じを与えるが、耐氷で防げる", () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const reflector = { id: "mirror", name: "ミラーマン", subtype: "magicreflect", x: 7, y: 5, hp: 40, maxHp: 40 };
  const normalPlayer = makePlayer({ x: 5, y: 5 });
  const normalMessages = [];
  castSpellBolt(normalPlayer, makeEmptyDg({ monsters: [reflector] }),
    { effect: "ice_bolt", range: 8 }, 1, 0, normalMessages, () => {});
  expect(normalPlayer.immobileTurns).toBeGreaterThan(0);

  const resistantPlayer = makePlayer({ x: 5, y: 5, armor: { ability: "ice_resist" } });
  const resistantMessages = [];
  castSpellBolt(resistantPlayer, makeEmptyDg({ monsters: [{ ...reflector }] }),
    { effect: "ice_bolt", range: 8 }, 1, 0, resistantMessages, () => {});
  expect(resistantPlayer.hp).toBe(90);
  expect(resistantPlayer.immobileTurns || 0).toBe(0);
  expect(resistantMessages.some(message => message.includes("耐氷"))).toBe(true);
});

it("反射された毒の魔法は反射者を継続毒の発生源に記録する", () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const player = makePlayer({ x: 5, y: 5 });
  const reflector = { id: "mirror", name: "ミラーマン", subtype: "magicreflect", x: 7, y: 5, hp: 40, maxHp: 40 };
  const dungeon = makeEmptyDg({ monsters: [reflector] });

  castSpellBolt(player, dungeon, { effect: "poison_bolt", range: 8 }, 1, 0, [], () => {});

  expect(player.poisonSourceName).toBe("ミラーマン");
});

it("魔法反射された範囲雷は雷耐性で軽減する", () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const player = makePlayer({ armor: { ability: "lightning_resist" } });
  const reflector = { name: "反射敵", x: 6, y: 5, hp: 100, maxHp: 100, subtype: "magicreflect" };
  const dungeon = makeEmptyDg({ monsters: [reflector], visible: Array.from({ length: 30 }, () => Array(50).fill(true)) });
  const messages = [];

  applySpellEffect("lightning_magic", "self", null, 0, 0, dungeon, player, messages, () => {});

  expect(player.hp).toBe(86);
  expect(player.deathCause).toBe("反射敵に雷の魔法を反射されて");
  expect(messages.some(message => message.includes("雷耐性"))).toBe(true);
});

it("魔法反射は敵の障壁より先に処理する", () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const player = makePlayer();
  const reflector = { name: "反射敵", x: 6, y: 5, hp: 100, maxHp: 100, subtype: "magicreflect", barrier: 1 };
  const dungeon = makeEmptyDg({ monsters: [reflector], visible: Array.from({ length: 30 }, () => Array(50).fill(true)) });
  const messages = [];

  applySpellEffect("lightning_magic", "self", null, 0, 0, dungeon, player, messages, () => {});

  expect(player.hp).toBeLessThan(100);
  expect(reflector.barrier).toBe(1);
});

it("地震の魔法も魔法反射を障壁より先に処理する", () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const player = makePlayer();
  const reflector = { name: "反射敵", x: 6, y: 5, hp: 100, maxHp: 100, subtype: "magicreflect", barrier: 1 };
  const dungeon = makeEmptyDg({ monsters: [reflector], visible: Array.from({ length: 30 }, () => Array(50).fill(true)) });
  const messages = [];

  applySpellEffect("earthquake_magic", "self", null, 0, 0, dungeon, player, messages, () => {});

  expect(player.hp).toBeLessThan(100);
  expect(reflector.barrier).toBe(1);
  expect(player.deathCause).toBe("反射敵に地震の魔法を反射されて");
});
