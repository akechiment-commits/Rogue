import { describe, expect, it } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

describe("アイテム弾き", () => {
  function runBlast(item, equipment) {
    const base = MONS.find((monster) => monster.baseKind === "itemblaster");
    const blaster = makeMonsterFromBase(base, 1, 6, 5, { aware: true });
    blaster.alwaysUseSpecial = true;
    blaster.turnAttacks = 0;
    const player = makePlayer({ x: 5, y: 5, ...equipment, inventory: [item] });
    const dg = makeEmptyDg({ rooms: [], monsters: [blaster] });
    const messages = [];

    monsterAI(blaster, dg, player, messages, { attackOnly: true });
    return { dg, player, messages };
  }

  it("弾かれた武器・防具・矢・指輪を装備から外す", () => {
    const weapon = { id: "blast-weapon", name: "短剣", type: "weapon", atk: 3 };
    const armor = { id: "blast-armor", name: "革の鎧", type: "armor", def: 2 };
    const arrow = { id: "blast-arrow", name: "矢", type: "arrow", count: 1, atk: 3 };
    const ring = { id: "blast-ring", name: "力の指輪", type: "ring", effect: "power_ring", plus: 1 };

    const weaponResult = runBlast(weapon, { weapon });
    expect(weaponResult.player.weapon).toBeNull();

    const armorResult = runBlast(armor, { armor });
    expect(armorResult.player.armor).toBeNull();

    const arrowResult = runBlast(arrow, { arrow });
    expect(arrowResult.player.arrow).toBeNull();

    const ringResult = runBlast(ring, { rings: [ring] });
    expect(ringResult.player.rings).toEqual([]);
  });
});
