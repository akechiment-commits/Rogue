import { afterEach, describe, expect, it, vi } from 'vitest';
import { MONS, makeMonsterFromBase, pickTransformMonsterDef, spawnMonsters, monsterAI } from '../monsters.js';
import { applyWandEffect } from '../wands.js';
import { applySpellEffect, convertRoomFloorItemsToMonsters, multiplyRoomMonsters } from '../items.js';
import { monsterBodySize } from '../monsterGeometry.js';
import { resolveRuntimeSpawnPoolFloor } from '../utils.js';
import { makeEmptyDg, makePlayer } from './helpers.js';

afterEach(() => vi.restoreAllMocks());
const modes = [
  ['杖', (...args) => applyWandEffect('transform', ...args)],
  ['魔法', (...args) => applySpellEffect('transform_magic', ...args)],
];

describe('大型モンスターの変化・召喚・敵投げ制限', () => {
  it.each([
    ['intermediate', 19],
    ['advanced', 23],
    ['legend', 25],
  ])('変化抽選(%s %sF)では大型モンスターが出現しない', (dungeonType, depth) => {
    const dg = makeEmptyDg({ dungeonType });
    const poolFloor = resolveRuntimeSpawnPoolFloor(dg, depth);
    const random = vi.spyOn(Math, 'random');
    for (let i = 0; i < 200; i++) {
      random.mockReturnValue(i / 200);
      const selected = pickTransformMonsterDef(depth, dungeonType, 1, 0, { poolFloor });
      expect(monsterBodySize(selected)).toBe(1);
    }
  });

  it.each(modes)('%s: 大型モンスター自身を変化させると通常サイズ(1x1)の敵になる', (_, transform) => {
    const willowBase = MONS.find(m => m.baseKind === 'hauntedWillow');
    const target = makeMonsterFromBase(willowBase, 1, 10, 10);
    const dg = makeEmptyDg({ monsters: [target], dungeonType: 'intermediate' });
    const p = makePlayer({ depth: 19, x: 2, y: 2 });
    const logs = [];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    transform('monster', target, 1, 0, dg, p, logs, () => {});
    expect(monsterBodySize(target)).toBe(1);
    expect(target.bodySize).toBeUndefined();
    expect(logs.some(log => log.includes('変化した！'))).toBe(true);
  });

  it('召喚・部屋分裂・道具魔物化では大型モンスターが出現しない', () => {
    const room = { x: 2, y: 2, w: 12, h: 12 };
    const willowBase = MONS.find(m => m.baseKind === 'hauntedWillow');
    const lionBase = MONS.find(m => m.baseKind === 'sleepingLion');
    const dg = makeEmptyDg({
      rooms: [room],
      dungeonType: 'advanced',
      monsters: [
        makeMonsterFromBase(willowBase, 1, 4, 4),
        makeMonsterFromBase(lionBase, 1, 8, 4),
      ],
      items: [{ id: 'it1', name: '回復薬', type: 'potion', x: 6, y: 6 }],
    });
    const p = makePlayer({ x: 3, y: 3, depth: 23 });
    const logs = [];

    const splitCount = multiplyRoomMonsters(dg, 4, 4, logs, p);
    expect(splitCount).toBe(0);

    spawnMonsters(dg, 12, 22, p.x, p.y, p, { aware: true, poolFloor: 23 });
    convertRoomFloorItemsToMonsters(dg, 6, 6, p, logs);

    const newlySpawned = dg.monsters.slice(2);
    expect(newlySpawned.length).toBeGreaterThan(0);
    expect(newlySpawned.every(m => monsterBodySize(m) === 1)).toBe(true);
  });

  it('かいりきベア(monsterthrow)は隣接する大型モンスターを投げない', () => {
    const bearBase = MONS.find(m => m.baseKind === 'monsterthrow');
    const lionBase = MONS.find(m => m.baseKind === 'sleepingLion');
    const bear = makeMonsterFromBase(bearBase, 1, 5, 5, { aware: true });
    bear.alwaysUseSpecial = true;
    const lion = makeMonsterFromBase(lionBase, 1, 6, 5, { aware: true });
    const dg = makeEmptyDg({ monsters: [bear, lion] });
    const p = makePlayer({ x: 5, y: 7 });
    const logs = [];

    monsterAI(bear, dg, p, logs, { attackOnly: true });

    expect([lion.x, lion.y]).toEqual([6, 5]);
    expect(logs.some(l => l.includes('投げた'))).toBe(false);
  });
});
