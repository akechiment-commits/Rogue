import { afterEach, describe, expect, it, vi } from "vitest";
import { applySpellEffect } from "../items.js";
import { MONS, KING_BEHINMOS, makeMonsterFromBase } from "../monsters.js";
import { monsterBodiesOverlap, monsterOccupiesCell } from "../monsterGeometry.js";
import { MW, MH, T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());
function setup(size, obstacle, safeDestination = true) {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const base = size === 2 ? MONS.find(monster => monster.baseKind === "sleepingLion") : KING_BEHINMOS;
  const target = makeMonsterFromBase(base, 25, 10, 10);
  const other = makeMonsterFromBase(MONS.find(monster => monster.baseKind === "goblin"), 1, 5, 5);
  const player = makePlayer(obstacle === "player" ? { x: 5, y: 5 } : { x: 15, y: 15 });
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
  map[4][4] = T.FLOOR;
  if (safeDestination) map[20][20] = T.FLOOR;
  map[10][10] = T.FLOOR;
  const dungeon = makeEmptyDg({ map, monsters: obstacle === "player" ? [target] : [target, other] });
  return { target, other, player, dungeon, messages: [] };
}
function teleport(context) {
  const { target, player, dungeon, messages } = context;
  applySpellEffect("teleport_other", "monster", target, 1, 0, dungeon, player, messages, () => {});
}
describe("テレポートアザーの体全体の配置判定", () => {
  for (const size of [2, 3]) {
    it.each(["player", "monster"])(`${size}×${size}の体が%sに重なる候補を避ける`, obstacle => {
      const context = setup(size, obstacle);
      teleport(context);
      expect([context.target.x, context.target.y]).toEqual([20, 20]);
      expect(monsterOccupiesCell(context.target, context.player.x, context.player.y)).toBe(false);
      if (obstacle === "monster") expect(monsterBodiesOverlap(context.target, context.other)).toBe(false);
    });
    it.each(["player", "monster"])(`${size}×${size}の安全な転送先がなければ元の位置を保つ: %s`, obstacle => {
      const context = setup(size, obstacle, false);
      teleport(context);
      expect([context.target.x, context.target.y]).toEqual([10, 10]);
      expect(context.messages).toContain("テレポートに失敗した。");
    });
  }
  it("1マスの敵は隣接するキャラと重ならなければ転送できる", () => {
    const context = setup(2, "player");
    delete context.target.bodySize;
    teleport(context);
    expect([context.target.x, context.target.y]).toEqual([4, 4]);
  });
  it("強制移動無効の敵は動かない", () => {
    const context = setup(2, "player");
    context.target.forcedMoveImmune = true;
    teleport(context);
    expect([context.target.x, context.target.y]).toEqual([10, 10]);
    expect(context.messages).toContain(`${context.target.name}は強制移動を受けない！`);
  });
});
