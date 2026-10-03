import { describe, expect, it, vi } from "vitest";
import { scatterPotContents, extractPotContents, imprisonPotRemainingCapacity, confinePlayerInImprisonPot, applyPotEffect } from "../items.js";
import { applyWandEffect } from "../wands.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

const pot = effect => ({ name: "空の壺", type: "pot", potEffect: effect, capacity: 0, contents: [] });
describe("容量0の壺", () => {
  it.each([undefined, 1])("残量がある壺と容量未設定の互換データは従来の回復量を保つ: %s", capacity => {
    const player = makePlayer({ hp: 20, maxHp: 400 });
    scatterPotContents({ ...pot("heal_pot"), capacity }, makeEmptyDg(), player.x, player.y, player, [], vi.fn());
    expect(player.hp).toBe(capacity === undefined ? 320 : 120);
  });
  it.each([0, 10])("使い切った回復の壺を割っても回復も逆転ダメージも発生しない: 逆転%d", reverseTurns => {
    const player = makePlayer({ hp: 20, maxHp: 400, reverseTurns });
    scatterPotContents(pot("heal_pot"), makeEmptyDg(), player.x, player.y, player, [], vi.fn());
    expect(player.hp).toBe(20);
  });
  it("使い切った回復の壺をアンデッドに当ててもダメージは発生しない", () => {
    const enemy = { name: "アンデッド", kind: "undead", hp: 500, maxHp: 500, x: 6, y: 5 };
    const player = makePlayer(), dg = makeEmptyDg({ monsters: [enemy] });
    scatterPotContents(pot("heal_pot"), dg, enemy.x, enemy.y, player, [], vi.fn());
    expect(enemy.hp).toBe(500);
  });
  it("容量0の強欲な壺から追加アイテムは生成しない", () => {
    const player = makePlayer(), dg = makeEmptyDg();
    scatterPotContents(pot("greed"), dg, player.x, player.y, player, [], vi.fn());
    expect(dg.items).toHaveLength(0);
  });
  it.each(["olive", "sesame", "butter"])("容量0の%s壺は割っても吸い出しても油を撒かない", effect => {
    for (const action of [scatterPotContents, extractPotContents]) {
      const player = makePlayer(), dg = makeEmptyDg();
      action(pot(effect), dg, player.x, player.y, player, [], vi.fn(), false);
      expect(dg.oilyTiles || []).toHaveLength(0);
      expect(player.oilyTurns || 0).toBe(0);
    }
  });
  it("容量0のとじこめ壺にはプレイヤーが入れない", () => {
    const item = pot("imprison"), player = makePlayer();
    expect(imprisonPotRemainingCapacity(item)).toBe(0);
    expect(confinePlayerInImprisonPot(item, player, makeEmptyDg(), [])).toBe(false);
    expect(player.potConfinedTurns || 0).toBe(0);
  });
  it("祝福の壺へ容量0の壺を入れると、容量は1になる", () => {
    const target = pot("none");
    applyPotEffect({ name: "祝福の壺", potEffect: "bless_pot" }, target, []);
    expect(target.capacity).toBe(1);
  });
  it("祝福された吸い出しで容量0の壺は容量1になる", () => {
    const target = pot("none"), player = makePlayer();
    extractPotContents(target, makeEmptyDg(), player.x, player.y, player, [], vi.fn(), true);
    expect(target.capacity).toBe(1);
  });
  it.each(["player", "item"])("祝福の杖で容量0の壺は容量1になる: %s", kind => {
    const target = pot("none"), player = makePlayer({ inventory: [target] });
    applyWandEffect("bless_wand", kind, kind === "player" ? player : target, 0, 0, makeEmptyDg(), player, [], vi.fn());
    expect(target.capacity).toBe(1);
  });
});
