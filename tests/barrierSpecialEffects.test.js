import { afterEach, describe, expect, it, vi } from "vitest";
import { castAbsoluteVirtuePull, getAbsoluteVirtueLine } from "../absoluteVirtue.js";
import { chiranikuttsunnokuEarthbreaker } from "../chiranikuttsunnoku.js";
import { breakAltar, killMonster } from "../items.js";
import { ABSOLUTE_VIRTUE_BOSS, BATTERING_RAM, BOSSES, CHIRANIKUTSUNNOKU, MONS, OHPLENTY, SHINRYU_BOSS, makeMonsterFromBase, monsterAI, monsterAttackPlayer } from "../monsters.js";
import { advanceCaswacks, castCaswack, ohplentyPullPlayer } from "../ohplenty.js";
import { advanceOmegaShinryuAttacks, queueOmegaShinryuAttack } from "../omegaShinryu.js";
import { advancePetroBreaths, castPetroBreath } from "../petroBreath.js";
import { fireTrapPlayer } from "../traps.js";
import { MH, MW, T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function makeEnemy(kind, level = 1, x = 5, y = 5) {
  const template = [...MONS, ...BOSSES].find(enemy => enemy.baseKind === kind || enemy.subtype === kind);
  const monster = makeMonsterFromBase(template, level, x, y, { aware: true });
  monster.alwaysUseSpecial = true;
  monster.turnAttacks = 0;
  return monster;
}

function battlefield(kind, { level = 1, player = {}, allies = [], floor = {} } = {}) {
  const monster = makeEnemy(kind, level);
  const p = makePlayer({ x: 9, y: 5, barrier: 2, ...player });
  const dungeon = makeEmptyDg({
    rooms: [{ x: 1, y: 1, w: 24, h: 13 }],
    visible: Array.from({ length: MH }, () => Array(MW).fill(true)),
    monsters: [monster, ...allies],
    ...floor,
  });
  const messages = [];
  const attack = opts => monsterAI(monster, dungeon, p, messages, { attackOnly: true, ...opts });
  const move = opts => monsterAI(monster, dungeon, p, messages, { moveOnly: true, ...opts });
  return { monster, p, dungeon, messages, attack, move };
}

function makePot() {
  return { id: "pot", type: "pot", name: "とじこめの壺", potEffect: "imprison", capacity: 3,
    contents: [], confinedMonsters: [] };
}

afterEach(() => vi.restoreAllMocks());

describe("バリアとボス特技", () => {
  function bossBattlefield(base, coordinates, target) {
    const boss = { ...base, id: base.baseKind, x: 10, y: 10, aware: true, turnAttacks: 0 };
    const p = makePlayer({ barrier: 2, ...coordinates });
    const dungeon = makeEmptyDg({ monsters: target ? [boss, target] : [boss],
      rooms: [{ x: 1, y: 1, w: 30, h: 20 }] });
    return { boss, p, dungeon, messages: [] };
  }

  it.each([
    ["ペトロブレス", BATTERING_RAM, 12, 13, (boss, dg, player, ml) => {
      castPetroBreath(boss, dg, player, ml);
      advancePetroBreaths(dg, player, ml);
    }],
    ["悪魔の瞳", SHINRYU_BOSS, 8, 12, (boss, dg, player, ml) => {
      queueOmegaShinryuAttack(boss, dg, "evilEye", null, player, ml);
      advanceOmegaShinryuAttacks(dg, player, ml);
    }],
  ])("%sによる石化はプレイヤーにも巻き添えの敵にもバリア1回分で防ぐ", (_name, base, playerX, monsterX, useSpecial) => {
    const target = makeEnemy("barriermage", 2, monsterX, 10);
    const { boss, p, dungeon, messages } = bossBattlefield(base, { x: playerX, y: 10, sleepTurns: 3 }, target);
    useSpecial(boss, dungeon, p, messages);
    for (const unit of [p, target]) {
      expect(unit.barrier).toBe(1);
      expect(unit.petrifiedTurns || 0).toBe(0);
    }
    expect(p.sleepTurns).toBe(3);
  });

  it.each([0, 30])("カスワックの初回と重複をバリアで防ぐ（残り%iターン）", caswackTurns => {
    const target = makeEnemy("barriermage", 2, 9, 10);
    target.caswackTurns = caswackTurns;
    const { boss, p, dungeon, messages } = bossBattlefield(OHPLENTY, { x: 9, y: 9, caswackTurns }, target);
    castCaswack(boss, dungeon, p, messages);
    advanceCaswacks(dungeon, p, messages);
    expect(p).toMatchObject({ hp: 100, barrier: 1, caswackTurns });
    expect(target).toMatchObject({ hp: target.maxHp, barrier: 1, caswackTurns });
    expect(dungeon.monsters).toContain(target);
  });

  const pullingSpells = [
    [OHPLENTY.name, OHPLENTY, ohplentyPullPlayer],
    [ABSOLUTE_VIRTUE_BOSS.name, ABSOLUTE_VIRTUE_BOSS, (boss, dg, player, messages) =>
      castAbsoluteVirtuePull(boss, dg, player, getAbsoluteVirtueLine(boss, dg, player), messages)],
  ];

  it.each(pullingSpells)("%sの引き寄せを射線上の敵のバリアで防ぐ", (_name, base, pull) => {
    const target = makeEnemy("barriermage", 2, 7, 10);
    const { boss, p, dungeon, messages } = bossBattlefield(base, { x: 5, y: 10 }, target);
    pull(boss, dungeon, p, messages);
    expect(target).toMatchObject({ x: 7, y: 10, barrier: 1 });
    expect(p).toMatchObject({ x: 5, barrier: 2 });
  });

  it.each(pullingSpells)("%sの引き寄せをプレイヤーのバリアで防ぐ", (_name, base, pull) => {
    const { boss, p, dungeon, messages } = bossBattlefield(base, { x: 5, y: 10 });
    pull(boss, dungeon, p, messages);
    expect(p).toMatchObject({ x: 5, y: 10, barrier: 1 });
  });

  it.each(pullingSpells)("%sの引き寄せが反射されたら術者のバリアで防ぐ", (_name, base, pull) => {
    const { boss, p, dungeon, messages } = bossBattlefield(base, { x: 5, y: 10, magicReflectTurns: 5 });
    boss.barrier = 2;
    pull(boss, dungeon, p, messages);
    expect(boss).toMatchObject({ x: 10, y: 10, barrier: 1 });
    expect(p).toMatchObject({ x: 5, barrier: 2 });
  });

  it("アースブレイカーのダメージと転倒をまとめて防ぐ", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const item = { name: "巻物", type: "scroll" };
    const { boss, p, dungeon, messages } = bossBattlefield(CHIRANIKUTSUNNOKU, { x: 12, y: 10, inventory: [item] });
    chiranikuttsunnokuEarthbreaker(boss, dungeon, p, messages);
    expect(p).toMatchObject({ hp: 100, barrier: 1, inventory: [item] });
    expect(dungeon.items).toEqual([]);
  });

  it("敵がアースブレイカーを回避したときはバリアを使わない", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    const target = makeEnemy("barriermage", 2, 12, 10);
    const { boss, p, dungeon, messages } = bossBattlefield(CHIRANIKUTSUNNOKU, { x: 20, y: 15 }, target);
    chiranikuttsunnokuEarthbreaker(boss, dungeon, p, messages);
    expect(target).toMatchObject({ hp: target.maxHp, barrier: 2 });
    expect(messages.some(message => message.includes("外れた"))).toBe(true);
  });
});

