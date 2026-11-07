import { describe, expect, it } from "vitest";
import { applyMonsterParalyze, applyPlayerParalyze } from "../statusDuration.js";
import { applyThrownItemToMonster, makePlayerClone, splashPotion, weakenOrClearParalysis } from "../items.js";
import { castMeteor, advanceMeteors } from "../meteor.js";
import { applyWandEffect } from "../wands.js";
import { monsterAI } from "../monsters.js";
import { advanceEarlyStatusTimers, advancePlayerUpkeep } from "../turnUpkeep.js";
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

it("プレイヤーの睡眠・金縛りと敵の金縛りは理由を問わずダメージを受けた瞬間に解除（強金縛りは通常金縛りへ弱体化）される", () => {
  // 1. プレイヤーの直接ダメージ・毒・空腹による睡眠＆強金縛り解除
  const player = makePlayer({ hp: 100, maxHp: 100, sleepTurns: 5 });
  applyPlayerParalyze(player, 20, { blessed: true });
  expect(player.paralyzeHits).toBe(2);

  // 1回目のダメージ（任意の理由）: 睡眠解除＋強金縛りが通常金縛りに戻る
  player.hp -= 5;
  expect(player.sleepTurns).toBe(0);
  expect(player.sleepInterruptedTurns).toBe(1);
  expect(player.paralyzeTurns).toBe(20);
  expect(player.paralyzeHits).toBe(1);

  // 2回目のダメージ（毒ダメージ）: 金縛りが完全解除
  player.poisoned = true;
  player.poisonedTurns = 3;
  const messages = [];
  advanceEarlyStatusTimers(player, messages);
  expect(player.paralyzeTurns).toBe(0);
  expect(player.paralyzeHits).toBe(0);

  // 空腹ダメージでも睡眠・金縛りが解除される
  player.sleepTurns = 4;
  applyPlayerParalyze(player, 10);
  player.hunger = 0;
  advancePlayerUpkeep(player, messages, {
    hasAbility: () => false,
    hasRingEffect: () => false,
    calcHungerDrainRate: () => 0,
  });
  expect(player.sleepTurns).toBe(0);
  expect(player.sleepInterruptedTurns).toBe(1);
  expect(player.paralyzeTurns).toBe(0);

  // 2. 敵の強金縛りもAIターンを待たずダメージを受けた瞬間に通常金縛りへ戻り、2回目で解除される
  const s = setup();
  expect(s.monster.paralyzed).toBe(true);
  expect(s.monster.paralyzeHits).toBe(2);
  s.monster.hp -= 10;
  expect(s.monster.paralyzed).toBe(true);
  expect(s.monster.paralyzeHits).toBe(1);
  s.monster.hp -= 10;
  expect(s.monster.paralyzed).toBe(false);
  expect(s.monster.paralyzeHits).toBe(0);
});
