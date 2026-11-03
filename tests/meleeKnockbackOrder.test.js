import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as utils from "../utils.js";
import * as monsters from "../monsters.js";
import * as items from "../items.js";
import * as traits from "../monTraits.js";
import * as geometry from "../monsterGeometry.js";
import * as status from "../statusDuration.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

// 範囲選択から全攻撃・吹き飛ばし完了まで、Gameの実際の分岐を実行する。
const source = fs.readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
const start = source.indexOf("          const wab = p.weapon?.ability;");
const end = source.indexOf("          } else if (dg.map[ny][nx] === T.WATER", start);
if (start < 0 || end < 0) throw new Error("Melee action block not found");
const deps = { ...utils, ...monsters, ...items, ...traits, ...geometry, ...status };
const run = new Function(...Object.keys(deps), "p", "dg", "ml", "lu", "killMonster",
  `const dx=1,dy=0,nx=p.x+dx,ny=p.y+dy,_oldPx=p.x,_oldPy=p.y;
   const _ad={attacks:[],damages:[]};let acted=false;
   ${source.slice(start, end)}
   }
   return {acted,animations:_ad};`);

function attack({ abilities = ["frontal_sweep", "knockback"], pentacle, hp = 1000, bodySize = 3, others = [], walls = [] } = {}) {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  const p = makePlayer({ atk: 10, weapon: { atk: 0, abilities } });
  const mon = { id: "target", name: "対象", x: bodySize === 3 ? 7 : 6, y: 5, hp, maxHp: hp, def: 0, bodySize };
  const dg = makeEmptyDg({ monsters: [mon, ...others], rooms: [{ x: 1, y: 1, w: 40, h: 20 }],
    pentacles: pentacle ? [{ kind: "knockback_aura", name: "吹き飛ばしの魔方陣", x: 3, y: 3, ...pentacle }] : [] });
  for (const [x, y] of walls) dg.map[y][x] = utils.T.WALL;
  const ml = [];
  const kill = vi.fn(target => { dg.monsters = dg.monsters.filter(m => m !== target); });
  const result = run(...Object.values(deps), p, dg, ml, () => {}, kill);
  return { p, mon, dg, ml, kill, ...result };
}
afterEach(() => vi.restoreAllMocks());

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
  it.each([[{}, 12], [{ cursed: true }, 8], [{ blessed: true }, utils.MW - 1]])("魔方陣%sも全命中後に1回だけ適用する", (pentacle, x) => {
    const { mon, ml } = attack({ abilities: ["frontal_sweep"], pentacle });
    expect(ml.filter(m => m.startsWith("対象に"))).toHaveLength(3);
    expect(mon.x).toBe(x);
    expect(ml.filter(m => m.includes("の力で対象が"))).toHaveLength(1);
    expect(ml.findIndex(m => m.includes("の力で対象が"))).toBeGreaterThan(ml.map(m => m.startsWith("対象に")).lastIndexOf(true));
  });
  it("武器と魔方陣が両方ある場合も、それぞれ1回だけ適用する", () => {
    const { mon, ml } = attack({ pentacle: {} });
    expect(mon.x).toBe(13);
    expect(ml.filter(m => m === "対象は吹き飛んだ！")).toHaveLength(1);
    expect(ml.filter(m => m.includes("の力で対象が"))).toHaveLength(1);
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
  it("魔方陣による壁への衝突ダメージも全攻撃後に1回だけ発生する", () => {
    const { ml } = attack({ abilities: ["frontal_sweep"], pentacle: {}, walls: [[8, 5]] });
    expect(ml.filter(m => m.startsWith("対象に"))).toHaveLength(3);
    expect(ml.filter(m => m.includes("壁に叩きつけられた"))).toHaveLength(1);
  });
});