describe("バリアと敵の特技", () => {
  it.each([
    ["dangerousPetal", 2, 0.1, "sleepTurns"],
    ["hypnotist", 3, 0.1, "hypnosisPending"],
    ["defhalf", 1, 0.1, "defSoftenedTurns"],
    ["boss_flamedragon", 1, 0.1, "oilyTurns"],
    ["boss_voidmonk", 1, 0.1, "slowTurns"],
    ["boss_voidmonk", 1, 0.5, "confusedTurns"],
    ["boss_voidmonk", 1, 0.9, "sealedTurns"],
  ])("%s Lv%i の状態効果（乱数 %s、%s）を防ぐ", (kind, level, roll, status) => {
    vi.spyOn(Math, "random").mockReturnValue(roll);
    const { p, move, attack } = battlefield(kind, { level });
    if (kind === "defhalf") move();
    attack();
    expect(p.barrier).toBe(1);
    expect(p[status] || 0).toBe(0);
  });

  it("マナ吸収ではMPの減少と吸収した敵の回復を防ぐ", () => {
    const { p, monster, attack } = battlefield("manaEater", { level: 3, player: { x: 6, mp: 20 } });
    monster.hp = 25;
    attack();
    expect(p).toMatchObject({ barrier: 1, mp: 20 });
    expect(monster.hp).toBe(25);
  });

  it("撃破時の眠りの花粉は対象ごとに防ぐ", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const crab = makeEnemy("barriermage", 2, 5, 6);
    const { p, monster, dungeon, messages } = battlefield("dangerousPetal", { player: { x: 6 }, allies: [crab] });
    killMonster(monster, dungeon, p, messages, null, true);
    expect(dungeon.monsters).not.toContain(monster);
    for (const target of [p, crab]) {
      expect(target.barrier).toBe(1);
      expect(target.sleepTurns || 0).toBe(0);
    }
  });

  it.each(["thief", "stealthrower", "fireCook"])("%sの所持品に対する特技を防ぐ", kind => {
    const item = { id: "scroll", name: "巻物", type: "scroll", effect: "teleport" };
    const { p, monster, attack } = battlefield(kind, { player: { x: 6, inventory: [item] } });
    attack();
    expect(p.barrier).toBe(1);
    expect(p.inventory).toEqual([item]);
    expect(item.type).toBe("scroll");
    expect(monster.turnAttacks).toBe(1);
  });

  it.each(["puller", "grabber", "giantEel"])("%sの強制移動や拘束を防ぐと移動フェーズの行動を消費する", kind => {
    const x = kind === "puller" ? 8 : 6;
    const { p, dungeon, move } = battlefield(kind, { player: { x } });
    if (kind === "giantEel") dungeon.map[5][5] = T.WATER;
    const consumeMoveAction = vi.fn();
    move({ consumeMoveAction });
    expect(p).toMatchObject({ x, y: 5, barrier: 1 });
    expect(p.capturedBy).toBeFalsy();
    expect(consumeMoveAction).toHaveBeenCalledTimes(1);
  });

  it("罠への投げ飛ばしを防ぐと足元が変わらず罠は起動しない", () => {
    const trap = { id: "trap", name: "眠りの罠", effect: "sleep", x: 3, y: 5, permanent: true, revealed: true };
    const { p, attack } = battlefield("trapthrower", { player: { x: 6 }, floor: { traps: [trap] } });
    const fireTrapFn = vi.fn(fireTrapPlayer);
    attack({ fireTrapFn });
    expect(p).toMatchObject({ x: 6, y: 5, barrier: 1 });
    expect(fireTrapFn).not.toHaveBeenCalled();
  });

  it.each(["barriermage", "skeleton"])("シャーマンの回復魔法から%sを守る", kind => {
    const target = makeEnemy(kind, 1, 5, 6);
    target.barrier = 2;
    target.hp -= 8;
    const before = target.hp;
    const { attack } = battlefield("supporter", { allies: [target] });
    attack();
    expect(target).toMatchObject({ hp: before, barrier: 1 });
  });

  it("祭壇の罰はダメージと状態異常を1回分で防ぐ", () => {
    const altar = { id: "altar", name: "祭壇", x: 6, y: 5 };
    const { monster, p, dungeon, messages } = battlefield("barriermage", { level: 2, floor: { altars: [altar] } });
    const before = monster.hp;
    breakAltar(altar, dungeon, messages, p, monster);
    expect(dungeon.altars).toEqual([]);
    expect(monster).toMatchObject({ hp: before, barrier: 1 });
    for (const status of ["sleepTurns", "confusedTurns", "paralyzeTurns", "slowTurns"]) {
      expect(monster[status] || 0).toBe(0);
    }
  });

  it("風穴で戻った矢を射手のバリアで防ぐ", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const { monster, p, move, attack } = battlefield("archer", { floor: { vents: [{ x: 9, y: 5, dx: -1, dy: 0 }] } });
    monster.barrier = 2;
    const before = monster.hp;
    move();
    attack();
    expect(monster).toMatchObject({ hp: before, barrier: 1 });
    expect(p.hp).toBe(100);
  });

  it("ヤドカリが拡散の大箱に入ると対象ごとにバリアを使う", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const crab = makeEnemy("barriermage", 2, 8, 6);
    const box = { kind: "scatter", name: "拡散の大箱", x: 7, y: 5, capacity: 4, contents: [] };
    const { p, dungeon, move, attack } = battlefield("potRaider", {
      level: 3, player: { inventory: [makePot()] }, allies: [crab], floor: { bigboxes: [box] },
    });
    move();
    attack();
    expect(p).toMatchObject({ hp: 100, barrier: 1 });
    expect(crab).toMatchObject({ hp: crab.maxHp, barrier: 1 });
    expect(dungeon.monsters).toContain(crab);
    expect(box.capacity).toBe(3);
  });

  it.each([1, 3])("Lv%iのヤドカリはバリアを通って壺に入らない", level => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const pot = makePot();
    const { p, dungeon, move, attack } = battlefield("potRaider", {
      level, player: { x: level === 1 ? 6 : 9, inventory: [pot] },
    });
    if (level === 3) move();
    attack();
    expect(p.barrier).toBe(1);
    expect(pot.confinedMonsters).toEqual([]);
    expect(dungeon.monsters).toHaveLength(level === 1 ? 1 : 2);
  });

  it.each(["壁", "敵", "衝突なし"])("魔方陣で吹き飛んだプレイヤーが%sに遭う", obstacle => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const pentacles = [{ kind: "knockback_aura", name: "吹き飛ばしの魔方陣", x: 3, y: 3 }];
    const allies = obstacle === "敵" ? [makeEnemy("rat", 1, 8, 5)] : [];
    const { p, monster, dungeon, messages } = battlefield("goblin", { player: { x: 6 }, allies, floor: { pentacles } });
    if (obstacle === "壁") dungeon.map[5][8] = T.WALL;
    const onPlayerHit = vi.fn();
    monsterAttackPlayer(monster, dungeon, p, messages, damage => `通常攻撃！${damage}ダメージ！`, { onPlayerHit });
    const meleeDamage = onPlayerHit.mock.calls[0][0];
    expect(meleeDamage).toBeGreaterThan(0);
    expect(p.hp).toBe(100 - meleeDamage);
    expect(p.x).toBe(obstacle === "衝突なし" ? 11 : 7);
    expect(p.barrier).toBe(obstacle === "衝突なし" ? 2 : 1);
  });
});
