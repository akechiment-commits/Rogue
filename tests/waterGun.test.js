import { describe, it, expect, vi } from "vitest";
vi.mock("react", async () => ({
  ...await vi.importActual("react"),
  useCallback: fn => fn,
  useEffect: () => {},
  useRef: value => ({ current: value }),
}));
import {
  TRAPS,
  ARMOR_ABILITIES,
  ITEMS,
  hasWaterProof,
  reduceWaterDamage,
  waterResistDamageLabel,
  applyWaterGunToInventory,
  makeBombArrow,
  makeNormalStone,
  placeItemAt,
  applySoakedStatus,
  applySoakedFromWaterWalk,
  shrinkFoodOneStep,
  blankScrollOrSpellbook,
  reduceIceDamage,
  iceResistDamageLabel,
  applyWaterIceFreeze,
  isPlayerOnWater,
  applyFrozenPhysicalMult,
  freezeWaterTile,
} from "../items.js";
import { MONS, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { fireTrapPlayer } from "../traps.js";
import { useItemActions } from "../useItemActions.js";
import { msgToActionKey } from "../portraits.js";
import { PORTRAIT_CATEGORIES } from "../portraitCatalog.js";
import { T, MW, MH } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

function launchAtWaterGun(trapX, item = makeNormalStone(1), mode = "throw") {
  const trap = { ...TRAPS.find(entry => entry.effect === "watergun_trap"),
    x: trapX, y: 2, id: "watergun-path", permanent: true, revealed: false };
  const dungeon = makeEmptyDg({ traps: [trap] });
  const player = makePlayer({ x: 1, y: 2, inventory: [item], arrow: mode === "shoot_equipped" ? item : null });
  const sr = { current: { player, dungeon, ident: new Set() } };
  const messages = [];
  const noop = () => {};
  useItemActions({
    sr, throwMode: { idx: 0, mode }, dnameRef: item => item.name,
    setThrowMode: noop, setGs: noop, endTurn: noop, lu: noop,
    setMsgs: append => messages.push(...append([])), withPitfallBag: run => run(),
  }).execDirection(1, 0);
  return { dungeon, player, trap, messages };
}

describe("水鉄砲・耐水", () => {
  it("水鉄砲の罠が TRAPS にある", () => {
    const t = TRAPS.find((x) => x.effect === "watergun_trap");
    expect(t).toBeTruthy();
    expect(t.name).toBe("水鉄砲の罠");
    expect(t.rarity).toBe("C");
    expect(t.weight).toBe(4);
  });

  it("アーマーガッパに耐水がある", () => {
    const a = ITEMS.find((x) => x.name === "アーマーガッパ");
    expect(a).toBeTruthy();
    expect(a.ability).toBe("water_proof");
    expect(ARMOR_ABILITIES.some((ab) => ab.id === "water_proof")).toBe(true);
    expect(hasWaterProof({ armor: a })).toBe(true);
  });

  it("耐水・万能耐性は水属性ダメージを耐火などと同じ倍率で軽減する", () => {
    expect(reduceWaterDamage(30, { armor: { ability: "water_proof" } })).toBe(20);
    expect(reduceWaterDamage(30, { armor: { ability: "all_resist" } })).toBe(20);
    expect(reduceWaterDamage(30, { armor: { ability: "water_proof", abilities: ["all_resist"] } })).toBe(15);
    expect(reduceWaterDamage(30, { mayonnaiseWaterProofTurns: 5 })).toBe(15);
    expect(reduceWaterDamage(30, { armor: null })).toBe(30);
    expect(waterResistDamageLabel({ armor: { ability: "water_proof" } })).toContain("耐水");
  });

  it("敵の水鉄砲は耐水で水属性ダメージが軽減される", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const watergunBase = MONS.find(monster => monster.subtype === "watergunner");
    const shooter = makeMonsterFromBase(watergunBase, 1, 5, 5, { aware: true });
    shooter.alwaysUseSpecial = true;
    shooter.dormant = false;
    shooter.turnAttacks = 0;
    const player = makePlayer({
      x: 8, y: 5, hp: 200, maxHp: 200,
      armor: { name: "耐水の鎧", def: 0, ability: "water_proof" },
    });
    const visible = Array.from({ length: MH }, () => Array(MW).fill(true));
    const dungeon = makeEmptyDg({
      monsters: [shooter], rooms: [{ x: 1, y: 1, w: 20, h: 14 }],
      visible, explored: visible.map(row => [...row]),
    });
    dungeon.map[5][5] = T.WATER;
    const messages = [];

    try {
      monsterAI(shooter, dungeon, player, messages, { moveOnly: true });
      monsterAI(shooter, dungeon, player, messages, { attackOnly: true });

      expect(player.hp, messages.join(" | ")).toBe(192);
      expect(messages.some(message => message.includes("耐水"))).toBe(true);
      expect(player.soakedTurns || 0).toBe(0);
    } finally {
      random.mockRestore();
    }
  });

  it("プレイヤーがみかわしの魔方陣上にいても、途中の魔方陣消去や中間モンスターへの命中・バリア消費は発射後に処理する", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const watergunBase = MONS.find(monster => monster.subtype === "watergunner");
    const shooter = makeMonsterFromBase(watergunBase, 1, 5, 5, { aware: true });
    shooter.alwaysUseSpecial = true;
    shooter.dormant = false;
    shooter.turnAttacks = 0;
    const blocker = {
      id: "blocker", name: "ゴブリン", baseKind: "goblin",
      x: 7, y: 5, hp: 30, maxHp: 30, atk: 5, def: 2, exp: 5,
      dormant: true, _dormantHp: 30, barrier: 1,
    };
    const player = makePlayer({ x: 9, y: 5, hp: 200, maxHp: 200 });
    const visible = Array.from({ length: MH }, () => Array(MW).fill(true));
    const dungeon = makeEmptyDg({
      monsters: [shooter, blocker],
      pentacles: [
        { kind: "heal", name: "回復の魔方陣", x: 6, y: 5 },
        { kind: "dodge", name: "みかわしの魔方陣", x: 9, y: 5 },
      ],
      rooms: [{ x: 1, y: 1, w: 20, h: 14 }],
      visible, explored: visible.map(row => [...row]),
    });
    dungeon.map[5][5] = T.WATER;
    const messages = [];

    try {
      monsterAI(shooter, dungeon, player, messages, { moveOnly: true });
      monsterAI(shooter, dungeon, player, messages, { attackOnly: true });

      expect(dungeon.pentacles.some(pc => pc.x === 6 && pc.y === 5)).toBe(false);
      expect(blocker.dormant).toBe(false);
      expect(blocker.barrier).toBe(0);
      expect(blocker.hp).toBe(30);
      expect(blocker.soakedTurns || 0).toBe(0);
      expect(messages.some(message => message.includes("みかわしの魔方陣"))).toBe(false);
    } finally {
      random.mockRestore();
    }
  });

  it("blankScrollOrSpellbook が白紙化する", () => {
    const scroll = { type: "scroll", effect: "teleport", name: "テレポートの巻物" };
    const ml = [];
    expect(blankScrollOrSpellbook(scroll, ml)).toBe(true);
    expect(scroll.effect).toBe("blank");
    expect(scroll.name).toBe("白紙の巻物");
    expect(ml.some((m) => m.includes("文字が消えた"))).toBe(true);
  });

  it("shrinkFoodOneStep がサイズを1段階下げる", () => {
    const food = {
      type: "food",
      name: "満腹の大きいリンゴ",
      value: 55,
      cooked: false,
      sizeLabel: "大きい",
      _foodBase: "リンゴ",
      _foodEfLabel: "満腹の",
    };
    const ml = [];
    expect(shrinkFoodOneStep(food, ml)).toBe(true);
    expect(food.sizeLabel).toBe("普通の");
    expect(food.value).toBeLessThan(55);
  });

  it("applyWaterGunToInventory は耐水で無効", () => {
    const armor = ITEMS.find((x) => x.name === "アーマーガッパ");
    const p = {
      armor,
      inventory: [{ type: "scroll", effect: "teleport", name: "テレポートの巻物" }],
    };
    const ml = [];
    expect(applyWaterGunToInventory(p, ml)).toBe(false);
    expect(p.inventory[0].effect).toBe("teleport");
    expect(ml.some((m) => m.includes("耐水"))).toBe(true);
  });

  it("applyWaterGunToInventory が巻物を白紙にする", () => {
    const p = {
      armor: null,
      inventory: [{ type: "scroll", effect: "confusion", name: "混乱の巻物" }],
    };
    const ml = [];
    expect(applyWaterGunToInventory(p, ml)).toBe(true);
    expect(p.inventory[0].effect).toBe("blank");
  });

  it("applyWaterGunToInventory は影響のない所持品なら無事", () => {
    const p = {
      armor: null,
      inventory: [
        { type: "weapon", name: "短剣", effect: "none" },
        { type: "scroll", effect: "teleport", name: "テレポートの巻物" },
      ],
    };
    const ml = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      expect(applyWaterGunToInventory(p, ml)).toBe(false);
    } finally {
      random.mockRestore();
    }
    expect(p.inventory[1].effect).toBe("teleport");
    expect(ml.some((m) => m.includes("無事だった"))).toBe(true);
  });

  it("applyWaterGunToInventory は火薬壺を保存の壺にする", () => {
    const p = {
      armor: null,
      inventory: [{ type: "pot", potEffect: "gunpowder", name: "火薬壺", capacity: 3, contents: [{ name: "石" }] }],
    };
    const ml = [];
    expect(applyWaterGunToInventory(p, ml)).toBe(true);
    expect(p.inventory[0].potEffect).toBe("none");
    expect(p.inventory[0].name).toBe("保存の壺");
    expect(p.inventory[0].contents).toHaveLength(1);
  });

  it("applyWaterGunToInventory は爆弾矢と這いずり爆弾を1つ減らす", () => {
    const arrows = { type: "arrow", name: "爆弾矢", bombArrow: true, count: 3 };
    const bombs = { type: "arrow", name: "這いずり爆弾", specialProjectile: "crawling_bomb", count: 1 };
    const p = { armor: null, inventory: [arrows] };
    expect(applyWaterGunToInventory(p, [])).toBe(true);
    expect(p.inventory[0].count).toBe(2);
    const p2 = { armor: null, inventory: [bombs] };
    expect(applyWaterGunToInventory(p2, [])).toBe(true);
    expect(p2.inventory).toHaveLength(0);
  });

  it("applyWaterGunToInventory がペンのインクを減らす", () => {
    const p = {
      armor: null,
      inventory: [{ type: "pen", effect: "plain", name: "ただのペン", charges: 2 }],
    };
    const ml = [];
    expect(applyWaterGunToInventory(p, ml)).toBe(true);
    expect(p.inventory[0].charges).toBe(1);
  });

  it("applySoakedStatus は耐水で付与しない", () => {
    const armor = ITEMS.find((x) => x.name === "アーマーガッパ");
    const p = { armor, soakedTurns: 0 };
    const ml = [];
    expect(applySoakedStatus(p, ml, 10)).toBe(false);
    expect(p.soakedTurns).toBe(0);
  });

  it("applySoakedFromWaterWalk は耐水でずぶ濡れにならない", () => {
    const armor = ITEMS.find((x) => x.name === "アーマーガッパ");
    const p = { armor, soakedTurns: 0, x: 1, y: 1, rings: [] };
    const dg = { map: [[T.WALL, T.WALL], [T.WALL, T.WATER]] };
    const ml = [];
    applySoakedFromWaterWalk(p, dg, ml);
    expect(p.soakedTurns).toBe(0);
  });

  it("watergun_trap がずぶ濡れと所持品影響を与える", () => {
    const trap = { ...TRAPS.find((t) => t.effect === "watergun_trap"), x: 2, y: 2, revealed: false };
    const p = {
      armor: null,
      soakedTurns: 0,
      inventory: [{ type: "scroll", effect: "teleport", name: "テレポートの巻物" }],
      x: 2,
      y: 2,
    };
    const dg = { map: Array.from({ length: 10 }, () => Array(10).fill(T.FLOOR)), traps: [trap], monsters: [], rooms: [] };
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.soakedTurns).toBe(10);
    expect(p.inventory[0].effect).toBe("blank");
  });

  it("watergun_trap は耐水で無効", () => {
    const armor = ITEMS.find((x) => x.name === "アーマーガッパ");
    const trap = { ...TRAPS.find((t) => t.effect === "watergun_trap"), x: 2, y: 2, revealed: false };
    const p = {
      armor,
      soakedTurns: 0,
      inventory: [{ type: "scroll", effect: "teleport", name: "テレポートの巻物" }],
      x: 2,
      y: 2,
    };
    const dg = { map: Array.from({ length: 10 }, () => Array(10).fill(T.FLOOR)), traps: [trap], monsters: [], rooms: [] };
    const ml = [];
    fireTrapPlayer(trap, p, dg, ml);
    expect(p.soakedTurns).toBe(0);
    expect(p.inventory[0].effect).toBe("teleport");
    expect(ml.some((m) => m.includes("耐水"))).toBe(true);
  });

  it("投げた石は途中の水鉄砲の罠を起動せず通過する", () => {
    const { dungeon, player, trap, messages } = launchAtWaterGun(3);

    expect(player.inventory).toEqual([]);
    expect(dungeon.items).toMatchObject([{ name: "石", stone: true, count: 1, x: 4, y: 2 }]);
    expect(trap.revealed).toBe(false);
    expect(messages.some(message => message.includes("水鉄砲の罠が発動"))).toBe(false);
  });

  it("投げた石は着地点の水鉄砲の罠を起動して床に残る", () => {
    const { dungeon, player, trap, messages } = launchAtWaterGun(4);

    expect(player.inventory).toEqual([]);
    expect(dungeon.items).toMatchObject([{ name: "石", stone: true, count: 1, x: 3, y: 2 }]);
    expect(trap.revealed).toBe(true);
    expect(messages.filter(message => message.includes("水鉄砲の罠が発動"))).toHaveLength(1);
  });

  it.each(["throw", "shoot_equipped"])("%sで水鉄砲に着弾した爆弾矢は爆発せず消火される", mode => {
    const { dungeon, player, trap, messages } = launchAtWaterGun(11, makeBombArrow(1), mode);
    expect(player.inventory).toEqual([]);
    expect(dungeon.items).toEqual([]);
    expect(trap.revealed).toBe(true);
    expect(messages).toContain("爆弾矢は水鉄砲で消火された！");
    expect(messages).not.toContain("爆発！");
  });

  it("水鉄砲に落ちた火薬壺は中身を保った保存の壺になる", () => {
    const trap = { id: "trap", name: "水鉄砲の罠", effect: "watergun_trap", x: 4, y: 2, permanent: true };
    const dungeon = makeEmptyDg({ traps: [trap] });
    const contents = [makeNormalStone(1)];
    const pot = { id: "pot", type: "pot", name: "火薬壺", potEffect: "gunpowder", capacity: 4, contents };

    expect(placeItemAt(dungeon, 4, 2, pot, [], new Set())).toBe(true);
    expect(dungeon.items).toEqual([pot]);
    expect(pot).toMatchObject({ name: "保存の壺", potEffect: "none", capacity: 4, contents });
  });

  it.each([
    {
      item: { type: "scroll", name: "テレポートの巻物", effect: "teleport" },
      wet: { name: "白紙の巻物", effect: "blank" },
    },
    {
      item: { type: "spellbook", name: "火炎の魔法書", spell: "fire" },
      wet: { name: "白紙の魔法書", spell: null },
    },
    {
      item: { type: "food", name: "大きいリンゴ", sizeLabel: "大きい", value: 55 },
      wet: { name: "リンゴ", sizeLabel: "普通の", value: 35 },
    },
    {
      item: { type: "food", name: "特盛りカレー", sizeLabel: "特盛り", cooked: true, value: 80 },
      wet: { name: "大盛りカレー", sizeLabel: "大盛り", value: 55 },
    },
    {
      item: { type: "pen", name: "ただのペン", charges: 1 },
      wet: { charges: 0 },
    },
    {
      item: { type: "pen", name: "加護のペン", charges: 1, protected: true },
      wet: { charges: 1 },
    },
  ])("水鉄砲に落ちた$item.nameの水濡れを処理して床に残す", ({ item, wet }) => {
    const trap = { id: "trap", name: "水鉄砲の罠", effect: "watergun_trap", x: 4, y: 2, permanent: true };
    const dungeon = makeEmptyDg({ traps: [trap] });
    const dropped = { ...item, id: "dropped" };

    expect(placeItemAt(dungeon, 4, 2, dropped, [], new Set())).toBe(true);
    expect(trap.revealed).toBe(true);
    expect(dungeon.items).toEqual([dropped]);
    expect(dropped).toMatchObject(wet);
  });
});

