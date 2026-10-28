import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canAcceptPotItem, isPotStorableItem } from "../items.js";
import { MONS, makeMonsterFromBase, monsterAI, revealItemMimicAt } from "../monsters.js";
import { clearDimensionalVaultItemCounter, ensureItemMimicFloorItems } from "../utils.js";
import { floorEntryRole } from "../floorInventory.js";
import { trackItem } from "../DiscoveryTracker.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

function setup(effect, floorPot) {
  vi.spyOn(Math, "random").mockReturnValue(0.01);
  const player = makePlayer({ def: 0 });
  const mimic = makeMonsterFromBase(MONS.find(m => m.baseKind === "itemMimic"), 1, 5, 5);
  const pot = { id: "pot", name: "壺", type: "pot", potEffect: effect, capacity: 3, contents: [], x: 5, y: 5 };
  const dungeon = makeEmptyDg({ monsters: [mimic], items: floorPot ? [pot] : [], rooms: [] });
  ensureItemMimicFloorItems(dungeon);
  if (!floorPot) player.inventory.push(pot);
  const item = dungeon.items.find(i => i.itemMimicId === mimic.id);
  const state = { player, dungeon };
  const sr = { current: state };
  const setters = Object.fromEntries(["setPutMode", "setMsgs", "setGs", "setShowInv", "setSelIdx", "setInvPage", "setInvMenuSel", "setShowDesc"].map(k => [k, vi.fn()]));
  const doPutItem = vi.fn();
  const endTurn = vi.fn(() => {
    const hpAfterReveal = player.hp;
    ensureItemMimicFloorItems(dungeon);
    monsterAI(mimic, dungeon, player, [], { moveOnly: true });
    monsterAI(mimic, dungeon, player, [], { attackOnly: true });
    expect(player.hp).toBe(hpAfterReveal);
  });
  const deps = { sr, ...setters, doPutItem, endTurn, canAcceptPotItem, isPotStorableItem,
    floorEntryRole, revealItemMimicAt, clearDimensionalVaultItemCounter, trackItem, lu: vi.fn() };
  const source = fs.readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
  const start = source.indexOf("  const _doPutFloorItem = (item, target) => {");
  const end = source.indexOf("  /* 壺入れをやめる", start);
  if (start < 0 || end < 0) throw Error("Missing floor pot callback");
  const put = new Function(...Object.keys(deps), `${source.slice(start, end)}; return _doPutFloorItem;`)(...Object.values(deps));
  const target = floorPot ? { pot, floorPot: pot } : { pot, potIdx: 0 };
  return { player, mimic, pot, dungeon, item, put, target, setters, endTurn, doPutItem };
}

describe.each([false, true])("足元の壺投入とモドキ（床の壺=%s）", floorPot => {
  it.each(["none", "heal_pot", "boil", "wish_pot"])("%sへ投入を試みると正体を現し、偽物を収納・消費しない", effect => {
    const s = setup(effect, floorPot);
    s.put(s.item, s.target);
    expect(s.mimic.disguisedAsItem).toBe(false);
    expect(s.dungeon.items).not.toContain(s.item);
    expect(s.player.inventory).not.toContain(s.item);
    expect(s.pot).toMatchObject({ capacity: 3, contents: [] });
    expect(s.doPutItem).not.toHaveBeenCalled();
    expect(s.endTurn).toHaveBeenCalledTimes(1);
    const messages = s.setters.setMsgs.mock.calls[0][0]([]);
    expect(messages.join(" ")).toContain("正体を現した");
    expect(s.player.hp).toBeLessThan(100);
    expect(s.setters.setPutMode).toHaveBeenCalledWith(null);
    ensureItemMimicFloorItems(s.dungeon);
    expect(s.dungeon.items.some(i => i.itemMimicId)).toBe(false);
  });

  it("実物の道具は従来どおり共通投入処理へ渡す", () => {
    const s = setup("none", floorPot);
    const item = { id: "real", name: "矢", type: "arrow", x: 5, y: 5 };
    s.dungeon.items.push(item);
    s.put(item, s.target);
    expect(s.dungeon.items).not.toContain(item);
    expect(s.player.inventory).toContain(item);
    expect(s.doPutItem).toHaveBeenCalledTimes(1);
    expect(s.mimic.disguisedAsItem).toBe(true);
  });

  it("満杯で投入できない場合はモドキに触らない", () => {
    const s = setup("none", floorPot);
    s.pot.capacity = 0;
    s.put(s.item, s.target);
    expect(s.mimic.disguisedAsItem).toBe(true);
    expect(s.dungeon.items).toContain(s.item);
    expect(s.endTurn).not.toHaveBeenCalled();
    expect(s.player.hp).toBe(100);
  });
});
