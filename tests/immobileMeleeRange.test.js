import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { MW, MH, T, monsterAt } from "../utils.js";
import { monsterCanInteractAtRange } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

// Gameの実際の武器範囲計算と移動封じ判定を実行する。
const source = fs.readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
const start = source.indexOf('          const wab = p.weapon?.ability;');
const end = source.indexOf('          if (!_attackSlots.length && _blockedAttackMon)', start);
if (start < 0 || end < 0) throw new Error("Melee target selection not found");
const select = new Function("p", "dg", "dx", "dy", "MW", "MH", "T", "monsterAt", "monsterCanInteractAtRange",
  "endTurn", "ml", "setMsgs", "sr", "setGs", "st",
  `const nx = p.x + dx, ny = p.y + dy;\n${source.slice(start, end)}\nreturn _attackSlots;`);
function targets(ability, monsters, options = {}) {
  const p = makePlayer({ weapon: { ability }, immobileTurns: 3, ...options.player });
  const dg = makeEmptyDg({ monsters, ...options.dungeon });
  let turns = 0;
  const messages = [];
  const slots = select(p, dg, options.dx ?? 1, options.dy ?? 0, MW, MH, T, monsterAt,
    monsterCanInteractAtRange, () => turns++, messages, () => {}, { current: null }, () => {}, {});
  return { p, slots, turns, messages };
}
const enemy = (x, y, extra = {}) => ({ x, y, hp: 100, ...extra });

describe("移動封じ中の武器範囲", () => {
  it("長柄で2マス先を攻撃でき、その場に留まる", () => {
    const mon = enemy(7, 5);
    const result = targets("reach", [mon]);
    expect(result.slots.map(s => s.monster)).toEqual([mon]);
    expect(result.turns).toBe(0);
    expect([result.p.x, result.p.y]).toEqual([5, 5]);
  });
  it.each([4, 6])("三方向攻撃で正面が空でも斜め前y=%sを攻撃できる", y => {
    const mon = enemy(6, y);
    expect(targets("frontal_sweep", [mon]).slots.map(s => s.monster)).toEqual([mon]);
  });
  it("斜め向きと合成された長柄・三方向攻撃にも対応する", () => {
    const mon = enemy(7, 3);
    expect(targets(null, [mon], { dx: 1, dy: -1,
      player: { weapon: { abilities: ["reach", "frontal_sweep"] } } }).slots.map(s => s.monster)).toEqual([mon]);
  });
  it("通常武器の範囲外なら時間だけ進める", () => {
    const result = targets(null, [enemy(7, 5)]);
    expect(result.slots).toBeUndefined();
    expect(result.turns).toBe(1);
  });
  it.each([T.WALL, T.BWALL])("壁%s越しに槍を届かせない", wall => {
    const dg = makeEmptyDg();
    dg.map[5][6] = wall;
    expect(targets("reach", [enemy(7, 5)], { dungeon: { map: dg.map } }).turns).toBe(1);
  });
  it("正面に別の相手がいれば長柄は突き抜けない", () => {
    const front = enemy(6, 5);
    expect(targets("reach", [front, enemy(7, 5)]).slots.map(s => s.monster)).toEqual([front]);
  });
  it("大型敵には重なった攻撃セルごとに攻撃する", () => {
    const mon = enemy(7, 5, { bodySize: 3 });
    expect(targets("frontal_sweep", [mon], {
      player: { weapon: { abilities: ["reach", "frontal_sweep"] } },
    }).slots).toHaveLength(4);
  });
  it.each([
    { type: "shopkeeper", state: "friendly" },
    { type: "shopkeeper", state: "waiting" },
    { type: "shopkeeper", state: "hostile", _npcRetaliationTargetId: "another-enemy" },
    { isPlayerClone: true },
  ])("友好的な相手だけなら攻撃も入れ替えもしない: %j", extra => {
    const result = targets("frontal_sweep", [enemy(6, 5, extra)]);
    expect(result.slots).toBeUndefined();
    expect(result.turns).toBe(1);
    expect([result.p.x, result.p.y]).toEqual([5, 5]);
  });
  it("友好的な正面の相手を巻き込まず、斜め前の敵だけ攻撃する", () => {
    const friendly = enemy(6, 5, { type: "shopkeeper", state: "friendly" });
    const mon = enemy(6, 4);
    expect(targets("frontal_sweep", [friendly, mon]).slots.map(s => s.monster)).toEqual([mon]);
    expect(friendly.hp).toBe(100);
  });
  it("プレイヤーに敵対した店主は攻撃対象になる", () => {
    const mon = enemy(7, 5, { type: "shopkeeper", state: "hostile" });
    expect(targets("reach", [mon]).slots.map(s => s.monster)).toEqual([mon]);
  });
  it("移動封じがなければ従来の友好的な相手への体当たり処理に渡す", () => {
    const mon = enemy(6, 5, { type: "shopkeeper", state: "friendly" });
    expect(targets(null, [mon], { player: { immobileTurns: 0 } }).slots.map(s => s.monster)).toEqual([mon]);
  });
});
