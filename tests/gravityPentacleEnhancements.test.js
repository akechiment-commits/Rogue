import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react', () => ({
  useCallback: (fn) => fn,
  useEffect: () => {},
  useRef: (value) => ({ current: value })
}));
import { useItemActions, shootEquippedProjectile } from '../useItemActions.js';
import { drownMonsterIfNeeded, makeArrow } from '../items.js';
import { makeEmptyDg, makePlayer } from './helpers.js';
import { T, MW, MH } from '../utils.js';

afterEach(() => vi.restoreAllMocks());

function setupDungeon(options) {
  const visible = Array.from({ length: MH }, () => Array(MW).fill(true));
  const explored = Array.from({ length: MH }, () => Array(MW).fill(true));
  return makeEmptyDg({ visible, explored, ...options });
}

describe('重力の魔方陣の水没・強制移動・投擲制限検証', () => {
  it('通常時に水上に落ちた敵は周囲1マスに陸地があれば弾き出されるが、重力下では弾き出されず即水没する', () => {
    const room = { x: 2, y: 2, w: 8, h: 8 };
    const player = makePlayer({ x: 3, y: 3, depth: 1 });
    const mon = { id: 'm1', name: 'ゴブリン', x: 5, y: 5, hp: 50, maxHp: 50 };
    const dg = setupDungeon({ depth: 1, rooms: [room], monsters: [mon], pentacles: [] });
    dg.map[5][5] = T.WATER;
    const ml = [];

    expect(drownMonsterIfNeeded(mon, dg, player, ml, () => {})).toBe(false);
    expect(dg.map[mon.y][mon.x]).toBe(T.FLOOR);
    expect(ml).toContain('ゴブリンは水から弾き出された！');

    const pen = { id: 'p1', name: '重力のペン', type: 'pen', effect: 'gravity', charges: 1, bcKnown: true };
    player.inventory = [pen];
    const floatMon = { id: 'fm1', name: '浮遊敵', x: 4, y: 4, hp: 50, maxHp: 50, floatTurns: 5 };
    dg.monsters.push(floatMon);
    dg.map[4][4] = T.WATER;
    const sr = { current: { player, dungeon: dg, ident: new Set(['pen:gravity']), allBcKnown: true } };
    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
      setGs: () => {}, setMsgs: () => {}, setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {},
      pushAnim: () => {}
    });

    actions.doUseItem(0);

    expect(dg.monsters.some(m => m.id === 'fm1')).toBe(false);
  });

  it('水生敵（waterOnly）や水中歩行敵（waterWalker）は水上にいても水没死せず対象外となる', () => {
    const pen = { id: 'p1', name: '重力のペン', type: 'pen', effect: 'gravity', charges: 1, bcKnown: true };
    const room = { x: 2, y: 2, w: 8, h: 8 };
    const player = makePlayer({ x: 3, y: 3, depth: 1, inventory: [pen] });
    const waterMon = { id: 'wm1', name: '水生敵', x: 4, y: 4, hp: 50, maxHp: 50, waterOnly: true, float: true };
    const dungeon = setupDungeon({ depth: 1, rooms: [room], monsters: [waterMon], pentacles: [] });
    dungeon.map[4][4] = T.WATER;
    const sr = { current: { player, dungeon, ident: new Set(['pen:gravity']), allBcKnown: true } };
    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
      setGs: () => {}, setMsgs: () => {}, setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {},
      pushAnim: () => {}
    });

    actions.doUseItem(0);

    expect(waterMon.x).toBe(4);
    expect(waterMon.y).toBe(4);
    expect(waterMon.hp).toBe(50);
  });

  it('重力下では投擲・射撃が1マスも飛ばずそのまま足元に落ちる（薬は足元で割れる）', () => {
    const room = { x: 2, y: 2, w: 10, h: 10 };
    const arrow = makeArrow(2);
    const sword = { id: 'w1', name: '銅の剣', type: 'weapon', atk: 5 };
    const potion = { id: 'pot1', name: '回復薬', type: 'potion', effect: 'heal', value: 30 };
    const player = makePlayer({ x: 5, y: 5, hp: 50, maxHp: 100, arrow, inventory: [arrow, sword, potion] });
    const target = { id: 'e1', name: '敵', x: 6, y: 5, hp: 100, maxHp: 100, def: 0 };
    const dungeon = setupDungeon({
      depth: 1,
      rooms: [room],
      monsters: [target],
      pentacles: [{ kind: 'gravity', name: '重力の魔方陣', x: 3, y: 3 }],
    });
    const ml = [];

    shootEquippedProjectile(player, dungeon, 1, 0, ml, {
      lu: () => {},
      bigboxAddItem: () => {},
      withPitfallBag: fn => fn(),
    });
    expect(target.hp).toBe(100);
    expect(dungeon.items).toMatchObject([{ name: '矢', x: 5, y: 5 }]);

    const sr = { current: { player, dungeon, ident: new Set(), allBcKnown: true } };
    const throwFromInv = (item) => {
      const a = useItemActions({
        sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
        throwMode: { idx: player.inventory.indexOf(item), mode: 'throw' },
        withPitfallBag: fn => fn(),
        bigboxAddItem: () => {},
        setGs: () => {}, setMsgs: () => {}, setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {},
        setThrowMode: () => {},
        pushAnim: () => {}
      });
      a.execDirection(1, 0);
    };

    // 武器を投げる -> 1マス先の敵に当たらず足元に落ちる
    throwFromInv(sword);
    expect(target.hp).toBe(100);
    expect(dungeon.items.some(i => i.id === 'w1')).toBe(true);

    // 薬を投げる -> 足元で割れて自分が回復する
    throwFromInv(potion);
    expect(player.hp).toBeGreaterThan(50);
  });
});
