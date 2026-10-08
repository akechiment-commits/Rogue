import { afterEach, describe, expect, it, vi } from 'vitest';
import { MONS, makeMonsterFromBase, KING_BEHINMOS } from '../monsters.js';
import { doExplosion, doGunpowderExplosion, doTimeBombExplosion, killMonster } from '../items.js';
import { makeEmptyDg, makePlayer } from './helpers.js';

afterEach(() => vi.restoreAllMocks());

const explosions = [
  ['火薬壺', (dg, p, logs) => doGunpowderExplosion(10, 10, dg, p, logs, () => {})],
  ['時限爆弾', (dg, p, logs) => doTimeBombExplosion(10, 10, dg, p, logs, () => {})],
  ['地雷', (dg, p, logs) => doExplosion(10, 10, dg, p, logs, null, '地雷', null, null, false, false, true)],
  ['爆発の指輪', (dg, p, logs) => doExplosion(10, 10, dg, p, logs, null, '爆発の指輪', null, null, false, true)],
  ['即死指定の爆発', (dg, p, logs) => doExplosion(10, 10, dg, p, logs, null, '即死爆発', null, null, false, false, false, false, { instantMonsterKill: true })],
  ['撃破による爆発の魔方陣', (dg, p, logs) => {
    const source = { id: 'source', name: '爆発元', x: 9, y: 10, hp: 0, exp: 0 };
    dg.monsters.push(source);
    dg.pentacles.push({ kind: 'explosion', name: '爆発の魔方陣', x: 9, y: 10 });
    killMonster(source, dg, p, logs, () => {}, true);
  }],
];

function setup(boss = false) {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const base = boss ? KING_BEHINMOS : MONS.find(m => m.baseKind === 'hauntedWillow');
  const monster = makeMonsterFromBase(base, 1, 10, 10);
  return { monster, dg: makeEmptyDg({ monsters: [monster] }), p: makePlayer({ x: 2, y: 2, turns: 0 }), logs: [] };
}

function damageOnlyExplosion(dg, p, logs) {
  doExplosion(10, 10, dg, p, logs, null, '爆弾矢', null, null, false, false, false, false, { projectileAtk: 20 });
}

describe('巨大雑魚の即死はダメージ回数制限で防がない', () => {
  it.each(explosions)('%s: 爆弾矢の爆風を先に受けた同じターンでも柳は即死する', (_, explode) => {
    const { monster, dg, p, logs } = setup();
    const initialHp = monster.hp;
    damageOnlyExplosion(dg, p, logs);
    expect(monster.hp).toBeLessThan(initialHp);
    expect(monster.hp).toBeGreaterThan(0);
    explode(dg, p, logs);
    expect(monster.hp).toBe(0);
    expect(dg.monsters).not.toContain(monster);
  });

  it.each(explosions)('%s: 最初の爆発でも柳は即死する', (_, explode) => {
    const { monster, dg, p, logs } = setup();
    explode(dg, p, logs);
    expect(monster.hp).toBe(0);
    expect(dg.monsters).not.toContain(monster);
  });

  it.each(explosions)('%s: ボスに変換された割合ダメージは回数制限を維持する', (_, explode) => {
    const { monster, dg, p, logs } = setup(true);
    damageOnlyExplosion(dg, p, logs);
    const hpAfterFirst = monster.hp;
    explode(dg, p, logs);
    expect(monster.hp).toBe(hpAfterFirst);
    expect(dg.monsters).toContain(monster);
  });
});
