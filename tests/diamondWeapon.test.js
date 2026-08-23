import { describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monLevelUp, monsterAI } from "../monsters.js";
import { applyMonsterSeal } from "../items.js";
import { addDiamondWeaponBuff, clearDiamondWeaponBuff } from "../monsterBuffs.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("竜騎士系", () => {
  it("3形態が同じ浮遊グラフィックを共有する", () => {
    const base = MONS.find((m) => m.baseKind === "dragonknight");
    expect(base).toBeTruthy();
    expect(base.kind).toBe("dragon");
    expect(base.float).toBe(true);
    expect(base.subtype).toBe("diamondweapon");

    const forms = [1, 2, 3].map((level) => makeMonsterFromBase(base, level, 5, 5));
    expect(forms.map((m) => m.name)).toEqual(["竜騎士", "竜騎士04", "Mikan"]);
    expect(forms.map((m) => m.tile)).toEqual([205, 205, 205]);
    expect(forms.map((m) => m.kind)).toEqual(["dragon", "dragon", "dragon"]);
  });

  it("レベルアップしてもグラフィックは変わらない", () => {
    const base = MONS.find((m) => m.baseKind === "dragonknight");
    const mon = makeMonsterFromBase(base, 1, 5, 5);
    const messages = [];

    expect(monLevelUp(mon, makeEmptyDg(), messages)).toBe(true);
    expect(mon.name).toBe("竜騎士04");
    expect(mon.tile).toBe(205);
  });

  it("ダイヤモンドウエポンで自分または隣接する味方の攻撃力を10上げる", () => {
    const base = MONS.find((m) => m.baseKind === "dragonknight");
    const knight = makeMonsterFromBase(base, 1, 5, 5);
    const ally = { id: "ally", name: "隣の敵", hp: 20, maxHp: 20, atk: 3, def: 3, x: 6, y: 5 };
    const dg = makeEmptyDg({
      rooms: [],
      monsters: [knight, ally],
      visible: Array.from({ length: 30 }, () => Array(40).fill(true)),
    });
    const messages = [];
    const player = makePlayer({ x: 5, y: 10 });
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);

    try {
      knight.turnAttacks = 0;
      knight._rangedAttackThisTurn = true;
      monsterAI(knight, dg, player, messages, { attackOnly: true });
    } finally {
      random.mockRestore();
    }

    expect(knight.atk).toBe(14);
    expect(ally.atk).toBe(13);
    expect(messages).toContain("竜騎士がダイヤモンドウエポンを唱えた！隣の敵の攻撃力が10上がった！");
  });

  it("強化は重ねがけ分だけ解除でき、封印でも解除される", () => {
    const mon = { name: "竜騎士", atk: 14, x: 5, y: 5, hp: 32, maxHp: 32 };
    addDiamondWeaponBuff(mon);
    addDiamondWeaponBuff(mon);

    expect(mon.atk).toBe(34);
    expect(clearDiamondWeaponBuff(mon)).toBe(20);
    expect(mon.atk).toBe(14);
    expect(mon.diamondWeaponBuffs).toBeUndefined();

    addDiamondWeaponBuff(mon);
    const messages = [];
    applyMonsterSeal(mon, makeEmptyDg({ monsters: [mon] }), makePlayer(), messages);
    expect(mon.atk).toBe(14);
    expect(messages).toContain("竜騎士のダイヤモンドウエポンの強化が封印で解除された！");
  });

  it("魔法無効・魔法反射・魔封じをアーマーブレスと同様に扱う", () => {
    const base = MONS.find((m) => m.baseKind === "dragonknight");
    const knight = makeMonsterFromBase(base, 1, 5, 5);
    const immune = { id: "immune", name: "魔法無効の敵", hp: 20, maxHp: 20, atk: 3, def: 3, magicImmune: true, x: 6, y: 5 };
    const reflector = { id: "reflector", name: "魔法反射の敵", hp: 20, maxHp: 20, atk: 3, def: 3, subtype: "magicreflect", x: 6, y: 5 };
    const player = makePlayer({ x: 5, y: 10 });
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);

    try {
      for (const target of [immune, reflector]) {
        const dg = makeEmptyDg({
          rooms: [],
          monsters: [knight, target],
          visible: Array.from({ length: 30 }, () => Array(40).fill(true)),
        });
        const messages = [];
        knight.atk = 14;
        knight.diamondWeaponBuffs = undefined;
        knight.turnAttacks = 0;
        knight._rangedAttackThisTurn = true;
        monsterAI(knight, dg, player, messages, { attackOnly: true });
        if (target === immune) {
          expect(target.atk).toBe(3);
          expect(messages).toContain("魔法は魔法無効の敵に効かない！");
        } else {
          expect(target.atk).toBe(3);
          expect(knight.atk).toBe(24);
          expect(messages).toContain("魔法反射の敵がダイヤモンドウエポンを反射した！");
        }
      }

      const sealedDg = makeEmptyDg({
        rooms: [{ x: 0, y: 0, w: 40, h: 30 }],
        monsters: [knight],
        pentacles: [{ kind: "magic_seal", x: 5, y: 5, blessed: false, cursed: false }],
      });
      const sealedMessages = [];
      knight.atk = 14;
      knight.diamondWeaponBuffs = undefined;
      knight.turnAttacks = 0;
      knight._rangedAttackThisTurn = true;
      monsterAI(knight, sealedDg, player, sealedMessages, { attackOnly: true });
      expect(knight.atk).toBe(14);
    } finally {
      random.mockRestore();
    }
  });
});
