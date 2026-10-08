import { afterEach, describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { throwItemAlongLine } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { runMonsterAttackPhase } from "../monsterAttackPhase.js";

afterEach(() => vi.restoreAllMocks());
const sword = { id: "held", name: "短剣", type: "weapon", atk: 3 };
function setup(item = sword, level = 1) {
  const enemy = makeMonsterFromBase(MONS.find(m => m.baseKind === "itemThrower"), level, 5, 5, { aware: true });
  enemy.turnAttacks = 0;
  enemy.carriedItem = { ...item };
  const player = makePlayer({ x: 5, y: 8, atk: 10 });
  const dungeon = makeEmptyDg({ rooms: [], monsters: [enemy] });
  const messages = [];
  const hit = vi.fn();
  const attack = (opts = {}) => monsterAI(enemy, dungeon, player, messages, { attackOnly: true, onPlayerHit: hit, ...opts });
  return { enemy, player, dungeon, messages, hit, attack };
}

describe("ひょい河童の拾い投げ命中率75%", () => {
  for (const level of [1, 2, 3]) {
    it.each([0.7499, 0.75])(`Lv${level}: 命中境界の乱数 %s`, (randomValue) => {
      const s = setup(sword, level);
      vi.spyOn(Math, "random").mockReturnValue(randomValue);
      s.attack();
      expect(s.enemy.carriedItem).toBeUndefined();
      if (randomValue < 0.75) {
        expect(s.player.hp).toBeLessThan(100);
        expect(s.hit).toHaveBeenCalledOnce();
        expect(s.dungeon.items).toHaveLength(0);
      } else {
        expect(s.player.hp).toBe(100);
        expect(s.hit).not.toHaveBeenCalled();
        expect(s.messages.join(" ")).toContain("外れた");
        expect(s.dungeon.items).toEqual([expect.objectContaining({ id: "held", x: 5, y: 8 })]);
      }
    });
  }

  it.each([
    { name: "火薬の壺", type: "pot", potEffect: "gunpowder", capacity: 3, contents: [{ id: "inside", name: "パン", type: "food" }] },
    { name: "雷の杖", type: "wand", effect: "lightning", charges: 3 },
    { name: "ヤバイパン", type: "food", yabai: true },
    { name: "爆弾矢", type: "arrow", bombArrow: true, atk: 6 },
  ])("外れた $name は無傷で落ち、薬効・破損・爆発を起こさない", (item) => {
    const s = setup({ id: "held", ...item });
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    s.attack();
    expect(s.player.hp).toBe(100);
    expect(s.player.poisonedTurns || 0).toBe(0);
    expect(s.player.confusedTurns || 0).toBe(0);
    expect(s.hit).not.toHaveBeenCalled();
    expect(s.dungeon.items).toEqual([{ id: "held", ...item, x: 5, y: 8 }]);
    expect(s.messages.join(" ")).toContain("外れた");
    expect(s.messages.join(" ")).not.toMatch(/割れた|爆発！/);
  });

  it("途中の大箱にはプレイヤー命中の乱数を抽選せず収納する", () => {
    const s = setup();
    const box = { id: "box", name: "大箱", x: 5, y: 6, contents: [], capacity: 3 };
    s.dungeon.bigboxes = [box];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    s.attack({ bbFn: (bb, item) => bb.contents.push(item) });
    expect(box.contents).toHaveLength(1);
    expect(box.contents[0].id).toBe("held");
    expect(s.player.hp).toBe(100);
    expect(s.dungeon.items).toHaveLength(0);
    expect(random).not.toHaveBeenCalled();
  });

  it("途中の敵には命中し、プレイヤー用の外れ処理を行わない", () => {
    const s = setup();
    const target = { id: "target", name: "標的", x: 5, y: 6, hp: 100, maxHp: 100, def: 0 };
    s.dungeon.monsters.push(target);
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    s.attack();
    expect(target.hp).toBeLessThan(100);
    expect(s.player.hp).toBe(100);
    expect(s.dungeon.items).toHaveLength(0);
    expect(s.messages.join(" ")).not.toContain("外れた");
  });

  it("射線が壁で遮られる場合はプレイヤー命中を抽選しない", () => {
    const s = setup();
    s.dungeon.map[7][5] = "#";
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    s.attack();
    expect(s.dungeon.items).toEqual([expect.objectContaining({ id: "held", x: 5, y: 6 })]);
    expect(s.messages.join(" ")).toContain("遮られて");
    expect(random).not.toHaveBeenCalled();
  });

  it("外れた壺は足元の罠を避けて空き床へ落ちる", () => {
    const s = setup({ id: "held", name: "火薬の壺", type: "pot", potEffect: "gunpowder", contents: [] });
    s.dungeon.traps = [{ id: "mine", name: "地雷", x: 5, y: 8, effect: "explode" }];
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    s.attack();
    expect(s.player.hp).toBe(100);
    expect(s.dungeon.traps).toHaveLength(1);
    expect(s.dungeon.items).toEqual([expect.objectContaining({ id: "held", x: 5, y: 7 })]);
  });

  it.each(["sleepTurns", "slowTurns", "paralyzeTurns", "frozenTurns"])("%s 中は既存の回避不可を維持する", (status) => {
    const s = setup();
    s.player[status] = 3;
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    s.attack();
    expect(s.player.hp).toBeLessThan(100);
    expect(s.hit).toHaveBeenCalledOnce();
    expect(s.dungeon.items).toHaveLength(0);
  });

  it("呪われたみかわしの魔方陣による必中は維持する", () => {
    const s = setup();
    s.dungeon.pentacles = [{ kind: "dodge", cursed: true, x: 1, y: 1 }];
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    s.attack();
    expect(s.player.hp).toBeLessThan(100);
  });

  it("敵の吹き飛ばしで飛んだ道具は75%投擲の対象にしない", () => {
    const s = setup();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const result = throwItemAlongLine({ x: 5, y: 5, name: "吹き飛ばし" }, s.dungeon, sword, 0, 1, 5, s.messages, s.player, null, { killerMon: s.enemy });
    expect(result.hitPlayer).toBe(true);
    expect(s.player.hp).toBeLessThan(100);
  });

  it("外れた時は描画へmissを通知し、ダメージ表示を出さない", () => {
    const s = setup();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const result = runMonsterAttackPhase(s.dungeon, s.player, s.messages, {
      moveMons: (dg, p, logs, phase, callbacks) => monsterAI(s.enemy, dg, p, logs, { ...callbacks, [phase]: true }),
    });
    expect(result.hitEvents).toEqual([{ type: "miss", x: 5, y: 8 }]);
    expect(result.hadActualHit).toBe(false);
    expect(result.lunges[0].id).toBe(s.enemy.id);
  });

  it("みかわし防具で瓶をかわしても、その場で割れた毒薬の飛沫がかかる", () => {
    const s = setup({ id: "held", name: "毒薬", type: "potion", effect: "poison" });
    s.player.armor = { abilities: ["dodge"] };
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    s.attack();
    expect(s.player.poisonedTurns).toBeGreaterThan(0);
    expect(s.messages.join(" ")).toContain("かわした");
    expect(s.dungeon.items).toEqual([]);
    expect(s.messages.join(" ")).toContain("瓶が割れて中身が飛び散った！");
  });

  it("75%の命中抽選で外れた毒薬も、その場で割れて薬効を出す", () => {
    const s = setup({ id: 'held', name: '毒薬', type: 'potion', effect: 'poison', value: 5 });
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    s.attack();
    expect(s.player.poisonedTurns).toBeGreaterThan(0);
    expect(s.dungeon.items).toEqual([]);
    expect(s.messages.join(' ')).toContain('外れた');
    expect(s.messages.join(' ')).toContain('瓶が割れて中身が飛び散った！');
  });

  it('瓶が外れても炎の飛沫で減ったHPは命中表示へ通知する', () => {
    const s = setup({ id: 'held', name: '炎の薬', type: 'potion', effect: 'fire', value: 50 });
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    s.attack();
    expect(s.player.hp).toBeLessThan(100);
    expect(s.hit).toHaveBeenCalledWith(100 - s.player.hp, s.enemy);
    expect(s.dungeon.items).toEqual([]);
    expect(s.messages.join(' ')).toContain('外れた');
  });
});
