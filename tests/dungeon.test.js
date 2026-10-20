import { describe, it, expect, vi, afterEach } from "vitest";
import { genDungeon, genDebugDungeon, genTutorialFloor, genCorridorFloor, genGridRoom, genMiniRoom, genFloodedFloor, genTwinWingFloor, generateDebugSpecialFloor, DEBUG_SPECIAL_FLOORS, prepareLastFloor, GOAL_ITEMS, populateHiddenRoom, chooseNormalLayout, applyGeneratedBlessCurse, getMonsterHouseGenerationOptions, MONSTER_HOUSE_FLOOR_CHANCE, placeDimensionalVault, placeWanderingMerchant } from "../dungeon.js";
import { MONS, pickFloodedWaterMonsterDef, pickMonsterDef } from "../monsters.js";
import { T, MW, MH, isNarrowPassage } from "../utils.js";
import { FLOOR_TITLES } from "../GameHelpers.js";
import { activateDimensionalVaults } from "../specialFixtures.js";

function makeHiddenRoomMap(hr) {
  const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
  for (let dy = 0; dy < hr.h; dy++)
    for (let dx = 0; dx < hr.w; dx++)
      map[hr.y + dy][hr.x + dx] = T.FLOOR;
  return map;
}

describe("genTutorialFloor", () => {
  it("1階は移動・装備・戦闘を試せる", () => {
    const floor = genTutorialFloor(1);
    expect(floor.floorType).toBe("tutorialFloor");
    expect(floor.tutorialFloor).toBe(1);
    expect(floor.map.length).toBe(MH);
    expect(floor.map[0].length).toBe(MW);
    expect(floor.items.some(i => i.type === "sign")).toBe(true);
    expect(floor.items.some(i => i.name === "ロングソード")).toBe(true);
    expect(floor.items.some(i => i.name === "鎖帷子")).toBe(true);
    expect(floor.rooms.every(r => r.w <= 9 && r.h <= 6)).toBe(true);
    expect(floor.monsters.some(m => m.baseKind === "rat")).toBe(true);
    expect(floor.tutorialObjective).toContain("装備");
    expect(floor.map[floor.stairUp.y][floor.stairUp.x]).toBe(T.SU);
    expect(floor.map[floor.stairDown.y][floor.stairDown.x]).toBe(T.SD);
  });

  it("2階は強敵に杖か迂回で対処できる4部屋構成", () => {
    const floor = genTutorialFloor(2);
    expect(floor.rooms.length).toBe(4);
    expect(floor.rooms.every(r => r.w <= 9 && r.h <= 6)).toBe(true);
    expect(floor.monsters.some(m => m.baseKind === "goblin")).toBe(true);
    expect(floor.items.some(i => i.type === "wand" && i.effect === "sleep" && i.preIdent)).toBe(true);
    expect(floor.tutorialObjective).toContain("迂回");
  });

  it("3階は訓練の証を取って引き返す最深部", () => {
    const floor = genTutorialFloor(3);
    expect(floor.rooms.length).toBe(4);
    expect(floor.rooms.every(r => r.w <= 9 && r.h <= 6)).toBe(true);
    expect(floor.isLastFloor).toBe(true);
    expect(floor.stairDown).toBeNull();
    expect(floor.items.some(i => i.type === "goal" && i.name === GOAL_ITEMS.tutorial.name)).toBe(true);
    const signText = floor.items
      .filter(i => i.type === "sign")
      .flatMap(i => i.text || [])
      .join(" ");
    expect(signText).toContain("容量オーバー");
    expect(signText).toContain("中身を回収");
    expect(floor.items.some(i => i.type === "potion" && !i.preIdent)).toBe(true);
    expect(floor.bigboxes.some(b => b.kind === "identify" && b.revealed)).toBe(true);
    const arrowTrap = floor.traps.find(t => t.effect === "arrow_trap");
    expect(arrowTrap?.revealed).toBe(false);
    expect(arrowTrap?.permanent).toBe(true);
    const trapSign = floor.items.find(i => i.type === "sign" && i.text?.some(line => line.includes("見えない罠")));
    expect(trapSign).toMatchObject({ x: arrowTrap.x, y: arrowTrap.y - 1 });
    expect(signText).toContain("見えない罠");
    expect(signText).toContain("歩いて通っても作動しない");
  });
});

