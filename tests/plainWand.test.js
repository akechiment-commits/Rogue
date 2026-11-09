import { describe, it, expect } from "vitest";
import { WANDS, rollGeneratedWandCharges, ensureFakeNames, generateFakeNames, getIdentKey, UNIDENTIFIED_NAME_POOLS } from "../items.js";
import { applyWandEffect, breakWandAoE } from "../wands.js";
import { itemDisplayName } from "../render.js";
import { makePlayer } from "./helpers.js";

describe("ただの杖の実装", () => {
  it("WANDS にただの杖が正しく定義されている", () => {
    const wand = WANDS.find((w) => w.name === "ただの杖");
    expect(wand).toBeDefined();
    expect(wand.effect).toBe("plain");
    expect(wand.rarity).toBe("E");
    expect(wand.weight).toBe(12);
    expect(wand.sellPrice).toBe(50);
    expect(wand.tile).toBe(24);
  });

  it("rollGeneratedWandCharges でただの杖の回数は3〜7回でランダム生成される", () => {
    const wand = WANDS.find((w) => w.name === "ただの杖");
    const minC = rollGeneratedWandCharges(wand, () => 3);
    const maxC = rollGeneratedWandCharges(wand, () => 7);
    expect(minC).toBe(3);
    expect(maxC).toBe(7);
  });

  it("振ってモンスターに命中しても何も起こらない", () => {
    const p = makePlayer({ x: 2, y: 2 });
    const m = { id: "mon1", name: "ゴブリン", x: 4, y: 2, hp: 20, maxHp: 20 };
    const dg = { map: Array.from({ length: 10 }, () => Array(10).fill(0)), monsters: [m], items: [] };
    const ml = [];

    applyWandEffect("plain", "monster", m, 1, 0, dg, p, ml, null, null);
    expect(m.hp).toBe(20);
    expect(ml.some((msg) => msg.includes("ゴブリンに光が当たったが、何も起こらなかった"))).toBe(true);
  });

  it("プレイヤー自身に当たっても何も起こらない", () => {
    const p = makePlayer({ x: 2, y: 2, hp: 30, maxHp: 30 });
    const dg = { map: Array.from({ length: 10 }, () => Array(10).fill(0)), monsters: [], items: [] };
    const ml = [];

    applyWandEffect("plain", "player", p, 0, 0, dg, p, ml, null, null);
    expect(p.hp).toBe(30);
    expect(ml.some((msg) => msg.includes("光を浴びたが、何も起こらなかった"))).toBe(true);
  });

  it("壊しても何も起こらない", () => {
    const p = makePlayer({ x: 2, y: 2, depth: 1 });
    const dg = { map: Array.from({ length: 10 }, () => Array(10).fill(0)), monsters: [], items: [] };
    const ml = [];

    breakWandAoE(p, dg, "plain", ml, null, 1);
    expect(ml.some((msg) => msg.includes("杖が壊れたが何も起こらなかった"))).toBe(true);
  });

  it("未識別のただの杖は正式名称ではなく木の偽名で表示される", () => {
    const wand = { ...WANDS.find((w) => w.name === "ただの杖"), id: "w1" };
    const fakeNames = generateFakeNames(WANDS, []);
    const ident = new Set();
    const displayName = itemDisplayName(wand, fakeNames, ident, {});
    expect(displayName).not.toBe("ただの杖");
    expect(UNIDENTIFIED_NAME_POOLS.wand).toContain(displayName);

    // 識別済みなら本名
    ident.add(getIdentKey(wand));
    expect(itemDisplayName(wand, fakeNames, ident, {})).toBe("ただの杖");
  });

  it("ensureFakeNames で欠損キー（旧セーブデータ）に未重複の偽名が自動補完される", () => {
    const wand = { ...WANDS.find((w) => w.name === "ただの杖"), id: "w1" };
    // w:plain が欠けた古い fakeNames
    const oldFakeNames = { "w:lightning": "ヒノキの杖" };
    expect(oldFakeNames["w:plain"]).toBeUndefined();

    // 欠損キーがあっても itemDisplayName は本名を漏らさず安全フォールバックする
    expect(itemDisplayName(wand, oldFakeNames, new Set(), {})).toBe("謎の杖");

    // ensureFakeNames を通すと w:plain が自動補完される
    const healed = ensureFakeNames(oldFakeNames);
    expect(healed["w:plain"]).toBeDefined();
    expect(UNIDENTIFIED_NAME_POOLS.wand).toContain(healed["w:plain"]);
    expect(healed["w:plain"]).not.toBe("ヒノキの杖"); // 既存のヒノキと重複しない

    // 補完後は正しい偽名で表示される
    expect(itemDisplayName(wand, healed, new Set(), {})).toBe(healed["w:plain"]);
  });
});
