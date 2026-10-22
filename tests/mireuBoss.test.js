import { afterEach, describe, expect, it, vi } from 'vitest';
import { MIREU, monsterAI } from '../monsters.js';
import { genDungeon } from '../dungeon.js';
import {
  canUseMireuSpecial,
  isMireuFarLine,
  mireuHyperthermicBreath,
  mireuSpikeFlail,
  mireuAbsoluteTerror,
} from '../mireu.js';
import { castMeteor, advanceMeteors } from '../meteor.js';
import { checkMonsterEvasion } from '../utils.js';
import { getMonsterDescription, getMonsterEncyclopediaEntry } from '../monsterEncyclopedia.js';
import { TILE_NAMES, TILE_RENDER } from '../render.js';
import { MONSTER_SHEET_MAP, DAWNLIKE_FALLBACKS } from '../tilesetMap.js';
import { MW, MH, T } from '../utils.js';
import { makeEmptyDg, makePlayer } from './helpers.js';
import fs from 'fs';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(overrides = {}) {
  const boss = {
    ...MIREU,
    id: 'mireu',
    x: 10,
    y: 10,
    hp: 1400,
    maxHp: 1400,
    aware: true,
    lastPx: 10,
    lastPy: 5,
    dir: { x: 0, y: 0 },
    ...overrides
  };
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR));
  const player = makePlayer({ x: 10, y: 5, hp: 200, maxHp: 200 });
  const visible = Array.from({ length: MH }, () => Array(MW).fill(true));
  const dungeon = makeEmptyDg({ map, monsters: [boss], rooms: [{ x: 1, y: 1, w: 20, h: 20 }], visible, explored: visible.map(row => [...row]) });
  const messages = [];
  return { boss, dungeon, player, messages };
}

