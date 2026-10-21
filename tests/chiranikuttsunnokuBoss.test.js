import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import { genDungeon } from "../dungeon.js";
import { CHIRANIKUTSUNNOKU, BATTERING_RAM, KING_BEHINMOS, monsterAI } from "../monsters.js";
import {
  canUseChiranikuttsunnokuSpecial,
  chiranikuttsunnokuEarthbreaker,
  getVenomStingOriginAndDir,
  chiranikuttsunnokuVenomSting,
  chiranikuttsunnokuSharpStrike,
} from "../chiranikuttsunnoku.js";
import { T } from "../utils.js";
import { TILE_NAMES, TILE_RENDER } from "../render.js";
import { MONSTER_SHEET_MAP, DAWNLIKE_FALLBACKS } from "../tilesetMap.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("上級ダンジョン15階ボス：ちらにくつんのく", () => {
  it("上級ダンジョン15階（depth=14）でちらにくつんのくがボスとして生成される", () => {
    const dg = genDungeon(14, "advanced");
    expect(dg.isBossFloor).toBe(true);
    const boss = dg.monsters.find(m => m.isBoss);
    expect(boss).toBeDefined();
    expect(boss.name).toBe("ちらにくつんのく");
    expect(boss.baseKind).toBe("boss_chiranikuttsunnoku");
    expect(boss.bodySize).toBe(2);
    expect(boss.tile).toBe(251);
    expect(boss.hp).toBe(720);
    expect(boss.atk).toBe(58);
    expect(boss.def).toBe(34);
    expect(boss.kind).toBe("insect");
  });

  it("上級ダンジョンの他階層や他ダンジョンの15階との棲み分けが正しい", () => {
    // 上級5Fはバタリングラム
    const dg5 = genDungeon(4, "advanced");
    expect(dg5.monsters.find(m => m.isBoss).baseKind).toBe("boss_batteringram");

    // 上級20Fはキングベヒんもス
    const dg20 = genDungeon(19, "advanced");
    expect(dg20.monsters.find(m => m.isBoss).baseKind).toBe("boss_kingbehinmos");

    // 上級25Fはオープレンティ
    const dg25 = genDungeon(24, "advanced");
    expect(dg25.monsters.find(m => m.isBoss).baseKind).toBe("boss_ohplenty");

    // 初心者ダンジョン15F
    const begDg = genDungeon(14, "beginner");
    expect(begDg.monsters.find(m => m.isBoss).baseKind).not.toBe("boss_chiranikuttsunnoku");

    // 中級ダンジョン15F
    const imDg = genDungeon(14, "intermediate");
    expect(imDg.monsters.find(m => m.isBoss).baseKind).not.toBe("boss_chiranikuttsunnoku");
  });

  it("スタイル1・2・3のグラフィック登録が存在する", () => {
    // スタイル1: シンプル（文字）
    expect(TILE_NAMES[251]).toBe("chiranikuttsunnoku");
    expect(TILE_RENDER[251]).toMatchObject({ ch: "S" });

    // スタイル2: クラシック（DawnLike）
    expect(MONSTER_SHEET_MAP[251]).toBeDefined();
    expect(DAWNLIKE_FALLBACKS[251]).toBeDefined();

    // スタイル3: リッチ（PNG画像）
    expect(fs.existsSync("tiles/sprites/mon1/tile_251.png")).toBe(true);
    expect(fs.existsSync("public/tiles/chiranikuttsunnoku.png")).toBe(true);
    const stat1 = fs.statSync("tiles/sprites/mon1/tile_251.png");
    const stat2 = fs.statSync("public/tiles/chiranikuttsunnoku.png");
    expect(stat1.size).toBeGreaterThan(1000);
    expect(stat2.size).toBeGreaterThan(1000);
  });

  describe("特技1: アースブレイカー", () => {
    it("周囲1マスに無差別にダメージ＋転倒を与える（プレイヤーは所持品落とし、モンスターは2ターン行動不能）", () => {
      const dg = makeEmptyDg();
      const boss = {
        ...CHIRANIKUTSUNNOKU,
        id: "chira-1",
        x: 10,
        y: 10, // 2x2: (10,10), (11,10), (10,11), (11,11)
        hp: 720,
      };
      // プレイヤーを右側に隣接配置 (12, 10)、未装備アイテムを所持
      const pl = makePlayer({
        x: 12,
        y: 10,
        hp: 100,
        maxHp: 100,
        def: 10,
        inventory: [
          { name: "薬草", type: "potion" },
          { name: "毒消し草", type: "potion" },
          { name: "あかりの巻物", type: "scroll" },
        ],
      });
      // 他モンスターを周囲に配置 (10, 9)
      const minion = {
        name: "ゴブリン",
        id: "gob-1",
        x: 10,
        y: 9,
        hp: 200,
        maxHp: 200,
        def: 5,
      };
      dg.monsters = [boss, minion];

      const ml = [];
      chiranikuttsunnokuEarthbreaker(boss, dg, pl, ml);

      // プレイヤーへのダメージと転倒（アイテム落とし。行動不能ではない）
      expect(pl.hp).toBeLessThan(100);
      expect(pl.knockdownTurns).toBeUndefined(); // 行動不能フラグは付かない
      expect(pl.inventory.length).toBeLessThan(3); // アイテムを落とした
      expect(ml.some(m => m.includes("アースブレイカー"))).toBe(true);
      expect(ml.some(m => m.includes("転んでしまった！"))).toBe(true);
      expect(ml.some(m => m.includes("落とした！"))).toBe(true);

      // モンスターへのダメージと転倒（敵は2ターン行動不能）
      expect(minion.hp).toBeLessThan(200);
      expect(minion.knockdownTurns).toBe(2);
      expect(ml.some(m => m.includes("ゴブリンは激しい地響きで転倒した！"))).toBe(true);
    });

    it("体幹の指輪を装備していればプレイヤーはアイテムを落とさない", () => {
      const dg = makeEmptyDg();
      const boss = {
        ...CHIRANIKUTSUNNOKU,
        id: "chira-1",
        x: 10,
        y: 10,
        hp: 720,
      };
      const ring = { name: "体幹の指輪", type: "ring", effect: "core_ring" };
      const pl = makePlayer({
        x: 12,
        y: 10,
        hp: 100,
        maxHp: 100,
        def: 10,
        rings: [ring],
        inventory: [
          ring,
          { name: "薬草", type: "potion" },
        ],
      });
      dg.monsters = [boss];

      const ml = [];
      chiranikuttsunnokuEarthbreaker(boss, dg, pl, ml);

      expect(pl.hp).toBeLessThan(100);
      expect(pl.inventory.length).toBe(2); // アイテムは落ちていない
      expect(ml.some(m => m.includes("体幹の指輪で踏ん張り、転ばなかった！"))).toBe(true);
    });

    it("浮遊しているキャラにはアースブレイカーが無効化される", () => {
      const dg = makeEmptyDg();
      const boss = {
        ...CHIRANIKUTSUNNOKU,
        id: "chira-1",
        x: 10,
        y: 10,
        hp: 720,
      };
      // 浮遊プレイヤー
      const pl = makePlayer({ x: 12, y: 10, hp: 100, maxHp: 100, floatTurns: 10 });
      // 浮遊モンスター
      const flyingMon = {
        name: "大コウモリ",
        id: "bat-1",
        x: 10,
        y: 9,
        hp: 50,
        maxHp: 50,
        floatTurns: 10,
      };
      dg.monsters = [boss, flyingMon];

      const ml = [];
      chiranikuttsunnokuEarthbreaker(boss, dg, pl, ml);

      // プレイヤーはダメージも転倒も受けない
      expect(pl.hp).toBe(100);
      expect(pl.knockdownTurns).toBeUndefined();
      expect(ml.some(m => m.includes("宙に浮いているためアースブレイカーの揺れを受けない！"))).toBe(true);

      // 浮遊モンスターもダメージも転倒も受けない
      expect(flyingMon.hp).toBe(50);
      expect(flyingMon.knockdownTurns).toBeUndefined();
      expect(ml.some(m => m.includes("大コウモリは宙に浮いているためアースブレイカーの揺れを受けない！"))).toBe(true);
    });
  });

  describe("特技2: ベノムスティング", () => {
    it("遠距離直線上のプレイヤーを検知して毒針を放ち、ダメージと毒を付与する", () => {
      const dg = makeEmptyDg();
      const boss = {
        ...CHIRANIKUTSUNNOKU,
        id: "chira-1",
        x: 5,
        y: 5, // (5,5), (6,5), (5,6), (6,6)
      };
      // プレイヤーを直線5マス先 (12, 5) に配置
      const pl = makePlayer({ x: 12, y: 5, hp: 100, maxHp: 100 });
      dg.monsters = [boss];

      const aim = getVenomStingOriginAndDir(boss, dg, pl);
      expect(aim).toBeDefined();
      expect(aim.dx).toBe(1);
      expect(aim.dy).toBe(0);

      // 命中モック (Math.random < 0.80)
      vi.spyOn(Math, "random").mockReturnValue(0.1);
      const ml = [];
      chiranikuttsunnokuVenomSting(boss, dg, pl, ml, null, aim);

      expect(pl.hp).toBeLessThan(100);
      expect(pl.poisonedTurns).toBeGreaterThan(0);
      expect(ml.some(m => m.includes("ベノムスティング"))).toBe(true);
      expect(ml.some(m => m.includes("猛毒針が突き刺さった！毒を受けた！"))).toBe(true);
    });

    it("命中率80%判定で外れた場合はダメージも毒も受けない", () => {
      const dg = makeEmptyDg();
      const boss = {
        ...CHIRANIKUTSUNNOKU,
        id: "chira-1",
        x: 5,
        y: 5,
      };
      const pl = makePlayer({ x: 12, y: 5, hp: 100, maxHp: 100 });
      dg.monsters = [boss];

      const aim = getVenomStingOriginAndDir(boss, dg, pl);
      expect(aim).toBeDefined();

      // ミスモック (Math.random >= 0.80)
      vi.spyOn(Math, "random").mockReturnValue(0.95);
      const ml = [];
      chiranikuttsunnokuVenomSting(boss, dg, pl, ml, null, aim);

      expect(pl.hp).toBe(100);
      expect(pl.poisonedTurns).toBeUndefined();
      expect(ml.some(m => m.includes("外れた！"))).toBe(true);
    });
  });

  describe("特技3: シャープストライク", () => {
    it("10ターンの間、攻撃力1.5倍バフが付与される", () => {
      const boss = {
        ...CHIRANIKUTSUNNOKU,
        id: "chira-1",
        atk: 58,
      };
      const ml = [];
      chiranikuttsunnokuSharpStrike(boss, ml);

      expect(boss.sharpStrikeTurns).toBe(10);
      expect(ml.some(m => m.includes("10ターンの間、攻撃力が1.5倍になった！"))).toBe(true);
    });

    it("シャープストライク中はアースブレイカーの攻撃力計算が1.5倍（58 -> 87）になる", () => {
      const dg = makeEmptyDg();
      const bossNormal = {
        ...CHIRANIKUTSUNNOKU,
        id: "boss-norm",
        x: 10,
        y: 10,
        atk: 60,
      };
      const bossBuffed = {
        ...CHIRANIKUTSUNNOKU,
        id: "boss-buff",
        x: 10,
        y: 10,
        atk: 60,
        sharpStrikeTurns: 10,
      };

      const pl1 = makePlayer({ x: 12, y: 10, hp: 500, maxHp: 500, def: 0 });
      const pl2 = makePlayer({ x: 12, y: 10, hp: 500, maxHp: 500, def: 0 });

      // 乱数分散を0に固定
      vi.spyOn(Math, "random").mockReturnValue(0.5);

      const ml1 = [];
      chiranikuttsunnokuEarthbreaker(bossNormal, dg, pl1, ml1);
      const dmgNormal = 500 - pl1.hp;

      const ml2 = [];
      chiranikuttsunnokuEarthbreaker(bossBuffed, dg, pl2, ml2);
      const dmgBuffed = 500 - pl2.hp;

      // バフ時は1.5倍（60 -> 90）前後のダメージとなるため明らかに大きい
      expect(dmgBuffed).toBeGreaterThan(dmgNormal);
    });
  });

  describe("AIの特技ルーチン連動", () => {
    it("特技使用不可（封印など）の場合は特技を発動しない", () => {
      const sealedBoss = {
        ...CHIRANIKUTSUNNOKU,
        sealed: true,
      };
      expect(canUseChiranikuttsunnokuSpecial(sealedBoss)).toBe(false);

      const sleepBoss = {
        ...CHIRANIKUTSUNNOKU,
        sleepTurns: 3,
      };
      expect(canUseChiranikuttsunnokuSpecial(sleepBoss)).toBe(false);

      const normalBoss = {
        ...CHIRANIKUTSUNNOKU,
      };
      expect(canUseChiranikuttsunnokuSpecial(normalBoss)).toBe(true);
    });
  });
});
