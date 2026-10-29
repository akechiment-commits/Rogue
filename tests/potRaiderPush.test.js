import { describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { breakBigboxContents } from "../items.js";
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

  it("Lv2は直線3マスから大ヤドカリ壺荒らしを投げ込む", () => {
    const mon = makeRaider(2, 5, 5);
    const pot = imprisonPot();
    const player = makePlayer({ x: 8, y: 5, inventory: [pot] });
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

  it("Lv2は直線5マスからは届かない", () => {
    const mon = makeRaider(2, 5, 5);
    const pot = imprisonPot();
    const player = makePlayer({ x: 11, y: 5, inventory: [pot] });
    const dg = openRoom(mon);
    const messages = [];

    monsterAI(mon, dg, player, messages, { moveOnly: true });
    monsterAI(mon, dg, player, messages, { attackOnly: true });

    expect(pot.confinedMonsters).toHaveLength(0);
  });

  it("Lv3の放物線投げが命中すると壺大将が壺に入る", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const mon = makeRaider(3, 5, 5);
    const pot = imprisonPot();
    const player = makePlayer({ x: 8, y: 7, inventory: [pot] });
    const dg = openRoom(mon);
    const messages = [];

    monsterAI(mon, dg, player, messages, { moveOnly: true });
    monsterAI(mon, dg, player, messages, { attackOnly: true });

    expect(pot.confinedMonsters).toHaveLength(1);
    expect(pot.confinedMonsters[0]).toMatchObject({ baseKind: "potRaider", monLevel: 3, name: "ヤドカリ壺大将" });
    vi.restoreAllMocks();
  });

  it("Lv3の投げが外れると壺大将がプレイヤーの隣に現れる", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const mon = makeRaider(3, 5, 5);
    const pot = imprisonPot();
    const player = makePlayer({ x: 9, y: 5, inventory: [pot] });
    const dg = openRoom(mon);
    const messages = [];

    monsterAI(mon, dg, player, messages, { moveOnly: true });
    monsterAI(mon, dg, player, messages, { attackOnly: true });

    expect(pot.confinedMonsters).toHaveLength(0);
    const spawned = dg.monsters.find((m) => m !== mon && m.baseKind === "potRaider");
    expect(spawned).toBeTruthy();
    expect(spawned.monLevel).toBe(3);
    expect(Math.max(Math.abs(spawned.x - player.x), Math.abs(spawned.y - player.y))).toBe(1);
    vi.restoreAllMocks();
  });

  it("Lv3の投げは壁に当たると手前に落ちて現れる", () => {
    const mon = makeRaider(3, 5, 5);
    const pot = imprisonPot();
    const player = makePlayer({ x: 9, y: 5, inventory: [pot] });
    const dg = openRoom(mon);
    dg.map[5][7] = T.WALL;
    const messages = [];

    monsterAI(mon, dg, player, messages, { moveOnly: true });
    monsterAI(mon, dg, player, messages, { attackOnly: true });

    expect(pot.confinedMonsters).toHaveLength(0);
    const spawned = dg.monsters.find((m) => m !== mon && m.baseKind === "potRaider");
    expect(spawned).toBeTruthy();
    expect(spawned.x).toBe(6);
    expect(spawned.y).toBe(5);
  });

  it("Lv3の投げは途中の敵に当たると消滅する", () => {
    const mon = makeRaider(3, 5, 5);
    const ratBase = MONS.find((m) => m.baseKind === "rat");
    const blocker = makeMonsterFromBase(ratBase, 1, 7, 5);
    const pot = imprisonPot();
    const player = makePlayer({ x: 9, y: 5, inventory: [pot] });
    const dg = openRoom(mon);
    dg.monsters.push(blocker);
    const messages = [];

    monsterAI(mon, dg, player, messages, { moveOnly: true });
    monsterAI(mon, dg, player, messages, { attackOnly: true });

    expect(pot.confinedMonsters).toHaveLength(0);
    expect(dg.monsters.filter((m) => m.baseKind === "potRaider")).toHaveLength(1);
    expect(messages.some((m) => m.includes("当たって消えた"))).toBe(true);
  });

  it("Lv3の投げが泉に入ると泉の中に保持される", () => {
    const mon = makeRaider(3, 5, 5);
    const pot = imprisonPot();
    const player = makePlayer({ x: 9, y: 5, inventory: [pot] });
    const dg = openRoom(mon);
    const spr = { x: 7, y: 5, contents: [] };
    dg.springs = [spr];
    const messages = [];

    monsterAI(mon, dg, player, messages, { moveOnly: true });
    monsterAI(mon, dg, player, messages, { attackOnly: true });

    expect(pot.confinedMonsters).toHaveLength(0);
    expect(spr.confinedMonsters).toHaveLength(1);
    expect(spr.confinedMonsters[0]).toMatchObject({ baseKind: "potRaider", monLevel: 3 });
    expect(dg.monsters.filter((m) => m.baseKind === "potRaider")).toHaveLength(1);
  });

  it("Lv3の投げがゴミ箱に入ると消滅して撃破扱いになる", () => {
    const mon = makeRaider(3, 5, 5);
    const pot = imprisonPot();
    const player = makePlayer({ x: 9, y: 5, inventory: [pot] });
    const dg = openRoom(mon);
    dg.bigboxes = [{ kind: "trash", name: "ゴミ箱", x: 7, y: 5, capacity: 5, contents: [] }];
    const messages = [];

    monsterAI(mon, dg, player, messages, { moveOnly: true });
    monsterAI(mon, dg, player, messages, { attackOnly: true });

    expect(dg.monsters.filter((m) => m.baseKind === "potRaider" && m.hp > 0)).toHaveLength(1);
    expect(messages.some((m) => m.includes("消滅した"))).toBe(true);
  });

  it("Lv3の投げがニトロ箱に入ると仕様通り爆発する", () => {
    const mon = makeRaider(3, 5, 5);
    const pot = imprisonPot();
    const player = makePlayer({ x: 9, y: 5, inventory: [pot] });
    const dg = openRoom(mon);
    dg.bigboxes = [{ kind: "nitro", name: "ニトロ箱", x: 7, y: 5, capacity: 1, contents: [] }];
    const messages = [];

    monsterAI(mon, dg, player, messages, { moveOnly: true });
    monsterAI(mon, dg, player, messages, { attackOnly: true });

    /* 箱は消滅し、投げられた個体も爆発で消える。爆風は火薬爆発の仕様通り：
       プレイヤーは現在HPの3/4ダメージ、範囲内の投げ手自身も即死する。 */
    expect(dg.bigboxes).toHaveLength(0);
    expect(messages.some((m) => m.includes("爆発で消滅した"))).toBe(true);
    expect(dg.monsters.filter((m) => m.baseKind === "potRaider" && m.hp > 0)).toHaveLength(0);
    expect(player.hp).toBe(25);
  });

  it("Lv3の投げが拡散の大箱に入ると部屋中の全員にダメージ", () => {
    const mon = makeRaider(3, 5, 5);
    const ratBase = MONS.find((m) => m.baseKind === "rat");
    const victim = makeMonsterFromBase(ratBase, 1, 8, 6);
    const pot = imprisonPot();
    const player = makePlayer({ x: 9, y: 5, inventory: [pot] });
    const dg = openRoom(mon);
    dg.monsters.push(victim);
    dg.bigboxes = [{ kind: "scatter", name: "拡散の大箱", x: 7, y: 5, capacity: 4, contents: [] }];
    const messages = [];

    monsterAI(mon, dg, player, messages, { moveOnly: true });
    monsterAI(mon, dg, player, messages, { attackOnly: true });

    expect(messages.some((m) => m.includes("拡散した"))).toBe(true);
    expect(player.hp).toBeLessThan(player.maxHp);
    expect(victim.hp).toBeLessThan(victim.maxHp);
  });

  it("大箱に保持された壺荒らしは箱が壊れると現れる", () => {
    const mon = makeRaider(3, 5, 5);
    const pot = imprisonPot();
    const player = makePlayer({ x: 9, y: 5, inventory: [pot] });
    const dg = openRoom(mon);
    const bb = { kind: "change", name: "変化の大箱", x: 7, y: 5, capacity: 3, contents: [] };
    dg.bigboxes = [bb];
    const messages = [];

    monsterAI(mon, dg, player, messages, { moveOnly: true });
    monsterAI(mon, dg, player, messages, { attackOnly: true });
    expect(bb.confinedMonsters).toHaveLength(1);

    const breakMessages = [];
    breakBigboxContents(bb, dg, breakMessages, null, null, null, { player });
    const released = dg.monsters.find((m) => m !== mon && m.baseKind === "potRaider" && m.hp > 0);
    expect(released).toBeTruthy();
    expect(released.monLevel).toBe(3);
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