describe('上級30階ボス ミレウ (MIREU)', () => {
  describe('基本仕様・グラフィック対応', () => {
    it('基本ステータスと種族・サイズが仕様通りである', () => {
      expect(MIREU.name).toBe('ミレウ');
      expect(MIREU.hp).toBe(1400);
      expect(MIREU.atk).toBe(105);
      expect(MIREU.def).toBe(60);
      expect(MIREU.exp).toBe(14000);
      expect(MIREU.speed).toBe(1);
      expect(MIREU.bodySize).toBe(3);
      expect(MIREU.kind).toBe('dragon');
      expect(MIREU.tile).toBe(254);
      expect(MIREU.isBoss).toBe(true);
      expect(MIREU.meteorDamage).toBe(80);
      expect(MIREU.meteorImmune).toBe(true);
      expect(MIREU.meteorInterval).toBe(4);
    });

    it('スタイル1・2・3のグラフィック設定が全て存在する', () => {
      // スタイル1: ASCII
      expect(TILE_NAMES[254]).toBe('mireu');
      expect(TILE_RENDER[254]).toEqual({ bg: null, fg: '#33aaff', ch: 'D' });

      // スタイル2: DawnLike
      expect(MONSTER_SHEET_MAP[254]).toEqual([6, 2]);
      expect(DAWNLIKE_FALLBACKS[254]).toBe(99);

      // スタイル3: 固有画像PNG
      expect(fs.existsSync('tiles/sprites/mon1/tile_254.png')).toBe(true);
      expect(fs.existsSync('public/tiles/mireu.png')).toBe(true);
    });

    it('モンスター図鑑に登録されている', () => {
      const entry = getMonsterEncyclopediaEntry('ミレウ');
      expect(entry).toBeDefined();
      expect(entry.name).toBe('ミレウ');

      const desc = getMonsterDescription('ミレウ');
      expect(desc).toContain('上級30F');
      expect(desc).toContain('巨大な青い龍');
    });

    it('上級ダンジョン30階（depth: 29）でミレウが生成される', () => {
      const dg = genDungeon(29, 'advanced');
      const boss = dg.monsters.find(m => m.baseKind === 'boss_mireu');
      expect(boss).toBeDefined();
      expect(boss.name).toBe('ミレウ');
      expect(boss.bodySize).toBe(3);
    });
  });

  describe('特性: 必中でない攻撃を50％で回避する', () => {
    it('通常時は50%の確率で回避する', () => {
      const s = setup();
      // 乱数 0.40 (< 0.50) → 回避
      expect(checkMonsterEvasion(s.boss, { sureHit: false, random: () => 0.40 })).toBe(true);
      // 乱数 0.60 (>= 0.50) → 命中
      expect(checkMonsterEvasion(s.boss, { sureHit: false, random: () => 0.60 })).toBe(false);
    });

    it('必中状態（sureHit: true）のときは絶対に回避できない', () => {
      const s = setup();
      // 乱数がいくら低くても sureHit なら回避不可
      expect(checkMonsterEvasion(s.boss, { sureHit: true, random: () => 0.01 })).toBe(false);
    });

    it('回避不能な状態異常（睡眠・金縛り・凍結・移動封じ・鈍足）中は回避できない', () => {
      const s = setup();

      // 睡眠
      s.boss.sleepTurns = 5;
      expect(checkMonsterEvasion(s.boss, { sureHit: false, random: () => 0.01 })).toBe(false);
      s.boss.sleepTurns = 0;

      // 金縛り
      s.boss.paralyzed = true;
      expect(checkMonsterEvasion(s.boss, { sureHit: false, random: () => 0.01 })).toBe(false);
      s.boss.paralyzed = false;

      // 凍結
      s.boss.frozenTurns = 3;
      expect(checkMonsterEvasion(s.boss, { sureHit: false, random: () => 0.01 })).toBe(false);
      s.boss.frozenTurns = 0;

      // 移動封じ
      s.boss.immobileTurns = 5;
      expect(checkMonsterEvasion(s.boss, { sureHit: false, random: () => 0.01 })).toBe(false);
      s.boss.immobileTurns = 0;

      // 鈍足
      s.boss.slowTurns = 5;
      expect(checkMonsterEvasion(s.boss, { sureHit: false, random: () => 0.01 })).toBe(false);
    });
  });

  describe('特技1: ハイパーサーミックブレス', () => {
    it('遠距離直線上で正しく判定される', () => {
      const s = setup();
      // ボス中心 (10, 10)、プレイヤー (10, 5) → 距離4マス（遠距離直線）
      expect(isMireuFarLine(s.boss, s.dungeon, s.player)).toBe(true);

      // 隣接位置 (10, 8) → 3x3の端(10, 9)と隣接（距離1）なので遠距離直線ではない
      s.player.y = 8;
      expect(isMireuFarLine(s.boss, s.dungeon, s.player)).toBe(false);
    });

    it('プレイヤーに防御力無視の固定70炎ダメージを与え、耐性でのみ軽減される', () => {
      // 1. 防具なし（防御0）: 70ダメージ
      const s1 = setup();
      s1.player.y = 4; // 遠距離
      s1.player.hp = 200;
      mireuHyperthermicBreath(s1.boss, s1.dungeon, s1.player, s1.messages);
      expect(s1.player.hp).toBe(130); // 200 - 70 = 130
      expect(s1.messages.some(m => m.includes('ハイパーサーミックブレス'))).toBe(true);

      // 2. 超高防御（防具でdef: 100）: 防御力無視のため依然として70ダメージ
      const s2 = setup();
      s2.player.y = 4;
      s2.player.hp = 200;
      s2.player.armor = { name: '最強の盾', def: 100 };
      mireuHyperthermicBreath(s2.boss, s2.dungeon, s2.player, s2.messages);
      expect(s2.player.hp).toBe(130); // 防御力無視で70ダメージ

      // 3. 炎耐性あり: 耐性により軽減される (70 * 2/3 = 46)
      const s3 = setup();
      s3.player.y = 4;
      s3.player.hp = 200;
      s3.player.armor = { name: '竜の盾', def: 10, ability: 'fire_resist' };
      mireuHyperthermicBreath(s3.boss, s3.dungeon, s3.player, s3.messages);
      expect(s3.player.hp).toBe(154); // 200 - 46 = 154
      expect(s3.messages.some(m => m.includes('耐火'))).toBe(true);

      // 4. 油まみれの時はダメージが倍増する (70 * 2 = 140)
      const s4 = setup();
      s4.player.y = 4;
      s4.player.hp = 300;
      s4.player.oilyTurns = 10;
      mireuHyperthermicBreath(s4.boss, s4.dungeon, s4.player, s4.messages);
      expect(s4.player.hp).toBe(160); // 300 - 140 = 160
      expect(s4.messages.some(m => m.includes('油まみれ×2'))).toBe(true);
    });
  });

  describe('特技2: スパイクフレイル', () => {
    it('隣接マス無差別に3倍ダメージを与え、被弾者をテレポートさせる', () => {
      const s = setup();
      // プレイヤーをボス(3x3)の隣接マス(10, 8)に配置
      s.player.x = 10;
      s.player.y = 8;
      s.player.hp = 400;

      const otherMon = {
        id: 'mon1',
        name: 'スライム',
        x: 8,
        y: 10,
        hp: 300,
        maxHp: 300,
        def: 10
      };
      s.dungeon.monsters.push(otherMon);

      mireuSpikeFlail(s.boss, s.dungeon, s.player, s.messages);

      // プレイヤーに大ダメージ（3倍ダメージ）
      expect(s.player.hp).toBeLessThan(250);
      expect(s.messages.some(m => m.includes('スパイクフレイル'))).toBe(true);
      // テレポートしている（元の座標から移動）
      expect(s.messages.some(m => m.includes('テレポート') || m.includes('吹き飛んだ'))).toBe(true);

      // 他モンスターも大ダメージ＆テレポート
      expect(otherMon.hp).toBeLessThan(150);
      expect(s.messages.some(m => m.includes('スライムは吹き飛ばされてテレポートした'))).toBe(true);
    });
  });

  describe('特技3: アブソルートテラー', () => {
    it('視界内のプレイヤーに鈍足と移動封じを付与する', () => {
      const s = setup();
      s.player.hp = 200;

      mireuAbsoluteTerror(s.boss, s.dungeon, s.player, s.messages);

      expect(s.player.slowTurns).toBeGreaterThan(0);
      expect(s.player.immobileTurns).toBeGreaterThan(0);
      expect(s.messages.some(m => m.includes('アブソルートテラー'))).toBe(true);
      expect(s.messages.some(m => m.includes('鈍足になった'))).toBe(true);
      expect(s.messages.some(m => m.includes('動けなくなった'))).toBe(true);
    });

    it('体幹の指輪を装備していれば移動封じを防げる', () => {
      const s = setup();
      s.player.rings = [{ effect: 'trunk_ring' }];

      mireuAbsoluteTerror(s.boss, s.dungeon, s.player, s.messages);

      expect(s.player.slowTurns).toBeGreaterThan(0);
      expect(s.player.immobileTurns || 0).toBe(0);
      expect(s.messages.some(m => m.includes('体幹の指輪の力で恐怖の重圧に耐え切った'))).toBe(true);
    });
  });

  describe('特技4: メテオ', () => {
    it('メテオを詠唱し、自身はメテオ無効である', () => {
      const s = setup();
      s.player.x = 10;
      s.player.y = 10; // ボスと同じ中心（メテオ範囲内）

      const ok = castMeteor(s.boss, s.dungeon, s.player, s.messages);
      expect(ok).toBe(true);
      expect(s.dungeon.pendingMeteors?.length).toBe(1);
      expect(s.dungeon.pendingMeteors[0].damage).toBe(80);
      expect(s.boss.meteorCooldown).toBe(4);

      // 2ターン進めて着弾させる
      advanceMeteors(s.dungeon, s.player, s.messages, null, 1);
      advanceMeteors(s.dungeon, s.player, s.messages, null, 1);

      // ミレウはmeteorImmuneによりダメージを受けない
      expect(s.boss.hp).toBe(1400);
      expect(s.messages.some(m => m.includes('ミレウにはメテオが効かなかった'))).toBe(true);
    });
  });

  describe('monsterAI AI行動テスト', () => {
    it('隣接時はスパイクフレイルを準備して発動する', () => {
      const s = setup();
      s.boss.alwaysUseSpecial = true;
      s.player.x = 10;
      s.player.y = 8; // 隣接

      monsterAI(s.boss, s.dungeon, s.player, s.messages, { moveOnly: true });
      expect(s.boss._spikeFlailReady).toBe(true);

      monsterAI(s.boss, s.dungeon, s.player, s.messages, { attackOnly: true });
      expect(s.boss._spikeFlailReady).toBeUndefined();
      expect(s.messages.some(m => m.includes('スパイクフレイル'))).toBe(true);
    });

    it('遠距離直線上にいる時はハイパーサーミックブレスを準備して発動する', () => {
      const s = setup();
      s.boss.alwaysUseSpecial = true;
      s.player.x = 10;
      s.player.y = 5; // 遠距離直線

      monsterAI(s.boss, s.dungeon, s.player, s.messages, { moveOnly: true });
      expect(s.boss._hyperthermicBreathReady).toBe(true);

      monsterAI(s.boss, s.dungeon, s.player, s.messages, { attackOnly: true });
      expect(s.boss._hyperthermicBreathReady).toBeUndefined();
      expect(s.messages.some(m => m.includes('ハイパーサーミックブレス'))).toBe(true);
    });

    it('視界内にプレイヤーがいる時はメテオを準備して発動する', () => {
      const s = setup();
      s.boss.alwaysUseSpecial = true;
      // 直線上でも隣接でもないマス（x=14, y=3）
      s.player.x = 14;
      s.player.y = 3;
      s.boss.lastPx = 14;
      s.boss.lastPy = 3;

      monsterAI(s.boss, s.dungeon, s.player, s.messages, { moveOnly: true });
      expect(s.boss._meteorReady).toBe(true);

      monsterAI(s.boss, s.dungeon, s.player, s.messages, { attackOnly: true });
      expect(s.boss._meteorReady).toBeUndefined();
      expect(s.messages.some(m => m.includes('メテオを詠唱した'))).toBe(true);
      expect(s.dungeon.pendingMeteors?.length).toBe(1);
      expect(s.dungeon.pendingMeteors[0].damage).toBe(80);
    });

    it('メテオがクールダウン中の時はアブソルートテラーを準備して発動する', () => {
      const s = setup();
      s.boss.alwaysUseSpecial = true;
      s.boss.meteorCooldown = 3;
      // 直線上でも隣接でもないマス（x=14, y=3）
      s.player.x = 14;
      s.player.y = 3;
      s.boss.lastPx = 14;
      s.boss.lastPy = 3;

      monsterAI(s.boss, s.dungeon, s.player, s.messages, { moveOnly: true });
      expect(s.boss._absoluteTerrorReady).toBe(true);

      monsterAI(s.boss, s.dungeon, s.player, s.messages, { attackOnly: true });
      expect(s.boss._absoluteTerrorReady).toBeUndefined();
      expect(s.messages.some(m => m.includes('アブソルートテラー'))).toBe(true);
    });
  });
});
