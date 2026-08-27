import { describe, it, expect, afterEach, vi } from "vitest";
import { getIdentKey, itemPrice, applyPotionEffect, applyWaterSplash, splashPotion, applyPotEffect, getBlessMultiplier, gemSellPrice, GEM_TYPES, makeRandomPotion, rotFood, isFireExplosionNullified, announceFireExplosionNullified, doExplosion, doGunpowderExplosion, calcProjectileDmg, hasFireResist, hasLightningResist, applyLightningToInventory, reduceFireDamage, reduceLightningDamage, reduceIceDamage, imprisonPotRemainingCapacity, potOccupancyCount, canConfineMonsterInImprisonPot, confinePlayerInImprisonPot, confineMonsterInImprisonPot, releaseConfinedMonstersFromPot, scatterPotContents, resolveImprisonPotExit, canMonsterSurviveOnWater, canPlayerWalkOnWater, hasWaterBreathRing, applySoakedFromWaterWalk, isSoaked, reflectMagicStoneToPlayer, shootArrow, makeChangeBoxItem, breakBigboxContents, penInitialCharges, killMonster } from "../items.js";
import { MW, MH, T, applyReverseStatus, installPlayerHpReverseHook } from "../utils.js";
import { setFavoriteFoodBase } from "../items.js";
import { weaponCriticalRate, ONI_CLUB_T, CAT_CLAW_T, ITEMS, WEAPON_ABILITIES } from "../items.js";
import { addOilProofAbility, consumeItemDegradeProtection, soakItemIntoSpring } from "../items.js";
import "../monsters.js";

afterEach(() => setFavoriteFoodBase(""));

describe("好物の調味料相性", () => {
  it("好物はすべての味付け壺で相性抜群になる", () => {
    setFavoriteFoodBase("好物の名前");
    const potEffects = ["choco", "spicy", "honey", "curry", "miso", "olive", "sesame", "butter", "yogurt", "coconut", "soy", "garlic", "lemon"];
    for (const potEffect of potEffects) {
      const item = { type: "food", name: "好物の名前", _foodBase: "好物の名前", value: 20 };
      const ml = [];
      applyPotEffect({ type: "pot", name: `${potEffect}の壺`, potEffect }, item, ml);
      expect(item.value, potEffect).toBe(32);
      expect(ml.at(-1), potEffect).toContain("相性抜群");
    }
  });
});

describe("会心能力の合成", () => {
  it("鬼棍棒・戦神の斧・猫の爪を別系統として25%ずつ加算する", () => {
    expect(ONI_CLUB_T.ability).toBe("critical_oni_club");
    expect(CAT_CLAW_T.ability).toBe("critical_cat_claw");
    expect(weaponCriticalRate({ ability: "critical_oni_club" })).toBe(0.25);
    expect(weaponCriticalRate({ abilities: ["critical_oni_club", "critical_war_god_axe"] })).toBe(0.50);
    expect(weaponCriticalRate({ abilities: ["critical_oni_club", "critical_war_god_axe", "critical_cat_claw"] })).toBe(0.75);
    expect(weaponCriticalRate({ abilities: ["critical_oni_club", "critical_war_god_axe"] }, true)).toBe(0.75);
    expect(weaponCriticalRate({ abilities: ["critical_oni_club", "critical_war_god_axe", "critical_cat_claw"] }, true)).toBe(1);
  });

  it("3種の会心武器はゲーム内説明を共通化する", () => {
    const criticalIds = ["critical_oni_club", "critical_war_god_axe", "critical_cat_claw"];
    const abilityDescs = WEAPON_ABILITIES
      .filter((ability) => criticalIds.includes(ability.id))
      .map((ability) => ability.desc);
    const weaponDescs = [
      ITEMS.find((item) => item.name === "戦神の斧")?.desc,
      ONI_CLUB_T.desc,
      CAT_CLAW_T.desc,
    ];

    expect(new Set(abilityDescs)).toEqual(new Set(["会心の一撃が出やすくなる"]));
    expect(new Set(weaponDescs)).toEqual(new Set(["会心の一撃が出やすい武器。"]));
  });
});

describe("油膜の劣化防止", () => {
  it("油系の壺で武器・防具に3回限定の油膜が付く", () => {
    for (const potEffect of ["olive", "sesame", "butter"]) {
      const item = { type: "weapon", name: "短剣", plus: 0 };
      const ml = [];
      applyPotEffect({ type: "pot", name: `${potEffect}の壺`, potEffect }, item, ml);
      expect(item.ability, potEffect).toBe("oil_proof");
      expect(item.oilProofUses, potEffect).toBe(3);
      expect(ml.at(-1), potEffect).toContain("3回");
    }
  });

  it("油膜は劣化を3回防いだあと能力ごと消える", () => {
    const item = { type: "armor", name: "革の鎧" };
    expect(addOilProofAbility(item)).toBe(true);
    expect(consumeItemDegradeProtection(item).remaining).toBe(2);
    expect(consumeItemDegradeProtection(item).remaining).toBe(1);
    expect(consumeItemDegradeProtection(item).remaining).toBe(0);
    expect(item.ability).toBeUndefined();
    expect(item.oilProofUses).toBeUndefined();
    expect(consumeItemDegradeProtection(item)).toBeNull();
  });

  it("泉に浸した劣化防止装備は＋値を下げず油膜を1回消費する", () => {
    const item = { type: "weapon", name: "短剣", plus: 2, ability: "oil_proof", oilProofUses: 3 };
    const ml = [];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      soakItemIntoSpring({ contents: [] }, item, ml);
    } finally {
      random.mockRestore();
    }
    expect(item.plus).toBe(2);
    expect(item.oilProofUses).toBe(2);
  });
});

