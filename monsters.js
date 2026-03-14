import { rng, pick, uid, MW, MH, T, DRO, removeMonster, clamp } from "./utils.js";
import { getFarcastMode, placeItemAt, makeStone, makeMagicStone } from "./items.js";

/* ===== 境界・通行判定ヘルパー ===== */
function inBounds(x, y) { return x >= 0 && x < MW && y >= 0 && y < MH; }
function isWalkable(map, x, y) { return inBounds(x, y) && map[y][x] !== T.WALL && map[y][x] !== T.BWALL; }

/* ===== モンスター近接攻撃ヘルパー ===== */
function monsterAttackPlayer(m, dg, pl, ml, msgFn, { skipVuln = false, skipThorn = false } = {}) {
  /* dodge: 25% 完全回避 */
  if ((pl.armor?.ability === "dodge" || pl.armor?.abilities?.includes("dodge")) && Math.random() < 0.25) {
    ml.push(`${m.name}の攻撃をひらりとかわした！`);
    return;
  }
  /* 12% ミス */
  if (Math.random() >= 0.88) {
    ml.push(`${m.name}の攻撃は外れた！`);
    return;
  }
  const pdef = pl.def + (pl.armor?.def || 0) + (pl.armor?.plus || 0);
  let dmg = Math.max(1, Math.floor(m.atk * m.atk / (m.atk + pdef)) + rng(-2, 2));
  if (!skipVuln) {
    const plRoom = findRoom(dg.rooms, pl.x, pl.y);
    const vulnPc = plRoom && dg.pentacles?.find(pc => pc.kind === "vulnerability" &&
      pc.x >= plRoom.x && pc.x < plRoom.x + plRoom.w &&
      pc.y >= plRoom.y && pc.y < plRoom.y + plRoom.h);
    if (vulnPc) dmg = vulnPc.cursed ? Math.max(1, Math.floor(dmg / 2)) : dmg * (vulnPc.blessed ? 4 : 2);
  }
  pl.deathCause = `${m.name}の攻撃で`;
  pl.hp -= dmg;
  ml.push(msgFn(dmg));
  if (!skipThorn && pl.armor?.ability === "thorn" && dmg > 0) {
    const td = Math.max(1, Math.floor(dmg / 3));
    m.hp -= td;
    ml.push(`反射で${m.name}に${td}ダメージ！`);
  }
  if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("衝撃で目が覚めた！"); }
  if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("衝撃で金縛りが解けた！"); }
}

/* ===== MONSTER DEFINITIONS ===== */
/* ── MONS配列の順番 = 出現階層（index N → N+1階から出現可能）── */
export const MONS = [
  /* 0: 1階〜 */
  { name: "ネズミ",       hp: 5,   atk: 3,  def: 0,  exp: 3,   speed: 1,   tile: 6,  kind: "beast",    baseKind: "rat",        monLevel: 1 },
  /* 1: 2階〜 */
  { name: "コボルド",     hp: 10,  atk: 5,  def: 1,  exp: 8,   speed: 1,   tile: 7,  kind: "humanoid", baseKind: "kobold",     monLevel: 1 },
  /* 2: 3階〜 */
  { name: "ゴブリン",     hp: 12,  atk: 6,  def: 1,  exp: 12,  speed: 1,   tile: 8,  kind: "humanoid", baseKind: "goblin",     monLevel: 1 },
  /* 3: 4階〜 速攻型 */
  { name: "インプ",       hp: 14,  atk: 7,  def: 1,  exp: 20,  speed: 2,   tile: 53, kind: "beast",    baseKind: "imp",        monLevel: 1, float: true },
  /* 4: 5階〜 */
  { name: "スケルトン",   hp: 18,  atk: 8,  def: 3,  exp: 22,  speed: 1,   tile: 9,  kind: "undead",   baseKind: "skeleton",   monLevel: 1 },
  /* 5: 6階〜 鈍足・硬め */
  { name: "ゾンビ",       hp: 25,  atk: 9,  def: 2,  exp: 28,  speed: 0.5, tile: 10, kind: "undead",   baseKind: "zombie",     monLevel: 1 },
  /* 5.5: 6階〜 石投げ */
  { name: "ワッカ",       hp: 18,  atk: 9,  def: 1,  exp: 28,  speed: 1,   tile: 8,  kind: "beast",    baseKind: "wokka",      monLevel: 1, subtype: "stonethrow" },
  /* 6: 7階〜 遠距離 */
  { name: "アーチャー",   hp: 22,  atk: 10, def: 2,  exp: 34,  speed: 1,   tile: 39, kind: "humanoid", baseKind: "archer",     monLevel: 1, subtype: "archer" },
  /* 7: 8階〜 速攻獣 */
  { name: "ウルフ",       hp: 20,  atk: 11, def: 1,  exp: 40,  speed: 2,   tile: 56, kind: "beast",    baseKind: "wolf",       monLevel: 1 },
  /* 7.5: 8階〜 盗みモンスター */
  { name: "コソドロ",       hp: 12,  atk: 4,  def: 0,  exp: 35,  speed: 2,   tile: 8,  kind: "humanoid", baseKind: "thief",      monLevel: 1, subtype: "thief" },
  /* 7.6: 5階〜 逃げるボーナスモンスター */
  { name: "コロポックル",   hp: 8,   atk: 0,  def: 0,  exp: 50,  speed: 2,   tile: 53, kind: "beast",    baseKind: "runner",     monLevel: 1, subtype: "runner" },
  /* 8: 9階〜 杖使い */
  { name: "ウィザード",   hp: 18,  atk: 9,  def: 2,  exp: 42,  speed: 1,   tile: 40, kind: "humanoid", baseKind: "wizard",     monLevel: 1, subtype: "wanduser", wandEffect: "lightning" },
  /* 9: 10階〜 壁歩き (固定スポーンは3階〜) */
  { name: "岩霊",         hp: 28,  atk: 10, def: 3,  exp: 45,  speed: 1,   tile: 43, kind: "undead",   baseKind: "rockspirit", monLevel: 1, wallWalker: true },
  /* 10: 11階〜 */
  { name: "オーク",       hp: 30,  atk: 12, def: 5,  exp: 48,  speed: 1,   tile: 11, kind: "humanoid", baseKind: "orc",        monLevel: 1 },
  /* 11: 12階〜 */
  { name: "大蛇",         hp: 35,  atk: 13, def: 3,  exp: 52,  speed: 1,   tile: 12, kind: "beast",    baseKind: "serpent",    monLevel: 1, maxAttacks: 2 },
  /* 12: 13階〜 呪い杖 (固定スポーンは2階〜) */
  { name: "呪術師",       hp: 25,  atk: 9,  def: 3,  exp: 55,  speed: 1,   tile: 44, kind: "humanoid", baseKind: "witchdoc",   monLevel: 1, subtype: "wanduser", wandEffect: "curse_wand" },
  /* 13: 14階〜 サポーター */
  { name: "シャーマン",   hp: 30,  atk: 9,  def: 3,  exp: 60,  speed: 1,   tile: 55, kind: "humanoid", baseKind: "shaman",     monLevel: 1, subtype: "supporter" },
  /* 14: 15階〜 吹き飛ばし杖 */
  { name: "ウィンドメイジ", hp: 28, atk: 11, def: 3, exp: 65,  speed: 1,   tile: 54, kind: "humanoid", baseKind: "windmage",   monLevel: 1, subtype: "wanduser", wandEffect: "blowback_wand" },
  /* 15: 16階〜 */
  { name: "トロル",       hp: 50,  atk: 16, def: 6,  exp: 75,  speed: 1,   tile: 13, kind: "humanoid", baseKind: "troll",      monLevel: 1 },
  /* 16: 17階〜 鈍足・超硬 */
  { name: "ガーゴイル",   hp: 65,  atk: 18, def: 11, exp: 90,  speed: 0.5, tile: 52, kind: "beast",    baseKind: "gargoyle",   monLevel: 1, float: true },
  /* 17: 18階〜 速攻不死 */
  { name: "ヴァンパイア", hp: 60,  atk: 18, def: 7,  exp: 92,  speed: 2,   tile: 15, kind: "undead",   baseKind: "vampire",    monLevel: 1, maxAttacks: 2, float: true },
  /* 18: 19階〜 */
  { name: "ドラゴン",     hp: 90,  atk: 24, def: 10, exp: 140, speed: 1,   tile: 14, kind: "dragon",   baseKind: "dragon",     monLevel: 1 },
  /* 19: 20階〜 鈍足・超DEF */
  { name: "ゴーレム",     hp: 100, atk: 20, def: 16, exp: 115, speed: 0.5, tile: 57, kind: "beast",    baseKind: "golem",      monLevel: 1 },
  /* 20: 21階〜 高ATK速攻 */
  { name: "デーモン",     hp: 80,  atk: 28, def: 9,  exp: 160, speed: 2,   tile: 58, kind: "beast",    baseKind: "daemon",     monLevel: 1, maxAttacks: 3, float: true },
];

