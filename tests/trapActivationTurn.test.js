import { afterEach, describe, expect, it, vi } from "vitest";
import { fireTrapPlayer } from "../traps.js";
import { fireTrapItem, placeItemAt, doExplosion, runMineExplosion, mineExplosionPending } from "../items.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { finishTrapActivationTurn } from "../trapActivationTurn.js";
import { resolveTurnHazards } from "../turnHazards.js";
import { beginPlayerTurnClock } from "../actionClock.js";

afterEach(() => vi.restoreAllMocks());

describe("同じ罠は1ターンに1回", () => {
  it("別々の道具配置が同じ地雷に当たっても、爆発とダメージは1回だけ", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const player = makePlayer();
    const trap = { id: "mine", name: "地雷", effect: "explode", x: 5, y: 5 };
    const dungeon = makeEmptyDg({ traps: [trap] });
    const messages = [];
    for (const id of ["first", "second"]) {
      placeItemAt(dungeon, 5, 5, { id, name: "短剣", type: "weapon" }, messages, new Set(), 0, player);
    }
    expect(messages.filter(message => message.includes("地雷が発動"))).toHaveLength(1);
    expect(player.hp).toBe(50);
    expect(dungeon.items.map(item => item.id)).toEqual(["second"]);
  });

  it("踏む・道具・敵の内部トリガーで発動記録を共有する", () => {
    const player = makePlayer({ mp: 20 });
    const trap = { id: "mp", name: "MP吸収の罠", effect: "mp_absorb_trap", x: 5, y: 5, permanent: true };
    const dungeon = makeEmptyDg({ traps: [trap] });
    const messages = [];
    fireTrapPlayer(trap, player, dungeon, messages);
    fireTrapItem(trap, { name: "石", type: "stone" }, dungeon, 5, 5, messages, new Set(), player);
    fireTrapItem(trap, { name: "重力の力", _ephemeralTrapTrigger: true }, dungeon, 5, 5, messages, new Set(), player);
    expect(player.mp).toBe(15);
    expect(messages.filter(message => message.includes("が発動"))).toHaveLength(1);
  });

  it("別々の爆発で同じ地雷が範囲に入っても、誘爆は1回だけ", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const player = makePlayer({ x: 20, y: 20 });
    const trap = { id: "mine", name: "地雷", effect: "explode", x: 5, y: 5 };
    const dungeon = makeEmptyDg({ traps: [trap] });
    const messages = [];
    doExplosion(4, 5, dungeon, player, messages);
    doExplosion(4, 5, dungeon, player, messages);
    expect(messages.filter(message => message.includes("地雷が誘爆"))).toHaveLength(1);
  });

  it("踏んで予約した地雷は道具で再起動せず、遅延爆発を1回だけ実行する", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const player = makePlayer();
    const trap = { id: "mine", name: "地雷", effect: "explode", x: 5, y: 5 };
    const dungeon = makeEmptyDg({ traps: [trap] });
    const messages = [];
    fireTrapPlayer(trap, player, dungeon, messages);
    const pending = dungeon._pendingMineExplosion;
    fireTrapItem(trap, { name: "石", type: "stone" }, dungeon, 5, 5, messages, new Set(), player);
    expect(player.hp).toBe(100);
    runMineExplosion(dungeon, pending, player, messages);
    runMineExplosion(dungeon, mineExplosionPending(trap), player, messages);
    expect(player.hp).toBe(50);
  });

  it("プレイヤー時計が進んでも敵処理中は再起動せず、ターン終了後は発動できる", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const player = makePlayer({ actionTime: 0, hasteTurns: 10, hasteSpeed: 3 });
    const trap = { id: "mp", name: "MP吸収の罠", effect: "mp_absorb_trap", x: 5, y: 5, permanent: true };
    player.mp = 20;
    const dungeon = makeEmptyDg({ traps: [trap] });
    fireTrapPlayer(trap, player, dungeon, []);
    beginPlayerTurnClock(player);
    fireTrapPlayer(trap, player, dungeon, []);
    expect(player.actionTime).toBe(4);
    expect(player.mp).toBe(15);
    finishTrapActivationTurn({ dungeon });
    fireTrapPlayer(trap, player, dungeon, []);
    expect(player.mp).toBe(10);
  });

  it("別の罠は同じターンでも発動し、階移動前の記録もターン終了で解放する", () => {
    const player = makePlayer({ mp: 30 });
    const first = { id: "first", name: "MP吸収の罠", effect: "mp_absorb_trap", permanent: true };
    const second = { ...first, id: "second" };
    const oldFloor = makeEmptyDg({ traps: [first, second] });
    const currentFloor = makeEmptyDg();
    fireTrapPlayer(first, player, oldFloor, []);
    fireTrapPlayer(second, player, oldFloor, []);
    expect(player.mp).toBe(20);
    finishTrapActivationTurn({ dungeon: currentFloor, floors: { 1: oldFloor } });
    fireTrapPlayer(first, player, oldFloor, []);
    expect(player.mp).toBe(15);
  });

  it("予約した地雷が先に誘爆して消えても、遅延処理で二度目の爆発をしない", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = makePlayer({ x: 20, y: 20 });
    const trap = { id: "mine", name: "地雷", effect: "explode", x: 5, y: 5 };
    const dungeon = makeEmptyDg({ traps: [trap] });
    const messages = [];
    fireTrapPlayer(trap, player, dungeon, messages);
    doExplosion(4, 5, dungeon, player, messages);
    expect(dungeon.traps).not.toContain(trap);
    const before = messages.length;
    resolveTurnHazards({ dungeon }, player, messages, {
      hasRingEffect: () => false, runMineExplosion, doExplosion,
    });
    expect(messages).toHaveLength(before);
    expect(dungeon._pendingMineExplosion).toBeUndefined();
  });

  it("発動済みの回転板の遅延処理では、再移動も敵攻撃キャンセルもしない", () => {
    const player = makePlayer();
    const trap = { id: "spin", name: "回転板", effect: "spin", x: 5, y: 5, permanent: true };
    const dungeon = makeEmptyDg({ traps: [trap] });
    const messages = [];
    fireTrapPlayer(trap, player, dungeon, messages);
    const position = { x: player.x, y: player.y };
    const before = messages.length;
    const result = resolveTurnHazards({ dungeon, _pendingSpin: trap }, player, messages, {
      hasRingEffect: () => false, fireTrapPlayer,
    });
    expect(result.spinFired).toBe(false);
    expect({ x: player.x, y: player.y }).toEqual(position);
    expect(messages).toHaveLength(before);
  });
});