describe("genDungeon", () => {
  it("通常フロアはマップと階段を持つ", () => {
    const dg = genDungeon(0, "beginner");
    expect(dg.map.length).toBe(MH);
    expect(dg.dungeonType).toBe("beginner");
    expect(dg.stairUp).toBeTruthy();
    expect(dg.stairDown).toBeTruthy();
    expect(dg.rooms.length).toBeGreaterThanOrEqual(2);
  });

  it("浮島抽選を含む通常フロアを繰り返し生成できる", () => {
    expect(() => {
      for (let i = 0; i < 120; i++) genDungeon(2, "beginner");
    }).not.toThrow();
  });

  it("通常フロアの変則レイアウト抽選は標準を含む", () => {
    expect(chooseNormalLayout(0.00)).toBe("centralCross");
    expect(chooseNormalLayout(0.02)).toBe("courtyard");
    expect(chooseNormalLayout(0.04)).toBe("wideRooms");
    expect(chooseNormalLayout(0.10)).toBe("standard");
  });

  it("変則レイアウトも特殊フロア扱いにならない", () => {
    const dg = genDungeon(0, "beginner");
    expect(["standard", "centralCross", "courtyard", "wideRooms"]).toContain(dg.layoutVariant);
    expect(dg.floorType).toBeUndefined();
  });

  it("ボスフロア（depth=4）はモンスターを含む", () => {
    const dg = genDungeon(4, "intermediate");
    expect(dg.monsters.length).toBeGreaterThan(0);
  });

  it("ボスフロアは複数地形から選ばれ、1マス廊下がない", () => {
    const walkable = new Set([T.FLOOR, T.WATER, T.SU, T.SD]);
    const isWall = (tile) => tile === T.WALL || tile === T.BWALL;
    const layouts = new Set();
    for (let i = 0; i < 36; i++) {
      const dg = genDungeon(4, "beginner");
      expect(dg.floorType).toBe("bossFloor");
      expect(dg.isBossFloor).toBe(true);
      expect(["arena_ns", "arena_ew", "big_open", "L_shape", "two_stage", "T_wide"]).toContain(dg.bossLayout);
      layouts.add(dg.bossLayout);
      const map = dg.map;
      for (let y = 1; y < MH - 1; y++) {
        for (let x = 1; x < MW - 1; x++) {
          if (!walkable.has(map[y][x])) continue;
          const nsCorridor = isWall(map[y][x - 1]) && isWall(map[y][x + 1]) && walkable.has(map[y - 1][x]) && walkable.has(map[y + 1][x]);
          const ewCorridor = isWall(map[y - 1][x]) && isWall(map[y + 1][x]) && walkable.has(map[y][x - 1]) && walkable.has(map[y][x + 1]);
          expect(nsCorridor || ewCorridor).toBe(false);
        }
      }
    }
    expect(layouts.size).toBeGreaterThan(1);
  });

  it("ボスフロアの道具・大箱・罠・泉は部屋の中だけに出る", () => {
    const inPlace = (dg, x, y) =>
      dg.rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) ||
      (dg.hiddenRooms || []).some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    for (let i = 0; i < 20; i++) {
      const dg = genDungeon(4, "beginner");
      expect(dg.floorType).toBe("bossFloor");
      for (const item of dg.items.filter((it) => !it.wallEmbedded)) {
        expect(inPlace(dg, item.x, item.y)).toBe(true);
      }
      for (const box of dg.bigboxes || []) expect(inPlace(dg, box.x, box.y)).toBe(true);
      for (const trap of dg.traps || []) expect(inPlace(dg, trap.x, trap.y)).toBe(true);
      for (const spring of dg.springs || []) expect(inPlace(dg, spring.x, spring.y)).toBe(true);
    }
  });

  it("クラーケンの水場は上りから下りへ床で迂回できる", () => {
    const dry = (tile) => tile === T.FLOOR || tile === T.SU || tile === T.SD;
    for (let i = 0; i < 18; i++) {
      const dg = genDungeon(14, "intermediate");
      expect(dg.floorType).toBe("bossFloor");
      expect(dg.monsters.some((m) => m.baseKind === "im_boss_kraken")).toBe(true);
      expect(dg.map.some((row) => row.includes(T.WATER))).toBe(true);
      const su = dg.stairUp, sd = dg.stairDown;
      const seen = new Set([`${su.x},${su.y}`]);
      const q = [{ x: su.x, y: su.y }];
      let reached = false;
      while (q.length) {
        const cur = q.shift();
        if (cur.x === sd.x && cur.y === sd.y) { reached = true; break; }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cur.x + dx, ny = cur.y + dy;
          const key = `${nx},${ny}`;
          if (seen.has(key) || !dry(dg.map[ny]?.[nx])) continue;
          seen.add(key);
          q.push({ x: nx, y: ny });
        }
      }
      expect(reached).toBe(true);
    }
  });

  it("アイテムモドキを除外した敵抽選では選ばれない", () => {
    for (let i = 0; i < 40; i++) {
      const { base } = pickMonsterDef(10, "intermediate", false, { excludeItemMimic: true });
      expect(base.baseKind).not.toBe("itemMimic");
    }
  });

  it("上級者・超上級者のモンスターハウスだけ低確率で強化される", () => {
    expect(getMonsterHouseGenerationOptions("beginner", {}, () => 0).levelBoost).toBe(0);
    expect(getMonsterHouseGenerationOptions("intermediate", {}, () => 0).levelBoost).toBe(0);
    expect(getMonsterHouseGenerationOptions("advanced", {}, () => 0).levelBoost).toBe(1);
    expect(getMonsterHouseGenerationOptions("legend", {}, () => 0.1).levelBoost).toBe(0);
    expect(getMonsterHouseGenerationOptions("advanced", { levelBoost: 1 }, () => 0.99).levelBoost).toBe(1);
  });

  it("B1Fはモンスターハウスを生成しない", () => {
    for (let i = 0; i < 8; i++) {
      expect(genDungeon(0, "beginner").monsterHouseRoom).toBeNull();
    }
  });

  it("水浸しフロアは桟橋の床で上り下りがつながり、水がある", () => {
    const dry = (tile) => tile === T.FLOOR || tile === T.SU || tile === T.SD;
    for (let i = 0; i < 8; i++) {
      const dg = genFloodedFloor(3, "intermediate");
      expect(dg.floorType).toBe("floodedFloor");
      expect(dg.map.some((row) => row.includes(T.WATER))).toBe(true);
      const su = dg.stairUp, sd = dg.stairDown;
      expect(dry(dg.map[su.y][su.x])).toBe(true);
      expect(dry(dg.map[sd.y][sd.x])).toBe(true);
      const seen = new Set([`${su.x},${su.y}`]);
      const q = [{ x: su.x, y: su.y }];
      while (q.length) {
        const cur = q.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cur.x + dx, ny = cur.y + dy;
          const key = `${nx},${ny}`;
          if (seen.has(key) || !dry(dg.map[ny]?.[nx])) continue;
          seen.add(key);
          q.push({ x: nx, y: ny });
        }
      }
      expect(seen.has(`${sd.x},${sd.y}`)).toBe(true);
      let isolated = 0;
      for (let y = 0; y < MH; y++) {
        for (let x = 0; x < MW; x++) {
          if (!dry(dg.map[y][x])) continue;
          if (!seen.has(`${x},${y}`)) isolated++;
        }
      }
      expect(isolated).toBeGreaterThan(0);
      for (const trap of dg.traps || []) {
        expect(isNarrowPassage(dg.map, trap.x, trap.y)).toBe(false);
      }
      const rewards = [
        ...(dg.items || []),
        ...(dg.bigboxes || []),
        ...(dg.springs || []),
        ...(dg.altars || []),
        ...(dg.gachaMachines || []),
      ];
      const isolatedKeys = [];
      for (let y = 0; y < MH; y++) {
        for (let x = 0; x < MW; x++) {
          if (dry(dg.map[y][x]) && !seen.has(`${x},${y}`)) isolatedKeys.push(`${x},${y}`);
        }
      }
      const clusters = [];
      const used = new Set();
      for (const key of isolatedKeys) {
        if (used.has(key)) continue;
        const [sx, sy] = key.split(",").map(Number);
        const q = [{ x: sx, y: sy }];
        used.add(key);
        const cells = [`${sx},${sy}`];
        while (q.length) {
          const cur = q.shift();
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cur.x + dx, ny = cur.y + dy;
            const nkey = `${nx},${ny}`;
            if (used.has(nkey) || !isolatedKeys.includes(nkey)) continue;
            used.add(nkey);
            cells.push(nkey);
            q.push({ x: nx, y: ny });
          }
        }
        clusters.push(cells);
      }
      for (const cells of clusters) {
        const hasReward = rewards.some((obj) => cells.includes(`${obj.x},${obj.y}`));
        expect(hasReward).toBe(true);
      }
    }
  });

  it("初心者には水浸しを出さず、中級以上では階層別の水棲敵を出す", () => {
    expect(pickFloodedWaterMonsterDef(3, "beginner")).toBeNull();
    expect(pickFloodedWaterMonsterDef(3, "tutorial")).toBeNull();
    const cases = [
      [1, "intermediate"],
      [12, "intermediate"],
      [17, "intermediate"],
      [1, "advanced"],
      [14, "advanced"],
      [18, "advanced"],
      [1, "legend"],
      [24, "legend"],
      [31, "legend"],
      [43, "legend"],
    ];
    for (const [depth, dungeonType] of cases) {
      expect(pickFloodedWaterMonsterDef(depth, dungeonType)?.base.waterOnly).toBe(true);
      for (let i = 0; i < 6; i++) {
        const dg = genFloodedFloor(depth, dungeonType);
        expect(dg.monsters.some((m) => m.waterOnly)).toBe(true);
      }
    }
  });

  it("低層水浸し専用魚は5階前後の能力で3段階に成長する", () => {
    const fish = MONS.find((m) => m.baseKind === "badFish");
    expect(fish).toMatchObject({ name: "まずい魚", waterOnly: true, floodedOnly: true, hp: 18, atk: 9, def: 2 });
    expect(fish.subtype).toBeUndefined();
    expect(fish.levels.map((level) => level.name)).toEqual(["古い魚", "かせきうお"]);
    expect(fish.levels).toMatchObject([
      { hp: 42, atk: 21, def: 6 },
      { hp: 72, atk: 34, def: 10 },
    ]);
    expect(pickFloodedWaterMonsterDef(1, "intermediate")).toMatchObject({ base: { baseKind: "badFish" }, spawnLevel: 1 });
    const lv2Picks = Array.from({ length: 60 }, () => pickFloodedWaterMonsterDef(5, "intermediate"));
    const lv3Picks = Array.from({ length: 60 }, () => pickFloodedWaterMonsterDef(10, "intermediate"));
    expect(lv2Picks.find((picked) => picked.base.baseKind === "badFish")).toMatchObject({ base: { baseKind: "badFish" }, spawnLevel: 2 });
    expect(lv3Picks.find((picked) => picked.base.baseKind === "badFish")).toMatchObject({ base: { baseKind: "badFish" }, spawnLevel: 3 });
    const mixedKinds = new Set();
    for (const picked of lv2Picks) mixedKinds.add(picked.base.baseKind);
    expect(mixedKinds).toEqual(new Set(["badFish", "wateri"]));
    for (let i = 0; i < 30; i++) {
      expect(pickMonsterDef(3, "intermediate").base.baseKind).not.toBe("badFish");
    }
  });

  it("初心者の通常特殊フロア抽選には水浸しを含めない", () => {
    for (let i = 0; i < 80; i++) {
      expect(genDungeon(1, "beginner").floorType).not.toBe("floodedFloor");
      expect(genDungeon(2, "beginner").floorType).not.toBe("floodedFloor");
    }
  });

  it("水浸しと二翼には開始時のフロア名がある", () => {
    expect(FLOOR_TITLES.floodedFloor).toContain("水浸し");
    expect(FLOOR_TITLES.twinWingFloor).toContain("二翼");
  });

  it("二翼フロアは中央壁の1本でつながり、道具は右翼に多い", () => {
    const walk = (tile) => tile === T.FLOOR || tile === T.SU || tile === T.SD;
    for (let i = 0; i < 8; i++) {
      const dg = genTwinWingFloor(3, "intermediate");
      expect(dg.floorType).toBe("twinWingFloor");
      const midX = Math.floor(MW / 2);
      const gaps = [];
      for (let y = 1; y < MH - 1; y++) {
        if (walk(dg.map[y][midX])) gaps.push(y);
      }
      expect(gaps.length).toBeGreaterThanOrEqual(1);
      expect(gaps.length).toBeLessThanOrEqual(3);
      const su = dg.stairUp, sd = dg.stairDown;
      expect(su.x).toBeLessThan(midX);
      expect(sd.x).toBeGreaterThan(midX);
      const seen = new Set([`${su.x},${su.y}`]);
      const q = [{ x: su.x, y: su.y }];
      let reached = false;
      while (q.length) {
        const cur = q.shift();
        if (cur.x === sd.x && cur.y === sd.y) { reached = true; break; }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cur.x + dx, ny = cur.y + dy;
          const key = `${nx},${ny}`;
          if (seen.has(key) || !walk(dg.map[ny]?.[nx])) continue;
          seen.add(key);
          q.push({ x: nx, y: ny });
        }
      }
      expect(reached).toBe(true);
      const leftItems = dg.items.filter((it) => it.x < midX).length;
      const rightItems = dg.items.filter((it) => it.x > midX).length;
      expect(rightItems).toBeGreaterThan(leftItems);
    }
  });

  it("格子の大部屋とビッグルームは高確率、通常フロアは通常抽選", () => {
    expect(MONSTER_HOUSE_FLOOR_CHANCE.normal).toBe(0.05);
    expect(MONSTER_HOUSE_FLOOR_CHANCE.bigRoom).toBe(0.55);
    expect(MONSTER_HOUSE_FLOOR_CHANCE.gridRoom).toBe(0.55);
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      expect(genGridRoom(4, "advanced").monsterHouseRoom).toBeTruthy();
    } finally {
      random.mockRestore();
    }
  });
});

