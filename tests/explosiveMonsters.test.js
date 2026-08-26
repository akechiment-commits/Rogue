import { describe, expect, it } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

const makeMine = () => ({
  id: "nearby-mine",
  name: "地雷",
  effect: "explode",
  x: 6,
  y: 5,
  revealed: true,
  permanent: true,
});

describe("爆発系モンスターの封印", () => {
  it("封印中のボムスライムは低HPでも爆発せず、周囲を誘爆しない", () => {
    const base = MONS.find((m) => m.baseKind === "bombslime");
    const bomb = makeMonsterFromBase(base, 1, 5, 5);
    Object.assign(bomb, { hp: 5, sealed: true, deathBombReady: true });
    const mine = makeMine();
    const player = makePlayer({ x: 10, y: 5 });
    const dg = makeEmptyDg({ rooms: [], monsters: [bomb], traps: [mine] });
    const messages = [];

    monsterAI(bomb, dg, player, messages, { attackOnly: true });

    expect(dg.monsters).toContain(bomb);
    expect(player.hp).toBe(player.maxHp);
    expect(dg.traps).toContain(mine);
    expect(messages.some((message) => message.includes("爆発") || message.includes("誘爆"))).toBe(false);
  });

  it("封印されていないボムスライムの爆発は周囲の地雷を誘爆する", () => {
    const base = MONS.find((m) => m.baseKind === "bombslime");
    const bomb = makeMonsterFromBase(base, 1, 5, 5);
    Object.assign(bomb, { hp: 5, deathBombReady: true });
    const player = makePlayer({ x: 10, y: 5 });
    const dg = makeEmptyDg({ rooms: [], monsters: [bomb], traps: [makeMine()] });
    const messages = [];

    monsterAI(bomb, dg, player, messages, { attackOnly: true });

    expect(dg.monsters).not.toContain(bomb);
    expect(messages).toContain("地雷が誘爆した！");
  });

  it("封印中のボルガは自爆せず、周囲を誘爆しない", () => {
    const base = MONS.find((m) => m.baseKind === "bombgoblin");
    const volga = makeMonsterFromBase(base, 1, 5, 5);
    volga.sealed = true;
    const mine = makeMine();
    const player = makePlayer({ x: 6, y: 5 });
    const dg = makeEmptyDg({ rooms: [], monsters: [volga], traps: [mine] });
    const messages = [];

    monsterAI(volga, dg, player, messages, { attackOnly: true });

    expect(dg.monsters).toContain(volga);
    expect(dg.traps).toContain(mine);
    expect(messages.some((message) => message.includes("自爆") || message.includes("誘爆"))).toBe(false);
  });
});
