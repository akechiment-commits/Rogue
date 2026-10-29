import { afterEach, describe, expect, it, vi } from 'vitest';
import { OHPLENTY, monsterAI } from '../monsters.js';
import { clearStatusEffectsOnHpZero } from '../statusDuration.js';
import { genDungeon } from '../dungeon.js';
import { canUseOhplentySpecial, isFarLineToPlayer, ohplentyPullPlayer, castCaswack, advanceCaswacks, ohplentyDeathTrap, drawCaswackWarnings } from '../ohplenty.js';
import { resolveTurnHazards } from '../turnHazards.js';
import { runMonsterAttackPhase } from '../monsterAttackPhase.js';
import { getMonsterDescription, getMonsterEncyclopediaEntry } from '../monsterEncyclopedia.js';
import { TILE_NAMES, TILE_RENDER } from '../render.js';
import { MONSTER_SHEET_MAP, DAWNLIKE_FALLBACKS } from '../tilesetMap.js';
import { MW, MH, T } from '../utils.js';
import { makeEmptyDg, makePlayer } from './helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(overrides = {}) {
  const boss = {
    ...OHPLENTY,
    id: 'ohplenty',
    x: 10,
    y: 10,
    hp: 1100,
    maxHp: 1100,
    aware: true,
    lastPx: 5,
    lastPy: 10,
    dir: { x: 0, y: 0 },
    ...overrides
  };
  const player = makePlayer({ x: 5, y: 10, hp: 200, maxHp: 200, exp: 0, atk: 10 });
  const visible = Array.from({ length: MH }, () => Array(MW).fill(true));
  const dungeon = makeEmptyDg({
    depth: 24,
    monsters: [boss],
    rooms: [{ x: 1, y: 1, w: 20, h: 20 }],
    visible,
    explored: visible.map(row => [...row])
  });
  return { boss, player, dungeon, messages: [] };
}

