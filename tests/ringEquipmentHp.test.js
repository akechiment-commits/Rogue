import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("react", () => ({ useCallback: fn => fn, useRef: value => ({ current: value }), useEffect: () => {} }));
import { useItemActions } from "../useItemActions.js";
import { makePlayer, makeEmptyDg } from "./helpers.js";
import { MW, MH } from "../utils.js";
import { applyPlayerLevelDown, applyPotionEffect, grantDungeonStarterGear } from "../items.js";
import { replacePlayerRings, setPlayerItemProperties, unequipPlayerItem } from "../equipmentEffects.js";
import { saveGameState, loadGameState } from "../GameSave.js";
import { applyWandEffect } from "../wands.js";
import { grantWish } from "../wish.js";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const life = (plus = 3, extra = {}) => ({ name: "命の指輪", type: "ring", effect: "life_ring", plus, bcKnown: true, ...extra });
function setup(inventory, overrides = {}) {
  const player = makePlayer({ hp: 100, maxHp: 100, depth: 1, inventory, ...overrides });
  const dungeon = makeEmptyDg({
    rooms: [{ x: 1, y: 1, w: 12, h: 12 }],
    visible: Array.from({ length: MH }, () => Array(MW).fill(false)),
    explored: Array.from({ length: MH }, () => Array(MW).fill(false)),
  });
  const sr = { current: { player, dungeon, ident: new Set(), fakeNames: {}, nicknames: {} } };
  const endTurn = vi.fn(); // 自然回復・敵行動を分離して装備自体のHP変化を検証する。
  const { doUseItem } = useItemActions({ sr, endTurn, dnameRef: it => it.name,
    setGs: vi.fn(), setMsgs: vi.fn(), setShowInv: vi.fn(), setSelIdx: vi.fn(), setShowDesc: vi.fn() });
  return { player, endTurn, use: doUseItem };
}