/* ===== モンスターレベルアップテーブル ===== */
/* MON_LEVELS[baseKind][0] = Lv2テンプレ, [1] = Lv3テンプレ (名前・HP・ATK・DEF・EXPのみ変更) */
export const MON_LEVELS = {
  "rat":        [ { name: "強ネズミ",         hp: 8,   atk: 4,  def: 2,  exp: 5   }, { name: "覇ネズミ",         hp: 13,  atk: 5,  def: 4,  exp: 8   } ],
  "kobold":     [ { name: "コボルド戦士",     hp: 16,  atk: 7,  def: 3,  exp: 13  }, { name: "コボルド族長",     hp: 25,  atk: 9,  def: 6,  exp: 20  } ],
  "goblin":     [ { name: "ゴブリン頭",       hp: 19,  atk: 8,  def: 4,  exp: 19  }, { name: "ゴブリン王",       hp: 30,  atk: 11, def: 7,  exp: 30  } ],
  "imp":        [ { name: "強インプ",         hp: 22,  atk: 10, def: 3,  exp: 32  }, { name: "覇インプ",         hp: 35,  atk: 13, def: 6,  exp: 50  } ],
  "skeleton":   [ { name: "強スケルトン",     hp: 29,  atk: 11, def: 6,  exp: 35  }, { name: "アンデッドナイト", hp: 45,  atk: 14, def: 9,  exp: 55  } ],
  "zombie":     [ { name: "強ゾンビ",         hp: 40,  atk: 13, def: 5,  exp: 45  }, { name: "屍鬼",             hp: 63,  atk: 16, def: 8,  exp: 70  } ],
  "wokka":      [ { name: "強ワッカ",         hp: 28,  atk: 13, def: 3,  exp: 45  }, { name: "覇ワッカ",         hp: 45,  atk: 18, def: 5,  exp: 72  } ],
  "archer":     [ { name: "古参アーチャー",   hp: 35,  atk: 14, def: 5,  exp: 54  }, { name: "弓の達人",         hp: 55,  atk: 18, def: 8,  exp: 85  } ],
  "wolf":       [ { name: "強ウルフ",         hp: 32,  atk: 15, def: 4,  exp: 64  }, { name: "フェンリル",       hp: 50,  atk: 20, def: 7,  exp: 100 } ],
  "thief":      [ { name: "大盗賊",           hp: 20,  atk: 6,  def: 1,  exp: 56  }, { name: "怪盗",             hp: 32,  atk: 8,  def: 2,  exp: 88  } ],
  "runner":     [ { name: "大コロポックル",   hp: 12,  atk: 0,  def: 0,  exp: 80  }, { name: "精霊コロポックル", hp: 18,  atk: 0,  def: 0,  exp: 120 } ],
  "wizard":     [ { name: "強ウィザード",     hp: 29,  atk: 13, def: 5,  exp: 67  }, { name: "大魔導士",         hp: 45,  atk: 16, def: 8,  exp: 105 } ],
  "rockspirit": [ { name: "強岩霊",           hp: 45,  atk: 14, def: 6,  exp: 72  }, { name: "岩の王",           hp: 70,  atk: 18, def: 9,  exp: 113 } ],
  "orc":        [ { name: "オーク将",         hp: 48,  atk: 17, def: 8,  exp: 77  }, { name: "オーク王",         hp: 75,  atk: 22, def: 11, exp: 120 } ],
  "serpent":    [ { name: "強大蛇",           hp: 56,  atk: 18, def: 6,  exp: 83  }, { name: "覇大蛇",           hp: 88,  atk: 23, def: 9,  exp: 130 } ],
  "witchdoc":   [ { name: "強呪術師",         hp: 40,  atk: 13, def: 6,  exp: 88  }, { name: "大呪術師",         hp: 63,  atk: 16, def: 9,  exp: 138 } ],
  "shaman":     [ { name: "強シャーマン",     hp: 48,  atk: 13, def: 6,  exp: 96  }, { name: "大シャーマン",     hp: 75,  atk: 16, def: 9,  exp: 150 } ],
  "windmage":   [ { name: "強ウィンドメイジ", hp: 45,  atk: 15, def: 6,  exp: 104 }, { name: "風の覇者",         hp: 70,  atk: 20, def: 9,  exp: 163 } ],
  "troll":      [ { name: "強トロル",         hp: 80,  atk: 22, def: 9,  exp: 120 }, { name: "覇トロル",         hp: 125, atk: 29, def: 12, exp: 188 } ],
  "gargoyle":   [ { name: "強ガーゴイル",     hp: 104, atk: 25, def: 15, exp: 144 }, { name: "覇ガーゴイル",     hp: 163, atk: 32, def: 19, exp: 225 } ],
  "vampire":    [ { name: "強ヴァンパイア",   hp: 96,  atk: 25, def: 10, exp: 147 }, { name: "ヴァンパイア卿",   hp: 150, atk: 32, def: 13, exp: 230 } ],
  "dragon":     [ { name: "強ドラゴン",       hp: 144, atk: 34, def: 13, exp: 224 }, { name: "古龍",             hp: 225, atk: 43, def: 16, exp: 350 } ],
  "golem":      [ { name: "強ゴーレム",       hp: 160, atk: 28, def: 20, exp: 184 }, { name: "覇ゴーレム",       hp: 250, atk: 36, def: 24, exp: 288 } ],
  "daemon":     [ { name: "強デーモン",       hp: 128, atk: 39, def: 13, exp: 256 }, { name: "魔王",             hp: 200, atk: 50, def: 17, exp: 400 } ],
};

