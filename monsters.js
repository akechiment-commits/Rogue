import { rng, pick, uid, MW, MH, T, DRO, removeMonster, removeFloorItem, itemAt, clamp, findVulnPentacle, hasAbility, hasGravityPentacle, hasCursedGravityPentacle } from "./utils.js";
import { getFarcastMode, placeItemAt, makeStone, makeMagicStone, applyLightningToInventory, hasCursedExplosionPentacle, hasCursedTeleportPentacle, killMonster, doExplosion, fireTrapItem, cookFoodMeta, soakItemIntoSpring, TRAPS } from "./items.js";
import { pushMonsterBoltAnim } from "./animEvents.js";

/* ===== 火ダルマ：移動後に可燃アイテムを燃やす ===== */
function _fireDemonBurnItems(m, dg, ml) {
  const _items = dg.items.filter(it => it.x === m.x && it.y === m.y);
  const _toRemove = new Set();
  for (const it of _items) {
    if (it.type === "scroll" || it.type === "spellbook") {
      _toRemove.add(it);
      ml.push(`${m.name}が通った！「${it.name}」が燃えてなくなった！`);
    } else if (it.type === "food") {
      if (!it.cooked) {
        it.value = Math.floor((it.value || 10) * 2); cookFoodMeta(it);
        it.name = "焼いた" + it.name;
        ml.push(`${m.name}が通った！食料が焼けて「${it.name}」になった！`);
      } else {
        _toRemove.add(it);
        ml.push(`${m.name}が通った！「${it.name}」が燃えてなくなった！`);
      }
    }
  }
  if (_toRemove.size > 0) dg.items = dg.items.filter(it => !_toRemove.has(it));
}

/* ===== ゼラチンキューブ：移動後に床のアイテムを全て取り込む ===== */
function _gelCubeAbsorbItems(m, dg, ml) {
  const _onTile = dg.items.filter(it => it.x === m.x && it.y === m.y);
  if (_onTile.length === 0) return;
  m.heldItems = m.heldItems || [];
  for (const it of _onTile) {
    m.heldItems.push(it);
    ml.push(`${m.name}が「${it.name}」を取り込んだ！`);
  }
  dg.items = dg.items.filter(it => !(it.x === m.x && it.y === m.y));
}

/* ===== 境界・通行判定ヘルパー ===== */
function inBounds(x, y) { return x >= 0 && x < MW && y >= 0 && y < MH; }
function isWalkable(map, x, y) { return inBounds(x, y) && map[y][x] !== T.WALL && map[y][x] !== T.BWALL; }
/* 水タイルを考慮：浮遊(float)なら水上通行可 */
function canEnter(map, x, y, float = false) { return isWalkable(map, x, y) && (float || map[y]?.[x] !== T.WATER); }

/* ===== ドラゴン炎ブレス ===== */
function monsterDragonFire(m, dg, pl, ml, onPlayerHit) {
  /* 呪われた爆発の魔方陣がある場合は炎を打ち消す */
  if (hasCursedExplosionPentacle(dg)) {
    ml.push(`呪われた爆発の魔方陣が${m.name}の炎ブレスを打ち消した！`);
    return;
  }
  /* 射線上に別のモンスターがいれば、そこで止まって当てる（Lv3は壁貫通） */
  const _fLvl = m.monLevel || 1;
  const _fdx = Math.sign(pl.x - m.x), _fdy = Math.sign(pl.y - m.y);
  for (let _fi = 1; ; _fi++) {
    const _fx = m.x + _fdx * _fi, _fy = m.y + _fdy * _fi;
    if (_fx === pl.x && _fy === pl.y) break; // プレイヤーに到達→通常処理へ
    if (_fx < 0 || _fx >= MW || _fy < 0 || _fy >= MH) return; // 範囲外
    if (_fLvl < 3 && (dg.map[_fy]?.[_fx] === T.WALL || dg.map[_fy]?.[_fx] === T.BWALL)) return; // Lv1/2は壁で遮断
    const _fBlock = dg.monsters.find(o => o.x === _fx && o.y === _fy);
    if (_fBlock) {
      wakeIfDormant(_fBlock, ml);
      const _fDmgBase = Math.max(1, Math.floor(m.atk * m.atk / (m.atk + (_fBlock.def || 0))) + rng(-2, 2));
      /* 火ダルマは炎で回復 */
      if (_fBlock.baseKind === "firedemon") {
        const _fheal = Math.min(_fDmgBase, _fBlock.maxHp - _fBlock.hp);
        if (_fheal > 0) { _fBlock.hp += _fheal; ml.push(`${m.name}の炎ブレスが${_fBlock.name}に当たった！炎を吸収して回復した！(+${_fheal}HP)`); }
        else ml.push(`${m.name}の炎ブレスが${_fBlock.name}に当たった！しかし炎を吸収した！`);
        return;
      }
      /* 油まみれ */
      const _fOilyMult = (_fBlock.oilyTurns || 0) > 0 || dg.oilyTiles?.some(t => t.x === _fBlock.x && t.y === _fBlock.y) ? 2 : 1;
      const _fDmg = _fDmgBase * _fOilyMult;
      _fBlock.hp -= _fDmg;
      ml.push(`${m.name}の炎ブレスが${_fBlock.name}に命中！${_fDmg}ダメージ！${_fOilyMult > 1 ? "(油まみれ×2)" : ""}`);
      if (_fBlock.hp <= 0) killMonster(_fBlock, dg, pl, ml, null);
      return;
    }
  }
  /* プレイヤーに命中 */
  const pdef = pl.def + (pl.armor?.def || 0) + (pl.armor?.plus || 0) + (pl.rings || []).reduce((s, r) => r.effect === "defense_ring" ? s + (r.plus || 0) : s, 0);
  let dmg = Math.max(1, Math.floor(m.atk * m.atk / (m.atk + pdef)) + rng(-2, 2));
  /* 脆弱の魔方陣 */
  const _vulnPc = findVulnPentacle(dg, pl.x, pl.y);
  if (_vulnPc) dmg = _vulnPc.cursed ? Math.max(1, Math.floor(dmg / 2)) : dmg * (_vulnPc.blessed ? 4 : 2);
  /* 耐火装備 */
  const _hasFireR = hasAbility(pl.armor, "fire_resist");
  if (_hasFireR) dmg = Math.max(1, Math.floor(dmg / 2));
  /* 油まみれ */
  const _oilyMult = (pl.oilyTurns || 0) > 0 || dg.oilyTiles?.some(t => t.x === pl.x && t.y === pl.y) ? 2 : 1;
  if (_oilyMult > 1) dmg *= 2;
  pl.deathCause = `${m.name}の炎ブレスで`;
  pl.hp -= dmg;
  onPlayerHit?.(dmg, m);
  ml.push(`${m.name}が炎ブレスを吐いた！${dmg}ダメージ！${_hasFireR ? "(耐火半減)" : ""}${_oilyMult > 1 ? "(油まみれ×2)" : ""}`);
  if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("熱さで目が覚めた！"); }
  if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("熱さで金縛りが解けた！"); }
  if (!_hasFireR) applyLightningToInventory(pl, dg, ml, null, null, true);
}

/* ===== モンスター近接攻撃ヘルパー ===== */
function monsterAttackPlayer(m, dg, pl, ml, msgFn, { skipVuln = false, skipThorn = false, onPlayerHit, onPlayerMiss } = {}) {
  /* dodge: 25% 完全回避 */
  if (hasAbility(pl.armor, "dodge") && Math.random() < 0.25) {
    ml.push(`${m.name}の攻撃をひらりとかわした！`);
    onPlayerMiss?.(m);
    return;
  }
  /* 12% ミス */
  if (Math.random() >= 0.88) {
    ml.push(`${m.name}の攻撃は外れた！`);
    onPlayerMiss?.(m);
    return;
  }
  const pdef = pl.def + (pl.armor?.def || 0) + (pl.armor?.plus || 0) + (pl.rings || []).reduce((s, r) => r.effect === "defense_ring" ? s + (r.plus || 0) : s, 0);
  let dmg = Math.max(1, Math.floor(m.atk * m.atk / (m.atk + pdef)) + rng(-2, 2));
  if (!skipVuln) {
    const vulnPc = findVulnPentacle(dg, pl.x, pl.y);
    if (vulnPc) dmg = vulnPc.cursed ? Math.max(1, Math.floor(dmg / 2)) : dmg * (vulnPc.blessed ? 4 : 2);
  }
  pl.deathCause = `${m.name}の攻撃で`;
  pl.hp -= dmg;
  onPlayerHit?.(dmg, m);
  ml.push(msgFn(dmg));
  if (!skipThorn && pl.armor?.ability === "thorn" && dmg > 0) {
    const td = Math.max(1, Math.floor(dmg / 3));
    m.hp -= td;
    ml.push(`反射で${m.name}に${td}ダメージ！`);
  }
  if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("衝撃で目が覚めた！"); }
  if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("衝撃で金縛りが解けた！"); }
  /* 火ダルマ：炎属性攻撃 — 所持品への火ダメ＋油まみれボーナス */
  if (m.baseKind === "firedemon" && dmg > 0) {
    const _hasFireR = hasAbility(pl.armor, "fire_resist");
    if (!_hasFireR) applyLightningToInventory(pl, dg, ml, null, null, true);
    const _oilyMult = (pl.oilyTurns || 0) > 0 || dg.oilyTiles?.some(t => t.x === pl.x && t.y === pl.y) ? 2 : 1;
    if (_oilyMult > 1) {
      const _bonusDmg = Math.max(1, Math.floor(dmg * 0.5));
      pl.hp -= _bonusDmg;
      ml.push(`油まみれに炎が燃え移った！${_bonusDmg}ダメージ！`);
    }
  }
  /* 吹き飛ばしの魔方陣：近接攻撃を受けたプレイヤーを吹き飛ばす */
  if (dg.pentacles?.length > 0 && dmg > 0) {
    const _plRoom = findRoom(dg.rooms, pl.x, pl.y);
    const _kbPc = _plRoom && dg.pentacles.find(pc =>
      pc.kind === "knockback_aura" && findRoom(dg.rooms, pc.x, pc.y) === _plRoom);
    if (_kbPc) {
      const _kdx = Math.sign(pl.x - m.x), _kdy = Math.sign(pl.y - m.y);
      if (_kdx !== 0 || _kdy !== 0) {
        const _dist = _kbPc.cursed ? 1 : _kbPc.blessed ? 99 : 5;
        let _cx2 = pl.x, _cy2 = pl.y;
        let _moved = 0;
        for (let _ki = 0; _ki < _dist; _ki++) {
          const _nx = _cx2 + _kdx, _ny = _cy2 + _kdy;
          if (_nx < 0 || _nx >= MW || _ny < 0 || _ny >= MH || dg.map[_ny][_nx] === T.WALL || dg.map[_ny][_nx] === T.BWALL) {
            pl.deathCause = "吹き飛ばされての壁への激突により"; pl.hp -= 5; ml.push("壁に叩きつけられた！5ダメージ！");
            break;
          }
          if (dg.monsters.some(mon2 => mon2 !== m && mon2.x === _nx && mon2.y === _ny)) {
            pl.deathCause = "吹き飛ばされてモンスターへの衝突により"; pl.hp -= 5; ml.push("モンスターに激突した！5ダメージ！");
            break;
          }
          _cx2 = _nx; _cy2 = _ny; _moved++;
        }
        if (_moved > 0) { pl.x = _cx2; pl.y = _cy2; ml.push(`${_kbPc.name}の力で${_moved}マス吹き飛ばされた！`); }
      }
    }
  }
}