describe("getIdentKey", () => {
  it("種別ごとに識別キーを返す", () => {
    expect(getIdentKey({ type: "potion", effect: "heal" })).toBe("p:heal");
    expect(getIdentKey({ type: "scroll", effect: "teleport" })).toBe("s:teleport");
    expect(getIdentKey({ type: "scroll", effect: "blank" })).toBeNull();
    expect(getIdentKey({ type: "wand", effect: "sleep" })).toBe("w:sleep");
    expect(getIdentKey({ type: "gold" })).toBeNull();
  });
});

describe("魔法の石の反射", () => {
  it("投擲反射敵からプレイヤーへ跳ね返ってダメージを与える", () => {
    const player = { hp: 100, atk: 12, rings: [], sleepTurns: 3, paralyzeTurns: 2 };
    const reflector = { name: "ほっちもぺ", subtype: "reflector" };
    const messages = [];

    const damage = reflectMagicStoneToPlayer(player, reflector, "魔法の石", 5, messages);

    expect(damage).toBeGreaterThan(0);
    expect(player.hp).toBe(100 - damage);
    expect(player.deathCause).toBe("ほっちもぺに跳ね返された魔法の石で");
    expect(player.sleepTurns).toBe(0);
    expect(player.paralyzeTurns).toBe(0);
    expect(messages.some(message => message.includes("弾き返された"))).toBe(true);
    expect(messages.some(message => message.includes("プレイヤーにホーミング命中"))).toBe(true);
  });
});

describe("下手投げの矢", () => {
  it("アイテム欄から射っても敵に命中せず、その足元に落ちる", () => {
    const arrow = { name: "矢", type: "arrow", count: 1, atk: 3 };
    const target = { name: "的", x: 3, y: 1, hp: 30, maxHp: 30, def: 0 };
    const player = { x: 1, y: 1, atk: 10, rings: [], inventory: [arrow] };
    const dungeon = {
      map: Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR)),
      monsters: [target], items: [], traps: [], pentacles: [], rooms: [], hiddenRooms: [],
    };
    const messages = [];

    shootArrow(player, dungeon, 0, 1, 0, messages, () => {}, null, null, null, { forceMiss: true });

    expect(target.hp).toBe(30);
    expect(dungeon.items).toContainEqual(expect.objectContaining({ x: 3, y: 1, type: "arrow" }));
    expect(messages).toContain("矢は的に外れ、足元に落ちた！");
  });
});

describe("itemPrice", () => {
  it("sellPrice を基準に価格を計算する", () => {
    expect(itemPrice({ type: "potion", effect: "heal", sellPrice: 100 })).toBe(100);
  });

  it("武器は強化値で加算する", () => {
    expect(itemPrice({ type: "weapon", sellPrice: 50, plus: 2 })).toBe(250);
  });

  it("祝福品は価格が上がる", () => {
    expect(itemPrice({ type: "potion", sellPrice: 100, blessed: true })).toBe(110);
  });
});

describe("getBlessMultiplier", () => {
  it("祝福・呪い・通常の倍率を返す", () => {
    expect(getBlessMultiplier({ blessed: true })).toBe(1.5);
    expect(getBlessMultiplier({ cursed: true })).toBe(0.5);
    expect(getBlessMultiplier({})).toBe(1);
    expect(getBlessMultiplier(null)).toBe(1);
  });
});

describe("gemSellPrice", () => {
  it("全種類の基本価格が重複しない", () => {
    const prices = GEM_TYPES.map(gem => gem.basePrice);
    expect(new Set(prices).size).toBe(prices.length);
  });

  it("現実の希少性を意識した序列で、300Gから10000Gに収まる", () => {
    const expectedOrder = [
      "アメジスト", "トパーズ", "ブラックオニキス", "ターコイズ",
      "ガーネット", "ムーンストーン", "ラピスラズリ", "アクアマリン",
      "オパール", "エメラルド", "サファイア", "ルビー",
      "ダイヤモンド", "アレキサンドライト",
    ];
    const expectedPrices = {
      "アメジスト": 300, "トパーズ": 500, "ブラックオニキス": 800,
      "ターコイズ": 1200, "ガーネット": 1700, "ムーンストーン": 2300,
      "ラピスラズリ": 3000, "アクアマリン": 4000, "オパール": 5000,
      "エメラルド": 6000, "サファイア": 7000, "ルビー": 8000,
      "ダイヤモンド": 9000, "アレキサンドライト": 10000,
    };
    const sorted = [...GEM_TYPES].sort((a, b) => a.basePrice - b.basePrice);
    expect(Object.fromEntries(GEM_TYPES.map(gem => [gem.name, gem.basePrice]))).toEqual(expectedPrices);
    expect(sorted.map(gem => gem.name)).toEqual(expectedOrder);
    expect(sorted[0].basePrice).toBe(300);
    expect(sorted.at(-1).basePrice).toBe(10000);
    expect(sorted.every(gem => gem.basePrice >= 300 && gem.basePrice <= 10000)).toBe(true);
  });

  it("階層の距離に応じて売値が上がる", () => {
    const gem = { basePrice: 100, originDepth: 5 };
    expect(gemSellPrice(gem, 5)).toBe(100);
    expect(gemSellPrice(gem, 10)).toBe(275);
  });
});