describe("指輪装備のHP補正", () => {
  it.each([10, 30])("持ち込み指輪の自動装備にもHP・視界補正が入り、外すと元に戻る: HP%d", hp => {
    const ring = life(1, { blessed: true }), torch = { name: "灯火の指輪", type: "ring", effect: "torch_ring" };
    const f = setup([ring, torch], { hp, maxHp: 30 });
    grantDungeonStarterGear(f.player);
    expect([f.player.hp, f.player.maxHp, f.player.visionBonus]).toEqual([hp === 30 ? 45 : hp, 45, 1]);
    grantDungeonStarterGear(f.player);
    expect([f.player.hp, f.player.maxHp, f.player.visionBonus]).toEqual([hp === 30 ? 45 : hp, 45, 1]);
    f.use(0); f.use(1);
    expect([f.player.hp, f.player.maxHp, f.player.visionBonus]).toEqual([hp, 30, 0]);
  });
  it.each([10, 99])("負傷中のHP%dは、命の指輪の付け外しを繰り返しても回復しない", hp => {
    const f = setup([life()], { hp });
    for (let i = 0; i < 3; i++) {
      f.use(0);
      expect([f.player.hp, f.player.maxHp]).toEqual([hp, 115]);
      f.use(0);
      expect([f.player.hp, f.player.maxHp]).toEqual([hp, 100]);
    }
    expect(f.endTurn).toHaveBeenCalledTimes(6);
  });
  it("満タンなら現HPも増え、外すと元の満タンHPへ戻る", () => {
    const f = setup([life()]);
    f.use(0); expect([f.player.hp, f.player.maxHp]).toEqual([115, 115]);
    f.use(0); expect([f.player.hp, f.player.maxHp]).toEqual([100, 100]);
  });
  it.each([10, 99, 100])("命・祝福の増加をまとめて、装備前のHP%dで判定する", hp => {
    const f = setup([life(3, { blessed: true })], { hp });
    f.use(0); expect([f.player.hp, f.player.maxHp]).toEqual([hp === 100 ? 125 : hp, 125]);
    f.use(0); expect([f.player.hp, f.player.maxHp]).toEqual([hp, 100]);
  });
  it.each([99, 100])("命以外の祝福指輪も装備前のHP%dで判定する", hp => {
    const f = setup([{ name: "力の指輪", type: "ring", effect: "power_ring", plus: 1, blessed: true }], { hp });
    f.use(0); expect([f.player.hp, f.player.maxHp]).toEqual([hp === 100 ? 110 : hp, 110]);
    f.use(0); expect([f.player.hp, f.player.maxHp]).toEqual([hp, 100]);
  });
  it.each([110, 115])("2枠埋まった指輪交換は、古い指輪を外す前のHP%dで判定する", hp => {
    const first = { name: "力の指輪", type: "ring", effect: "power_ring" }, old = life(), next = life(4, { blessed: true });
    const f = setup([first, old, next], { hp, maxHp: 115, rings: [first, old] });
    f.use(2);
    expect(f.player.rings).toEqual([first, next]);
    expect([f.player.hp, f.player.maxHp]).toEqual([hp === 115 ? 130 : 100, 130]);
  });
  it("呪われた指輪で交換に失敗してもHPは変わらない", () => {
    const first = life(0), old = life(3, { cursed: true }), next = life(4);
    const f = setup([first, old, next], { hp: 115, maxHp: 115, rings: [first, old] });
    f.use(2); expect([f.player.hp, f.player.maxHp]).toEqual([115, 115]);
    expect(f.player.rings).toEqual([first, old]);
  });
  it.each([
    { reverseTurns: 10 },
    { armor: { abilities: ["dmg_reduce"] } },
  ])("逆転・被ダメ軽減中でも、容量の増減はそのまま現HPへ反映する: %j", status => {
    const f = setup([life(3, { blessed: true })], status);
    f.use(0); expect([f.player.hp, f.player.maxHp]).toEqual([125, 125]);
    f.use(0); expect([f.player.hp, f.player.maxHp]).toEqual([100, 100]);
    f.player.hp -= 10;
    expect(f.player.hp).toBe(status.reverseTurns ? 100 : 91);
  });
  it("マイナスの命の指輪は現HPを新しい最大HPまでに制限する", () => {
    const f = setup([life(-3)], { hp: 99 });
    f.use(0); expect([f.player.hp, f.player.maxHp]).toEqual([85, 85]);
  });
  it.each([false, true])("最大HPの下限に達した命の指輪を外しても、最大HPが増殖しない（保存再開: %s）", reload => {
    const ring = life(-10);
    const f = setup([ring], { hp: 30, maxHp: 30 });
    f.use(0);
    expect([f.player.hp, f.player.maxHp]).toEqual([1, 1]);
    let player = f.player;
    if (reload) {
      const store = new Map();
      vi.stubGlobal("localStorage", { setItem: (key, value) => store.set(key, value), getItem: key => store.get(key) ?? null });
      const dungeon = makeEmptyDg({ visible: Array.from({ length: MH }, () => Array(MW).fill(false)),
        explored: Array.from({ length: MH }, () => Array(MW).fill(false)) });
      expect(saveGameState({ player, dungeon, floors: {}, ident: new Set() }, [], {}, {})).toBe(true);
      player = loadGameState().player;
      unequipPlayerItem(player, player.rings[0]);
    } else {
      f.use(0);
    }
    expect([player.hp, player.maxHp]).toEqual([1, 30]);
  });
  it("下限到達中の指輪強化は、切り捨てた負の補正を解消してから最大HPを増やす", () => {
    const ring = life(-10), f = setup([ring], { hp: 30, maxHp: 30 });
    f.use(0);
    setPlayerItemProperties(f.player, ring, { plus: -8 });
    expect([f.player.hp, f.player.maxHp]).toEqual([1, 1]);
    setPlayerItemProperties(f.player, ring, { plus: -5 });
    expect([f.player.hp, f.player.maxHp]).toEqual([5, 5]);
    f.use(0);
    expect([f.player.hp, f.player.maxHp]).toEqual([5, 30]);
  });
  it.each([false, true])("下限到達中に祝福指輪を追加しても、外す順序で最大HPが変わらない（負の指輪を先に外す: %s）", negativeFirst => {
    const negative = life(-10), positive = { name: "灯火の指輪", type: "ring", effect: "torch_ring", blessed: true };
    const f = setup([negative, positive], { hp: 30, maxHp: 30 });
    f.use(0); f.use(1);
    expect(f.player.maxHp).toBe(1);
    f.use(negativeFirst ? 0 : 1);
    expect(f.player.maxHp).toBe(negativeFirst ? 40 : 1);
    f.use(negativeFirst ? 1 : 0);
    expect(f.player.maxHp).toBe(30);
    expect(f.player.visionBonus).toBe(0);
  });
  it.each([
    { name: "回復薬", type: "potion", effect: "heal", value: 30 },
    { name: "生命の食料", type: "food", effect: "vitality_food", value: 10 },
  ])("下限到達中の%sによる永続HP増加は、指輪を外しても保持する", item => {
    const ring = life(-10), f = setup([ring, item], { hp: 30, maxHp: 30 });
    f.use(0); f.use(1);
    expect([f.player.hp, f.player.maxHp]).toEqual([1, 1]);
    f.use(0);
    expect([f.player.hp, f.player.maxHp]).toEqual([1, 31]);
  });
  it("下限到達中のレベルダウンも、指輪補正前の最大HPから差し引く", () => {
    const ring = life(-10), f = setup([ring], { hp: 30, maxHp: 30, level: 3 });
    f.use(0);
    applyPlayerLevelDown(f.player, []);
    f.use(0);
    expect([f.player.hp, f.player.maxHp]).toEqual([1, 25]);
  });
  it("まとめて指輪を交換する処理でも下限の補正を保持する", () => {
    const f = setup([], { hp: 30, maxHp: 30 });
    replacePlayerRings(f.player, [life(-10)]);
    replacePlayerRings(f.player, [life(-8)]);
    expect(f.player.maxHp).toBe(1);
    replacePlayerRings(f.player, []);
    expect(f.player.maxHp).toBe(30);
  });
  it("下限到達中に浴びた超回復薬と願いによるレベルアップの永続増加も保持する", () => {
    const ring = life(-10), f = setup([ring], { hp: 30, maxHp: 30 });
    f.use(0);
    applyPotionEffect("superheal", 100, "player", f.player, makeEmptyDg(), f.player, [], vi.fn());
    expect([f.player.hp, f.player.maxHp]).toEqual([1, 1]);
    grantWish({ kind: "preset", id: "level_up" }, { player: f.player, dungeon: makeEmptyDg(), ml: [] });
    expect([f.player.hp, f.player.maxHp]).toEqual([1, 1]);
    f.use(0);
    expect([f.player.hp, f.player.maxHp]).toEqual([1, 48]);
  });
  it("変化の杖による最大HP減少は、指輪補正前の下限1で止める", () => {
    const ring = life(2), f = setup([ring], { hp: 3, maxHp: 3 });
    f.use(0);
    vi.spyOn(Math, "random").mockReturnValue(0);
    applyWandEffect("transform", "player", f.player, 0, 0, makeEmptyDg(), f.player, [], vi.fn(), vi.fn());
    expect(f.player.maxHp).toBe(11);
    f.use(0);
    expect([f.player.hp, f.player.maxHp]).toEqual([1, 1]);
  });
});
