import { afterEach, describe, expect, it, vi } from 'vitest';
import { MONS, makeMonsterFromBase, monsterAI, _resolveBolt } from '../monsters.js';
import { MW, MH } from '../utils.js';
import { throwItemAlongLine } from '../items.js';
import { makeEmptyDg, makePlayer } from './helpers.js';

afterEach(() => vi.restoreAllMocks());
function setup(monsters) {
  const p = makePlayer({ x: 16, y: 5 });
  const dg = makeEmptyDg({
    monsters,
    rooms: [{ x: 1, y: 1, w: 9, h: 9 }, { x: 14, y: 1, w: 9, h: 9 }],
    pentacles: [{ id: 'dodge', kind: 'dodge', x: 16, y: 6 }],
    visible: Array.from({ length: MH }, () => Array(MW).fill(true)),
  });
  return { p, dg, logs: [] };
}

describe('プレイヤーのみかわしは飛び道具が本人に届いた時に判定する', () => {
  it('別の部屋のみかわしに乗ったプレイヤーは、忍者の味方回復を止めない', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const healer = makeMonsterFromBase(MONS.find(m => m.baseKind === 'potionhealer'), 1, 3, 5, { aware: true });
    healer.alwaysUseSpecial = true;
    const ally = { id: 'ally', name: '負傷した敵', x: 6, y: 5, hp: 40, maxHp: 100, def: 0 };
    const { p, dg, logs } = setup([healer, ally]);
    monsterAI(healer, dg, p, logs, { moveOnly: true });
    expect(healer._potionHealerTarget).toBe(ally);
    monsterAI(healer, dg, p, logs, { attackOnly: true });
    expect(ally.hp).toBe(70);
    expect(logs.some(line => line.includes('かわした'))).toBe(false);
    expect(p.hp).toBe(100);
  });

  it('プレイヤーに届く前に別の敵へ当たった矢は、その敵に命中する', () => {
    const archer = { id: 'archer', name: '射手', x: 3, y: 5, hp: 100, atk: 10 };
    const target = { id: 'target', name: '途中の敵', x: 6, y: 5, hp: 40, def: 0 };
    const { p, dg, logs } = setup([archer, target]);
    _resolveBolt(archer, dg, p, logs, () => {}, { dx: 1, dy: 0, baseRange: 20, boltName: '矢', calcMonDmg: () => 10 });
    expect(target.hp).toBe(30);
    expect(p.hp).toBe(100);
  });

  it('本人まで届いた矢は従来どおり回避し、回避位置を返す', () => {
    const archer = { id: 'archer', name: '射手', x: 3, y: 5, hp: 100, atk: 10 };
    const { p, dg, logs } = setup([archer]);
    const miss = vi.fn();
    _resolveBolt(archer, dg, p, logs, () => {}, { dx: 1, dy: 0, baseRange: 20, boltName: '矢', onMiss: miss });
    expect(p.hp).toBe(100);
    expect(miss).toHaveBeenCalledWith(p.x, p.y, logs);
    expect(logs.some(line => line.includes('みかわし'))).toBe(true);
  });

  it('命中率100%の薬でも絶対回避された瓶は着弾位置へ落ち、射手に薬効を出さない', () => {
    const shooter = { id: 'shooter', name: '投薬する敵', x: 3, y: 5, hp: 100, maxHp: 100, atk: 10 };
    const { p, dg, logs } = setup([shooter]);
    const potion = { id: 'potion', name: '暗闇の薬', type: 'potion', effect: 'darkness', value: 10 };
    throwItemAlongLine(shooter, dg, potion, 1, 0, 20, logs, p, () => {}, { killerMon: shooter, hitChance: 1 });
    expect(shooter.darknessTurns || 0).toBe(0);
    expect(p.darknessTurns || 0).toBe(0);
    expect(dg.items).toContain(potion);
    expect(Math.max(Math.abs(potion.x - p.x), Math.abs(potion.y - p.y))).toBeLessThanOrEqual(1);
  });
});
