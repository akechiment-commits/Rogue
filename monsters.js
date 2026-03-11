import { rng, uid, MW, MH, T, DRO } from "./utils.js";
import { getFarcastMode } from "./items.js";

/* ===== MONSTER DEFINITIONS ===== */
export const MONS = [
  {
    name: "ネズミ",
    hp: 4,
    atk: 2,
    def: 0,
    exp: 3,
    speed: 1,
    tile: 6,
    kind: "beast",
  },
  {
    name: "コボルド",
    hp: 8,
    atk: 4,
    def: 1,
    exp: 8,
    speed: 1,
    tile: 7,
    kind: "humanoid",
  },
  /* ── 遠距離攻撃敵 (テスト: 二階から出現) ── */
  {
    name: "アーチャー",
    hp: 18,
    atk: 8,
    def: 2,
    exp: 30,
    speed: 1,
    tile: 39,
    kind: "humanoid",
    subtype: "archer",
  },
  {
    name: "ウィザード",
    hp: 14,
    atk: 6,
    def: 1,
    exp: 35,
    speed: 1,
    tile: 40,
    kind: "humanoid",
    subtype: "wanduser",
    wandEffect: "lightning",
  },
  /* ── 呪術師 (2階から出現・固定スポーン) ── */
  {
    name: "呪術師",
    hp: 18,
    atk: 5,
    def: 2,
    exp: 42,
    speed: 1,
    tile: 44,
    kind: "humanoid",
    subtype: "wanduser",
    wandEffect: "curse_wand",
  },
  {
    name: "ゴブリン",
    hp: 10,
    atk: 5,
    def: 2,
    exp: 12,
    speed: 1,
    tile: 8,
    kind: "humanoid",
  },
  {
    name: "スケルトン",
    hp: 14,
    atk: 6,
    def: 3,
    exp: 18,
    speed: 1,
    tile: 9,
    kind: "undead",
  },
  {
    name: "ゾンビ",
    hp: 20,
    atk: 7,
    def: 2,
    exp: 22,
    speed: 0.5,
    tile: 10,
    kind: "undead",
  },
  {
    name: "オーク",
    hp: 18,
    atk: 8,
    def: 4,
    exp: 28,
    speed: 1,
    tile: 11,
    kind: "humanoid",
  },
  {
    name: "大蛇",
    hp: 22,
    atk: 9,
    def: 3,
    exp: 32,
    speed: 1,
    tile: 12,
    kind: "beast",
  },
  {
    name: "トロル",
    hp: 35,
    atk: 12,
    def: 5,
    exp: 50,
    speed: 0.8,
    tile: 13,
    kind: "humanoid",
  },
  {
    name: "ドラゴン",
    hp: 60,
    atk: 18,
    def: 8,
    exp: 100,
    speed: 1,
    tile: 14,
    kind: "dragon",
  },
  {
    name: "ヴァンパイア",
    hp: 45,
    atk: 14,
    def: 6,
    exp: 70,
    speed: 1.2,
    tile: 15,
    kind: "undead",
  },
  {
    name: "岩霊",
    hp: 22,
    atk: 8,
    def: 2,
    exp: 35,
    speed: 1,
    tile: 43,
    kind: "undead",
    wallWalker: true,
  },
];

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
    if (cx < 0 || cx >= MW || cy < 0 || cy >= MH) return false;
  }
}

