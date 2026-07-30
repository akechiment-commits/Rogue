import { describe, expect, it, vi } from "vitest";
import { T } from "../utils.js";
import {
  resolveStoneAndHealingPentacleEffect,
  resolveTeleportAndTrapPentacleEffect,
} from "../pentacleTurnEffects.js";

const room = { x: 1, y: 1, w: 3, h: 3 };
function dungeon(overrides = {}) {
  return {
    rooms: [room], pentacles: [], monsters: [], traps: [], items: [],
    map: Array.from({ length: 6 }, () => Array(6).fill(T.FLOOR)),
    ...overrides,
  };
}
function deps(random = () => 1) {
  return {
    findRoom: () => room, inMagicSealRoom: () => false, random,
    randomTeleportDest: () => ({ x: 4, y: 4 }), pick: values => values[0],
    rng: (min) => min, T, pickTrap: () => ({ name: "落とし穴" }),
    uid: () => "trap-1", removeTrap: (dg, trap) => { dg.traps.splice(dg.traps.indexOf(trap), 1); },
  };
}

function effectDeps(overrides = {}) {
  return {
    findRoom: (rooms, x, y) => rooms.find((entry) =>
      x >= entry.x && x < entry.x + entry.w && y >= entry.y && y < entry.y + entry.h
    ) ?? null,
    inMagicSealRoom: () => false,
    inCursedMagicSealRoom: () => false,
    random: () => 1,
    pick: (values) => values[0],
    rng: () => 5,
    T,
    hasAbility: () => false,
    makeMagicStone: () => ({ name: "魔法の石", magicStone: true }),
    placeItemAt: (dg, x, y, item) => {
      dg.items.push({ ...item, x, y });
    },
    onMonsterDefeated: () => {},
    ...overrides,
  };
}

describe("resolveTeleportAndTrapPentacleEffect", () => {
  it("通常の転送陣は範囲内のプレイヤーを独立抽選で転送する", () => {
    const pc = { kind: "teleport_trap", name: "転送の魔方陣", x: 2, y: 2 };
    const dg = dungeon({ pentacles: [pc] });
    const player = { x: 2, y: 2 };
    const messages = [];
    resolveTeleportAndTrapPentacleEffect(pc, dg, player, messages, deps(() => 0));
    expect(player).toMatchObject({ x: 4, y: 4 });
    expect(messages).toContain("転送の魔方陣の力でテレポートした！");
  });

  it("呪われた転送陣があれば通常の転送陣は発動しない", () => {
    const pc = { kind: "teleport_trap", name: "転送の魔方陣", x: 2, y: 2 };
    const cursed = { kind: "teleport_trap", cursed: true, x: 3, y: 3 };
    const player = { x: 2, y: 2 };
    resolveTeleportAndTrapPentacleEffect(pc, dungeon({ pentacles: [pc, cursed] }), player, [], deps(() => 0));
    expect(player).toMatchObject({ x: 2, y: 2 });
  });

  it("通常の罠陣は空いた床に罠を生成する", () => {
    const pc = { kind: "trap_gen", name: "罠の魔方陣", x: 2, y: 2 };
    const dg = dungeon({ pentacles: [pc] });
    resolveTeleportAndTrapPentacleEffect(pc, dg, { x: 5, y: 5 }, [], deps(() => 0));
    expect(dg.traps).toEqual([{ name: "落とし穴", id: "trap-1", x: 1, y: 1, revealed: false }]);
  });

  it("呪われた罠陣は永続罠を残して通常罠を消す", () => {
    const pc = { kind: "trap_gen", cursed: true, name: "罠の魔方陣", x: 2, y: 2 };
    const regular = { id: "regular" };
    const permanent = { id: "permanent", permanent: true };
    const dg = dungeon({ pentacles: [pc], traps: [regular, permanent] });
    resolveTeleportAndTrapPentacleEffect(pc, dg, { x: 5, y: 5 }, [], deps(() => 0));
    expect(dg.traps).toEqual([permanent]);
  });
});

