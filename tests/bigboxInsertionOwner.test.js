import { afterEach, describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase } from "../monsters.js";
import { applyWandEffect } from "../wands.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { createGameBigboxHandlers } from "./gameBigboxHarness.js";

afterEach(() => vi.restoreAllMocks());

function insertByBlowback(kind, item, { enemy = true, targetHp = 1, boss = false, casterInRange = false } = {}) {
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  const caster = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "windmage"), 1, casterInRange ? 7 : 5, 5);
  const victim = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "kobold"), 1, 9, 6);
  Object.assign(victim, { hp: targetHp, maxHp: Math.max(targetHp, victim.maxHp) });
  if (item.potEffect === "heal_pot") victim.kind = "undead";
  if (boss) Object.assign(victim, { isBoss: true, bossTier: 1, exp: 200, maxHp: 100 });
  const box = { id: "target-box", name: kind === "nitro" ? "ニトロ箱" : "拡散の大箱", kind, capacity: 3, contents: [], x: 9, y: 5, revealed: true };
  Object.assign(item, { id: "flying-item", x: 7, y: 5 });
  const player = makePlayer({ x: 13, y: 5, depth: 1, exp: 0 });
  const dungeon = makeEmptyDg({ monsters: [caster, victim], items: [item], bigboxes: [box], rooms: [{ x: casterInRange ? 6 : 8, y: 4, w: casterInRange ? 6 : 4, h: 4 }] });
  const state = { player, dungeon, ident: new Set(), identifiedBigboxes: new Set([kind]) };
  const handlers = createGameBigboxHandlers(state);
  const messages = [];
  applyWandEffect("knockback", "item", item, 1, 0, dungeon, player, messages, () => {}, handlers.bigboxAddItem,
    1, null, 0, enemy ? caster : null, null, !enemy, enemy ? caster : player);
  return { caster, victim, box, item, player, dungeon, messages };
}

const KILLING_INSERTIONS = [
    ["nitro", { name: "短剣", type: "weapon", atk: 3 }],
    ["scatter", { name: "短剣", type: "weapon", atk: 3 }],
    ["scatter", { name: "炎の薬", type: "potion", effect: "fire", value: 30 }],
    ["scatter", { name: "炎の杖", type: "wand", effect: "fire_wand", charges: 0 }],
    ["scatter", { name: "炎の杖", type: "wand", effect: "fire_wand", charges: 4 }],
    ["scatter", { name: "保存の壺", type: "pot", potEffect: "none", capacity: 3, contents: [] }],
    ["scatter", { name: "回復の壺", type: "pot", potEffect: "heal_pot", capacity: 1, contents: [] }],
    ["scatter", { name: "火薬壺", type: "pot", potEffect: "gunpowder", capacity: 3, contents: [] }],
    ["scatter", { name: "爆弾矢", type: "arrow", atk: 6, count: 1, bombArrow: true }],
    ["scatter", { name: "這いずり爆弾", type: "arrow", specialProjectile: "crawling_bomb", count: 1 }],
    ["scatter", { name: "魚雷", type: "arrow", atk: 12, specialProjectile: "torpedo", count: 1 }],
];

