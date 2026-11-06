import { afterEach, describe, expect, it, vi } from "vitest";
import { genDungeon } from "../dungeon.js";
import { OMEGA_BOSS, SHINRYU_BOSS, monsterAI } from "../monsters.js";
import { monsterDistance, monsterBodiesOverlap } from "../monsterGeometry.js";
import {
  attackOmegaShinryuAdjacentCells,
  advanceOmegaShinryuAttacks,
  castOmegaMustardBomb,
  chooseOmegaAttack,
  chooseShinryuAttack,
  getOmegaShinryuLine,
  queueOmegaShinryuAttack,
} from "../omegaShinryu.js";
import { drawTimeBombWarnings, timeBombBlastCells } from "../timeBombWarnings.js";
import { monHasElementWeakness, monReflectsMagic } from "../monTraits.js";
import { installShinryuMightyGuardHpHook } from "../mightyGuardHp.js";
import { resolveTurnHazards } from "../turnHazards.js";
import { saveGameState, loadGameState } from "../GameSave.js";
import { TILE_NAMES, TILE_RENDER } from "../render.js";
import { MONSTER_SHEET_MAP, DAWNLIKE_FALLBACKS } from "../tilesetMap.js";
import { T, MW, MH } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function visibleRoom() {
  const visible = Array.from({ length: MH }, () => Array(MW).fill(true));
  return { rooms: [{ x: 1, y: 1, w: 30, h: 20 }], visible, explored: visible.map(row => [...row]) };
}

function bombHazardDeps(doTimeBombExplosion) {
  return {
    hasRingEffect: () => false,
    doExplosion: () => {},
    runMineExplosion: () => {},
    doTimeBombExplosion,
    fireTrapPlayer: () => {},
    getItemName: item => item.name,
    lu: () => {},
    ident: new Set(),
  };
}

