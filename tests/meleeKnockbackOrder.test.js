import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as utils from "../utils.js";
import * as monsters from "../monsters.js";
import * as items from "../items.js";
import * as traits from "../monTraits.js";
import * as geometry from "../monsterGeometry.js";
import * as status from "../statusDuration.js";
import { pushAnim, pushBoltAnim, pushItemFlyAnim } from "../animEvents.js";
import { statueAt } from "../fixtureQueries.js";
import { pl } from "../playerLabel.js";
import { itemDisplayName, processPitfallBag } from "../render.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

// 範囲選択から全攻撃・吹き飛ばし完了まで、Gameの実際の分岐を実行する。
const source = fs.readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
const start = source.indexOf("          const wab = p.weapon?.ability;");
const end = source.indexOf("          } else if (dg.map[ny][nx] === T.WATER", start);
if (start < 0 || end < 0) throw new Error("Melee action block not found");
const pitfallStart = source.indexOf("  const withPitfallBag =");
const pitfallEnd = source.indexOf("  /* プレイヤーが深淵", pitfallStart);
if (pitfallStart < 0 || pitfallEnd < 0) throw new Error("Pitfall handler not found");
const bindPitfallBag = new Function("sr", "useCallback", "setPitfallBag", "clearPitfallBag", "processPitfallBag",
  source.slice(pitfallStart, pitfallEnd) + "return withPitfallBag;");
const deps = { ...utils, ...monsters, ...items, ...traits, ...geometry, ...status,
  pushAnim, pushBoltAnim, pushItemFlyAnim, statueAt, pl, itemDisplayName, bigboxAddItem: vi.fn() };
const run = new Function(...Object.keys(deps), "p", "dg", "ml", "lu", "killMonster", "dx", "dy", "withPitfallBag", "sr",
  `const nx=p.x+dx,ny=p.y+dy,_oldPx=p.x,_oldPy=p.y;
   const _ad={attacks:[],damages:[]};let acted=false;
   ${source.slice(start, end)}
   }
   return {acted,animations:_ad};`);

function attack({ abilities = ["frontal_sweep", "knockback"], pentacle, hp = 1000, bodySize = 3, forcedMoveImmune = false, name = "対象", others = [], walls = [], traps = [], player = {}, kind, random = 0.5, direction = [1, 0], target = {} } = {}) {
  vi.spyOn(Math, "random").mockReturnValue(random);
  const p = makePlayer({ atk: 10, depth: 10, weapon: { atk: 0, abilities }, ...player });
  const mon = { id: "target", name, kind, x: bodySize === 3 ? 7 : 6, y: 5, hp, maxHp: hp, def: 0, bodySize, ...(forcedMoveImmune ? { forcedMoveImmune: true } : {}), ...target };
  const rooms = [{ x: 1, y: 1, w: 40, h: 20 }];
  const dg = makeEmptyDg({ monsters: [mon, ...others], rooms, traps,
    pentacles: pentacle ? [{ kind: "knockback_aura", name: "吹き飛ばしの魔方陣", x: 3, y: 3, ...pentacle }] : [] });
  const below = makeEmptyDg({ rooms });
  const sr = { current: { player: p, dungeon: dg, floors: { [p.depth + 1]: below } } };
  const withPitfallBag = bindPitfallBag(sr, fn => fn, items.setPitfallBag, items.clearPitfallBag, processPitfallBag);
  for (const [x, y] of walls) dg.map[y][x] = utils.T.WALL;
  const ml = [];
  const kill = vi.fn(target => { dg.monsters = dg.monsters.filter(m => m !== target); });
  const result = run(...Object.values(deps), p, dg, ml, () => {}, kill, ...direction, withPitfallBag, sr);
  return { p, mon, dg, below, ml, kill, ...result };
}
afterEach(() => vi.restoreAllMocks());

