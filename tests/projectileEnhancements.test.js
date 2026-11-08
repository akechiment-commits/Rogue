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

describe('飛び道具・投擲のバリア・状態解除・反射防具検証', () => {
  it('装備矢の命中時、敵のバリアが消費されてダメージを受けない', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const arrow = { id: 'arr1', name: '木の矢', type: 'arrow', count: 10, atk: 5 };
    const player = makePlayer({ x: 2, y: 2, depth: 1, arrow, inventory: [arrow] });
    const monster = { id: 'm1', name: 'テスト敵', x: 2, y: 4, hp: 50, maxHp: 50, def: 0, barrier: 1 };
    const visible = Array.from({ length: MH }, () => Array(MW).fill(true));
    const dungeon = makeEmptyDg({ depth: 1, monsters: [monster], visible, explored: visible, rooms: [] });
    const sr = { current: { player, dungeon, ident: new Set() } };
    const setThrowMode = vi.fn();
    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
      setGs: () => {}, setMsgs: () => {}, setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {},
      setThrowMode, throwMode: { mode: 'shoot_equipped' },
      pushAnim: () => {}, withPitfallBag: (fn) => fn()
    });

    actions.execDirection(0, 1);
    expect(monster.barrier).toBe(0);
    expect(monster.hp).toBe(50);
  });

  it('装備石の命中時、敵の初期仮眠と金縛りが解除される', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const stone = { id: 'st1', name: '石', type: 'arrow', stone: true, count: 5, atk: 3 };
    const player = makePlayer({ x: 2, y: 2, depth: 1, arrow: stone, inventory: [stone] });
    // 石は3マス先に飛ぶので (2, 5) に敵を配置
    const monster = { id: 'm1', name: 'テスト敵', x: 2, y: 5, hp: 50, maxHp: 50, def: 0, dormant: true, paralyzeTurns: 10 };
    const visible = Array.from({ length: MH }, () => Array(MW).fill(true));
    const dungeon = makeEmptyDg({ depth: 1, monsters: [monster], visible, explored: visible, rooms: [] });
    const sr = { current: { player, dungeon, ident: new Set() } };
    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
      setGs: () => {}, setMsgs: () => {}, setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {},
      setThrowMode: vi.fn(), throwMode: { mode: 'shoot_equipped' },
      pushAnim: () => {}, withPitfallBag: (fn) => fn()
    });

    actions.execDirection(0, 1);
    expect(monster.dormant).toBe(false);
    expect(monster.paralyzeTurns).toBe(0);
    expect(monster.hp).toBeLessThan(50);
  });

  it('跳ね返された通常石がプレイヤーに当たった際、プレイヤーのバリアで防ぐ', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const stone = { id: 'st1', name: '石', type: 'arrow', stone: true, count: 5, atk: 3 };
    const player = makePlayer({ x: 2, y: 2, depth: 1, hp: 100, maxHp: 100, barrier: 1, arrow: stone, inventory: [stone] });
    // 反射敵を (2, 5) に配置
    const monster = { id: 'ref1', name: 'ミラー', x: 2, y: 5, hp: 50, maxHp: 50, subtype: 'reflector' };
    const dungeon = makeEmptyDg({ depth: 1, monsters: [monster], rooms: [] });
    const sr = { current: { player, dungeon, ident: new Set() } };
    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
      setGs: () => {}, setMsgs: () => {}, setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {},
      setThrowMode: vi.fn(), throwMode: { mode: 'shoot_equipped' },
      pushAnim: () => {}, withPitfallBag: (fn) => fn()
    });

    actions.execDirection(0, 1);
    expect(player.barrier).toBe(0);
    expect(player.hp).toBe(100);
  });

  it('跳ね返されたヤバイ食料がプレイヤーに当たった際、耐ヤバイ食料防具で防ぐ', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const food = { id: 'f1', name: 'ヤバイ草', type: 'food', yabai: true };
    const armor = { id: 'arm1', name: '耐ヤバイの盾', type: 'armor', abilities: ['yabai_proof'] };
    const player = makePlayer({ x: 2, y: 2, depth: 1, hp: 100, maxHp: 100, armor, inventory: [food, armor] });
    const monster = { id: 'ref1', name: 'ミラー', x: 2, y: 4, hp: 50, maxHp: 50, subtype: 'reflector' };
    const dungeon = makeEmptyDg({ depth: 1, monsters: [monster], rooms: [] });
    const sr = { current: { player, dungeon, ident: new Set() } };
    const mlList = [];
    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
      setGs: () => {}, setMsgs: (fn) => mlList.push(fn([])), setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {},
      setThrowMode: vi.fn(), throwMode: { idx: 0, mode: 'throw' },
      pushAnim: () => {}, withPitfallBag: (fn) => fn()
    });

    actions.execDirection(0, 1);
    // 投擲物の基本ダメージは受けるが、ヤバイ食料の追加ダメージや毒・混乱・鈍足は防具で防がれる
    expect(player.poisonTurns || 0).toBe(0);
    expect(player.confusedTurns || 0).toBe(0);
    expect(player.slowTurns || 0).toBe(0);
  });
  it("アイテム投擲がキノコ敵に命中した際、反撃胞子が発動する", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const rock = { id: "r1", name: "石ころ", type: "misc" };
    const player = makePlayer({ x: 2, y: 2, depth: 1, hp: 100, maxHp: 100, inventory: [rock] });
    const shroom = { id: "m1", name: "ドクツルタケ", baseKind: "mushroom", x: 2, y: 3, hp: 50, maxHp: 50, def: 0 };
    const visible = Array.from({ length: MH }, () => Array(MW).fill(true));
    const dungeon = makeEmptyDg({ depth: 1, monsters: [shroom], visible, explored: visible, rooms: [] });
    const sr = { current: { player, dungeon, ident: new Set() } };
    const msgs = [];
    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
      setGs: () => {}, setMsgs: (fn) => msgs.push(...fn([])), setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {},
      setThrowMode: vi.fn(), throwMode: { idx: 0, mode: "throw" },
      pushAnim: () => {}, withPitfallBag: (fn) => fn()
    });

    actions.execDirection(0, 1);
    expect(msgs.some(m => m.includes("胞子"))).toBe(true);
  });
  it("壺投擲命中時、敵の初期仮眠と金縛りが解除され、友好的NPCは敵対化する", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const pot = { id: "p1", name: "保存の壺", type: "pot", potEffect: "preserve", capacity: 4, contents: [] };
    const player = makePlayer({ x: 2, y: 2, depth: 1, hp: 100, maxHp: 100, inventory: [pot] });
    const npc = { id: "m1", name: "店主", type: "shopkeeper", x: 2, y: 4, hp: 100, maxHp: 100, def: 0, dormant: true, paralyzeTurns: 5 };
    const visible = Array.from({ length: MH }, () => Array(MW).fill(true));
    const dungeon = makeEmptyDg({ depth: 1, monsters: [npc], visible, explored: visible, rooms: [] });
    const sr = { current: { player, dungeon, ident: new Set() } };
    const msgs = [];
    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
      setGs: () => {}, setMsgs: (fn) => msgs.push(...fn([])), setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {},
      setThrowMode: vi.fn(), throwMode: { idx: 0, mode: "throw" },
      pushAnim: () => {}, withPitfallBag: (fn) => fn()
    });

    actions.execDirection(0, 1);
    expect(npc.dormant).toBe(false);
    expect(npc.paralyzeTurns).toBe(0);
    expect(npc.state).toBe("hostile");
    expect(msgs.some(m => m.includes("金縛りが解けた"))).toBe(true);
  });
  it("跳ね返された杖をプレイヤーがバリアで防いだ際、破壊効果は発動しない", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const wand = { id: "w1", name: "魔法の杖", type: "wand", effect: "lightning", charges: 5 };
    const player = makePlayer({ x: 2, y: 2, depth: 1, hp: 100, maxHp: 100, barrier: 1, inventory: [wand] });
    const reflector = { id: "ref1", name: "ミラー", x: 2, y: 4, hp: 50, maxHp: 50, subtype: "reflector" };
    const dungeon = makeEmptyDg({ depth: 1, monsters: [reflector], rooms: [] });
    const sr = { current: { player, dungeon, ident: new Set() } };
    const msgs = [];
    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
      setGs: () => {}, setMsgs: (fn) => msgs.push(...fn([])), setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {},
      setThrowMode: vi.fn(), throwMode: { idx: 0, mode: "throw" },
      pushAnim: () => {}, withPitfallBag: (fn) => fn()
    });

    actions.execDirection(0, 1);
    expect(player.barrier).toBe(0);
    expect(player.hp).toBe(100);
    // バリアで防がれたので雷の破壊ダメージ等のメッセージは出ない
    expect(msgs.some(m => m.includes("雷"))).toBe(false);
  });

  it("跳ね返された食料がプレイヤーに当たった際、満腹度が回復する", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const food = { id: "f1", name: "大きなパン", type: "food", nutrition: 50 };
    const player = makePlayer({ x: 2, y: 2, depth: 1, hp: 100, maxHp: 100, hunger: 20, maxHunger: 100, inventory: [food] });
    const reflector = { id: "ref1", name: "ミラー", x: 2, y: 4, hp: 50, maxHp: 50, subtype: "reflector" };
    const dungeon = makeEmptyDg({ depth: 1, monsters: [reflector], rooms: [] });
    const sr = { current: { player, dungeon, ident: new Set() } };
    const msgs = [];
    const actions = useItemActions({
      sr, endTurn: vi.fn(), dnameRef: (it) => it.name, lu: () => {},
      setGs: () => {}, setMsgs: (fn) => msgs.push(...fn([])), setShowInv: () => {}, setSelIdx: () => {}, setShowDesc: () => {},
      setThrowMode: vi.fn(), throwMode: { idx: 0, mode: "throw" },
      pushAnim: () => {}, withPitfallBag: (fn) => fn()
    });

    actions.execDirection(0, 1);
    expect(player.hunger).toBeGreaterThan(20);
    expect(msgs.some(m => m.includes("満腹度"))).toBe(true);
  });
});
