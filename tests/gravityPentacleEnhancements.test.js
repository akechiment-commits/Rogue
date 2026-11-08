import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react', () => ({
  useCallback: (fn) => fn,
  useEffect: () => {},
  useRef: (value) => ({ current: value })
}));
import { useItemActions } from '../useItemActions.js';
import { makeEmptyDg, makePlayer } from './helpers.js';
import { T, MW, MH } from '../utils.js';

afterEach(() => vi.restoreAllMocks());

function setupDungeon(options) {
  const visible = Array.from({ length: MH }, () => Array(MW).fill(true));
  const explored = Array.from({ length: MH }, () => Array(MW).fill(true));
  return makeEmptyDg({ visible, explored, ...options });
}

describe('重力の魔方陣の水没処理修正検証', () => {
  it('一時浮遊（floatTurns）の敵が水上にいる場合、重力の魔方陣で弾き出される', () => {
    const pen = { id: 'p1', name: '重力のペン', type: 'pen', effect: 'gravity', charges: 1, bcKnown: true };
    const room = { x: 2, y: 2, w: 8, h: 8 };
    const player = makePlayer({ x: 3, y: 3, depth: 1, inventory: [pen] });
    // (4, 4) は水マス。敵は一時浮遊 (floatTurns: 5)
    const floatMon = { id: 'fm1', name: '浮遊敵', x: 4, y: 4, hp: 50, maxHp: 50, floatTurns: 5 };
    const dungeon = setupDungeon({ depth: 1, rooms: [room], monsters: [floatMon], pentacles: [] });
    dungeon.map[4][4] = T.WATER;
    const sr = { current: { player, dungeon, ident: new Set(['pen:gravity']), allBcKnown: true } };
    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
      setGs: () => {}, setMsgs: () => {}, setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {},
      pushAnim: () => {}
    });

    actions.doUseItem(0);

    // 水上から弾き出され、水マス以外に着地していること
    expect(floatMon.x === 4 && floatMon.y === 4).toBe(false);
    expect(dungeon.map[floatMon.y][floatMon.x]).toBe(T.FLOOR);
    expect(floatMon.floatTurns).toBe(0);
  });

  it('水生敵（waterOnly）や水中歩行敵（waterWalker）は水上にいても水没死せず対象外となる', () => {
    const pen = { id: 'p1', name: '重力のペン', type: 'pen', effect: 'gravity', charges: 1, bcKnown: true };
    const room = { x: 2, y: 2, w: 8, h: 8 };
    const player = makePlayer({ x: 3, y: 3, depth: 1, inventory: [pen] });
    // 水生敵
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

    // 水生敵は弾き出されず水上のまま生存している
    expect(waterMon.x).toBe(4);
    expect(waterMon.y).toBe(4);
    expect(waterMon.hp).toBe(50);
  });

  it('逃げ場のない水上浮遊敵は水没即死する', () => {
    const pen = { id: 'p1', name: '重力のペン', type: 'pen', effect: 'gravity', charges: 1, bcKnown: true };
    const room = { x: 2, y: 2, w: 8, h: 8 };
    const player = makePlayer({ x: 3, y: 3, depth: 1, inventory: [pen] });
    const floatMon = { id: 'fm2', name: '浮遊敵2', x: 5, y: 5, hp: 50, maxHp: 50, float: true };
    const dungeon = setupDungeon({ depth: 1, rooms: [room], monsters: [floatMon], pentacles: [] });
    // 周囲8マスすべてを水にする（逃げ場なし）
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        dungeon.map[5 + dy][5 + dx] = T.WATER;
      }
    }
    const sr = { current: { player, dungeon, ident: new Set(['pen:gravity']), allBcKnown: true } };
    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
      setGs: () => {}, setMsgs: () => {}, setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {},
      pushAnim: () => {}
    });

    actions.doUseItem(0);

    // 即死して除去されるか hp <= 0
    expect(dungeon.monsters.some(m => m.id === 'fm2' && m.hp > 0)).toBe(false);
  });

  it('2x2の大型敵が水上にいる場合、体の全マスが安全な床マスへ弾き出される', () => {
    const pen = { id: 'p1', name: '重力のペン', type: 'pen', effect: 'gravity', charges: 1, bcKnown: true };
    const room = { x: 2, y: 2, w: 10, h: 10 };
    const player = makePlayer({ x: 3, y: 3, depth: 1, inventory: [pen] });
    // 2x2大型敵 at (5, 5) -> (5,5), (6,5), (5,6), (6,6)
    const largeMon = { id: 'lm1', name: '大型浮遊敵', x: 5, y: 5, bodySize: 2, hp: 100, maxHp: 100, float: true };
    const dungeon = setupDungeon({ depth: 1, rooms: [room], monsters: [largeMon], pentacles: [] });
    // 体の1マス (6, 6) を水にする
    dungeon.map[6][6] = T.WATER;
    const sr = { current: { player, dungeon, ident: new Set(['pen:gravity']), allBcKnown: true } };
    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
      setGs: () => {}, setMsgs: () => {}, setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {},
      pushAnim: () => {}
    });

    actions.doUseItem(0);

    // 弾き出された後の体4マスすべてが T.FLOOR であり、水や壁を含まないこと
    const newCells = [
      { x: largeMon.x, y: largeMon.y },
      { x: largeMon.x + 1, y: largeMon.y },
      { x: largeMon.x, y: largeMon.y + 1 },
      { x: largeMon.x + 1, y: largeMon.y + 1 }
    ];
    for (const c of newCells) {
      expect(dungeon.map[c.y][c.x]).toBe(T.FLOOR);
    }
  });
});
