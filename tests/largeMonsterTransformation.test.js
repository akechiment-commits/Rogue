import { afterEach, describe, expect, it, vi } from 'vitest';
import { MONS, makeMonsterFromBase, pickTransformMonsterDef } from '../monsters.js';
import { applyWandEffect } from '../wands.js';
import { applySpellEffect } from '../items.js';
import { monsterOccupiesCell } from '../monsterGeometry.js';
import { T, resolveRuntimeSpawnPoolFloor } from '../utils.js';
import { makeEmptyDg, makePlayer } from './helpers.js';

afterEach(() => vi.restoreAllMocks());
const modes = [
  ['杖', (...args) => applyWandEffect('transform', ...args)],
  ['魔法', (...args) => applySpellEffect('transform_magic', ...args)],
];

function setup(playerPosition = { x: 2, y: 2 }) {
  const target = makeMonsterFromBase(MONS[0], 1, 10, 10);
  const dg = makeEmptyDg({ monsters: [target], dungeonType: 'intermediate' });
  const p = makePlayer({ depth: 19, ...playerPosition });
  const random = vi.spyOn(Math, 'random');
  const poolFloor = resolveRuntimeSpawnPoolFloor(dg, p.depth);
  let selected;
  for (let i = 0; i < 1000; i++) {
    random.mockReturnValue(i / 1000);
    selected = pickTransformMonsterDef(p.depth, dg.dungeonType, 1, 0, { poolFloor });
    if (selected.baseKind === 'hauntedWillow') break;
  }
  expect(selected.baseKind).toBe('hauntedWillow');
  return { target, dg, p, logs: [] };
}

describe('巨大敵への変化は拡大後の体の空きを確認する', () => {
  it.each(modes)('%s: 広がった体がプレイヤーに重なる場合は変化しない', (_, transform) => {
    const { target, dg, p, logs } = setup({ x: 11, y: 10 });
    const before = structuredClone(target);
    transform('monster', target, -1, 0, dg, p, logs, () => {});
    expect(target).toEqual(before);
    expect(monsterOccupiesCell(target, p.x, p.y)).toBe(false);
    expect(logs).toContain('体を広げる場所がなく、変化できなかった。');
  });

  it.each(modes)('%s: 広がった体が別の敵に重なる場合は変化しない', (_, transform) => {
    const { target, dg, p, logs } = setup();
    const neighbor = makeMonsterFromBase(MONS[0], 1, 11, 11);
    dg.monsters.push(neighbor);
    const before = structuredClone(target);
    transform('monster', target, 1, 0, dg, p, logs, () => {});
    expect(target).toEqual(before);
    expect(monsterOccupiesCell(target, neighbor.x, neighbor.y)).toBe(false);
  });

  it.each(modes)('%s: 空いていれば元の座標で柳へ変化し、壁に体の端を置ける', (_, transform) => {
    const { target, dg, p, logs } = setup();
    const id = target.id;
    dg.map[11][11] = T.WALL;
    transform('monster', target, 1, 0, dg, p, logs, () => {});
    expect(target).toMatchObject({ id, x: 10, y: 10, baseKind: 'hauntedWillow', bodySize: 2 });
    expect(monsterOccupiesCell(target, 11, 11)).toBe(true);
    expect(logs.some(log => log.includes('変化した！'))).toBe(true);
  });

  it.each(modes)('%s: 別の巨大敵の中心ではなく体の端との重なりも防ぐ', (_, transform) => {
    const { target, dg, p, logs } = setup();
    const neighbor = { ...makeMonsterFromBase(MONS[0], 1, 12, 12), bodySize: 3 };
    dg.monsters.push(neighbor);
    const before = structuredClone(target);
    transform('monster', target, 1, 0, dg, p, logs, () => {});
    expect(target).toEqual(before);
    expect(logs).toContain('体を広げる場所がなく、変化できなかった。');
  });
});