/** モンスターのレベルを1上げ、次形態に変化させる。変化した場合 true を返す */
export function monLevelUp(mon, dg, ml) {
  if (!mon.baseKind) return false;
  const levels = MON_LEVELS[mon.baseKind];
  if (!levels) return false;
  const nextLevel = (mon.monLevel || 1) + 1;
  const template = levels[nextLevel - 2]; // Lv2→index0, Lv3→index1
  if (!template) {
    ml.push(`${mon.name}はすでに最強形態だ！`);
    return false;
  }
  const hpRatio = mon.maxHp > 0 ? mon.hp / mon.maxHp : 1;
  const oldName = mon.name;
  mon.name   = template.name;
  mon.atk    = template.atk;
  mon.def    = template.def;
  mon.exp    = template.exp;
  mon.maxHp  = template.hp;
  mon.hp     = Math.max(1, Math.round(template.hp * hpRatio));
  mon.monLevel = nextLevel;
  ml.push(`${oldName}がレベルアップして${mon.name}になった！`);
  return true;
}

/** モンスターのレベルを1下げ、前形態に変化させる。変化した場合 true を返す */
export function monLevelDown(mon, dg, ml) {
  const currentLevel = mon.monLevel || 1;
  if (!mon.baseKind || currentLevel <= 1) {
    ml.push(`${mon.name}はすでに最弱形態だ！`);
    return false;
  }
  const prevLevel = currentLevel - 1;
  let template;
  if (prevLevel === 1) {
    template = MONS.find(m => m.baseKind === mon.baseKind && m.monLevel === 1);
  } else {
    template = MON_LEVELS[mon.baseKind]?.[prevLevel - 2]; // level2=index0, level3=index1
  }
  if (!template) return false;
  const hpRatio = mon.maxHp > 0 ? mon.hp / mon.maxHp : 1;
  const oldName = mon.name;
  mon.name   = template.name;
  mon.atk    = template.atk;
  mon.def    = template.def;
  mon.exp    = template.exp;
  mon.maxHp  = template.hp;
  mon.hp     = Math.max(1, Math.round(template.hp * hpRatio));
  mon.monLevel = prevLevel;
  ml.push(`${oldName}がレベルダウンして${mon.name}になった！`);
  return true;
}

/* ===== 警備員テンプレート ===== */
export const GUARD_TEMPLATE = { name: "警備員", hp: 35, atk: 14, def: 5, exp: 25, speed: 1, tile: 59, kind: "humanoid" };
export function makeGuard(x, y, plx, ply) {
  return { ...GUARD_TEMPLATE, id: uid(), x, y, maxHp: GUARD_TEMPLATE.hp, type: "guard",
    turnAccum: 0, aware: true, dir: { x: 0, y: 0 }, lastPx: plx, lastPy: ply, patrolTarget: null };
}

/* ===== モンスター生成ヘルパー ===== */
/** ランダムにモンスター1体を生成してオブジェクトを返す */
export function makeMonster(depth, x, y, { aware = false, lastPx = 0, lastPy = 0, immediateAct = false } = {}) {
  const mt = MONS[clamp(rng(0, depth), 0, MONS.length - 1)];
  return { ...mt, id: uid(), x, y, maxHp: mt.hp, turnAccum: immediateAct ? -(mt.speed || 1) : 0, aware, dir: { x: 0, y: 0 }, lastPx, lastPy, patrolTarget: null };
}

/** count 体のモンスターを centerX,centerY 周辺 → ランダム部屋にスポーンさせる */
export function spawnMonsters(dg, count, depth, centerX, centerY, p, { aware = false, immediateAct = false } = {}) {
  const DIRS8 = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  let spawned = 0;
  /* 隣接マスに優先配置 */
  for (const [dy, dx] of DIRS8) {
    if (spawned >= count) break;
    const nx = centerX + dx, ny = centerY + dy;
    if (dg.map[ny]?.[nx] === T.FLOOR && !dg.monsters.some(m => m.x === nx && m.y === ny) && (!p || nx !== p.x || ny !== p.y)) {
      dg.monsters.push(makeMonster(depth, nx, ny, { aware, lastPx: centerX, lastPy: centerY, immediateAct }));
      spawned++;
    }
  }
  /* 残りはランダム部屋に配置 */
  for (let i = spawned; i < count; i++) {
    for (let att = 0; att < 30; att++) {
      const room = dg.rooms[rng(0, dg.rooms.length - 1)];
      const sx = rng(room.x + 1, room.x + room.w - 2);
      const sy = rng(room.y + 1, room.y + room.h - 2);
      if (dg.map[sy]?.[sx] === T.FLOOR && !dg.monsters.some(m => m.x === sx && m.y === sy) && (!p || sx !== p.x || sy !== p.y)) {
        dg.monsters.push(makeMonster(depth, sx, sy, { aware: false, immediateAct }));
        spawned++;
        break;
      }
    }
  }
  return spawned;
}

/* ===== LINE OF SIGHT (Bresenham) ===== */
export function hasLOS(map, x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0),
    dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1,
    sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0,
    cy = y0;
  while (true) {
    if (cx === x1 && cy === y1) return true;
    if ((map[cy][cx] === T.WALL || map[cy][cx] === T.BWALL) && !(cx === x0 && cy === y0)) return false;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
    if (!inBounds(cx, cy)) return false;
  }
}

/* ===== BFS PATHFINDING ===== */
export function bfsNext(map, mons, sx, sy, tx, ty, self, maxDist = 20, pentacles = null) {
  if (sx === tx && sy === ty) return null;
  /* モンスター位置と聖域位置をSetに変換 (O(1)ルックアップ) */
  const monSet = new Set();
  for (const m of mons) { if (m !== self) monSet.add(m.x + m.y * MW); }
  const sanctSet = new Set();
  if (pentacles) for (const pc of pentacles) { if (pc.kind === "sanctuary") sanctSet.add(pc.x + pc.y * MW); }
  const visited = new Set();
  visited.add(sx + sy * MW);
  const queue = [{ x: sx, y: sy, firstX: null, firstY: null }];
  const dirs = [
    [0, -1], [0, 1], [-1, 0], [1, 0],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ];
  let steps = 0;
  while (queue.length > 0 && steps < maxDist * 50) {
    const cur = queue.shift();
    steps++;
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!isWalkable(map, nx, ny)) continue;
      /* 対角移動：両隣の直交タイルが両方とも壁ならコーナーすり抜けを禁止 */
      if (dx !== 0 && dy !== 0) {
        if (!isWalkable(map, cur.x + dx, cur.y) && !isWalkable(map, cur.x, cur.y + dy)) continue;
      }
      const nk = nx + ny * MW;
      if (sanctSet.has(nk) && !(nx === tx && ny === ty)) continue;
      if (visited.has(nk)) continue;
      visited.add(nk);
      const fx = cur.firstX !== null ? cur.firstX : nx;
      const fy = cur.firstY !== null ? cur.firstY : ny;
      if (nx === tx && ny === ty) return { x: fx, y: fy };
      if (!monSet.has(nk)) {
        queue.push({ x: nx, y: ny, firstX: fx, firstY: fy });
      }
    }
  }
  return null;
}

export function findRoom(rooms, x, y) {
  return (
    rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) ||
    null
  );
}

export function getOpenDirs(map, x, y) {
  const res = [];
  const ds = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dx, dy] of ds) {
    const nx = x + dx,
      ny = y + dy;
    if (isWalkable(map, nx, ny))
      res.push({ x: dx, y: dy });
  }
  return res;
}

/* ===== STRAIGHT-LINE CHECK ===== */
export function inStraightLine(x0, y0, x1, y1) {
  const adx = Math.abs(x1 - x0), ady = Math.abs(y1 - y0);
  return adx === 0 || ady === 0 || adx === ady;
}

