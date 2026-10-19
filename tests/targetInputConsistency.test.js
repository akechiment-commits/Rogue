import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const effects = vi.hoisted(() => []);
vi.mock("react", async () => ({
  ...await vi.importActual("react"), useCallback: fn => fn, useRef: value => ({ current: value }),
  useEffect: fn => { effects.push(fn); }, useLayoutEffect: fn => { effects.push(fn); },
  useState: value => [value, vi.fn()],
}));
import * as React from "react";
import { IdentifyModal } from "../GameModals.jsx";
import { useKeyHandler } from "../useKeyHandler.js";
import { useGamepad } from "../useGamepad.js";
import { BTN } from "../gamepadInput.js";
import { soundEngine } from "../soundEngine.js";
import { ITEMS, WANDS, POTS, RINGS, MAGIC_MARKER, EXCALIBUR_T, generateFakeNames, getIdentKey, WEAPON_ABILITIES, ARMOR_ABILITIES } from "../items.js";
import { getDiscoveries, resetDiscoveries, trackItem } from "../DiscoveryTracker.js";
import { itemDisplayName } from "../render.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

beforeEach(() => {
  resetDiscoveries();
  effects.length = 0;
  vi.stubGlobal("React", React);
  vi.spyOn(soundEngine, "unlock").mockImplementation(() => {});
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function findTarget(node) {
  if (node == null) return null;
  if (Array.isArray(node)) return node.map(findTarget).find(Boolean);
  if (typeof node !== "object") return null;
  if (node.type === "div" && node.key === "0" && node.props.onClick) return node;
  return findTarget(node.props?.children);
}
function choose(input, source, action = "duplicate", modifiers = {}, nameState = {}) {
  effects.length = 0;
  const target = structuredClone({ ...source, id: "target" });
  const scroll = { id: "scroll", name: "使用する巻物", type: "scroll", effect: action };
  const player = makePlayer({ inventory: [target, scroll], mp: 100, atk: 10, def: 5 });
  const key = getIdentKey(target);
  const sr = { current: { player, dungeon: makeEmptyDg({ rooms: [] }),
    ident: new Set(nameState.identified ? [key] : []),
    fakeNames: generateFakeNames([...ITEMS, ...WANDS], POTS, [], RINGS),
    nicknames: nameState.nickname ? { [key]: nameState.nickname } : {}, floors: {} } };
  const initialDisplayName = itemDisplayName(target, sr.current.fakeNames, sr.current.ident, sr.current.nicknames);
  const mode = { mode: action, sel: 0, scrollIdx: 1, ...modifiers };
  const endTurn = vi.fn(), identifyConfirmRef = { current: null }, listeners = {};
  const props = { sr, gs: sr.current, endTurn, setMode: vi.fn(), setGs: vi.fn(), setMsgs: vi.fn(), iLabel: item => item.name };
  const tree = IdentifyModal({ ...props, mode, identifyConfirmRef });
  vi.stubGlobal("window", {
    addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener() {},
    dispatchEvent: event => listeners[event.type]?.(event),
  });
  vi.stubGlobal("KeyboardEvent", class {
    constructor(type, args) { Object.assign(this, { type }, args); }
    preventDefault() {}
  });
  useKeyHandler({ ...props, identifyMode: mode, setIdentifyMode: props.setMode, identifyConfirmRef,
    shiftRef: { current: false }, aRef: { current: false }, arrowHeldRef: { current: {} }, execRef: { current: null } });
  effects.splice(0).forEach(fn => fn());
  if (input === "click" || input === "tap") findTarget(tree).props.onClick();
  else if (input === "mobileConfirm") identifyConfirmRef.current(0);
  else if (input === "keyboard") listeners.keydown(new KeyboardEvent("keydown", { key: "Enter", code: "Enter" }));
  else {
    let tick;
    vi.stubGlobal("requestAnimationFrame", fn => { tick = fn; return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    buttons[BTN.B] = { pressed: true, value: 1 };
    vi.stubGlobal("navigator", { getGamepads: () => [{ connected: true, mapping: "standard", buttons, axes: [0, 0, 0, 0] }] });
    useGamepad({ modalType: "identify", sr });
    effects.splice(0).forEach(fn => fn());
    tick(1000);
  }
  expect(endTurn).toHaveBeenCalledTimes(1);
  expect(player.inventory).not.toContain(scroll);
  const messages = props.setMsgs.mock.calls.flatMap(([update]) => typeof update === "function" ? update([]) : update);
  return { player, target, copy: player.inventory[1], mode, sr, messages, initialDisplayName };
}

const inputs = ["click", "tap", "keyboard", "controller", "mobileConfirm"];
describe.each(inputs)("複製の新品生成: %s", input => {
  it("消耗した杖は新品の使用回数になり、元の杖は変更しない", () => {
    const source = WANDS.find(w => w.effect === "fire_wand");
    const { target, copy } = choose(input, { ...source, charges: 1, shopPrice: 600, _shopCharge: 600 });
    expect(copy.charges).toBe(source.charges);
    expect(copy.shopPrice).toBeUndefined();
    expect(copy._shopCharge).toBeUndefined();
    expect(target.charges).toBe(1);
  });
  it("武器の合成能力と強化値を引き継がない", () => {
    const source = ITEMS.find(i => i.name === "ロングソード");
    const { target, copy } = choose(input, { ...source, plus: 9, ability: "bane_dragon", abilities: ["bane_dragon"] });
    expect(copy.name).toBe(source.name);
    expect(copy.plus || 0).toBe(0);
    expect(copy.abilities).toBeUndefined();
    expect(copy.ability).toBeUndefined();
    expect(target.plus).toBe(9);
  });
  it("新品に本来備わる固有能力はカタログから復元する", () => {
    const { copy } = choose(input, { ...EXCALIBUR_T, abilities: [EXCALIBUR_T.ability, "bane_dragon"], plus: 8 });
    expect(copy.ability).toBe(EXCALIBUR_T.ability);
    expect(copy.abilities).toBeUndefined();
  });
  it("壺は新品の容量・空の中身になり、捕獲した敵を複製しない", () => {
    const source = POTS.find(p => p.potEffect === "none");
    const { copy } = choose(input, { ...source, capacity: 20, contents: [{ name: "中身" }], confinedMonsters: [{ name: "敵" }] });
    expect(copy.capacity).toBeGreaterThanOrEqual(6);
    expect(copy.capacity).toBeLessThanOrEqual(9);
    expect(copy.contents).toEqual([]);
    expect(copy.confinedMonsters).toEqual([]);
  });
  it("魔法の筆も増量・消耗した回数を引き継がない", () => {
    const { copy } = choose(input, { ...MAGIC_MARKER, charges: 30 });
    expect(copy.charges).toBe(MAGIC_MARKER.charges);
  });
  it("指輪の付与能力と強化値をリセットする", () => {
    const source = RINGS.find(r => r.effect === "life_ring");
    const { copy } = choose(input, { ...source, plus: 8, abilities: ["regen"] });
    expect(copy.effect).toBe("life_ring");
    expect(copy.plus || 0).toBe(0);
    expect(copy.abilities).toBeUndefined();
  });
  it("祝福の複製では新品に祝福し、元の呪いはコピーしない", () => {
    const source = WANDS.find(w => w.effect === "fire_wand");
    const { copy } = choose(input, { ...source, charges: 1, cursed: true }, "duplicate", { blessed: true });
    expect(copy).toMatchObject({ charges: source.charges, blessed: true, cursed: false });
  });
});

describe.each(inputs)("装備強化の入力一致: %s", input => {
  it.each([[{}, 0.049, true], [{}, 0.05, false], [{ blessed: true }, 0.099, true],
    [{ blessed: true }, 0.10, false], [{ cursed: true }, 0.199, true], [{ cursed: true }, 0.20, false]])(
    "祝呪%j・乱数%sの特殊変化=%s", (modifiers, random, transforms) => {
      vi.mocked(Math.random).mockReturnValue(random);
      const source = ITEMS.find(i => i.name === "ロングソード");
      const { target } = choose(input, { ...source, plus: 3, abilities: ["bane_dragon"] }, "weapon_up", modifiers);
      expect(target.name).toBe(transforms ? "エクスカリバー" : "ロングソード");
      expect(target.plus).toBe(transforms ? 3 : 3 + (modifiers.blessed ? 2 : modifiers.cursed ? -1 : 1));
      expect(target.abilities).toContain("bane_dragon");
    },
  );
  it.each([["短剣", "猫の爪"], ["バトルアクス", "ゴールデンアクス"]])(
    "%sも同じ条件で%sへ特殊変化する", (name, expected) => {
      vi.mocked(Math.random).mockReturnValue(0);
      const source = ITEMS.find(i => i.name === name);
      const { target } = choose(input, source, "weapon_up");
      expect(target.name).toBe(expected);
    },
  );
});

describe.each(inputs)("変換の抽選一致: %s", input => {
  it("同じ乱数では全入力で同じ重み付き抽選結果になる", () => {
    const source = ITEMS.find(item => item.type === "potion");
    const { player, target } = choose(input, source, "transform_item");
    expect(player.inventory).toHaveLength(1);
    expect(player.inventory[0].name).toBe("ロングソード");
    expect(player.inventory[0]).not.toBe(target);
  });
  it.each([[{ blessed: true }, "D"], [{ cursed: true }, "E"]])(
    "祝呪%jは同じレア度%sの候補へ変換する", (modifiers, rarity) => {
      const source = ITEMS.find(item => item.type === "potion" && item.rarity === "E");
      const { player } = choose(input, source, "transform_item", modifiers);
      expect(player.inventory).toHaveLength(1);
      expect(player.inventory[0].rarity).toBe(rarity);
      expect(player.inventory[0].name).not.toBe(source.name);
    },
  );
});

describe.each(inputs)("祝福・呪い時の表示名: %s", input => {
  it.each(["bless", "curse"])("未識別薬の%sでも、ゲーム本来の仮名を使い正体を漏らさない", action => {
    const source = ITEMS.find(item => item.type === "potion" && item.effect === "heal");
    const result = choose(input, source, action);
    expect(result.initialDisplayName).toBe("赤い薬");
    expect(result.messages.join("\n")).toContain(`赤い薬を${action === "bless" ? "祝福した" : "呪った"}`);
    expect(result.messages.join("\n")).not.toContain(source.name);
    expect(result.sr.current.ident.has(getIdentKey(source))).toBe(false);
  });
  it.each(["bless", "curse"])("名付けた薬の%sはニックネームを保つ", action => {
    const source = ITEMS.find(item => item.type === "potion" && item.effect === "heal");
    const result = choose(input, source, action, {}, { nickname: "試しの薬" });
    expect(result.messages.join("\n")).toContain("薬:試しの薬を");
    expect(result.messages.join("\n")).not.toContain(source.name);
  });
  it.each(["bless", "curse"])("識別済みの薬の%sでは本名を表示する", action => {
    const source = ITEMS.find(item => item.type === "potion" && item.effect === "heal");
    const result = choose(input, source, action, {}, { identified: true });
    expect(result.messages.join("\n")).toContain(`${source.name}を`);
  });
  it.each(["bless", "curse"])("未識別壺の%sでも容量の増減メッセージで正体を漏らさない", action => {
    const source = POTS.find(item => item.potEffect === "none");
    const result = choose(input, { ...source, capacity: 6, contents: [] }, action);
    expect(result.messages.join("\n")).toContain(result.initialDisplayName);
    expect(result.messages.join("\n")).not.toContain(source.name);
  });
});

describe.each(inputs)("錬成の候補一致: %s", input => {
  it.each(["lifesteal", "double_strike", "water_proof", "all_resist", "aura"])(
    "祝福錬成で%sも他の候補と同様に選べる", ability => {
      const weapon = ["lifesteal", "double_strike"].includes(ability);
      const definitions = weapon ? WEAPON_ABILITIES : ARMOR_ABILITIES;
      const template = ITEMS.find(item => item.name === (weapon ? "ロングソード" : "革の鎧"));
      const abilities = definitions.filter(a => a.id !== ability).map(a => a.id);
      const { target } = choose(input, { ...template, abilities }, "forge_item", { blessed: true });
      expect(target.abilities).toContain(ability);
      expect(target.abilities).toHaveLength(abilities.length + 1);
    },
  );
  it("同じ乱数なら祝福錬成で同じ能力が付く", () => {
    vi.mocked(Math.random).mockReturnValue(0.999);
    const { target } = choose(input, ITEMS.find(item => item.name === "ロングソード"), "forge_item", { blessed: true });
    expect(target.abilities).toEqual(["double_strike"]);
  });
});

describe.each(inputs)("識別時の図鑑登録: %s", input => {
  it("未識別の薬を識別すると種類を図鑑に1回登録する", () => {
    const source = ITEMS.find(item => item.type === "potion" && item.effect === "heal");
    const { target, sr } = choose(input, source, "identify");
    expect(sr.current.ident.has(getIdentKey(target))).toBe(true);
    expect(target.fullIdent).toBe(true);
    expect(getDiscoveries().items.heal).toMatchObject({ name: source.name, type: "potion", count: 1 });
    trackItem(target);
    expect(getDiscoveries().items.heal.count).toBe(1);
  });
});

describe.each(inputs)("換金時の表示名: %s", input => {
  it.each([{}, { blessed: true }, { cursed: true }])("通常・祝福・呪いでも名前と換金額を保つ: %j", modifiers => {
    const source = ITEMS.find(item => item.type === "potion" && item.effect === "heal");
    for (const nameState of [{}, { nickname: "試しの薬" }, { identified: true }]) {
      const result = choose(input, source, "sell_item", modifiers, nameState);
      const amount = modifiers.blessed ? 200 : modifiers.cursed ? 50 : 100;
      expect(result.messages.join("\n")).toContain(`${result.initialDisplayName}を${amount}Gで換金した`);
      expect(result.player.gold).toBe(amount);
      expect(result.player.inventory).not.toContain(result.target);
      expect(result.sr.current.ident.has(getIdentKey(source))).toBe(!!nameState.identified);
      if (!nameState.identified) expect(result.messages.join("\n")).not.toContain(source.name);
    }
  });
});

describe.each(inputs)("呪われた複製の表示名: %s", input => {
  it.each([{}, { nickname: "試しの薬" }, { identified: true }])("削除前の表示名を保つ: %j", nameState => {
    const source = ITEMS.find(item => item.type === "potion" && item.effect === "heal");
    const result = choose(input, source, "duplicate", { cursed: true }, nameState);
    expect(result.messages).toEqual([`${result.initialDisplayName}が消えてしまった！【呪】`]);
    expect(result.player.inventory).not.toContain(result.target);
    expect(result.sr.current.ident.has(getIdentKey(source))).toBe(!!nameState.identified);
    if (!nameState.identified) expect(result.messages.join("\n")).not.toContain(source.name);
  });
});
