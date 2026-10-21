import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import { genDungeon } from "../dungeon.js";
import { BATTERING_RAM, monsterAI } from "../monsters.js";
import { castPetroBreath, advancePetroBreaths, canCastPetroBreath } from "../petroBreath.js";
import { hasForcedTurn, advanceForcedTurn } from "../turnUpkeep.js";
import { T } from "../utils.js";
import { TILE_NAMES, TILE_RENDER } from "../render.js";
import { MONSTER_SHEET_MAP, DAWNLIKE_FALLBACKS } from "../tilesetMap.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

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

  it("特技：ラムチャージで通常ダメージと3マス吹き飛ばしが発生する", () => {
    const map = Array.from({ length: 20 }, () => Array(30).fill(T.FLOOR));
    const boss = {
      ...BATTERING_RAM,
      id: "ram-1",
      x: 10,
      y: 10,
      aware: true,
      turnAttacks: 0,
      _ramChargeReady: true, // 強制発動
    };
    // プレイヤーを右側に隣接配置 (x: 12, y: 10) - 2x2ボスの右端は x=11
    const player = makePlayer({ x: 12, y: 10, hp: 100 });
    const dg = makeEmptyDg({ map, monsters: [boss] });
    const messages = [];

    monsterAI(boss, dg, player, messages, { attackOnly: true });

    expect(messages.some(m => m.includes("バタリングラムのラムチャージ！"))).toBe(true);
    expect(player.hp).toBeLessThan(100);
    // 右方向に3マス吹き飛ばされて x=15 になる
    expect(player.x).toBe(15);
    expect(player.y).toBe(10);
  });

  it("体幹の指輪を装備しているとラムチャージで吹き飛ばない", () => {
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

  it("特技：ペトロブレスの予兆と次ターンの石化発射（敵味方無差別）", () => {
    const map = Array.from({ length: 20 }, () => Array(30).fill(T.FLOOR));
    const boss = {
      ...BATTERING_RAM,
      id: "ram-1",
      x: 10,
      y: 10,
      aware: true,
      turnAttacks: 0,
      _petroBreathReady: true,
    };
    // プレイヤー: x=12, y=10 (ボスの右隣接)
    const player = makePlayer({ x: 12, y: 10, hp: 100 });
    // 別モンスター（取り巻き）: x=13, y=10 (プレイヤーのさらに右＝ブレス2マス目の範囲内)
    const minion = { id: "minion-1", name: "取り巻き", x: 13, y: 10, hp: 30, maxHp: 30 };
    // 範囲外のモンスター: x=15, y=15
    const bystander = { id: "bystander-1", name: "傍観者", x: 15, y: 15, hp: 30, maxHp: 30 };

    const dg = makeEmptyDg({ map, monsters: [boss, minion, bystander] });
    const messages = [];

    // 1. 予兆予約
    monsterAI(boss, dg, player, messages, { attackOnly: true });
    expect(messages.some(m => m.includes("石化ブレスの予兆！"))).toBe(true);
    expect(dg.pendingPetroBreaths).toHaveLength(1);
    expect(dg.pendingPetroBreaths[0].cells).toEqual([
      { x: 12, y: 10 },
      { x: 13, y: 10 },
    ]);

    // この時点ではまだ石化していない
    expect(player.petrifiedTurns).toBe(0);
    expect(minion.petrifiedTurns).toBeUndefined();

    // 2. 次ターンのフロア進行でブレス着弾
    const breathMessages = [];
    advancePetroBreaths(dg, player, breathMessages, () => {}, 1);

    expect(breathMessages.some(m => m.includes("バタリングラムのペトロブレスが放たれた！"))).toBe(true);
    // プレイヤーが石化（4ターン）
    expect(player.petrifiedTurns).toBe(4);
    // 範囲内の敵（取り巻き）も石化（4ターン）
    expect(minion.petrifiedTurns).toBe(4);
    // 範囲外の敵は石化しない
    expect(bystander.petrifiedTurns).toBeUndefined();
    // 予約は消費されて空になる
    expect(dg.pendingPetroBreaths).toHaveLength(0);
  });

  it("祝福された聖域にいるプレイヤーは石化ブレスを防げる", () => {
    const map = Array.from({ length: 20 }, () => Array(30).fill(T.FLOOR));
    const player = makePlayer({ x: 12, y: 10, hp: 100 });
    const dg = makeEmptyDg({
      map,
      pentacles: [{ kind: "sanctuary", blessed: true, x: 12, y: 10 }],
      pendingPetroBreaths: [{
        sourceId: "ram-1",
        sourceName: "バタリングラム",
        turnsLeft: 1,
        cells: [{ x: 12, y: 10 }],
      }],
    });
    const messages = [];

    advancePetroBreaths(dg, player, messages, () => {}, 1);

    expect(messages.some(m => m.includes("祝福された聖域の加護が"))).toBe(true);
    expect(player.petrifiedTurns).toBe(0);
  });

  it("石化状態異常中はプレイヤー・モンスターともに行動不能になり4ターンで解除される", () => {
    const player = makePlayer({ petrifiedTurns: 4 });
    expect(hasForcedTurn(player)).toBe(true);

    const messages = [];
    // 1ターン目経過
    advanceForcedTurn(player, messages);
    expect(player.petrifiedTurns).toBe(3);
    expect(messages[messages.length - 1]).toBe("体が石化している...あと3ターン");

    // 2ターン目経過
    advanceForcedTurn(player, messages);
    expect(player.petrifiedTurns).toBe(2);

    // 3ターン目経過
    advanceForcedTurn(player, messages);
    expect(player.petrifiedTurns).toBe(1);

    // 4ターン目経過で解除
    advanceForcedTurn(player, messages);
    expect(player.petrifiedTurns).toBe(0);
    expect(messages[messages.length - 1]).toBe("石化が解けた！動けるようになった！");
    expect(hasForcedTurn(player)).toBe(false);

    // モンスターの石化処理
    const mon = { id: "m-1", name: "テスト敵", x: 5, y: 5, petrifiedTurns: 2, turnAccum: 0 };
    const dg = makeEmptyDg({ map: Array.from({ length: 10 }, () => Array(10).fill(T.FLOOR)), monsters: [mon] });
    const monMessages = [];

    // 移動しようとしても石化で行動できない
    monsterAI(mon, dg, player, monMessages, { moveOnly: true });
    expect(mon.x).toBe(5);
    expect(mon.y).toBe(5);
    expect(mon.petrifiedTurns).toBe(1);

    monsterAI(mon, dg, player, monMessages, { moveOnly: true });
    expect(mon.petrifiedTurns).toBe(0);
    expect(monMessages.some(m => m.includes("テスト敵の石化が解けた！"))).toBe(true);
  });
});
