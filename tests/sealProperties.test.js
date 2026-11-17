import { afterEach, describe, expect, it, vi } from "vitest";
import { monElementDamageMultiplier, monHasFlameMantle } from "../monTraits.js";
import { ABSOLUTE_VIRTUE_BOSS, MONS, SHINRYU_BOSS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { killMonster } from "../items.js";
import { installShinryuMightyGuardHpHook } from "../mightyGuardHp.js";
import { MH, MW } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

describe("封印と体の性質（属性の無効・耐性は封印の対象外）", () => {
  it("属性耐性は封印中も半減する", () => {
    expect(monElementDamageMultiplier({ elemResist: "fire", sealed: true }, "fire")).toBe(0.5);
    expect(monElementDamageMultiplier({ elemResist: "fire", sealed: true }, "ice")).toBe(1);
    expect(monElementDamageMultiplier({ elemResistAll: true, sealed: true }, "thunder")).toBe(0.5);
    expect(monElementDamageMultiplier({ elemResist: "fire" }, "fire")).toBe(0.5);
  });

  it("火ダルマの炎まといは例外として封印で止まる", () => {
    expect(monHasFlameMantle({ baseKind: "firedemon" })).toBe(true);
    expect(monHasFlameMantle({ baseKind: "firedemon", sealed: true })).toBe(false);
    expect(monHasFlameMantle({ flameMantleTurns: 5, sealed: true })).toBe(false);
  });
});

describe("封印で止まるはずの効果の漏れ修正", () => {
  it("絶対の美徳は封印中、行動ごとの自然回復をしない", () => {
    const boss = {
      ...ABSOLUTE_VIRTUE_BOSS,
      id: "absolute-virtue", x: 15, y: 15,
      hp: 599, maxHp: 2400, aware: true, dormant: false,
      turnAttacks: 0, dir: { x: 0, y: 0 }, sealed: true,
    };
    const player = makePlayer({ x: 20, y: 15 });
    const visible = Array.from({ length: MH }, () => Array(MW).fill(true));
    const dungeon = makeEmptyDg({
      monsters: [boss], rooms: [{ x: 1, y: 1, w: 50, h: 24 }],
      visible, explored: visible.map(row => [...row]),
    });
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    monsterAI(boss, dungeon, player, [], { moveOnly: true });

    expect(boss.hp).toBe(599);
  });

  it("神竜は封印中、マイティガードのダメージ半減を受けない", () => {
    const sealed = {
      ...SHINRYU_BOSS, id: "shinryu-sealed", x: 10, y: 10,
      hp: 200, maxHp: SHINRYU_BOSS.hp, mightyGuardTurns: 10, sealed: true,
    };
    installShinryuMightyGuardHpHook(sealed);
    sealed.hp -= 40;
    expect(sealed.hp).toBe(160);

    const unsealed = {
      ...SHINRYU_BOSS, id: "shinryu-open", x: 10, y: 10,
      hp: 200, maxHp: SHINRYU_BOSS.hp, mightyGuardTurns: 10,
    };
    installShinryuMightyGuardHpHook(unsealed);
    unsealed.hp -= 40;
    expect(unsealed.hp).toBe(180);
  });

  it("封印された危険な花びらは倒されても眠りの花粉をまかない", () => {
    const base = MONS.find((monster) => monster.baseKind === "dangerousPetal");
    const petal = makeMonsterFromBase(base, 1, 5, 5, { aware: true });
    petal.sealed = true;
    const player = makePlayer({ x: 6, y: 5 });
    const dungeon = makeEmptyDg({ monsters: [petal] });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0);

    try {
      killMonster(petal, dungeon, player, messages, null, true);
      expect(dungeon.monsters).not.toContain(petal);
      expect(player.sleepTurns ?? 0).toBe(0);
      expect(messages.some((message) => message.includes("散り際"))).toBe(false);
    } finally {
      random.mockRestore();
    }
  });
});
