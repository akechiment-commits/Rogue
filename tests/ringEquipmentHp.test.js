import { describe, expect, it, vi } from "vitest";
vi.mock("react", () => ({ useCallback: fn => fn, useRef: value => ({ current: value }), useEffect: () => {} }));
import { useItemActions } from "../useItemActions.js";
import { makePlayer, makeEmptyDg } from "./helpers.js";
import { MW, MH } from "../utils.js";
import { grantDungeonStarterGear } from "../items.js";

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
});
