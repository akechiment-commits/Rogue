import { describe, expect, it } from "vitest";
import { advanceForcedTurn, hasForcedTurn, interruptPlayerSleep } from "../turnUpkeep.js";

describe("ダメージで起きた睡眠", () => {
  it("目覚めた直後は追加で1ターン行動できない", () => {
    const player = { sleepTurns: 4 };
    const messages = [];

    expect(interruptPlayerSleep(player, messages)).toBe(true);
    expect(player).toMatchObject({ sleepTurns: 0, sleepInterruptedTurns: 1 });
    expect(hasForcedTurn(player)).toBe(true);
    expect(advanceForcedTurn(player, messages)).toEqual({ advanced: true, exitPotAfterTurn: false });
    expect(player.sleepInterruptedTurns).toBe(0);
    expect(messages).toEqual(["衝撃で目が覚めた！", "目が覚めたが、体が動かなかった！"]);
  });
});