describe("射撃の指輪と石", () => {
  const shootingRing = { effect: "shoot_ring" };

  it("追加射撃した石が反射されるとプレイヤーのバリアを消費する", () => {
    const stone = items.makeNormalStone(1);
    const { p } = attack({ abilities: [], bodySize: 1, target: { subtype: "reflector" },
      player: { rings: [shootingRing], arrow: stone, inventory: [stone], barrier: 1 } });
    expect(p).toMatchObject({ hp: 100, barrier: 0 });
    expect(p.arrow).toBeNull();
  });

  it("追加射撃した爆弾矢の直撃と爆風を別々に防ぐ", () => {
    const arrow = items.makeBombArrow(1);
    const { mon } = attack({ abilities: [], bodySize: 1, target: { barrier: 2 },
      player: { rings: [shootingRing], arrow, inventory: [arrow] } });
    expect(mon).toMatchObject({ hp: 990, barrier: 0 });
  });

  it("吹き飛ばしの魔方陣では壁への衝突だけを防ぐ", () => {
    const { mon } = attack({ abilities: [], bodySize: 1, walls: [[7, 5]], pentacle: {}, target: { barrier: 1 } });
    expect(mon).toMatchObject({ hp: 990, barrier: 0 });
  });

  it.each([items.makeNormalStone, items.makeMagicStone, items.makeArrow])(
    "追加射撃の%pが地雷へ落ちるとプレイヤーにも爆風が届く",
    makeAmmo => {
      const ammo = makeAmmo(1);
      const mine = { id: "mine", effect: "explode", name: "地雷", x: 6, y: 5, permanent: true };
      const { p, ml } = attack({ abilities: [], bodySize: 1, random: 0.07, traps: [mine],
        player: { rings: [shootingRing], arrow: ammo, inventory: [ammo] } });

      expect(p.hp).toBe(50);
      expect(ml.filter(message => message.startsWith("地雷が発動！"))).toHaveLength(1);
    },
  );

  it("使い切った石の束は地雷の所持品損傷の候補に入らない", () => {
    const stone = items.makeNormalStone(1);
    const scroll = { id: "scroll", name: "混乱の巻物", type: "scroll", effect: "confusion" };
    const mine = { id: "mine", effect: "explode", name: "地雷", x: 6, y: 5, permanent: true };
    const { p, ml } = attack({ abilities: [], bodySize: 1, random: 0.07, traps: [mine],
      player: { rings: [shootingRing], arrow: stone, inventory: [stone, scroll] } });

    expect(p.inventory).toEqual([]);
    expect(ml.some(message => message.includes("混乱の巻物") && message.includes("燃えて"))).toBe(true);
  });

  it.each([
    { label: "普通の石", makeAmmo: items.makeNormalStone },
    { label: "魔法の石", makeAmmo: items.makeMagicStone },
    { label: "通常の矢", makeAmmo: items.makeArrow },
    { label: "ワッカ併用", makeAmmo: items.makeNormalStone, wakka: true },
    { label: "右", makeAmmo: items.makeRightStone, right: true },
  ])("$labelの追加射撃は落とし穴から次の階へ移る", ({ makeAmmo, wakka, right }) => {
    const ammo = makeAmmo(1);
    const rings = wakka ? [shootingRing, { effect: "wakka_ring" }] : [shootingRing];
    const pitfall = { id: "pitfall", effect: "pitfall", name: "落とし穴", x: right ? 8 : 6, y: 5, permanent: true };
    const { dg, below, mon } = attack({
      abilities: [], bodySize: 1, random: 0.07, traps: [pitfall],
      ...(wakka ? { pentacle: { kind: "dodge" } } : {}),
      ...(right ? { direction: [-1, 0], target: { x: 4 } } : {}),
      player: { rings, arrow: ammo, inventory: [ammo] },
    });

    expect(dg.items).toEqual([]);
    expect(below.items).toMatchObject([{ name: ammo.name, count: 1 }]);
    expect(below.monsters).toEqual(right ? [] : [mon]);
  });

  it.each([["arrow_trap", 94], ["poison_arrow", 94], ["strong_arrow", 88]])(
    "追加射撃が起動した%sはプレイヤーの向きに従って命中する",
    (effect, expectedHp) => {
      const stone = items.makeNormalStone(1);
      const trap = { id: "arrow-trap", effect, name: "矢の罠", x: 6, y: 5, permanent: true };
      const { p } = attack({ abilities: [], bodySize: 1, hp: 1, walls: [[7, 5]], traps: [trap],
        player: { rings: [shootingRing], arrow: stone, inventory: [stone], facing: { dx: 1, dy: 0 } } });

      expect(trap.revealed).toBe(true);
      expect(p.hp).toBe(expectedHp);
    },
  );

  it.each([
    { label: "正面", abilities: [], target: { x: 6, y: 5 } },
    { label: "長柄の2マス先", abilities: ["reach"], target: { x: 7, y: 5 } },
    { label: "三方向攻撃の斜め前", abilities: ["frontal_sweep"], target: { x: 6, y: 4 } },
  ])("追加発射した普通の石が$labelの近接相手に当たる", ({ abilities, target }) => {
    const stone = items.makeNormalStone(1);
    const { p, ml, dg } = attack({ abilities, target, bodySize: 1,
      player: { rings: [shootingRing], arrow: stone, inventory: [stone] } });
    expect(ml.some(message => message.startsWith("石が対象に命中！"))).toBe(true);
    expect(p.arrow).toBeNull();
    expect(dg.items).toEqual([]);
  });

  it("狙ったマスに投げても通常の回避が効く", () => {
    const stone = items.makeNormalStone(1);
    const { ml, dg } = attack({ abilities: [], bodySize: 1, random: 0.07,
      player: { rings: [shootingRing], arrow: stone, inventory: [stone] } });
    expect(ml.some(message => message.startsWith("対象に") && message.includes("ダメージ"))).toBe(true);
    expect(ml).toContain("石は対象に外れた！");
    expect(dg.items).toMatchObject([{ name: "石", x: 6, y: 5 }]);
  });

  describe.each([
    ["普通の石", items.makeNormalStone],
    ["魔法の石", items.makeMagicStone],
    ["氷塊", items.makeIceChunk],
  ])("%sの追加射撃の防御判定", (_, makeAmmo) => {
    const fire = (pentacle, extraRing = null, random = 0.5) => {
      const ammo = makeAmmo(1);
      const rings = extraRing ? [shootingRing, extraRing] : [shootingRing];
      return attack({ abilities: [], bodySize: 1, walls: [[7, 5]], pentacle, random, target: { barrier: 1 },
        player: { rings, arrow: ammo, inventory: [ammo] } });
    };

    it("みかわしの魔方陣があるとバリアを使わず足元に落ちる", () => {
      const { mon, ml, dg } = fire({ kind: "dodge" });
      expect(mon.hp).toBe(990);
      expect(mon.barrier).toBe(1);
      expect(ml.some(message => message.startsWith("みかわしの魔方陣の加護で"))).toBe(true);
      expect(dg.items).toMatchObject([{ x: 6, y: 5 }]);
    });

    it("命中時はバリアを1回消費し、石は床に残らない", () => {
      const { mon, ml, dg } = fire();
      expect(mon.hp).toBe(990);
      expect(mon.barrier).toBe(0);
      expect(ml).toContain("対象のバリアが攻撃を弾いた！バリアが砕けた！");
      expect(dg.items).toEqual([]);
    });

    it("呪われたみかわしは通常の外れを防ぎ、下手投げは外れる", () => {
      const pentacle = { kind: "dodge", cursed: true };
      expect(fire(pentacle, null, 0.07).mon.barrier).toBe(0);

      const missed = fire(pentacle, { effect: "miss_throw_ring" }, 0.07);
      expect(missed.mon.barrier).toBe(1);
      expect(missed.dg.items).toMatchObject([{ x: 6, y: 5 }]);
    });
  });

  it.each([true, false])("右は右の3マス目で回避・バリアを判定する（みかわしあり: %s）", dodge => {
    const stone = items.makeRightStone(1);
    const east = { id: "east", name: "右の敵", x: 8, y: 5, hp: 1000, def: 0, barrier: 1 };
    const { dg } = attack({ direction: [-1, 0], target: { x: 4 }, abilities: [], bodySize: 1, others: [east],
      pentacle: dodge ? { kind: "dodge" } : null,
      player: { rings: [shootingRing], arrow: stone, inventory: [stone] } });

    expect(east.hp).toBe(1000);
    expect(east.barrier).toBe(dodge ? 1 : 0);
    expect(dg.items).toMatchObject(dodge ? [{ name: "右", x: 8, y: 5 }] : []);
  });

  it("近接相手が反射する場合は石が跳ね返る", () => {
    const stone = items.makeNormalStone(1);
    const { p, ml } = attack({ abilities: [], bodySize: 1, target: { subtype: "reflector" },
      player: { rings: [shootingRing], arrow: stone, inventory: [stone] } });
    expect(ml).toContain("石が対象に弾き返された！");
    expect(p.hp).toBeLessThan(p.maxHp);
  });

  it("右は左を攻撃してもホーミングせず、呪いの遠投下でも画面右の3マス目に当たる", () => {
    const stone = items.makeRightStone(1);
    const east = { id: "east", name: "右の敵", x: 8, y: 5, hp: 1000, def: 0 };
    const between = { id: "between", name: "途中の敵", x: 6, y: 5, hp: 1000, def: 0 };
    const { p, ml } = attack({ direction: [-1, 0], target: { x: 4 }, abilities: [], bodySize: 1,
      others: [east, between], pentacle: { kind: "farcast", cursed: true },
      player: { rings: [shootingRing, { effect: "wakka_ring" }], arrow: stone, inventory: [stone] } });
    expect(ml.some(message => message.startsWith("右が右の敵に命中！"))).toBe(true);
    expect(east.hp).toBeLessThan(1000);
    expect(between.hp).toBe(1000);
    expect(p.arrow).toBeNull();
  });
});