describe("applyPotionEffect", () => {
  const dg = { monsters: [], items: [], pentacles: [] };

  it("回復薬でプレイヤーHPが回復する", () => {
    const p = { hp: 50, maxHp: 100, x: 1, y: 1, inventory: [] };
    const ml = [];
    applyPotionEffect("heal", 30, "player", null, dg, p, ml, () => {});
    expect(p.hp).toBe(80);
    expect(ml.some(m => m.includes("回復"))).toBe(true);
  });

  it("祝福の回復薬は2倍回復する", () => {
    const p = { hp: 50, maxHp: 100, x: 1, y: 1, inventory: [] };
    const ml = [];
    applyPotionEffect("heal", 30, "player", null, dg, p, ml, () => {}, true, false);
    expect(p.hp).toBe(100);
  });

  it("呪われた回復薬はダメージになる", () => {
    const p = { hp: 50, maxHp: 100, x: 1, y: 1, inventory: [] };
    const ml = [];
    applyPotionEffect("heal", 30, "player", null, dg, p, ml, () => {}, false, true);
    expect(p.hp).toBe(20);
    expect(ml.some(m => m.includes("ダメージ"))).toBe(true);
  });

  it("逆転状態で満タンの回復薬は最大HPを増やさずダメージになる", () => {
    const p = { hp: 100, maxHp: 100, x: 1, y: 1, inventory: [] };
    installPlayerHpReverseHook(p);
    applyReverseStatus(p, 20);
    const ml = [];
    applyPotionEffect("heal", 30, "player", null, dg, p, ml, () => {});
    expect(p.maxHp).toBe(100);
    expect(p.hp).toBe(99);
    expect(ml.some(m => m.includes("1ダメージを受けた"))).toBe(true);
  });

  it("アンデッドへの回復薬はダメージになる", () => {
    const mon = { name: "ゾンビ", kind: "undead", hp: 40, maxHp: 40, x: 2, y: 2, atk: 5 };
    const p = { hp: 100, maxHp: 100, x: 1, y: 1, inventory: [] };
    const ml = [];
    applyPotionEffect("heal", 30, "monster", mon, dg, p, ml, () => {});
    expect(mon.hp).toBe(10);
  });

  it("投擲された封印の薬でもMP封印は50ターンになる", () => {
    const p = { hp: 100, maxHp: 100, x: 1, y: 1, inventory: [] };
    const splashDungeon = {
      ...dg,
      map: Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR)),
      traps: [],
    };
    const ml = [];

    splashPotion(splashDungeon, p.x, p.y, "seal", 0, p, ml, () => {});

    expect(p.mpCooldownTurns).toBe(50);
    expect(ml.some(m => m.includes("MP封印50ターン"))).toBe(true);
  });

  it("逆転状態で満タンの回復の壺は回復量分のダメージになる", () => {
    const p = { hp: 100, maxHp: 100, x: 1, y: 1, inventory: [] };
    installPlayerHpReverseHook(p);
    applyReverseStatus(p, 20);
    const ml = [];
    scatterPotContents(
      { name: "回復の壺", potEffect: "heal_pot", capacity: 3, contents: [{}, {}] },
      dg, p.x, p.y, p, ml, () => {},
    );
    expect(p.hp).toBe(0);
    expect(ml.some(m => m.includes("100ダメージを受けた"))).toBe(true);
  });
});

describe("ペン初期回数", () => {
  it("強力なペンは1〜2、通常は2〜3、ただのペンは4〜5", () => {
    expect(penInitialCharges({ effect: "sanctuary", rarity: "A" }, () => 0)).toBe(1);
    expect(penInitialCharges({ effect: "sanctuary", rarity: "A" }, () => 0.99)).toBe(2);
    expect(penInitialCharges({ effect: "portal", rarity: "B" }, () => 0)).toBe(2);
    expect(penInitialCharges({ effect: "portal", rarity: "B" }, () => 0.99)).toBe(3);
    expect(penInitialCharges({ effect: "vulnerability", rarity: "C" }, () => 0)).toBe(2);
    expect(penInitialCharges({ effect: "vulnerability", rarity: "C" }, () => 0.99)).toBe(3);
    expect(penInitialCharges({ effect: "plain", rarity: "E" }, () => 0)).toBe(4);
    expect(penInitialCharges({ effect: "plain", rarity: "E" }, () => 0.99)).toBe(5);
  });
});

describe("骨の上での撃破ドロップ", () => {
  it("敵を先に除去してからドロップし、骨の破壊は一度だけ行う", () => {
    const monster = {
      id: "fukumaru-bone-test", name: "フクマル", baseKind: "runner", subtype: "runner",
      hp: 0, maxHp: 11, atk: 0, def: 0, exp: 50, speed: 2, x: 2, y: 2,
    };
    const bone = {
      id: "bone-test", name: "骨", effect: "bone", x: 2, y: 2, reviveIn: 5,
      monData: { baseKind: "skeleton", name: "スケルトン", maxHp: 24 },
    };
    const dungeon = {
      map: Array.from({ length: 8 }, () => Array(8).fill(T.FLOOR)),
      monsters: [monster], items: [], traps: [bone], bigboxes: [], springs: [],
      pentacles: [], rooms: [],
    };
    const player = { x: 0, y: 0, hp: 100, maxHp: 100, exp: 0, atk: 10, rings: [], inventory: [] };
    const messages = [];

    killMonster(monster, dungeon, player, messages, null, true);

    expect(dungeon.monsters).toEqual([]);
    expect(dungeon.traps).not.toContain(bone);
    expect(messages.filter((message) => message.includes("フクマルは消し飛んだ！"))).toHaveLength(1);
    expect(messages.filter((message) => message.includes("骨がフクマルに激突！"))).toHaveLength(0);
  });
});

