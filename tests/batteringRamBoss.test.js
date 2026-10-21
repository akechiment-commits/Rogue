import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import { genDungeon } from "../dungeon.js";
import { BATTERING_RAM, monsterAI } from "../monsters.js";
import { castPetroBreath, advancePetroBreaths, canCastPetroBreath, getPetroBreathCells, drawPetroBreathWarnings } from "../petroBreath.js";
import { hasForcedTurn, advanceForcedTurn } from "../turnUpkeep.js";
import { T } from "../utils.js";
import { TILE_NAMES, TILE_RENDER } from "../render.js";
import { MONSTER_SHEET_MAP, DAWNLIKE_FALLBACKS } from "../tilesetMap.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { drainAnims } from "../animEvents.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("上級ダンジョン5階ボス：バタリングラム", () => {
  it("上級ダンジョン5階（depth=4）でバタリングラムがボスとして生成される", () => {
    const dg = genDungeon(4, "advanced");
    expect(dg.isBossFloor).toBe(true);
    const boss = dg.monsters.find(m => m.isBoss);
    expect(boss).toBeDefined();
    expect(boss.name).toBe("バタリングラム");
    expect(boss.baseKind).toBe("boss_batteringram");
    expect(boss.bodySize).toBe(2);
    expect(boss.tile).toBe(250);
  });

  it("初心者ダンジョンや中級ダンジョンの5階は既存のボスが生成される", () => {
    const begDg = genDungeon(4, "beginner");
    const begBoss = begDg.monsters.find(m => m.isBoss);
    expect(begBoss.baseKind).toBe("boss_blaze");

    const imDg = genDungeon(4, "intermediate");
    const imBoss = imDg.monsters.find(m => m.isBoss);
    expect(imBoss.baseKind).toBe("im_boss_salamander");
  });

  it("スタイル1・2・3のグラフィック登録が存在する", () => {
    // スタイル1: シンプル（文字）
    expect(TILE_NAMES[250]).toBe("battering_ram");
    expect(TILE_RENDER[250]).toMatchObject({ ch: "R" });

    // スタイル2: クラシック（DawnLike）
    expect(MONSTER_SHEET_MAP[250]).toBeDefined();
    expect(DAWNLIKE_FALLBACKS[250]).toBeDefined();

    // スタイル3: リッチ（PNG画像）
    expect(fs.existsSync("tiles/sprites/mon1/tile_250.png")).toBe(true);
    const stat = fs.statSync("tiles/sprites/mon1/tile_250.png");
    expect(stat.size).toBeGreaterThan(1000);
  });

  it("特技：ラムチャージで通常ダメージと3マス吹き飛ばしが発生し、メッセージが表示される", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const map = Array.from({ length: 20 }, () => Array(30).fill(T.FLOOR));
    const boss = {
      ...BATTERING_RAM,
      id: "ram-1",
      x: 10,
      y: 10,
      aware: true,
      turnAttacks: 0,
      _ramChargeReady: true,
    };
    // プレイヤーを右側に隣接配置 (x: 12, y: 10) - 2x2ボスの右端は x=11
    const player = makePlayer({ x: 12, y: 10, hp: 100 });
    const dg = makeEmptyDg({ map, monsters: [boss] });
    const messages = [];

    monsterAI(boss, dg, player, messages, { attackOnly: true });

    expect(messages.some(m => m.includes("バタリングラムのラムチャージ！"))).toBe(true);
    expect(messages.some(m => m.includes("強烈な体当たりで吹き飛ばされた！"))).toBe(true);
    expect(player.hp).toBeLessThan(100);
    // 右方向に3マス吹き飛ばされて x=15 になる
    expect(player.x).toBe(15);
    expect(player.y).toBe(10);
  });

  it("体幹の指輪を装備しているとラムチャージで吹き飛ばない", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const map = Array.from({ length: 20 }, () => Array(30).fill(T.FLOOR));
    const boss = {
      ...BATTERING_RAM,
      id: "ram-1",
      x: 10,
      y: 10,
      aware: true,
      turnAttacks: 0,
      _ramChargeReady: true,
    };
    const player = makePlayer({
      x: 12,
      y: 10,
      hp: 100,
      rings: [{ type: "ring", effect: "core_ring" }],
    });
    const dg = makeEmptyDg({ map, monsters: [boss] });
    const messages = [];

    monsterAI(boss, dg, player, messages, { attackOnly: true });

    expect(messages.some(m => m.includes("バタリングラムのラムチャージ！"))).toBe(true);
    expect(messages.some(m => m.includes("体幹の指輪のおかげで踏ん張った！"))).toBe(true);
    expect(player.x).toBe(12);
    expect(player.y).toBe(10);
  });

  describe("ペトロブレスの範囲計算", () => {
    const map = Array.from({ length: 30 }, () => Array(30).fill(T.FLOOR));
    const boss = { ...BATTERING_RAM, x: 10, y: 10 }; // 2x2: x in [10, 11], y in [10, 11]

    it("右方向（純粋な左右）：高さ2マス×前方2マス（計4マス）", () => {
      const player = { x: 12, y: 10 };
      const cells = getPetroBreathCells(boss, player, map);
      expect(cells).toHaveLength(4);
      expect(cells).toContainEqual({ x: 12, y: 10 });
      expect(cells).toContainEqual({ x: 12, y: 11 });
      expect(cells).toContainEqual({ x: 13, y: 10 });
      expect(cells).toContainEqual({ x: 13, y: 11 });
    });

    it("下方向（純粋な上下）：幅2マス×前方2マス（計4マス）", () => {
      const player = { x: 10, y: 12 };
      const cells = getPetroBreathCells(boss, player, map);
      expect(cells).toHaveLength(4);
      expect(cells).toContainEqual({ x: 10, y: 12 });
      expect(cells).toContainEqual({ x: 11, y: 12 });
      expect(cells).toContainEqual({ x: 10, y: 13 });
      expect(cells).toContainEqual({ x: 11, y: 13 });
    });

    it("斜め方向（右下）：角から前方2マス×扇状に広がる範囲", () => {
      const player = { x: 12, y: 12 };
      const cells = getPetroBreathCells(boss, player, map);
      expect(cells.length).toBeGreaterThanOrEqual(4);
      expect(cells).toContainEqual({ x: 12, y: 12 });
      expect(cells).toContainEqual({ x: 13, y: 13 });
    });
  });

  it("ブレスを吐くターンはボスが移動せずブレス発射に専念する", () => {
    const map = Array.from({ length: 20 }, () => Array(30).fill(T.FLOOR));
    const boss = {
      ...BATTERING_RAM,
      id: "ram-1",
      x: 10,
      y: 10,
      aware: true,
      turnAttacks: 0,
    };
    const player = makePlayer({ x: 12, y: 10, hp: 100 });
    // すでにブレス予約がある状態
    const dg = makeEmptyDg({
      map,
      monsters: [boss],
      pendingPetroBreaths: [{
        id: "breath-1",
        sourceId: "ram-1",
        sourceName: "バタリングラム",
        originX: 10,
        originY: 10,
        turnsLeft: 1,
        cells: [{ x: 12, y: 10 }, { x: 12, y: 11 }],
      }],
    });
    const messages = [];

    // 移動フェーズで移動しようとしても動かない
    monsterAI(boss, dg, player, messages, { moveOnly: true });
    expect(boss.x).toBe(10);
    expect(boss.y).toBe(10);
    expect(boss._movedThisTurn).toBe(true);

    // 攻撃フェーズでも別攻撃は行わない
    monsterAI(boss, dg, player, messages, { attackOnly: true });
    expect(messages.filter(m => m.includes("バタリングラムの攻撃"))).toHaveLength(0);
    expect(messages.filter(m => m.includes("ラムチャージ"))).toHaveLength(0);
  });

  it("1マス離れていてもペトロブレスの予兆を発動する（非隣接・距離2マス）", () => {
    const map = Array.from({ length: 20 }, () => Array(30).fill(T.FLOOR));
    // ボスは (10, 10)-(11, 11) の2x2。プレイヤーは (13, 10) で間に1マス（12, 10）空いている距離2マス
    const boss = {
      ...BATTERING_RAM,
      id: "ram-far",
      x: 10,
      y: 10,
      aware: true,
      turnAttacks: 0,
      alwaysUseSpecial: true,
    };
    const player = makePlayer({ x: 13, y: 10, hp: 100 });
    const dg = makeEmptyDg({ map, monsters: [boss] });
    const messages = [];

    // 移動フェーズ：移動せずペトロブレスを準備する
    monsterAI(boss, dg, player, messages, { moveOnly: true });
    expect(boss.x).toBe(10);
    expect(boss.y).toBe(10);
    expect(boss._petroBreathReady).toBe(true);
    expect(boss._ramChargeReady).toBeUndefined(); // ラムチャージは隣接時のみ

    // 攻撃フェーズ：ペトロブレス予兆が登録され、ボス本体に _isPetroBreathing フラグが立つ
    monsterAI(boss, dg, player, messages, { attackOnly: true });
    expect(dg.pendingPetroBreaths).toHaveLength(1);
    expect(boss._isPetroBreathing).toBe(true);
    expect(messages.some(m => m.includes("前方広範囲に石化ブレスの予兆！"))).toBe(true);
  });

  it("ブレス予兆後にプレイヤーが斜めに動いてもラムは動かず次ターン確実にブレスを発射する", () => {
    const map = Array.from({ length: 20 }, () => Array(30).fill(T.FLOOR));
    const boss = {
      ...BATTERING_RAM,
      id: "ram-stay",
      x: 10,
      y: 10,
      aware: true,
      turnAttacks: 0,
    };
    // プレイヤーが斜めに退避した位置 (13, 9)
    const player = makePlayer({ x: 13, y: 9, hp: 100 });
    const dg = makeEmptyDg({ map, monsters: [boss] });
    const messages = [];

    // 予兆を発動させる
    castPetroBreath(boss, dg, player, messages);
    expect(boss._isPetroBreathing).toBe(true);
    expect(dg.pendingPetroBreaths).toHaveLength(1);

    // プレイヤーが斜めに移動した後の敵移動フェーズ：ボスは絶対に変な方向へ動かない
    monsterAI(boss, dg, player, messages, { moveOnly: true });
    expect(boss.x).toBe(10);
    expect(boss.y).toBe(10);
    expect(boss._movedThisTurn).toBe(true);

    // フロア時計によるブレス解決：中断されず発射される！
    drainAnims(); // 既存アニメーションをクリア
    advancePetroBreaths(dg, player, messages, () => {}, 1);
    expect(messages.some(m => m.includes("ペトロブレスが放たれた！"))).toBe(true);
    expect(messages.some(m => m.includes("中断された"))).toBe(false);
    expect(boss._isPetroBreathing).toBeUndefined();

    // 効果範囲の全マスに petroBreath 視覚エフェクトが発行されている
    const anims = drainAnims();
    const petroEvts = anims.filter(a => a.type === "petroBreath");
    expect(petroEvts.length).toBeGreaterThanOrEqual(4);
  });

  it("封印・行動不能・強制移動でブレスの予兆が中断される", () => {
    const map = Array.from({ length: 20 }, () => Array(30).fill(T.FLOOR));

    // 1. 封印（sealed）
    {
      const boss = { ...BATTERING_RAM, id: "ram-sealed", x: 10, y: 10, sealed: true };
      const player = makePlayer({ x: 12, y: 10 });
      const dg = makeEmptyDg({
        map,
        monsters: [boss],
        pendingPetroBreaths: [{
          sourceId: "ram-sealed",
          sourceName: "バタリングラム",
          originX: 10,
          originY: 10,
          turnsLeft: 1,
          cells: [{ x: 12, y: 10 }],
        }],
      });
      const messages = [];
      advancePetroBreaths(dg, player, messages, () => {}, 1);
      expect(messages.some(m => m.includes("石化ブレスは中断された！"))).toBe(true);
      expect(player.petrifiedTurns).toBe(0);
    }

    // 2. 行動不能（睡眠 sleepTurns > 0）
    {
      const boss = { ...BATTERING_RAM, id: "ram-sleep", x: 10, y: 10, sleepTurns: 3 };
      const player = makePlayer({ x: 12, y: 10 });
      const dg = makeEmptyDg({
        map,
        monsters: [boss],
        pendingPetroBreaths: [{
          sourceId: "ram-sleep",
          sourceName: "バタリングラム",
          originX: 10,
          originY: 10,
          turnsLeft: 1,
          cells: [{ x: 12, y: 10 }],
        }],
      });
      const messages = [];
      advancePetroBreaths(dg, player, messages, () => {}, 1);
      expect(messages.some(m => m.includes("石化ブレスは中断された！"))).toBe(true);
      expect(player.petrifiedTurns).toBe(0);
    }

    // 3. 強制移動（吹き飛ばし等で座標がズレた）
    {
      const boss = { ...BATTERING_RAM, id: "ram-moved", x: 7, y: 10 }; // originX: 10 から移動
      const player = makePlayer({ x: 12, y: 10 });
      const dg = makeEmptyDg({
        map,
        monsters: [boss],
        pendingPetroBreaths: [{
          sourceId: "ram-moved",
          sourceName: "バタリングラム",
          originX: 10,
          originY: 10,
          turnsLeft: 1,
          cells: [{ x: 12, y: 10 }],
        }],
      });
      const messages = [];
      advancePetroBreaths(dg, player, messages, () => {}, 1);
      expect(messages.some(m => m.includes("石化ブレスは中断された！"))).toBe(true);
      expect(player.petrifiedTurns).toBe(0);
    }
  });

  it("予兆描画にはメテオと同じく残りターン数が描画される", () => {
    const dg = makeEmptyDg({
      visible: Array.from({ length: 20 }, () => Array(30).fill(true)),
      pendingPetroBreaths: [{
        sourceId: "ram-1",
        turnsLeft: 1,
        cells: [{ x: 12, y: 10 }],
      }],
    });
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      strokeText: vi.fn(),
      fillText: vi.fn(),
    };

    drawPetroBreathWarnings(ctx, dg, 0, 0, 16);

    expect(ctx.strokeText).toHaveBeenCalledWith("1", expect.any(Number), expect.any(Number));
    expect(ctx.fillText).toHaveBeenCalledWith("1", expect.any(Number), expect.any(Number));
  });

  it("石化状態異常中はプレイヤー・モンスターともに行動不能になり4ターンで解除される", () => {
    const player = makePlayer({ petrifiedTurns: 4 });
    expect(hasForcedTurn(player)).toBe(true);

    const messages = [];
    advanceForcedTurn(player, messages);
    expect(player.petrifiedTurns).toBe(3);

    advanceForcedTurn(player, messages);
    expect(player.petrifiedTurns).toBe(2);

    advanceForcedTurn(player, messages);
    expect(player.petrifiedTurns).toBe(1);

    advanceForcedTurn(player, messages);
    expect(player.petrifiedTurns).toBe(0);
    expect(messages[messages.length - 1]).toBe("石化が解けた！動けるようになった！");
    expect(hasForcedTurn(player)).toBe(false);

    // モンスターの石化処理
    const mon = { id: "m-1", name: "テスト敵", x: 5, y: 5, petrifiedTurns: 2, turnAccum: 0 };
    const dg = makeEmptyDg({ map: Array.from({ length: 10 }, () => Array(10).fill(T.FLOOR)), monsters: [mon] });
    const monMessages = [];

    monsterAI(mon, dg, player, monMessages, { moveOnly: true });
    expect(mon.x).toBe(5);
    expect(mon.y).toBe(5);
    expect(mon.petrifiedTurns).toBe(1);

    monsterAI(mon, dg, player, monMessages, { moveOnly: true });
    expect(mon.petrifiedTurns).toBe(0);
    expect(monMessages.some(m => m.includes("テスト敵の石化が解けた！"))).toBe(true);
  });
});
