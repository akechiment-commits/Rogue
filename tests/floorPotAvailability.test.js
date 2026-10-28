import { describe, expect, it, vi } from "vitest";
vi.mock("react", async importOriginal => ({
  ...await importOriginal(), useCallback: fn => fn, useRef: current => ({ current }),
  useEffect: () => {}, useLayoutEffect: () => {},
}));
import { useItemActions } from "../useItemActions.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

const disruptions = {
  "壺が壊れた": s => { s.dungeon.items = []; },
  "壺が移動した": s => { s.pot.x++; },
  "自分が飛ばされた": s => { s.player.x++; },
  "別の階へ移動した": s => { s.sr.current.dungeon = makeEmptyDg(); },
};
function setup(effect = "none") {
  const item = { id: "item", name: "矢", type: "arrow", count: 1 };
  const player = makePlayer({ hp: 20, inventory: [item] });
  const pot = { id: "floor-pot", name: "壺", type: "pot", potEffect: effect, capacity: 3, contents: [], x: player.x, y: player.y };
  const dungeon = makeEmptyDg({ items: [pot] });
  const sr = { current: { player, dungeon, ident: new Set(), fakeNames: {}, nicknames: {} } };
  const props = { sr, putMode: { floorPot: pot }, dnameRef: item => item.name, lu: vi.fn(),
    endTurn: vi.fn(), setGs: vi.fn(), setMsgs: vi.fn(), setShowInv: vi.fn(), setSelIdx: vi.fn(),
    setShowDesc: vi.fn(), setPutMode: vi.fn(), setPutMenuSel: vi.fn(), setPutPage: vi.fn(), setWishMode: vi.fn() };
  return { player, pot, dungeon, sr, props, item, actions: useItemActions(props) };
}

describe("足元の壺が使えなくなった後の投入", () => {
  for (const effect of ["none", "heal_pot", "wish_pot"]) {
    it.each(Object.entries(disruptions))(`${effect}: %sなら道具・HP・願いを変えない`, (_name, disrupt) => {
      const s = setup(effect);
      disrupt(s);
      s.actions.doPutItem(0);
      expect(s.player.inventory).toEqual([s.item]);
      expect(s.player.hp).toBe(20);
      expect(s.pot).toMatchObject({ contents: [], capacity: 3 });
      expect(s.props.endTurn).not.toHaveBeenCalled();
      expect(s.props.setWishMode).not.toHaveBeenCalled();
      expect(s.props.setPutMode).toHaveBeenCalledWith(null);
    });
  }

  it.each(Object.entries(disruptions))("投入直後の敵行動で%sなら、連続投入の画面を閉じる", (_name, disrupt) => {
    const s = setup();
    s.props.endTurn.mockImplementationOnce(() => disrupt(s));
    s.actions.doPutItem(0);
    expect(s.pot.contents).toEqual([s.item]);
    expect(s.props.endTurn).toHaveBeenCalledTimes(1);
    expect(s.props.setPutMode).toHaveBeenLastCalledWith(null);
  });

  it("足元の壺が残っていれば、投入後も選択を続けられる", () => {
    const s = setup();
    s.actions.doPutItem(0);
    expect(s.player.inventory).toEqual([]);
    expect(s.pot.contents).toEqual([s.item]);
    expect(s.props.setPutMode).toHaveBeenLastCalledWith({ floorPot: s.pot });
  });

  it("同じIDの別個体が置かれても、古い壺へ投入しない", () => {
    const s = setup();
    s.dungeon.items = [{ ...s.pot, contents: [] }];
    s.actions.doPutItem(0);
    expect(s.player.inventory).toEqual([s.item]);
    expect(s.pot.contents).toEqual([]);
    expect(s.props.endTurn).not.toHaveBeenCalled();
  });

  it("敵行動で容量が減って満杯になったら画面を閉じる", () => {
    const s = setup();
    s.props.endTurn.mockImplementationOnce(() => { s.pot.capacity = 1; });
    s.actions.doPutItem(0);
    expect(s.props.setPutMode).toHaveBeenLastCalledWith(null);
  });

  it("所持品の壺も敵行動で失った場合は画面を閉じる", () => {
    const s = setup();
    s.dungeon.items = [];
    s.player.inventory.push(s.pot);
    s.props.putMode = { potIdx: 1 };
    s.props.endTurn.mockImplementationOnce(() => { s.player.inventory = []; });
    useItemActions(s.props).doPutItem(0);
    expect(s.props.setPutMode).toHaveBeenLastCalledWith(null);
  });
});
