import { describe, expect, it, vi } from "vitest";
vi.mock("react", () => ({ useCallback: fn => fn, useEffect: () => {}, useRef: value => ({ current: value }) }));
import { useItemActions } from "../useItemActions.js";
import { getIdentKey, splashPotion, applyFoodEffectsOnHit } from "../items.js";
import { clearPlayerPoison } from "../statusDuration.js";
import { makePlayer, makeEmptyDg } from "./helpers.js";
import { MW, MH } from "../utils.js";

function treat(route, player, messages) {
  const dungeon = makeEmptyDg({
    visible: Array.from({ length: MH }, () => Array(MW).fill(false)),
    explored: Array.from({ length: MH }, () => Array(MW).fill(false)),
  });
  const food = { type: "food", name: "解毒成分付きパン", cooked: true, value: 20, potionEffects: ["c_poison"] };
  if (route === "薬液") splashPotion(dungeon, player.x, player.y, "poison", 15, player, messages, () => {}, false, true);
  else if (route === "食料命中") applyFoodEffectsOnHit(food, "player", player, dungeon, player, messages, () => {});
  else {
    const item = route === "飲用" ? { type: "potion", name: "毒薬", effect: "poison", value: 15, cursed: true } : food;
    player.inventory = [item];
    useItemActions({
      sr: { current: { player, dungeon, ident: new Set([getIdentKey(item)].filter(Boolean)) } },
      endTurn: vi.fn(), dnameRef: item => item.name, setGs: vi.fn(),
      setMsgs: fn => messages.push(...fn([])), setShowInv: vi.fn(), setSelIdx: vi.fn(), setShowDesc: vi.fn(),
    }).doUseItem(0);
  }
}

describe.each(["飲用", "薬液", "食事", "食料命中"])("呪い毒薬の解毒: %s", route => {
  it.each([
    { poisoned: false, poisonedTurns: 0, poisonAtkLoss: 2, atk: 8 },
    { poisoned: true, poisonedTurns: 3, poisonAtkLoss: 2, atk: 8 },
    { poisoned: false, poisonedTurns: 0, poisonAtkLoss: 0, atk: 10 },
  ])("毒の継続中・終了後・健康状態%jを同じ基準で処理する", status => {
    const player = makePlayer({ hunger: 0, ...status });
    const messages = [];
    treat(route, player, messages);
    expect(player).toMatchObject({ atk: 10, poisoned: false, poisonedTurns: 0, poisonAtkLoss: 0 });
    if (status.poisonAtkLoss > 0) expect(messages.some(message => message.includes("攻撃力も回復"))).toBe(true);
    treat(route, player, []);
    expect(player.atk).toBe(10);
  });
});

it("共通解毒は攻撃力低下だけでも治療成功を返し、重複回復しない", () => {
  const player = makePlayer({ atk: 8, poisonAtkLoss: 2, poisonSourceName: "毒の敵" });
  expect(clearPlayerPoison(player)).toBe(true);
  expect(player.atk).toBe(10);
  expect(player.poisonSourceName).toBeUndefined();
  expect(clearPlayerPoison(player)).toBe(false);
  expect(player.atk).toBe(10);
});
