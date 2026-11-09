import { describe, it, expect } from "vitest";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { mireuHyperthermicBreath, mireuSpikeFlail } from "../mireu.js";
import { hexachromaticFireBreath, hexachromaticEarthquake } from "../hexachromatic.js";
import { castShinryuLightning } from "../omegaShinryu.js";
import "../monsters.js"; // register runtime

describe("Boss monster attacks against other monsters: barrier, fixed damage, spore, dormant", () => {
  it("mireuHyperthermicBreath hitting mushroom triggers counter spore, wakes dormant, clamps fixed damage", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 5 });
    const ml = [];

    const mireu = {
      id: "mireu1",
      name: "ミレウ",
      baseKind: "boss_mireu",
      x: 3,
      y: 5,
      atk: 50,
      bodySize: 3,
    };
    const mushroom = {
      id: "mush1",
      name: "オオマツタケ",
      baseKind: "mushroom",
      monLevel: 1,
      x: 6,
      y: 5,
      hp: 100,
      maxHp: 100,
      def: 5,
      dormant: true,
      fixedDamageOnly: true,
    };
    dg.monsters = [mireu, mushroom];

    mireuHyperthermicBreath(mireu, dg, p, ml);

    expect(mushroom.hp).toBe(99);
    expect(mushroom.dormant).toBe(false);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("mireuSpikeFlail hitting mushroom triggers counter spore, wakes dormant, clamps fixed damage", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 10 });
    const ml = [];

    const mireu = {
      id: "mireu2",
      name: "ミレウ",
      baseKind: "boss_mireu",
      x: 4,
      y: 4,
      atk: 50,
      bodySize: 3,
    };
    const mushroom = {
      id: "mush2",
      name: "オオマツタケ",
      baseKind: "mushroom",
      monLevel: 1,
      x: 6,
      y: 4, // adjacent to Mireu 3x3 footprint
      hp: 100,
      maxHp: 100,
      def: 5,
      dormant: true,
      fixedDamageOnly: true,
    };
    dg.monsters = [mireu, mushroom];

    mireuSpikeFlail(mireu, dg, p, ml);

    expect(mushroom.hp).toBe(99);
    expect(mushroom.dormant).toBe(false);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("hexachromaticFireBreath hitting mushroom triggers counter spore, wakes dormant, clamps fixed damage", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 5 });
    const ml = [];

    const boss = {
      id: "hexa1",
      name: "ヘキサクロマティック",
      baseKind: "boss_hexachromatic",
      x: 4,
      y: 4,
      atk: 50,
      bodySize: 3,
    };
    const mushroom = {
      id: "mush3",
      name: "オオマツタケ",
      baseKind: "mushroom",
      monLevel: 1,
      x: 7,
      y: 5,
      hp: 100,
      maxHp: 100,
      def: 5,
      dormant: true,
      fixedDamageOnly: true,
    };
    dg.monsters = [boss, mushroom];

    const line = { origin: { x: 5, y: 5 }, dx: 1, dy: 0, dist: 5, centerDistance: 1 };
    hexachromaticFireBreath(boss, dg, p, line, ml);

    expect(mushroom.hp).toBe(99);
    expect(mushroom.dormant).toBe(false);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("hexachromaticEarthquake hitting mushroom triggers counter spore, wakes dormant, clamps fixed damage", () => {
    const dg = makeEmptyDg();
    const room = { x: 1, y: 1, w: 20, h: 10 };
    dg.rooms = [room];
    const p = makePlayer({ x: 10, y: 5 });
    const ml = [];

    const boss = {
      id: "hexa2",
      name: "ヘキサクロマティック",
      baseKind: "boss_hexachromatic",
      x: 4,
      y: 4,
      atk: 50,
      bodySize: 3,
    };
    const mushroom = {
      id: "mush4",
      name: "オオマツタケ",
      baseKind: "mushroom",
      monLevel: 1,
      x: 6,
      y: 5,
      hp: 100,
      maxHp: 100,
      def: 5,
      dormant: true,
      fixedDamageOnly: true,
    };
    dg.monsters = [boss, mushroom];

    hexachromaticEarthquake(boss, dg, p, room, ml, { findRoom: () => room });

    expect(mushroom.hp).toBe(99);
    expect(mushroom.dormant).toBe(false);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("castShinryuLightning hitting mushroom triggers counter spore, wakes dormant, clamps fixed damage", () => {
    const dg = makeEmptyDg();
    const room = { x: 1, y: 1, w: 20, h: 10 };
    dg.rooms = [room];
    const p = makePlayer({ x: 10, y: 5 });
    const ml = [];

    const shinryu = {
      id: "shin1",
      name: "神竜",
      baseKind: "boss_shinryu",
      x: 4,
      y: 4,
      atk: 50,
      bodySize: 3,
    };
    const mushroom = {
      id: "mush5",
      name: "オオマツタケ",
      baseKind: "mushroom",
      monLevel: 1,
      x: 6,
      y: 5,
      hp: 100,
      maxHp: 100,
      def: 5,
      dormant: true,
      fixedDamageOnly: true,
    };
    dg.monsters = [shinryu, mushroom];

    castShinryuLightning(shinryu, dg, p, room, ml, null);

    expect(mushroom.hp).toBe(99);
    expect(mushroom.dormant).toBe(false);
    expect(ml.some(m => m.includes("毒胞子を撒き散らした"))).toBe(true);
  });

  it("boss attacks respect victim barrier", () => {
    const dg = makeEmptyDg();
    const p = makePlayer({ x: 10, y: 5 });
    const ml = [];

    const mireu = {
      id: "mireu3",
      name: "ミレウ",
      baseKind: "boss_mireu",
      x: 3,
      y: 5,
      atk: 50,
      bodySize: 3,
    };
    const barrierMon = {
      id: "bm1",
      name: "ゴーレム",
      x: 6,
      y: 5,
      hp: 100,
      maxHp: 100,
      barrier: 1,
    };
    dg.monsters = [mireu, barrierMon];

    mireuHyperthermicBreath(mireu, dg, p, ml);

    expect(barrierMon.hp).toBe(100);
    expect(barrierMon.barrier).toBe(0);
  });
});
