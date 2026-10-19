import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("react", () => ({ useCallback: fn => fn, useEffect: () => {}, useRef: value => ({ current: value }) }));
import { fireTrapPlayer } from "../traps.js";
import { useItemActions } from "../useItemActions.js";
import { applyPotionEffect, applySpellEffect, castSpellBolt, applyFoodEffectsOnHit, applyWaterIceFreeze,
  applySoakedStatus, applySoakedFromWaterWalk, applySoakedStatusToMonster, fireTrapItem,
  fireTrapArrowFromFacing, makePoisonArrow, shootArrow, SPELLS, ITEMS, isStatusImmune } from "../items.js";
import { applyWandEffect } from "../wands.js";
import { MONS, BOSSES, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { applyAttackSeal, applyMonsterParalyze, applyMonsterDarkness, applyMonsterBewitch,
  applyPlayerPoison, applyYabaiPoison } from "../statusDuration.js";
import { isStatusImmune as commonImmunity } from "../statusImmunity.js";
import { applySakeEffect } from "../intoxication.js";
import { advanceConsumableBuffTimers } from "../turnUpkeep.js";
import { MW, MH, T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
const ailments = ["poisoned", "poisonedTurns", "poisonHalfAtk", "poisonAtkLoss", "sleepTurns", "confusedTurns",
  "slowTurns", "darknessTurns", "bewitchedTurns", "fleeingTurns", "sealed", "sealedTurns", "attackSealTurns",
  "immobileTurns", "frozenTurns", "paralyzed", "paralyzeTurns", "oilyTurns", "soakedTurns", "knockdownTurns",
  "drunkTurns", "drunkenTurns", "hypnosisPending", "dopingAftereffectTurns", "atkDebuffTurns", "defDebuffTurns"];
function context(kind = "player", size = 1, immune = true) {
  const player = makePlayer({ atk: 30, def: 12, mp: 100, maxMp: 100, hunger: 20 });
  const monster = makeMonsterFromBase(MONS.find(m => m.baseKind === "goblin"), 1, 6, 5);
  Object.assign(monster, { bodySize: size, hp: 500, maxHp: 500, atk: 30, def: 12 });
  const dungeon = makeEmptyDg({ rooms: [], monsters: [monster],
    explored: Array.from({ length: MH }, () => Array(MW).fill(false)),
    visible: Array.from({ length: MH }, () => Array(MW).fill(true)) });
  const victim = kind === "player" ? player : monster;
  if (immune) applyWandEffect("paralyze", kind, victim, 1, 0, dungeon, player, [], () => {}, null, 0.5);
  return { player, monster, dungeon, victim, messages: [] };
}
function expectProtected(victim) {
  for (const key of ailments) expect(victim[key] || 0, key).toBeFalsy();
  expect(victim.atk).toBe(30);
  expect(victim.def).toBe(12);
}
beforeEach(() => vi.spyOn(Math, "random").mockReturnValue(0.5));
afterEach(() => vi.restoreAllMocks());

it("旧公開APIと付与ヘルパーが同じ状態防止判定を使う", () => {
  expect(isStatusImmune).toBe(commonImmunity);
  const { victim } = context();
  expect(applyPlayerPoison(victim)).toMatchObject({ blocked: true, atkLoss: 0 });
  expect(applyYabaiPoison(victim, "player")).toMatchObject({ blocked: true });
  expect(applyAttackSeal(victim)).toBe(0);
  expectProtected(victim);
});
for (const [kind, size] of [["player", 1], ["monster", 1], ["monster", 2], ["monster", 3]]) {
  describe(`${kind} 大きさ${size}`, () => {
    it.each(["poison", "sleep", "slow", "confuse", "darkness", "bewitch", "seal", "paralyze", "sake"])("薬 %s", effect => {
      const { victim, player, dungeon, messages } = context(kind, size);
      applyPotionEffect(effect, 5, kind, victim, dungeon, player, messages, () => {});
      expectProtected(victim);
      if (kind === "monster") expect(victim.speed).toBe(1);
      if (effect === "poison" && kind === "monster") expect(victim.hp).toBeLessThan(500);
      expect(victim.largeStatusCooldowns).toBeUndefined();
    });
    it.each(["panacea", "milk", "doping"])("呪われた薬 %s", effect => {
      const { victim, player, dungeon, messages } = context(kind, size);
      applyPotionEffect(effect, 5, kind, victim, dungeon, player, messages, () => {}, false, true);
      expectProtected(victim);
      if (kind === "player" && effect === "milk") expect(player.hunger).toBe(5);
    });
    it.each(["slow", "sleep", "paralyze", "confuse", "darkness", "bewitch", "seal", "soften", "ice_wand"])("杖 %s", effect => {
      const { victim, player, dungeon, messages } = context(kind, size);
      applyWandEffect(effect, kind, victim, 1, 0, dungeon, player, messages, () => {});
      expectProtected(victim);
      if (effect === "ice_wand") expect(victim.hp).toBeLessThan(kind === "player" ? 100 : 500);
    });
    it.each(["poison", "sleep", "confuse", "slow", "darkness", "bewitch", "c_panacea", "c_doping"])("薬加工の食料 %s", effect => {
      const { victim, player, dungeon, messages } = context(kind, size);
      applyFoodEffectsOnHit({ type: "food", name: "パン", effect: "heal", value: 35, potionEffects: [effect] },
        kind, victim, dungeon, player, messages, () => {});
      expectProtected(victim);
      if (kind === "player") expect(player.hunger).toBeGreaterThan(20);
    });
    it("回復と有利な加速は妨げない", () => {
      const { victim, player, dungeon, messages } = context(kind, size);
      victim.hp -= 40;
      const before = victim.hp;
      applyPotionEffect("heal", 20, kind, victim, dungeon, player, messages, () => {});
      expect(victim.hp).toBeGreaterThan(before);
      applyPotionEffect("slow", 5, kind, victim, dungeon, player, messages, () => {}, false, true);
      expect(kind === "player" ? player.hasteTurns : victim.speed).toBeGreaterThan(kind === "player" ? 0 : 1);
    });
  });
}
describe("敵への魔法・共通ヘルパー", () => {
  it.each(["sleep_bolt", "poison_bolt", "ice_bolt", "paralyze_magic"])("魔法 %s", effect => {
    const { victim, player, dungeon, messages } = context("monster");
    applySpellEffect(effect, "monster", victim, 1, 0, dungeon, player, messages, () => {});
    expectProtected(victim);
    if (effect === "ice_bolt") expect(victim.hp).toBeLessThan(500);
  });
  it("低水準の金縛り・暗闇・幻惑も防ぐ", () => {
    const { victim, messages } = context("monster");
    expect(applyMonsterParalyze(victim, { ml: messages })).toBe(0);
    expect(applyMonsterDarkness(victim, 5, messages)).toBe(0);
    expect(applyMonsterBewitch(victim, 5, messages)).toBe(0);
    expectProtected(victim);
  });
  it("反射された毒魔法もプレイヤーを毒にしない", () => {
    const { player, dungeon, messages } = context();
    dungeon.monsters = [makeMonsterFromBase(MONS.find(m => m.subtype === "magicreflect"), 20, 6, 5)];
    castSpellBolt(player, dungeon, SPELLS.find(spell => spell.effect === "poison_bolt"), 1, 0, messages, () => {});
    expectProtected(player);
    expect(messages.join(" ")).toContain("状態防止");
  });
});
describe("地形・罠・射撃", () => {
  it("水中凍結とずぶ濡れを防ぐ", () => {
    const { player, monster, dungeon, messages } = context();
    monster.statusImmune = 200;
    dungeon.map[player.y][player.x] = T.WATER;
    expect(applyWaterIceFreeze(player, dungeon, messages)).toBe(false);
    expect(applySoakedStatus(player, messages)).toBe(false);
    applySoakedFromWaterWalk(player, dungeon, messages);
    expect(applySoakedStatusToMonster(monster, messages)).toBe(false);
    expectProtected(player);
    expectProtected(monster);
  });
  it.each(["sleep", "slow_trap", "seal_trap", "shadow_stitch", "confuse_trap", "bewitch_trap", "darkness_trap", "oil_trap"])("罠 %s", type => {
    for (const kind of ["player", "monster"]) {
      const { player, victim, dungeon, messages } = context(kind);
      const trap = { id: "trap", effect: type, name: "罠", x: victim.x, y: victim.y };
      dungeon.traps = [trap];
      fireTrapItem(trap, { name: "石", type: "arrow" }, dungeon, victim.x, victim.y, messages, new Set(), player);
      expectProtected(victim);
      expect(messages.join(" ")).toContain("状態防止");
    }
  });
  it.each(["sleep", "slow_trap", "seal_trap", "shadow_stitch", "confuse_trap", "bewitch_trap", "darkness_trap", "oil_trap"])("自分で踏んだ罠 %s", effect => {
    const { player, dungeon, messages } = context();
    const trap = { id: "trap", effect, name: "罠", x: player.x, y: player.y };
    dungeon.traps = [trap];
    fireTrapPlayer(trap, player, dungeon, messages);
    expectProtected(player);
    expect(messages.join(" ")).toContain("状態防止");
  });
  it("毒矢の罠のダメージは受けるが毒にはならない", () => {
    const { player, dungeon, messages } = context();
    fireTrapArrowFromFacing({ x: player.x, y: player.y, name: "毒矢の罠" }, player, dungeon, messages, { poison: true });
    expect(player.hp).toBeLessThan(100);
    expectProtected(player);
  });
  it.each([false, true])("毒矢は敵にダメージだけ与え、攻撃力は下げない（ワッカ=%s）", wakka => {
    const { player, victim, dungeon, messages } = context("monster");
    player.inventory = [makePoisonArrow(2)];
    shootArrow(player, dungeon, 0, 1, 0, messages, () => {}, null, null, null, { wakka });
    expect(victim.hp).toBeLessThan(500);
    expectProtected(victim);
  });
});
describe("実際の所持品使用", () => {
  it.each([
    { type: "potion", name: "毒薬", effect: "poison" },
    { type: "potion", name: "牛乳", effect: "milk", cursed: true },
    { type: "potion", name: "万能薬", effect: "panacea", cursed: true },
    { type: "food", name: "パン", value: 20, rotten: true },
    { type: "food", name: "パン", value: 20, rotten: true, yabai: true },
    { type: "food", name: "パン", value: 20, effect: "heal", potionEffects: ["poison", "sleep", "confuse", "slow", "sake"] },
    { type: "scroll", name: "解除の巻物", effect: "debuff", cursed: true },
  ])("$name の状態異常を防止し、道具は消費する", item => {
    const { player, dungeon } = context();
    player.inventory = [{ ...item }];
    const sr = { current: { player, dungeon, ident: new Set() } }, endTurn = vi.fn();
    const actions = useItemActions({ sr, endTurn, dnameRef: item => item.name, setGs: vi.fn(), setMsgs: vi.fn(),
      setShowInv: vi.fn(), setSelIdx: vi.fn(), setShowDesc: vi.fn() });
    actions.doUseItem(0);
    expectProtected(player);
    expect(player.inventory.every(item => item.type === "bottle")).toBe(true);
    expect(endTurn).toHaveBeenCalledOnce();
  });
  it("既存の状態異常は防止付与で消さず、再付与も延長もしない", () => {
    const { player, dungeon, messages } = context();
    player.sleepTurns = 2;
    applyPotionEffect("sleep", 5, "player", player, dungeon, player, messages, () => {});
    expect(player.sleepTurns).toBe(2);
    player.statusImmune = 0;
    applyPotionEffect("sleep", 5, "player", player, dungeon, player, messages, () => {});
    expect(player.sleepTurns).toBeGreaterThan(2);
  });
  it("ドーピング終了時の副作用も防止する", () => {
    const { player } = context();
    player.dopingTurns = 1;
    player.dopingAftereffectPending = true;
    advanceConsumableBuffTimers(player, []);
    expectProtected(player);
    expect(player.dopingAftereffectPending).toBe(false);
  });
});

describe("状態防止の有無による実際の敵特技の違い", () => {
  it.each(["hypnotist", "boss_voidmonk"])("%sの行動は消費しても状態異常を防ぐ", baseKind => {
    for (const immune of [false, true]) {
      vi.mocked(Math.random).mockReturnValue(0);
      const base = [...MONS, ...BOSSES].find(m => m.baseKind === baseKind);
      expect(base).toBeTruthy();
      const monster = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
      monster.alwaysUseSpecial = true;
      monster._statusCooldown = 0;
      const player = makePlayer({ x: 5, y: 6, statusImmune: immune ? 200 : 0 });
      const dungeon = makeEmptyDg({ rooms: [{ x: 1, y: 1, w: 20, h: 20 }], monsters: [monster],
        visible: Array.from({ length: MH }, () => Array(MW).fill(true)) });
      const messages = [];
      monsterAI(monster, dungeon, player, messages, { attackOnly: true });
      const value = baseKind === "hypnotist" ? player.hypnosisPending : player.slowTurns;
      expect((value || 0) > 0).toBe(!immune);
      if (immune) expect(messages.join(" ")).toContain("状態防止");
    }
  });
  it.each(["sleep", "slow", "confuse", "darkness", "bewitch", "poison"])("防止なしなら薬%sは従来どおり作用する", effect => {
    const { player, victim, dungeon, messages } = context("monster", 1, false);
    applyPotionEffect(effect, 5, "monster", victim, dungeon, player, messages, () => {});
    expect(ailments.some(key => !!victim[key]) || victim.speed < 1 || victim.atk < 30).toBe(true);
  });
});
