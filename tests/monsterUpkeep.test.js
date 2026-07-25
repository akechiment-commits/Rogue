import { describe, expect, it } from "vitest";
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
  it("ボスの自然回復と油・浮遊の終了を処理する", () => {
    const titan = { name: "巨人", baseKind: "im_boss_titan", x: 0, y: 0, hp: 90, maxHp: 100, oilyTurns: 2, isBoss: true };
    const kraken = { name: "海魔", baseKind: "im_boss_kraken", x: 1, y: 0, hp: 70, maxHp: 100, floatTurns: 1 };
    const dungeon = { monsters: [titan, kraken], map: [[T.FLOOR, T.WATER]], pentacles: [] };
    const messages = [];

    advance(dungeon, undefined, messages);

    expect(titan).toMatchObject({ hp: 95, oilyTurns: 0 });
    expect(kraken).toMatchObject({ hp: 90, floatTurns: 0 });
    expect(messages).toEqual(["巨人の肉体が再生した！(+5HP)", "海魔は水中で体力を回復した！(+20HP)", "巨人の油まみれが取れた。", "海魔の浮遊が解けた！"]);
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
});