describe("祝呪系の壺", () => {
  it("祝福・呪いの壺に別の壺を入れても容量だけが変わる", () => {
    const target = { name: "保存の壺", type: "pot", potEffect: "none", capacity: 5 };
    const blessed = { name: "祝福の壺", type: "pot", potEffect: "bless_pot" };
    const cursed = { name: "呪いの壺", type: "pot", potEffect: "curse_pot" };
    applyPotEffect(blessed, target, []);
    expect(target.capacity).toBe(6);
    expect(target.blessed).toBeUndefined();
    applyPotEffect(cursed, target, []);
    expect(target.capacity).toBe(5);
    expect(target.cursed).toBeUndefined();
  });
});

describe("ゴミ箱の破壊報酬", () => {
  it("変化の大箱と同じ系統のアイテムを1個生成する", () => {
    const item = makeChangeBoxItem();
    expect(["potion", "scroll", "pen", "weapon", "armor", "food", "wand", "arrow", "pot", "ring", "spellbook", "marker", "bottle", "gold"]).toContain(item.type);
    expect(item.id).toBeTruthy();
  });

  it("変化抽選は宝石・キーアイテム以外の全カテゴリを対象にする", () => {
    const expected = new Set(["potion", "scroll", "pen", "weapon", "armor", "food", "wand", "arrow", "pot", "ring", "spellbook", "marker", "bottle", "gold"]);
    const seen = new Set();
    for (let i = 0; i < 3000; i++) {
      const item = makeChangeBoxItem();
      seen.add(item.type);
      expect(["gem", "goal"]).not.toContain(item.type);
    }
    expect(seen).toEqual(expected);
  });

  it("変化抽選の祝福・呪いでレア度補正を使い分ける", () => {
    const run = (context, values) => {
      const randomSpy = vi.spyOn(Math, "random").mockImplementationOnce(() => values[0]).mockImplementationOnce(() => values[1]).mockImplementationOnce(() => values[2] ?? 0);
      try {
        return makeChangeBoxItem(context);
      } finally {
        randomSpy.mockRestore();
      }
    };

    const blessed = run("change_blessed", [0.22, 0, 0]);
    const cursed = run("change_cursed", [0.22, 0.5, 0]);
    expect(["C", "B", "A", "S"]).toContain(blessed.rarity);
    expect(cursed.rarity).toBe("E");
  });

  it("ゴミ箱が壊れると中身に加えてランダム品を落とす", () => {
    const dungeon = {
      map: Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR)),
      items: [], monsters: [], traps: [], springs: [], pentacles: [], bigboxes: [],
    };
    const bb = { kind: "trash", name: "ゴミ箱", x: 10, y: 10, capacity: 0, contents: [{ name: "石", type: "arrow", tile: 22, count: 1, id: "inside" }] };
    dungeon.bigboxes.push(bb);
    const messages = [];

    breakBigboxContents(bb, dungeon, messages);

    expect(dungeon.bigboxes).not.toContain(bb);
    expect(dungeon.items).toHaveLength(2);
    expect(dungeon.items.some(item => item.id === "inside")).toBe(true);
    expect(messages.some(message => message.includes("ゴミ箱から"))).toBe(true);
  });
});

describe("rotFood", () => {
  it("腐敗時に祝福・特殊効果・壺味を除去し大きさは残す", () => {
    const food = {
      type: "food",
      name: "カレー味の満腹の特盛りおにぎり",
      _foodBase: "おにぎり",
      sizeLabel: "特盛り",
      effect: "satiate_food",
      blessed: true,
      cursed: false,
      bcKnown: true,
      potFlavors: ["curry"],
      value: 120,
    };
    rotFood(food);
    expect(food.rotten).toBe(true);
    expect(food.name).toBe("腐った特盛りおにぎり");
    expect(food.sizeLabel).toBe("特盛り");
    expect(food.value).toBe(120);
    expect(food.blessed).toBeUndefined();
    expect(food.cursed).toBeUndefined();
    expect(food.effect).toBeUndefined();
    expect(food.potFlavors).toBeUndefined();
  });

  it("腐った食料はヤバイ化でエンチャントだけ除去し大きさは残す", () => {
    const food = {
      type: "food",
      name: "腐った特盛りおにぎり",
      _foodBase: "おにぎり",
      sizeLabel: "特盛り",
      rotten: true,
      blessed: true,
      effect: "heal_food",
      value: 80,
    };
    expect(rotFood(food)).toBe("yabai");
    expect(food.yabai).toBe(true);
    expect(food.name).toBe("ヤバイ特盛りおにぎり");
    expect(food.sizeLabel).toBe("特盛り");
    expect(food.blessed).toBeUndefined();
    expect(food.effect).toBeUndefined();
    expect(food.value).toBe(80);
  });
});

