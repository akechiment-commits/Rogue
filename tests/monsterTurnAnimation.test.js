import { describe, expect, it } from "vitest";
import {
  collectMonsterAttackEvents,
  collectMonsterMoves,
  createMonsterTurnAnimation,
  snapshotMonsterPositions,
} from "../monsterTurnAnimation.js";

describe("monster turn animation", () => {
  it("移動した等速の敵だけを記録し、攻撃不可の印を付ける", () => {
    const walker = { id: "w", x: 2, y: 2, tile: 4, hp: 10, maxHp: 10, speed: 1 };
    const fast = { id: "f", x: 4, y: 2, tile: 5, hp: 10, maxHp: 10, speed: 2 };
    const stationary = { id: "s", x: 8, y: 8, tile: 6, hp: 10, maxHp: 10 };
    const monsters = [walker, fast, stationary];
    const snapshot = snapshotMonsterPositions(monsters);
    walker.x = 3;
    fast.y = 3;
    const animation = createMonsterTurnAnimation();

    collectMonsterMoves(animation, monsters, snapshot);

    expect(animation.moves).toHaveLength(2);
    expect(animation.moves[0]).toMatchObject({ id: "w", fromX: 2, toX: 3 });
    expect(walker._movedThisTurn).toBe(true);
    expect(fast._movedThisTurn).toBeUndefined();
  });

  it("実ダメージ時だけ攻撃フラッシュを加え、命中・突進を記録する", () => {
    const animation = createMonsterTurnAnimation();
    const events = [{ type: "damage", x: 5, y: 5, value: 3 }];
    const lunges = [{ id: "w", fromX: 4, toX: 5 }];

    collectMonsterAttackEvents(animation, events, lunges, true, { x: 5, y: 5, hp: 7 });

    expect(animation.attacks).toEqual([{ type: "flash", x: 5, y: 5, color: "#ff4400" }]);
    expect(animation.damages).toEqual(events);
    expect(animation.lunges).toEqual(lunges);
  });
});
