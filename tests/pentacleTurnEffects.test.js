import { describe, expect, it } from "vitest";
import { T } from "../utils.js";
import { resolveTeleportAndTrapPentacleEffect } from "../pentacleTurnEffects.js";

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