/* ===== MONSTER DEFINITIONS ===== */
/*
 * ────────────────────────────────────────────────────────────────
 * 新しい敵を追加する手順:
 *   1. MONS配列に新しいエントリを追加（出現階層順で挿入）
 *      必須: name, hp, atk, def, exp, speed, tile, kind, baseKind, monLevel:1
 *      特殊: float, wallWalker, maxAttacks, subtype, wandEffect
 *        subtype の選択肢: "archer" | "stonethrow" | "wanduser" | "supporter"
 *                         | "thief" | "runner" (特殊AIが必要なら monsterAI に追記)
 *        wandEffect: subtype:"wanduser" のとき使う杖エフェクト名
 *   2. 同じエントリの levels: [...] にLv2・Lv3のテンプレートを記述
 *      (省略するとレベルアップ不可)
 *   3. 特殊AIが必要なら monsterAI() の subtype 判定ブロックに追加
 * ────────────────────────────────────────────────────────────────
 */
/* ── MONS配列の順番 = 出現階層（index N → N+1階から出現可能）── */
export const MONS = [
  /* 0: 1階〜 */
  { name: "ネズミ",       hp: 5,   atk: 3,  def: 0,  exp: 3,   speed: 1,   tile: 6,  kind: "beast",    baseKind: "rat",        monLevel: 1,
    levels: [
      { name: "強ネズミ",         hp: 8,   atk: 4,  def: 2,  exp: 5   },
      { name: "覇ネズミ",         hp: 13,  atk: 5,  def: 4,  exp: 8   },
    ],
  },
  /* 1: 2階〜 */
  { name: "コボルド",     hp: 10,  atk: 5,  def: 1,  exp: 8,   speed: 1,   tile: 7,  kind: "humanoid", baseKind: "kobold",     monLevel: 1,
    levels: [
      { name: "コボルド戦士",     hp: 16,  atk: 7,  def: 3,  exp: 13  },
      { name: "コボルド族長",     hp: 25,  atk: 9,  def: 6,  exp: 20  },
    ],
  },
  /* 2: 3階〜 */
  { name: "ゴブリン",     hp: 12,  atk: 6,  def: 1,  exp: 12,  speed: 1,   tile: 8,  kind: "humanoid", baseKind: "goblin",     monLevel: 1,
    levels: [
      { name: "ゴブリン頭",       hp: 19,  atk: 8,  def: 4,  exp: 19  },
      { name: "ゴブリン王",       hp: 30,  atk: 11, def: 7,  exp: 30  },
    ],
  },
  /* 3: 4階〜 速攻型 */
  { name: "インプ",       hp: 14,  atk: 7,  def: 1,  exp: 20,  speed: 2,   tile: 53, kind: "beast",    baseKind: "imp",        monLevel: 1, float: true,
    levels: [
      { name: "強インプ",         hp: 22,  atk: 10, def: 3,  exp: 32  },
      { name: "覇インプ",         hp: 35,  atk: 13, def: 6,  exp: 50  },
    ],
  },
  /* 4: 5階〜 */
  { name: "スケルトン",   hp: 18,  atk: 8,  def: 3,  exp: 22,  speed: 1,   tile: 9,  kind: "undead",   baseKind: "skeleton",   monLevel: 1,
    levels: [
      { name: "強スケルトン",     hp: 29,  atk: 11, def: 6,  exp: 35  },
      { name: "アンデッドナイト", hp: 45,  atk: 14, def: 9,  exp: 55  },
    ],
  },
  /* 5: 6階〜 鈍足・硬め */
  { name: "ゾンビ",       hp: 25,  atk: 9,  def: 2,  exp: 28,  speed: 0.5, tile: 10, kind: "undead",   baseKind: "zombie",     monLevel: 1,
    levels: [
      { name: "強ゾンビ",         hp: 40,  atk: 13, def: 5,  exp: 45  },
      { name: "屍鬼",             hp: 63,  atk: 16, def: 8,  exp: 70  },
    ],
  },
  /* 5.6: 7階〜 分裂スライム */
  { name: "分裂スライム", hp: 22,  atk: 8,  def: 1,  exp: 32,  speed: 1,   tile: 77, kind: "beast",    baseKind: "slime",      monLevel: 1, subtype: "splitter",
    levels: [
      { name: "強スライム",       hp: 35,  atk: 12, def: 3,  exp: 51  },
      { name: "覇スライム",       hp: 55,  atk: 16, def: 5,  exp: 80  },
    ],
  },
  /* 6.5: 7階〜 HPが一桁になると次ターンに爆発 */
  { name: "ボムスライム", hp: 28,  atk: 8,  def: 1,  exp: 55,  speed: 1,   tile: 77, kind: "beast",    baseKind: "bombslime",  monLevel: 1, subtype: "deathbomb",
    levels: [
      { name: "強ボムスライム",   hp: 45,  atk: 12, def: 2,  exp: 88  },
      { name: "覇ボムスライム",   hp: 70,  atk: 16, def: 3,  exp: 138 },
    ],
  },
  /* 5.5: 6階〜 石投げ */
  { name: "ワッカ",       hp: 18,  atk: 9,  def: 1,  exp: 28,  speed: 1,   tile: 67, kind: "beast",    baseKind: "wokka",      monLevel: 1, subtype: "stonethrow",
    levels: [
      { name: "強ワッカ",         hp: 28,  atk: 13, def: 3,  exp: 45  },
      { name: "覇ワッカ",         hp: 45,  atk: 18, def: 5,  exp: 72  },
    ],
  },
  /* 6: 7階〜 遠距離 */
  { name: "アーチャー",   hp: 22,  atk: 10, def: 2,  exp: 34,  speed: 1,   tile: 39, kind: "humanoid", baseKind: "archer",     monLevel: 1, subtype: "archer",
    levels: [
      { name: "古参アーチャー",   hp: 35,  atk: 14, def: 5,  exp: 54  },
      { name: "弓の達人",         hp: 55,  atk: 18, def: 8,  exp: 85  },
    ],
  },
  /* 7: 8階〜 速攻獣 */
  { name: "ウルフ",       hp: 20,  atk: 11, def: 1,  exp: 40,  speed: 2,   tile: 56, kind: "beast",    baseKind: "wolf",       monLevel: 1,
    levels: [
      { name: "強ウルフ",         hp: 32,  atk: 15, def: 4,  exp: 64  },
      { name: "フェンリル",       hp: 50,  atk: 20, def: 7,  exp: 100 },
    ],
  },
  /* 8.5: 10階〜 隣接すると自爆 */
  { name: "爆弾ゴブリン", hp: 1,   atk: 8,  def: 0,  exp: 60,  speed: 2,   tile: 8,  kind: "humanoid", baseKind: "bombgoblin", monLevel: 1, subtype: "kamikaze",
    levels: [
      { name: "強爆弾ゴブリン",   hp: 1,   atk: 12, def: 0,  exp: 96  },
      { name: "自爆狂",           hp: 1,   atk: 16, def: 0,  exp: 150 },
    ],
  },
  /* 7.5: 8階〜 盗みモンスター */
  { name: "コソドロ",     hp: 12,  atk: 4,  def: 0,  exp: 35,  speed: 2,   tile: 69, kind: "humanoid", baseKind: "thief",      monLevel: 1, subtype: "thief",
    levels: [
      { name: "大盗賊",           hp: 20,  atk: 6,  def: 1,  exp: 56  },
      { name: "怪盗",             hp: 32,  atk: 8,  def: 2,  exp: 88  },
    ],
  },
  /* 7.6: 5階〜 逃げるボーナスモンスター */
  { name: "コロポックル", hp: 8,   atk: 0,  def: 0,  exp: 50,  speed: 2,   tile: 70, kind: "beast",    baseKind: "runner",     monLevel: 1, subtype: "runner",
    levels: [
      { name: "大コロポックル",   hp: 12,  atk: 0,  def: 0,  exp: 80  },
      { name: "精霊コロポックル", hp: 18,  atk: 0,  def: 0,  exp: 120 },
    ],
  },
  /* 7.7: 9階〜 錆び虫 */
  { name: "錆虫",         hp: 18,  atk: 7,  def: 1,  exp: 40,  speed: 1,   tile: 75, kind: "beast",    baseKind: "rustbug",    monLevel: 1, subtype: "ruster",
    levels: [
      { name: "強錆虫",           hp: 29,  atk: 10, def: 3,  exp: 64  },
      { name: "覇錆虫",           hp: 45,  atk: 14, def: 5,  exp: 100 },
    ],
  },
  /* 7.8: 10階〜 固定ダメージ以外1ダメ */
  { name: "水晶スライム", hp: 4,   atk: 10, def: 0,  exp: 50,  speed: 1,   tile: 77, kind: "beast",    baseKind: "crystalslime", monLevel: 1, fixedDamageOnly: true,
    levels: [
      { name: "強水晶スライム",   hp: 6,   atk: 14, def: 0,  exp: 80  },
      { name: "覇水晶スライム",   hp: 8,   atk: 18, def: 0,  exp: 125 },
    ],
  },
  /* 8: 9階〜 杖使い */
  { name: "ウィザード",   hp: 18,  atk: 9,  def: 2,  exp: 42,  speed: 1,   tile: 40, kind: "humanoid", baseKind: "wizard",     monLevel: 1, subtype: "wanduser", wandEffect: "lightning",
    levels: [
      { name: "強ウィザード",     hp: 29,  atk: 13, def: 5,  exp: 67  },
      { name: "大魔導士",         hp: 45,  atk: 16, def: 8,  exp: 105 },
    ],
  },
  /* 9: 10階〜 壁歩き (固定スポーンは3階〜) */
  { name: "岩霊",         hp: 28,  atk: 10, def: 3,  exp: 45,  speed: 1,   tile: 68, kind: "undead",   baseKind: "rockspirit", monLevel: 1, wallWalker: true,
    levels: [
      { name: "強岩霊",           hp: 45,  atk: 14, def: 6,  exp: 72  },
      { name: "岩の王",           hp: 70,  atk: 18, def: 9,  exp: 113 },
    ],
  },
  /* 9.5: 11階〜 壁掘り */
  { name: "岩砕き",       hp: 50,  atk: 15, def: 5,  exp: 65,  speed: 0.5, tile: 76, kind: "beast",    baseKind: "walldigger", monLevel: 1, wallDigger: true,
    levels: [
      { name: "強岩砕き",         hp: 80,  atk: 21, def: 8,  exp: 104 },
      { name: "覇岩砕き",         hp: 125, atk: 28, def: 11, exp: 163 },
    ],
  },
  /* 9.8: 11階〜 ゼラチンキューブ */
  { name: "ゼラチンキューブ", hp: 60, atk: 12, def: 3,  exp: 70,  speed: 0.5, tile: 79, kind: "beast", baseKind: "gelcube", monLevel: 1,
    levels: [
      { name: "強ゼラチンキューブ", hp: 96,  atk: 17, def: 6,  exp: 112 },
      { name: "覇ゼラチンキューブ", hp: 150, atk: 22, def: 9,  exp: 175 },
    ],
  },
  /* 10: 11階〜 */
  { name: "オーク",       hp: 30,  atk: 12, def: 5,  exp: 48,  speed: 1,   tile: 11, kind: "humanoid", baseKind: "orc",        monLevel: 1,
    levels: [
      { name: "オーク将",         hp: 48,  atk: 17, def: 8,  exp: 77  },
      { name: "オーク王",         hp: 75,  atk: 22, def: 11, exp: 120 },
    ],
  },
  /* 10.5: 11階〜 罠師 */
  { name: "罠師",         hp: 25,  atk: 10, def: 2,  exp: 48,  speed: 1,   tile: 86, kind: "humanoid", baseKind: "trapmaster", monLevel: 1, subtype: "trapmaster",
    levels: [
      { name: "罠の達人",         hp: 40,  atk: 14, def: 5,  exp: 77  },
      { name: "罠の覇者",         hp: 63,  atk: 18, def: 8,  exp: 120 },
    ],
  },
  /* 10.6: 12階〜 発見済み罠に放り投げる */
  { name: "罠猟師",       hp: 28,  atk: 11, def: 3,  exp: 55,  speed: 1,   tile: 87, kind: "humanoid", baseKind: "trapthrower", monLevel: 1, subtype: "trapthrower",
    levels: [
      { name: "罠猟師長",         hp: 45,  atk: 15, def: 6,  exp: 88  },
      { name: "罠猟師頭",         hp: 70,  atk: 20, def: 9,  exp: 138 },
    ],
  },
  /* 10.7: 13階〜 隣接する敵をプレイヤーの隣に投げる */
  { name: "投擲士",       hp: 32,  atk: 12, def: 4,  exp: 62,  speed: 1,   tile: 88, kind: "humanoid", baseKind: "monsterthrow", monLevel: 1, subtype: "monsterthrow",
    levels: [
      { name: "強投擲士",         hp: 51,  atk: 17, def: 7,  exp: 99  },
      { name: "覇投擲士",         hp: 80,  atk: 22, def: 10, exp: 155 },
    ],
  },
  /* 11: 12階〜 */
  { name: "大蛇",         hp: 35,  atk: 13, def: 3,  exp: 52,  speed: 1,   tile: 12, kind: "beast",    baseKind: "serpent",    monLevel: 1, maxAttacks: 2,
    levels: [
      { name: "強大蛇",           hp: 56,  atk: 18, def: 6,  exp: 83  },
      { name: "覇大蛇",           hp: 88,  atk: 23, def: 9,  exp: 130 },
    ],
  },
  /* 12: 13階〜 呪い杖 (固定スポーンは2階〜) */
  { name: "呪術師",       hp: 25,  atk: 9,  def: 3,  exp: 55,  speed: 1,   tile: 44, kind: "humanoid", baseKind: "witchdoc",   monLevel: 1, subtype: "wanduser", wandEffect: "curse_wand",
    levels: [
      { name: "強呪術師",         hp: 40,  atk: 13, def: 6,  exp: 88  },
      { name: "大呪術師",         hp: 63,  atk: 16, def: 9,  exp: 138 },
    ],
  },
  /* 13: 14階〜 サポーター */
  { name: "シャーマン",   hp: 30,  atk: 9,  def: 3,  exp: 60,  speed: 1,   tile: 55, kind: "humanoid", baseKind: "shaman",     monLevel: 1, subtype: "supporter",
    levels: [
      { name: "強シャーマン",     hp: 48,  atk: 13, def: 6,  exp: 96  },
      { name: "大シャーマン",     hp: 75,  atk: 16, def: 9,  exp: 150 },
    ],
  },
  /* 13.5: 15階〜 バリア（近接以外を一回無効） */
  { name: "バリア術師",   hp: 32,  atk: 11, def: 2,  exp: 68,  speed: 1,   tile: 40, kind: "humanoid", baseKind: "barriermage",  monLevel: 1, barrier: 1,
    levels: [
      { name: "強バリア術師",     hp: 51,  atk: 15, def: 4,  exp: 109, barrier: 2 },
      { name: "結界師",           hp: 80,  atk: 20, def: 6,  exp: 170, barrier: 3 },
    ],
  },
  /* 13.6: 16階〜 引き寄せ */
  { name: "引きダコ",     hp: 45,  atk: 13, def: 4,  exp: 75,  speed: 1,   tile: 78, kind: "beast",    baseKind: "puller",       monLevel: 1, subtype: "puller",
    levels: [
      { name: "強引きダコ",       hp: 72,  atk: 18, def: 7,  exp: 120 },
      { name: "覇引きダコ",       hp: 113, atk: 24, def: 10, exp: 188 },
    ],
  },
  /* 13.6: 15階〜 合成モンスター（投げたアイテムを飲み込んで合成、飲むたびに加速） */
  { name: "合成獣",       hp: 40,  atk: 11, def: 3,  exp: 80,  speed: 0.5, tile: 80, kind: "beast",    baseKind: "synthmonster", monLevel: 1,
    levels: [
      { name: "強合成獣",         hp: 64,  atk: 16, def: 6,  exp: 128 },
      { name: "覇合成獣",         hp: 100, atk: 21, def: 9,  exp: 200 },
    ],
  },
  /* 14: 15階〜 吹き飛ばし杖 */
  { name: "ウィンドメイジ", hp: 28, atk: 11, def: 3, exp: 65,  speed: 1,   tile: 54, kind: "humanoid", baseKind: "windmage",   monLevel: 1, subtype: "wanduser", wandEffect: "blowback_wand",
    levels: [
      { name: "強ウィンドメイジ", hp: 45,  atk: 15, def: 6,  exp: 104 },
      { name: "風の覇者",         hp: 70,  atk: 20, def: 9,  exp: 163 },
    ],
  },
  /* 14.2: 混乱の杖を振る術師 */
  { name: "混乱術師",   hp: 30,  atk: 11, def: 3,  exp: 72,  speed: 1,   tile: 81, kind: "humanoid", baseKind: "confusemage", monLevel: 1, subtype: "wanduser", wandEffect: "confuse_wand",
    levels: [
      { name: "強混乱術師",       hp: 48,  atk: 15, def: 6,  exp: 115 },
      { name: "大混乱術師",       hp: 75,  atk: 19, def: 9,  exp: 180 },
    ],
  },
  /* 14.3: 眠りの杖を振る術師 */
  { name: "眠り術師",   hp: 32,  atk: 12, def: 4,  exp: 80,  speed: 1,   tile: 82, kind: "humanoid", baseKind: "sleepmage",  monLevel: 1, subtype: "wanduser", wandEffect: "sleep_wand",
    levels: [
      { name: "強眠り術師",       hp: 51,  atk: 16, def: 7,  exp: 128 },
      { name: "大眠り術師",       hp: 80,  atk: 20, def: 11, exp: 200 },
    ],
  },
  /* 14.4: テレポートの杖を振る術師 */
  { name: "転移術師",   hp: 35,  atk: 13, def: 4,  exp: 90,  speed: 1,   tile: 83, kind: "humanoid", baseKind: "warpmage",   monLevel: 1, subtype: "wanduser", wandEffect: "teleport_wand",
    levels: [
      { name: "強転移術師",       hp: 56,  atk: 17, def: 7,  exp: 144 },
      { name: "大転移術師",       hp: 87,  atk: 21, def: 11, exp: 225 },
    ],
  },
  /* 14.5: 15階〜 炎モンスター */
  { name: "火ダルマ",     hp: 55,  atk: 20, def: 4,  exp: 110, speed: 1,   tile: 61, kind: "beast",    baseKind: "firedemon",  monLevel: 1, float: true,
    levels: [
      { name: "強火ダルマ",       hp: 88,  atk: 28, def: 7,  exp: 176 },
      { name: "炎の悪魔",         hp: 140, atk: 37, def: 10, exp: 275 },
    ],
  },
  /* 15: 16階〜 */
  { name: "トロル",       hp: 50,  atk: 16, def: 6,  exp: 75,  speed: 1,   tile: 13, kind: "humanoid", baseKind: "troll",      monLevel: 1,
    levels: [
      { name: "強トロル",         hp: 80,  atk: 22, def: 9,  exp: 120 },
      { name: "覇トロル",         hp: 125, atk: 29, def: 12, exp: 188 },
    ],
  },
  /* 16: 17階〜 鈍足・超硬 */
  { name: "ガーゴイル",   hp: 65,  atk: 18, def: 11, exp: 90,  speed: 0.5, tile: 52, kind: "beast",    baseKind: "gargoyle",   monLevel: 1, float: true,
    levels: [
      { name: "強ガーゴイル",     hp: 104, atk: 25, def: 15, exp: 144 },
      { name: "覇ガーゴイル",     hp: 163, atk: 32, def: 19, exp: 225 },
    ],
  },
  /* 17: 18階〜 速攻不死 */
  { name: "ヴァンパイア", hp: 60,  atk: 18, def: 7,  exp: 92,  speed: 2,   tile: 15, kind: "undead",   baseKind: "vampire",    monLevel: 1, maxAttacks: 2, float: true,
    levels: [
      { name: "強ヴァンパイア",   hp: 96,  atk: 25, def: 10, exp: 147 },
      { name: "ヴァンパイア卿",   hp: 150, atk: 32, def: 13, exp: 230 },
    ],
  },
  /* 18: 19階〜 */
  { name: "ドラゴン",     hp: 90,  atk: 24, def: 10, exp: 140, speed: 1,   tile: 14, kind: "dragon",   baseKind: "dragon",     monLevel: 1,
    levels: [
      { name: "強ドラゴン",       hp: 144, atk: 34, def: 13, exp: 224 },
      { name: "古龍",             hp: 225, atk: 43, def: 16, exp: 350 },
    ],
  },
  /* 19: 20階〜 鈍足・超DEF */
  { name: "ゴーレム",     hp: 100, atk: 20, def: 16, exp: 115, speed: 0.5, tile: 57, kind: "beast",    baseKind: "golem",      monLevel: 1,
    levels: [
      { name: "強ゴーレム",       hp: 160, atk: 28, def: 20, exp: 184 },
      { name: "覇ゴーレム",       hp: 250, atk: 36, def: 24, exp: 288 },
    ],
  },
  /* 20: 21階〜 高ATK速攻 */
  { name: "デーモン",     hp: 80,  atk: 28, def: 9,  exp: 160, speed: 2,   tile: 58, kind: "beast",    baseKind: "daemon",     monLevel: 1, maxAttacks: 3, float: true,
    levels: [
      { name: "強デーモン",       hp: 128, atk: 39, def: 13, exp: 256 },
      { name: "魔王",             hp: 200, atk: 50, def: 17, exp: 400 },
    ],
  },
];