describe("水の飛散", () => {
  it("通常の水は3×3内の腐敗・焦げた食料を元に戻す", () => {
    const rotten = { type: "food", name: "腐ったおにぎり", _foodBase: "おにぎり", rotten: true, value: 20, x: 4, y: 4 };
    const burnt = { type: "food", name: "焦げた焼いたパン", _foodBase: "パン", cooked: true, burnt: true, value: 12, x: 6, y: 6 };
    const outside = { type: "food", name: "腐った肉", _foodBase: "肉", rotten: true, value: 20, x: 7, y: 7 };
    const pentacle = { name: "回復の魔方陣", x: 4, y: 5 };
    const dg = { map: Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR)), items: [rotten, burnt, outside], monsters: [], traps: [], pentacles: [pentacle], pendingBombs: [] };
    const ml = [];
    const p = { x: 0, y: 0, hp: 10, maxHp: 10 };

    applyWaterSplash(dg, 5, 5, false, false, ml, p, () => {});

    expect(rotten).toMatchObject({ name: "おにぎり" });
    expect(rotten.rotten).toBeUndefined();
    expect(burnt).toMatchObject({ name: "パン", value: 20 });
    expect(burnt.burnt).toBeUndefined();
    expect(outside.rotten).toBe(true);
    expect(dg.pentacles).toHaveLength(0);
  });

  it("店の商品に水をかけて白紙化すると代金を請求する", () => {
    const shopkeeper = { id: "water-shopkeeper", state: "friendly" };
    const shop = {
      id: "water-shop", shopkeeperId: shopkeeper.id, unpaidTotal: 0,
      room: { x: 4, y: 4, w: 4, h: 4 },
    };
    const scroll = {
      id: "shop-scroll", type: "scroll", effect: "identify", name: "識別の巻物",
      x: 5, y: 5, shopPrice: 100, _shopId: shop.id,
    };
    const spellbook = {
      id: "shop-spellbook", type: "spellbook", spell: "fire_bolt", name: "炎の魔法書",
      x: 6, y: 5, shopPrice: 200, _shopId: shop.id,
    };
    const dg = {
      map: Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR)),
      items: [scroll, spellbook], monsters: [shopkeeper], traps: [], pentacles: [],
      springs: [], bigboxes: [], shops: [shop], pendingBombs: [],
    };
    const p = { x: 0, y: 0, rings: [] };
    const ml = [];

    applyWaterSplash(dg, 5, 5, false, false, ml, p, () => {});

    expect(scroll.effect).toBe("blank");
    expect(spellbook.spell).toBeNull();
    expect(shop.unpaidTotal).toBe(300);
    expect(scroll.shopPrice).toBeUndefined();
    expect(spellbook.shopPrice).toBeUndefined();
    expect(ml.filter((message) => message.includes("請求された")).length).toBe(2);
  });

  it("祝福・呪いの水は従来どおり着弾マスだけに作用する", () => {
    const center = { type: "weapon", name: "剣", x: 5, y: 5 };
    const adjacent = { type: "weapon", name: "槍", x: 6, y: 5 };
    const dg = { map: Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR)), items: [center, adjacent] };

    applyWaterSplash(dg, 5, 5, true, false, []);

    expect(center.blessed).toBe(true);
    expect(adjacent.blessed).toBeUndefined();
  });
});

describe("空き瓶の薬ドロップ", () => {
  it("通常の薬をレア度重み付きで新しいIDとして生成する", () => {
    const potion = makeRandomPotion(() => 0.99);

    expect(potion.type).toBe("potion");
    expect(potion.effect).not.toBe("water");
    expect(potion.id).toBeTruthy();
    expect(potion.name).toBe("レベルアップの薬");
  });
});

describe("isFireExplosionNullified", () => {
  it("呪われた爆発の魔方陣があると炎・爆発が不発になる", () => {
    const dg = { pentacles: [{ kind: "explosion", cursed: true }] };
    expect(isFireExplosionNullified(dg, { fireExplosionNullTurns: 0 })).toBe(true);
  });

  it("自爆の巻物【呪】バフ中は炎・爆発が不発になる", () => {
    const dg = { pentacles: [] };
    expect(isFireExplosionNullified(dg, { fireExplosionNullTurns: 200 })).toBe(true);
    expect(isFireExplosionNullified(dg, { fireExplosionNullTurns: 0 })).toBe(false);
  });

  it("雷の魔方陣だけでは炎・爆発は不発にならない", () => {
    const dg = { pentacles: [{ kind: "thunder_trap", cursed: true }] };
    expect(isFireExplosionNullified(dg, null)).toBe(false);
  });
});

