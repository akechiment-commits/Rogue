import { describe, expect, it } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("催眠術使い", () => {
  it("3形態が同じ画像を共有し、レベルが上がるほど出現階が後ろになる", () => {
    const base = MONS.find((m) => m.baseKind === "hypnotist");
    expect(base).toBeTruthy();
    expect([base.name, ...base.levels.map((level) => level.name)]).toEqual([
      "催眠術使い",
      "強催眠術使い",
      "大催眠術使い",
    ]);
    expect([1, 2, 3].map((level) => makeMonsterFromBase(base, level, 5, 5).tile)).toEqual([175, 175, 175]);
    expect(base.dungeonFloors).toEqual({ intermediate: { min: 19, max: 20 }, advanced: { min: 17, max: 27 } });
    expect(base.levels.map((level) => level.dungeonFloors)).toEqual([
      { advanced: { min: 28, max: 31 } },
      { advanced: { min: 32, max: 36 } },
    ]);
  });

  it("Lv3は視界内の一直線上にいるプレイヤーへ催眠術をかける", () => {
    const base = MONS.find((m) => m.baseKind === "hypnotist");
    const hypnotist = makeMonsterFromBase(base, 3, 5, 5, { aware: true });
    hypnotist.alwaysUseSpecial = true;
    hypnotist.turnAttacks = 0;
    const player = makePlayer({ x: 5, y: 8 });
    const dg = makeEmptyDg({
      rooms: [{ x: 1, y: 1, w: 10, h: 10 }],
      monsters: [hypnotist],
      visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
    });
    const messages = [];

    monsterAI(hypnotist, dg, player, messages, { attackOnly: true });

    expect(player.hypnosisPending).toBe(1);
    expect(hypnotist.turnAttacks).toBe(1);
    expect(messages).toContain("大催眠術使いが催眠術をかけた！次の行動を勝手に行ってしまう！");
  });

  it("Lv1/2は隣接時だけ催眠術をかける", () => {
    const base = MONS.find((m) => m.baseKind === "hypnotist");
    for (const level of [1, 2]) {
      const adjacent = makeMonsterFromBase(base, level, 5, 5, { aware: true });
      adjacent.alwaysUseSpecial = true;
      adjacent.turnAttacks = 0;
      const adjacentPlayer = makePlayer({ x: 6, y: 5 });
      const adjacentDg = makeEmptyDg({
        rooms: [{ x: 1, y: 1, w: 10, h: 10 }],
        monsters: [adjacent],
        visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
      });
      monsterAI(adjacent, adjacentDg, adjacentPlayer, [], { attackOnly: true });
      expect(adjacentPlayer.hypnosisPending).toBe(1);

      const distant = makeMonsterFromBase(base, level, 5, 5, { aware: true });
      distant.alwaysUseSpecial = true;
      distant.turnAttacks = 0;
      const distantPlayer = makePlayer({ x: 5, y: 8 });
      const distantDg = makeEmptyDg({
        rooms: [{ x: 1, y: 1, w: 10, h: 10 }],
        monsters: [distant],
        visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
      });
      monsterAI(distant, distantDg, distantPlayer, [], { attackOnly: true });
      expect(distantPlayer.hypnosisPending).toBeUndefined();
    }
  });

  it("魔封じの魔方陣内では催眠術が発動しない", () => {
    const base = MONS.find((m) => m.baseKind === "hypnotist");
    const hypnotist = makeMonsterFromBase(base, 3, 5, 5, { aware: true });
    hypnotist.alwaysUseSpecial = true;
    hypnotist.turnAttacks = 0;
    const player = makePlayer({ x: 5, y: 8 });
    const dg = makeEmptyDg({
      rooms: [{ x: 1, y: 1, w: 10, h: 10 }],
      monsters: [hypnotist],
      visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
      pentacles: [{ kind: "magic_seal", x: 5, y: 5, name: "魔封じの魔方陣" }],
    });
    const messages = [];

    monsterAI(hypnotist, dg, player, messages, { attackOnly: true });

    expect(player.hypnosisPending).toBeUndefined();
    expect(messages).toContain("大催眠術使いが催眠術をかけようとしたが、魔封じの魔方陣で封じられた！");
  });
});
