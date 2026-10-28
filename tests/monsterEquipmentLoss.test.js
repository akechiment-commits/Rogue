import { afterEach, describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI, tryMimicAdjacentSkill } from "../monsters.js";
import { replacePlayerRings } from "../equipmentEffects.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());
const equipment = [
  { name: "短剣", type: "weapon", atk: 3 },
  { name: "革の鎧", type: "armor", def: 2 },
  { name: "矢", type: "arrow", count: 5 },
  { name: "命の指輪", type: "ring", effect: "life_ring", plus: 1, blessed: true },
  { name: "灯火の指輪", type: "ring", effect: "torch_ring", blessed: true },
];
function fixture(baseKind, template) {
  const item = { ...template, id: "equipped" };
  const player = makePlayer({ x: 6, y: 5, atk: 8, def: 2, inventory: [item] });
  if (item.type === "ring") replacePlayerRings(player, [item]);
  else player[item.type] = item;
  const monster = makeMonsterFromBase(MONS.find(m => m.baseKind === baseKind), 1, 5, 5, { aware: true, alwaysUseSpecial: true });
  monster.alwaysUseSpecial = true;
  const dungeon = makeEmptyDg({ rooms: [{ x: 1, y: 1, w: 12, h: 12 }], monsters: [monster] });
  vi.spyOn(Math, "random").mockReturnValue(0.01);
  return { item, player, monster, dungeon };
}
function expectDetached(f) {
  expect(f.player.inventory).not.toContain(f.item);
  expect(f.player.rings).not.toContain(f.item);
  for (const slot of ["weapon", "armor", "arrow"]) expect(f.player[slot]).not.toBe(f.item);
  expect([f.player.hp, f.player.maxHp]).toEqual([100, 100]);
  expect(f.player.visionBonus || 0).toBe(0);
}

describe.each(["thief", "stealthrower", "itemblaster"])("敵に失った装備: %s", baseKind => {
  it.each(equipment)("%sを盗まれたり弾かれたりすると参照と補正を解除する", template => {
    const f = fixture(baseKind, template);
    const messages = [];
    monsterAI(f.monster, f.dungeon, f.player, messages, { attackOnly: true });
    expect(messages.some(message => message.includes("盗ん") || message.includes("弾"))).toBe(true);
    expectDetached(f);
    if (baseKind === "stealthrower") expect(f.monster.heldItems).toContain(f.item);
    else expect(f.dungeon.items.some(item => item.id === f.item.id)).toBe(true);
  });
  it("護盗の鎧が特技を防いだ場合は装備も補正も残す", () => {
    const f = fixture(baseKind, equipment[3]);
    f.player.armor = { name: "護盗の鎧", ability: "anti_steal" };
    const messages = [];
    monsterAI(f.monster, f.dungeon, f.player, messages, { attackOnly: true });
    expect(messages.some(message => message.includes("護盗"))).toBe(true);
    expect(f.player.inventory).toContain(f.item);
    expect(f.player.rings).toContain(f.item);
    expect([f.player.hp, f.player.maxHp]).toEqual([115, 115]);
  });
});

describe("ものまね師の盗み", () => {
  it.each(equipment)("%sの装備を盗む場合も補正を解除する", template => {
    const f = fixture("mimic", template);
    const source = makeMonsterFromBase(MONS.find(m => m.baseKind === "thief"), 1, 4, 5, { aware: true });
    f.dungeon.monsters.push(source);
    expect(tryMimicAdjacentSkill(f.monster, f.dungeon, f.player, [], {}, { forceReady: true, preferredSourceId: source.id })).toBe(true);
    expectDetached(f);
  });
});