describe("resolveStoneAndHealingPentacleEffect", () => {
  it("回復の魔方陣はプレイヤーと同室の生物を回復し、アンデッドを傷つける", () => {
    const pc = { kind: "heal_aura", name: "回復の魔方陣", x: 2, y: 2 };
    const living = { name: "ゴブリン", x: 3, y: 2, hp: 4, maxHp: 20 };
    const undead = { name: "ゾンビ", kind: "undead", x: 2, y: 3, hp: 5, maxHp: 20 };
    const immune = { name: "魔法無効", magicImmune: true, x: 3, y: 3, hp: 4, maxHp: 20 };
    const dg = dungeon({ pentacles: [pc], monsters: [living, undead, immune] });
    const player = { x: 2, y: 2, hp: 10, maxHp: 20 };
    const messages = [];
    const onMonsterDefeated = vi.fn();

    resolveStoneAndHealingPentacleEffect(pc, dg, player, messages, effectDeps({ onMonsterDefeated }));

    expect(player.hp).toBe(15);
    expect(living.hp).toBe(9);
    expect(undead.hp).toBe(0);
    expect(immune.hp).toBe(4);
    expect(messages).toContain("回復の魔方陣の回復力がゾンビを傷つけた！5ダメージ！(アンデッド)");
    expect(onMonsterDefeated).toHaveBeenCalledWith(undead);
  });

  it("祝福された回復の魔方陣は別室のプレイヤーにも10回復する", () => {
    const pc = { kind: "heal_aura", name: "回復の魔方陣", blessed: true, x: 2, y: 2 };
    const player = { x: 5, y: 5, hp: 1, maxHp: 20 };

    resolveStoneAndHealingPentacleEffect(pc, dungeon({ pentacles: [pc] }), player, [], effectDeps());

    expect(player.hp).toBe(11);
  });

  it("呪われた回復の魔方陣は呪われた魔封じ内の対象へ2倍ダメージを与える", () => {
    const pc = { kind: "heal_aura", name: "回復の魔方陣", cursed: true, x: 2, y: 2 };
    const monster = { name: "ゴブリン", x: 3, y: 2, hp: 10, maxHp: 10 };
    const player = { x: 2, y: 2, hp: 10, maxHp: 10 };
    const onMonsterDefeated = vi.fn();

    resolveStoneAndHealingPentacleEffect(
      pc,
      dungeon({ pentacles: [pc], monsters: [monster] }),
      player,
      [],
      effectDeps({ inCursedMagicSealRoom: () => true, onMonsterDefeated }),
    );

    expect(player.hp).toBe(0);
    expect(player.deathCause).toBe("回復の魔方陣の呪いにより");
    expect(monster.hp).toBe(0);
    expect(onMonsterDefeated).toHaveBeenCalledWith(monster);
  });

  it("魔封じ内の石飛ばし・回復の魔方陣は発動しない", () => {
    const player = { x: 2, y: 2, hp: 10, maxHp: 20 };
    for (const kind of ["stone_throw", "heal_aura"]) {
      const pc = { kind, name: "封じられた魔方陣", x: 2, y: 2 };
      resolveStoneAndHealingPentacleEffect(
        pc,
        dungeon({ pentacles: [pc] }),
        player,
        [],
        effectDeps({ inMagicSealRoom: () => true, random: () => 0 }),
      );
    }
    expect(player.hp).toBe(10);
  });

  it("祝福された石飛ばしはプレイヤーへ2倍ダメージを与える", () => {
    const pc = { kind: "stone_throw", name: "石飛ばしの魔方陣", blessed: true, x: 2, y: 2 };
    const player = { x: 2, y: 2, hp: 30, maxHp: 30 };
    const messages = [];

    resolveStoneAndHealingPentacleEffect(
      pc,
      dungeon({ pentacles: [pc] }),
      player,
      messages,
      effectDeps({ random: () => 0, rng: () => 7 }),
    );

    expect(player.hp).toBe(16);
    expect(player.deathCause).toBe("石飛ばしの魔方陣の魔法の石により");
    expect(messages).toContain("石飛ばしの魔方陣の魔法の石がプレイヤーに当たった！14ダメージ！");
  });

  it("みかわしの魔方陣は通常の魔法の石を回避して足元へ落とす", () => {
    const pc = { kind: "stone_throw", name: "石飛ばしの魔方陣", x: 2, y: 2 };
    const dodge = { kind: "dodge", name: "みかわしの魔方陣", x: 3, y: 2 };
    const player = { x: 2, y: 2, hp: 20, maxHp: 20 };
    const dg = dungeon({ pentacles: [pc, dodge] });

    resolveStoneAndHealingPentacleEffect(pc, dg, player, [], effectDeps({ random: () => 0 }));

    expect(player.hp).toBe(20);
    expect(dg.items).toContainEqual({ name: "魔法の石", magicStone: true, x: 2, y: 2 });
  });

  it("呪われた魔法の石は生物を回復するがアンデッドにはダメージを与える", () => {
    const pc = { kind: "stone_throw", name: "石飛ばしの魔方陣", cursed: true, x: 2, y: 2 };
    const living = { name: "ゴブリン", x: 2, y: 2, hp: 5, maxHp: 20 };
    const undead = { name: "ゾンビ", kind: "undead", x: 3, y: 2, hp: 5, maxHp: 20 };
    const dg = dungeon({ pentacles: [pc], monsters: [living, undead] });
    const player = { x: 5, y: 5, hp: 20, maxHp: 20 };

    resolveStoneAndHealingPentacleEffect(
      pc,
      dg,
      player,
      [],
      effectDeps({ random: () => 0, pick: (values) => values.find((target) => target.monster === living) }),
    );
    resolveStoneAndHealingPentacleEffect(
      pc,
      dg,
      player,
      [],
      effectDeps({ random: () => 0, pick: (values) => values.find((target) => target.monster === undead) }),
    );

    expect(living.hp).toBe(10);
    expect(undead.hp).toBe(0);
  });

  it.each([
    ["gelcube", { atk: 10 }, { atk: 12, _gelBoost: 1.2 }],
    ["synthmonster", { speed: 1 }, { speed: 1.5, maxAttacks: 2 }],
  ])("%sは通常の魔法の石を飲み込んで強化される", (baseKind, stats, expected) => {
    const pc = { kind: "stone_throw", name: "石飛ばしの魔方陣", x: 2, y: 2 };
    const monster = { name: "対象", baseKind, x: 2, y: 2, hp: 20, maxHp: 20, ...stats };
    const dg = dungeon({ pentacles: [pc], monsters: [monster] });

    resolveStoneAndHealingPentacleEffect(
      pc,
      dg,
      { x: 5, y: 5, hp: 20, maxHp: 20 },
      [],
      effectDeps({ random: () => 0 }),
    );

    expect(monster).toMatchObject(expected);
    expect(monster.heldItems).toHaveLength(1);
    expect(monster.hp).toBe(20);
  });

  it("反射敵は魔法の石を弾いて魔方陣周辺へ落とす", () => {
    const pc = { kind: "stone_throw", name: "石飛ばしの魔方陣", x: 2, y: 2 };
    const reflector = { name: "ミラーゴーレム", subtype: "reflector", x: 3, y: 2, hp: 20, maxHp: 20 };
    const dg = dungeon({ pentacles: [pc], monsters: [reflector] });
    const messages = [];

    resolveStoneAndHealingPentacleEffect(
      pc,
      dg,
      { x: 5, y: 5, hp: 20, maxHp: 20 },
      messages,
      effectDeps({ random: () => 0 }),
    );

    expect(reflector.hp).toBe(20);
    expect(dg.items).toHaveLength(1);
    expect(messages).toContain("石飛ばしの魔方陣の魔法の石がミラーゴーレムに弾き返された！");
    expect(messages).toContain("魔法の石が魔方陣の周辺に落ちた。");
  });
});