describe("極稀なフロアギミック", () => {
  function emptyFeatureDungeon() {
    const map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
    for (let y = 3; y < 12; y++) for (let x = 3; x < 18; x++) map[y][x] = T.FLOOR;
    return {
      map,
      rooms: [{ x: 3, y: 3, w: 15, h: 9, cx: 10, cy: 7 }],
      dungeonType: "advanced",
      items: [], monsters: [], traps: [], springs: [], bigboxes: [],
      pentacles: [], statues: [], vents: [], gachaMachines: [], altars: [],
      dimensionalVaults: [], merchantShops: [], shops: [], shop: null,
      stairUp: null, stairDown: null,
    };
  }

  it("次元宝物庫は部屋の内側へ予約され、入室時に区画を実体化する", () => {
    const dg = emptyFeatureDungeon();
    const vault = placeDimensionalVault(dg, 20, () => 0);
    expect(vault?.name).toBe("次元宝物庫");
    expect(dg.dimensionalVaults).toHaveLength(1);
    expect(dg.items).toHaveLength(0);
    expect(vault.pendingItems.length).toBeGreaterThanOrEqual(1);
    expect(vault.pendingItems.every((item) => item.dimensionalVaultId === vault.id)).toBe(true);
    expect(vault.pendingTraps.every((trap) => ["blowback_trap", "shadow_stitch", "confuse_trap"].includes(trap.effect))).toBe(true);
    expect(vault.layout).toBe("enclosed_maze");
    expect(dg.map[4][9]).toBe(T.FLOOR);

    const messages = [];
    activateDimensionalVaults(dg, { x: vault.room.x, y: vault.room.y }, messages);
    expect(vault.active).toBe(true);
    expect(dg.items.length).toBeGreaterThanOrEqual(1);
    expect(dg.traps.every((trap) => trap.dimensionalVaultId === vault.id)).toBe(true);
    expect(vault.walls.some(({ x, y }) => dg.map[y][x] === T.WALL)).toBe(true);
    expect(vault.water.some(({ x, y }) => dg.map[y][x] === T.WATER)).toBe(true);
    const start = { x: vault.room.x, y: vault.room.y + Math.floor(vault.room.h / 2) };
    const reached = new Set([`${start.x},${start.y}`]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const { x, y } = queue[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        const k = `${nx},${ny}`;
        if (reached.has(k) || nx < vault.room.x || nx >= vault.room.x + vault.room.w ||
            ny < vault.room.y || ny >= vault.room.y + vault.room.h || dg.map[ny][nx] !== T.FLOOR) continue;
        reached.add(k);
        queue.push({ x: nx, y: ny });
      }
    }
    expect(dg.items.every((item) => reached.has(`${item.x},${item.y}`))).toBe(true);
    expect(messages).toContain("次元宝物庫に入った！宝物が消え始めた！");
  });

  it("大型部屋の次元宝物庫は内部区画と障害物が拡張される", () => {
    const dg = emptyFeatureDungeon();
    dg.map = Array.from({ length: MH }, () => Array(MW).fill(T.WALL));
    for (let y = 3; y < 18; y++) for (let x = 3; x < 25; x++) dg.map[y][x] = T.FLOOR;
    dg.rooms = [{ x: 3, y: 3, w: 22, h: 15, cx: 14, cy: 10 }];

    const vault = placeDimensionalVault(dg, 20, () => 0);
    expect(vault?.room).toMatchObject({ w: 11, h: 9 });
    expect(vault?.walls.length).toBeGreaterThan(40);
    expect(vault?.water.length).toBeGreaterThanOrEqual(3);
  });

  it("次元宝物庫には最低1個B以上のアイテムが含まれる", () => {
    const dg = emptyFeatureDungeon();
    const vault = placeDimensionalVault(dg, 20, () => 0);
    expect(vault?.pendingItems.some((item) => ["B", "A", "S"].includes(item.rarity))).toBe(true);
  });

  it("次元宝物庫は壁主体・水の仕切り・端へ寄せた迂回型を抽選する", () => {
    const makeVault = (randomValue) => {
      const dg = emptyFeatureDungeon();
      let calls = 0;
      const vault = placeDimensionalVault(dg, 20, () => calls++ === 0 ? 0 : randomValue);
      expect(vault).not.toBeNull();
      return vault;
    };

    const wallBranch = makeVault(0);
    const waterGates = makeVault(0.4);
    const edgeDetour = makeVault(0.9);
    expect(wallBranch.layoutStyle).toBe("wall_branch");
    expect(waterGates.layoutStyle).toBe("water_gates");
    expect(edgeDetour.layoutStyle).toBe("edge_detour");
    expect(waterGates.water.length).toBeGreaterThan(wallBranch.water.length);
    expect(new Set([
      wallBranch.layoutStyle,
      waterGates.layoutStyle,
      edgeDetour.layoutStyle,
    ]).size).toBe(3);
  });

  it("行商人は商品在庫と紐づいた友好的な個体を配置する", () => {
    const dg = emptyFeatureDungeon();
    const merchant = placeWanderingMerchant(dg, 20, () => 0);
    expect(merchant).toMatchObject({ name: "行商人", type: "shopkeeper", state: "friendly", isWanderingMerchant: true });
    expect(dg.merchantShops).toHaveLength(1);
    expect(dg.merchantShops[0].stock.length).toBeGreaterThan(0);
    expect(dg.merchantShops[0].merchantId).toBe(merchant.id);
  });
});

