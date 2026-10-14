import { describe, expect, it, vi } from "vitest";
import { T } from "../utils.js";
import { advanceMonsterUpkeep } from "../monsterUpkeep.js";

function advance(dungeon, player = { x: 0, y: 0 }, messages = [], overrides = {}) {
  const defeated = [];
  advanceMonsterUpkeep(dungeon, player, messages, {
    hasCursedExplosionPentacle: () => false,
    inMagicSealRoom: () => false,
    inCursedMagicSealRoom: () => false,
    onMonsterDefeated: (monster) => defeated.push(monster),
    ...overrides,
  });
  return defeated;
}

describe("advanceMonsterUpkeep", () => {
  it("酩酊中は嘔吐で現HPの10%を受け、時間も減る", () => {
    const monster = { name: "敵", x: 0, y: 0, hp: 100, maxHp: 100, drunkenTurns: 2 };
    const dungeon = { monsters: [monster], map: [[T.FLOOR]], pentacles: [] };
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      advance(dungeon, undefined, messages);
    } finally {
      random.mockRestore();
    }
    expect(monster).toMatchObject({ hp: 90, drunkenTurns: 1 });
    expect(messages).toEqual(["敵は酩酊して嘔吐した！自分に10ダメージ！"]);
  });

  it("嘔吐で倒れた敵は自滅として撃破処理へ渡す", () => {
    const monster = { name: "敵", x: 0, y: 0, hp: 1, maxHp: 100, drunkenTurns: 1 };
    const dungeon = { monsters: [monster], map: [[T.FLOOR]], pentacles: [] };
    const onMonsterDefeated = vi.fn();
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      advanceMonsterUpkeep(dungeon, { x: 2, y: 2 }, messages, {
        hasCursedExplosionPentacle: () => false,
        inMagicSealRoom: () => false,
        inCursedMagicSealRoom: () => false,
        onMonsterDefeated,
      });
    } finally {
      random.mockRestore();
    }
    expect(onMonsterDefeated).toHaveBeenCalledWith(monster, { killerMon: monster });
    expect(dungeon.monsters).toContain(monster); // 実際の除去は撃破コールバック側が行う
    expect(monster.drunkenTurns).toBe(1); // 以後の状態解除は撃破コールバックが担当する
  });

  it("ボスの自然回復と油・浮遊の終了を処理する", () => {
    const titan = { name: "巨人", baseKind: "im_boss_titan", x: 0, y: 0, hp: 90, maxHp: 100, oilyTurns: 2, isBoss: true };
    const kraken = { name: "海魔", baseKind: "im_boss_kraken", x: 1, y: 0, hp: 70, maxHp: 100, floatTurns: 1 };
    const dungeon = { monsters: [titan, kraken], map: [[T.FLOOR, T.WATER]], pentacles: [] };
    const messages = [];

    advance(dungeon, undefined, messages);

    expect(titan).toMatchObject({ hp: 95, oilyTurns: 1 });
    expect(kraken).toMatchObject({ hp: 90, floatTurns: 0 });
    expect(messages).toEqual(["巨人の肉体が再生した！(+5HP)", "海魔は水中で体力を回復した！(+20HP)", "海魔の浮遊が解けた！"]);
  });

  it("雷弱点と呪われた雷のアンデッド撃破を処理する", () => {
    const weak = { name: "鳥", x: 0, y: 0, hp: 40, maxHp: 40, elemWeak: "thunder" };
    const undead = { name: "骸骨", kind: "undead", x: 1, y: 0, hp: 20, maxHp: 20 };
    const dungeon = {
      monsters: [weak, undead],
      map: [[T.FLOOR, T.FLOOR]],
      pentacles: [
        { name: "雷の魔方陣", kind: "thunder_trap", x: 0, y: 0 },
        { name: "呪われた雷", kind: "thunder_trap", cursed: true, x: 1, y: 0 },
      ],
    };
    const messages = [];
    const defeated = advance(dungeon, undefined, messages);

    expect(weak.hp).toBe(2);
    expect(defeated).toEqual([undead]);
    expect(messages).toEqual(["雷の魔方陣が鳥を打った！38ダメージ！雷弱点！", "呪われた雷の力が骸骨を傷つけた！25ダメージ！(アンデッド)"]);
  });

  it("敵のドーピングは強化終了後に副作用へ移行し、50ターン後に元へ戻る", () => {
    const monster = {
      name: "敵", x: 0, y: 0, hp: 100, maxHp: 100,
      atk: 20, def: 8, dopingTurns: 1, dopingAftereffectPending: true,
      _dopingBaseAtk: 10, _dopingBaseDef: 4,
    };
    const dungeon = { monsters: [monster], map: [[T.FLOOR]], pentacles: [] };
    const messages = [];

    advance(dungeon, undefined, messages);
    expect(monster).toMatchObject({ dopingTurns: 0, dopingAftereffectTurns: 50, atk: 5, def: 2 });

    for (let i = 0; i < 50; i++) advance(dungeon, undefined, messages);
    expect(monster).toMatchObject({ dopingAftereffectTurns: 0, atk: 10, def: 4 });
    expect(messages.at(-1)).toBe("敵のドーピング副作用が切れた！攻撃力と防御力が戻った！");
  });
});
