import { describe, expect, it } from "vitest";
import {
  applySakeEffect,
  DRUNKEN_COMA_TURNS,
  drunkenVomitDamage,
  isAlcoholDirectionRandomized,
  shouldVomit,
} from "../intoxication.js";

describe("酒による酔いと酩酊", () => {
  it("再度酒を受けると酔いから酩酊へ切り替わり、祝福で時間が倍になる", () => {
    const player = {};
    expect(applySakeEffect(player)).toMatchObject({ status: "drunk", turns: 30 });
    expect(applySakeEffect(player)).toMatchObject({ status: "drunken", turns: 30 });
    expect(player).toMatchObject({ drunkTurns: 0, drunkenTurns: 30 });

    const blessedPlayer = {};
    expect(applySakeEffect(blessedPlayer, { blessed: true })).toMatchObject({ status: "drunk", turns: 60 });
  });

  it("酩酊中にさらに酒を受けると20ターン昏睡し、酩酊は続く", () => {
    const player = { drunkenTurns: 17, drunkTurns: 0 };
    expect(applySakeEffect(player, { blessed: true })).toMatchObject({ status: "coma", turns: DRUNKEN_COMA_TURNS });
    expect(player).toMatchObject({ sleepTurns: 20, drunkenTurns: 17, drunkTurns: 0 });
  });

  it("ボスの酔いと酩酊は通常時間の半分になる", () => {
    const boss = { isBoss: true };
    expect(applySakeEffect(boss, { kind: "monster", target: boss })).toMatchObject({ status: "drunk", turns: 15 });
    expect(applySakeEffect(boss, { kind: "monster", target: boss, blessed: true })).toMatchObject({ status: "drunken", turns: 30 });
  });

  it("呪われた酒は酔い・酩酊・混乱を解除する", () => {
    const player = { drunkTurns: 4, drunkenTurns: 0, confusedTurns: 2 };
    expect(applySakeEffect(player, { cursed: true })).toMatchObject({
      status: "cured",
      cleared: ["酔い", "混乱"],
    });
    expect(player).toMatchObject({ drunkTurns: 0, drunkenTurns: 0, confusedTurns: 0 });
  });

  it("酔いは1/8で方向が乱れ、酩酊は毎回乱れる", () => {
    const drunk = { drunkTurns: 10 };
    expect(isAlcoholDirectionRandomized(drunk, () => 0.124)).toBe(true);
    expect(isAlcoholDirectionRandomized(drunk, () => 0.125)).toBe(false);
    expect(isAlcoholDirectionRandomized({ drunkenTurns: 1 }, () => 0.99)).toBe(true);
    expect(isAlcoholDirectionRandomized({}, () => 0)).toBe(false);
  });

  it("酩酊中だけ5%で嘔吐し、敵への自傷は現HPの10%", () => {
    expect(shouldVomit({ drunkenTurns: 2 }, () => 0.049)).toBe(true);
    expect(shouldVomit({ drunkenTurns: 2 }, () => 0.05)).toBe(false);
    expect(shouldVomit({ drunkTurns: 2 }, () => 0)).toBe(false);
    expect(drunkenVomitDamage(99)).toBe(9);
    expect(drunkenVomitDamage(5)).toBe(1);
  });
});
