import { describe, expect, it } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function openRoom(monster) {
  const map = Array.from({ length: 30 }, () => Array(60).fill(T.FLOOR));
  return makeEmptyDg({
    map,
    rooms: [{ x: 1, y: 1, w: 20, h: 14 }],
    monsters: [monster],
    visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
  });
}

function makeRaider(level, x, y) {
  const base = MONS.find((m) => m.baseKind === "potRaider");
  const mon = makeMonsterFromBase(base, level, x, y);
  mon.alwaysUseSpecial = true;
  mon.aware = true;
  mon.turnAttacks = 0;
  return mon;
}

function imprisonPot() {
  return { id: "prison-pot", name: "とじこめの壺", type: "pot", potEffect: "imprison", capacity: 3, contents: [], confinedMonsters: [] };
}

describe("ヤドカリ壺荒らしの押し込み", () => {
  it("Lv1は隣接時、同レベルのヤドカリ壺荒らしを壺へ押し込む", () => {
    const mon = makeRaider(1, 5, 5);
    const pot = imprisonPot();
    const player = makePlayer({ x: 6, y: 5, inventory: [pot] });
    const dg = makeEmptyDg({ rooms: [], monsters: [mon] });
    const messages = [];

    monsterAI(mon, dg, player, messages, { attackOnly: true });

    expect(pot.confinedMonsters).toHaveLength(1);
    const confined = pot.confinedMonsters[0];
    expect(confined.baseKind).toBe("potRaider");
    expect(confined.monLevel).toBe(1);
    expect(confined.name).toBe("ヤドカリ壺荒らし");
    expect(confined.hp).toBe(45);
    expect(messages.some((m) => m.includes("ヤドカリ壺荒らしを壺に押し込んだ"))).toBe(true);
    /* 押し込んだ個体はフロアに残らない */
    expect(dg.monsters.filter((m) => m !== mon)).toHaveLength(0);
  });

  it("Lv3はヤドカリ壺大将を押し込む", () => {
    const mon = makeRaider(3, 5, 5);
    const pot = imprisonPot();
    const player = makePlayer({ x: 6, y: 5, inventory: [pot] });
    const dg = makeEmptyDg({ rooms: [], monsters: [mon] });
    const messages = [];

    monsterAI(mon, dg, player, messages, { attackOnly: true });

    expect(pot.confinedMonsters).toHaveLength(1);
    const confined = pot.confinedMonsters[0];
    expect(confined.baseKind).toBe("potRaider");
    expect(confined.monLevel).toBe(3);
    expect(confined.name).toBe("ヤドカリ壺大将");
    expect(confined.hp).toBe(140);
    expect(confined.atk).toBe(40);
  });

  it("Lv2は離れた直線上から大ヤドカリ壺荒らしを投げ込む", () => {
    const mon = makeRaider(2, 5, 5);
    const pot = imprisonPot();
    const player = makePlayer({ x: 10, y: 5, inventory: [pot] });
    const dg = openRoom(mon);
    const messages = [];

    monsterAI(mon, dg, player, messages, { moveOnly: true });
    monsterAI(mon, dg, player, messages, { attackOnly: true });

    expect(pot.confinedMonsters).toHaveLength(1);
    const confined = pot.confinedMonsters[0];
    expect(confined.baseKind).toBe("potRaider");
    expect(confined.monLevel).toBe(2);
    expect(confined.name).toBe("大ヤドカリ壺荒らし");
    expect(confined.hp).toBe(85);
  });

  it("加熱の壺では押し込まれた壺荒らしが焼け死に、容量が減る", () => {
    const mon = makeRaider(2, 5, 5);
    const pot = { id: "boil-pot", name: "加熱の壺", type: "pot", potEffect: "boil", capacity: 3, contents: [], confinedMonsters: [] };
    const player = makePlayer({ x: 6, y: 5, inventory: [pot] });
    const dg = makeEmptyDg({ rooms: [], monsters: [mon] });
    const messages = [];

    monsterAI(mon, dg, player, messages, { attackOnly: true });

    expect(pot.capacity).toBe(2);
    expect(pot.confinedMonsters).toHaveLength(0);
    expect(messages.some((m) => m.includes("加熱の壺に押し込んだ"))).toBe(true);
    expect(dg.monsters.filter((m) => m !== mon && m.hp > 0)).toHaveLength(0);
  });
});
