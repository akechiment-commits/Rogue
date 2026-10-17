import { describe, expect, it } from "vitest";
import {
  WIND_AURA_DIRS,
  monsterWindAuraRadius,
  ensureMonsterWindDir,
  getWindAt,
  stepProjectile,
  traceProjectilePath,
  T,
  MW,
  MH,
} from "../utils.js";
import { MONS, makeMonsterFromBase, monLevelUp, monLevelDown, applyMonsterTransformation } from "../monsters.js";
import { getMonsterDescription } from "../monsterEncyclopedia.js";
import { TILE_NAMES, TILE_RENDER } from "../render.js";
import { MONSTER_SHEET_MAP, DAWNLIKE_FALLBACKS } from "../tilesetMap.js";
import { drawMonsterOverlays } from "../useGameRenderer.js";

function makeOpenDungeon() {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR));
  return {
    map,
    vents: [],
    monsters: [],
    items: [],
    traps: [],
    springs: [],
    bigboxes: [],
    pentacles: [],
    statues: [],
    rooms: [{ x: 1, y: 1, w: 20, h: 20 }],
  };
}

describe("シルフ系（風まといモンスター）", () => {
  it("MONS定義・図鑑・タイル登録が揃っている", () => {
    const sylphBase = MONS.find((m) => m.baseKind === "sylph");
    expect(sylphBase).toBeTruthy();
    expect(sylphBase.name).toBe("シルフ");
    expect(sylphBase.tile).toBe(236);
    expect(sylphBase.float).toBe(true);
    expect(sylphBase.subtype).toBe("windAura");
    expect(sylphBase.levels.map((l) => l.name)).toEqual(["ハイシルフ", "シルフィード"]);

    expect(TILE_NAMES[236]).toBe("sylph");
    expect(TILE_RENDER[236]?.ch).toBe("風");
    expect(MONSTER_SHEET_MAP[236]).toEqual([9, 6]);
    expect(DAWNLIKE_FALLBACKS[236]).toBe(54);

    const desc = getMonsterDescription("シルフ");
    expect(desc).toContain("風");
    expect(desc).toContain("3×3→5×5→7×7");
  });

  it("生成時に8方向からランダムな風向きを持ち、レベルに応じて風の範囲が3×3→5×5→7×7へ広がる", () => {
    const sylphBase = MONS.find((m) => m.baseKind === "sylph");
    const m = makeMonsterFromBase(sylphBase, 1, 10, 10);
    expect(WIND_AURA_DIRS).toContainEqual([m.windDx, m.windDy]);
    expect(monsterWindAuraRadius(m)).toBe(1);

    const dg = makeOpenDungeon();
    m.windDx = 0;
    m.windDy = -1;
    dg.monsters.push(m);

    /* Lv1: 半径1 (3×3) */
    expect(getWindAt(dg, 11, 11)).toMatchObject({ dx: 0, dy: -1, monster: m, radius: 1 });
    expect(getWindAt(dg, 12, 10)).toBeNull();

    /* Lv2: 半径2 (5×5) */
    const ml = [];
    expect(monLevelUp(m, dg, ml)).toBe(true);
    expect(m.name).toBe("ハイシルフ");
    expect(monsterWindAuraRadius(m)).toBe(2);
    expect(getWindAt(dg, 12, 12)).toMatchObject({ dx: 0, dy: -1, monster: m, radius: 2 });
    expect(getWindAt(dg, 13, 10)).toBeNull();

    /* Lv3: 半径3 (7×7) */
    expect(monLevelUp(m, dg, ml)).toBe(true);
    expect(m.name).toBe("シルフィード");
    expect(monsterWindAuraRadius(m)).toBe(3);
    expect(getWindAt(dg, 13, 13)).toMatchObject({ dx: 0, dy: -1, monster: m, radius: 3 });
    expect(getWindAt(dg, 14, 10)).toBeNull();

    /* レベルダウン時は範囲も縮小 */
    expect(monLevelDown(m, dg, ml)).toBe(true);
    expect(monsterWindAuraRadius(m)).toBe(2);
  });

  it("範囲内の物理飛び道具を風向きへ曲げ、魔法弾（wind: false）は曲げない", () => {
    const sylphBase = MONS.find((m) => m.baseKind === "sylph");
    const dg = makeOpenDungeon();
    const m = makeMonsterFromBase(sylphBase, 2, 10, 10, { windDx: 0, windDy: 1 });
    dg.monsters.push(m);

    /* (6, 9) から右向き (1, 0) に撃つと、x=8 (距離2) で下向き (0, 1) に曲がる */
    const phys = traceProjectilePath(dg, 6, 9, 1, 0, 5, { stopAtMon: false, wind: true });
    expect(phys.bent).toBe(true);
    expect(phys.dx).toBe(0);
    expect(phys.dy).toBe(1);
    expect(phys.path).toEqual([
      { x: 6, y: 9 },
      { x: 7, y: 9 },
      { x: 7, y: 10 },
      { x: 7, y: 11 },
      { x: 7, y: 12 },
      { x: 7, y: 13 },
    ]);

    /* 魔法・杖弾は曲がらず直進 */
    const magic = traceProjectilePath(dg, 6, 9, 1, 0, 5, { stopAtMon: false, wind: false });
    expect(magic.bent).toBe(false);
    expect(magic.endX).toBe(11);
    expect(magic.endY).toBe(9);
  });

  it("封印中や死亡時は風域が消え、変化の杖でも風向きが適切に管理される", () => {
    const sylphBase = MONS.find((m) => m.baseKind === "sylph");
    const ratBase = MONS.find((m) => m.baseKind === "rat");
    const dg = makeOpenDungeon();
    const m = makeMonsterFromBase(sylphBase, 1, 10, 10, { windDx: 1, windDy: -1 });
    dg.monsters.push(m);

    expect(stepProjectile(dg, 9, 10, 1, 0, { wind: true })).toMatchObject({ bent: true, dx: 1, dy: -1 });

    m.sealed = true;
    expect(monsterWindAuraRadius(m)).toBe(0);
    expect(getWindAt(dg, 10, 10)).toBeNull();
    expect(stepProjectile(dg, 9, 10, 1, 0, { wind: true })).toMatchObject({ bent: false, dx: 1, dy: 0 });

    m.sealed = false;
    m.hp = 0;
    expect(monsterWindAuraRadius(m)).toBe(0);
    expect(getWindAt(dg, 10, 10)).toBeNull();

    m.hp = 20;
    applyMonsterTransformation(m, ratBase, dg);
    expect(monsterWindAuraRadius(m)).toBe(0);
    expect(m.windDx).toBeUndefined();
    expect(m.windDy).toBeUndefined();

    applyMonsterTransformation(m, sylphBase, dg);
    expect(monsterWindAuraRadius(m)).toBe(1);
    expect(WIND_AURA_DIRS).toContainEqual([m.windDx, m.windDy]);
  });

  it("drawMonsterOverlays でシルフ本体に風向き矢印を描画する", () => {
    const sylphBase = MONS.find((m) => m.baseKind === "sylph");
    const m = makeMonsterFromBase(sylphBase, 1, 5, 5, { windDx: 1, windDy: 0 });
    const strokes = [];
    const fills = [];
    const ctx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: function () { strokes.push(this.strokeStyle); },
      fill: function () { fills.push(this.fillStyle); },
      fillRect: () => {},
      strokeRect: () => {},
      strokeText: () => {},
      fillText: () => {},
    };
    drawMonsterOverlays(ctx, m, 32, 64, 32);
    expect(strokes).toContain("#e8ffff");
    expect(fills).toContain("#40e8ff");
  });
});
