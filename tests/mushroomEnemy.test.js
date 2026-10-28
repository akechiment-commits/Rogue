import { describe, expect, it } from "vitest";
import { MONS, makeMonsterFromBase, triggerMushroomCounterSpore } from "../monsters.js";
import { applyThrownItemToMonster, shootArrow } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("キノコ系モンスターのテスト", () => {
  it("キノコ系は beast かつ炎弱点であり、3形態のタイルが設定されている", () => {
    const base = MONS.find((m) => m.baseKind === "mushroom");
    expect(base).toBeDefined();
    expect(base.name).toBe("ドクキノコ");
    expect(base.kind).toBe("beast");
    expect(base.elemWeak).toBe("fire");
    expect(base.tile).toBe(238);
    expect(base.levels?.[0]?.name).toBe("ネムリキノコ");
    expect(base.levels?.[0]?.tile).toBe(239);
    expect(base.levels?.[1]?.name).toBe("マダラキノコ");
    expect(base.levels?.[1]?.tile).toBe(240);
  });

  it("Lv1（ドクキノコ）への物理被弾で周囲1マスに毒胞子を撒き散らす（プレイヤーと隣接敵を巻き込む）", () => {
    const base = MONS.find((m) => m.baseKind === "mushroom");
    const shroom = makeMonsterFromBase(base, 1, 5, 5);
    const adjacentMonster = { id: "m2", name: "ゴブリン", x: 5, y: 6, hp: 20, atk: 10, def: 2 };
    const player = makePlayer({ x: 6, y: 5, atk: 10, def: 5 });
    const dg = makeEmptyDg({
      monsters: [shroom, adjacentMonster],
    });
    const messages = [];

    triggerMushroomCounterSpore(shroom, dg, player, messages);

    expect(messages.some((m) => m.includes("毒胞子を撒き散らした"))).toBe(true);
    // プレイヤーが毒を受ける
    expect(player.poisoned).toBe(true);
    expect(player.atk).toBeLessThan(10);
    // 隣接するゴブリンも巻き込まれる
    expect(adjacentMonster.poisonedTurns).toBeGreaterThan(0);
    expect(adjacentMonster.poisonHalfAtk).toBe(true);
  });

  it("毒消しの指輪を装備していれば毒胞子を防ぐ", () => {
    const base = MONS.find((m) => m.baseKind === "mushroom");
    const shroom = makeMonsterFromBase(base, 1, 5, 5);
    const player = makePlayer({ x: 6, y: 5, atk: 10, rings: [{ type: "ring", effect: "antidote_ring" }] });
    const dg = makeEmptyDg({ monsters: [shroom] });
    const messages = [];

    triggerMushroomCounterSpore(shroom, dg, player, messages);

    expect(messages.some((m) => m.includes("毒消しの指輪が毒胞子を防いだ"))).toBe(true);
    expect(player.poisoned).toBeFalsy();
  });

  it("離れた位置からの攻撃では、キノコの周囲にいないプレイヤーは胞子を受けない", () => {
    const base = MONS.find((m) => m.baseKind === "mushroom");
    const shroom = makeMonsterFromBase(base, 1, 5, 5);
    const player = makePlayer({ x: 10, y: 5 }); // 5マス離れている
    const dg = makeEmptyDg({ monsters: [shroom] });
    const messages = [];

    triggerMushroomCounterSpore(shroom, dg, player, messages);

    expect(player.poisoned).toBeFalsy();
  });

  it("封印中のキノコは物理攻撃を受けても胞子を出さない", () => {
    const base = MONS.find((m) => m.baseKind === "mushroom");
    const shroom = makeMonsterFromBase(base, 1, 5, 5);
    shroom.sealed = true;
    const player = makePlayer({ x: 6, y: 5 });
    const dg = makeEmptyDg({ monsters: [shroom] });
    const messages = [];

    triggerMushroomCounterSpore(shroom, dg, player, messages);

    expect(messages).toHaveLength(0);
    expect(player.poisoned).toBeFalsy();
  });

  it("Lv2（ネムリキノコ）は周囲1マスへ睡眠胞子を撒き散らす", () => {
    const base = MONS.find((m) => m.baseKind === "mushroom");
    const shroom = makeMonsterFromBase(base, 2, 5, 5);
    const player = makePlayer({ x: 6, y: 5 });
    const dg = makeEmptyDg({ monsters: [shroom] });
    const messages = [];

    triggerMushroomCounterSpore(shroom, dg, player, messages);

    expect(messages.some((m) => m.includes("睡眠胞子"))).toBe(true);
    expect(player.sleepTurns).toBeGreaterThan(0);
  });

  it("防具に sleep_proof があればネムリキノコの睡眠胞子を防ぐ", () => {
    const base = MONS.find((m) => m.baseKind === "mushroom");
    const shroom = makeMonsterFromBase(base, 2, 5, 5);
    const player = makePlayer({
      x: 6,
      y: 5,
      armor: { type: "armor", abilities: ["sleep_proof"] },
    });
    const dg = makeEmptyDg({ monsters: [shroom] });
    const messages = [];

    triggerMushroomCounterSpore(shroom, dg, player, messages);

    expect(messages.some((m) => m.includes("防具が睡眠胞子を防いだ"))).toBe(true);
    expect(player.sleepTurns || 0).toBe(0);
  });

  it("Lv3（マダラキノコ）は周囲1マスへ混乱胞子を撒き散らす", () => {
    const base = MONS.find((m) => m.baseKind === "mushroom");
    const shroom = makeMonsterFromBase(base, 3, 5, 5);
    const player = makePlayer({ x: 6, y: 5 });
    const dg = makeEmptyDg({ monsters: [shroom] });
    const messages = [];

    triggerMushroomCounterSpore(shroom, dg, player, messages);

    expect(messages.some((m) => m.includes("混乱胞子"))).toBe(true);
    expect(player.confusedTurns).toBeGreaterThan(0);
  });

  it("applyThrownItemToMonster で物理投擲物が命中した時にカウンター胞子が発動する", () => {
    const base = MONS.find((m) => m.baseKind === "mushroom");
    const shroom = makeMonsterFromBase(base, 1, 5, 5);
    const player = makePlayer({ x: 6, y: 5 });
    const dg = makeEmptyDg({ monsters: [shroom] });
    const messages = [];
    const item = { type: "stone", name: "石" };

    applyThrownItemToMonster(item, shroom, dg, player, messages, null);

    expect(messages.some((m) => m.includes("毒胞子を撒き散らした"))).toBe(true);
    expect(player.poisoned).toBe(true);
  });

  it("shootArrow で矢が命中した時にカウンター胞子が発動する", () => {
    const base = MONS.find((m) => m.baseKind === "mushroom");
    const shroom = makeMonsterFromBase(base, 2, 5, 5);
    const arrowItem = { type: "arrow", name: "木の矢", count: 10, atk: 5 };
    const player = makePlayer({ x: 6, y: 5, arrow: arrowItem, inventory: [arrowItem] });
    const dg = makeEmptyDg({ monsters: [shroom] });
    const messages = [];

    shootArrow(player, dg, 0, -1, 0, messages, null, null);

    expect(messages.some((m) => m.includes("睡眠胞子を撒き散らした"))).toBe(true);
    expect(player.sleepTurns).toBeGreaterThan(0);
  });
});
