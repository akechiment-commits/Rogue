import { describe, expect, it } from "vitest";
import { applyMonsterParalyze } from "../statusDuration.js";
import { applyThrownItemToMonster, makePlayerClone, splashPotion, weakenOrClearParalysis } from "../items.js";
import { castMeteor, advanceMeteors } from "../meteor.js";
import { applyWandEffect } from "../wands.js";
import { monsterAI } from "../monsters.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function setup(clone = false) {
  const player = makePlayer();
  const monster = { ...makePlayerClone(player, 10, 10), hp: 1000, maxHp: 1000 };
  if (!clone) delete monster.isPlayerClone;
  const dungeon = makeEmptyDg({ monsters: [monster] });
  const messages = [];
  applyMonsterParalyze(monster, { blessed: true, ml: messages });
  return { player, monster, dungeon, messages };
}
function turn(s) {
  monsterAI(s.monster, s.dungeon, s.player, s.messages, { moveOnly: true });
  if (!s.monster._movedThisTurn) monsterAI(s.monster, s.dungeon, s.player, s.messages, { attackOnly: true });
  delete s.monster._movedThisTurn;
}
const hits = {
  "杖": s => applyWandEffect("fire_wand", "monster", s.monster, 1, 0, s.dungeon, s.player, s.messages, () => {}),
  "投擲": s => applyThrownItemToMonster({ type: "arrow", name: "矢", atk: 1 }, s.monster, s.dungeon, s.player, s.messages, () => {}),
  "薬の飛沫": s => splashPotion(s.dungeon, 10, 10, "fire", 20, s.player, s.messages, () => {}),
  "メテオ": s => {
    castMeteor({ id: "caster", name: "術者", hp: 100 }, s.dungeon, { x: 10, y: 10 }, s.messages);
    advanceMeteors(s.dungeon, s.player, s.messages, () => {}, 2);
  },
  "別経路のダメージ": s => { s.monster.hp -= 1; },
};

describe.each([false, true])("強い金縛り（分身=%s）", clone => {
  it.each(Object.entries(hits))("%sを1回受けてもAI更新で2回扱いにしない", (_name, hit) => {
    const s = setup(clone);
    hit(s);
    expect(s.monster.hp).toBeLessThan(1000);
    turn(s);
    expect(s.monster).toMatchObject({ paralyzed: true, paralyzeHits: 1, x: 10, y: 10 });
    turn(s);
    expect(s.monster.paralyzed).toBe(true);
    hit(s);
    turn(s);
    expect(s.monster.paralyzed).toBe(false);
    expect(s.monster.paralyzeHits).toBe(0);
  });
});

it("ダメージのない杖でも1命中を数え、通常の金縛りは1回で解ける", () => {
  const s = setup();
  const hit = () => applyWandEffect("seal", "monster", s.monster, 1, 0, s.dungeon, s.player, s.messages, () => {});
  hit();
  turn(s);
  expect(s.monster).toMatchObject({ hp: 1000, paralyzed: true, paralyzeHits: 1 });
  hit();
  expect(s.monster.paralyzed).toBe(false);
  applyMonsterParalyze(s.monster);
  hit();
  expect(s.monster).toMatchObject({ paralyzed: false, paralyzeTurns: 0, _paralyzeHp: null });
});

it("解除前に再び金縛りの杖を当てると、新しい2回分を維持する", () => {
  const s = setup();
  applyWandEffect("paralyze", "monster", s.monster, 1, 0, s.dungeon, s.player, s.messages, () => {}, null, 2);
  turn(s);
  expect(s.monster).toMatchObject({ paralyzed: true, paralyzeHits: 2 });
});

it("HP確定後の近接命中も2回で解除し、被弾記録を残さない", () => {
  const s = setup();
  for (let hit = 1; hit <= 2; hit++) {
    s.monster.hp--;
    weakenOrClearParalysis(s.monster, s.messages);
    turn(s);
    expect(s.monster.paralyzed).toBe(hit < 2);
  }
  expect(s.monster).toMatchObject({ paralyzeHits: 0, paralyzeTurns: 0, _paralyzeHp: null });
});
