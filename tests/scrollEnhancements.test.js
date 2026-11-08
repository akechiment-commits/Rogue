import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react', () => ({
  useCallback: (fn) => fn,
  useEffect: () => {},
  useRef: (value) => ({ current: value })
}));
import { useItemActions } from '../useItemActions.js';
import { makeEmptyDg, makePlayer } from './helpers.js';
import { MW, MH } from '../utils.js';

afterEach(() => vi.restoreAllMocks());

describe('巻物処理の追加検証（魔法無効封印・プレイヤー防御・クールダウン）', () => {
  it('魔法無効モンスターが封印状態なら雷の巻物が有効になる', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const scroll = { id: 'scroll', name: '雷の巻物', type: 'scroll', effect: 'thunder', bcKnown: true };
    const player = makePlayer({ x: 2, y: 2, depth: 1, hp: 100, maxHp: 100, inventory: [scroll] });
    const monster = { id: 'm1', name: 'テスト敵', x: 2, y: 3, hp: 50, maxHp: 50, magicImmune: true, sealed: 5 };
    const visible = Array.from({ length: MH }, () => Array(MW).fill(true));
    const dungeon = makeEmptyDg({ depth: 1, monsters: [monster], visible, explored: visible, rooms: [] });
    const sr = { current: { player, dungeon, ident: new Set(['s:thunder']), allBcKnown: true } };
    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
      setGs: () => {}, setMsgs: () => {}, setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {}
    });

    actions.doUseItem(0);
    // モンスターにダメージが入っていること
    expect(monster.hp).toBeLessThan(50);
  });

  it('呪われた雷の巻物で自爆時、プレイヤーのバリアが消費されてダメージを防ぐ', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const scroll = { id: 'scroll', name: '雷の巻物', type: 'scroll', effect: 'thunder', cursed: true, bcKnown: true };
    const player = makePlayer({ x: 2, y: 2, depth: 1, hp: 100, maxHp: 100, barrier: 1, inventory: [scroll] });
    const visible = Array.from({ length: MH }, () => Array(MW).fill(false));
    const dungeon = makeEmptyDg({ depth: 1, monsters: [], visible, explored: visible, rooms: [] });
    const sr = { current: { player, dungeon, ident: new Set(['s:thunder']), allBcKnown: true } };
    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
      setGs: () => {}, setMsgs: () => {}, setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {}
    });

    actions.doUseItem(0);
    expect(player.barrier).toBe(0);
    expect(player.hp).toBe(100);
  });

  it('呪われた炎の巻物で自爆時、プレイヤーのバリアが消費されてダメージを防ぐ', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const scroll = { id: 'scroll', name: '炎の巻物', type: 'scroll', effect: 'flame', cursed: true, bcKnown: true };
    const player = makePlayer({ x: 2, y: 2, depth: 1, hp: 100, maxHp: 100, barrier: 1, inventory: [scroll] });
    const visible = Array.from({ length: MH }, () => Array(MW).fill(false));
    const dungeon = makeEmptyDg({ depth: 1, monsters: [], visible, explored: visible, rooms: [] });
    const sr = { current: { player, dungeon, ident: new Set(['s:flame']), allBcKnown: true } };
    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
      setGs: () => {}, setMsgs: () => {}, setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {}
    });

    actions.doUseItem(0);
    expect(player.barrier).toBe(0);
    expect(player.hp).toBe(100);
  });

  it('大型モンスターの一部マスが視界内なら睡眠の巻物が効きクールダウンが付与される', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const scroll = { id: 'scroll', name: '睡眠の巻物', type: 'scroll', effect: 'sleep_scroll', bcKnown: true };
    const player = makePlayer({ x: 2, y: 2, depth: 1, hp: 100, maxHp: 100, inventory: [scroll] });
    // 2x2 monster at (5,5) occupying (5,5), (6,5), (5,6), (6,6)
    const largeMon = { id: 'large1', name: '大型敵', x: 5, y: 5, bodySize: 2, hp: 100, maxHp: 100 };
    const visible = Array.from({ length: MH }, () => Array(MW).fill(false));
    // Only (6,6) is visible
    visible[6][6] = true;
    const dungeon = makeEmptyDg({ depth: 1, monsters: [largeMon], visible, explored: visible, rooms: [] });
    const sr = { current: { player, dungeon, ident: new Set(['s:sleep_scroll']), allBcKnown: true } };
    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
      setGs: () => {}, setMsgs: () => {}, setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {}
    });

    actions.doUseItem(0);
    expect(largeMon.sleepTurns).toBeGreaterThan(0);
    expect(largeMon.largeStatusCooldowns?.sleep).toBe(10);
  });
});
