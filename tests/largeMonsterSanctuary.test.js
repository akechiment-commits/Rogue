import { describe, it, expect } from "vitest";
import { bfsNext, monsterBodyOverlapsSanctuary } from "../monsters.js";
import { MW, MH, T } from "../utils.js";

describe("大型モンスターと聖域の重なり", () => {
  it("体のマスが聖域に触れる配置は、基準マスが外れていても重なりと判定する", () => {
    const dg = { pentacles: [{ kind: "sanctuary", x: 8, y: 11 }] };
    const big = { x: 6, y: 10, bodySize: 2 };
    // 基準マス (7,10) の体は (7,10)(8,10)(7,11)(8,11) で聖域 (8,11) を含む
    expect(monsterBodyOverlapsSanctuary(dg, big, 7, 10)).toBe(true);
    // 基準マス (5,10) の体は x 5-6 で聖域に触れない
    expect(monsterBodyOverlapsSanctuary(dg, big, 5, 10)).toBe(false);
    // 通常サイズは基準マスだけを見る
    const small = { x: 7, y: 10, bodySize: 1 };
    expect(monsterBodyOverlapsSanctuary(dg, small, 7, 10)).toBe(false);
    expect(monsterBodyOverlapsSanctuary(dg, small, 8, 11)).toBe(true);
  });

  it("細い通路では、体が聖域に触れる経路しかない大型は進めない", () => {
    const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
    for (let x = 4; x <= 13; x++) { map[10][x] = T.FLOOR; map[11][x] = T.FLOOR; }
    const self = { x: 5, y: 10, bodySize: 2 };
    const pentacles = [{ kind: "sanctuary", x: 8, y: 11 }];
    const canEnterFloor = (x, y) => map[y]?.[x] === T.FLOOR;
    const blocked = bfsNext(map, [self], 5, 10, 12, 10, self, 40, pentacles, false, canEnterFloor, false, null, { pentacles });
    expect(blocked).toBeNull();
    const open = bfsNext(map, [self], 5, 10, 12, 10, self, 40, [], false, canEnterFloor, false, null, { pentacles: [] });
    expect(open).not.toBeNull();
  });
});
