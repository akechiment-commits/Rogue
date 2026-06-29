import { describe, it, expect, beforeEach } from "vitest";
import {
  resetDiscoveries,
  trackItem,
  trackMonster,
  trackTrap,
  stageBigbox,
  commitPendingBigboxes,
  getDiscoveries,
} from "../DiscoveryTracker.js";

describe("DiscoveryTracker", () => {
  beforeEach(() => resetDiscoveries());

  it("同じアイテムを再発見すると count が増える", () => {
    const item = { name: "回復薬", type: "potion", effect: "heal", tile: 16 };
    trackItem(item);
    trackItem(item);
    expect(getDiscoveries().items["heal"].count).toBe(2);
  });

  it("モンスターと罠も count を加算する", () => {
    trackMonster({ name: "スライム", tile: 1 });
    trackMonster({ name: "スライム", tile: 1 });
    trackTrap({ name: "鈍足の罠", effect: "slow_trap", tile: 47 });
    trackTrap({ name: "鈍足の罠", effect: "slow_trap", tile: 47 });
    const d = getDiscoveries();
    expect(d.monsters["スライム"].count).toBe(2);
    expect(d.traps["slow_trap"].count).toBe(2);
  });

  it("大箱は帰還時に確定する", () => {
    stageBigbox({ kind: "identify", name: "識別の大箱" });
    expect(getDiscoveries().bigboxes.identify).toBeUndefined();
    commitPendingBigboxes();
    expect(getDiscoveries().bigboxes.identify.name).toBe("識別の大箱");
  });
});