/* ===== モンスターレベルアップテーブル (MONS の levels から自動生成) ===== */
/* MON_LEVELS[baseKind][0] = Lv2テンプレ, [1] = Lv3テンプレ (名前・HP・ATK・DEF・EXPのみ変更) */
/* ※ 直接編集せず、MONS 側の levels を修正すること */
export const MON_LEVELS = Object.fromEntries(
  MONS.filter(m => m.levels?.length).map(m => [m.baseKind, m.levels]));

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
  if (template.barrier !== undefined) mon.barrier = template.barrier;
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
  return { ...GUARD_TEMPLATE, id: uid(), x, y, maxHp: GUARD_TEMPLATE.hp, baseSpeed: GUARD_TEMPLATE.speed || 1, type: "guard",
    turnAccum: 0, aware: true, dir: { x: 0, y: 0 }, lastPx: plx, lastPy: ply, patrolTarget: null };
}

/* ===== モンスター生成ヘルパー ===== */
/** ランダムにモンスター1体を生成してオブジェクトを返す */
export function makeMonster(depth, x, y, { aware = false, lastPx = 0, lastPy = 0, immediateAct = false } = {}) {
  const { levels: _lvls, ...mt } = MONS[clamp(rng(0, depth), 0, MONS.length - 1)];
  return { ...mt, id: uid(), x, y, maxHp: mt.hp, baseSpeed: mt.speed || 1, turnAccum: immediateAct ? -(mt.speed || 1) : 0, aware, dir: { x: 0, y: 0 }, lastPx, lastPy, patrolTarget: null };
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
    if (!dg.rooms?.length) break;
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
export function bfsNext(map, mons, sx, sy, tx, ty, self, maxDist = 20, pentacles = null, float = false) {
  if (sx === tx && sy === ty) return null;
  /* モンスター位置と聖域位置をSetに変換 (O(1)ルックアップ) */
  const monSet = new Set();
  for (const m of mons) { if (m !== self) monSet.add(m.x + m.y * MW); }
  const sanctSet = new Set();
  if (pentacles) for (const pc of pentacles) { if (pc.kind === "sanctuary") sanctSet.add(pc.x + pc.y * MW); }
  const visited = new Set();
  visited.add(sx + sy * MW);
  const queue = [{ x: sx, y: sy, firstX: null, firstY: null }];
  let qHead = 0;
  const _sdx = Math.sign(tx - sx), _sdy = Math.sign(ty - sy);
  const dirs = [
    [0, -1], [0, 1], [-1, 0], [1, 0],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ];
  /* ターゲット方向に最も近い向きを先頭に：同コスト経路のタイブレーカー */
  dirs.sort((a, b) =>
    ((a[0]-_sdx)**2 + (a[1]-_sdy)**2) - ((b[0]-_sdx)**2 + (b[1]-_sdy)**2)
  );
  let steps = 0;
  while (qHead < queue.length && steps < maxDist * 50) {
    const cur = queue[qHead++];
    steps++;
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!canEnter(map, nx, ny, float)) continue;
      /* 対角移動：両隣の直交タイルが両方とも壁ならコーナーすり抜けを禁止 */
      if (dx !== 0 && dy !== 0) {
        if (!canEnter(map, cur.x + dx, cur.y, float) && !canEnter(map, cur.x, cur.y + dy, float)) continue;
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

export function getOpenDirs(map, x, y, float = false) {
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
    if (canEnter(map, nx, ny, float))
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

/* 落下位置が泉なら泉に落とし、そうでなければ床に置く */
function _monDropWithSpring(pos, item, dg, ml) {
  const spr = dg.springs?.find(s => s.x === pos.x && s.y === pos.y);
  if (spr) { soakItemIntoSpring(spr, { ...item, x: pos.x, y: pos.y }, ml, dg, it => it.name); }
  else { dg.items.push({ ...item, x: pos.x, y: pos.y }); }
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
  pushMonsterBoltAnim(m.x, m.y, dx, dy, dg, pl, "#d0a050");
  let lx = m.x, ly = m.y;
  let _plHit = false;
  for (let d = 1; d <= _travelMax; d++) {
    const tx = m.x + dx * d, ty = m.y + dy * d;
    if (!isWalkable(dg.map, tx, ty)) {
      /* arrow hits wall — drop at last valid position (avoid pentacle) */
      const _wd = safeArrowDrop(lx, ly, dg);
      _monDropWithSpring(_wd, { name:"矢", type:"arrow", atk:4, desc:"99本まで束にできる矢。", count:1, tile:23, id:uid() }, dg, ml);
      return;
    }
    if (tx === pl.x && ty === pl.y && !_plHit) {
      /* 祝福された聖域の魔方陣のみ矢を防ぐ（通常聖域は近接のみ） */
      const _arSanc = dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y);
      if (miss || _arSanc) {
        const _ad = safeArrowDrop(_arSanc ? lx : pl.x, _arSanc ? ly : pl.y, dg);
        _monDropWithSpring(_ad, { name:"矢", type:"arrow", atk:4, desc:"99本まで束にできる矢。", count:1, tile:23, id:uid() }, dg, ml);
        if (_arSanc) ml.push(`${m.name}の矢は祝福された聖域の加護に阻まれた！矢が落ちた。`);
        else ml.push(`${m.name}の矢は外れた！矢が落ちた。`);
        const trap = dg.traps?.find(t => t.x === pl.x && t.y === pl.y);
        if (trap && opts.fireTrapFn) opts.fireTrapFn(trap, pl, dg, ml);
        if (!_isFc) return;
      } else {
        let dmg = Math.max(1, m.atk + rng(-2, 2));
        const _arVulnPc = findVulnPentacle(dg, pl.x, pl.y);
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
  _monDropWithSpring(_fd, { name:"矢", type:"arrow", atk:4, desc:"99本まで束にできる矢。", count:1, tile:23, id:uid() }, dg, ml);
}

/* ===== MONSTER STONE THROW (ワッカ) ===== */
function monsterThrowStone(m, dg, pl, ml) {
  const lvl = m.monLevel || 1;
  const isMagic = lvl >= 3;
  const hitChance = lvl >= 3 ? 0.99 : lvl >= 2 ? 0.90 : 0.75;
  const stoneName = isMagic ? "魔法の石" : "石";
  ml.push(`${m.name}が${stoneName}を投げた！`);
  pushMonsterBoltAnim(m.x, m.y, Math.sign(pl.x - m.x), Math.sign(pl.y - m.y), dg, pl, isMagic ? "#cc88ff" : "#aaaaaa");

  /* みかわし（防具の効果） */
  const dodged = hasAbility(pl.armor, "dodge") && Math.random() < 0.25;
  if (dodged) {
    ml.push(`${stoneName}をひらりとかわした！${stoneName}が落ちた。`);
    const _sd = safeArrowDrop(pl.x, pl.y, dg);
    _monDropWithSpring(_sd, isMagic ? makeMagicStone(1) : makeStone(1), dg, ml);
    return;
  }

  const miss = Math.random() >= hitChance;
  if (miss) {
    ml.push(`${stoneName}は外れた！${stoneName}が足元に落ちた。`);
    const _sd = safeArrowDrop(pl.x, pl.y, dg);
    _monDropWithSpring(_sd, isMagic ? makeMagicStone(1) : makeStone(1), dg, ml);
    return;
  }

  /* 命中 */
  const _stVulnPc = findVulnPentacle(dg, pl.x, pl.y);
  let dmg = Math.max(1, m.atk + rng(-2, 2));
  if (_stVulnPc) dmg = _stVulnPc.cursed ? Math.max(1, Math.floor(dmg / 2)) : dmg * (_stVulnPc.blessed ? 4 : 2);
  pl.deathCause = `${m.name}の石投げで`;
  pl.hp -= dmg;
  ml.push(`${m.name}の${stoneName}が命中！${dmg}ダメージ！`);
  if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("衝撃で目が覚めた！"); }
  if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("衝撃で金縛りが解けた！"); }
}

/* 仮眠中のモンスターを強制覚醒させる。モンスターへの全アクションから呼ぶ */
export function wakeIfDormant(m, ml) {
  if (m.dormantHouse) {
    m.dormantHouse = false;
    m.aware = true;
    ml.push(`${m.name}が目を覚ました！`);
    return;
  }
  if (!m.dormant) return;
  m.dormant = false;
  m._dormantTouched = false;
  delete m._dormantHp;
  ml.push(`${m.name}が目を覚ました！`);
}

/* ===== MONSTER AI ===== */
/* 重力ゾーンで罠を踏む処理 */
function _checkGravityTrap(m, dg, pl, ml, luFn) {
  if (!hasGravityPentacle(dg, m.x, m.y)) return;
  const trap = dg.traps?.find(t => t.x === m.x && t.y === m.y);
  if (!trap) return;
  trap.revealed = true;
  ml.push(`重力の力で${m.name}が${trap.name}を踏んだ！`);
  fireTrapItem(trap, { name: "重力の力", type: "misc", x: m.x, y: m.y }, dg, m.x, m.y, ml, new Set(), pl, it => it.name, luFn);
  const _gravBreakChance = (trap.effect === "steal_trap" || trap.effect === "summon_trap") ? 0.5 : 0.25;
  if (trap.effect !== "explode" && !trap.permanent && Math.random() < _gravBreakChance) {
    dg.traps = dg.traps.filter(t => t !== trap);
    ml.push(`${trap.name}は壊れた。`);
  }
}

export function monsterAI(m, dg, pl, ml, opts = {}) {
  const _moveOnly = opts.moveOnly || false;
  let _attackOnly = opts.attackOnly || false;
  const _luFn = opts.luFn || (() => {});
  const _onHit = opts.onPlayerHit;
  const _onMiss = opts.onPlayerMiss;
  /* 重力の魔方陣：浮遊系モンスターの実効float（重力ゾーン内では浮遊不可） */
  const _effFloat = m.float && !hasGravityPentacle(dg, m.x, m.y);
  /* 呪い重力の魔方陣：ゾーン内モンスターは浮遊状態扱い */
  const _isCursedGravFloat = !m.float && hasCursedGravityPentacle(dg, m.x, m.y);
  /* モンスターハウス仮眠：triggerMonsterHouseで解除されるまで動かない */
  if (m.dormantHouse) return;
  /* 通常仮眠：視界に入るか、何らかのアクションを受けたら即覚醒 */
  if (m.dormant) {
    const _wasHit = m.hp < (m._dormantHp ?? m.hp);
    if (dg.visible?.[m.y]?.[m.x] || _wasHit || m._dormantTouched) {
      wakeIfDormant(m, ml);
    } else {
      m._dormantHp = m.hp;
      return;
    }
  }
  /* 状態異常防止：毎ターンカウントダウン */
  if ((m.statusImmune || 0) > 0) {
    m.statusImmune--;
    if (m.statusImmune <= 0) ml.push(`${m.name}の状態防止が切れた！`);
  }
  /* 毒状態：毎ターンHP減少 */
  if ((m.poisonedTurns || 0) > 0 && !_attackOnly) {
    m.poisonedTurns--;
    const _pdmg = m.poisonDmg || 3;
    m.hp -= _pdmg;
    ml.push(`毒に侵された${m.name}は${_pdmg}ダメージ！`);
    if (m.hp <= 0) { killMonster(m, dg, pl, ml, _luFn); return; }
    if (m.poisonedTurns <= 0) ml.push(`${m.name}の毒が切れた。`);
  }
  if (m.sleepTurns > 0) {
    if (!_attackOnly) m.sleepTurns--;
    return;
  }
  if (m.paralyzed) return;
  /* 移動封じ（氷の杖・影ぬいなど）：移動はできないが攻撃・特技は可能 */
  if ((m.immobileTurns||0) > 0) { if (!_attackOnly) m.immobileTurns--; _attackOnly = true; }

  /* ===== 混乱状態：ランダム方向に移動・攻撃 ===== */
  if ((m.confusedTurns || 0) > 0) {
    if (!_attackOnly) m.confusedTurns--;
    const _cdirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
    const _rd = pick(_cdirs);
    const _cnx = m.x + _rd[0], _cny = m.y + _rd[1];
    if (inBounds(_cnx, _cny)) {
      if (_cnx === pl.x && _cny === pl.y) {
        if (!_moveOnly && m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `混乱した${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss }); }
      } else {
        const _other = dg.monsters.find(o => o !== m && o.x === _cnx && o.y === _cny);
        if (_other) {
          if (!_moveOnly) {
            const _odmg = Math.max(1, Math.floor(m.atk * m.atk / (m.atk + (_other.def || 0))) + rng(-1, 1));
            _other.hp -= _odmg;
            ml.push(`混乱した${m.name}が${_other.name}を攻撃！${_odmg}ダメージ！`);
            if (_other.hp <= 0) {
              ml.push(`${_other.name}は倒れた！`);
              removeMonster(dg, _other);
              monLevelUp(m, dg, ml);
            }
          }
        } else if (!_attackOnly && isWalkable(dg.map, _cnx, _cny)) {
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
    if (!_isPerm && !_attackOnly) m.darknessTurns--;
    if (!m.darkDir) {
      const _ddirs = [[-1,0],[1,0],[0,-1],[0,1]];
      m.darkDir = pick(_ddirs);
    }
    const _dnx = m.x + m.darkDir[0], _dny = m.y + m.darkDir[1];
    if (canEnter(dg.map, _dnx, _dny, _effFloat)) {
      if (_dnx === pl.x && _dny === pl.y) {
        if (!_moveOnly && m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `暗闇の${m.name}が突進して攻撃！${d}ダメージ！`, { skipVuln: true, skipThorn: true, onPlayerHit: _onHit, onPlayerMiss: _onMiss }); }
      } else {
        const _dother = dg.monsters.find(o => o !== m && o.x === _dnx && o.y === _dny);
        if (_dother) {
          if (!_moveOnly) {
            const _dodmg = Math.max(1, Math.floor(m.atk * m.atk / (m.atk + (_dother.def || 0))) + rng(-1, 1));
            _dother.hp -= _dodmg;
            ml.push(`暗闇の${m.name}が${_dother.name}に突進！${_dodmg}ダメージ！`);
            if (_dother.hp <= 0) {
              ml.push(`${_dother.name}は倒れた！`);
              removeMonster(dg, _dother);
              monLevelUp(m, dg, ml);
            }
          }
        } else if (!_attackOnly) {
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
    if (!_isPerm && !_attackOnly) m.fleeingTurns--;
    const _fcands = [];
    for (const [_fmx, _fmy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
      const _fnx = m.x + _fmx, _fny = m.y + _fmy;
      if (!canEnter(dg.map, _fnx, _fny, _effFloat)) continue;
      if (dg.monsters.some(o => o !== m && o.x === _fnx && o.y === _fny)) continue;
      if (_fnx === pl.x && _fny === pl.y) continue;
      const _score = (_fnx - pl.x) * (_fnx - pl.x) + (_fny - pl.y) * (_fny - pl.y);
      _fcands.push({ x: _fnx, y: _fny, score: _score });
    }
    _fcands.sort((a, b) => b.score - a.score);
    if (!_attackOnly && _fcands.length > 0) { m.x = _fcands[0].x; m.y = _fcands[0].y; }
    if (!_isPerm && m.fleeingTurns <= 0) ml.push(`${m.name}の幻惑が解けた！`);
    return;
  }

  /* ===== 分裂スライム：HP半減で一度だけ分裂体を生成 ===== */
  if (m.subtype === "splitter" && !m.hasSplit && m.hp > 0 && m.hp < m.maxHp / 2) {
    m.hasSplit = true;
    const _splitDirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
    for (const [_sdx, _sdy] of _splitDirs) {
      const _snx = m.x + _sdx, _sny = m.y + _sdy;
      if (!canEnter(dg.map, _snx, _sny)) continue;
      if (_snx === pl.x && _sny === pl.y) continue;
      if (dg.monsters.some(o => o.x === _snx && o.y === _sny)) continue;
      const _child = { ...m, id: uid(), x: _snx, y: _sny,
        hp: Math.max(1, Math.floor(m.maxHp * 0.35)), maxHp: m.maxHp,
        hasSplit: true, posHistory: [], turnAccum: 0, patrolTarget: null };
      dg.monsters.push(_child);
      ml.push(`${m.name}が分裂した！`);
      break;
    }
  }

  /* ===== ボムスライム：HPが一桁になると警告→次ターンに爆発 ===== */
  if (m.subtype === "deathbomb" && m.hp > 0 && m.hp <= 9 && !m.deathBombExploded) {
    if (m.deathBombReady) {
      m.deathBombExploded = true;
      const _dbX = m.x, _dbY = m.y, _dbName = m.name;
      killMonster(m, dg, pl, ml, _luFn, true); // 自爆→経験値なし
      doExplosion(_dbX, _dbY, dg, pl, ml, null, `${_dbName}の爆発`, null, _luFn, false, true, true, true);
      return;
    } else {
      m.deathBombReady = true;
      ml.push(`${m.name}が点滅し始めた！爆発寸前だ！`);
      return;
    }
  }

  /* ===== 爆弾ゴブリン：プレイヤーに隣接すると自爆 ===== */
  if (m.subtype === "kamikaze" && !m.sealed && !_moveOnly) {
    if (Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1) {
      const _kzX = m.x, _kzY = m.y, _kzName = m.name;
      m.hp = 0; // speed:2による2回目の呼び出しを防ぐ
      killMonster(m, dg, pl, ml, _luFn, true); // 自爆→経験値なし
      doExplosion(_kzX, _kzY, dg, pl, ml, null, `${_kzName}の自爆`, null, _luFn, false, true, true, true);
      return;
    }
  }

  /* ===== 罠師：部屋内（Lv3は廊下も可）で足元にランダムな罠を仕掛ける ===== */
  if (m.subtype === "trapmaster" && !m.sealed && !_attackOnly) {
    const _tmLvl = m.monLevel || 1;
    /* Lv3は廊下も可、Lv1/2は部屋内のみ */
    const _tmRoom = findRoom(dg.rooms, m.x, m.y);
    const _tmCanPlace = _tmLvl >= 3 ? isWalkable(dg.map, m.x, m.y) : _tmRoom !== null;
    if (_tmCanPlace) {
      /* Lv2以上は発動確率50%、Lv1は25% */
      const _tmChance = _tmLvl >= 2 ? 0.25 : 0.125;
      /* 足元に罠以外のものがあれば設置不可 */
      const _tmBlocked =
        dg.items?.some(it => it.x === m.x && it.y === m.y) ||
        dg.springs?.some(s => s.x === m.x && s.y === m.y) ||
        dg.bigboxes?.some(b => b.x === m.x && b.y === m.y) ||
        dg.pentacles?.some(pc => pc.x === m.x && pc.y === m.y) ||
        dg.map[m.y]?.[m.x] === T.SD || dg.map[m.y]?.[m.x] === T.SU;
      if (Math.random() < _tmChance) {
        if (_tmBlocked) {
          ml.push(`${m.name}が罠を仕掛けようとしたが失敗した！`);
          return;
        }
        /* 足元にすでに罠があれば別の種類を選ぶ */
        const _existTrap = dg.traps?.find(t => t.x === m.x && t.y === m.y);
        let _candidates = TRAPS;
        if (_existTrap) {
          _candidates = TRAPS.filter(t => t.effect !== _existTrap.effect);
          /* 全部同じ種類（理論上ありえないが安全策）なら先頭を除く */
          if (_candidates.length === 0) _candidates = TRAPS.slice(1);
          /* 既存の罠を除去して新しい罠に置き換える */
          dg.traps = dg.traps.filter(t => t !== _existTrap);
        }
        const _newTrap = { ...pick(_candidates), id: uid(), x: m.x, y: m.y, revealed: true };
        dg.traps = dg.traps || [];
        dg.traps.push(_newTrap);
        ml.push(`${m.name}が罠を仕掛けた！`);
        return;
      }
    }
  }

  /* ===== バリア術師：非隣接かつバリアなし時に50%でバリアを張り直す ===== */
  if (m.baseKind === "barriermage" && !m.barrier && !m.sealed) {
    const _adjPl = Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1;
    if (!_adjPl && rng(0, 1) === 0) {
      m.barrier = 1;
      ml.push(`${m.name}がバリアを張り直した！（残り1回）`);
      return;
    }
  }

  /* ===== 詰まり検出（位置履歴で停滞・往復を判定） ===== */
  if (!_attackOnly) {
    m.posHistory = m.posHistory || [];
    m.posHistory.push({ x: m.x, y: m.y });
    if (m.posHistory.length > 6) m.posHistory.shift();
  }
  let _forceAlt = false;
  if ((m.posHistory?.length ?? 0) >= 6) {
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
            const _bn = bfsNext(dg.map, dg.monsters, m.x, m.y, _bp.x, _bp.y, m, 10, null, _effFloat);
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
  const _plInvis = (pl.invisibleTurns || 0) > 0;
  const canSee = !_plInvis && (_sameRoom || ((dg.visible?.[m.y]?.[m.x] ?? false) && hasLOS(map, m.x, m.y, pl.x, pl.y)));

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
      if (!_moveOnly && m.turnAttacks < (m.maxAttacks ?? 1)) {
        m.turnAttacks++;
        const _wwInWall = dg.map[m.y]?.[m.x] === T.WALL;
        monsterAttackPlayer(m, dg, pl, ml, d => _wwInWall
          ? `${m.name}が壁を突き抜けて攻撃！${d}ダメージ！`
          : `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss });
        return;
      }
      if (_moveOnly) return; /* moveOnlyフェーズ：隣接済みなので移動しない */
      /* 2回目以降は移動のみ → 直進コードへフォールスルー */
    }
    if (!_attackOnly) {
      /* 壁を無視してプレイヤーへ1歩直進 */
      const _wdx = Math.sign(pl.x - m.x), _wdy = Math.sign(pl.y - m.y);
      if (_wdx !== 0 || _wdy !== 0) {
        const _wnx = m.x + _wdx, _wny = m.y + _wdy;
        if (_wnx > 0 && _wnx < MW - 1 && _wny > 0 && _wny < MH - 1 &&
            !(_wnx === pl.x && _wny === pl.y) &&
            !dg.monsters.some(o => o !== m && o.x === _wnx && o.y === _wny) &&
            !dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _wnx && pc.y === _wny)) {
          m.x = _wnx; m.y = _wny;
        }
      }
    }
    return;
  }

  /* ===== 壁掘り（岩砕き等）：覚醒時は壁を掘り進んでプレイヤーへ直進 ===== */
  if (m.wallDigger && m.aware) {
    if (Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1) {
      if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y)) return;
      if (!_moveOnly && m.turnAttacks < (m.maxAttacks ?? 1)) {
        m.turnAttacks++;
        monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss });
        return;
      }
      if (_moveOnly) return;
    }
    if (!_attackOnly) {
      const _wddx = Math.sign(pl.x - m.x), _wddy = Math.sign(pl.y - m.y);
      if (_wddx !== 0 || _wddy !== 0) {
        const _wdnx = m.x + _wddx, _wdny = m.y + _wddy;
        if (_wdnx > 0 && _wdnx < MW - 1 && _wdny > 0 && _wdny < MH - 1 &&
            !(_wdnx === pl.x && _wdny === pl.y) &&
            !dg.monsters.some(o => o !== m && o.x === _wdnx && o.y === _wdny) &&
            !dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _wdnx && pc.y === _wdny)) {
          if (dg.map[_wdny][_wdnx] === T.WALL) {
            dg.map[_wdny][_wdnx] = T.FLOOR;
            ml.push(`${m.name}が壁を掘り進んだ！`);
          }
          if (dg.map[_wdny][_wdnx] !== T.BWALL) {
            m.x = _wdnx; m.y = _wdny;
          }
        }
      }
    }
    return;
  }

  if (m.aware) {
    /* ── ranged special attacks (only when player is visible) ── */
    /* moveOnlyフェーズ：ランダムで攻撃か移動かを決定。攻撃の場合は移動せずreturn */
    if (_moveOnly && canSee) {
      const _radx = pl.x - m.x, _rady = pl.y - m.y;
      const _rLen = Math.max(Math.abs(_radx), Math.abs(_rady));
      const _rLine = _radx === 0 || _rady === 0 || Math.abs(_radx) === Math.abs(_rady);
      const _rAtks = m.turnAttacks < (m.maxAttacks ?? 1);
      const _archerRdy = m.subtype === "archer" && !m.sealed && _rLine && _rLen >= 1 && _rLen <= 10 && _rAtks;
      const _stLvlR = m.monLevel || 1;
      const _stRangeR = _stLvlR >= 3 ? 10 : _stLvlR >= 2 ? 5 : 3;
      const _stoneRdy = m.subtype === "stonethrow" && !m.sealed && _rAtks && Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y)) <= _stRangeR;
      const _wandRdy = m.subtype === "wanduser" && !m.sealed && _rLine && _rLen >= 1 && _rLen <= 10 && opts.monsterWandFn && _rAtks;
      const _dfLvl0 = m.monLevel || 1;
      const _dragonRdy0 = m.baseKind === "dragon" && !m.sealed && _rAtks && _rLen >= 2 &&
        (_dfLvl0 >= 2 ? _sameRoom : _rLine);
      const _ttLvl0 = m.monLevel || 1;
      const _ttRange0 = _ttLvl0 >= 3 ? 10 : _ttLvl0 >= 2 ? 5 : 3;
      const _ttRdy0 = m.subtype === "trapthrower" && !m.sealed && _rAtks && opts.fireTrapFn &&
        Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y)) === 1 &&
        dg.traps?.some(t => t.revealed && Math.max(Math.abs(t.x - m.x), Math.abs(t.y - m.y)) <= _ttRange0 &&
          Math.max(Math.abs(t.x - pl.x), Math.abs(t.y - pl.y)) >= 2);
      const _mtLvl0 = m.monLevel || 1;
      const _mtRange0 = _mtLvl0 >= 3 ? 10 : _mtLvl0 >= 2 ? 5 : 3;
      const _mtRdy0 = m.subtype === "monsterthrow" && !m.sealed && _rAtks &&
        Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y)) <= _mtRange0 &&
        dg.monsters.some(o => o !== m && Math.max(Math.abs(o.x - m.x), Math.abs(o.y - m.y)) === 1);
      if ((_archerRdy || _stoneRdy || _wandRdy || _dragonRdy0 || _ttRdy0 || _mtRdy0) && (m.alwaysUseSpecial || Math.random() < 0.5)) {
        m._rangedAttackThisTurn = true;
        return; /* 攻撃ターンと決定→移動しない。attackOnlyフェーズで攻撃する */
      }
    }
    /* ドラゴンLv3：canSee不要なので別途判定 */
    if (_moveOnly && m.aware && m.baseKind === "dragon" && !m.sealed && (m.monLevel || 1) >= 3) {
      const _dfDist3 = Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y));
      if (_dfDist3 >= 2 && m.turnAttacks < (m.maxAttacks ?? 1) && (m.alwaysUseSpecial || Math.random() < 0.5)) {
        m._rangedAttackThisTurn = true;
        return;
      }
    }

    if (!_moveOnly && canSee) {
      const adx = pl.x - m.x, ady = pl.y - m.y;
      const lineLen = Math.max(Math.abs(adx), Math.abs(ady));
      const inLine = adx === 0 || ady === 0 || Math.abs(adx) === Math.abs(ady);
      const _rdy = m._rangedAttackThisTurn;
      if (_rdy) delete m._rangedAttackThisTurn;

      if (m.subtype === "archer" && !m.sealed && inLine && lineLen >= 1 && lineLen <= 10 && m.turnAttacks < (m.maxAttacks ?? 1) && (_rdy || m.alwaysUseSpecial || Math.random() < 0.5)) {
        m.turnAttacks++;
        monsterShootArrow(m, dg, pl, ml, opts);
        return;
      }

      if (m.subtype === "stonethrow" && !m.sealed && m.turnAttacks < (m.maxAttacks ?? 1)) {
        const _stLvl = m.monLevel || 1;
        const _stRange = _stLvl >= 3 ? 10 : _stLvl >= 2 ? 5 : 3;
        const _stDist = Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y));
        if (_stDist <= _stRange && (_rdy || m.alwaysUseSpecial || Math.random() < 0.5)) {
          m.turnAttacks++;
          monsterThrowStone(m, dg, pl, ml);
          return;
        }
      }

      if (m.subtype === "trapthrower" && !m.sealed && m.turnAttacks < (m.maxAttacks ?? 1) && opts.fireTrapFn &&
          Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y)) === 1) {
        const _ttLvl = m.monLevel || 1;
        const _ttRange = _ttLvl >= 3 ? 10 : _ttLvl >= 2 ? 5 : 3;
        /* 範囲内の発見済み罠を収集し、プレイヤーから遠い順に並べる（近すぎる罠は除外） */
        const _ttCands = (dg.traps || []).filter(t =>
          t.revealed && Math.max(Math.abs(t.x - m.x), Math.abs(t.y - m.y)) <= _ttRange &&
          Math.max(Math.abs(t.x - pl.x), Math.abs(t.y - pl.y)) >= 2
        ).sort((a, b) =>
          Math.max(Math.abs(b.x - pl.x), Math.abs(b.y - pl.y)) -
          Math.max(Math.abs(a.x - pl.x), Math.abs(a.y - pl.y))
        );
        if (_ttCands.length > 0 && (_rdy || m.alwaysUseSpecial || Math.random() < 0.5)) {
          const _ttTrap = _ttCands[0];
          m.turnAttacks++;
          pl.x = _ttTrap.x; pl.y = _ttTrap.y;
          ml.push(`${m.name}がプレイヤーを${_ttTrap.name}に向かって放り投げた！`);
          if ((pl.immobileTurns || 0) > 0) { pl.immobileTurns = 0; ml.push("吹き飛ばされて移動封じが解けた！"); }
          opts.fireTrapFn(_ttTrap, pl, dg, ml);
          return;
        }
      }

      if (m.subtype === "monsterthrow" && !m.sealed && m.turnAttacks < (m.maxAttacks ?? 1)) {
        const _mtLvl = m.monLevel || 1;
        const _mtRange = _mtLvl >= 3 ? 10 : _mtLvl >= 2 ? 5 : 3;
        const _mtDist = Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y));
        if (_mtDist <= _mtRange) {
          const _adjMons = dg.monsters.filter(o => o !== m &&
            Math.max(Math.abs(o.x - m.x), Math.abs(o.y - m.y)) === 1);
          const _adjPl = DRO.map(([ddx, ddy]) => ({ x: pl.x + ddx, y: pl.y + ddy }))
            .filter(({ x, y }) => isWalkable(dg.map, x, y) &&
              !dg.monsters.some(o => o.x === x && o.y === y) &&
              !(x === pl.x && y === pl.y));
          if (_adjMons.length > 0 && _adjPl.length > 0 && (_rdy || m.alwaysUseSpecial || Math.random() < 0.5)) {
            const _thrown = pick(_adjMons);
            const _dest = pick(_adjPl);
            m.turnAttacks++;
            wakeIfDormant(_thrown, ml);
            _thrown.x = _dest.x; _thrown.y = _dest.y;
            _thrown.aware = true;
            ml.push(`${m.name}が${_thrown.name}をプレイヤーの隣に投げた！`);
            return;
          }
        }
      }

      if (m.subtype === "wanduser" && !m.sealed && inLine && lineLen >= 1 && lineLen <= 10 && opts.monsterWandFn && m.turnAttacks < (m.maxAttacks ?? 1) && (_rdy || m.alwaysUseSpecial || Math.random() < 0.5)) {
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

    /* ── ドラゴン炎ブレス（Lv1:一直線 / Lv2:同部屋 / Lv3:同フロア） ── */
    if (!_moveOnly && m.baseKind === "dragon" && !m.sealed && m.turnAttacks < (m.maxAttacks ?? 1)) {
      const _dfAdx = pl.x - m.x, _dfAdy = pl.y - m.y;
      const _dfDist = Math.max(Math.abs(_dfAdx), Math.abs(_dfAdy));
      const _dfLvl = m.monLevel || 1;
      let _canFire = false;
      if (_dfDist >= 2) {
        if (_dfLvl >= 3) {
          _canFire = true; // 同フロア内（視界不要）
        } else if (_dfLvl >= 2) {
          _canFire = canSee && _sameRoom; // 同部屋内
        } else {
          // Lv1：一直線上かつ視界あり
          _canFire = canSee && (_dfAdx === 0 || _dfAdy === 0 || Math.abs(_dfAdx) === Math.abs(_dfAdy));
        }
      }
      const _dragonRdy = m._rangedAttackThisTurn;
      if (_dragonRdy) delete m._rangedAttackThisTurn;
      if (_canFire && (_dragonRdy || m.alwaysUseSpecial || Math.random() < 0.5)) {
        m.turnAttacks++;
        monsterDragonFire(m, dg, pl, ml, _onHit);
        return;
      }
    }

    /* ── runner（コロポックル等）：常にプレイヤーから逃げる。攻撃しない ── */
    if (m.subtype === "runner") {
      if (!_attackOnly) {
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
      }
      return;
    }

    /* ── thief（コソドロ等）：隣接時に所持品を1つ盗んでワープ、その後また近づく ── */
    if (m.subtype === "thief" && !m.sealed) {
      const _tdx = pl.x - m.x, _tdy = pl.y - m.y;
      const _adj = Math.abs(_tdx) <= 1 && Math.abs(_tdy) <= 1;
      if (_adj && _moveOnly) return; /* moveOnlyフェーズ：隣接済みなので移動しない */
      if (_adj) {
        const _hasAntiSteal = hasAbility(pl.armor, "anti_steal");
        if (_hasAntiSteal) {
          ml.push(`護盗の鎧が${m.name}の盗みを防いだ！`);
          /* 盗めないので通常攻撃 */
          if (m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss }); }
          return;
        }
        const _stealable = pl.inventory.filter(i => i.type !== "gold" && i.type !== "goal");
        if (_stealable.length > 0) {
          const _stolen = pick(_stealable);
          const _sidx = pl.inventory.indexOf(_stolen);
          pl.inventory.splice(_sidx, 1);
          /* テレポートブロック確認 */
          const _thieveTpBlock = hasCursedTeleportPentacle(dg);
          /* ワープ先：罠の隣を優先（テレポートブロック時はその場） */
          let _wx = m.x, _wy = m.y;
          if (!_thieveTpBlock) {
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
          }
          const _ft = new Set();
          placeItemAt(dg, _wx, _wy, _stolen, ml, _ft);
          if (_thieveTpBlock) {
            ml.push(`${m.name}が${_stolen.name}を盗んだ！呪われたテレポートの魔方陣に阻まれて逃げられない！`);
          } else {
            ml.push(`${m.name}が${_stolen.name}を盗んで煙の中に消えた！`);
          }
          return;
        }
        /* 盗めるものがなければ通常攻撃 */
        if (m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss }); }
        return;
      }
    }

    /* ── supporter（シャーマン等）：近くの味方を回復・強化 ── */
    if (!_moveOnly && m.subtype === "supporter" && (m.alwaysUseSpecial || Math.random() < 0.5)) {
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
          const _hn = bfsNext(map, [], m.x, m.y, _healTarget.x, _healTarget.y, m, 15, dg.pentacles, _effFloat);
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

    /* ── ruster（錆虫等）：攻撃時に武器か防具を錆びさせる ── */
    if (m.subtype === "ruster" && Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1 && canSee) {
      if (_moveOnly) return;
      if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y)) return;
      if (m.turnAttacks < (m.maxAttacks ?? 1)) {
        m.turnAttacks++;
        monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss });
        /* 錆び効果：武器→防具の順で50%確率 */
        const _rstCands = [];
        if (pl.weapon && !hasAbility(pl.weapon, "no_degrade")) _rstCands.push(pl.weapon);
        if (pl.armor  && !hasAbility(pl.armor,  "no_degrade")) _rstCands.push(pl.armor);
        if (_rstCands.length > 0 && Math.random() < 0.5) {
          const _rt = pick(_rstCands);
          const _op = _rt.plus || 0;
          _rt.plus = _op - 1;
          const _fpp = v => v > 0 ? `+${v}` : v === 0 ? "無印" : `${v}`;
          ml.push(`${m.name}の体液で${_rt.name}が錆びた！(${_fpp(_op)}→${_fpp(_rt.plus)})`);
        }
      }
      return;
    }

    /* ── puller（引きダコ等）：範囲内プレイヤーを1マス引き寄せる（視線不要） ── */
    if (!_attackOnly && m.subtype === "puller") {
      const _pullLvl = m.monLevel || 1;
      const _pullRange = _pullLvl >= 3 ? 8 : _pullLvl >= 2 ? 6 : 4;
      const _pulDist = Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y));
      if (_pulDist >= 2 && _pulDist <= _pullRange) {
        const _puldx = Math.sign(m.x - pl.x), _puldy = Math.sign(m.y - pl.y);
        const _pnx = pl.x + _puldx, _pny = pl.y + _puldy;
        if (isWalkable(dg.map, _pnx, _pny) && !dg.monsters.some(o => o.x === _pnx && o.y === _pny)) {
          pl.x = _pnx; pl.y = _pny;
          ml.push(`${m.name}に引き寄せられた！`);
          if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("引っ張られて目が覚めた！"); }
          if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("引っ張られて金縛りが解けた！"); }
        }
      }
      /* 引き寄せ後も通常攻撃・移動にフォールスルー */
    }

    const tx = canSee ? pl.x : m.lastPx;
    const ty = canSee ? pl.y : m.lastPy;

    /* ── 遠距離タイプが部屋内で射線が合っていない場合：軸合わせ優先 ── */
    if (!_attackOnly && canSee && _sameRoom &&
        (m.subtype === "archer" || m.subtype === "wanduser") && !m.sealed) {
      const _ralDx = pl.x - m.x, _ralDy = pl.y - m.y;
      const _inLineNow = _ralDx === 0 || _ralDy === 0 || Math.abs(_ralDx) === Math.abs(_ralDy);
      if (!_inLineNow) {
        const _alignCands = [];
        for (const [_amx, _amy] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
          const _anx = m.x + _amx, _any = m.y + _amy;
          if (!isWalkable(map, _anx, _any)) continue;
          if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _anx && pc.y === _any)) continue;
          if (dg.monsters.some(o => o !== m && o.x === _anx && o.y === _any)) continue;
          if (_anx === pl.x && _any === pl.y) continue;
          const _dx2 = pl.x - _anx, _dy2 = pl.y - _any;
          if (_dx2 === 0 || _dy2 === 0 || Math.abs(_dx2) === Math.abs(_dy2)) {
            _alignCands.push({ x: _anx, y: _any, dist: Math.max(Math.abs(_dx2), Math.abs(_dy2)) });
          }
        }
        if (_alignCands.length > 0) {
          _alignCands.sort((a, b) => a.dist - b.dist);
          const _ab = _alignCands[0];
          m.dir = { x: _ab.x - m.x, y: _ab.y - m.y };
          m.x = _ab.x; m.y = _ab.y;
          if (_forceAlt) m.posHistory = [];
          return;
        }
      }
    }

    /* adjacent attack */
    if (Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1 && canSee) {
      if (_moveOnly) return; /* moveOnlyフェーズ：隣接済みなので移動しない */
      /* 聖域チェック：プレイヤーが聖域の上なら攻撃不可 */
      if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y)) return;
      if (m.turnAttacks < (m.maxAttacks ?? 1)) {
        m.turnAttacks++;
        monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss });
        return;
      }
      /* 2回目以降：攻撃せずBFSで移動を試みる */
    }

    if (_attackOnly) return; /* attackOnlyフェーズ：移動しない */

    /* move toward target */
    /* BFSで最短経路を求める。部屋内での壁ぶつかりを防ぎ、通路への最適経路を辿る。 */
    const next = bfsNext(map, [], m.x, m.y, tx, ty, m, 40, dg.pentacles, _effFloat);
    if (next && dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === next.x && pc.y === next.y)) return;
    if (next) {
      if (next.x === pl.x && next.y === pl.y) {
        /* 聖域チェック：プレイヤーが聖域の上なら攻撃不可 */
        if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y)) return;
        m.dir = { x: next.x - m.x, y: next.y - m.y };
        if (!_moveOnly && m.turnAttacks < (m.maxAttacks ?? 1)) {
          m.turnAttacks++;
          monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss });
        }
        return;
      }
      if (!dg.monsters.some((o) => o !== m && o.x === next.x && o.y === next.y)) {
        m.dir = { x: next.x - m.x, y: next.y - m.y };
        m.x = next.x;
        m.y = next.y;
        if (m.baseKind === "firedemon") _fireDemonBurnItems(m, dg, ml);
        if (m.baseKind === "gelcube") _gelCubeAbsorbItems(m, dg, ml);
        if (_forceAlt) m.posHistory = [];
        _checkGravityTrap(m, dg, pl, ml, _luFn);
        return;
      }
      /* 次マスが別モンスターに占有 */
      /* 対向（互いに相手のマスへ向かっている）なら位置を交換してデッドロック解消 */
      const _blocker = dg.monsters.find(o => o !== m && o.x === next.x && o.y === next.y);
      if (_blocker) {
        const _bNext = bfsNext(map, [], _blocker.x, _blocker.y,
          (_blocker.aware ? (_blocker.lastPx ?? pl.x) : (m.x)),
          (_blocker.aware ? (_blocker.lastPy ?? pl.y) : (m.y)),
          _blocker, 4, dg.pentacles, _blocker.float);
        if (_bNext && _bNext.x === m.x && _bNext.y === m.y && _blocker.type !== "shopkeeper") {
          /* 正面衝突：スワップ（店主はスワップ不可） */
          _blocker.x = m.x; _blocker.y = m.y;
          m.dir = { x: next.x - m.x, y: next.y - m.y };
          m.x = next.x; m.y = next.y;
          if (m.baseKind === "firedemon") _fireDemonBurnItems(m, dg, ml);
          if (m.baseKind === "gelcube") _gelCubeAbsorbItems(m, dg, ml);
          _checkGravityTrap(m, dg, pl, ml, _luFn);
          return;
        }
      }
      /* 塞がれた場合：チェビシェフ距離でソートして隣接を維持できる方向を選ぶ */
      const _curDist = Math.max(Math.abs(tx - m.x), Math.abs(ty - m.y));
      const _altMoves = [];
      for (const [_adx, _ady] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        const _anx = m.x + _adx, _any = m.y + _ady;
        if (_anx === next.x && _any === next.y) continue;
        if (!canEnter(map, _anx, _any, _effFloat)) continue;
        if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _anx && pc.y === _any)) continue;
        if (dg.monsters.some(o => o !== m && o.x === _anx && o.y === _any)) continue;
        if (_adx !== 0 && _ady !== 0) {
          if (!canEnter(map, m.x + _adx, m.y, _effFloat) && !canEnter(map, m.x, m.y + _ady, _effFloat)) continue;
        }
        const _nd = Math.max(Math.abs(tx - _anx), Math.abs(ty - _any));
        if (_nd <= _curDist) _altMoves.push({ x: _anx, y: _any, dist: _nd });
      }
      if (_altMoves.length > 0) {
        _altMoves.sort((a, b) => a.dist - b.dist);
        const _ab = _altMoves[0];
        if (_ab.x === pl.x && _ab.y === pl.y) {
          if (!_moveOnly && !dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y) &&
              m.turnAttacks < (m.maxAttacks ?? 1)) {
            m.turnAttacks++; m.dir = { x: _ab.x - m.x, y: _ab.y - m.y };
            monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss });
          }
          return;
        }
        m.dir = { x: _ab.x - m.x, y: _ab.y - m.y };
        m.x = _ab.x; m.y = _ab.y;
        if (m.baseKind === "firedemon") _fireDemonBurnItems(m, dg, ml);
        if (m.baseKind === "gelcube") _gelCubeAbsorbItems(m, dg, ml);
        _checkGravityTrap(m, dg, pl, ml, _luFn);
        return;
      }
      return; /* 前の敵が動けない場合は自然なキューイングで待機 */
    }
    /* BFS 経路なし（壁で完全遮断）：_forceAlt 時のみランダム脱出を試みる */
    if (_forceAlt) {
      const _fd4 = [[0,-1],[0,1],[-1,0],[1,0]].sort(() => Math.random() - 0.5);
      for (const [_fdx, _fdy] of _fd4) {
        const _fnx = m.x + _fdx, _fny = m.y + _fdy;
        if (!canEnter(map, _fnx, _fny, _effFloat)) continue;
        if (_fnx === pl.x && _fny === pl.y) continue;
        if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _fnx && pc.y === _fny)) continue;
        if (dg.monsters.some(o => o !== m && o.x === _fnx && o.y === _fny)) continue;
        m.dir = { x: _fdx, y: _fdy };
        m.x = _fnx; m.y = _fny;
        if (m.baseKind === "firedemon") _fireDemonBurnItems(m, dg, ml);
        if (m.baseKind === "gelcube") _gelCubeAbsorbItems(m, dg, ml);
        m.posHistory = [];
        return;
      }
      m.posHistory = [];
    }
  } else if (!_attackOnly) {
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
        m.patrolTarget.x, m.patrolTarget.y, m, 20, dg.pentacles, _effFloat);
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
    /* ── 壁掘り：未覚醒時に低確率でランダムな隣接壁を掘る ── */
    if (m.wallDigger && Math.random() < 0.12) {
      const _rdDirs = [[0,-1],[0,1],[-1,0],[1,0]].sort(() => Math.random() - 0.5);
      for (const [_rddx, _rddy] of _rdDirs) {
        const _rdnx = m.x + _rddx, _rdny = m.y + _rddy;
        if (_rdnx <= 0 || _rdnx >= MW - 1 || _rdny <= 0 || _rdny >= MH - 1) continue;
        if (dg.map[_rdny][_rdnx] === T.WALL) {
          dg.map[_rdny][_rdnx] = T.FLOOR;
          ml.push(`${m.name}が壁を掘った。`);
          break;
        }
      }
    }
  }
}