describe("ずぶ濡れ・凍結・氷", () => {
  it("ずぶ濡れで氷ダメージが2倍", () => {
    const dry = reduceIceDamage(20, { soakedTurns: 0, armor: null });
    const wet = reduceIceDamage(20, { soakedTurns: 5, armor: null });
    expect(wet).toBe(dry * 2);
    expect(iceResistDamageLabel({ soakedTurns: 3, armor: null })).toContain("ずぶ濡れ");
  });

  it("水中で氷攻撃すると凍結する", () => {
    const p = { x: 1, y: 1, frozenTurns: 0, armor: null };
    const dg = { map: [[T.WALL, T.WALL], [T.WALL, T.WATER]], springs: [] };
    const ml = [];
    expect(isPlayerOnWater(p, dg)).toBe(true);
    expect(applyWaterIceFreeze(p, dg, ml, 5)).toBe(true);
    expect(p.frozenTurns).toBe(5);
    expect(ml.some((m) => m.includes("凍りついた"))).toBe(true);
  });

  it("凍結中は物理ダメージ2倍", () => {
    expect(applyFrozenPhysicalMult(10, { frozenTurns: 3 })).toBe(20);
    expect(applyFrozenPhysicalMult(10, { frozenTurns: 0 })).toBe(10);
  });

  it("freezeWaterTile が水を床にする", () => {
    const dg = {
      map: [[T.WATER]],
      waterItems: [{ x: 0, y: 0, item: { name: "石", type: "arrow" } }],
      items: [],
      springs: [],
    };
    const ml = [];
    expect(freezeWaterTile(dg, 0, 0, ml)).toBe(true);
    expect(dg.map[0][0]).toBe(T.FLOOR);
    expect(dg.items.length).toBe(1);
  });
});

describe("泉の立ち絵", () => {
  it("立ち絵カテゴリに泉の飲む・浸すがある", () => {
    const action = PORTRAIT_CATEGORIES.find((c) => c.id === "action");
    const files = action.slots.map((s) => s.file);
    expect(files).toContain("action_drink_spring");
    expect(files).toContain("action_soak_spring");
  });

  it("msgToActionKey が泉を薬より優先する", () => {
    expect(msgToActionKey("泉の水を飲んだ。")).toBe("act_spring_drink");
    expect(msgToActionKey("清らかな水を飲んだ。")).toBe("act_spring_drink");
    expect(msgToActionKey("巻物「謎」を泉に浸した...文字が消えた！")).toBe("act_spring_soak");
    expect(msgToActionKey("回復薬を飲んだ。HP+30")).toBe("act_potion");
  });
});