it.each([["humanoid", 1], ["undead", -1]])("吸血の指輪2個は%sに対する回復・反動を2倍にする", (kind, sign) => {
  const ring = { effect: "vampire_ring" };
  const { p, mon } = attack({ abilities: [], bodySize: 1, kind, player: { atk: 38, hp: 40, rings: [{ ...ring }, { ...ring }] } });
  expect(mon.hp).toBeLessThan(mon.maxHp);
  const oneRing = Math.max(1, Math.floor((mon.maxHp - mon.hp) / 8));
  expect(p.hp).toBe(40 + sign * 2 * oneRing);
});

it.each([[1, 120, 0.5, false], [2, 120, 0.5, true], [2, 95, 0.999, true], [2, 96, 0.999, false]])(
  "背水%d個、HP%d/200、乱数%sで会心=%s", (ringCount, hp, random, critical) => {
    const { ml } = attack({ abilities: [], bodySize: 1, random,
      player: { maxHp: 200, hp, rings: Array.from({ length: ringCount }, () => ({ effect: "desperation_ring" })) } });
    expect(ml.some(message => message.includes("対象に") && message.includes("ダメージ"))).toBe(true);
    expect(ml.some(message => message.includes("会心！"))).toBe(critical);
  },
);

describe("範囲近接攻撃後の吹き飛ばし", () => {
  it("大型敵へ3発すべて当ててから、武器で1マスだけ吹き飛ばす", () => {
    const { mon, ml } = attack();
    expect(ml.filter(m => m.startsWith("対象に"))).toHaveLength(3);
    expect(mon.x).toBe(8);
    expect(ml.at(-1)).toBe("対象は吹き飛んだ！");
    expect(ml.filter(m => m === "対象は吹き飛んだ！")).toHaveLength(1);
  });
  it("長柄との合成でも4発すべての後に1回だけ吹き飛ばす", () => {
    const { mon, ml } = attack({ abilities: ["frontal_sweep", "reach", "knockback"] });
    expect(ml.filter(m => m.startsWith("対象に"))).toHaveLength(4);
    expect(mon.x).toBe(8);
    expect(ml.at(-1)).toBe("対象は吹き飛んだ！");
  });
  it("連撃も全セルで終えてから吹き飛ばす", () => {
    const { mon, ml } = attack({ abilities: ["frontal_sweep", "double_strike", "knockback"] });
    expect(ml.filter(m => m.startsWith("連撃！"))).toHaveLength(3);
    expect(mon.x).toBe(8);
    expect(ml.at(-1)).toBe("対象は吹き飛んだ！");
  });
  it.each([[{}, 12], [{ cursed: true }, 8], [{ blessed: true }, utils.MW - 1]])("魔方陣%sは1発目で吹き飛ばし、範囲外の後続は当たらない", (pentacle, x) => {
    const { mon, ml } = attack({ abilities: ["frontal_sweep"], pentacle });
    expect(ml.filter(m => m.startsWith("対象に"))).toHaveLength(1);
    expect(mon.x).toBe(x);
    expect(ml.filter(m => m.includes("の力で対象が"))).toHaveLength(1);
    expect(ml.findIndex(m => m.includes("の力で対象が"))).toBeGreaterThan(ml.map(m => m.startsWith("対象に")).lastIndexOf(true));
  });
  it("魔方陣は命中直後、武器の吹き飛ばしは全攻撃後に適用する", () => {
    const { mon, ml } = attack({ pentacle: {} });
    expect(mon.x).toBe(13);
    expect(ml.filter(m => m === "対象は吹き飛んだ！")).toHaveLength(1);
    expect(ml.filter(m => m.includes("の力で対象が"))).toHaveLength(1);
    expect(ml.at(-1)).toBe("対象は吹き飛んだ！");
  });
  it.each([1, 25])("攻撃で倒した相手（HP%s）には吹き飛ばしを適用しない", hp => {
    const { mon, ml, kill } = attack({ hp });
    expect(kill).toHaveBeenCalledTimes(1);
    expect(mon.x).toBe(7);
    expect(ml.some(m => m.includes("吹き飛んだ"))).toBe(false);
  });
  it("通常の単体攻撃も命中後に1マスだけ吹き飛ばす", () => {
    const { mon, ml } = attack({ bodySize: 1, abilities: ["knockback"] });
    expect(mon.x).toBe(7);
    expect(ml.filter(m => m.startsWith("対象に"))).toHaveLength(1);
    expect(ml.at(-1)).toBe("対象は吹き飛んだ！");
  });
  it("すべて外れた相手は吹き飛ばさない", () => {
    // 攻撃前の回避判定だけを差し替え、命中後の処理へ入らないことを確認する。
    const original = deps.checkMonsterEvasion;
    deps.checkMonsterEvasion = () => true;
    try {
      const { mon, ml } = attack();
      expect(mon.x).toBe(7);
      expect(ml.filter(m => m.includes("外れた"))).toHaveLength(3);
    } finally { deps.checkMonsterEvasion = original; }
  });
  it("範囲内の別々の敵をそれぞれ1回だけ吹き飛ばす", () => {
    const other = { id: "other", name: "別の敵", x: 6, y: 4, hp: 1000, def: 0 };
    const { mon, ml } = attack({ bodySize: 1, others: [other] });
    expect([mon.x, other.x]).toEqual([7, 7]);
    expect(ml.filter(m => m.includes("は吹き飛んだ"))).toHaveLength(2);
    expect(ml.findIndex(m => m.includes("吹き飛んだ"))).toBeGreaterThan(ml.findIndex(m => m.startsWith("別の敵に")));
  });
  it("壁で移動できず範囲内に残れば、各命中で魔方陣の衝突も発生する", () => {
    const { ml } = attack({ abilities: ["frontal_sweep"], pentacle: {}, walls: [[8, 5]] });
    expect(ml.filter(m => m.startsWith("対象に"))).toHaveLength(3);
    expect(ml.filter(m => m.includes("壁に叩きつけられた"))).toHaveLength(3);
  });
  it("魔方陣で範囲外へ飛ばしたら連撃も発動しない", () => {
    const { mon, ml } = attack({ bodySize: 1, abilities: ["double_strike"], pentacle: {} });
    expect(mon.x).toBe(11);
    expect(ml.filter(m => m.startsWith("対象に"))).toHaveLength(1);
    expect(ml.some(m => m.startsWith("連撃！"))).toBe(false);
  });
  it("長柄の範囲内に残れば、連撃が当たり再び魔方陣で飛ぶ", () => {
    const { mon, ml } = attack({ bodySize: 1, abilities: ["reach", "double_strike"], pentacle: { cursed: true } });
    expect(mon.x).toBe(8);
    expect(ml.filter(m => m.startsWith("連撃！"))).toHaveLength(1);
    expect(ml.filter(m => m.includes("の力で対象が"))).toHaveLength(2);
  });
  it("大型敵の体が長柄の後続セルに残っていれば、そのセルの攻撃は当たる", () => {
    const { mon, ml } = attack({ abilities: ["reach", "frontal_sweep"], pentacle: { cursed: true } });
    expect(mon.x).toBe(9);
    expect(ml.filter(m => m.startsWith("対象に"))).toHaveLength(2);
    expect(ml.filter(m => m.includes("の力で対象が"))).toHaveLength(2);
  });
  it("途中まで飛んで壁で止まり範囲に残れば、残りの攻撃が当たる", () => {
    const { mon, ml } = attack({ abilities: ["reach", "frontal_sweep"], pentacle: {}, walls: [[9, 5]] });
    expect(mon.x).toBe(8);
    expect(ml.filter(m => m.startsWith("対象に"))).toHaveLength(2);
  });
  it("魔方陣の衝突で倒れた相手へ連撃を当てず、撃破処理も1回だけ行う", () => {
    const { mon, ml, kill } = attack({ hp: 12, abilities: ["frontal_sweep", "double_strike"], pentacle: {}, walls: [[8, 5]] });
    expect(mon.hp).toBeLessThanOrEqual(0);
    expect(kill).toHaveBeenCalledTimes(1);
    expect(ml.some(m => m.startsWith("連撃！"))).toBe(false);
  });
  it("強制移動無効のお化け柳は吹き飛ばしの魔方陣でも吹き飛ばず壁衝突ダメージも受けない", () => {
    const { mon, ml } = attack({
      name: "お化け柳",
      bodySize: 2,
      forcedMoveImmune: true,
      abilities: ["frontal_sweep"],
      pentacle: {},
      walls: [[8, 5]],
    });
    expect(mon.x).toBe(6);
    expect(mon.y).toBe(5);
    expect(ml.filter(m => m.startsWith("お化け柳に"))).toHaveLength(2);
    expect(ml.some(m => m.includes("吹き飛んだ"))).toBe(false);
    expect(ml.some(m => m.includes("壁に叩きつけられた"))).toBe(false);
    expect(ml).toContain("お化け柳は強制移動を受けない！");
  });
  it("強制移動無効のお化け柳は武器の吹き飛ばし能力でも吹き飛ばない", () => {
    const { mon, ml } = attack({
      name: "お化け柳",
      bodySize: 2,
      forcedMoveImmune: true,
      abilities: ["knockback"],
    });
    expect(mon.x).toBe(6);
    expect(mon.y).toBe(5);
    expect(ml.some(m => m.includes("吹き飛んだ"))).toBe(false);
    expect(ml).toContain("お化け柳は強制移動を受けない！");
  });
});
