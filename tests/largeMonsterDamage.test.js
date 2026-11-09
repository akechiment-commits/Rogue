import { describe, it, expect } from "vitest";
import { blockLargeMonsterDamage, withLargeMonsterDamageTurn } from "../largeMonsterDamage.js";

describe("blockLargeMonsterDamage", () => {
  it("通常サイズの非ボス敵はブロックしない", () => {
    const mob = { name: "ゴブリン", hp: 10 };
    const player = { turns: 5 };
    const messages = [];
    expect(blockLargeMonsterDamage(mob, player, messages)).toBe(false);
    expect(blockLargeMonsterDamage(mob, player, messages)).toBe(false);
  });

  it("大型モンスターは同ターン2回目以降の爆発・割合ダメージをブロックする", () => {
    const largeMob = { name: "ドラゴン", hp: 100, bodySize: 2 };
    const player = { turns: 5 };
    const messages = [];
    expect(blockLargeMonsterDamage(largeMob, player, messages)).toBe(false);
    expect(blockLargeMonsterDamage(largeMob, player, messages)).toBe(true);
    expect(messages).toContain("ドラゴンはこのターン、爆発・割合ダメージの追加分を防いだ！");
  });

  it("小型ボス（サイズ1）も同ターン2回目以降の爆発・割合ダメージをブロックする", () => {
    const smallBoss = { name: "グウェン", hp: 80, isBoss: true };
    const player = { turns: 5 };
    const messages = [];
    expect(blockLargeMonsterDamage(smallBoss, player, messages)).toBe(false);
    expect(blockLargeMonsterDamage(smallBoss, player, messages)).toBe(true);
    expect(messages).toContain("グウェンはこのターン、爆発・割合ダメージの追加分を防いだ！");
  });
});
