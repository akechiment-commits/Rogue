import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveWishText,
  canWishItem,
  grantWish,
  makeWishedItem,
  rollWishChance,
  WISH_PRESETS,
  _resetWishCatalogCache,
  getWishItemCatalog,
} from "../wish.js";
import { WANDS, POTS, isNoChargeBoostWand } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { MW, MH } from "../utils.js";

describe("wish core", () => {
  beforeEach(() => {
    _resetWishCatalogCache();
  });

  it("カタログに回復薬などが含まれる", () => {
    const cat = getWishItemCatalog();
    expect(cat.some((t) => t.name === "回復薬")).toBe(true);
    expect(cat.some((t) => t.name === "全能キラー")).toBe(false);
  });

  it("canWishItem が最上位を拒否する", () => {
    expect(canWishItem({ name: "全能キラー", type: "weapon" }).ok).toBe(false);
    expect(canWishItem({ name: "回復薬", type: "potion", effect: "heal" }).ok).toBe(true);
  });

  it("resolveWishText が完全一致する", () => {
    const r = resolveWishText("回復薬");
    expect(r.status).toBe("exact");
    expect(r.matches[0].name).toBe("回復薬");
  });

  it("resolveWishText が拒否アイテムを forbidden にする", () => {
    const r = resolveWishText("全能キラー");
    expect(r.status).toBe("forbidden");
  });

  it("resolveWishText が部分一致で multi になり得る", () => {
    const r = resolveWishText("薬");
    expect(["multi", "single", "exact"].includes(r.status)).toBe(true);
    if (r.status === "multi") expect(r.matches.length).toBeGreaterThan(1);
  });

  it("grantWish full_restore がHPを回復する", () => {
    const p = makePlayer({ hp: 5, maxHp: 30, mp: 0, maxMp: 10 });
    p.poisoned = true;
    p.confusedTurns = 5;
    const dg = makeEmptyDg();
    const ml = [];
    const res = grantWish({ kind: "preset", id: "full_restore" }, { player: p, dungeon: dg, ml });
    expect(res.ok).toBe(true);
    expect(p.hp).toBe(30);
    expect(p.mp).toBe(10);
    expect(p.poisoned).toBe(false);
    expect(p.confusedTurns).toBe(0);
  });

  it("grantWish item がインベントリに入る", () => {
    const p = makePlayer();
    const dg = makeEmptyDg();
    const ml = [];
    const tmpl = getWishItemCatalog().find((t) => t.name === "回復薬");
    const res = grantWish({ kind: "item", template: tmpl }, { player: p, dungeon: dg, ml });
    expect(res.ok).toBe(true);
    expect(p.inventory.some((i) => i.name === "回復薬")).toBe(true);
  });

  it("grantWish map_reveal が探索済みにする", () => {
    const p = makePlayer();
    const dg = makeEmptyDg();
    dg.explored = Array.from({ length: MH }, () => Array(MW).fill(false));
    dg.traps = [{ x: 1, y: 1, revealed: false }];
    const ml = [];
    grantWish({ kind: "preset", id: "map_reveal" }, { player: p, dungeon: dg, ml });
    expect(dg.explored[0][0]).toBe(true);
    expect(dg.traps[0].revealed).toBe(true);
  });

  it("makeWishedItem が祝福を付けられる", () => {
    const tmpl = getWishItemCatalog().find((t) => t.name === "回復薬");
    const it = makeWishedItem(tmpl, { blessed: true });
    expect(it.blessed).toBe(true);
    expect(it.id).toBeTruthy();
  });

  it("rollWishChance が確率に従う", () => {
    expect(rollWishChance("drink", () => 0)).toBe(true);
    expect(rollWishChance("drink", () => 0.99)).toBe(false);
  });

  it("WISH_PRESETS が揃っている", () => {
    expect(WISH_PRESETS.length).toBeGreaterThanOrEqual(10);
    expect(WISH_PRESETS.every((w) => w.id && w.label)).toBe(true);
  });

  it("願いの杖は charges1 かつ noChargeBoost", () => {
    const w = WANDS.find((x) => x.effect === "wish");
    expect(w).toBeTruthy();
    expect(w.charges).toBe(1);
    expect(w.noChargeBoost).toBe(true);
    expect(isNoChargeBoostWand(w)).toBe(true);
  });

  it("願いの壺が定義されている", () => {
    const pot = POTS.find((x) => x.potEffect === "wish_pot");
    expect(pot).toBeTruthy();
    expect(pot.name).toBe("願いの壺");
  });

  it("願いの杖・壺は願いテキストで拒否される", () => {
    expect(resolveWishText("願いの杖").status).toBe("forbidden");
    expect(resolveWishText("願いの壺").status).toBe("forbidden");
  });
});
