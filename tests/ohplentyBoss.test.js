import { afterEach, describe, expect, it, vi } from 'vitest';
import { OHPLENTY, monsterAI } from '../monsters.js';
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

    // 上級以外の25階では通常のボス（魔将軍）
    expect(genDungeon(24, 'legend').monsters.find(m => m.isBoss).baseKind).toBe('boss_warlord');
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

    it('途中に障害物（壁）がある場合は進める限界まで引き寄せる', () => {
      const s = setup();
      s.dungeon.map[10][8] = T.WALL; // (8, 10) に壁
      ohplentyPullPlayer(s.boss, s.dungeon, s.player, s.messages);
      // (5, 10) から (8, 10) 手前の (7, 10) まで引き寄せられる
      expect(s.player.x).toBe(7);
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
  });

  describe('特技3: デストラップ', () => {
    it('周囲1マスに無差別ダメージ＋金縛り（プレイヤー10ターン）を付与する', () => {
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
  });
});
