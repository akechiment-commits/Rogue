import { describe, it, expect, vi } from "vitest";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { drainAnims } from "../animEvents.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { T } from "../utils.js";

function makeWokka() {
  const wokka = makeMonsterFromBase(MONS.find(monster => monster.baseKind === "wokka"), 3, 3, 5, { aware: true });
  wokka.alwaysUseSpecial = true;
  wokka.turnAttacks = 0;
  wokka.projectileAmmo.count = 1;
  return wokka;
}

describe("ワッカの放物線石投げ", () => {
  it("途中の敵・床アイテム・石像・大箱を越えてプレイヤーに届く", () => {
    drainAnims();
    const wokka = makeWokka();
    const intermediate = { id: "intermediate", name: "途中の敵", x: 6, y: 5, hp: 80, maxHp: 80, def: 0 };
    const player = makePlayer({ x: 13, y: 5 });
    const statue = { id: "statue", x: 9, y: 5, name: "石像" };
    const box = { id: "box", x: 10, y: 5, name: "大箱", items: [] };
    const dg = makeEmptyDg({
      monsters: [wokka, intermediate],
      items: [{ id: "floor-item", name: "床の品", type: "food", x: 7, y: 5 }],
      statues: [statue],
      bigboxes: [box],
      rooms: [{ x: 1, y: 1, w: 20, h: 10 }],
    });
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      monsterAI(wokka, dg, player, messages, { attackOnly: true });
    } finally {
      random.mockRestore();
    }

    expect(intermediate.hp).toBe(80);
    expect(dg.statues).toContain(statue);
    expect(dg.bigboxes).toContain(box);
    expect(player.hp).toBeLessThan(100);
    expect(wokka.projectileAmmo.count).toBe(0);
    const projectile = drainAnims().find(event => event.type === "monProjectile");
    expect(projectile?.flightArc).toBe(true);
    expect(projectile?.path.at(-1)).toEqual({ x: player.x, y: player.y });
  });

  it("壁は越えず、手前で石が落ちる", () => {
    const wokka = makeWokka();
    const player = makePlayer({ x: 13, y: 5 });
    const dg = makeEmptyDg({ monsters: [wokka], rooms: [{ x: 1, y: 1, w: 20, h: 10 }] });
    dg.map[5][8] = T.WALL;
    const messages = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      monsterAI(wokka, dg, player, messages, { attackOnly: true });
    } finally {
      random.mockRestore();
    }

    expect(player.hp).toBe(100);
    expect(messages.some(message => message.includes("壁に当たって落ちた。"))).toBe(true);
    expect(wokka.projectileAmmo.count).toBe(0);
  });
});