describe("applyGeneratedBlessCurse", () => {
  it("壺の祝呪をフラグではなく容量へ変換する", () => {
    const blessedPot = { type: "pot", capacity: 3, blessed: true };
    applyGeneratedBlessCurse(blessedPot, 0.10, 0.25, () => 0.05);
    expect(blessedPot).toMatchObject({ capacity: 4 });
    expect(blessedPot.blessed).toBeUndefined();
    expect(blessedPot.cursed).toBeUndefined();

    const cursedPot = { type: "pot", capacity: 3, cursed: true };
    applyGeneratedBlessCurse(cursedPot, 0.10, 0.25, () => 0.20);
    expect(cursedPot).toMatchObject({ capacity: 2 });
    expect(cursedPot.blessed).toBeUndefined();
    expect(cursedPot.cursed).toBeUndefined();
  });

  it("壺以外は祝呪フラグを付ける", () => {
    const weapon = { type: "weapon" };
    applyGeneratedBlessCurse(weapon, 0.10, 0.25, () => 0.05);
    expect(weapon).toMatchObject({ blessed: true, cursed: false });
  });
});

describe("デバッグ特殊フロアへ", () => {
  it("一覧から指定の特殊フロアを生成できる", () => {
    expect(DEBUG_SPECIAL_FLOORS.some((entry) => entry.id === "floodedFloor")).toBe(true);
    const flooded = generateDebugSpecialFloor("floodedFloor", 3, "beginner");
    expect(flooded.floorType).toBe("floodedFloor");
    expect(flooded.stairUp).toBeTruthy();
    const boss = generateDebugSpecialFloor("bossFloor", 4, "beginner");
    expect(boss.floorType).toBe("bossFloor");
  });
});

