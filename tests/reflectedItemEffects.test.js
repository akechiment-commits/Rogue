import { afterEach, describe, expect, it, vi } from "vitest";
import { _resolveBolt, MONS, makeMonsterFromBase } from "../monsters.js";
import { throwItemAlongLine } from "../items.js";
import "../wands.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

function setup() {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  const player = makePlayer({ x: 2, y: 8, exp: 0 });
  const shooter = { id: "shooter", name: "投げた敵", x: 5, y: 5, hp: 100, maxHp: 100, atk: 20, def: 0, exp: 10 };
  const reflector = makeMonsterFromBase(MONS.find(m => m.baseKind === "reflector"), 1, 8, 5);
  const dungeon = makeEmptyDg({ monsters: [shooter, reflector] });
  const logs = [];
  const lu = vi.fn();
  const throwItem = (item) => throwItemAlongLine(shooter, dungeon, item, 1, 0, 10, logs, player, lu, { killerMon: shooter });
  return { player, shooter, reflector, dungeon, logs, lu, throwItem };
}

describe("敵へ反射された道具の命中効果", () => {
  it("眠りの薬は物理ダメージを加えず、当たった場所で1回だけ割れる", () => {
    const s = setup();
    const result = s.throwItem({ id: "potion", type: "potion", name: "眠りの薬", effect: "sleep" });
    expect(s.shooter.hp).toBe(100);
    expect(s.shooter.sleepTurns).toBeGreaterThan(0);
    expect(result.hitMonster).toBe(s.shooter);
    expect(s.logs.filter(line => line.includes("瓶が割れて"))).toHaveLength(1);
  });

  it("雷の杖は床へ落ちず、命中相手への破損効果を1回だけ適用する", () => {
    const s = setup();
    const result = s.throwItem({ id: "wand", type: "wand", name: "雷の杖", effect: "lightning", charges: 1 });
    expect(result).toMatchObject({ consumed: true, hitMonster: s.shooter, x: 5, y: 5 });
    expect(s.shooter.hp).toBe(75);
    expect(s.dungeon.items).toEqual([]);
  });

  it("毒矢は通常投擲と同じ追加効果を適用する", () => {
    const s = setup();
    s.throwItem({ id: "arrow", type: "arrow", name: "毒矢", atk: 3, poison: true });
    expect(s.shooter.atk).toBe(10);
    expect(s.shooter.hp).toBeLessThan(100);
  });

  it("薬の撃破は反射した敵へ帰属し、薬瓶による物理ダメージで先に倒さない", () => {
    const s = setup();
    s.shooter.hp = 40;
    s.throwItem({ id: "fire", type: "potion", name: "炎の薬", effect: "fire", value: 50 });
    expect(s.dungeon.monsters).not.toContain(s.shooter);
    expect(s.player.exp).toBe(0);
    expect(s.reflector.monLevel).toBe(2);
    expect(s.logs.some(line => line.includes("炎に包まれた"))).toBe(true);
  });

  it("専用処理のない通常弾は、既存の反射ダメージを維持する", () => {
    const s = setup();
    _resolveBolt(s.shooter, s.dungeon, s.player, s.logs, s.lu, { dx: 1, dy: 0, wind: false });
    expect(s.shooter.hp).toBe(80);
    expect(s.reflector.hp).toBe(s.reflector.maxHp);
  });

  it.each([[1, 1], [2, 4], [3, 6]])("反射後に別の%sマス角の敵へ当たる薬は、体の接触マスを着弾点にする", (bodySize, hits) => {
    const s = setup();
    const target = { id: "other", name: "後ろの敵", x: 3, y: 5, hp: 1000, maxHp: 1000, def: 0, bodySize };
    s.dungeon.monsters = [target, s.reflector];
    const result = throwItemAlongLine({ x: 5, y: 5 }, s.dungeon,
      { id: "fire", type: "potion", name: "炎の薬", effect: "fire", value: 50 },
      1, 0, 10, s.logs, s.player, s.lu);
    expect(result.hitMonster).toBe(target);
    expect(result.x).toBe(bodySize === 1 ? 3 : 4);
    expect(target.hp).toBe(1000 - 50 * hits);
  });

  it("呪われた炎の薬は余計な直撃ダメージを加えず回復する", () => {
    const s = setup();
    s.shooter.hp = 20;
    s.throwItem({ id: "heal", type: "potion", name: "炎の薬", effect: "fire", cursed: true });
    expect(s.shooter.hp).toBe(70);
    expect(s.dungeon.monsters).toContain(s.shooter);
  });

  it("敵に当たった杖は足元の落とし穴を着地扱いで作動させない", () => {
    const s = setup();
    s.dungeon.traps = [{ id: "pit", name: "落とし穴", effect: "pitfall", x: 5, y: 5 }];
    s.throwItem({ id: "wand", type: "wand", name: "雷の杖", effect: "lightning", charges: 0 });
    expect(s.shooter.hp).toBe(75);
    expect(s.dungeon.traps[0].revealed).toBeFalsy();
    expect(s.dungeon.items).toEqual([]);
  });

  it("残回数0の吹き飛ばしの杖も、反射後の方向へ作用する", () => {
    const s = setup();
    s.throwItem({ id: "wand", type: "wand", name: "ふきとばしの杖", effect: "knockback", charges: 0 });
    expect(s.shooter.x).toBeLessThan(5);
    expect(s.dungeon.items).toEqual([]);
  });

  it("保存の壺は命中相手へ通常の投擲ダメージを与え、中身を1回だけ散らす", () => {
    const s = setup();
    s.throwItem({ id: "pot", type: "pot", name: "保存の壺", potEffect: "storage", capacity: 3,
      contents: [{ id: "sword", name: "短剣", type: "weapon", atk: 3 }] });
    expect(s.shooter.hp).toBeLessThan(100);
    expect(s.dungeon.items.filter(it => it.id === "sword")).toHaveLength(1);
    expect(s.dungeon.items.some(it => it.id === "pot")).toBe(false);
  });

  it("反射された薬は大型の投げ手にも体の端で当たる", () => {
    const s = setup();
    s.shooter.bodySize = 3;
    s.shooter.hp = s.shooter.maxHp = 1000;
    const result = s.throwItem({ id: "fire", type: "potion", name: "炎の薬", effect: "fire" });
    expect(result).toMatchObject({ x: 6, y: 5, hitMonster: s.shooter });
    expect(s.shooter.hp).toBe(700);
  });
});