/* 矢の落下位置を魔方陣のないマスに調整するヘルパー */
function _arrowBlocked(x, y, dg) {
  if (dg.map[y]?.[x] === T.WALL || dg.map[y]?.[x] === T.BWALL) return true;
  if (dg.map[y]?.[x] === T.SD || dg.map[y]?.[x] === T.SU) return true;
  if (dg.bigboxes?.some(b => b.x === x && b.y === y)) return true;
  if (dg.pentacles?.some(pc => pc.x === x && pc.y === y)) return true;
  return false;
}
function safeArrowDrop(x, y, dg) {
  if (!_arrowBlocked(x, y, dg)) return { x, y };
  /* 周辺マスを探索して障害物のない床を返す */
  const DRO = [
    [0,-1],[0,1],[-1,0],[1,0],
    [-1,-1],[-1,1],[1,-1],[1,1],
    [0,-2],[0,2],[-2,0],[2,0],
  ];
  for (const [ddx, ddy] of DRO) {
    const nx = x + ddx, ny = y + ddy;
    if (!inBounds(nx, ny)) continue;
    if (!_arrowBlocked(nx, ny, dg)) return { x: nx, y: ny };
  }
  return { x, y }; /* 見つからなければ元の位置 */
}

/* ===== MONSTER ARROW SHOT ===== */
function monsterShootArrow(m, dg, pl, ml, opts) {
  const adx = pl.x - m.x, ady = pl.y - m.y;
  const dx = Math.sign(adx), dy = Math.sign(ady);
  const maxDist = Math.max(Math.abs(adx), Math.abs(ady));
  const miss = Math.random() < 0.25;
  const _fcMode = getFarcastMode(pl.x, pl.y, dg);
  const _isFc = _fcMode === "farcast";
  const _travelMax = _isFc ? 50 : maxDist;
  ml.push(`${m.name}が矢を放った！`);
  let lx = m.x, ly = m.y;
  let _plHit = false;
  for (let d = 1; d <= _travelMax; d++) {
    const tx = m.x + dx * d, ty = m.y + dy * d;
    if (!isWalkable(dg.map, tx, ty)) {
      /* arrow hits wall — drop at last valid position (avoid pentacle) */
      const _wd = safeArrowDrop(lx, ly, dg);
      dg.items.push({ name:"矢", type:"arrow", atk:4, desc:"99本まで束にできる矢。", count:1, tile:23, id:uid(), x:_wd.x, y:_wd.y });
      return;
    }
    if (tx === pl.x && ty === pl.y && !_plHit) {
      /* 祝福された聖域の魔方陣のみ矢を防ぐ（通常聖域は近接のみ） */
      const _arSanc = dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y);
      if (miss || _arSanc) {
        const _ad = safeArrowDrop(_arSanc ? lx : pl.x, _arSanc ? ly : pl.y, dg);
        dg.items.push({ name:"矢", type:"arrow", atk:4, desc:"99本まで束にできる矢。", count:1, tile:23, id:uid(), x:_ad.x, y:_ad.y });
        if (_arSanc) ml.push(`${m.name}の矢は祝福された聖域の加護に阻まれた！矢が落ちた。`);
        else ml.push(`${m.name}の矢は外れた！矢が落ちた。`);
        const trap = dg.traps.find(t => t.x === pl.x && t.y === pl.y);
        if (trap && opts.fireTrapFn) opts.fireTrapFn(trap, pl, dg, ml);
        if (!_isFc) return;
      } else {
        let dmg = Math.max(1, m.atk + rng(-2, 2));
        const _arRoom = findRoom(dg.rooms, pl.x, pl.y);
        const _arVulnPc = _arRoom && dg.pentacles?.find(pc => pc.kind === "vulnerability" && pc.x >= _arRoom.x && pc.x < _arRoom.x + _arRoom.w && pc.y >= _arRoom.y && pc.y < _arRoom.y + _arRoom.h);
        if (_arVulnPc) dmg = _arVulnPc.cursed ? Math.max(1, Math.floor(dmg / 2)) : dmg * (_arVulnPc.blessed ? 4 : 2);
        pl.deathCause = `${m.name}の矢の攻撃で`;
        pl.hp -= dmg;
        ml.push(`${m.name}の矢が命中！${dmg}ダメージ！`);
        if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("衝撃で目が覚めた！"); }
        if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("衝撃で金縛りが解けた！"); }
        if (!_isFc) return;
        /* farcast: arrow continues past player */
        _plHit = true;
        ml.push(`矢は貫通して飛んでいく！`);
      }
    }
    /* intermediate monster */
    const hitMon = dg.monsters.find(o => o !== m && o.x === tx && o.y === ty);
    if (hitMon) {
      const dmg = Math.max(1, m.atk + rng(-2, 2));
      hitMon.hp -= dmg;
      ml.push(`${m.name}の矢が${hitMon.name}に命中！${dmg}ダメージ！`);
      if (hitMon.hp <= 0) {
        ml.push(`${hitMon.name}は倒れた！`);
        opts.monsterDropFn?.(hitMon, dg, ml);
        removeMonster(dg, hitMon);
        monLevelUp(m, dg, ml);
      }
      if (!_isFc) return;
    }
    /* bigbox */
    const bb = dg.bigboxes?.find(b => b.x === tx && b.y === ty);
    if (bb) {
      const ar = { name:"矢", type:"arrow", atk:4, desc:"99本まで束にできる矢。", count:1, tile:23, id:uid() };
      ml.push(`${m.name}の矢が${bb.name}に当たった。`);
      if (opts.bbFn) opts.bbFn(bb, ar, dg, ml);
      else dg.items.push({ ...ar, x:tx, y:ty });
      if (!_isFc) return;
    }
    lx = tx; ly = ty;
  }
  /* fell through — drop at last position */
  const _fd = safeArrowDrop(lx, ly, dg);
  dg.items.push({ name:"矢", type:"arrow", atk:4, desc:"99本まで束にできる矢。", count:1, tile:23, id:uid(), x:_fd.x, y:_fd.y });
}

/* ===== MONSTER STONE THROW (ワッカ) ===== */
function monsterThrowStone(m, dg, pl, ml) {
  const lvl = m.monLevel || 1;
  const isMagic = lvl >= 3;
  const hitChance = lvl >= 3 ? 0.99 : lvl >= 2 ? 0.90 : 0.75;
  const stoneName = isMagic ? "魔法の石" : "石";
  ml.push(`${m.name}が${stoneName}を投げた！`);

  /* みかわし（防具の効果） */
  const dodged = (pl.armor?.ability === "dodge" || pl.armor?.abilities?.includes("dodge")) && Math.random() < 0.25;
  if (dodged) {
    ml.push(`${stoneName}をひらりとかわした！${stoneName}が落ちた。`);
    const _sd = safeArrowDrop(pl.x, pl.y, dg);
    const newSt = isMagic ? makeMagicStone(1) : makeStone(1);
    newSt.x = _sd.x; newSt.y = _sd.y;
    dg.items.push(newSt);
    return;
  }

  const miss = Math.random() >= hitChance;
  if (miss) {
    ml.push(`${stoneName}は外れた！${stoneName}が足元に落ちた。`);
    const _sd = safeArrowDrop(pl.x, pl.y, dg);
    const newSt = isMagic ? makeMagicStone(1) : makeStone(1);
    newSt.x = _sd.x; newSt.y = _sd.y;
    dg.items.push(newSt);
    return;
  }

  /* 命中 */
  const _stRoom = findRoom(dg.rooms, pl.x, pl.y);
  const _stVulnPc = _stRoom && dg.pentacles?.find(pc =>
    pc.kind === "vulnerability" &&
    pc.x >= _stRoom.x && pc.x < _stRoom.x + _stRoom.w &&
    pc.y >= _stRoom.y && pc.y < _stRoom.y + _stRoom.h
  );
  let dmg = Math.max(1, m.atk + rng(-2, 2));
  if (_stVulnPc) dmg = _stVulnPc.cursed ? Math.max(1, Math.floor(dmg / 2)) : dmg * (_stVulnPc.blessed ? 4 : 2);
  pl.deathCause = `${m.name}の石投げで`;
  pl.hp -= dmg;
  ml.push(`${m.name}の${stoneName}が命中！${dmg}ダメージ！`);
  if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("衝撃で目が覚めた！"); }
  if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("衝撃で金縛りが解けた！"); }
}

