import { describe, expect, it } from 'vitest';
import '../monsters.js';
import { doGunpowderExplosion, doTimeBombExplosion } from '../items.js';
import { makeEmptyDg, makePlayer } from './helpers.js';

describe('火薬壺・時限爆弾の大爆発の仕様修正検証', () => {
  it('火薬壺の爆発でexplosionImmuneモンスターは無傷、封印火ダルマは分裂せず消滅する', () => {
    const player = makePlayer({ x: 0, y: 0, hp: 100, maxHp: 100 });
    const immuneMon = { id: 'm1', name: '爆発無効敵', x: 2, y: 3, hp: 50, maxHp: 50, explosionImmune: true };
    const sealedFiredemon = { id: 'm2', name: '火ダルマ', baseKind: 'firedemon', x: 3, y: 2, hp: 30, maxHp: 30, sealed: 5 };
    const dungeon = makeEmptyDg({ depth: 1, monsters: [immuneMon, sealedFiredemon], items: [] });
    const ml = [];

    // 爆心地 (2,2)
    doGunpowderExplosion(2, 2, dungeon, player, ml, () => {});

    // 爆発無効敵は生存
    expect(dungeon.monsters.some(m => m.id === 'm1')).toBe(true);
    // 封印火ダルマは消滅（分裂しないため増えない）
    expect(dungeon.monsters.some(m => m.id === 'm2')).toBe(false);
    expect(dungeon.monsters.filter(m => m.baseKind === 'firedemon').length).toBe(0);
  });

  it('火薬壺の爆風で店の商品が破壊された際、未払い代金に計上される', () => {
    const player = makePlayer({ x: 0, y: 0, hp: 100, maxHp: 100 });
    const shopItem = { id: 'i1', name: '店の商品', type: 'scroll', x: 2, y: 3, shopPrice: 500, _shopId: 'shop1' };
    const dungeon = makeEmptyDg({
      depth: 1,
      monsters: [],
      items: [shopItem],
      shops: [{ id: 'shop1', unpaidTotal: 0 }]
    });
    const ml = [];

    doGunpowderExplosion(2, 2, dungeon, player, ml, () => {});

    expect(dungeon.shops[0].unpaidTotal).toBe(500);
    expect(dungeon.items.some(i => i.id === 'i1')).toBe(false);
  });

  it('時限爆弾の大爆発で店の商品が破壊された際、未払い代金に計上される', () => {
    const player = makePlayer({ x: 0, y: 0, hp: 100, maxHp: 100 });
    const shopItem = { id: 'i2', name: '店の巻物', type: 'scroll', x: 2, y: 3, shopPrice: 300, _shopId: 'shop1' };
    const dungeon = makeEmptyDg({
      depth: 1,
      monsters: [],
      items: [shopItem],
      shops: [{ id: 'shop1', unpaidTotal: 0 }]
    });
    const ml = [];

    doTimeBombExplosion(2, 2, dungeon, player, ml, () => {});

    expect(dungeon.shops[0].unpaidTotal).toBe(300);
    expect(dungeon.items.some(i => i.id === 'i2')).toBe(false);
  });

  it('火薬壺・時限爆弾の爆発で範囲内の石像が破壊される', () => {
    const player = makePlayer({ x: 0, y: 0, hp: 100, maxHp: 100 });
    const statue1 = { id: 'st1', type: 'statue', x: 2, y: 3, statueKind: 'gold' };
    const dungeon1 = makeEmptyDg({ depth: 1, monsters: [], items: [], statues: [statue1] });
    const ml = [];

    doGunpowderExplosion(2, 2, dungeon1, player, ml, () => {});
    expect((dungeon1.statues || []).some(s => s.id === 'st1')).toBe(false);

    const statue2 = { id: 'st2', type: 'statue', x: 2, y: 3, statueKind: 'gold' };
    const dungeon2 = makeEmptyDg({ depth: 1, monsters: [], items: [], statues: [statue2] });

    doTimeBombExplosion(2, 2, dungeon2, player, ml, () => {});
    expect((dungeon2.statues || []).some(s => s.id === 'st2')).toBe(false);
  });

  it('時限爆弾の大爆発で金縛り状態の敵の金縛りが解除される', () => {
    const player = makePlayer({ x: 0, y: 0, hp: 100, maxHp: 100 });
    // ボスモンスターなら即死せずダメージを受けて金縛り解除される
    const boss = { id: 'b1', name: 'ボス', x: 2, y: 3, hp: 200, maxHp: 200, isBoss: true, paralyzeTurns: 10 };
    const dungeon = makeEmptyDg({ depth: 1, monsters: [boss], items: [] });
    const ml = [];

    doTimeBombExplosion(2, 2, dungeon, player, ml, () => {});
    expect(boss.paralyzeTurns).toBe(0);
  });
});
