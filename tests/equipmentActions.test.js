import { afterEach, describe, expect, it, vi } from "vitest";
const effects = vi.hoisted(() => []);
vi.mock("react", async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, useCallback: fn => fn, useRef: value => ({ current: value }),
    useEffect: fn => effects.push(fn), useLayoutEffect: fn => effects.push(fn) };
});
import React from "react";
import { useItemActions } from "../useItemActions.js";
import { useKeyHandler } from "../useKeyHandler.js";
import { IdentifyModal } from "../GameModals.jsx";
import { applyWandEffect } from "../wands.js";
import { applyUnequipTrapToPlayer, applyWaterGunToInventory } from "../items.js";
import { saveGameState, loadGameState } from "../GameSave.js";
import { applyPlayerPoison, applyYabaiPoison } from "../statusDuration.js";
import { advanceEarlyStatusTimers } from "../turnUpkeep.js";
import { makePlayer, makeEmptyDg } from "./helpers.js";
import { cancelModalConfirmation } from "../modalConfirmation.js";
import { MW, MH } from "../utils.js";

afterEach(() => { effects.length = 0; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const life = (plus = 1, extra = {}) => ({ id: "life", name: "命の指輪", type: "ring", effect: "life_ring", plus, bcKnown: true, ...extra });
function fixture(inventory, overrides = {}) {
  const player = makePlayer({ hp: 30, maxHp: 100, atk: 8, def: 2, depth: 1, turns: 0, gold: 0, mp: 100, inventory, ...overrides });
  const dungeon = makeEmptyDg({ rooms: [{ x: 1, y: 1, w: 12, h: 12 }],
    visible: Array.from({ length: MH }, () => Array(MW).fill(false)),
    explored: Array.from({ length: MH }, () => Array(MW).fill(false)) });
  const sr = { current: { player, dungeon, ident: new Set(["s:expand_inv", "s:sell_item", "s:weapon_up", "r:life_ring"]), fakeNames: {}, nicknames: {}, floors: {}, dungeonType: "advanced" } };
  const props = { sr, endTurn: vi.fn(), dnameRef: it => it.name, setGs: vi.fn(), setMsgs: vi.fn(), setShowInv: vi.fn(),
    setSelIdx: vi.fn(), setShowDesc: vi.fn(), setIdentifyMode: vi.fn(), setPutMode: vi.fn(), setPutMenuSel: vi.fn(), setPutPage: vi.fn(), lu: vi.fn() };
  return { player, dungeon, sr, props, actions: useItemActions(props) };
}
function choose(f, mode, control) {
  effects.length = 0;
  if (control === "pointer") {
    vi.stubGlobal("React", React);
    const confirm = { current: null };
    IdentifyModal({ ...f.props, mode, setMode: vi.fn(), gs: f.sr.current, iLabel: it => it.name, identifyConfirmRef: confirm });
    effects.forEach(fn => fn());
    confirm.current(0);
  } else {
    const listeners = new Map();
    vi.stubGlobal("window", { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener() {} });
    useKeyHandler({ ...f.props, gs: f.sr.current, shiftRef: { current: false }, aRef: { current: false },
      arrowHeldRef: { current: {} }, execRef: { current: null }, identifyMode: mode, throwMode: null });
    effects.forEach(fn => fn());
    listeners.get("keydown")({ key: "Enter", code: "Enter", repeat: false, preventDefault() {}, stopImmediatePropagation() {} });
  }
}

describe.each(["keyboard", "pointer"])("装備中の指輪更新: %s", control => {
  it("容量0の壺の祝福は1増やすだけで、初期容量へ戻さない", () => {
    const pot = { name: "保存の壺", type: "pot", potEffect: "none", capacity: 0, contents: [] };
    const f = fixture([pot]);
    choose(f, { mode: "bless", spellCost: 18, sel: 0 }, control);
    expect(pot.capacity).toBe(1);
  });
  it.each(["weapon_up", "armor_up"])("%sの巻物だけを消費し、次に並んだ道具は消さない", mode => {
    const ring = life(), scroll = { name: "強化の巻物", type: "scroll", effect: mode, bcKnown: true };
    const food = { id: "keep", name: "パン", type: "food", value: 20 };
    const f = fixture([ring, scroll, food]);
    choose(f, { mode, scrollIdx: 1, sel: 0 }, control);
    expect(ring.plus).toBe(2);
    expect(f.player.inventory).toEqual([ring, food]);
    expect(f.props.endTurn).toHaveBeenCalledOnce();
  });
  it.each([
    ["sell_item", life(1, { blessed: true })],
    ["transform_item", life(1, { blessed: true })],
    ["duplicate", life(1, { blessed: true })],
    ["sell_item", { name: "灯火の指輪", type: "ring", effect: "torch_ring", blessed: true }],
    ["sell_item", { name: "矢", type: "arrow", count: 10 }],
    ["duplicate", { name: "短剣", type: "weapon", atk: 3 }],
    ["duplicate", { name: "革の鎧", type: "armor", def: 2 }],
  ])("%sで%sが消えると、装備参照と補正も解除する", (mode, template) => {
    const item = { ...template }, scroll = { name: "巻物", type: "scroll", effect: mode, bcKnown: true };
    const f = fixture([item, scroll]);
    f.actions.doUseItem(0);
    choose(f, { mode, scrollIdx: 1, sel: 0, cursed: mode === "duplicate" }, control);
    expect(f.player.inventory).not.toContain(item);
    expect(f.player.rings).not.toContain(item);
    for (const slot of ["weapon", "armor", "arrow"]) expect(f.player[slot]).not.toBe(item);
    expect(f.player.maxHp).toBe(100);
    expect(f.player.visionBonus || 0).toBe(0);
    const store = new Map();
    vi.stubGlobal("localStorage", { setItem: (key, value) => store.set(key, value), getItem: key => store.get(key) ?? null });
    expect(saveGameState(f.sr.current, [], {}, {})).toBe(true);
    const restored = loadGameState();
    expect(restored.player.maxHp).toBe(100);
    expect(restored.player.rings).toHaveLength(0);
  });
  it.each([30, 100])("HP%dで強化し、外しても基礎最大HPは減らない", hp => {
    const ring = life(), scroll = { name: "武器強化の巻物", type: "scroll", effect: "weapon_up", bcKnown: true };
    const f = fixture([ring, scroll], { hp });
    f.actions.doUseItem(0);
    choose(f, { mode: "weapon_up", scrollIdx: 1, sel: 0 }, control);
    expect(ring.plus).toBe(2);
    expect([f.player.hp, f.player.maxHp]).toEqual([hp === 100 ? 110 : hp, 110]);
    f.actions.doUseItem(0);
    expect([f.player.hp, f.player.maxHp]).toEqual([hp, 100]);
  });
  it("装備中の祝福で+10し、再祝福は重複せず、呪いで補正が戻る", () => {
    const ring = life(), f = fixture([ring]);
    f.actions.doUseItem(0);
    choose(f, { mode: "bless", spellCost: 18, sel: 0 }, control);
    expect([f.player.hp, f.player.maxHp]).toEqual([30, 115]);
    choose(f, { mode: "bless", spellCost: 18, sel: 0 }, control);
    expect(f.player.maxHp).toBe(115);
    choose(f, { mode: "curse", spellCost: 18, sel: 0 }, control);
    expect(f.player.maxHp).toBe(105);
    choose(f, { mode: "bless", spellCost: 18, sel: 0 }, control);
    f.actions.doUseItem(0);
    expect(f.player.maxHp).toBe(100);
  });
});

describe("所持品への祝福・呪い", () => {
  it("杖で装備中の指輪を祝福・呪いするとHP補正が即座に変わる", () => {
    const ring = life(), f = fixture([ring], { hp: 100 });
    f.actions.doUseItem(0);
    applyWandEffect("bless_wand", "player", f.player, 0, 0, f.dungeon, f.player, [], vi.fn());
    expect([f.player.hp, f.player.maxHp]).toEqual([115, 115]);
    applyWandEffect("curse_wand", "player", f.player, 0, 0, f.dungeon, f.player, [], vi.fn());
    expect([f.player.hp, f.player.maxHp]).toEqual([105, 105]);
  });
  it("祝福・呪いの水を飲んだ場合も装備中の補正を更新する", () => {
    const ring = life(), bless = { name: "水", type: "potion", effect: "water", blessed: true }, curse = { ...bless, blessed: false, cursed: true };
    const f = fixture([ring, bless, curse]);
    f.actions.doUseItem(0);
    vi.spyOn(Math, "random").mockReturnValue(0);
    f.actions.doUseItem(1); expect(f.player.maxHp).toBe(115);
    f.actions.doUseItem(1); expect(f.player.maxHp).toBe(105);
  });
});

describe("装備解除と保存", () => {
  it.each([false, true])("とじこめの壺へ道具を入れようとしても、道具も装備補正も失わない（所持: %s）", carried => {
    const target = life(1, { blessed: true });
    const pot = { id: "floor-prison", name: "とじこめの壺", type: "pot", potEffect: "imprison", capacity: 3, contents: [], confinedMonsters: [] };
    const inventory = carried ? [target, pot] : [target];
    const f = fixture(inventory, { hp: 100 });
    f.actions.doUseItem(0);
    f.props.endTurn.mockClear();
    if (!carried) f.dungeon.items.push(pot);
    f.actions.doPutItem(0, carried ? { potIdx: 1 } : { floorPot: pot });
    expect(f.player.inventory).toEqual(inventory);
    expect(f.player.rings).toContain(target);
    expect([f.player.hp, f.player.maxHp]).toEqual([115, 115]);
    expect(pot.contents).toHaveLength(0);
    expect(f.props.endTurn).not.toHaveBeenCalled();
  });
  it("キャンセル済みの対象選択画面へ遅れて届くタップでは道具を使わない", () => {
    const target = life(), scroll = { name: "武器強化の巻物", type: "scroll", effect: "weapon_up" };
    const f = fixture([target, scroll]);
    const mode = { mode: "weapon_up", scrollIdx: 1, sel: 0 };
    cancelModalConfirmation(mode);
    choose(f, mode, "pointer");
    expect(target.plus).toBe(1);
    expect(f.player.inventory).toEqual([target, scroll]);
    expect(f.props.endTurn).not.toHaveBeenCalled();
  });
  it("MP不足の古い選択画面では祝福を実行せず、MPを負にしない", () => {
    const target = life(), f = fixture([target], { mp: 0 });
    choose(f, { mode: "bless", spellCost: 18, sel: 0 }, "pointer");
    expect(target.blessed).toBeUndefined();
    expect(f.player.mp).toBe(0);
    expect(f.props.endTurn).not.toHaveBeenCalled();
  });
  it("祝福の連続使用は次の選択画面へ進んでからなら実行できる", () => {
    const target = life(), f = fixture([target]);
    const mode = { mode: "bless", spellCost: 18, sel: 0 };
    choose(f, mode, "pointer"); choose(f, mode, "keyboard");
    expect(f.player.mp).toBe(82);
    choose(f, { ...mode }, "pointer");
    expect(f.player.mp).toBe(64);
    expect(f.props.endTurn).toHaveBeenCalledTimes(2);
  });
  it.each([
    ["pointer", "keyboard"], ["keyboard", "pointer"], ["pointer", "pointer"],
  ])("同じ巻物の選択画面を%s→%sで続けて確定しても1回だけ消費する", (first, second) => {
    const target = life(), scroll = { name: "武器強化の巻物", type: "scroll", effect: "weapon_up", bcKnown: true };
    const keep = { name: "パン", type: "food", value: 20 };
    const f = fixture([target, scroll, keep]);
    const mode = { mode: "weapon_up", scrollIdx: 1, sel: 0 };
    choose(f, mode, first); choose(f, mode, second);
    expect(target.plus).toBe(2);
    expect(f.player.inventory).toEqual([target, keep]);
    expect(f.props.endTurn).toHaveBeenCalledOnce();
  });
  it("回復の壺を使い切ってから割っても、回復効果は復活しない", () => {
    const pot = { name: "回復の壺", type: "pot", potEffect: "heal_pot", id: "healpot", capacity: 1, contents: [] };
    const food = { name: "パン", type: "food", value: 20 };
    const f = fixture([pot, food], { hp: 350, maxHp: 400 });
    f.actions.doPutItem(1, { potIdx: 0 });
    expect(pot.capacity).toBe(0);
    expect(f.player.hp).toBe(400);
    f.player.hp = 20;
    f.actions.doBreakPot(0);
    expect(f.player.hp).toBe(20);
    expect(f.player.inventory).toHaveLength(0);
  });
  it.each([
    { name: "短剣", type: "weapon", atk: 3 },
    life(1, { blessed: true }),
    { name: "灯火の指輪", type: "ring", effect: "torch_ring", blessed: true },
    { name: "矢", type: "arrow", count: 10 },
  ])("呪われた収納上手で超過した%sが落ちると装備を解除する", template => {
    const item = { ...template, id: "dropped" };
    const scroll = { name: "収納上手の巻物", type: "scroll", effect: "expand_inv", cursed: true, bcKnown: true };
    const f = fixture([scroll, ...Array.from({ length: 10 }, () => ({ name: "パン", type: "food", value: 20 })), item], { maxInventory: 12 });
    f.actions.doUseItem(11);
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    f.actions.doUseItem(0);
    expect(f.player.maxInventory).toBe(10);
    expect(f.player.inventory).not.toContain(item);
    expect(f.dungeon.items.some(it => it.id === item.id)).toBe(true);
    expect(f.player.rings).not.toContain(item);
    for (const slot of ["weapon", "armor", "arrow"]) expect(f.player[slot]).not.toBe(item);
    expect(f.player.maxHp).toBe(100);
    expect(f.player.visionBonus || 0).toBe(0);
  });
  it("装備外しの罠は祝福による+10も戻す", () => {
    const ring = life(1, { blessed: true }), f = fixture([ring], { hp: 100, reverseTurns: 10 });
    f.actions.doUseItem(0);
    expect(f.player.maxHp).toBe(115);
    applyUnequipTrapToPlayer(f.player, []);
    expect([f.player.hp, f.player.maxHp]).toEqual([100, 100]);
    expect(f.player.rings).toHaveLength(0);
  });
  it("所持品から消えた旧状態の指輪補正を、新しくセーブする時に除く", () => {
    const ring = life(1, { blessed: true }), f = fixture([ring], { hp: 100 });
    f.actions.doUseItem(0); f.player.inventory = [];
    const store = new Map();
    vi.stubGlobal("localStorage", { setItem: (key, value) => store.set(key, value), getItem: key => store.get(key) ?? null });
    expect(saveGameState(f.sr.current, [], {}, {})).toBe(true);
    const restored = loadGameState();
    expect(restored.player.rings).toHaveLength(0);
    expect([restored.player.hp, restored.player.maxHp]).toEqual([100, 100]);
    expect(f.player.maxHp).toBe(115); // 保存用コピーだけを補正する。
  });
  it("水で最後の爆弾矢が消えた場合も矢の装備を解除する", () => {
    const arrow = { name: "爆弾矢", type: "arrow", bombArrow: true, count: 1 };
    const f = fixture([arrow], { arrow });
    applyWaterGunToInventory(f.player, []);
    expect(f.player.inventory).toHaveLength(0);
    expect(f.player.arrow).toBeNull();
  });
});

describe.each([false, true])("毒消し指輪（2枠からの交換: %s）", replace => {
  it.each(["active", "expired", "yabaiExpired", "unrelatedLoss", "healthy"])("%s: 残った毒の攻撃力低下を治す", state => {
    const ring = { name: "毒消しの指輪", type: "ring", effect: "antidote_ring" };
    const initial = replace ? [{ name: "指輪1", type: "ring" }, { name: "指輪2", type: "ring" }] : [];
    const f = fixture([ring, ...initial], { rings: initial });
    if (state !== "healthy") {
      if (state === "yabaiExpired") applyYabaiPoison(f.player, "player");
      else applyPlayerPoison(f.player);
      if (state !== "active") {
        for (let i = 0; i < 10; i++) advanceEarlyStatusTimers(f.player, []);
        expect(f.player.poisoned).toBe(false);
        expect(f.player.poisonAtkLoss).toBeGreaterThan(0);
      }
      if (state === "unrelatedLoss") f.player.atk -= 2;
    }
    f.actions.doUseItem(0);
    expect(f.player.rings).toContain(ring);
    expect(!!f.player.poisoned).toBe(false);
    expect(f.player.poisonedTurns || 0).toBe(0);
    expect(f.player.poisonAtkLoss || 0).toBe(0);
    expect(f.player.atk).toBe(state === "unrelatedLoss" ? 6 : 8);
  });
});
