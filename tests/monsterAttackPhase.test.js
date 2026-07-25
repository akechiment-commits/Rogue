import { describe, expect, it } from "vitest";
import { runMonsterAttackPhase } from "../monsterAttackPhase.js";

describe("runMonsterAttackPhase", () => {
  it("命中と回避を描画用イベントへ変換する", () => {
    const player = { x: 5, y: 5, hp: 20 };
    const monster = { id: "m", tile: 7, x: 4, y: 5, hp: 8, maxHp: 8 };
    const result = runMonsterAttackPhase({}, player, [], {
      moveMons: (_dungeon, _player, _messages, phase, callbacks) => {
        expect(phase).toBe("attackOnly");
        callbacks.onPlayerHit(3, monster);
        callbacks.onPlayerMiss(monster);
      },
    });

    expect(result.hadActualHit).toBe(true);
    expect(result.hitEvents).toEqual([
      { type: "damage", x: 5, y: 5, value: 3, color: "#ff6644" },
      { type: "miss", x: 5, y: 5 },
    ]);
    expect(result.lunges).toHaveLength(2);
  });

  it("初回訪問と回転板のターンは攻撃を実行しない", () => {
    let called = false;
    const result = runMonsterAttackPhase({}, { x: 5, y: 5, hp: 20 }, [], {
      spinFired: true,
      moveMons: () => { called = true; },
    });
    expect(called).toBe(false);
    expect(result).toEqual({ hitEvents: [], lunges: [], hadActualHit: false });
  });
});
