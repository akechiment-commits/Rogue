import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import { genDungeon } from "../dungeon.js";
import { TAISAIJIN, BATTERING_RAM, CHIRANIKUTSUNNOKU, KING_BEHINMOS, monsterAI } from "../monsters.js";
import {
  canUseTaisaijinSpecial,
  isFarLineToPlayer,
  taisaijinHypnosis,
  taisaijinBlazeSpike,
  taisaijinRefresh,
} from "../taisaijin.js";
import { T } from "../utils.js";
import { TILE_NAMES, TILE_RENDER } from "../render.js";
import { MONSTER_SHEET_MAP, DAWNLIKE_FALLBACKS } from "../tilesetMap.js";
import { drainAnims } from "../animEvents.js";
import { drawMonsterOverlays } from "../useGameRenderer.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("上級ダンジョン10階ボス：タイサイジン", () => {
  it("上級ダンジョン10階（depth=9）でタイサイジンがボスとして生成される", () => {
    const dg = genDungeon(9, "advanced");
    expect(dg.isBossFloor).toBe(true);
    const boss = dg.monsters.find(m => m.isBoss);
    expect(boss).toBeDefined();
    expect(boss.name).toBe("タイサイジン");
    expect(boss.baseKind).toBe("boss_taisaijin");
    expect(boss.tile).toBe(252);
    expect(boss.elemWeak).toBe("fire");
    expect(TAISAIJIN.elemWeak).toBe("fire");
    expect(boss.hp).toBe(520);
    expect(boss.atk).toBe(30);
    expect(boss.def).toBe(26);
    expect(boss.maxAttacks).toBe(2);
    expect(boss.kind).toBe("beast");
  });

  it("上級ダンジョンの他階層や他ダンジョンの10階との棲み分けが正しい", () => {
    // 上級5F
    const dg5 = genDungeon(4, "advanced");
    expect(dg5.monsters.find(m => m.isBoss).baseKind).toBe("boss_batteringram");

    // 上級15F
    const dg15 = genDungeon(14, "advanced");
    expect(dg15.monsters.find(m => m.isBoss).baseKind).toBe("boss_chiranikuttsunnoku");

    // 上級20F
    const dg20 = genDungeon(19, "advanced");
    expect(dg20.monsters.find(m => m.isBoss).baseKind).toBe("boss_kingbehinmos");

    // 上級25F
    const dg25 = genDungeon(24, "advanced");
    expect(dg25.monsters.find(m => m.isBoss).baseKind).toBe("boss_ohplenty");

    // 中級10F（ティターン）
    const imDg = genDungeon(9, "intermediate");
    expect(imDg.monsters.find(m => m.isBoss).baseKind).toBe("im_boss_titan");

    // 初心者10F（ハイドラ）
    const begDg = genDungeon(9, "beginner");
    expect(begDg.monsters.find(m => m.isBoss).baseKind).not.toBe("boss_taisaijin");
  });

  it("スタイル1・2・3のグラフィック登録が存在する", () => {
    // スタイル1: シンプル（文字）
    expect(TILE_NAMES[252]).toBe("taisaijin");
    expect(TILE_RENDER[252]).toMatchObject({ ch: "T" });

    // スタイル2: クラシック（DawnLike）
    expect(MONSTER_SHEET_MAP[252]).toBeDefined();
    expect(DAWNLIKE_FALLBACKS[252]).toBeDefined();

    // スタイル3: リッチ（PNG画像）
    expect(fs.existsSync("tiles/sprites/mon1/tile_252.png")).toBe(true);
    expect(fs.existsSync("public/tiles/taisaijin.png")).toBe(true);
    const stat1 = fs.statSync("tiles/sprites/mon1/tile_252.png");
    const stat2 = fs.statSync("public/tiles/taisaijin.png");
    expect(stat1.size).toBeGreaterThan(1000);
    expect(stat2.size).toBeGreaterThan(1000);
  });

  describe("特技1: 催眠（遠距離直線上に25%）", () => {
    it("遠距離直線上にいるプレイヤーを検知して催眠をかけ、hypnosisPendingを付与する", () => {
      const dg = makeEmptyDg();
      const boss = {
        ...TAISAIJIN,
        id: "tai-1",
        x: 5,
        y: 5,
      };
      // 直線4マス先
      const pl = makePlayer({ x: 9, y: 5 });
      dg.monsters = [boss];

      expect(isFarLineToPlayer(boss, dg, pl)).toBe(true);

      const ml = [];
      taisaijinHypnosis(boss, dg, pl, ml);

      expect(pl.hypnosisPending).toBe(1);
      expect(ml.some(m => m.includes("催眠術をかけた！"))).toBe(true);
    });

    it("隣接（距離1）や斜め直線から外れた位置では遠距離直線の判定がfalseになる", () => {
      const dg = makeEmptyDg();
      const boss = { ...TAISAIJIN, x: 5, y: 5 };

      // 隣接
      const plAdjacent = makePlayer({ x: 6, y: 5 });
      expect(isFarLineToPlayer(boss, dg, plAdjacent)).toBe(false);

      // 直線外 (ナイトの動きなど)
      const plOffLine = makePlayer({ x: 7, y: 6 });
      expect(isFarLineToPlayer(boss, dg, plOffLine)).toBe(false);
    });

    it("祝福された聖域の上にいるプレイヤーには催眠が防がれる", () => {
      const dg = makeEmptyDg();
      dg.pentacles = [{ kind: "sanctuary", blessed: true, x: 9, y: 5 }];
      const boss = { ...TAISAIJIN, x: 5, y: 5 };
      const pl = makePlayer({ x: 9, y: 5 });
      dg.monsters = [boss];

      const ml = [];
      taisaijinHypnosis(boss, dg, pl, ml);

      expect(pl.hypnosisPending).toBeFalsy();
      expect(ml.some(m => m.includes("祝福された聖域の加護がタイサイジンの催眠術を防いだ！"))).toBe(true);
    });
  });

  describe("特技2: ブレイズスパイク（炎まとい状態）", () => {
    it("ブレイズスパイクを唱えて炎まとい状態（10ターン）になる", () => {
      const dg = makeEmptyDg();
      const boss = {
        ...TAISAIJIN,
        id: "tai-1",
        x: 5,
        y: 5,
      };
      const ml = [];
      taisaijinBlazeSpike(boss, dg, ml);

      expect(boss.flameMantleTurns).toBe(10);
      expect(ml.some(m => m.includes("ブレイズスパイクを唱えた！"))).toBe(true);
      expect(ml.some(m => m.includes("炎を身にまとった！"))).toBe(true);
    });
  });

  describe("特技3: リフレシュ（HP持続回復：20ターン毎ターン5回復）", () => {
    it("リフレシュを唱えて20ターンの持続回復状態になり、毎ターン5HP回復する", () => {
      const dg = makeEmptyDg();
      const boss = {
        ...TAISAIJIN,
        id: "tai-1",
        x: 5,
        y: 5,
        hp: 400,
        maxHp: 520,
      };
      const ml = [];
      taisaijinRefresh(boss, dg, ml);

      expect(boss.refreshTurns).toBe(20);
      expect(ml.some(m => m.includes("リフレシュを唱えた！"))).toBe(true);

      // AIターン行動による回復の検証
      const pl = makePlayer({ x: 10, y: 10 });
      dg.monsters = [boss];
      const turnMsgs = [];
      // 1ターン経過
      monsterAI(boss, dg, pl, turnMsgs);

      expect(boss.hp).toBe(405);
      expect(boss.refreshTurns).toBe(19);
      expect(turnMsgs.some(m => m.includes("リフレシュの力で回復した！(+5HP)"))).toBe(true);
    });

    it("最大HPを超えては回復しない", () => {
      const dg = makeEmptyDg();
      const boss = {
        ...TAISAIJIN,
        id: "tai-1",
        x: 5,
        y: 5,
        hp: 518,
        maxHp: 520,
        refreshTurns: 5,
      };
      const pl = makePlayer({ x: 10, y: 10 });
      dg.monsters = [boss];
      const ml = [];
      monsterAI(boss, dg, pl, ml);

      expect(boss.hp).toBe(520);
      expect(boss.refreshTurns).toBe(4);
      expect(ml.some(m => m.includes("リフレシュの力で回復した！(+2HP)"))).toBe(true);
    });
  });

  describe("特技使用不可（封印など）の判定", () => {
    it("封印時は特技を使用できない", () => {
      const sealedBoss = { ...TAISAIJIN, sealed: true };
      expect(canUseTaisaijinSpecial(sealedBoss)).toBe(false);

      const normalBoss = { ...TAISAIJIN };
      expect(canUseTaisaijinSpecial(normalBoss)).toBe(true);
    });
  });

  describe("通常攻撃の2回攻撃", () => {
    it("隣接時に通常攻撃を行うと2回攻撃を実行する", () => {
      const dg = makeEmptyDg();
      const boss = {
        ...TAISAIJIN,
        id: "tai-1",
        x: 5,
        y: 5,
        turnAttacks: 0,
      };
      // プレイヤーが隣接 (6, 5)
      const pl = makePlayer({ x: 6, y: 5, hp: 200, maxHp: 200, def: 0 });
      dg.monsters = [boss];
      const ml = [];

      // attackOnly フェーズで行動
      monsterAI(boss, dg, pl, ml, { attackOnly: true });

      expect(boss.turnAttacks).toBe(2);
      const attackMsgs = ml.filter(m => m.includes("タイサイジンの攻撃"));
      expect(attackMsgs.length).toBe(2);
    });

    it("封印時は1回攻撃になる", () => {
      const dg = makeEmptyDg();
      const boss = {
        ...TAISAIJIN,
        id: "tai-1",
        x: 5,
        y: 5,
        turnAttacks: 0,
        sealed: true,
      };
      const pl = makePlayer({ x: 6, y: 5, hp: 200, maxHp: 200, def: 0 });
      dg.monsters = [boss];
      const ml = [];

      monsterAI(boss, dg, pl, ml, { attackOnly: true });

      expect(boss.turnAttacks).toBe(1);
      const attackMsgs = ml.filter(m => m.includes("タイサイジンの攻撃"));
      expect(attackMsgs.length).toBe(1);
    });
  });

  describe("エフェクトと状態異常アイコンの表示", () => {
    it("ブレイズスパイク・リフレシュ使用時に専用エフェクトがプッシュされる", () => {
      drainAnims(); // 既存クリア
      const dg = makeEmptyDg();
      const boss = { ...TAISAIJIN, id: "tai-1", x: 5, y: 5 };
      const ml = [];

      taisaijinBlazeSpike(boss, dg, ml);
      const spikeAnims = drainAnims();
      expect(spikeAnims.some(a => a.type === "flameMantle" && a.x === 5 && a.y === 5)).toBe(true);

      taisaijinRefresh(boss, dg, ml);
      const refreshAnims = drainAnims();
      expect(refreshAnims.some(a => a.type === "refresh" && a.x === 5 && a.y === 5)).toBe(true);
    });

    it("drawMonsterOverlaysで炎まとい・持続回復の四角アイコンが描画される", () => {
      const fills = [];
      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        arc: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        strokeRect: vi.fn(),
        fillText: vi.fn(),
        strokeText: vi.fn(),
        fillRect: vi.fn((x, y, w, h) => {
          fills.push({ fillStyle: mockCtx.fillStyle, x, y, w, h });
        }),
        fillStyle: "#000000",
        strokeStyle: "#000000",
        lineWidth: 1,
        globalAlpha: 1,
      };

      const boss = {
        ...TAISAIJIN,
        x: 5,
        y: 5,
        flameMantleTurns: 8,
        refreshTurns: 15,
      };

      drawMonsterOverlays(mockCtx, boss, 50, 50, 32);

      // #ff4800 (炎まとい) と #20e060 (リフレシュ) の四角アイコンが描画されていることを確認
      const hasFlameMantleIcon = fills.some(f => f.fillStyle === "#ff4800");
      const hasRefreshIcon = fills.some(f => f.fillStyle === "#20e060");
      expect(hasFlameMantleIcon).toBe(true);
      expect(hasRefreshIcon).toBe(true);
    });
  });
});
