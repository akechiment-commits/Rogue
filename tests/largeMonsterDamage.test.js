import { describe, it, expect } from "vitest";
import {
  blockLargeMonsterDamage,
  withLargeMonsterDamageTurn,
  withLargeMonsterDamageEvent,
  newDamageEventToken,
} from "../largeMonsterDamage.js";

describe("blockLargeMonsterDamage", () => {
  it("通常サイズの非ボス敵はブロックしない", () => {
    const mob = { name: "ゴブリン", hp: 10 };
    const player = { turns: 5 };
    const messages = [];
    expect(blockLargeMonsterDamage(mob, player, messages)).toBe(false);
    expect(blockLargeMonsterDamage(mob, player, messages)).toBe(false);
  });

  it("小型ボス（サイズ1）はブロックしない（倍速行動での多段攻撃や火薬壺を妨げない）", () => {
    const smallBoss = { name: "グウェン", hp: 80, isBoss: true };
    const player = { turns: 5 };
    const messages = [];
    expect(blockLargeMonsterDamage(smallBoss, player, messages)).toBe(false);
    expect(blockLargeMonsterDamage(smallBoss, player, messages)).toBe(false);
  });

  it("同一イベント内では重複ヒットを防ぐが、別の爆発（倍速投擲など）はそれぞれ正常に通る", () => {
    const largeMob = { name: "ドラゴン", hp: 500, bodySize: 2 };
    const player = { turns: 5 };
    const messages = [];

    // 1個目の爆弾の爆発 (explosion 1)
    const evt1 = newDamageEventToken("explosion");
    withLargeMonsterDamageEvent(evt1, () => {
      // 1マス目の被弾: ダメージ適用
      expect(blockLargeMonsterDamage(largeMob, player, messages)).toBe(false);
      // 同じ爆風が2マス目にも重なる: 重複ブロック
      expect(blockLargeMonsterDamage(largeMob, player, messages)).toBe(true);
    });
    expect(messages).toContain("ドラゴンは爆発・割合ダメージの追加分を防いだ！");

    // 倍速行動で同じターン内に2個目の爆弾を投擲 (explosion 2)
    const evt2 = newDamageEventToken("explosion");
    withLargeMonsterDamageEvent(evt2, () => {
      // 2個目の爆弾の被弾: 別イベントなので正常にダメージ適用
      expect(blockLargeMonsterDamage(largeMob, player, messages)).toBe(false);
      // 2個目の爆風の重複マス: 重複ブロック
      expect(blockLargeMonsterDamage(largeMob, player, messages)).toBe(true);
    });
  });

  it("イベントトークンなしのフォールバック時（ターンUpkeepなど）は同ターン2回目をブロックする", () => {
    const largeMob = { name: "キングベヒんもス", hp: 1200, bodySize: 3, isBoss: true };
    const player = { turns: 10 };
    const messages = [];
    expect(blockLargeMonsterDamage(largeMob, player, messages)).toBe(false);
    expect(blockLargeMonsterDamage(largeMob, player, messages)).toBe(true);
    expect(messages).toContain("キングベヒんもスはこのターン、爆発・割合ダメージの追加分を防いだ！");
  });
});
