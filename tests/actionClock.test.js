import { describe, expect, it } from "vitest";
import {
  ACTION_TIME_BASE,
  actionCost,
  beginPlayerTurnClock,
  dueActionCount,
  finishPlayerTurnClock,
  grantPlayerHaste,
  maintainPlayerHaste,
  takeDueActions,
} from "../actionClock.js";

function playSequence(playerSpeed, enemySpeed, playerActions) {
  const player = {
    hasteTurns: playerSpeed >= 2 ? 99 : 0,
    actionTime: 0,
  };
  const enemy = { actionTime: 0 };
  const log = [];
  for (let i = 0; i < playerActions; i++) {
    if (playerSpeed !== 2) {
      player.actionTime = (player.actionTime || 0) + actionCost(playerSpeed);
    } else {
      beginPlayerTurnClock(player);
    }
    log.push("P");
    const due = takeDueActions(enemy, player.actionTime, enemySpeed);
    for (let n = 0; n < due; n++) log.push("E");
  }
  return log.join("");
}

describe("actionClock", () => {
  it("速度ごとの行動コストは12を割った値", () => {
    expect(actionCost(1)).toBe(12);
    expect(actionCost(2)).toBe(6);
    expect(actionCost(3)).toBe(4);
    expect(actionCost(0.5)).toBe(24);
  });

  it("2倍速対等速は自分が先に2回動いてから敵が1回", () => {
    expect(playSequence(2, 1, 2)).toBe("PPE");
    expect(playSequence(2, 1, 4)).toBe("PPEPPE");
  });

  it("同じ速さは交互", () => {
    expect(playSequence(1, 1, 3)).toBe("PEPEPE");
    expect(playSequence(2, 2, 4)).toBe("PEPEPEPE");
    expect(playSequence(3, 3, 3)).toBe("PEPEPE");
  });

  it("敵の方が速い余りは後ろに付く", () => {
    expect(playSequence(1, 2, 1)).toBe("PEE");
    expect(playSequence(2, 3, 2)).toBe("PEPEE");
  });

  it("自分が3倍速なら余りは先に出る", () => {
    expect(playSequence(3, 1, 3)).toBe("PPPE");
    expect(playSequence(3, 2, 3)).toBe("PPEPE");
  });

  it("倍速になった行動は敵を全員止め、次の1歩は等速だけ動かない", () => {
    const player = { hasteTurns: 0, actionTime: 0 };
    const normal = { actionTime: 0 };
    const hasteEnemy = { actionTime: 0 };
    const triple = { actionTime: 0 };

    grantPlayerHaste(player, 10);
    beginPlayerTurnClock(player);
    const freeze = finishPlayerTurnClock(player, [normal, hasteEnemy, triple]);
    expect(freeze).toBe(true);
    expect(player.actionTime).toBe(ACTION_TIME_BASE);
    expect(takeDueActions(normal, player.actionTime, 1)).toBe(0);
    expect(takeDueActions(hasteEnemy, player.actionTime, 2)).toBe(0);
    expect(takeDueActions(triple, player.actionTime, 3)).toBe(0);

    beginPlayerTurnClock(player);
    expect(player.actionTime).toBe(18);
    expect(takeDueActions(normal, player.actionTime, 1)).toBe(0);
    expect(takeDueActions(hasteEnemy, player.actionTime, 2)).toBe(1);
    expect(takeDueActions(triple, player.actionTime, 3)).toBe(1);

    beginPlayerTurnClock(player);
    expect(player.actionTime).toBe(24);
    expect(takeDueActions(normal, player.actionTime, 1)).toBe(1);
    expect(takeDueActions(hasteEnemy, player.actionTime, 2)).toBe(1);
    expect(takeDueActions(triple, player.actionTime, 3)).toBe(2);
  });

  it("既に倍速の延長では凍結しない", () => {
    const player = { hasteTurns: 4, actionTime: 0 };
    expect(grantPlayerHaste(player, 10)).toBe(true);
    expect(player._hasteGrantFreeze).toBeFalsy();
    expect(player.hasteTurns).toBe(14);
  });

  it("等速の魔方陣で新たに倍速になると凍結する", () => {
    const player = { hasteTurns: 0 };
    expect(maintainPlayerHaste(player, 2)).toBe(true);
    expect(player._hasteGrantFreeze).toBe(true);
    expect(maintainPlayerHaste(player, 2)).toBe(false);
  });

  it("倍速の追加行動では世界時間が進まない", () => {
    const player = { hasteTurns: 10, actionTime: 0 };
    expect(beginPlayerTurnClock(player).worldTicks).toBe(0);
    expect(beginPlayerTurnClock(player).worldTicks).toBe(1);
  });

  it("睡眠などの空き拍は等速コストで世界時間を進める", () => {
    const player = { hasteTurns: 10, actionTime: 6 };
    const clock = beginPlayerTurnClock(player, { idleBeat: true });
    expect(clock.cost).toBe(ACTION_TIME_BASE);
    expect(clock.worldTicks).toBe(1);
    expect(dueActionCount({ actionTime: 6 }, player.actionTime, 1)).toBe(1);
  });
});