describe("doExplosion", () => {
  it("爆弾矢の爆発は射手の攻撃力と対象の防御力で計算する", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const makeDungeon = () => ({
      pentacles: [],
      monsters: [{ id: "blast-target", name: "標的", x: 5, y: 5, hp: 100, maxHp: 100, def: 0 }],
      items: [],
      map: Array.from({ length: 21 }, () => Array(33).fill(1)),
      explored: [],
      visible: [],
      traps: [],
    });
    const single = makeDungeon();
    const bundle = makeDungeon();
    const singlePlayer = { x: 0, y: 0, hp: 100, maxHp: 100, atk: 12, inventory: [] };
    const bundlePlayer = { x: 0, y: 0, hp: 100, maxHp: 100, atk: 12, inventory: [] };
    doExplosion(5, 5, single, singlePlayer, [], null, "爆弾矢の爆発", null, null, false, false, false, false, { projectileAtk: 6 });
    doExplosion(5, 5, bundle, bundlePlayer, [], null, "爆弾矢の爆発", null, null, false, false, false, false, { projectileAtk: 9 });
    expect(single.monsters[0].hp).toBe(100 - calcProjectileDmg(singlePlayer, 6, 0));
    expect(bundle.monsters[0].hp).toBe(100 - calcProjectileDmg(bundlePlayer, 9, 0));
    expect(bundle.monsters[0].hp).toBeLessThan(single.monsters[0].hp);
    vi.restoreAllMocks();
  });

  it("鈍亀の指輪は自分が受ける飛び道具ダメージの防御計算を2倍にする", () => {
    const makeDungeon = () => ({
      pentacles: [], monsters: [], items: [],
      map: Array.from({ length: 21 }, () => Array(33).fill(1)),
      explored: [], visible: [], traps: [],
    });
    const makePlayer = (rings) => ({
      x: 5, y: 5, hp: 100, maxHp: 100, atk: 10, def: 10,
      armor: { def: 5, plus: 1 }, rings, inventory: [],
    });
    const normal = makePlayer([]);
    const turtle = makePlayer([{ effect: "slow_ring" }]);
    doExplosion(5, 5, makeDungeon(), normal, [], null, "飛び道具", null, null, false, false, false, false, { projectileAtk: 70 });
    doExplosion(5, 5, makeDungeon(), turtle, [], null, "飛び道具", null, null, false, false, false, false, { projectileAtk: 70 });
    expect(turtle.hp).toBeGreaterThan(normal.hp);
  });

  it("地雷爆発は耐火でダメージ軽減される", () => {
    const dg = { pentacles: [], monsters: [], items: [], map: Array.from({ length: 21 }, () => Array(33).fill(1)), explored: [], visible: [], traps: [] };
    const p = { x: 5, y: 5, hp: 100, maxHp: 100, armor: { ability: "fire_resist" }, inventory: [] };
    const ml = [];
    doExplosion(5, 5, dg, p, ml, null, "地雷", null, null, true, false, true);
    expect(p.hp).toBe(67);
    expect(ml.some(m => m.includes("耐火"))).toBe(true);
  });

  it("地雷爆発は油まみれなら耐火なしでHP1を残す", () => {
    const dg = { pentacles: [], monsters: [], items: [], map: Array.from({ length: 21 }, () => Array(33).fill(1)), explored: [], visible: [], traps: [] };
    const p = { x: 5, y: 5, hp: 100, maxHp: 100, oilyTurns: 10, inventory: [] };
    const ml = [];
    doExplosion(5, 5, dg, p, ml, null, "地雷", null, null, true, false, true);
    expect(p.hp).toBe(1);
    expect(ml.some(m => m.includes("油まみれ") && m.includes("HPが1残った"))).toBe(true);
  });

  it("地雷爆発は油まみれでも耐火時は通常の軽減計算を使う", () => {
    const dg = { pentacles: [], monsters: [], items: [], map: Array.from({ length: 21 }, () => Array(33).fill(1)), explored: [], visible: [], traps: [] };
    const p = { x: 5, y: 5, hp: 100, maxHp: 100, oilyTurns: 10, armor: { ability: "fire_resist" }, inventory: [] };
    const ml = [];
    doExplosion(5, 5, dg, p, ml, null, "地雷", null, null, true, false, true);
    expect(p.hp).toBe(34);
    expect(ml.some(m => m.includes("油まみれ×2"))).toBe(true);
    expect(ml.some(m => m.includes("耐火"))).toBe(true);
  });

  it("火薬壺のHP4分の3爆発は油まみれなら即死する", () => {
    const dg = { pentacles: [], monsters: [], items: [], map: Array.from({ length: 21 }, () => Array(33).fill(1)), explored: [], visible: [], traps: [] };
    const p = { x: 5, y: 5, hp: 100, maxHp: 100, oilyTurns: 10, inventory: [] };
    const ml = [];
    doGunpowderExplosion(5, 5, dg, p, ml, () => {});
    expect(p.hp).toBeLessThanOrEqual(0);
  });

  it("炎・爆発不発時は爆発せずメッセージを出す", () => {
    const dg = { pentacles: [], monsters: [], items: [], map: Array.from({ length: 21 }, () => Array(33).fill(1)), explored: [], visible: [] };
    const p = { x: 5, y: 5, hp: 50, maxHp: 100, fireExplosionNullTurns: 42, inventory: [] };
    const ml = [];
    doExplosion(5, 5, dg, p, ml, null, "地雷");
    expect(ml.some(m => m.includes("不発") && m.includes("42"))).toBe(true);
    expect(ml.some(m => m === "爆発！")).toBe(false);
  });
});

describe("reduceFireDamage / reduceLightningDamage / reduceIceDamage", () => {
  it("個別のみ・万能のみは2/3、個別+万能は半減", () => {
    expect(reduceFireDamage(30, { armor: { ability: "fire_resist" } })).toBe(20);
    expect(reduceFireDamage(30, { armor: { ability: "all_resist" } })).toBe(20);
    expect(reduceFireDamage(30, { armor: { ability: "fire_resist", abilities: ["all_resist"] } })).toBe(15);
    expect(reduceLightningDamage(30, { armor: { abilities: ["lightning_resist", "all_resist"] } })).toBe(15);
    expect(reduceIceDamage(30, { armor: { ability: "ice_resist" } })).toBe(20);
    expect(reduceFireDamage(30, { armor: { ability: "regen" } })).toBe(30);
  });
});

describe("hasFireResist / hasLightningResist", () => {
  it("耐火・雷耐性と万能耐性を判定する", () => {
    expect(hasFireResist({ armor: { ability: "fire_resist" } })).toBe(true);
    expect(hasFireResist({ armor: { ability: "all_resist" } })).toBe(true);
    expect(hasFireResist({ armor: { ability: "lightning_resist" } })).toBe(false);
    expect(hasLightningResist({ armor: { abilities: ["lightning_resist"] } })).toBe(true);
    expect(hasLightningResist({ armor: { ability: "all_resist" } })).toBe(true);
  });
});

describe("applyLightningToInventory", () => {
  const dg = { pentacles: [] };

  it("耐火防具で炎による所持品破壊を防ぐ", () => {
    const p = { inventory: [{ type: "scroll", name: "テスト巻物" }], armor: { ability: "fire_resist" } };
    const ml = [];
    applyLightningToInventory(p, dg, ml, () => {}, null, true);
    expect(p.inventory).toHaveLength(1);
    expect(ml).toHaveLength(0);
  });

  it("雷耐性防具で雷による所持品破壊を防ぐ", () => {
    const p = { inventory: [{ type: "potion", name: "テスト薬" }], armor: { ability: "lightning_resist" } };
    const ml = [];
    applyLightningToInventory(p, dg, ml, () => {}, null, false);
    expect(p.inventory).toHaveLength(1);
    expect(ml).toHaveLength(0);
  });

  it("耐性なしなら所持品が壊れる", () => {
    const p = { inventory: [{ type: "scroll", name: "テスト巻物" }], armor: { ability: "regen" } };
    const ml = [];
    applyLightningToInventory(p, dg, ml, () => {}, null, true);
    expect(p.inventory).toHaveLength(0);
    expect(ml.some(m => m.includes("燃えて"))).toBe(true);
  });
});

