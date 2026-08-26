import { describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI, revealItemMimicAt } from "../monsters.js";
import { doExplosion } from "../items.js";
import { fireWandBolt } from "../wands.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { monsterAt } from "../utils.js";

describe("アイテムモドキ", () => {
  it("出現時からアイテムモドキとして待機し、通常の敵占有判定から外れる", () => {
    const base = MONS.find((m) => m.baseKind === "itemMimic");
    const mimic = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    const dg = makeEmptyDg({ rooms: [], monsters: [mimic] });

    monsterAI(mimic, dg, makePlayer({ x: 20, y: 20 }), [], { moveOnly: true });

    expect(mimic.disguisedAsItem).toBe(true);
    expect(dg.items).toHaveLength(1);
    expect(dg.items[0]).toMatchObject({
      name: "アイテムモドキ",
      type: "item_mimic",
      itemMimicId: mimic.id,
      x: 5,
      y: 5,
    });
    expect(dg.items[0].disguiseName).toBeTruthy();
    expect(mimic.disguiseName).toBe(dg.items[0].disguiseName);
    expect(dg.items[0].tile).not.toBe(167);
    expect(dg.items[0].disguiseTile).toBe(dg.items[0].tile);
    expect(monsterAt(dg, 5, 5)).toBeUndefined();
  });

  it("偽アイテムを拾おうとすると偽アイテムだけ消えて正体を現し、攻撃する", () => {
    const base = MONS.find((m) => m.baseKind === "itemMimic");
    const mimic = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    const player = makePlayer({ x: 5, y: 5, def: 0 });
    const dg = makeEmptyDg({ rooms: [], monsters: [mimic] });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.01);

    try {
      expect(revealItemMimicAt(dg, 5, 5, player, messages)).toBe(true);
    } finally {
      random.mockRestore();
    }

    expect(mimic.disguisedAsItem).toBe(false);
    expect(dg.items).toHaveLength(0);
    expect(monsterAt(dg, 5, 5)).toBe(mimic);
    expect(player.hp).toBeLessThan(100);
    expect(messages.join(" ")).toContain("正体を現した");
  });

  it("正体を現したターンは敵フェーズで追加攻撃せず、次のターンから通常攻撃する", () => {
    const base = MONS.find((m) => m.baseKind === "itemMimic");
    const mimic = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    const player = makePlayer({ x: 5, y: 5, def: 0 });
    const dg = makeEmptyDg({ rooms: [], monsters: [mimic] });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.01);

    try {
      monsterAI(mimic, dg, player, messages, { moveOnly: true });
      expect(revealItemMimicAt(dg, 5, 5, player, messages)).toBe(true);
      const hpAfterReveal = player.hp;
      monsterAI(mimic, dg, player, messages, { moveOnly: true });
      expect(mimic._itemMimicRevealed).toBe(true);
      monsterAI(mimic, dg, player, messages, { attackOnly: true });
      expect(player.hp).toBe(hpAfterReveal);
      expect(mimic._itemMimicRevealed).toBeUndefined();

      mimic.turnAttacks = 0;
      monsterAI(mimic, dg, player, messages, { attackOnly: true });
      expect(player.hp).toBeLessThan(hpAfterReveal);
    } finally {
      random.mockRestore();
    }
  });

  it("離れたマスへ踏み込もうとした時もプレイヤーを移動させず正体を現す", () => {
    const base = MONS.find((m) => m.baseKind === "itemMimic");
    const mimic = makeMonsterFromBase(base, 1, 6, 5, { aware: true });
    const player = makePlayer({ x: 5, y: 5, def: 0 });
    const dg = makeEmptyDg({ rooms: [], monsters: [mimic] });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.01);
    try {
      monsterAI(mimic, dg, player, messages, { moveOnly: true });
      expect(revealItemMimicAt(dg, 6, 5, player, messages)).toBe(true);
    } finally {
      random.mockRestore();
    }

    expect(player).toMatchObject({ x: 5, y: 5 });
    expect(mimic).toMatchObject({ x: 6, y: 5, disguisedAsItem: false });
    expect(player.hp).toBeLessThan(100);
  });

  it("炎や爆発で偽アイテムが消えると、本体も残らない", () => {
    const base = MONS.find((m) => m.baseKind === "itemMimic");
    const mimic = makeMonsterFromBase(base, 1, 5, 5);
    const dg = makeEmptyDg({ rooms: [], monsters: [mimic] });
    const messages = [];
    monsterAI(mimic, dg, makePlayer({ x: 20, y: 20 }), messages, { moveOnly: true });
    const player = makePlayer({ x: 20, y: 20 });

    doExplosion(5, 5, dg, player, messages);

    expect(dg.items).toHaveLength(0);
    expect(dg.monsters).not.toContain(mimic);
    expect(messages.join(" ")).toContain("アイテムモドキ");
  });

  it("炎の杖の魔法弾も敵ではなく偽アイテムに当たり、両方を消す", () => {
    const base = MONS.find((m) => m.baseKind === "itemMimic");
    const mimic = makeMonsterFromBase(base, 1, 5, 5);
    const dg = makeEmptyDg({ rooms: [], monsters: [mimic] });
    const messages = [];
    monsterAI(mimic, dg, makePlayer({ x: 20, y: 20 }), messages, { moveOnly: true });
    const player = makePlayer({ x: 5, y: 4 });

    fireWandBolt(player, dg, "fire_wand", 0, 1, messages, () => {}, () => {});

    expect(dg.items).toHaveLength(0);
    expect(dg.monsters).not.toContain(mimic);
  });
});