describe("超上級B45F オメガ・神竜", () => {
  it("B45Fは隣接する3×3ボス2体に置き換え、他ダンジョンの標準ボスは維持する", () => {
    const legendary = genDungeon(44, "legend");
    const omega = legendary.monsters.find(monster => monster.baseKind === "boss_omega");
    const shinryu = legendary.monsters.find(monster => monster.baseKind === "boss_shinryu");
    expect(omega).toBeDefined();
    expect(shinryu).toBeDefined();
    expect(legendary.monsters).toHaveLength(2);
    expect(omega.bodySize).toBe(3);
    expect(shinryu.bodySize).toBe(3);
    expect(monsterBodiesOverlap(omega, shinryu)).toBe(false);
    expect(monsterDistance(omega, shinryu)).toBe(1);

    const advanced = genDungeon(44, "advanced");
    expect(advanced.monsters.find(monster => monster.isBoss)?.baseKind).toBe("boss_infernoking");
  });

  it("特技の抽選率を遠距離・隣接・視界内条件ごとに分ける", () => {
    const far = { distance: 5 };
    expect(chooseOmegaAttack(far, false, true, () => 0.05)).toBe("waveCannon");
    expect(chooseOmegaAttack(far, false, true, () => 0.25)).toBe("atomicRay");
    expect(chooseOmegaAttack(far, false, true, () => 0.45)).toBe("blaster");
    expect(chooseOmegaAttack(far, false, true, () => 0.55)).toBe("rainbowWind");
    expect(chooseOmegaAttack(far, false, true, () => 0.65)).toBe("mustardBomb");
    expect(chooseOmegaAttack(null, true, true, () => 0.05)).toBe("blaster");
    expect(chooseOmegaAttack(null, true, true, () => 0.15)).toBe("rainbowWind");
    expect(chooseOmegaAttack(null, true, true, () => 0.25)).toBe("mustardBomb");

    expect(chooseShinryuAttack(far, false, true, () => 0.05)).toBe("tidalWave");
    expect(chooseShinryuAttack(far, false, true, () => 0.25)).toBe("atomicRay");
    expect(chooseShinryuAttack(far, false, true, () => 0.45)).toBe("lightning");
    expect(chooseShinryuAttack(far, false, true, () => 0.65)).toBe("mightyGuard");
    expect(chooseShinryuAttack({ distance: 1 }, true, true, () => 0.05)).toBe("evilEye");
    expect(chooseShinryuAttack({ distance: 1 }, true, true, () => 0.15)).toBe("lightning");
    expect(chooseShinryuAttack({ distance: 1 }, true, true, () => 0.35)).toBe("mightyGuard");
  });

  it("魔法反射・雷弱点と3スタイルのタイルを定義する", () => {
    expect(monReflectsMagic(OMEGA_BOSS)).toBe(true);
    expect(monReflectsMagic({ ...OMEGA_BOSS, sealed: true })).toBe(false);
    expect(monHasElementWeakness(OMEGA_BOSS, "thunder")).toBe(true);
    expect(monHasElementWeakness(SHINRYU_BOSS, "thunder")).toBe(false);
    expect(TILE_RENDER[264].ch).toBe("O");
    expect(TILE_RENDER[265].ch).toBe("S");
    expect(MONSTER_SHEET_MAP[264]).toBeDefined();
    expect(MONSTER_SHEET_MAP[265]).toBeDefined();
    expect(DAWNLIKE_FALLBACKS[264]).toBeDefined();
    expect(DAWNLIKE_FALLBACKS[265]).toBeDefined();
    expect(TILE_NAMES[264]).toBe("omega");
    expect(TILE_NAMES[265]).toBe("shinryu");
  });

  it("隣接マス攻撃はプレイヤーへ1回、大型の相手へ接触3マス分当たる", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const omega = { ...OMEGA_BOSS, id: "omega", x: 10, y: 10, maxHp: OMEGA_BOSS.hp, dormant: false };
    const shinryu = { ...SHINRYU_BOSS, id: "shinryu", x: 13, y: 10, maxHp: SHINRYU_BOSS.hp, dormant: false };
    const player = makePlayer({ x: 8, y: 10 });
    const dungeon = makeEmptyDg({ monsters: [omega, shinryu], ...visibleRoom() });
    const messages = [];

    attackOmegaShinryuAdjacentCells(omega, dungeon, player, messages, { luFn: () => {} });

    expect(messages.filter(message => message.includes("オメガの攻撃！"))).toHaveLength(1);
    expect(messages.filter(message => message.includes("オメガが神竜を攻撃！"))).toHaveLength(3);
    expect(player.hp).toBeLessThan(100);
    expect(shinryu.hp).toBeLessThan(SHINRYU_BOSS.hp);
  });

  it("波動砲の予兆は構えを示し、オメガが倒れると中断する", () => {
    const omega = { ...OMEGA_BOSS, id: "omega", x: 10, y: 10, maxHp: OMEGA_BOSS.hp };
    const player = makePlayer({ x: 15, y: 10, hp: 500, maxHp: 500 });
    const dungeon = makeEmptyDg({ monsters: [omega], ...visibleRoom() });
    const messages = [];
    const line = getOmegaShinryuLine(omega, dungeon, player, 2);
    expect(line.distance).toBeGreaterThanOrEqual(2);
    expect(queueOmegaShinryuAttack(omega, dungeon, "waveCannon", line, player, messages)).toBe(true);
    expect(dungeon.pendingOmegaShinryuAttacks[0].cells).toHaveLength(30);
    expect(messages.at(-1)).toContain("波動砲の構え");
    expect(messages.at(-1)).not.toContain("発射した");

    dungeon.monsters = [];
    advanceOmegaShinryuAttacks(dungeon, player, messages, () => {}, 1);
    expect(dungeon.pendingOmegaShinryuAttacks).toEqual([]);
    expect(player.hp).toBe(500);
    expect(messages.at(-1)).toContain("発生源が倒れて中断");
  });

  it("波動砲は構え中オメガが動けず、妨害されなければ2ターン後に発射される", () => {
    const omega = { ...OMEGA_BOSS, id: "omega", x: 10, y: 10, hp: OMEGA_BOSS.hp, maxHp: OMEGA_BOSS.hp, aware: true, dormant: false };
    const player = makePlayer({ x: 15, y: 10, hp: 500, maxHp: 500 });
    const dungeon = makeEmptyDg({ monsters: [omega], ...visibleRoom() });
    const messages = [];
    const line = getOmegaShinryuLine(omega, dungeon, player, 2);
    queueOmegaShinryuAttack(omega, dungeon, "waveCannon", line, player, messages);
    monsterAI(omega, dungeon, player, messages, { moveOnly: true });
    expect(omega).toMatchObject({ x: 10, y: 10 });

    advanceOmegaShinryuAttacks(dungeon, player, messages, () => {}, 1);
    expect(dungeon.pendingOmegaShinryuAttacks[0].turnsLeft).toBe(1);
    advanceOmegaShinryuAttacks(dungeon, player, messages, () => {}, 1);
    expect(player.hp).toBe(400);
    expect(player.deathCause).toContain("オメガ");
    expect(dungeon.pendingOmegaShinryuAttacks).toEqual([]);
    expect(messages.some(message => message.includes("波動砲が発射された"))).toBe(true);
  });

  it("波動砲・タイダルウエイブは行動封じで予兆後でも中断される", () => {
    for (const [kind, sourceBase, sourceName] of [
      ["waveCannon", OMEGA_BOSS, "オメガ"],
      ["tidalWave", SHINRYU_BOSS, "神竜"],
    ]) {
      const source = { ...sourceBase, id: kind, x: 10, y: 10, hp: sourceBase.hp, maxHp: sourceBase.hp };
      const player = makePlayer({ x: 15, y: 10, hp: 500, maxHp: 500 });
      const dungeon = makeEmptyDg({ monsters: [source], ...visibleRoom() });
      const messages = [];
      const line = getOmegaShinryuLine(source, dungeon, player, 2);
      queueOmegaShinryuAttack(source, dungeon, kind, line, player, messages);
      source.attackSealTurns = 2;

      advanceOmegaShinryuAttacks(dungeon, player, messages, () => {}, 1);

      expect(dungeon.pendingOmegaShinryuAttacks).toEqual([]);
      expect(player.hp).toBe(500);
      expect(messages.at(-1)).toBe(`${sourceName}の${kind === "waveCannon" ? "波動砲" : "タイダルウエイブ"}の構えは妨害され、中断された！`);
    }
  });

  it("斜め波動砲は間が抜けない連続した帯状範囲になる", () => {
    const omega = { ...OMEGA_BOSS, id: "omega", x: 10, y: 10, maxHp: OMEGA_BOSS.hp };
    const player = makePlayer({ x: 15, y: 15, hp: 500, maxHp: 500 });
    const dungeon = makeEmptyDg({ monsters: [omega], ...visibleRoom() });
    const line = getOmegaShinryuLine(omega, dungeon, player, 2);
    const messages = [];
    queueOmegaShinryuAttack(omega, dungeon, "waveCannon", line, player, messages);
    const cells = dungeon.pendingOmegaShinryuAttacks[0].cells;
    const remaining = new Set(cells.map(cell => `${cell.x},${cell.y}`));
    const queue = [cells[0]];
    remaining.delete(`${cells[0].x},${cells[0].y}`);
    for (let i = 0; i < queue.length; i++) {
      const cell = queue[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const key = `${cell.x + dx},${cell.y + dy}`;
        if (!remaining.delete(key)) continue;
        queue.push({ x: cell.x + dx, y: cell.y + dy });
      }
    }
    expect(cells).toHaveLength(50);
    expect(remaining.size).toBe(0);
  });

  it("マスタードボムの5×5全範囲に残りターンを描画する", () => {
    const bomb = { x: 12, y: 8, turnsLeft: 2 };
    const cells = timeBombBlastCells(bomb);
    expect(cells).toHaveLength(25);
    expect(cells).toContainEqual({ x: 10, y: 6 });
    expect(cells).toContainEqual({ x: 14, y: 10 });

    const visible = Array.from({ length: MH }, () => Array(MW).fill(true));
    const fillText = vi.fn();
    const ctx = {
      save() {}, restore() {}, fillRect() {}, strokeRect() {}, strokeText() {}, fillText,
    };
    drawTimeBombWarnings(ctx, { pendingBombs: [bomb], visible }, 0, 0, 16);
    expect(fillText).toHaveBeenCalledTimes(25);
  });

  it("波動砲は範囲の壁と魔法陣を壊し、タイダルウエイブは魔法陣を壊す", () => {
    const omega = { ...OMEGA_BOSS, id: "omega", x: 10, y: 10, maxHp: OMEGA_BOSS.hp };
    const player = makePlayer({ x: 15, y: 10, hp: 500, maxHp: 500 });
    const dungeon = makeEmptyDg({ monsters: [omega], ...visibleRoom() });
    const messages = [];
    const line = getOmegaShinryuLine(omega, dungeon, player, 2);
    queueOmegaShinryuAttack(omega, dungeon, "waveCannon", line, player, messages);
    dungeon.map[9][13] = T.WALL;
    dungeon.map[11][17] = T.BWALL;
    const embeddedItem = { id: "embedded", name: "壁内の道具", x: 13, y: 9, wallEmbedded: true };
    dungeon.items.push(embeddedItem);
    dungeon.pentacles = [
      { x: 14, y: 9, name: "回復の魔方陣" },
      { x: 17, y: 11, name: "魔封じの魔方陣" },
    ];

    advanceOmegaShinryuAttacks(dungeon, player, messages, () => {}, 2);
    expect(dungeon.map[9][13]).toBe(T.FLOOR);
    expect(dungeon.map[11][17]).toBe(T.FLOOR);
    expect(embeddedItem).toMatchObject({ discovered: true });
    expect(embeddedItem.wallEmbedded).toBeUndefined();
    expect(dungeon.pentacles).toEqual([]);

    const shinryu = { ...SHINRYU_BOSS, id: "shinryu", x: 10, y: 10, maxHp: SHINRYU_BOSS.hp };
    const tidalPlayer = makePlayer({ x: 15, y: 10, hp: 500, maxHp: 500 });
    const tidalDungeon = makeEmptyDg({ monsters: [shinryu], ...visibleRoom() });
    const tidalLine = getOmegaShinryuLine(shinryu, tidalDungeon, tidalPlayer, 2);
    queueOmegaShinryuAttack(shinryu, tidalDungeon, "tidalWave", tidalLine, tidalPlayer, []);
    tidalDungeon.pentacles = [{ x: 14, y: 9, name: "回復の魔方陣" }];
    advanceOmegaShinryuAttacks(tidalDungeon, tidalPlayer, [], () => {}, 2);
    expect(tidalDungeon.pentacles).toEqual([]);
  });

  it("タイダルウエイブは発射方向の逆へ押し戻す", () => {
    const shinryu = { ...SHINRYU_BOSS, id: "shinryu", x: 10, y: 10, maxHp: SHINRYU_BOSS.hp };
    const player = makePlayer({ x: 15, y: 10, hp: 500, maxHp: 500 });
    const dungeon = makeEmptyDg({ monsters: [shinryu], ...visibleRoom() });
    const messages = [];
    const line = getOmegaShinryuLine(shinryu, dungeon, player, 2);
    queueOmegaShinryuAttack(shinryu, dungeon, "tidalWave", line, player, messages);

    advanceOmegaShinryuAttacks(dungeon, player, messages, () => {}, 2);

    expect(player.hp).toBeLessThan(500);
    expect(player.x).toBeLessThan(15);
  });

  it("悪魔の瞳は隣接外周を1ターン後に石化させる", () => {
    const shinryu = { ...SHINRYU_BOSS, id: "shinryu", x: 10, y: 10, maxHp: SHINRYU_BOSS.hp };
    const player = makePlayer({ x: 8, y: 10 });
    const dungeon = makeEmptyDg({ monsters: [shinryu], ...visibleRoom() });
    const messages = [];
    queueOmegaShinryuAttack(shinryu, dungeon, "evilEye", null, player, messages);
    expect(dungeon.pendingOmegaShinryuAttacks[0].turnsLeft).toBe(1);

    advanceOmegaShinryuAttacks(dungeon, player, messages, () => {}, 1);

    expect(player.petrifiedTurns).toBe(4);
  });

  it("マイティガードの全ダメージ半減はセーブ再開後も続く", () => {
    const data = {};
    vi.stubGlobal("localStorage", {
      setItem(key, value) { data[key] = value; },
      getItem(key) { return data[key] ?? null; },
    });
    const shinryu = {
      ...SHINRYU_BOSS, id: "shinryu", x: 10, y: 10,
      hp: 200, maxHp: SHINRYU_BOSS.hp, mightyGuardTurns: 10,
    };
    installShinryuMightyGuardHpHook(shinryu);
    const player = makePlayer();
    const dungeon = makeEmptyDg({ monsters: [shinryu], ...visibleRoom() });
    expect(saveGameState({ player, dungeon, floors: {}, dungeonType: "legend" }, [], {}, null)).toBe(true);

    const restored = loadGameState().dungeon.monsters[0];
    restored.hp -= 40;
    expect(restored.hp).toBe(180);
    restored.mightyGuardTurns = 0;
    restored.hp -= 40;
    expect(restored.hp).toBe(140);
  });

  it("マスタードボムはオメガ死亡後も既存の2ターン爆弾処理で爆発する", () => {
    const omega = { ...OMEGA_BOSS, id: "omega", x: 10, y: 10 };
    const player = makePlayer({ x: 12, y: 10 });
    const dungeon = makeEmptyDg({ monsters: [omega] });
    const messages = [];
    const explosions = [];
    const doTimeBombExplosion = (...args) => explosions.push(args);

    castOmegaMustardBomb(omega, dungeon, player, messages);
    dungeon.monsters = [];
    resolveTurnHazards({ dungeon }, player, messages, bombHazardDeps(doTimeBombExplosion));
    expect(dungeon.pendingBombs[0].turnsLeft).toBe(1);
    resolveTurnHazards({ dungeon }, player, messages, bombHazardDeps(doTimeBombExplosion));
    expect(dungeon.pendingBombs).toEqual([]);
    expect(explosions).toHaveLength(1);
    expect(explosions[0][7].killerMon.name).toBe("オメガ");
  });
});
