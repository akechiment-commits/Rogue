import { describe, expect, it, vi } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

/* 遠投中は敵の投げ物も落下せず消滅する（プレイヤー側の遠投弾と同じ）。
   敵アーチャーの矢が回避時に足元＋終端で二重に落ちて増える不具合の回帰テスト。
   みかわしの魔方陣で確実に回避させ、落下の有無だけを見る。 */
function setup({ farcast }) {
  const archer = makeMonsterFromBase(MONS.find((m) => m.baseKind === "archer"), 1, 3, 5, { aware: true });
  archer.alwaysUseSpecial = true;
  const player = makePlayer({ x: 8, y: 5 });
  const pentacles = [{ kind: "dodge", x: 8, y: 5, blessed: false, cursed: false }];
  if (farcast) pentacles.push({ kind: "farcast", x: 8, y: 5, blessed: true });
  const dg = makeEmptyDg({
    monsters: [archer],
    rooms: [{ x: 1, y: 1, w: 20, h: 14 }],
    pentacles,
    visible: Array.from({ length: 30 }, () => Array(60).fill(true)),
  });
  return { archer, player, dg };
}

describe("遠投中の敵の矢は消滅する", () => {
  it("遠投なしでは回避した矢が床に落ちる（対照）", () => {
    const { archer, player, dg } = setup({ farcast: false });
    const ml = [];
    monsterAI(archer, dg, player, ml, { moveOnly: true });
    monsterAI(archer, dg, player, ml, { attackOnly: true });
    expect(archer.projectileAmmo.count).toBeLessThan(12);
    expect(dg.items.some((i) => i.type === "arrow")).toBe(true);
  });

  it("遠投中は回避しても終端でも矢が落ちない", () => {
    const { archer, player, dg } = setup({ farcast: true });
    const ml = [];
    monsterAI(archer, dg, player, ml, { moveOnly: true });
    monsterAI(archer, dg, player, ml, { attackOnly: true });
    expect(archer.projectileAmmo.count).toBeLessThan(12);
    expect(dg.items.some((i) => i.type === "arrow")).toBe(false);
  });
});