describe("大箱へ飛ばして投入した側の撃破", () => {
  it.each(["nitro", "gunpowder"])("投入で起爆したニトロ箱から%sへ誘爆しても投入者を維持する", childKind => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const caster = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "windmage"), 1, 5, 5);
    const victim = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "kobold"), 1, 13, 6);
    const box = { id: "box", name: "ニトロ箱", kind: "nitro", capacity: 3, contents: [], x: 9, y: 5 };
    const child = childKind === "nitro"
      ? { id: "child", name: "ニトロ箱", kind: "nitro", capacity: 3, contents: [], x: 11, y: 6 }
      : { id: "child", name: "火薬壺", type: "pot", potEffect: "gunpowder", capacity: 3, contents: [], x: 11, y: 6 };
    const player = makePlayer({ x: 20, y: 5, depth: 1, exp: 0 });
    const dungeon = makeEmptyDg({ monsters: [caster, victim], items: childKind === "gunpowder" ? [child] : [], bigboxes: childKind === "nitro" ? [box, child] : [box] });
    const { bigboxAddItem } = createGameBigboxHandlers({ player, dungeon, ident: new Set() });
    bigboxAddItem(box, { name: "短剣", type: "weapon", atk: 3 }, dungeon, [], { killerMon: caster, sourceIsPlayer: false });
    expect(dungeon.monsters).not.toContain(victim);
    expect(player.exp).toBe(0);
    expect(caster.monLevel).toBe(2);
  });

  it.each(["nitro", "scatter"])("プレイヤーが%sへ直接入れた場合も、指定省略時の経験値は一度だけ入る", kind => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const victim = makeMonsterFromBase(MONS.find(mon => mon.baseKind === "kobold"), 1, 9, 6);
    victim.hp = 1;
    const box = { id: "box", name: "大箱", kind, capacity: 3, contents: [], x: 9, y: 5 };
    const item = { name: "炎の薬", type: "potion", effect: "fire", value: 30 };
    const player = makePlayer({ x: 13, y: 5, depth: 1, exp: 0 });
    const dungeon = makeEmptyDg({ monsters: [victim], bigboxes: [box], rooms: [{ x: 8, y: 4, w: 4, h: 4 }] });
    const { bigboxAddItem } = createGameBigboxHandlers({ player, dungeon, ident: new Set() });
    bigboxAddItem(box, item, dungeon, []);
    expect(dungeon.monsters).not.toContain(victim);
    expect(player.exp).toBe(10);
  });

  it.each(KILLING_INSERTIONS)("敵が%sへ%sを投入して倒した場合、投入した敵の撃破になる", (kind, item) => {
    const { caster, victim, player, dungeon } = insertByBlowback(kind, { ...item });
    expect(dungeon.monsters).not.toContain(victim);
    expect(player.exp).toBe(0);
    expect(caster.monLevel).toBe(2);
  });

  it.each(KILLING_INSERTIONS)("プレイヤーが%sへ%sを飛ばして投入した場合、経験値は一度だけ入る", (kind, item) => {
    const { caster, victim, player, dungeon } = insertByBlowback(kind, { ...item }, { enemy: false });
    expect(dungeon.monsters).not.toContain(victim);
    expect(player.exp).toBe(10);
    expect(caster.monLevel).toBe(1);
  });

  it.each([
    ["nitro", { name: "短剣", type: "weapon", atk: 3 }],
    ["scatter", { name: "炎の薬", type: "potion", effect: "fire", value: 100 }],
    ["scatter", { name: "炎の杖", type: "wand", effect: "fire_wand", charges: 4 }],
    ["scatter", { name: "火薬壺", type: "pot", potEffect: "gunpowder", capacity: 3, contents: [] }],
    ["scatter", { name: "這いずり爆弾", type: "arrow", specialProjectile: "crawling_bomb", count: 1 }],
  ])("%sの効果で投入者自身が死んでもプレイヤーに経験値を振り替えない", (kind, item) => {
    const { caster, victim, player, dungeon } = insertByBlowback(kind, { ...item }, { casterInRange: true });
    expect(dungeon.monsters).not.toContain(caster);
    expect(dungeon.monsters).not.toContain(victim);
    expect(player.exp).toBe(0);
    expect(caster.monLevel).toBe(1);
  });

  it.each(["nitro", "scatter"])("敵が%sへ投入してボスを倒しても報酬と撃破は一度だけになる", kind => {
    const item = kind === "nitro" ? { name: "短剣", type: "weapon", atk: 3 } : { name: "炎の薬", type: "potion", effect: "fire", value: 30 };
    const { caster, victim, player, dungeon } = insertByBlowback(kind, item, { boss: true });
    expect(dungeon.monsters).not.toContain(victim);
    expect(player.exp).toBe(0);
    expect(caster.monLevel).toBe(2);
    expect(dungeon.items.filter(item => item.name === "ボスの財宝")).toHaveLength(1);
  });
});
