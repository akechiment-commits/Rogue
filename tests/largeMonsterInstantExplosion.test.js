import { afterEach, describe, expect, it, vi } from 'vitest';
import { MONS, makeMonsterFromBase } from '../monsters.js';
import { doExplosion, doGunpowderExplosion, doTimeBombExplosion, killMonster } from '../items.js';
import { makeEmptyDg, makePlayer } from './helpers.js';

afterEach(() => vi.restoreAllMocks());

const explosions = [
  ['火薬壺', (dg, p, logs) => doGunpowderExplosion(10, 10, dg, p, logs, () => {})],
  ['時限爆弾', (dg, p, logs) => doTimeBombExplosion(10, 10, dg, p, logs, () => {})],
  ['撃破による爆発の魔方陣', (dg, p, logs) => {
    const source = { id: 'source', name: '爆発元', x: 9, y: 10, hp: 0, exp: 0 };
    dg.monsters.push(source);
    dg.pentacles.push({ kind: 'explosion', name: '爆発の魔方陣', x: 9, y: 10 });
    killMonster(source, dg, p, logs, () => {}, true);
  }],
];

function setup(bodySize = 2) {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const willow = makeMonsterFromBase(MONS.find(m => m.baseKind === 'hauntedWillow'), 1, 10, 10);
  willow.bodySize = bodySize;
  return { willow, dg: makeEmptyDg({ monsters: [willow] }), p: makePlayer({ x: 2, y: 2, turns: 0 }), logs: [] };
}

describe('巨大雑魚の即死爆発も爆発・割合ダメージ枠を共有する', () => {
  it.each(explosions)('%s: 同じターンの2回目の爆発では柳を倒さない', (_, explode) => {
    const { willow, dg, p, logs } = setup();
    doExplosion(10, 10, dg, p, logs);
    expect(willow.hp).toBe(70);
    explode(dg, p, logs);
    expect(willow.hp).toBe(70);
    expect(dg.monsters).toContain(willow);
    expect(logs).toContain('お化け柳はこのターン、爆発・割合ダメージの追加分を防いだ！');
  });

  it.each(explosions)('%s: 次のターンなら柳を通常どおり倒す', (_, explode) => {
    const { willow, dg, p, logs } = setup();
    doExplosion(10, 10, dg, p, logs);
    p.turns += 1;
    explode(dg, p, logs);
    expect(willow.hp).toBe(0);
    expect(dg.monsters).not.toContain(willow);
  });

  it.each(explosions)('%s: 1マスの敵には巨大敵用の回数制限をかけない', (_, explode) => {
    const { willow, dg, p, logs } = setup(1);
    doExplosion(10, 10, dg, p, logs);
    explode(dg, p, logs);
    expect(willow.hp).toBe(0);
    expect(dg.monsters).not.toContain(willow);
  });
});