describe("imprison pot", () => {
  it("残り容量は閉じ込めた敵の数で減る", () => {
    const pot = { type: "pot", potEffect: "imprison", capacity: 3, confinedMonsters: [{ name: "スライム" }] };
    expect(imprisonPotRemainingCapacity(pot)).toBe(2);
    expect(potOccupancyCount(pot)).toBe(1);
  });

  it("入れると残り容量×10ターン動けなくなる", () => {
    const pot = { type: "pot", potEffect: "imprison", name: "とじこめの壺", capacity: 3, confinedMonsters: [] };
    const p = {};
    const ml = [];
    const _dg = { map: Array.from({ length: MH }, () => Array(MW).fill(1)), springs: [] };
    expect(confinePlayerInImprisonPot(pot, p, _dg, ml)).toBe(true);
    expect(p.potConfinedTurns).toBe(30);
    expect(ml.some(m => m.includes("30"))).toBe(true);
  });

  it("敵を閉じ込めて割れると放出される", () => {
    const pot = { type: "pot", potEffect: "imprison", name: "とじこめの壺", capacity: 3, confinedMonsters: [] };
    const mon = { id: "m1", name: "スライム", hp: 10, maxHp: 10, x: 5, y: 5, atk: 3 };
    const dg = { monsters: [mon], map: Array.from({ length: MH }, () => Array(MW).fill(1)) };
    const ml = [];
    confineMonsterInImprisonPot(pot, mon, dg, ml);
    expect(dg.monsters).toHaveLength(0);
    expect(pot.confinedMonsters).toHaveLength(1);
    scatterPotContents(pot, dg, 5, 5, null, ml, () => {});
    expect(dg.monsters).toHaveLength(1);
    expect(pot.confinedMonsters).toHaveLength(0);
    expect(ml.some(m => m.includes("割れた"))).toBe(true);
  });

  it("閉じ込め不可の敵を判定する", () => {
    expect(canConfineMonsterInImprisonPot({ type: "shopkeeper" })).toBe(false);
    expect(canConfineMonsterInImprisonPot({ isBoss: true })).toBe(false);
    expect(canConfineMonsterInImprisonPot({ baseKind: "firedemon" })).toBe(false);
    expect(canConfineMonsterInImprisonPot({ baseKind: "synthmonster" })).toBe(false);
    expect(canConfineMonsterInImprisonPot({ name: "スライム" })).toBe(true);
  });

  it("出たときは常に壺が割れて消える", () => {
    const pot = { id: "pot1", type: "pot", potEffect: "imprison", name: "とじこめの壺", capacity: 3, confinedMonsters: [{ name: "ゴブリン", hp: 8, maxHp: 8, atk: 2 }] };
    const p = { x: 4, y: 4, inventory: [pot] };
    const dg = { monsters: [], map: Array.from({ length: MH }, () => Array(MW).fill(1)), springs: [] };
    const ml = [];
    confinePlayerInImprisonPot(pot, p, dg, ml);
    resolveImprisonPotExit(p, dg, ml, () => {});
    expect(p.inventory).toHaveLength(0);
    expect(dg.monsters).toHaveLength(1);
    expect(p.potConfinedPotId).toBeUndefined();
  });

  it("水上は歩ける敵だけ生存しそれ以外は水没する", () => {
    const dg = {
      monsters: [],
      map: Array.from({ length: MH }, () => Array(MW).fill(1)),
    };
    dg.map[5][5] = T.WATER;
    expect(canMonsterSurviveOnWater({ name: "スライム" }, dg, 5, 5)).toBe(false);
    expect(canMonsterSurviveOnWater({ name: "わてり", waterOnly: true }, dg, 5, 5)).toBe(true);
    const ml = [];
    const potSlime = {
      type: "pot", potEffect: "imprison", name: "とじこめの壺", capacity: 3,
      confinedMonsters: [{ name: "スライム", hp: 10, maxHp: 10, atk: 3 }],
    };
    releaseConfinedMonstersFromPot(potSlime, dg, 5, 5, null, ml);
    expect(dg.monsters).toHaveLength(0);
    expect(ml.some(m => m.includes("水没した"))).toBe(true);
    const potWateri = {
      type: "pot", potEffect: "imprison", name: "とじこめの壺", capacity: 3,
      confinedMonsters: [{ name: "わてり", waterOnly: true, hp: 10, maxHp: 10, atk: 3 }],
    };
    releaseConfinedMonstersFromPot(potWateri, dg, 5, 5, null, []);
    expect(dg.monsters).toHaveLength(1);
    expect(dg.monsters[0].name).toBe("わてり");
  });

  it("放出時はプレイヤー・既存敵・互いに重ならない", () => {
    const pot = {
      type: "pot", potEffect: "imprison", name: "とじこめの壺", capacity: 3,
      confinedMonsters: [
        { name: "スライムA", hp: 10, maxHp: 10, atk: 3 },
        { name: "スライムB", hp: 10, maxHp: 10, atk: 3 },
      ],
    };
    const p = { x: 5, y: 5 };
    const existing = { id: "e1", name: "ゴブリン", hp: 8, maxHp: 8, x: 6, y: 5, atk: 2 };
    const dg = { monsters: [existing], rooms: [{ x: 0, y: 0, w: MW, h: MH }], map: Array.from({ length: MH }, () => Array(MW).fill(1)) };
    const ml = [];
    releaseConfinedMonstersFromPot(pot, dg, 5, 5, p, ml);
    expect(dg.monsters).toHaveLength(3);
    const released = dg.monsters.filter(m => m.id !== "e1");
    for (const m of released) {
      expect(m.x !== 5 || m.y !== 5).toBe(true);
      expect(m.x !== 6 || m.y !== 5).toBe(true);
    }
    expect(released[0].x !== released[1].x || released[0].y !== released[1].y).toBe(true);
  });

  it("水上で入ると壺は沈むが即死せず閉じ込められる", () => {
    const pot = { id: "pot1", type: "pot", potEffect: "imprison", name: "とじこめの壺", capacity: 3, confinedMonsters: [] };
    const dg = { map: Array.from({ length: MH }, () => Array(MW).fill(1)), springs: [] };
    dg.map[3][5] = T.WATER;
    const p = { x: 5, y: 3, hp: 100, inventory: [pot] };
    const ml = [];
    expect(confinePlayerInImprisonPot(pot, p, dg, ml)).toBe(true);
    expect(p.hp).toBe(100);
    expect(p.potConfinedTurns).toBe(30);
    expect(p.inventory).toContain(pot);
    expect(ml.some((m) => m.includes("水中に沈んだ"))).toBe(true);
  });

  it("浮遊中でも水上で入ると閉じ込められる（即死しない）", () => {
    const pot = { id: "pot1b", type: "pot", potEffect: "imprison", name: "とじこめの壺", capacity: 3, confinedMonsters: [] };
    const dg = { map: Array.from({ length: MH }, () => Array(MW).fill(1)), springs: [] };
    dg.map[3][5] = T.WATER;
    const p = { x: 5, y: 3, hp: 100, inventory: [pot], rings: [{ effect: "float_ring" }] };
    const ml = [];
    expect(confinePlayerInImprisonPot(pot, p, dg, ml)).toBe(true);
    expect(p.hp).toBe(100);
    expect(p.potConfinedTurns).toBe(30);
  });

  it("水中呼吸の指輪があれば水上で入っても沈没警告なしで閉じ込まれる", () => {
    const pot = { id: "pot1c", type: "pot", potEffect: "imprison", name: "とじこめの壺", capacity: 3, confinedMonsters: [] };
    const dg = { map: Array.from({ length: MH }, () => Array(MW).fill(1)), springs: [] };
    dg.map[3][5] = T.WATER;
    const p = { x: 5, y: 3, hp: 100, inventory: [pot], rings: [{ effect: "water_breath_ring" }] };
    const ml = [];
    expect(confinePlayerInImprisonPot(pot, p, dg, ml)).toBe(true);
    expect(p.hp).toBe(100);
    expect(ml.some((m) => m.includes("水中に沈んだ"))).toBe(false);
  });

  it("敵なしの壺でも出たとき割れて消える", () => {
    const pot = { id: "pot2", type: "pot", potEffect: "imprison", name: "とじこめの壺", capacity: 3, confinedMonsters: [] };
    const p = { x: 2, y: 2, inventory: [pot] };
    const dg = { monsters: [], map: Array.from({ length: MH }, () => Array(MW).fill(1)) };
    const ml = [];
    confinePlayerInImprisonPot(pot, p, dg, ml);
    resolveImprisonPotExit(p, dg, ml, () => {});
    expect(p.inventory).toHaveLength(0);
    expect(dg.monsters).toHaveLength(0);
    expect(ml.some(m => m.includes("割れた"))).toBe(true);
  });
});

