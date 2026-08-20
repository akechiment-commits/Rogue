import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveWishText,
  canWishItem,
  grantWish,
  makeWishedItem,
  rollWishChance,
  WISH_PRESETS,
  getDiscoveredWishCatalog,
  templateFromDiscovery,
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

  it("カタログに回復薬・ゴッドスパーク・大箱が含まれる", () => {
    const cat = getWishItemCatalog();
    expect(cat.some((t) => t.name === "回復薬")).toBe(true);
    expect(cat.some((t) => t.name === "ゴッドスパークの杖")).toBe(true);
    expect(cat.some((t) => t.name === "合成の大箱" && t.type === "bigbox")).toBe(true);
    expect(cat.some((t) => t.name === "全能キラー")).toBe(false);
  });

  it("canWishItem が最上位を拒否しゴッドスパークは許可", () => {
    expect(canWishItem({ name: "全能キラー", type: "weapon" }).ok).toBe(false);
    expect(canWishItem({ name: "ゴッドスパークの杖", type: "wand" }).ok).toBe(true);
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

  it("resolveWishText がお金を gold_wish にする", () => {
    const r = resolveWishText("お金");
    expect(r.status).toBe("exact");
    expect(r.matches[0].type).toBe("gold_wish");
  });

  it("resolveWishText が大箱名を解決する", () => {
    const r = resolveWishText("合成の大箱");
    expect(r.status).toBe("exact");
    expect(r.matches[0].type).toBe("bigbox");
  });

  it("grantWish お金が 1万〜2万 入る", () => {
    const p = makePlayer({ gold: 0 });
    const dg = makeEmptyDg();
    const ml = [];
    const res = grantWish(
      { kind: "item", template: { name: "お金", type: "gold_wish" } },
      { player: p, dungeon: dg, ml },
    );
    expect(res.ok).toBe(true);
    expect(p.gold).toBeGreaterThanOrEqual(10000);
    expect(p.gold).toBeLessThanOrEqual(20000);
  });

  it("grantWish 大箱が足元に出る", () => {
    const p = makePlayer({ x: 5, y: 5 });
    const dg = makeEmptyDg({ bigboxes: [] });
    const ml = [];
    const res = grantWish(
      { kind: "item", template: { name: "合成の大箱", type: "bigbox", kind: "synthesis" } },
      { player: p, dungeon: dg, ml },
    );
    expect(res.ok).toBe(true);
    expect(dg.bigboxes).toHaveLength(1);
    expect(dg.bigboxes[0].kind).toBe("synthesis");
    expect(dg.bigboxes[0].x).toBe(5);
    expect(dg.bigboxes[0].y).toBe(5);
  });

  it("resolveWishText が部分一致で multi になり得る", () => {
    const r = resolveWishText("薬");
    expect(["multi", "single", "exact"].includes(r.status)).toBe(true);
    if (r.status === "multi") expect(r.matches.length).toBeGreaterThan(1);
  });

  it("grantWish full_restore がHPと満腹を回復する", () => {
    const p = makePlayer({ hp: 5, maxHp: 30, mp: 0, maxMp: 10, hunger: 10, maxHunger: 100 });
    p.poisoned = true;
    p.confusedTurns = 5;
    const dg = makeEmptyDg();
    const ml = [];
    const res = grantWish({ kind: "preset", id: "full_restore" }, { player: p, dungeon: dg, ml });
    expect(res.ok).toBe(true);
    expect(p.hp).toBe(30);
    expect(p.mp).toBe(10);
    expect(p.hunger).toBe(100);
    expect(p.poisoned).toBe(false);
    expect(p.confusedTurns).toBe(0);
  });

  it("grantWish level_up が3レベル上がる", () => {
    const p = makePlayer({ level: 1, nextExp: 20, maxHp: 30, hp: 30, atk: 5, def: 1, maxMp: 5 });
    const dg = makeEmptyDg();
    const ml = [];
    const res = grantWish({ kind: "preset", id: "level_up" }, { player: p, dungeon: dg, ml });
    expect(res.ok).toBe(true);
    expect(p.level).toBe(4);
  });

  it("grantWish wipe_enemies が通常撃破扱い（経験値）で全敵を倒す", () => {
    const p = makePlayer({ exp: 0, level: 1, nextExp: 99999 });
    const dg = makeEmptyDg({
      monsters: [
        { id: 1, name: "A", hp: 10, maxHp: 10, x: 1, y: 1, exp: 15 },
        { id: 2, name: "B", hp: 10, maxHp: 10, x: 2, y: 2, exp: 25 },
      ],
      items: [],
      traps: [],
      pentacles: [],
    });
    const ml = [];
    const res = grantWish(
      { kind: "preset", id: "wipe_enemies" },
      { player: p, dungeon: dg, ml, luFn: () => {} },
    );
    expect(res.ok).toBe(true);
    expect(dg.monsters).toHaveLength(0);
    expect(p.exp).toBe(40);
    expect(ml.some((m) => m.includes("2体"))).toBe(true);
    expect(ml.some((m) => m.includes("を倒した"))).toBe(true);
  });

  it("grantWish wipe_enemies は復活の魔方陣でも敵を蘇らせない", () => {
    const p = makePlayer({ exp: 0, level: 1, nextExp: 99999 });
    const dg = makeEmptyDg({
      monsters: [
        { id: 1, name: "復活テスト", hp: 10, maxHp: 10, x: 3, y: 3, exp: 10 },
      ],
      items: [],
      traps: [],
      rooms: [{ x: 0, y: 0, w: 10, h: 10 }],
      pentacles: [{ kind: "revival", x: 3, y: 3, cursed: false }],
    });
    const ml = [];
    grantWish(
      { kind: "preset", id: "wipe_enemies" },
      { player: p, dungeon: dg, ml, luFn: () => {} },
    );
    expect(dg.monsters).toHaveLength(0);
    expect(p.exp).toBe(10);
    expect(ml.some((m) => m.includes("復活の魔方陣"))).toBe(false);
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

  it("祝福された願いの壺は祝呪フラグではなく容量が増える", () => {
    const tmpl = POTS.find((t) => t.potEffect === "sesame");
    const it = makeWishedItem(tmpl, { blessed: true });
    expect(it.capacity).toBe(tmpl.capacity + 1);
    expect(it.blessed).toBeUndefined();
    expect(it.cursed).toBeUndefined();
  });

  it("rollWishChance が確率に従う（0.5%）", () => {
    expect(rollWishChance("drink", () => 0)).toBe(true);
    expect(rollWishChance("drink", () => 0.004)).toBe(true);
    expect(rollWishChance("drink", () => 0.005)).toBe(false);
    expect(rollWishChance("soak", () => 0.004)).toBe(true);
    expect(rollWishChance("soak", () => 0.01)).toBe(false);
  });

  it("願いの杖・壺は超低出現 weight", () => {
    const w = WANDS.find((x) => x.effect === "wish");
    const pot = POTS.find((x) => x.potEffect === "wish_pot");
    expect(w.weight).toBeLessThanOrEqual(0.05);
    expect(pot.weight).toBeLessThanOrEqual(0.05);
  });

  it("WISH_PRESETS が恩恵5種", () => {
    expect(WISH_PRESETS.map((w) => w.id)).toEqual([
      "full_restore",
      "ident_all",
      "map_reveal",
      "level_up",
      "wipe_enemies",
    ]);
    expect(WISH_PRESETS.every((w) => w.id && w.label)).toBe(true);
  });

  it("getDiscoveredWishCatalog が図鑑のみをカテゴリ分けする", () => {
    const groups = getDiscoveredWishCatalog(
      { items: { heal: { name: "回復薬", type: "potion", tile: 1 } } },
      { items: { fire: { name: "炎の杖", type: "wand", tile: 24 } } },
    );
    const pot = groups.find((g) => g.key === "potion");
    const wand = groups.find((g) => g.key === "wand");
    expect(pot?.items.some((t) => t.name === "回復薬")).toBe(true);
    expect(wand?.items.some((t) => t.name === "炎の杖")).toBe(true);
    expect(groups.some((g) => g.items.some((t) => t.name === "全能キラー"))).toBe(false);
  });

  it("templateFromDiscovery がブラックリストを弾く", () => {
    expect(templateFromDiscovery({ name: "願いの杖", type: "wand" })).toBeNull();
    expect(templateFromDiscovery({ name: "回復薬", type: "potion" })?.name).toBe("回復薬");
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