describe('上級25階ボス オープレンティ', () => {
  it('上級25階（depth 24）で魔将軍の代わりにオープレンティが生成される', () => {
    const dg = genDungeon(24, 'advanced');
    const boss = dg.monsters.find(m => m.isBoss);
    expect(boss).toBeDefined();
    expect(boss.baseKind).toBe('boss_ohplenty');
    expect(boss.name).toBe('オープレンティ');
    expect(boss.speed).toBe(2);
    expect(boss.maxAttacks).toBe(1);
    expect(boss.kind).toBe('material');

    // 超上級の25階では復讐の群れ長が専用ボスとして生成される
    expect(genDungeon(24, 'legend').monsters.find(m => m.isBoss).baseKind).toBe('boss_flock_revenge');
  });

  it('図鑑・全スタイルのグラフィック定義が揃っている', () => {
    expect(getMonsterEncyclopediaEntry(OHPLENTY.name)).toBe(OHPLENTY);
    const desc = getMonsterDescription(OHPLENTY.name);
    expect(desc).toContain('引き寄せる');
    expect(desc).toContain('カスワック');
    expect(desc).toContain('デストラップ');

    // スタイル1 (ASCII)
    expect(TILE_NAMES[253]).toBe('ohplenty');
    expect(TILE_RENDER[253]).toBeDefined();
    expect(TILE_RENDER[253].ch).toBe('C');
    expect(TILE_RENDER[253].fg).toBe('#ffd700');

    // スタイル2 (Classic DawnLike)
    expect(MONSTER_SHEET_MAP[253]).toEqual([3, 4]);
    expect(DAWNLIKE_FALLBACKS[253]).toBe(153);
  });

  describe('特技1: 引き寄せの魔法', () => {
    it('遠距離直線上にいるプレイヤーをオープレンティの手前マスまで引き寄せる', () => {
      const s = setup();
      // boss at (10, 10), player at (5, 10) -> 直線上、距離5
      expect(isFarLineToPlayer(s.boss, s.dungeon, s.player)).toBe(true);

      ohplentyPullPlayer(s.boss, s.dungeon, s.player, s.messages);
      // 引き寄せ先は boss (10, 10) の手前 (9, 10)
      expect(s.player.x).toBe(9);
      expect(s.player.y).toBe(10);
      expect(s.messages.some(m => m.includes('引き寄せられた'))).toBe(true);
    });

    it('体幹の指輪を装備している場合は引き寄せを無効化する', () => {
      const s = setup();
      s.player.rings = [{ effect: 'core_ring', name: '体幹の指輪' }];
      ohplentyPullPlayer(s.boss, s.dungeon, s.player, s.messages);
      expect(s.player.x).toBe(5);
      expect(s.player.y).toBe(10);
      expect(s.messages.some(m => m.includes('体幹の指輪'))).toBe(true);
    });

    it('途中に壁がある場合はオープレンティ自身が壁の手前まで飛びつく', () => {
      const s = setup();
      s.dungeon.map[10][8] = T.WALL; // (8, 10) に壁
      ohplentyPullPlayer(s.boss, s.dungeon, s.player, s.messages);
      // boss (10, 10) が壁 (8, 10) の手前 (9, 10) まで移動する
      expect(s.boss.x).toBe(9);
      expect(s.player.x).toBe(5);
      expect(s.player.y).toBe(10);
    });
  });

  describe('特技2: カスワック', () => {
    it('予兆を周囲1マスに展開し、次ターン発動で50ターンのカスワック状態を付与する', () => {
      const s = setup({ x: 6, y: 10 }); // player (5, 10) に隣接
      castCaswack(s.boss, s.dungeon, s.player, s.messages);

      expect(s.dungeon.pendingCaswacks).toHaveLength(1);
      expect(s.dungeon.pendingCaswacks[0].turnsLeft).toBe(1);

      // フロア時計進行
      resolveTurnHazards({ dungeon: s.dungeon }, s.player, s.messages, {
        hasRingEffect: () => false,
        doExplosion: () => {},
        runMineExplosion: () => {},
        doTimeBombExplosion: () => {},
        fireTrapPlayer: () => {},
        getItemName: item => item.name,
        lu: () => {}
      });

      expect(s.dungeon.pendingCaswacks).toHaveLength(0);
      expect(s.player.caswackTurns).toBe(50);
      expect(s.messages.some(m => m.includes('カスワック状態になった'))).toBe(true);
    });

    it('すでにカスワック状態の対象が再度カスワックを受けると即死する', () => {
      const s = setup({ x: 6, y: 10 });
      s.player.caswackTurns = 30; // すでにカスワック中
      castCaswack(s.boss, s.dungeon, s.player, s.messages);

      resolveTurnHazards({ dungeon: s.dungeon }, s.player, s.messages, {
        hasRingEffect: () => false,
        doExplosion: () => {},
        runMineExplosion: () => {},
        doTimeBombExplosion: () => {},
        fireTrapPlayer: () => {},
        getItemName: item => item.name,
        lu: () => {}
      });

      expect(s.player.hp).toBe(0);
      expect(s.messages.some(m => m.includes('即死した'))).toBe(true);
    });

    it('発動前に封印・行動不能・強制移動を受けると予兆が中断される', () => {
      const s = setup({ x: 6, y: 10 });
      castCaswack(s.boss, s.dungeon, s.player, s.messages);
      expect(s.dungeon.pendingCaswacks).toHaveLength(1);

      // オープレンティが眠った場合
      s.boss.sleepTurns = 3;
      advanceCaswacks(s.dungeon, s.player, s.messages);

      expect(s.dungeon.pendingCaswacks).toHaveLength(0);
      expect(s.player.caswackTurns || 0).toBe(0);
      expect(s.messages.some(m => m.includes('呪文が途切れた'))).toBe(true);
    });

    it('予兆後にプレイヤーが一歩離れても（同一マス停滞履歴があっても）ボスは移動せず次ターン確実にカスワックが炸裂する', () => {
      const s = setup({ x: 10, y: 10 });
      // プレイヤーが隣接 (10, 11) でカスワック予兆を放つ
      s.player.x = 10;
      s.player.y = 11;
      castCaswack(s.boss, s.dungeon, s.player, s.messages);
      expect(s.dungeon.pendingCaswacks).toHaveLength(1);
      expect(s.boss._isCaswackCasting).toBe(true);

      // 同一マスに長時間滞在していたことによるスタック履歴を模擬
      s.boss.posHistory = Array.from({ length: 8 }, () => ({ x: 10, y: 10 }));
      s.boss._idleStuck = 10;

      // プレイヤーが一歩離れる (10, 13)
      s.player.y = 13;

      // 敵移動フェーズ：オープレンティは変な方向へ動かず詠唱位置にとどまる
      monsterAI(s.boss, s.dungeon, s.player, s.messages, { moveOnly: true });
      expect(s.boss.x).toBe(10);
      expect(s.boss.y).toBe(10);
      expect(s.boss._movedThisTurn).toBe(true);

      // フロア時計によるカスワック解決：中断されず炸裂する！
      advanceCaswacks(s.dungeon, s.player, s.messages);
      expect(s.messages.some(m => m.includes('カスワックが炸裂した'))).toBe(true);
      expect(s.messages.some(m => m.includes('呪文が途切れた'))).toBe(false);
      expect(s.boss._isCaswackCasting).toBeUndefined();
    });

    it('カスワック即死で死亡した際、MP復活や復活の魔方陣で復活したときはカスワック状態が解除される', () => {
      const s = setup({ x: 10, y: 10 });
      s.player.x = 10;
      s.player.y = 11;
      s.player.hp = 100;
      s.player.mp = 50; // MP復活可能な状態
      s.player.caswackTurns = 50; // すでにカスワック状態

      // カスワック予兆を発動して解決（2度目のため即死）
      castCaswack(s.boss, s.dungeon, s.player, s.messages);
      advanceCaswacks(s.dungeon, s.player, s.messages);

      expect(s.player.hp).toBe(0);
      expect(s.messages.some(m => m.includes('即死した'))).toBe(true);

      // HP0になった瞬間に clearStatusEffectsOnHpZero が走り、カスワック状態が解除される
      expect(s.player.caswackTurns).toBe(0);

      // MP復活処理を模擬
      clearStatusEffectsOnHpZero(s.player);
      const revHp = s.player.mp;
      s.player.hp = revHp;
      s.player.mp = 0;
      expect(s.player.hp).toBe(50);
      expect(s.player.caswackTurns).toBe(0); // 復活後もカスワック状態は切れている！

      // 再度復活の魔方陣での蘇生も模擬
      s.player.caswackTurns = 50;
      s.player.hp = 0;
      clearStatusEffectsOnHpZero(s.player);
      expect(s.player.caswackTurns).toBe(0);
      s.player.hp = s.player.maxHp;
      expect(s.player.caswackTurns).toBe(0);
    });
  });

  describe('特技3: デストラップ', () => {
    it('周囲1マスに無差別ダメージ＋金縛り（プレイヤー10ターン）を付与する', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.50);
      const s = setup({ x: 6, y: 10 });
      const otherMonster = {
        id: 'slime',
        name: 'スライム',
        x: 6,
        y: 9,
        hp: 500,
        maxHp: 500,
        def: 5
      };
      s.dungeon.monsters.push(otherMonster);

      ohplentyDeathTrap(s.boss, s.dungeon, s.player, s.messages);

      // プレイヤーにダメージ＋金縛り10ターン
      expect(s.player.hp).toBeLessThan(200);
      expect(s.player.paralyzeTurns).toBe(10);

      // 他モンスターにダメージ＋金縛り
      expect(otherMonster.hp).toBeLessThan(500);
      expect(otherMonster.paralyzed).toBe(true);
      expect(s.messages.some(m => m.includes('デストラップ'))).toBe(true);
    });

    it('通常攻撃同様に回避可能（見切りの盾、オリーブオイル、通常ミス率10%）', () => {
      // 1. 見切りの盾による回避
      const s1 = setup();
      s1.player.x = 11;
      s1.player.y = 10;
      s1.player.armor = { name: '見切りの盾', ability: 'dodge' };
      vi.spyOn(Math, 'random').mockReturnValue(0.10); // < 0.25 -> 回避
      ohplentyDeathTrap(s1.boss, s1.dungeon, s1.player, s1.messages);
      expect(s1.player.hp).toBe(200); // ノーダメージ
      expect(s1.player.paralyzeTurns || 0).toBe(0); // 金縛りなし
      expect(s1.messages.some(m => m.includes('デストラップをひらりとかわした'))).toBe(true);

      // 2. オリーブオイルによる回避
      const s2 = setup();
      s2.player.x = 11;
      s2.player.y = 10;
      s2.player.oliveEvasionTurns = 5;
      vi.spyOn(Math, 'random').mockReturnValue(0.10); // < 0.15 -> 回避
      ohplentyDeathTrap(s2.boss, s2.dungeon, s2.player, s2.messages);
      expect(s2.player.hp).toBe(200);
      expect(s2.player.paralyzeTurns || 0).toBe(0);
      expect(s2.messages.some(m => m.includes('オリーブオイルの力で') && m.includes('かわした'))).toBe(true);

      // 3. 通常ミス率（10%）
      const s3 = setup();
      s3.player.x = 11;
      s3.player.y = 10;
      vi.spyOn(Math, 'random').mockReturnValue(0.95); // >= 0.90 -> ミス
      ohplentyDeathTrap(s3.boss, s3.dungeon, s3.player, s3.messages);
      expect(s3.player.hp).toBe(200);
      expect(s3.player.paralyzeTurns || 0).toBe(0);
      expect(s3.messages.some(m => m.includes('デストラップは外れた'))).toBe(true);
    });

    it('回避不能な状態異常中（睡眠・金縛り・凍結・移動封じ・鈍足）は回避できない', () => {
      const s = setup();
      s.player.x = 11;
      s.player.y = 10;
      s.player.sleepTurns = 3;
      s.player.armor = { name: '見切りの盾', ability: 'dodge' };
      vi.spyOn(Math, 'random').mockReturnValue(0.10);
      ohplentyDeathTrap(s.boss, s.dungeon, s.player, s.messages);
      expect(s.player.hp).toBeLessThan(200);
      expect(s.messages.some(m => m.includes('デストラップ'))).toBe(true);
    });

    it('他モンスターもデストラップを回避できる', () => {
      const s = setup();
      s.player.x = 20;
      s.player.y = 20;
      const otherMonster = {
        id: 'mon1',
        name: 'スライム',
        x: 11,
        y: 10,
        hp: 500,
        maxHp: 500,
      };
      s.dungeon.monsters.push(otherMonster);
      vi.spyOn(Math, 'random').mockReturnValue(0.01); // < 0.05 -> 回避
      ohplentyDeathTrap(s.boss, s.dungeon, s.player, s.messages);
      expect(otherMonster.hp).toBe(500);
      expect(s.messages.some(m => m.includes('スライムへの攻撃は外れた'))).toBe(true);
    });
  });
});