describe("water breath ring and soaked", () => {
  it("水中呼吸の指輪で水タイルを歩ける", () => {
    const dg = { map: [[T.FLOOR]], pentacles: [] };
    const p = { rings: [{ effect: "water_breath_ring" }] };
    expect(hasWaterBreathRing(p)).toBe(true);
    expect(canPlayerWalkOnWater(p, dg)).toBe(true);
  });

  it("水中歩行でずぶ濡れになる（浮遊中は除く）", () => {
    const dg = { map: Array.from({ length: MH }, () => Array(MW).fill(T.FLOOR)) };
    dg.map[3][3] = T.WATER;
    const p = { x: 3, y: 3, rings: [{ effect: "water_breath_ring" }] };
    const ml = [];
    applySoakedFromWaterWalk(p, dg, ml);
    expect(p.soakedTurns).toBe(10);
    expect(isSoaked(p)).toBe(true);
    expect(ml.some(m => m.includes("ずぶ濡れ"))).toBe(true);
  });

  it("ずぶ濡れ中は炎半減・雷2倍", () => {
    const soaked = { soakedTurns: 10 };
    expect(reduceFireDamage(20, soaked)).toBe(10);
    expect(reduceLightningDamage(15, soaked)).toBe(30);
  });

  it("水中呼吸の指輪は壁埋まりダメージ判定の対象外になる", () => {
    const p = { rings: [{ effect: "water_breath_ring" }] };
    expect(hasWaterBreathRing(p)).toBe(true);
  });
});

describe("announceFireExplosionNullified", () => {
  it("魔方陣とバフで異なるメッセージを出す", () => {
    const ml1 = [];
    announceFireExplosionNullified({ pentacles: [{ kind: "explosion", cursed: true }] }, null, ml1, "炎の魔法");
    expect(ml1[0]).toContain("魔方陣");

    const ml2 = [];
    announceFireExplosionNullified({ pentacles: [] }, { fireExplosionNullTurns: 10 }, ml2, "爆発");
    expect(ml2[0]).toContain("不発");
    expect(ml2[0]).toContain("10");
  });
});