/* ===== MONSTER AI ===== */
export function monsterAI(m, dg, pl, ml, opts = {}) {
  /* モンスターハウス仮眠：triggerMonsterHouseで解除されるまで動かない */
  if (m.dormantHouse) return;
  /* 通常仮眠：視界に入ったら個別に覚醒 */
  if (m.dormant) {
    if (dg.visible?.[m.y]?.[m.x]) {
      m.dormant = false;
      ml.push(`${m.name}が目を覚ました！`);
    } else {
      return;
    }
  }
  /* 状態異常防止：毎ターンカウントダウン */
  if ((m.statusImmune || 0) > 0) {
    m.statusImmune--;
    if (m.statusImmune <= 0) ml.push(`${m.name}の状態防止が切れた！`);
  }
  if (m.sleepTurns > 0) {
    m.sleepTurns--;
    return;
  }
  if (m.paralyzed) return;

  /* ===== 混乱状態：ランダム方向に移動・攻撃 ===== */
  if ((m.confusedTurns || 0) > 0) {
    m.confusedTurns--;
    const _cdirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
    const _rd = pick(_cdirs);
    const _cnx = m.x + _rd[0], _cny = m.y + _rd[1];
    if (inBounds(_cnx, _cny)) {
      if (_cnx === pl.x && _cny === pl.y) {
        if (m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `混乱した${m.name}の攻撃！${d}ダメージ！`); }
      } else {
        const _other = dg.monsters.find(o => o !== m && o.x === _cnx && o.y === _cny);
        if (_other) {
          /* 他のモンスターを攻撃 */
          const _odmg = Math.max(1, Math.floor(m.atk * m.atk / (m.atk + (_other.def || 0))) + rng(-1, 1));
          _other.hp -= _odmg;
          ml.push(`混乱した${m.name}が${_other.name}を攻撃！${_odmg}ダメージ！`);
          if (_other.hp <= 0) {
            ml.push(`${_other.name}は倒れた！`);
            removeMonster(dg, _other);
            monLevelUp(m, dg, ml);
          }
        } else if (isWalkable(dg.map, _cnx, _cny)) {
          m.x = _cnx; m.y = _cny;
        }
      }
    }
    if (m.confusedTurns <= 0) ml.push(`${m.name}の混乱が解けた！`);
    return;
  }

  /* ===== 暗闇状態：まっすぐ進み途中の者を攻撃 ===== */
  if ((m.darknessTurns || 0) > 0) {
    const _isPerm = m.darknessTurns >= 9999;
    if (!_isPerm) m.darknessTurns--;
    if (!m.darkDir) {
      const _ddirs = [[-1,0],[1,0],[0,-1],[0,1]];
      m.darkDir = pick(_ddirs);
    }
    const _dnx = m.x + m.darkDir[0], _dny = m.y + m.darkDir[1];
    if (isWalkable(dg.map, _dnx, _dny)) {
      if (_dnx === pl.x && _dny === pl.y) {
        if (m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `暗闇の${m.name}が突進して攻撃！${d}ダメージ！`, { skipVuln: true, skipThorn: true }); }
      } else {
        const _dother = dg.monsters.find(o => o !== m && o.x === _dnx && o.y === _dny);
        if (_dother) {
          const _dodmg = Math.max(1, Math.floor(m.atk * m.atk / (m.atk + (_dother.def || 0))) + rng(-1, 1));
          _dother.hp -= _dodmg;
          ml.push(`暗闇の${m.name}が${_dother.name}に突進！${_dodmg}ダメージ！`);
          if (_dother.hp <= 0) {
            ml.push(`${_dother.name}は倒れた！`);
            removeMonster(dg, _dother);
            monLevelUp(m, dg, ml);
          }
        } else {
          m.x = _dnx; m.y = _dny;
        }
      }
    } else {
      m.darkDir = null; // 壁に当たったら方向リセット
    }
    if (!_isPerm && m.darknessTurns <= 0) ml.push(`${m.name}の暗闇が晴れた！`);
    return;
  }

  /* ===== 幻惑状態：プレイヤーから逃げ回る ===== */
  if ((m.fleeingTurns || 0) > 0) {
    const _isPerm = m.fleeingTurns >= 9999;
    if (!_isPerm) m.fleeingTurns--;
    const _fcands = [];
    for (const [_fmx, _fmy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
      const _fnx = m.x + _fmx, _fny = m.y + _fmy;
      if (!isWalkable(dg.map, _fnx, _fny)) continue;
      if (dg.monsters.some(o => o !== m && o.x === _fnx && o.y === _fny)) continue;
      if (_fnx === pl.x && _fny === pl.y) continue;
      const _score = (_fnx - pl.x) * (_fnx - pl.x) + (_fny - pl.y) * (_fny - pl.y);
      _fcands.push({ x: _fnx, y: _fny, score: _score });
    }
    _fcands.sort((a, b) => b.score - a.score);
    if (_fcands.length > 0) { m.x = _fcands[0].x; m.y = _fcands[0].y; }
    if (!_isPerm && m.fleeingTurns <= 0) ml.push(`${m.name}の幻惑が解けた！`);
    return;
  }

  /* ===== 詰まり検出（位置履歴で停滞・往復を判定） ===== */
  m.posHistory = m.posHistory || [];
  m.posHistory.push({ x: m.x, y: m.y });
  if (m.posHistory.length > 6) m.posHistory.shift();
  let _forceAlt = false;
  if (m.posHistory.length >= 6) {
    const _ph = m.posHistory;
    /* パターン1: 6ターン全く同じ位置（完全停止） */
    const _allSame = _ph.every(p => p.x === _ph[0].x && p.y === _ph[0].y);
    /* パターン2: A↔B を交互に往復（A,B,A,B,...） */
    const _isOsc = (_ph[0].x !== _ph[1].x || _ph[0].y !== _ph[1].y) &&
      _ph.every((p, i) => i % 2 === 0
        ? (p.x === _ph[0].x && p.y === _ph[0].y)
        : (p.x === _ph[1].x && p.y === _ph[1].y));
    _forceAlt = _allSame || _isOsc;
  }
  /* プレイヤーに隣接していれば詰まり扱いしない（攻撃ターンは正常） */
  if (_forceAlt && Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1) _forceAlt = false;

  /* shopkeeper */
  if (m.type === "shopkeeper") {
    if (m.state === "friendly") {
      /* 聖域の魔法陣の上にいる場合は隣接フロアタイルに退く */
      if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === m.x && pc.y === m.y)) {
        const _dirs4 = [[0,1],[0,-1],[1,0],[-1,0]];
        for (const [_dx, _dy] of _dirs4) {
          const _nx = m.x + _dx, _ny = m.y + _dy;
          if (dg.map[_ny]?.[_nx] === T.FLOOR &&
              !dg.monsters.some(o => o !== m && o.x === _nx && o.y === _ny) &&
              !dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _nx && pc.y === _ny)) {
            m.x = _nx; m.y = _ny; break;
          }
        }
      }
      return;
    }
    if (m.state === "blocking") {
      const _bp = m.blockPos;
      const _bpSanc = dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _bp.x && pc.y === _bp.y);
      if (_bpSanc) {
        /* 聖域なら隣接の別タイルに立つ */
        const _dirs4 = [[0,1],[0,-1],[1,0],[-1,0]];
        for (const [_dx, _dy] of _dirs4) {
          const _nx = _bp.x + _dx, _ny = _bp.y + _dy;
          if (dg.map[_ny]?.[_nx] === T.FLOOR &&
              !dg.monsters.some(o => o !== m && o.x === _nx && o.y === _ny) &&
              !dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _nx && pc.y === _ny)) {
            m.x = _nx; m.y = _ny; return;
          }
        }
      } else {
        if (m.x !== _bp.x || m.y !== _bp.y) {
          /* プレイヤーや他のモンスターが既に同マスにいる場合は近傍の空きタイルへ */
          const _bpFree = (_bp.x !== pl.x || _bp.y !== pl.y) &&
            !dg.monsters.some(o => o !== m && o.x === _bp.x && o.y === _bp.y) &&
            (dg.map[_bp.y]?.[_bp.x] === T.FLOOR || dg.map[_bp.y]?.[_bp.x] === T.SD || dg.map[_bp.y]?.[_bp.x] === T.SU);
          if (_bpFree) {
            m.x = _bp.x; m.y = _bp.y;
          } else {
            /* blockPos が塞がれていたらBFSで1歩近づく */
            const _bn = bfsNext(dg.map, dg.monsters, m.x, m.y, _bp.x, _bp.y, m, 10);
            if (_bn && (_bn.x !== pl.x || _bn.y !== pl.y) &&
                !dg.monsters.some(o => o !== m && o.x === _bn.x && o.y === _bn.y)) {
              m.x = _bn.x; m.y = _bn.y;
            }
          }
        }
      }
      return;
    }
  }

  const map = dg.map,
    rooms = dg.rooms;
  const dist = Math.abs(pl.x - m.x) + Math.abs(pl.y - m.y);
  /* 同じ部屋にいる場合は常に相互認識（大部屋でFOV外でも同様） */
  const _monRoom = findRoom(rooms, m.x, m.y);
  const _plRoom  = findRoom(rooms, pl.x, pl.y);
  const _sameRoom = _monRoom !== null && _plRoom !== null &&
    _monRoom.x === _plRoom.x && _monRoom.y === _plRoom.y;
  const canSee = _sameRoom || ((dg.visible?.[m.y]?.[m.x] ?? false) && hasLOS(map, m.x, m.y, pl.x, pl.y));

  if (canSee) {
    m.aware = true;
    m.lastPx = pl.x;
    m.lastPy = pl.y;
  } else if (m.aware && m.x === m.lastPx && m.y === m.lastPy) {
    m.aware = false;
  }

  /* ===== 壁歩き（岩霊等）：壁を無視してプレイヤーに直進 ===== */
  if (m.wallWalker) {
    /* 隣接していれば攻撃 */
    if (Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1) {
      if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y)) return;
      if (m.turnAttacks < (m.maxAttacks ?? 1)) {
        m.turnAttacks++;
        const _wwInWall = dg.map[m.y]?.[m.x] === T.WALL;
        monsterAttackPlayer(m, dg, pl, ml, d => _wwInWall
          ? `${m.name}が壁を突き抜けて攻撃！${d}ダメージ！`
          : `${m.name}の攻撃！${d}ダメージ！`);
        return;
      }
      /* 2回目以降は移動のみ → 直進コードへフォールスルー */
    }
    /* 壁を無視してプレイヤーへ1歩直進 */
    const _wdx = Math.sign(pl.x - m.x), _wdy = Math.sign(pl.y - m.y);
    if (_wdx !== 0 || _wdy !== 0) {
      const _wnx = m.x + _wdx, _wny = m.y + _wdy;
      if (inBounds(_wnx, _wny) &&
          !(_wnx === pl.x && _wny === pl.y) &&
          !dg.monsters.some(o => o !== m && o.x === _wnx && o.y === _wny) &&
          !dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _wnx && pc.y === _wny)) {
        m.x = _wnx; m.y = _wny;
      }
    }
    return;
  }

  if (m.aware) {
    /* ── ranged special attacks (only when player is visible) ── */
    if (canSee) {
      const adx = pl.x - m.x, ady = pl.y - m.y;
      const lineLen = Math.max(Math.abs(adx), Math.abs(ady));
      const inLine = adx === 0 || ady === 0 || Math.abs(adx) === Math.abs(ady);

      if (m.subtype === "archer" && !m.sealed && inLine && lineLen >= 1 && lineLen <= 10 && m.turnAttacks < (m.maxAttacks ?? 1) && Math.random() < 0.5) {
        m.turnAttacks++;
        monsterShootArrow(m, dg, pl, ml, opts);
        return;
      }

      if (m.subtype === "stonethrow" && !m.sealed && m.turnAttacks < (m.maxAttacks ?? 1)) {
        const _stLvl = m.monLevel || 1;
        const _stRange = _stLvl >= 3 ? 10 : _stLvl >= 2 ? 5 : 3;
        const _stDist = Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y));
        if (_stDist <= _stRange && Math.random() < 0.5) {
          m.turnAttacks++;
          monsterThrowStone(m, dg, pl, ml);
          return;
        }
      }

      if (m.subtype === "wanduser" && !m.sealed && inLine && lineLen >= 1 && lineLen <= 10 && opts.monsterWandFn && m.turnAttacks < (m.maxAttacks ?? 1) && Math.random() < 0.5) {
        const _wRoom = findRoom(rooms, m.x, m.y);
        const _wSeal = (dg.pentacles?.some(pc => pc.kind === "magic_seal" && pc.blessed)) ||
          (_wRoom && dg.pentacles?.some(pc =>
            pc.kind === "magic_seal" &&
            pc.x >= _wRoom.x && pc.x < _wRoom.x + _wRoom.w &&
            pc.y >= _wRoom.y && pc.y < _wRoom.y + _wRoom.h
          ));
        if (!_wSeal) {
          m.turnAttacks++;
          opts.monsterWandFn(m, Math.sign(adx), Math.sign(ady));
          return;
        }
        // 魔封じの部屋にいる場合は杖を使えず通常行動へフォールスルー
      }
    }

    /* ── runner（コロポックル等）：常にプレイヤーから逃げる。攻撃しない ── */
    if (m.subtype === "runner") {
      const _rcands = [];
      for (const [_rmx, _rmy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
        const _rnx = m.x + _rmx, _rny = m.y + _rmy;
        if (!isWalkable(dg.map, _rnx, _rny)) continue;
        if (dg.monsters.some(o => o !== m && o.x === _rnx && o.y === _rny)) continue;
        if (_rnx === pl.x && _rny === pl.y) continue;
        const _score = (_rnx - pl.x) * (_rnx - pl.x) + (_rny - pl.y) * (_rny - pl.y);
        _rcands.push({ x: _rnx, y: _rny, score: _score });
      }
      _rcands.sort((a, b) => b.score - a.score);
      if (_rcands.length > 0) { m.x = _rcands[0].x; m.y = _rcands[0].y; }
      return;
    }

    /* ── thief（コソドロ等）：隣接時に所持品を1つ盗んでワープ、その後また近づく ── */
    if (m.subtype === "thief" && !m.sealed) {
      const _tdx = pl.x - m.x, _tdy = pl.y - m.y;
      const _adj = Math.abs(_tdx) <= 1 && Math.abs(_tdy) <= 1;
      if (_adj) {
        const _hasAntiSteal = pl.armor?.ability === "anti_steal" || pl.armor?.abilities?.includes("anti_steal");
        if (_hasAntiSteal) {
          ml.push(`護盗の鎧が${m.name}の盗みを防いだ！`);
          /* 盗めないので通常攻撃 */
          if (m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`); }
          return;
        }
        const _stealable = pl.inventory.filter(i => i.type !== "gold");
        if (_stealable.length > 0) {
          const _stolen = pick(_stealable);
          const _sidx = pl.inventory.indexOf(_stolen);
          pl.inventory.splice(_sidx, 1);
          /* ワープ先：罠の隣を優先 */
          let _wx = m.x, _wy = m.y;
          const _trapList = dg.traps || [];
          let _placed = false;
          if (_trapList.length > 0) {
            const _tgt = pick(_trapList);
            const _tdirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
            for (const [_ddx, _ddy] of _tdirs) {
              const _cx = _tgt.x + _ddx, _cy = _tgt.y + _ddy;
              if (isWalkable(dg.map, _cx, _cy) &&
                  !dg.monsters.some(o => o.x === _cx && o.y === _cy) &&
                  !(_cx === pl.x && _cy === pl.y)) {
                _wx = _cx; _wy = _cy; _placed = true; break;
              }
            }
            if (!_placed) { _wx = _tgt.x; _wy = _tgt.y; }
          } else {
            const _room = dg.rooms[rng(0, dg.rooms.length - 1)];
            _wx = rng(_room.x, _room.x + _room.w - 1);
            _wy = rng(_room.y, _room.y + _room.h - 1);
          }
          m.x = _wx; m.y = _wy;
          const _ft = new Set();
          placeItemAt(dg, _wx, _wy, _stolen, ml, _ft);
          ml.push(`${m.name}が${_stolen.name}を盗んで煙の中に消えた！`);
          return;
        }
        /* 盗めるものがなければ通常攻撃 */
        if (m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`); }
        return;
      }
    }

    /* ── supporter（シャーマン等）：近くの味方を回復・強化 ── */
    if (m.subtype === "supporter" && Math.random() < 0.5) {
      /* 傷ついた味方を探す（範囲8マス） */
      const _injured = dg.monsters.filter(o =>
        o !== m && (o.maxHp != null ? o.hp < o.maxHp : false) &&
        Math.abs(o.x - m.x) + Math.abs(o.y - m.y) <= 8
      );
      if (_injured.length > 0) {
        const _healTarget = _injured.reduce((a, b) =>
          (Math.abs(a.x - m.x) + Math.abs(a.y - m.y)) <=
          (Math.abs(b.x - m.x) + Math.abs(b.y - m.y)) ? a : b
        );
        const _hdist = Math.abs(_healTarget.x - m.x) + Math.abs(_healTarget.y - m.y);
        if (_hdist <= 1) {
          /* 隣接：回復 */
          const _heal = rng(5, 12);
          _healTarget.hp = Math.min(_healTarget.maxHp, _healTarget.hp + _heal);
          ml.push(`${m.name}が${_healTarget.name}を回復した！(+${_heal}HP)`);
          return;
        } else {
          /* 傷ついた味方へ接近 */
          const _hn = bfsNext(map, [], m.x, m.y, _healTarget.x, _healTarget.y, m, 15, dg.pentacles);
          if (_hn && !dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _hn.x && pc.y === _hn.y) &&
              !dg.monsters.some(o => o !== m && o.x === _hn.x && o.y === _hn.y)) {
            m.x = _hn.x; m.y = _hn.y;
            return;
          }
        }
      }
      /* 傷なし：隣の味方に攻撃バフ（未付与のみ） */
      const _buffable = dg.monsters.filter(o =>
        o !== m && !o.atkBuffed &&
        Math.abs(o.x - m.x) + Math.abs(o.y - m.y) <= 1
      );
      if (_buffable.length > 0) {
        const _bt = _buffable[rng(0, _buffable.length - 1)];
        const _buffAmt = rng(2, 4);
        _bt.atk += _buffAmt;
        _bt.atkBuffed = true;
        ml.push(`${m.name}が${_bt.name}を強化！攻撃力+${_buffAmt}！`);
        return;
      }
      /* 強化・回復対象なし → 通常行動（プレイヤーへ接近）にフォールスルー */
    }

    const tx = canSee ? pl.x : m.lastPx;
    const ty = canSee ? pl.y : m.lastPy;

    /* adjacent attack */
    if (Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1 && canSee) {
      /* 聖域チェック：プレイヤーが聖域の上なら攻撃不可 */
      if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y)) return;
      if (m.turnAttacks < (m.maxAttacks ?? 1)) {
        m.turnAttacks++;
        monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`);
        return;
      }
      /* 2回目以降：攻撃せずBFSで移動を試みる */
    }

    /* move toward target */
    /* BFSで最短経路を求める。部屋内での壁ぶつかりを防ぎ、通路への最適経路を辿る。 */
    const next = bfsNext(map, [], m.x, m.y, tx, ty, m, 40, dg.pentacles);
    if (next && dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === next.x && pc.y === next.y)) return;
    if (next) {
      if (next.x === pl.x && next.y === pl.y) {
        /* 聖域チェック：プレイヤーが聖域の上なら攻撃不可 */
        if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y)) return;
        m.dir = { x: next.x - m.x, y: next.y - m.y };
        if (m.turnAttacks < (m.maxAttacks ?? 1)) {
          m.turnAttacks++;
          monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`);
        }
        return;
      }
      if (!dg.monsters.some((o) => o !== m && o.x === next.x && o.y === next.y)) {
        m.dir = { x: next.x - m.x, y: next.y - m.y };
        m.x = next.x;
        m.y = next.y;
        if (_forceAlt) m.posHistory = [];
        return;
      }
      /* 次マスが別モンスターに占有 */
      /* 対向（互いに相手のマスへ向かっている）なら位置を交換してデッドロック解消 */
      const _blocker = dg.monsters.find(o => o !== m && o.x === next.x && o.y === next.y);
      if (_blocker) {
        const _bNext = bfsNext(map, [], _blocker.x, _blocker.y,
          (_blocker.aware ? (_blocker.lastPx ?? pl.x) : (m.x)),
          (_blocker.aware ? (_blocker.lastPy ?? pl.y) : (m.y)),
          _blocker, 4, dg.pentacles);
        if (_bNext && _bNext.x === m.x && _bNext.y === m.y && _blocker.type !== "shopkeeper") {
          /* 正面衝突：スワップ（店主はスワップ不可） */
          _blocker.x = m.x; _blocker.y = m.y;
          m.dir = { x: next.x - m.x, y: next.y - m.y };
          m.x = next.x; m.y = next.y;
          return;
        }
      }
      /* 塞がれた場合：ターゲットに近づける別マスがあれば移動（室内での一列整列を防ぐ） */
      const _curDist = Math.abs(tx - m.x) + Math.abs(ty - m.y);
      const _altMoves = [];
      for (const [_adx, _ady] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        const _anx = m.x + _adx, _any = m.y + _ady;
        if (_anx === next.x && _any === next.y) continue;
        if (!isWalkable(map, _anx, _any)) continue;
        if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _anx && pc.y === _any)) continue;
        if (dg.monsters.some(o => o !== m && o.x === _anx && o.y === _any)) continue;
        if (_adx !== 0 && _ady !== 0) {
          if (!isWalkable(map, m.x + _adx, m.y) && !isWalkable(map, m.x, m.y + _ady)) continue;
        }
        const _nd = Math.abs(tx - _anx) + Math.abs(ty - _any);
        if (_nd <= _curDist) _altMoves.push({ x: _anx, y: _any, dist: _nd });
      }
      if (_altMoves.length > 0) {
        _altMoves.sort((a, b) => a.dist - b.dist);
        const _ab = _altMoves[0];
        if (_ab.x === pl.x && _ab.y === pl.y) {
          if (!dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y) &&
              m.turnAttacks < (m.maxAttacks ?? 1)) {
            m.turnAttacks++; m.dir = { x: _ab.x - m.x, y: _ab.y - m.y };
            monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`);
          }
          return;
        }
        m.dir = { x: _ab.x - m.x, y: _ab.y - m.y };
        m.x = _ab.x; m.y = _ab.y;
        return;
      }
      return; /* 前の敵が動けない場合は自然なキューイングで待機 */
    }
    /* BFS 経路なし（壁で完全遮断）：_forceAlt 時のみランダム脱出を試みる */
    if (_forceAlt) {
      const _fd4 = [[0,-1],[0,1],[-1,0],[1,0]].sort(() => Math.random() - 0.5);
      for (const [_fdx, _fdy] of _fd4) {
        const _fnx = m.x + _fdx, _fny = m.y + _fdy;
        if (!isWalkable(map, _fnx, _fny)) continue;
        if (_fnx === pl.x && _fny === pl.y) continue;
        if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _fnx && pc.y === _fny)) continue;
        if (dg.monsters.some(o => o !== m && o.x === _fnx && o.y === _fny)) continue;
        m.dir = { x: _fdx, y: _fdy };
        m.x = _fnx; m.y = _fny;
        m.posHistory = [];
        return;
      }
      m.posHistory = [];
    }
  } else {
    /* ===== 未覚醒：パトロール ===== */
    const room = findRoom(rooms, m.x, m.y);
    const _arrived = m.patrolTarget &&
      m.x === m.patrolTarget.x && m.y === m.patrolTarget.y;

    /* ターゲット到着・未設定・稀なリセット → 次の目標を選ぶ */
    if (_arrived || !m.patrolTarget || Math.random() < 0.02) {
      /* 直前に訪れたターゲットを記録（往復防止に使う） */
      if (_arrived) m.lastPatrolTarget = { x: m.patrolTarget.x, y: m.patrolTarget.y };
      m.patrolTarget = null;

      if (room) {
        /* 部屋の4辺外側にある通行可能タイル（出口）を収集 */
        const exits = [];
        for (let ex = room.x; ex < room.x + room.w; ex++) {
          if (isWalkable(map, ex, room.y - 1))     exits.push({ x: ex, y: room.y - 1 });
          if (isWalkable(map, ex, room.y + room.h)) exits.push({ x: ex, y: room.y + room.h });
        }
        for (let ey = room.y; ey < room.y + room.h; ey++) {
          if (isWalkable(map, room.x - 1, ey))     exits.push({ x: room.x - 1, y: ey });
          if (isWalkable(map, room.x + room.w, ey)) exits.push({ x: room.x + room.w, y: ey });
        }
        if (exits.length > 0) {
          /* 直前に訪れた出口を除外して往復を防止 */
          const _prev = m.lastPatrolTarget;
          const cands = _prev
            ? exits.filter(e => e.x !== _prev.x || e.y !== _prev.y)
            : exits;
          m.patrolTarget = pick(cands.length > 0 ? cands : exits);
        }
      } else {
        /* 廊下・壁破壊後エリア：来た方向の逆を避けて進行方向を決定 */
        const dirs4 = [[0,1],[0,-1],[1,0],[-1,0]];
        const open = dirs4.filter(([dx,dy]) => isWalkable(map, m.x + dx, m.y + dy));
        /* m.dir の逆方向（戻る方向）を除外 */
        const notRev = m.dir
          ? open.filter(([dx,dy]) => !(dx === -m.dir.x && dy === -m.dir.y))
          : open;
        const chosen = pick(notRev.length > 0 ? notRev : open);
        if (chosen) {
          /* 選んだ方向の廊下を実際に走査し、最初の壁手前の床タイルを目標にする */
          let _ptx = m.x, _pty = m.y;
          for (let _s = 1; _s <= 16; _s++) {
            const _nx = m.x + chosen[0] * _s, _ny = m.y + chosen[1] * _s;
            if (!isWalkable(map, _nx, _ny)) break;
            _ptx = _nx; _pty = _ny;
          }
          m.patrolTarget = { x: _ptx, y: _pty };
        }
      }
    }

    /* BFSで1歩進む（壁のみ障害物、モンスターは無視して経路探索） */
    if (m.patrolTarget) {
      const next = bfsNext(map, [], m.x, m.y,
        m.patrolTarget.x, m.patrolTarget.y, m, 20, dg.pentacles);
      if (next && !(next.x === pl.x && next.y === pl.y) &&
          !dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === next.x && pc.y === next.y)) {
        if (!dg.monsters.some(o => o !== m && o.x === next.x && o.y === next.y)) {
          m.dir = { x: next.x - m.x, y: next.y - m.y };
          m.x = next.x; m.y = next.y;
          return;
        }
        /* 次マスが別モンスターに占有 → ターゲットリセット＋向き反転で方向転換
           （_forceAlt 時はこのまま後続の脱出処理にフォールスルーする） */
        m.patrolTarget = null;
        if (m.dir) m.dir = { x: -m.dir.x, y: -m.dir.y };
        if (!_forceAlt) return;
      }
      /* BFS経路なし（壁で遮断）→ 次ターンで目標を再選択 */
      if (!_forceAlt) { m.patrolTarget = null; return; }
      m.patrolTarget = null;
    }
    /* ===== パトロール詰まり脱出（_forceAlt 時のみ）===== */
    if (_forceAlt) {
      const _fd4 = [[0,-1],[0,1],[-1,0],[1,0]].sort(() => Math.random() - 0.5);
      for (const [_fdx, _fdy] of _fd4) {
        const _fnx = m.x + _fdx, _fny = m.y + _fdy;
        if (!isWalkable(map, _fnx, _fny)) continue;
        if (_fnx === pl.x && _fny === pl.y) continue;
        if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _fnx && pc.y === _fny)) continue;
        if (dg.monsters.some(o => o !== m && o.x === _fnx && o.y === _fny)) continue;
        m.dir = { x: _fdx, y: _fdy };
        m.x = _fnx; m.y = _fny;
        m.posHistory = [];
        m.patrolTarget = null;
        return;
      }
      m.posHistory = [];
      m.patrolTarget = null;
    }
  }
}
