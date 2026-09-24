import { describe, expect, it } from "vitest";
import {
  SPELLS,
  SPELLBOOKS,
  applyGedoBook,
  applySpellEffect,
  castSpellBolt,
  fireTrapItem,
  hasPlayerMagicReflect,
  makePlayerClone,
} from "../items.js";
import { MH, MW, T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
import { advanceConsumableBuffTimers, advancePlayerUpkeep } from "../turnUpkeep.js";
import { advanceMonsterUpkeep } from "../monsterUpkeep.js";
import { monsterAI } from "../monsters.js";
import { monsterFireLightning } from "../wands.js";
import { fireTrapPlayer } from "../traps.js";

const noop = () => {};

describe("追加魔法", () => {
  it("16種の魔法と対応する魔法書を登録する", () => {
    const ids = ["power_magic", "guard_magic", "reflect_magic", "dig_magic", "self_destruct_magic", "clone_magic", "haste_magic", "trap_detect_magic", "map_magic", "clairvoyance_magic", "regen_magic", "time_stop_magic", "purify_magic", "leap_magic", "earthquake_magic", "item_gather_magic"];
    expect(ids.every((id) => SPELLS.some((spell) => spell.id === id))).toBe(true);
    expect(ids.every((id) => SPELLBOOKS.some((book) => book.spell === id))).toBe(true);
    expect(SPELLS.find((spell) => spell.id === "haste_magic")).toMatchObject({ mpCost: 12 });
    expect(SPELLBOOKS.find((book) => book.spell === "haste_magic")).toMatchObject({ sellPrice: 3500 });
    expect(SPELLS.find((spell) => spell.id === "trap_detect_magic")).toMatchObject({ mpCost: 10 });
    expect(SPELLS.find((spell) => spell.id === "map_magic")).toMatchObject({ mpCost: 20 });
    expect(SPELLS.find((spell) => spell.id === "clairvoyance_magic")).toMatchObject({ mpCost: 18 });
    expect(SPELLS.find((spell) => spell.id === "regen_magic")).toMatchObject({ mpCost: 12 });
    expect(SPELLS.find((spell) => spell.id === "time_stop_magic")).toMatchObject({ mpCost: 25 });
    expect(SPELLS.find((spell) => spell.id === "self_destruct_magic").desc).toBe("自爆してHPが1になり、周囲の敵を即死させる。Lvで爆発範囲が広がる。MP:7");
    expect(SPELLS.find((spell) => spell.id === "clone_magic").desc).toBe("敵と戦う分身を呼び出す。Lvで持続が伸びる。MP:12");
  });

  it("外道の書は通常4種類、祝福8種類、呪いは同じ魔法を4回習得する", () => {
    const normal = makePlayer({ spells: [], spellLevels: {} });
    const blessed = makePlayer({ spells: [], spellLevels: {} });
    const cursed = makePlayer({ spells: [], spellLevels: {} });
    const alwaysFirst = () => 0;

    const normalResult = applyGedoBook(normal, {}, alwaysFirst);
    const blessedResult = applyGedoBook(blessed, { blessed: true }, alwaysFirst);
    const cursedResult = applyGedoBook(cursed, { cursed: true }, alwaysFirst);
    const gedoBook = SPELLBOOKS.find((book) => book.name === "外道の書");

    expect(gedoBook).toMatchObject({ specialBook: "gedo", rarity: "S", weight: 0.05 });
    expect(normalResult).toMatchObject({ requested: 4, count: 4 });
    expect(new Set(normalResult.entries.map((entry) => entry.id)).size).toBe(4);
    expect(blessedResult).toMatchObject({ requested: 8, count: 8, blessed: true });
    expect(new Set(blessedResult.entries.map((entry) => entry.id)).size).toBe(8);
    expect(cursedResult).toMatchObject({ requested: 4, count: 4, cursed: true });
    expect(new Set(cursedResult.entries.map((entry) => entry.id)).size).toBe(1);
    expect(cursed.spellLevels[cursedResult.target.id]).toBe(4);
  });

  it("地図の魔法はフロアだけを開示し、透視の魔法は敵感知を有効にする", () => {
    const dungeon = makeEmptyDg({
      explored: Array.from({ length: MH }, () => Array(MW).fill(false)),
      traps: [{ id: "map-trap", name: "矢の罠", x: 10, y: 10, revealed: false }],
    });
    const player = makePlayer();
    const messages = [];

    applySpellEffect("map_magic", "self", null, 0, 0, dungeon, player, messages, noop, 1);
    expect(dungeon.explored.every((row) => row.every(Boolean))).toBe(true);
    expect(dungeon.traps[0].revealed).toBe(false);
    expect(dungeon.monsterSenseActive).toBeUndefined();

    applySpellEffect("clairvoyance_magic", "self", null, 0, 0, dungeon, player, messages, noop, 1);
    expect(dungeon.monsterSenseActive).toBe(true);
    expect(messages).toContain("地図の魔法でフロア全体の地図が明らかになった！");
    expect(messages).toContain("透視の魔法でフロアの敵の位置が見えるようになった！");
  });

  it("再生の魔法は持続中にHPを回復し、時間停止はボスを含む世界を止める", () => {
    const player = makePlayer({ hp: 90 });
    const dungeon = makeEmptyDg();
    const messages = [];

    applySpellEffect("regen_magic", "self", null, 0, 0, dungeon, player, messages, noop, 3);
    expect(player).toMatchObject({ magicRegenTurns: 40, magicRegenBonus: 3 });
    advancePlayerUpkeep(player, messages, {
      hasAbility: () => false,
      hasRingEffect: () => false,
      calcHungerDrainRate: () => 0,
    });
    expect(player.hp).toBe(94);
    advanceConsumableBuffTimers(player, messages);
    expect(player).toMatchObject({ hp: 94, magicRegenTurns: 39, magicRegenBonus: 3 });

    applySpellEffect("time_stop_magic", "self", null, 0, 0, dungeon, player, messages, noop, 6);
    expect(dungeon).toMatchObject({ timeStopTurns: 7, _timeStopJustStarted: true });
  });

  it("時間停止中はプレイヤー用・アイテム用の罠が発動しない", () => {
    const player = makePlayer({ hp: 100 });
    const dungeon = makeEmptyDg({
      timeStopTurns: 2,
      traps: [{ id: "stop-mine", name: "地雷", effect: "explode", x: 5, y: 5, revealed: false }],
    });
    const messages = [];

    expect(fireTrapPlayer(dungeon.traps[0], player, dungeon, messages)).toBeNull();
    expect(player.hp).toBe(100);
    expect(dungeon.traps[0].revealed).toBe(false);
    expect(dungeon._pendingMineExplosion).toBeUndefined();
    expect(fireTrapItem(dungeon.traps[0], { name: "石", type: "stone" }, dungeon, 5, 5, messages, new Set(), player)).toBe("time_stopped");
    expect(player.hp).toBe(100);
  });

  it("剛力・守護・反射はレベルに応じて持続時間が伸びる", () => {
    const player = makePlayer({ atk: 5, def: 3 });
    const dungeon = makeEmptyDg();
    const messages = [];

    applySpellEffect("power_magic", "self", null, 0, 0, dungeon, player, messages, noop, 3);
    applySpellEffect("guard_magic", "self", null, 0, 0, dungeon, player, messages, noop, 5);
    applySpellEffect("reflect_magic", "self", null, 0, 0, dungeon, player, messages, noop, 6);

    expect(player).toMatchObject({
      atk: 15,
      def: 13,
      magicPowerAtkTurns: 60,
      magicGuardDefTurns: 70,
      magicReflectTurns: 75,
    });
    expect(hasPlayerMagicReflect(player)).toBe(true);
  });

  it("一時バフの終了時に攻撃力・防御力を元へ戻す", () => {
    const player = makePlayer({
      atk: 15,
      def: 13,
      magicPowerAtkTurns: 1,
      magicPowerAtkBonus: 10,
      magicGuardDefTurns: 1,
      magicGuardDefBonus: 10,
      magicReflectTurns: 1,
    });
    const messages = [];

    advanceConsumableBuffTimers(player, messages);

    expect(player).toMatchObject({
      atk: 5,
      def: 3,
      magicPowerAtkTurns: 0,
      magicGuardDefTurns: 0,
      magicReflectTurns: 0,
    });
    expect(messages).toEqual(expect.arrayContaining([
      "剛力の魔法が切れた！攻撃力が戻った！",
      "守護の魔法が切れた！防御力が戻った！",
      "魔法反射が切れた！",
    ]));
  });

  it("反射の魔法はモンスターの雷撃を発射源へ返す", () => {
    const source = { name: "魔法使い", x: 5, y: 5, hp: 50, maxHp: 50 };
    const dungeon = makeEmptyDg({ monsters: [source] });
    const player = makePlayer({ x: 6, y: 5, magicReflectTurns: 10 });
    const messages = [];

    monsterFireLightning(5, 5, dungeon, player, 1, 0, messages, noop, noop, source.name);

    expect(source.hp).toBeLessThan(50);
    expect(player.hp).toBe(100);
    expect(messages).toContain("魔法反射状態が雷撃を跳ね返した！");
  });

  it("穴掘りの魔法は最初の壁から10マス掘る", () => {
    const dungeon = makeEmptyDg();
    for (let x = 6; x <= 17; x++) dungeon.map[5][x] = T.WALL;
    const player = makePlayer({ x: 5, y: 5 });
    const messages = [];

    const result = castSpellBolt(player, dungeon, { effect: "dig_magic", range: 10 }, 1, 0, messages, noop, 1);

    expect(result.hitType).toBe("wall");
    for (let x = 6; x <= 15; x++) expect(dungeon.map[5][x]).toBe(T.FLOOR);
    expect(dungeon.map[5][16]).toBe(T.WALL);
    expect(messages).toContain("穴掘りの魔法が壁を10マス掘り進んだ！");
  });

  it.each([
    [1, 1, 6, 7],
    [3, 2, 6, 7],
    [5, 3, 6, 7],
  ])("自爆の魔法はLv%dで半径%dを巻き込みHPを1にする", (level, radius, nearX, farX) => {
    const near = { name: "近い敵", x: nearX, y: 5, hp: 100, maxHp: 100 };
    const far = { name: "遠い敵", x: farX, y: 5, hp: 100, maxHp: 100 };
    const dungeon = makeEmptyDg({ monsters: [near, far] });
    const player = makePlayer({ hp: 80, x: 5, y: 5 });

    applySpellEffect("self_destruct_magic", "self", null, 0, 0, dungeon, player, [], noop, level);

    expect(player.hp).toBe(1);
    expect(near.hp).toBe(0);
    expect(dungeon.monsters).not.toContain(near);
    if (farX > 5 + radius) expect(far.hp).toBe(100);
  });

  it("分身の魔法は隣接する空き床に1体だけ出し、再使用で時間を延長する", () => {
    const dungeon = makeEmptyDg();
    const player = makePlayer({ hp: 80, maxHp: 80, atk: 11, def: 7 });

    applySpellEffect("clone_magic", "self", null, 0, 0, dungeon, player, [], noop, 1);
    const clone = dungeon.monsters.find((monster) => monster.isPlayerClone);

    expect(clone).toMatchObject({
      name: "分身",
      hp: 40,
      maxHp: 40,
      atk: 7,
      def: 4,
      cloneTurns: 30,
      isPlayerClone: true,
    });
    expect(Math.max(Math.abs(clone.x - player.x), Math.abs(clone.y - player.y))).toBe(1);

    applySpellEffect("clone_magic", "self", null, 0, 0, dungeon, player, [], noop, 3);
    expect(dungeon.monsters.filter((monster) => monster.isPlayerClone)).toHaveLength(1);
    expect(clone.cloneTurns).toBe(70);
  });

  it("分身は敵を攻撃し、撃破するとプレイヤーだけが経験値を得る", () => {
    const target = { name: "敵", hp: 1, maxHp: 1, atk: 5, def: 0, exp: 50, x: 7, y: 5 };
    const player = makePlayer({ x: 5, y: 5, exp: 0 });
    const clone = makePlayerClone(player, 6, 5, 30);
    const dungeon = makeEmptyDg({ monsters: [clone, target] });
    const messages = [];

    monsterAI(clone, dungeon, player, messages);

    expect(player.exp).toBe(50);
    expect(dungeon.monsters).not.toContain(target);
    expect(clone.monLevel).toBe(1);
    expect(clone.overBoost).toBeUndefined();
  });

  it("加速の魔法は鈍足を解除し、重ね掛けで速度段階と持続を伸ばす", () => {
    const dungeon = makeEmptyDg();
    const player = makePlayer({ slowTurns: 5 });
    const messages = [];

    applySpellEffect("haste_magic", "self", null, 0, 0, dungeon, player, messages, noop, 6);
    expect(player.slowTurns).toBe(0);
    expect(player.hasteTurns || 0).toBe(0);

    applySpellEffect("haste_magic", "self", null, 0, 0, dungeon, player, messages, noop, 1);
    expect(player).toMatchObject({ hasteSpeed: 2, hasteTurns: 10 });

    applySpellEffect("haste_magic", "self", null, 0, 0, dungeon, player, messages, noop, 1);
    expect(player).toMatchObject({ hasteSpeed: 3, hasteTurns: 20 });
  });

  it("罠探知の魔法は罠だけをすべて発見する", () => {
    const dungeon = makeEmptyDg({ traps: [
      { name: "地雷", effect: "explode", x: 4, y: 4, revealed: false },
      { name: "矢の罠", effect: "arrow_trap", x: 8, y: 8, revealed: true },
    ] });
    const player = makePlayer();
    const messages = [];

    applySpellEffect("trap_detect_magic", "self", null, 0, 0, dungeon, player, messages, noop, 6);

    expect(dungeon.traps.every((trap) => trap.revealed)).toBe(true);
    expect(messages).toContain("罠探知の魔法で罠が1個見えた！");
  });

  it("浄化の魔法は有利な効果とMP回復禁止を残して状態異常を解除する", () => {
    const dungeon = makeEmptyDg();
    const player = makePlayer({
      atk: 9,
      poisoned: true,
      poisonedTurns: 3,
      poisonAtkLoss: 2,
      sleepTurns: 4,
      paralyzeTurns: 5,
      slowTurns: 6,
      confusedTurns: 7,
      darknessTurns: 8,
      bewitchedTurns: 9,
      sealedTurns: 10,
      oilyTurns: 11,
      soakedTurns: 12,
      defSoftenedTurns: 13,
      capturedBy: "grabber-1",
      potConfinedTurns: 14,
      mpSealTurns: 1000,
      hasteTurns: 10,
      hasteSpeed: 2,
      dopingAftereffectTurns: 15,
      dopingAftereffectPending: true,
    });
    const messages = [];

    applySpellEffect("purify_magic", "self", null, 0, 0, dungeon, player, messages, noop, 1);

    expect(player).toMatchObject({
      atk: 11,
      sleepTurns: 0,
      paralyzeTurns: 0,
      slowTurns: 0,
      confusedTurns: 0,
      darknessTurns: 0,
      bewitchedTurns: 0,
      sealedTurns: 0,
      oilyTurns: 0,
      soakedTurns: 0,
      defSoftenedTurns: 0,
      capturedBy: null,
      potConfinedTurns: 0,
      mpSealTurns: 1000,
      hasteTurns: 10,
      dopingAftereffectTurns: 0,
      dopingAftereffectPending: false,
    });
    expect(player.poisoned).toBe(false);
    expect(player.poisonedTurns).toBe(0);
  });

  it("飛びつきの魔法は最初の敵の手前へ移動する", () => {
    const dungeon = makeEmptyDg({ monsters: [
      { name: "敵", hp: 20, maxHp: 20, x: 8, y: 5 },
    ] });
    const player = makePlayer({ x: 5, y: 5, immobileTurns: 3 });
    const messages = [];

    const result = castSpellBolt(player, dungeon, { effect: "leap_magic", range: 10 }, 1, 0, messages, noop, 1);

    expect(result.hitType).toBe("monster");
    expect(player).toMatchObject({ x: 7, y: 5, immobileTurns: 0 });
    expect(messages).toEqual(expect.arrayContaining(["移動封じが解けた！", "敵の前に飛びついた！"]));
  });

  it("地震の魔法は分身を除くフロア内の敵全体に届く", () => {
    const near = { name: "近い敵", hp: 100, maxHp: 100, def: 0, x: 8, y: 5 };
    const far = { name: "遠い敵", hp: 100, maxHp: 100, def: 0, x: 40, y: 25 };
    const immune = { name: "魔法無効の敵", hp: 50, maxHp: 50, def: 0, magicImmune: true, x: 10, y: 5 };
    const barrier = { name: "バリアの敵", hp: 50, maxHp: 50, def: 0, barrier: 1, x: 12, y: 5 };
    const floating = { name: "浮遊する敵", hp: 50, maxHp: 50, def: 0, float: true, x: 3, y: 8 };
    const sealedFloating = { name: "封印された浮遊敵", hp: 50, maxHp: 50, def: 0, float: true, sealed: true, x: 14, y: 5 };
    const gravityFloating = { name: "重力下の浮遊敵", hp: 50, maxHp: 50, def: 0, float: true, x: 24, y: 5 };
    const player = makePlayer();
    const clone = makePlayerClone(player, 6, 5, 30);
    const dungeon = makeEmptyDg({
      monsters: [near, far, immune, barrier, floating, sealedFloating, gravityFloating, clone],
      rooms: [
        { x: 1, y: 1, w: 10, h: 10 },
        { x: 12, y: 1, w: 6, h: 10 },
        { x: 20, y: 1, w: 10, h: 10 },
      ],
      pentacles: [{ kind: "gravity", x: 24, y: 5 }],
    });
    const messages = [];

    applySpellEffect("earthquake_magic", "self", null, 0, 0, dungeon, player, messages, noop, 1);

    expect(near.hp).toBeLessThan(100);
    expect(far.hp).toBeLessThan(100);
    expect(immune.hp).toBe(50);
    expect(barrier.hp).toBe(50);
    expect(floating.hp).toBe(50);
    expect(sealedFloating.hp).toBeLessThan(50);
    expect(gravityFloating.hp).toBeLessThan(50);
    expect(clone.hp).toBe(clone.maxHp);
    expect(messages.some((message) => message.startsWith("地震の魔法が近い敵に命中！"))).toBe(true);
    expect(messages).toContain("浮遊する敵は浮遊していて地震が効かなかった！");
  });

  it("道具寄せの魔法は店の商品以外をプレイヤーの周囲へ集める", () => {
    const floorItem = { name: "床の薬", type: "potion", x: 30, y: 20 };
    const shopItem = { name: "店の商品", type: "weapon", shopPrice: 1000, x: 25, y: 20 };
    const embeddedItem = { name: "壁内の石", type: "arrow", wallEmbedded: true, x: 20, y: 20 };
    const player = makePlayer({ x: 5, y: 5 });
    const dungeon = makeEmptyDg({ items: [floorItem, shopItem, embeddedItem] });
    const messages = [];

    applySpellEffect("item_gather_magic", "self", null, 0, 0, dungeon, player, messages, noop, 1);

    expect(dungeon.items).toContain(floorItem);
    expect(Math.max(Math.abs(floorItem.x - player.x), Math.abs(floorItem.y - player.y))).toBeLessThanOrEqual(2);
    expect(shopItem).toMatchObject({ x: 25, y: 20 });
    expect(dungeon.items).toContain(embeddedItem);
    expect(Math.max(Math.abs(embeddedItem.x - player.x), Math.abs(embeddedItem.y - player.y))).toBeLessThanOrEqual(2);
    expect(embeddedItem.wallEmbedded).toBeUndefined();
    expect(messages).toContain("2個のアイテムを引き寄せた！");
  });

  it("敵はプレイヤーより近い分身を優先して攻撃する", () => {
    const player = makePlayer({ x: 10, y: 5 });
    const clone = makePlayerClone(player, 7, 5, 30);
    const enemy = { name: "敵", hp: 100, maxHp: 100, atk: 20, def: 0, exp: 10, speed: 1, baseKind: "rat", x: 5, y: 5, turnAttacks: 0 };
    const dungeon = makeEmptyDg({
      monsters: [enemy, clone],
      rooms: [{ x: 1, y: 1, w: 58, h: 28 }],
    });
    const messages = [];

    monsterAI(enemy, dungeon, player, messages, { moveOnly: true });
    expect(enemy.x).toBe(6);
    expect(enemy.y).toBe(5);
    monsterAI(enemy, dungeon, player, messages, { attackOnly: true });

    expect(clone.hp).toBeLessThan(clone.maxHp);
    expect(player.hp).toBe(player.maxHp);
  });

  it("敵とプレイヤーが同じ距離なら分身を優先して攻撃する", () => {
    const player = makePlayer({ x: 5, y: 5 });
    const clone = makePlayerClone(player, 7, 5, 30);
    const enemy = { name: "敵", hp: 100, maxHp: 100, atk: 20, def: 0, exp: 10, speed: 1, baseKind: "rat", x: 6, y: 5, turnAttacks: 0 };
    const dungeon = makeEmptyDg({ monsters: [enemy, clone], rooms: [] });
    const messages = [];

    monsterAI(enemy, dungeon, player, messages, { attackOnly: true });

    expect(clone.hp).toBeLessThan(clone.maxHp);
    expect(player.hp).toBe(player.maxHp);
    expect(messages.some((message) => message.includes("分身を攻撃"))).toBe(true);
  });

  it("からめ鬼も隣接した分身を攻撃し、プレイヤーを捕獲しない", () => {
    const player = makePlayer({ x: 5, y: 5 });
    const clone = makePlayerClone(player, 7, 5, 30);
    const grabber = { name: "からめ鬼", hp: 100, maxHp: 100, atk: 22, def: 10, exp: 55, speed: 1, baseKind: "grabber", subtype: "grabber", x: 6, y: 5, turnAttacks: 0, aware: true };
    const dungeon = makeEmptyDg({ monsters: [grabber, clone], rooms: [] });
    const messages = [];

    monsterAI(grabber, dungeon, player, messages, { attackOnly: true });

    expect(clone.hp).toBeLessThan(clone.maxHp);
    expect(player.capturedBy).toBeUndefined();
  });

  it("分身との交戦中は詰まり脱出で敵や分身が移動しない", () => {
    const player = makePlayer({ x: 5, y: 5 });
    const clone = makePlayerClone(player, 7, 5, 30);
    const enemy = { name: "敵", hp: 100, maxHp: 100, atk: 20, def: 0, exp: 10, speed: 1, baseKind: "rat", x: 6, y: 5, turnAttacks: 0, aware: true };
    const dungeon = makeEmptyDg({ monsters: [enemy, clone], rooms: [] });

    for (let i = 0; i < 12; i++) {
      monsterAI(enemy, dungeon, player, [], { moveOnly: true });
      monsterAI(clone, dungeon, player, [], { moveOnly: true });
    }

    expect({ x: enemy.x, y: enemy.y }).toEqual({ x: 6, y: 5 });
    expect({ x: clone.x, y: clone.y }).toEqual({ x: 7, y: 5 });
  });

  it("逃走型の敵は分身を攻撃対象にせず逃げ続ける", () => {
    const player = makePlayer({ x: 5, y: 5 });
    const clone = makePlayerClone(player, 7, 5, 30);
    const runner = { name: "フクマル", hp: 20, maxHp: 20, atk: 0, def: 0, exp: 50, speed: 2, baseKind: "runner", subtype: "runner", x: 6, y: 5, turnAttacks: 0, aware: true };
    const dungeon = makeEmptyDg({ monsters: [runner, clone], rooms: [] });
    const messages = [];

    monsterAI(runner, dungeon, player, messages, { attackOnly: true });

    expect(clone.hp).toBe(clone.maxHp);
    expect(messages.some((message) => message.includes("分身を攻撃"))).toBe(false);
  });

  it("分身は時間切れで消滅し、通常の敵として復活しない", () => {
    const player = makePlayer();
    const clone = makePlayerClone(player, 6, 5, 1);
    const dungeon = makeEmptyDg({ monsters: [clone] });
    const messages = [];

    advanceMonsterUpkeep(dungeon, player, messages, {
      hasCursedExplosionPentacle: () => false,
      inMagicSealRoom: () => false,
      inCursedMagicSealRoom: () => false,
      onMonsterDefeated: () => {},
    });

    expect(dungeon.monsters).not.toContain(clone);
    expect(messages).toContain("分身の時間切れで消えた！");
  });

  it("魔法書読書時のMP不足反動：生存時は反動を受けながらも魔法が発動し、死亡時は発動しない", () => {
    const powerSpell = SPELLS.find((s) => s.id === "power_magic");
    expect(powerSpell).toBeDefined();

    // 1. 生存時：反動ダメージを受けつつも剛力の魔法が発動する
    const survivor = makePlayer({ hp: 100, maxHp: 100, mp: 0, atk: 10 });
    const dungeon = makeEmptyDg();
    const messages = [];
    const cost = powerSpell.mpCost; // 10
    const shortage = cost - survivor.mp; // 10
    const recoil = Math.max(1, Math.round(shortage * shortage * 0.75 + shortage * 2));
    survivor.mp = 0;
    survivor.hp -= recoil;
    expect(survivor.hp).toBeGreaterThan(0);
    applySpellEffect(powerSpell.effect, "self", null, 0, 0, dungeon, survivor, messages, noop, 1, cost);

    expect(survivor.atk).toBe(20); // 剛力で+10
    expect(survivor.magicPowerAtkTurns).toBeGreaterThan(0);
    expect(messages.some((m) => m.includes("剛力の魔法で攻撃力が"))).toBe(true);

    // 2. 死亡時：反動ダメージでHP<=0なら発動しない
    const victim = makePlayer({ hp: 10, maxHp: 100, mp: 0, atk: 10 });
    victim.hp -= recoil;
    expect(victim.hp).toBeLessThanOrEqual(0);
    // 死亡時は applySpellEffect を呼ばずに中断されるため atk は上がらない
    expect(victim.atk).toBe(10);
  });
});