/* ===== BFS PATHFINDING ===== */
export function bfsNext(map, mons, sx, sy, tx, ty, self, maxDist = 20, pentacles = null) {
  if (sx === tx && sy === ty) return null;
  const visited = new Set();
  visited.add(`${sx},${sy}`);
  const queue = [{ x: sx, y: sy, firstX: null, firstY: null }];
  const dirs = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  let steps = 0;
  while (queue.length > 0 && steps < maxDist * 50) {
    const cur = queue.shift();
    steps++;
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx,
        ny = cur.y + dy;
      if (nx < 0 || nx >= MW || ny < 0 || ny >= MH) continue;
      if (map[ny][nx] === T.WALL || map[ny][nx] === T.BWALL) continue;
      /* 聖域の魔方陣は通行不可（目標地点でなければ迂回） */
      if (pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === nx && pc.y === ny) &&
          !(nx === tx && ny === ty)) continue;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const fx = cur.firstX !== null ? cur.firstX : nx;
      const fy = cur.firstY !== null ? cur.firstY : ny;
      if (nx === tx && ny === ty) return { x: fx, y: fy };
      if (!mons.some((m) => m !== self && m.x === nx && m.y === ny)) {
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
    if (nx >= 0 && nx < MW && ny >= 0 && ny < MH && map[ny][nx] !== T.WALL && map[ny][nx] !== T.BWALL)
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
    if (nx < 0 || nx >= MW || ny < 0 || ny >= MH) continue;
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
    if (tx < 0 || tx >= MW || ty < 0 || ty >= MH || dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) {
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
        dg.monsters = dg.monsters.filter(o => o !== hitMon);
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
    const _rd = _cdirs[rng(0, _cdirs.length - 1)];
    const _cnx = m.x + _rd[0], _cny = m.y + _rd[1];
    if (_cnx >= 0 && _cnx < MW && _cny >= 0 && _cny < MH) {
      if (_cnx === pl.x && _cny === pl.y) {
        /* プレイヤーを攻撃 */
        const _cRooms = dg.rooms;
        const pdef = pl.def + (pl.armor?.def || 0) + (pl.armor?.plus || 0);
        let dmg = Math.max(1, m.atk - pdef + rng(-2, 2));
        const _cPlRoom = _cRooms && _cRooms.find(r => pl.x >= r.x && pl.x < r.x + r.w && pl.y >= r.y && pl.y < r.y + r.h);
        const _cVulnPc = _cPlRoom && dg.pentacles?.find(pc => pc.kind === "vulnerability" &&
          pc.x >= _cPlRoom.x && pc.x < _cPlRoom.x + _cPlRoom.w &&
          pc.y >= _cPlRoom.y && pc.y < _cPlRoom.y + _cPlRoom.h);
        if (_cVulnPc) dmg = _cVulnPc.cursed ? Math.max(1, Math.floor(dmg / 2)) : dmg * (_cVulnPc.blessed ? 4 : 2);
        pl.deathCause = `${m.name}の攻撃で`;
        pl.hp -= dmg;
        ml.push(`混乱した${m.name}の攻撃！${dmg}ダメージ！`);
        if (pl.armor?.ability === "thorn" && dmg > 0) {
          const td = Math.max(1, Math.floor(dmg / 3));
          m.hp -= td;
          ml.push(`反射で${m.name}に${td}ダメージ！`);
        }
        if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("衝撃で目が覚めた！"); }
        if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("衝撃で金縛りが解けた！"); }
      } else {
        const _other = dg.monsters.find(o => o !== m && o.x === _cnx && o.y === _cny);
        if (_other) {
          /* 他のモンスターを攻撃 */
          const _odmg = Math.max(1, m.atk - (_other.def || 0) + rng(-1, 1));
          _other.hp -= _odmg;
          ml.push(`混乱した${m.name}が${_other.name}を攻撃！${_odmg}ダメージ！`);
          if (_other.hp <= 0) {
            dg.monsters = dg.monsters.filter(o => o !== _other);
            ml.push(`${_other.name}は倒れた！`);
          }
        } else if (dg.map[_cny]?.[_cnx] !== T.WALL && dg.map[_cny]?.[_cnx] !== T.BWALL) {
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
      m.darkDir = _ddirs[rng(0, _ddirs.length - 1)];
    }
    const _dnx = m.x + m.darkDir[0], _dny = m.y + m.darkDir[1];
    if (_dnx >= 0 && _dnx < MW && _dny >= 0 && _dny < MH &&
        dg.map[_dny]?.[_dnx] !== T.WALL && dg.map[_dny]?.[_dnx] !== T.BWALL) {
      if (_dnx === pl.x && _dny === pl.y) {
        const _pdef = pl.def + (pl.armor?.def || 0) + (pl.armor?.plus || 0);
        const _ddmg = Math.max(1, m.atk - _pdef + rng(-2, 2));
        pl.deathCause = `${m.name}の攻撃で`;
        pl.hp -= _ddmg;
        ml.push(`暗闇の${m.name}が突進して攻撃！${_ddmg}ダメージ！`);
        if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("衝撃で目が覚めた！"); }
        if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("衝撃で金縛りが解けた！"); }
      } else {
        const _dother = dg.monsters.find(o => o !== m && o.x === _dnx && o.y === _dny);
        if (_dother) {
          const _dodmg = Math.max(1, m.atk - (_dother.def || 0) + rng(-1, 1));
          _dother.hp -= _dodmg;
          ml.push(`暗闇の${m.name}が${_dother.name}に突進！${_dodmg}ダメージ！`);
          if (_dother.hp <= 0) {
            dg.monsters = dg.monsters.filter(o => o !== _dother);
            ml.push(`${_dother.name}は倒れた！`);
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
      if (_fnx < 0 || _fnx >= MW || _fny < 0 || _fny >= MH) continue;
      if (dg.map[_fny]?.[_fnx] === T.WALL || dg.map[_fny]?.[_fnx] === T.BWALL) continue;
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
  if (m.posHistory.length > 10) m.posHistory.shift();
  let _forceAlt = false;
  if (m.posHistory.length >= 10) {
    const _ph = m.posHistory;
    /* パターン1: 10ターン全く同じ位置（完全停止） */
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
    if (m.state === "friendly") return;
    if (m.state === "blocking") {
      if (m.x !== m.blockPos.x || m.y !== m.blockPos.y) {
        m.x = m.blockPos.x;
        m.y = m.blockPos.y;
      }
      return;
    }
  }

  const map = dg.map,
    rooms = dg.rooms;
  const dist = Math.abs(pl.x - m.x) + Math.abs(pl.y - m.y);
  const canSee = (dg.visible?.[m.y]?.[m.x] ?? false) && hasLOS(map, m.x, m.y, pl.x, pl.y);

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
      const pdef = pl.def + (pl.armor?.def || 0) + (pl.armor?.plus || 0);
      let dmg = Math.max(1, m.atk - pdef + rng(-2, 2));
      const _wwRoom = findRoom(rooms, pl.x, pl.y);
      const _wwVulnPc = _wwRoom && dg.pentacles?.find(pc => pc.kind === "vulnerability" &&
        pc.x >= _wwRoom.x && pc.x < _wwRoom.x + _wwRoom.w &&
        pc.y >= _wwRoom.y && pc.y < _wwRoom.y + _wwRoom.h);
      if (_wwVulnPc) dmg = _wwVulnPc.cursed ? Math.max(1, Math.floor(dmg / 2)) : dmg * (_wwVulnPc.blessed ? 4 : 2);
      pl.deathCause = `${m.name}の攻撃で`;
      pl.hp -= dmg;
      const _wwInWall = dg.map[m.y]?.[m.x] === T.WALL;
      ml.push(_wwInWall
        ? `${m.name}が壁を突き抜けて攻撃！${dmg}ダメージ！`
        : `${m.name}の攻撃！${dmg}ダメージ！`);
      if (pl.armor?.ability === "thorn" && dmg > 0) {
        const td = Math.max(1, Math.floor(dmg / 3));
        m.hp -= td;
        ml.push(`反射で${m.name}に${td}ダメージ！`);
      }
      if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("衝撃で目が覚めた！"); }
      if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("衝撃で金縛りが解けた！"); }
      return;
    }
    /* 壁を無視してプレイヤーへ1歩直進 */
    const _wdx = Math.sign(pl.x - m.x), _wdy = Math.sign(pl.y - m.y);
    if (_wdx !== 0 || _wdy !== 0) {
      const _wnx = m.x + _wdx, _wny = m.y + _wdy;
      if (_wnx >= 0 && _wnx < MW && _wny >= 0 && _wny < MH &&
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

      if (m.subtype === "archer" && !m.sealed && inLine && lineLen >= 2 && lineLen <= 10) {
        monsterShootArrow(m, dg, pl, ml, opts);
        return;
      }

      if (m.subtype === "wanduser" && !m.sealed && inLine && lineLen >= 2 && lineLen <= 10 && opts.monsterWandFn) {
        const _wRoom = findRoom(rooms, m.x, m.y);
        const _wSeal = (dg.pentacles?.some(pc => pc.kind === "magic_seal" && pc.blessed)) ||
          (_wRoom && dg.pentacles?.some(pc =>
            pc.kind === "magic_seal" &&
            pc.x >= _wRoom.x && pc.x < _wRoom.x + _wRoom.w &&
            pc.y >= _wRoom.y && pc.y < _wRoom.y + _wRoom.h
          ));
        if (!_wSeal) {
          opts.monsterWandFn(m, Math.sign(adx), Math.sign(ady));
          return;
        }
        // 魔封じの部屋にいる場合は杖を使えず通常行動へフォールスルー
      }
    }

    const tx = canSee ? pl.x : m.lastPx;
    const ty = canSee ? pl.y : m.lastPy;

    /* adjacent attack */
    if (Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1 && canSee) {
      /* 聖域チェック：プレイヤーが聖域の上なら攻撃不可 */
      if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y)) return;
      const pdef = pl.def + (pl.armor?.def || 0) + (pl.armor?.plus || 0);
      let dmg = Math.max(1, m.atk - pdef + rng(-2, 2));
      /* 脆弱チェック：プレイヤーのいる部屋に脆弱の魔方陣があれば2倍（祝福は4倍） */
      const _adjPlRoom = findRoom(rooms, pl.x, pl.y);
      const _adjVulnPc = _adjPlRoom && dg.pentacles?.find(pc => pc.kind === "vulnerability" && pc.x >= _adjPlRoom.x && pc.x < _adjPlRoom.x + _adjPlRoom.w && pc.y >= _adjPlRoom.y && pc.y < _adjPlRoom.y + _adjPlRoom.h);
      if (_adjVulnPc) dmg = _adjVulnPc.cursed ? Math.max(1, Math.floor(dmg / 2)) : dmg * (_adjVulnPc.blessed ? 4 : 2);
      pl.deathCause = `${m.name}の攻撃で`;
      pl.hp -= dmg;
      ml.push(`${m.name}の攻撃！${dmg}ダメージ！`);
      if (pl.armor?.ability === "thorn" && dmg > 0) {
        const td = Math.max(1, Math.floor(dmg / 3));
        m.hp -= td;
        ml.push(`反射で${m.name}に${td}ダメージ！`);
      }
      if (pl.sleepTurns > 0) {
        pl.sleepTurns = 0;
        ml.push("衝撃で目が覚めた！");
      }
      if (pl.paralyzeTurns > 0) {
        pl.paralyzeTurns = 0;
        ml.push("衝撃で金縛りが解けた！");
      }
      return;
    }

    /* move toward target */
    /* BFSに聖域データを渡して経路探索の段階で回避させる */
    /* _forceAlt 時は他モンスターを障害物として扱わず迂回経路を優先する */
    const _bfsMons = _forceAlt ? [] : dg.monsters;
    const next = bfsNext(map, _bfsMons, m.x, m.y, tx, ty, m, 20, dg.pentacles);
    /* 念のため：次のタイルが聖域なら移動しない（BFSで迂回済みのはずだが保険） */
    if (next && dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === next.x && pc.y === next.y)) return;
    if (next) {
      if (next.x === pl.x && next.y === pl.y) {
        /* 聖域チェック：プレイヤーが聖域の上なら攻撃不可 */
        if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y)) return;
        m.dir = { x: next.x - m.x, y: next.y - m.y };
        const pdef = pl.def + (pl.armor?.def || 0) + (pl.armor?.plus || 0);
        let dmg = Math.max(1, m.atk - pdef + rng(-2, 2));
        /* 脆弱チェック：プレイヤーのいる部屋に脆弱の魔方陣があれば2倍（祝福は4倍） */
        const _mvPlRoom = findRoom(rooms, pl.x, pl.y);
        const _mvVulnPc = _mvPlRoom && dg.pentacles?.find(pc => pc.kind === "vulnerability" && pc.x >= _mvPlRoom.x && pc.x < _mvPlRoom.x + _mvPlRoom.w && pc.y >= _mvPlRoom.y && pc.y < _mvPlRoom.y + _mvPlRoom.h);
        if (_mvVulnPc) dmg = _mvVulnPc.cursed ? Math.max(1, Math.floor(dmg / 2)) : dmg * (_mvVulnPc.blessed ? 4 : 2);
        pl.deathCause = `${m.name}の攻撃で`;
        pl.hp -= dmg;
        ml.push(`${m.name}の攻撃！${dmg}ダメージ！`);
        if (pl.armor?.ability === "thorn" && dmg > 0) {
          const td = Math.max(1, Math.floor(dmg / 3));
          m.hp -= td;
          ml.push(`反射で${m.name}に${td}ダメージ！`);
        }
        if (pl.sleepTurns > 0) {
          pl.sleepTurns = 0;
          ml.push("衝撃で目が覚めた！");
        }
        if (pl.paralyzeTurns > 0) {
          pl.paralyzeTurns = 0;
          ml.push("衝撃で金縛りが解けた！");
        }
        return;
      }
      if (
        !dg.monsters.some((o) => o !== m && o.x === next.x && o.y === next.y)
      ) {
        m.dir = { x: next.x - m.x, y: next.y - m.y };
        m.x = next.x;
        m.y = next.y;
        if (_forceAlt) m.posHistory = [];
        return;
      }
    }
    /* _forceAlt フォールバック：隣接4方向をランダム順に試して空きタイルへ移動 */
    if (_forceAlt) {
      const _fd4 = [[0,-1],[0,1],[-1,0],[1,0]].sort(() => Math.random() - 0.5);
      for (const [_fdx, _fdy] of _fd4) {
        const _fnx = m.x + _fdx, _fny = m.y + _fdy;
        if (_fnx < 0 || _fnx >= MW || _fny < 0 || _fny >= MH) continue;
        if (map[_fny][_fnx] === T.WALL || map[_fny][_fnx] === T.BWALL) continue;
        if (_fnx === pl.x && _fny === pl.y) continue;
        if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _fnx && pc.y === _fny)) continue;
        if (dg.monsters.some(o => o !== m && o.x === _fnx && o.y === _fny)) continue;
        m.dir = { x: _fdx, y: _fdy };
        m.x = _fnx; m.y = _fny;
        m.posHistory = [];
        return;
      }
      m.posHistory = []; /* 完全に動けない場合もリセットして次ターン再試行 */
    }
  } else {
    /* patrol / wander */
    const room = findRoom(rooms, m.x, m.y);
    if (room) {
      /* pick patrol target */
      if (
        !m.patrolTarget ||
        (m.x === m.patrolTarget.x && m.y === m.patrolTarget.y) ||
        Math.random() < 0.02
      ) {
        const exits = [];
        for (let ex = room.x; ex < room.x + room.w; ex++) {
          if (room.y > 0 && map[room.y - 1][ex] !== T.WALL && map[room.y - 1][ex] !== T.BWALL)
            exits.push({ x: ex, y: room.y - 1 });
          if (room.y + room.h < MH && map[room.y + room.h][ex] !== T.WALL && map[room.y + room.h][ex] !== T.BWALL)
            exits.push({ x: ex, y: room.y + room.h });
        }
        for (let ey = room.y; ey < room.y + room.h; ey++) {
          if (room.x > 0 && map[ey][room.x - 1] !== T.WALL && map[ey][room.x - 1] !== T.BWALL)
            exits.push({ x: room.x - 1, y: ey });
          if (room.x + room.w < MW && map[ey][room.x + room.w] !== T.WALL && map[ey][room.x + room.w] !== T.BWALL)
            exits.push({ x: room.x + room.w, y: ey });
        }
        if (exits.length > 0) {
          const filtered = exits.filter(
            (e) => !(m.dir && e.x === m.x - m.dir.x && e.y === m.y - m.dir.y),
          );
          const pool = filtered.length > 0 ? filtered : exits;
          m.patrolTarget = pool[rng(0, pool.length - 1)];
        }
      }

      if (m.patrolTarget) {
        const dx = Math.sign(m.patrolTarget.x - m.x);
        const dy = Math.sign(m.patrolTarget.y - m.y);
        const nx = m.x + dx,
          ny = m.y + dy;
        if (
          nx >= 0 &&
          nx < MW &&
          ny >= 0 &&
          ny < MH &&
          map[ny][nx] !== T.WALL && map[ny][nx] !== T.BWALL &&
          !dg.monsters.some((o) => o !== m && o.x === nx && o.y === ny) &&
          !(nx === pl.x && ny === pl.y)
        ) {
          m.dir = { x: dx, y: dy };
          m.x = nx;
          m.y = ny;
          return;
        }
      }

      /* random step fallback */
      /* _forceAlt 時は全方向をシャッフルして必ず空きを探す（パトロール詰まり解消） */
      const _pDirs = [[0,1],[0,-1],[1,0],[-1,0]];
      const _pPool = _forceAlt
        ? [..._pDirs].sort(() => Math.random() - 0.5)
        : [_pDirs[rng(0, 3)]];
      for (const [rdx, rdy] of _pPool) {
        const nx = m.x + rdx, ny = m.y + rdy;
        if (
          map[ny]?.[nx] !== T.WALL && map[ny]?.[nx] !== T.BWALL &&
          !dg.monsters.some((o) => o !== m && o.x === nx && o.y === ny) &&
          !(nx === pl.x && ny === pl.y)
        ) {
          m.dir = { x: rdx, y: rdy };
          m.x = nx;
          m.y = ny;
          if (_forceAlt) { m.posHistory = []; m.patrolTarget = null; }
          break;
        }
      }
    } else {
      /* corridor wander */
      if (!m.dir) m.dir = { x: 1, y: 0 };
      const nx = m.x + m.dir.x,
        ny = m.y + m.dir.y;
      if (
        nx >= 0 &&
        nx < MW &&
        ny >= 0 &&
        ny < MH &&
        map[ny][nx] !== T.WALL && map[ny][nx] !== T.BWALL &&
        !dg.monsters.some((o) => o !== m && o.x === nx && o.y === ny) &&
        !(nx === pl.x && ny === pl.y)
      ) {
        m.x = nx;
        m.y = ny;
        return;
      }
      const open = getOpenDirs(map, m.x, m.y);
      const rev = { x: -m.dir.x, y: -m.dir.y };
      const nonRev = open.filter(
        (d) =>
          !(d.x === rev.x && d.y === rev.y) &&
          !(d.x === m.dir.x && d.y === m.dir.y),
      );
      let picked = null;
      if (nonRev.length > 0) {
        picked = nonRev[rng(0, nonRev.length - 1)];
      } else {
        const revOpt = open.find((d) => d.x === rev.x && d.y === rev.y);
        if (revOpt) picked = revOpt;
        else if (open.length > 0) picked = open[rng(0, open.length - 1)];
      }
      if (picked) {
        const px2 = m.x + picked.x,
          py2 = m.y + picked.y;
        if (
          !dg.monsters.some((o) => o !== m && o.x === px2 && o.y === py2) &&
          !(px2 === pl.x && py2 === pl.y)
        ) {
          m.dir = picked;
          m.x = px2;
          m.y = py2;
          if (_forceAlt) m.posHistory = [];
        } else if (_forceAlt) {
          /* 完全に動けない廊下詰まり：1ターン待機してリセット（往復を断ち切る） */
          m.posHistory = [];
        }
      } else if (_forceAlt) {
        m.posHistory = [];
      }
    }
  }
}
