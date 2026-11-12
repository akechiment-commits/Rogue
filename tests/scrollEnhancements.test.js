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

  it('足元に大箱がある状態で祝呪未識別の呪われた識別の巻物を読んだ場合、通常の識別と同じ候補画面（mode=identify, cursed=true）でモーダルが開く', () => {
    const scroll = { id: 'scroll', name: '識別の巻物', type: 'scroll', effect: 'identify', cursed: true, bcKnown: false };
    const box = { id: 'box-1', x: 2, y: 2, kind: 'round', name: '丸みのある大箱', capacity: 3, contents: [] };
    const otherItem = { id: 'pot', name: '保存の壺', type: 'pot', capacity: 4 };
    const player = makePlayer({ x: 2, y: 2, depth: 1, hp: 100, maxHp: 100, inventory: [scroll, otherItem] });
    const dungeon = makeEmptyDg({ depth: 1, monsters: [], rooms: [], bigboxes: [box] });
    const sr = { current: { player, dungeon, ident: new Set(['s:identify']), allBcKnown: false } };
    const setIdentifyMode = vi.fn();
    const setMsgs = vi.fn();
    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
      setGs: () => {}, setMsgs, setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {},
      setIdentifyMode
    });

    actions.doUseItem(0);
    const msgsFn1 = setMsgs.mock.calls[0][0];
    expect(msgsFn1([])).toContain('識別するアイテムを選んでください。');
    expect(setIdentifyMode).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'identify',
      cursed: true,
      bbFootId: 'box-1',
      wasUnknown: false,
      showAll: false
    }));
  });

  it('足元に大箱がある状態で祝呪未識別の通常識別の巻物を読んだ場合、通常の識別と同じ候補画面（mode=identify, cursed=false）でモーダルが開く', () => {
    const scroll = { id: 'scroll', name: '識別の巻物', type: 'scroll', effect: 'identify', cursed: false, bcKnown: false };
    const box = { id: 'box-2', x: 2, y: 2, kind: 'round', name: '丸みのある大箱', capacity: 3, contents: [] };
    const otherItem = { id: 'pot', name: '保存の壺', type: 'pot', capacity: 4 };
    const player = makePlayer({ x: 2, y: 2, depth: 1, hp: 100, maxHp: 100, inventory: [scroll, otherItem] });
    const dungeon = makeEmptyDg({ depth: 1, monsters: [], rooms: [], bigboxes: [box] });
    const sr = { current: { player, dungeon, ident: new Set(['s:identify']), allBcKnown: false } };
    const setIdentifyMode = vi.fn();
    const setMsgs = vi.fn();
    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
      setGs: () => {}, setMsgs, setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {},
      setIdentifyMode
    });

    actions.doUseItem(0);
    const msgsFn2 = setMsgs.mock.calls[0][0];
    expect(msgsFn2([])).toContain('識別するアイテムを選んでください。');
    expect(setIdentifyMode).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'identify',
      cursed: false,
      bbFootId: 'box-2',
      wasUnknown: false,
      showAll: false
    }));
  });
});