describe("genDebugDungeon", () => {
  it("B1Fにカラペンを配置し、敵部屋へ到達できる", () => {
    const floor = genDebugDungeon();
    const karapen = floor.monsters.find((m) => m.name === "カラペン");
    expect(karapen).toBeTruthy();

    const passable = (x, y) => x >= 0 && x < MW && y >= 0 && y < MH && floor.map[y][x] !== T.WALL;
    const seen = new Set([`${floor.stairUp.x},${floor.stairUp.y}`]);
    const queue = [floor.stairUp];
    for (let i = 0; i < queue.length; i++) {
      const { x, y } = queue[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
        if (passable(nx, ny) && !seen.has(key)) {
          seen.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }
    expect(seen.has(`${karapen.x},${karapen.y}`)).toBe(true);
  });
});

describe("genCorridorFloor", () => {
  it("分岐と行き止まりを持つ迷路になり、階段同士が接続される", () => {
    const floor = genCorridorFloor(8, "intermediate");
    const passable = (x, y) => x >= 0 && x < MW && y >= 0 && y < MH && floor.map[y][x] !== T.WALL;
    let junctions = 0;
    let deadEnds = 0;

    for (let y = 1; y < MH - 1; y++) {
      for (let x = 1; x < MW - 1; x++) {
        if (!passable(x, y)) continue;
        const exits = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .filter(([dx, dy]) => passable(x + dx, y + dy)).length;
        if (exits >= 3) junctions++;
        if (exits === 1) deadEnds++;
      }
    }

    const startKey = `${floor.stairUp.x},${floor.stairUp.y}`;
    const goalKey = `${floor.stairDown.x},${floor.stairDown.y}`;
    const seen = new Set([startKey]);
    const queue = [floor.stairUp];
    for (let i = 0; i < queue.length; i++) {
      const { x, y } = queue[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
        if (passable(nx, ny) && !seen.has(key)) {
          seen.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }

    expect(floor.floorType).toBe("corridorFloor");
    expect(junctions).toBeGreaterThan(40);
    expect(deadEnds).toBeGreaterThan(15);
    expect(seen.has(goalKey)).toBe(true);
  });
});

describe("genMiniRoom", () => {
  it("超小型1部屋フロアは12×8マス程度に収まる", () => {
    const floor = genMiniRoom(8, "intermediate");

    expect(floor.floorType).toBe("miniRoom");
    expect(floor.rooms).toHaveLength(1);
    expect(floor.rooms[0]).toMatchObject({ w: 12, h: 8 });
    expect(floor.map[floor.stairUp.y][floor.stairUp.x]).toBe(T.SU);
    expect(floor.map[floor.stairDown.y][floor.stairDown.x]).toBe(T.SD);
  });
});

describe("genGridRoom", () => {
  afterEach(() => vi.restoreAllMocks());

  it("格子の柱を通路1マス・壁1マスの間隔で配置する", () => {
    const floor = genGridRoom(8, "intermediate");
    const { x: rx, y: ry } = floor.rooms[0];
    expect(floor.map[ry + 1][rx + 1]).toBe(T.WALL);
    expect(floor.map[ry + 1][rx + 2]).toBe(T.FLOOR);
    expect(floor.map[ry + 2][rx + 1]).toBe(T.FLOOR);
    expect(floor.map[ry + 3][rx + 3]).toBe(T.WALL);
  });

  it("稀に格子の壁へ壁埋めアイテムを配置する", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const floor = genGridRoom(8, "intermediate");
    expect(floor.items.some((item) => item.wallEmbedded)).toBe(true);
    for (const item of floor.items.filter((entry) => entry.wallEmbedded)) {
      expect(floor.map[item.y][item.x]).toBe(T.WALL);
    }
  });
});

describe("populateHiddenRoom", () => {
  afterEach(() => vi.restoreAllMocks());

  it("宝物庫でも回転板を必ず1枚配置する", () => {
    const hr = { x: 10, y: 10, w: 5, h: 4 };
    const map = makeHiddenRoomMap(hr);
    const items = [], bigboxes = [], springs = [], traps = [];
    vi.spyOn(Math, "random").mockReturnValue(0.1);

    populateHiddenRoom(hr, map, 5, items, bigboxes, springs, traps);

    expect(hr.isTreasureVault).toBe(true);
    expect(traps.filter(t => t.effect === "spin").length).toBe(1);
  });

  it("通常の隠し部屋でも回転板を必ず1枚配置する", () => {
    const hr = { x: 10, y: 10, w: 5, h: 4 };
    const map = makeHiddenRoomMap(hr);
    const items = [], bigboxes = [], springs = [], traps = [];
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    populateHiddenRoom(hr, map, 5, items, bigboxes, springs, traps);

    expect(hr.isTreasureVault).toBeUndefined();
    expect(traps.filter(t => t.effect === "spin").length).toBe(1);
  });
});

describe("prepareLastFloor", () => {
  it("最下層にゴールアイテムを配置し下り階段を除去する", () => {
    const dg = genDungeon(9, "beginner");
    const originalStairDown = { ...dg.stairDown };
    prepareLastFloor(dg, "beginner");
    expect(dg.stairDown).toBeNull();
    const goal = dg.items.find(i => i.type === "goal" && i.name === GOAL_ITEMS.beginner.name);
    expect(goal).toBeTruthy();
    expect(goal).toMatchObject(originalStairDown);
    expect(dg.lastFloorGoalPos).toEqual(originalStairDown);
  });
});
