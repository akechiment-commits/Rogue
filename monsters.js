import { rng, pick, uid, MW, MH, T, DRO, removeMonster, removeFloorItem, itemAt, clamp, findVulnPentacle, hasAbility, hasGravityPentacle, hasCursedGravityPentacle, getDodgePentacleMode, shuffle, randomTeleportDest, consumeBarrier, calcAtkDefDmg, stepProjectile, getWindAt } from "./utils.js";
import { resolveItemName, getFarcastMode, placeItemAt, makeStone, makeMagicStone, makeArrow, makeStrongArrow, makePiercingArrow, applyLightningToInventory, hasFireResist, hasIceResist, reduceFireDamage, reduceIceDamage, fireResistDamageLabel, iceResistDamageLabel, hasCursedExplosionPentacle, isFireExplosionNullified, hasCursedTeleportPentacle, killMonster, doExplosion, fireTrapItem, cookFoodMeta, soakItemIntoSpring, TRAPS, pickTrap, rotFood, burnFoodItem, splashPotion, scatterPotContents, getBlessMultiplier, hasRingEffect, SOBURO_T, throwItemAlongLine, inMagicSealRoom, removeTrap, trapStepBreakChance, applyWaterGunToInventory, applySoakedStatus, hasWaterProof, freezeWaterTile, applyWaterIceFreeze, isPlayerOnWater, applyFrozenPhysicalMult, frozenPhysicalLabel, getFixtureItemDeps } from "./items.js";
import { pushMonsterBoltAnim, pushSplashAnim, pushBoltAnim, pushAnim } from "./animEvents.js";
import { hitStatueWithAction, setStatueSpawnHandler } from "./fixtures.js";
import { statueAt } from "./fixtureQueries.js";
import { registerMonsterRuntime, wakeIfDormant } from "./monsterRuntime.js";

export { wakeIfDormant } from "./monsterRuntime.js";

/* ===== 火ダルマ：移動後に可燃アイテムを燃やす ===== */
function _fireDemonBurnItems(m, dg, ml) {
  const _items = dg.items.filter(it => it.x === m.x && it.y === m.y);
  const _toRemove = new Set();
  for (const it of _items) {
    if (it.type === "scroll" || it.type === "spellbook") {
      _toRemove.add(it);
      ml.push(`${m.name}が通った！「${resolveItemName(it)}」が燃えてなくなった！`);
    } else if (it.type === "food") {
      if (!it.cooked) {
        it.value = Math.floor((it.value || 10) * 2); cookFoodMeta(it);
        it.name = "焼いた" + it.name;
        ml.push(`${m.name}が通った！食料が焼けて「${it.name}」になった！`);
      } else {
        const _prevFoodName = it.name;
        const _dummy = [];
        burnFoodItem(it, _dummy);
        ml.push(`${m.name}が通った！「${_prevFoodName}」がさらに焦げて「${it.name}」になった！`);
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
    if (!m._gelBaseAtk) m._gelBaseAtk = m.atk;
    m._gelBoost = Math.min(10, (m._gelBoost || 1) * 1.2);
    m.atk = Math.round(m._gelBaseAtk * m._gelBoost);
    ml.push(`${m.name}が「${resolveItemName(it)}」を取り込んだ！（攻撃力×${m._gelBoost.toFixed(2)}→${m.atk}）`);
  }
  dg.items = dg.items.filter(it => !(it.x === m.x && it.y === m.y));
}

/* ===== 境界・通行判定ヘルパー ===== */
function inBounds(x, y) { return x >= 0 && x < MW && y >= 0 && y < MH; }
function isWalkable(map, x, y, dg = null) {
  if (!inBounds(x, y) || map[y][x] === T.WALL || map[y][x] === T.BWALL) return false;
  if (dg?.statues?.some(s => s.x === x && s.y === y)) return false;
  return true;
}
/* 水タイルを考慮：浮遊(float)なら水上通行可 */
function canEnter(map, x, y, float = false, dg = null) {
  return isWalkable(map, x, y, dg) && (float || map[y]?.[x] !== T.WATER);
}

/* ===== プレイヤー防御力計算ヘルパー ===== */
/** モンスターの炎耐性倍率（elemResist:"fire" → 半減）。火ダルマの吸収は別処理 */
export function monFireDmgMult(m) {
  if (m?.elemResist === "fire") return 0.5;
  return 1;
}
export function monFireDmgLabel(m) {
  return monFireDmgMult(m) < 1 ? "(炎半減)" : "";
}
/** 炎ダメージを耐性適用して返す（最低1） */
export function scaleMonFireDmg(m, dmg) {
  const mult = monFireDmgMult(m);
  if (mult >= 1) return Math.max(1, dmg | 0);
  return Math.max(1, Math.floor((dmg | 0) * mult));
}

function calcPlayerDef(pl) {
  const _misoDef = (pl.misoDefTurns || 0) > 0 ? 8 : 0;
  return Math.floor((pl.def + (pl.armor?.def || 0) + (pl.armor?.plus || 0) + (pl.rings || []).reduce((s, r) => r.effect === "defense_ring" ? s + (r.plus || 0) : s, 0) + (hasAbility(pl.weapon, "def_bonus") ? 5 : 0) + _misoDef) * ((pl.defSoftenedTurns || 0) > 0 ? 0.5 : 1) * ((pl.defDebuffTurns || 0) > 0 ? 0.5 : 1));
}

/* ===== ドラゴン炎ブレス（風で曲がる物理ブレス） ===== */
function monsterDragonFire(m, dg, pl, ml, onPlayerHit) {
  /* 呪われた爆発の魔方陣がある場合は炎を打ち消す */
  if (isFireExplosionNullified(dg, pl)) {
    ml.push((pl.fireExplosionNullTurns || 0) > 0
      ? `炎と爆発が不発にされた！（残り${pl.fireExplosionNullTurns}ターン）`
      : `呪われた爆発の魔方陣が${m.name}の炎ブレスを打ち消した！`);
    return;
  }
  const _fLvl = m.monLevel || 1;
  let _fdx = Math.sign(pl.x - m.x), _fdy = Math.sign(pl.y - m.y);
  if (_fdx === 0 && _fdy === 0) _fdy = 1;
  pushMonsterBoltAnim(m.x, m.y, _fdx, _fdy, dg, pl, "#ff6622");
  let _cx = m.x, _cy = m.y, _windMsg = false;
  const _applyFireToMon = (_fBlock) => {
    wakeIfDormant(_fBlock, ml);
    const _fDmgBase = calcAtkDefDmg(m.atk, _fBlock.def || 0, { defWeight: 1 });
    if (_fBlock.baseKind === "firedemon") {
      const _fheal = Math.min(_fDmgBase, _fBlock.maxHp - _fBlock.hp);
      if (_fheal > 0) { _fBlock.hp += _fheal; ml.push(`${m.name}の炎ブレスが${_fBlock.name}に当たった！炎を吸収して回復した！(+${_fheal}HP)`); }
      else ml.push(`${m.name}の炎ブレスが${_fBlock.name}に当たった！しかし炎を吸収した！`);
      return;
    }
    const _fOilyMult = (_fBlock.oilyTurns || 0) > 0 || dg.oilyTiles?.some(t => t.x === _fBlock.x && t.y === _fBlock.y) ? 2 : 1;
    const _fDmg = scaleMonFireDmg(_fBlock, _fDmgBase * _fOilyMult);
    _fBlock.hp -= _fDmg;
    ml.push(`${m.name}の炎ブレスが${_fBlock.name}に命中！${_fDmg}ダメージ！${_fOilyMult > 1 ? "(油まみれ×2)" : ""}${monFireDmgLabel(_fBlock)}`);
    if (_fBlock.hp <= 0) { killMonster(_fBlock, dg, pl, ml, null, false, m); }
  };
  const _applyFireToPlayer = () => {
    const pdef = calcPlayerDef(pl);
    let dmg = calcAtkDefDmg(m.atk, pdef, { defWeight: 1.5 });
    const _vulnPc = findVulnPentacle(dg, pl.x, pl.y);
    if (_vulnPc) dmg = _vulnPc.cursed ? Math.max(1, Math.floor(dmg / 2)) : dmg * (_vulnPc.blessed ? 4 : 2);
    const _hasFireProt = hasFireResist(pl);
    dmg = reduceFireDamage(dmg, pl);
    if ((pl.curryFireResTurns || 0) > 0) dmg = Math.max(1, Math.floor(dmg / 2));
    const _oilyMult = (pl.oilyTurns || 0) > 0 || dg.oilyTiles?.some(t => t.x === pl.x && t.y === pl.y) ? 2 : 1;
    if (_oilyMult > 1) dmg *= 2;
    pl.deathCause = `${m.name}の炎ブレスで`;
    pl.hp -= dmg;
    onPlayerHit?.(dmg, m);
    ml.push(`${m.name}が炎ブレスを吐いた！${dmg}ダメージ！${fireResistDamageLabel(pl)}${_oilyMult > 1 ? "(油まみれ×2)" : ""}`);
    if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("熱さで目が覚めた！"); }
    if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("熱さで金縛りが解けた！"); }
    if (!_hasFireProt) applyLightningToInventory(pl, dg, ml, null, null, true);
  };
  for (let _fi = 1; _fi < MW + MH; _fi++) {
    const _st = stepProjectile(dg, _cx, _cy, _fdx, _fdy, { wind: true });
    if (_st.bent && !_windMsg) { ml.push("風穴の風が炎ブレスを曲げた！"); _windMsg = true; }
    _fdx = _st.dx; _fdy = _st.dy;
    const _fx = _st.x, _fy = _st.y;
    _cx = _fx; _cy = _fy;
    if (_fx < 0 || _fx >= MW || _fy < 0 || _fy >= MH) return;
    if (_fLvl < 3 && (dg.map[_fy]?.[_fx] === T.WALL || dg.map[_fy]?.[_fx] === T.BWALL)) return;
    /* 風で自分に戻った */
    if (_fx === m.x && _fy === m.y) {
      _applyFireToMon(m);
      return;
    }
    if (statueAt(dg, _fx, _fy)) {
      ml.push(`${m.name}の炎ブレスが石像に命中！`);
      hitStatueWithAction(dg, _fx, _fy, pl, ml, null, pl?.depth, {
        breaks: true,
        itemDeps: getFixtureItemDeps(),
      });
      return;
    }
    if (_fx === pl.x && _fy === pl.y) { _applyFireToPlayer(); return; }
    const _fBlock = dg.monsters.find(o => o !== m && o.x === _fx && o.y === _fy);
    if (_fBlock) { _applyFireToMon(_fBlock); return; }
  }
}

/* ===== 氷竜ブレス（風で曲がる物理ブレス） ===== */
function monsterIceBreath(m, dg, pl, ml, onPlayerHit) {
  const _iLvl = m.monLevel || 1;
  let _idx = Math.sign(pl.x - m.x), _idy = Math.sign(pl.y - m.y);
  if (_idx === 0 && _idy === 0) _idy = 1;
  pushMonsterBoltAnim(m.x, m.y, _idx, _idy, dg, pl, "#80ddff");
  let _cx = m.x, _cy = m.y, _windMsg = false;
  const _hitIceMon = (_iBlock) => {
    let _iDmg = calcAtkDefDmg(m.atk, _iBlock.def || 0, { defWeight: 1 });
    const _iIsWeak = _iBlock.elemWeak === "ice";
    if (_iIsWeak) _iDmg = Math.floor(_iDmg * 1.5);
    _iBlock.hp -= _iDmg;
    const _iSlow = rng(3, 5);
    if (_iBlock.isBoss && _iBlock._preSlowSpeed === undefined) _iBlock._preSlowSpeed = _iBlock.speed;
    _iBlock.speed = Math.max(0.25, (_iBlock.speed || 1) * 0.5);
    if (_iBlock.isBoss) _iBlock.bossSlowTurns = (_iBlock.bossSlowTurns || 0) + _iSlow * 2;
    ml.push(`${m.name}の氷ブレスが${_iBlock.name}に命中！${_iDmg}ダメージ！${_iIsWeak ? "氷弱点特効！" : ""}鈍足${_iSlow}ターン！`);
    if (_iBlock.hp <= 0) {
      killMonster(_iBlock, dg, pl, ml, null, false, m);
      if (_iBlock !== m) monLevelUp(m, dg, ml);
    }
  };
  const _hitIcePl = () => {
    const pdef = calcPlayerDef(pl);
    let _iDmg = calcAtkDefDmg(m.atk, pdef, { defWeight: 1.5 });
    const _iVulnPc = findVulnPentacle(dg, pl.x, pl.y);
    if (_iVulnPc) _iDmg = _iVulnPc.cursed ? Math.max(1, Math.floor(_iDmg / 2)) : _iDmg * (_iVulnPc.blessed ? 4 : 2);
    const _hasIceR = hasIceResist(pl);
    _iDmg = reduceIceDamage(_iDmg, pl);
    pl.deathCause = `${m.name}の氷ブレスで`;
    pl.hp -= _iDmg;
    onPlayerHit?.(_iDmg, m);
    if (_hasIceR) {
      ml.push(`${m.name}が氷ブレスを吐いた！${_iDmg}ダメージ！${iceResistDamageLabel(pl)}・鈍足無効`);
    } else if (isPlayerOnWater(pl, dg)) {
      ml.push(`${m.name}が氷ブレスを吐いた！${_iDmg}ダメージ！`);
      applyWaterIceFreeze(pl, dg, ml, 5);
    } else {
      const _iSlow = rng(3, 6);
      pl.slowTurns = (pl.slowTurns || 0) + _iSlow;
      ml.push(`${m.name}が氷ブレスを吐いた！${_iDmg}ダメージ！鈍足${_iSlow}ターン！`);
    }
  };
  for (let _ii = 1; _ii < MW + MH; _ii++) {
    const _st = stepProjectile(dg, _cx, _cy, _idx, _idy, { wind: true });
    if (_st.bent && !_windMsg) { ml.push("風穴の風が氷ブレスを曲げた！"); _windMsg = true; }
    _idx = _st.dx; _idy = _st.dy;
    const _ix = _st.x, _iy = _st.y;
    _cx = _ix; _cy = _iy;
    if (_ix < 0 || _ix >= MW || _iy < 0 || _iy >= MH) return;
    /* 氷の杖と同様：射線上の水を凍らせる（止まらない） */
    freezeWaterTile(dg, _ix, _iy, ml);
    if (_iLvl < 3 && (dg.map[_iy]?.[_ix] === T.WALL || dg.map[_iy]?.[_ix] === T.BWALL)) return;
    if (_ix === m.x && _iy === m.y) { _hitIceMon(m); return; }
    if (statueAt(dg, _ix, _iy)) {
      ml.push(`${m.name}の氷ブレスが石像に命中！`);
      hitStatueWithAction(dg, _ix, _iy, pl, ml, null, pl?.depth, {
        breaks: true,
        itemDeps: getFixtureItemDeps(),
      });
      return;
    }
    if (_ix === pl.x && _iy === pl.y) { _hitIcePl(); return; }
    const _iBlock = dg.monsters.find(o => o !== m && o.x === _ix && o.y === _iy);
    if (_iBlock) { _hitIceMon(_iBlock); return; }
  }
}

/* ===== 薬投げ ===== */
const _POTION_THROW_POOL = [
  { name: "毒薬",       effect: "poison",   value: 15, tile: 16 },
  { name: "炎の薬",     effect: "fire",     value: 20, tile: 17 },
  { name: "睡眠薬",     effect: "sleep",    value: 4,  tile: 16 },
  { name: "混乱の薬",   effect: "confuse",  value: 5,  tile: 16 },
  { name: "封印の薬",   effect: "seal",     value: 0,  tile: 16 },
  { name: "暗闇の薬",   effect: "darkness", value: 0,  tile: 16 },
  { name: "惑わしの薬", effect: "bewitch",  value: 0,  tile: 16 },
  { name: "回復薬",     effect: "heal",     value: 30, tile: 16 },
  { name: "大回復薬",   effect: "heal_big", value: 60, tile: 17 },
];
function monsterThrowPotion(m, dg, pl, ml, bbFn) {
  const _pot = pick(_POTION_THROW_POOL);
  let _ptdx = Math.sign(pl.x - m.x), _ptdy = Math.sign(pl.y - m.y);
  ml.push(`${m.name}が謎の薬を投げた！`);
  pushMonsterBoltAnim(m.x, m.y, _ptdx, _ptdy, dg, pl, "#ff88ff");
  /* 経路上の泉・大箱チェック */
  let _cx = m.x, _cy = m.y;
  let _lastX = m.x, _lastY = m.y;
  for (let _step = 0; _step < MW + MH; _step++) {
    const _st = stepProjectile(dg, _cx, _cy, _ptdx, _ptdy, { wind: true });
    _ptdx = _st.dx; _ptdy = _st.dy;
    _cx = _st.x; _cy = _st.y;
    if (_cx < 0 || _cx >= MW || _cy < 0 || _cy >= MH ||
        dg.map[_cy]?.[_cx] === T.WALL || dg.map[_cy]?.[_cx] === T.BWALL) {
      splashPotion(dg, _lastX, _lastY, _pot.effect, _pot.value, pl, ml, null, false, false, null, m);
      return;
    }
    _lastX = _cx; _lastY = _cy;
    const _spr = dg.springs?.find(s => s.x === _cx && s.y === _cy);
    if (_spr) {
      const _potItem = { name: _pot.name, type: "potion", effect: _pot.effect, value: _pot.value || 0, tile: _pot.tile, id: uid() };
      soakItemIntoSpring(_spr, { ..._potItem, x: _cx, y: _cy }, ml, dg, null);
      return;
    }
    const _bb = dg.bigboxes?.find(b => b.x === _cx && b.y === _cy);
    if (_bb) {
      const _potItem = { name: _pot.name, type: "potion", effect: _pot.effect, value: _pot.value || 0, tile: _pot.tile, id: uid() };
      if (bbFn) bbFn(_bb, _potItem, dg, ml);
      else dg.items.push({ ..._potItem, x: _cx, y: _cy });
      return;
    }
    /* reflector（ミラーゴーレム等）：薬瓶を投擲元へ跳ね返す（飛沫は反射しない） */
    const _mirrorMon = dg.monsters.find(o => o.x === _cx && o.y === _cy && o.subtype === "reflector");
    if (_mirrorMon) {
      ml.push(`薬瓶が${_mirrorMon.name}に弾き返された！`);
      const _rrdx = -_ptdx, _rrdy = -_ptdy;
      let _rrx = _cx + _rrdx, _rry = _cy + _rrdy;
      let _splX = _cx, _splY = _cy;
      for (let _ri = 0; _ri < 20; _ri++) {
        if (_rrx < 0 || _rrx >= MW || _rry < 0 || _rry >= MH) break;
        if (dg.map[_rry][_rrx] === T.WALL || dg.map[_rry][_rrx] === T.BWALL) break;
        const _rrSpr = dg.springs?.find(s => s.x === _rrx && s.y === _rry);
        if (_rrSpr) {
          const _potItem = { name: _pot.name, type: "potion", effect: _pot.effect, value: _pot.value || 0, tile: _pot.tile, id: uid() };
          soakItemIntoSpring(_rrSpr, { ..._potItem, x: _rrx, y: _rry }, ml, dg, null);
          return;
        }
        const _rrBb = dg.bigboxes?.find(b => b.x === _rrx && b.y === _rry);
        if (_rrBb) {
          const _potItem = { name: _pot.name, type: "potion", effect: _pot.effect, value: _pot.value || 0, tile: _pot.tile, id: uid() };
          if (bbFn) bbFn(_rrBb, _potItem, dg, ml);
          else dg.items.push({ ..._potItem, x: _rrx, y: _rry });
          return;
        }
        _splX = _rrx; _splY = _rry;
        if (_rrx === m.x && _rry === m.y) break;
        if (dg.monsters.find(o => o !== _mirrorMon && o.x === _rrx && o.y === _rry)) break;
        _rrx += _rrdx; _rry += _rrdy;
      }
      splashPotion(dg, _splX, _splY, _pot.effect, _pot.value, pl, ml, null, false, false, null, _mirrorMon);
      return;
    }
    const _hitMon = dg.monsters.find(o => o !== m && o.x === _cx && o.y === _cy);
    if (_hitMon || (_cx === pl.x && _cy === pl.y)) {
      splashPotion(dg, _cx, _cy, _pot.effect, _pot.value, pl, ml, null, false, false, null, m);
      return;
    }
  }
  splashPotion(dg, _lastX, _lastY, _pot.effect, _pot.value, pl, ml, null, false, false, null, m);
}

/* ===== モンスター近接攻撃ヘルパー ===== */
function monsterAttackPlayer(m, dg, pl, ml, msgFn, { skipVuln = false, skipThorn = false, onPlayerHit, onPlayerMiss, luFn = null } = {}) {
  pl._dashInterrupt = true; /* 攻撃試行（ミス含む）でダッシュ中断 */
  /* dodge: 25% 完全回避 */
  if (hasAbility(pl.armor, "dodge") && Math.random() < 0.25) {
    ml.push(`${m.name}の攻撃をひらりとかわした！`);
    onPlayerMiss?.(m);
    return;
  }
  /* オリーブオイル回避: 15% */
  if ((pl.oliveEvasionTurns || 0) > 0 && Math.random() < 0.15) {
    ml.push(`オリーブオイルの力で${m.name}の攻撃をするりとかわした！`);
    onPlayerMiss?.(m);
    return;
  }
  /* 10% ミス */
  if (Math.random() >= 0.90) {
    ml.push(`${m.name}の攻撃は外れた！`);
    onPlayerMiss?.(m);
    return;
  }
  const pdef = calcPlayerDef(pl);
  let dmg = calcAtkDefDmg(m.atk, pdef, { defWeight: 1.5 });
  if (!skipVuln) {
    const vulnPc = findVulnPentacle(dg, pl.x, pl.y);
    if (vulnPc) dmg = vulnPc.cursed ? Math.max(1, Math.floor(dmg / 2)) : dmg * (vulnPc.blessed ? 4 : 2);
  }
  /* 脆弱：近接ダメージ+3 */
  if (hasAbility(pl.armor, "frail")) dmg += 3;
  /* 祝福防具：近接ダメージ-2 */
  if (pl.armor?.blessed) dmg = Math.max(1, dmg - 2);
  /* タトゥーバード: 25%で痛恨の一撃（ダメージ2倍） */
  const _tbCrit = m.subtype === "tattoobird" && Math.random() < 0.25;
  if (_tbCrit) dmg *= 2;
  /* 平和の指輪：受ける近接ダメージ半減 */
  if (hasRingEffect(pl, "peace_ring")) dmg = Math.max(1, Math.floor(dmg / 2));
  /* 凍結：物理ダメージ2倍 */
  const _fzLbl = frozenPhysicalLabel(pl);
  dmg = applyFrozenPhysicalMult(dmg, pl);
  pl.deathCause = `${m.name}の攻撃で`;
  pl.hp -= dmg;
  onPlayerHit?.(dmg, m);
  /* 痛恨はダメージ数値の前：〜の攻撃！痛恨の一撃！Nダメージ！ */
  let _hitMsg = msgFn(dmg);
  if (_tbCrit) _hitMsg = _hitMsg.replace(/(\d+)ダメージ！/, "痛恨の一撃！$1ダメージ！");
  if (_fzLbl && !_hitMsg.includes("凍結")) _hitMsg = _hitMsg.replace(/(\d+ダメージ！)/, `$1${_fzLbl}`);
  ml.push(_hitMsg);
  if (!skipThorn && hasAbility(pl.armor, "thorn") && dmg > 0) {
    const td = Math.max(1, Math.floor(dmg / 3));
    m.hp -= td;
    ml.push(`反射で${m.name}に${td}ダメージ！`);
    if (m.hp <= 0) killMonster(m, dg, pl, ml, luFn);
  }
  if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("衝撃で目が覚めた！"); }
  if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("衝撃で金縛りが解けた！"); }
  /* 火ダルマ：炎属性攻撃 — 所持品への火ダメ＋油まみれボーナス */
  if (m.baseKind === "firedemon" && dmg > 0) {
    if ((pl.curryFireResTurns || 0) > 0) dmg = Math.max(1, Math.floor(dmg / 2));
    if (!hasFireResist(pl)) applyLightningToInventory(pl, dg, ml, null, null, true);
    const _oilyMult = (pl.oilyTurns || 0) > 0 || dg.oilyTiles?.some(t => t.x === pl.x && t.y === pl.y) ? 2 : 1;
    if (_oilyMult > 1) {
      const _bonusDmg = Math.max(1, Math.floor(dmg * 0.5));
      pl.hp -= _bonusDmg;
      ml.push(`油まみれに炎が燃え移った！${_bonusDmg}ダメージ！`);
    }
  }
  /* ノッカー：攻撃後にプレイヤーを2〜4マス吹き飛ばす */
  if (m.subtype === "knocker" && dmg > 0) {
    const _knLvl = m.monLevel || 1;
    const _knDist = _knLvl >= 3 ? 4 : _knLvl >= 2 ? 3 : 2;
    const _kndx = Math.sign(pl.x - m.x), _kndy = Math.sign(pl.y - m.y);
    if (_kndx !== 0 || _kndy !== 0) {
      let _knx = pl.x, _kny = pl.y, _knMoved = 0;
      for (let _ki = 0; _ki < _knDist; _ki++) {
        const _nx = _knx + _kndx, _ny = _kny + _kndy;
        if (_nx < 0 || _nx >= MW || _ny < 0 || _ny >= MH ||
            dg.map[_ny][_nx] === T.WALL || dg.map[_ny][_nx] === T.BWALL) {
          pl.deathCause = "吹き飛ばされての壁への激突により";
          pl.hp -= 5;
          ml.push("壁に叩きつけられた！5ダメージ！");
          break;
        }
        if (dg.monsters.some(mn => mn !== m && mn.x === _nx && mn.y === _ny)) {
          pl.deathCause = "吹き飛ばされてモンスターへの衝突により";
          pl.hp -= 5;
          ml.push("モンスターに激突した！5ダメージ！");
          break;
        }
        _knx = _nx; _kny = _ny; _knMoved++;
      }
      if (_knMoved > 0) {
        pl.x = _knx; pl.y = _kny;
        ml.push(`${m.name}の一撃で${_knMoved}マス吹き飛ばされた！`);
      }
    }
  }
  /* ボス固有攻撃エフェクト */
  if (dmg > 0) {
    if (m.baseKind === "boss_blaze" && Math.random() < 0.35) {
      if ((pl.yogurtImmuneTurns || 0) > 0) {
        ml.push(`${m.name}の鋭い爪が頭を掻いた！しかし乳酸菌が混乱を防いだ！`);
      } else {
        pl.confusedTurns = (pl.confusedTurns || 0) + 3;
        ml.push(`${m.name}の鋭い爪で頭を掻かれた！混乱した！(3ターン)`);
      }
    }
    if (m.baseKind === "boss_demonking" && Math.random() < 0.25) {
      const _pt = rng(2, 4);
      pl.paralyzeTurns = (pl.paralyzeTurns || 0) + _pt;
      ml.push(`魔神王の一撃が魂を縛った！金縛りになった！(${_pt}ターン)`);
    }
    if (m.baseKind === "boss_warlord" && Math.random() < 0.30) {
      pl.defSoftenedTurns = (pl.defSoftenedTurns || 0) + 8;
      ml.push(`魔将軍の刃が鎧を砕いた！防御力が半減した！(8ターン)`);
    }
    if (m.baseKind === "boss_skullking" && Math.random() < 0.35) {
      const _drain = Math.min(20, pl.hp - 1);
      if (_drain > 0) { pl.hp -= _drain; m.hp = Math.min(m.maxHp, m.hp + _drain); ml.push(`骸骨王が命を吸い取った！${_drain}HP吸収！`); }
    }
    if (m.baseKind === "boss_flamedragon") {
      const _oily = (pl.oilyTurns || 0) > 0 || dg.oilyTiles?.some(t => t.x === pl.x && t.y === pl.y);
      if (_oily) {
        const _xdmg = Math.max(1, Math.floor(dmg * 0.5));
        pl.deathCause = `${m.name}の炎攻撃により`;
        pl.hp -= _xdmg;
        ml.push(`油が引火して追加炎ダメージ！${_xdmg}ダメージ！`);
      }
    }
    if (m.baseKind === "boss_voidmonk" && Math.random() < 0.25) {
      pl.sealedTurns = (pl.sealedTurns || 0) + 12;
      ml.push(`虚無の僧侶の呪いが魔力を封じた！魔法が封印された！(12ターン)`);
    }
    if (m.baseKind === "boss_infernoking" && Math.random() < 0.40) {
      if (hasRingEffect(pl, "antidote_ring")) {
        ml.push(`煉獄公の爪に毒が！しかし指輪が毒を消した！`);
      } else if ((pl.yogurtImmuneTurns || 0) > 0) {
        ml.push(`煉獄公の爪に毒が！しかし乳酸菌が毒を防いだ！`);
      } else {
        pl.poisoned = true;
        ml.push(`煉獄公の爪に毒が！毒を受けた！攻撃力が徐々に下がっていく…`);
      }
    }
    if (m.baseKind === "boss_abyssgod") {
      if (Math.random() < 0.35) {
        const _pt = rng(2, 3);
        pl.paralyzeTurns = (pl.paralyzeTurns || 0) + _pt;
        ml.push(`深淵神の一撃が意識を蝕んだ！金縛りになった！(${_pt}ターン)`);
      }
      if (Math.random() < 0.25) {
        pl.defSoftenedTurns = (pl.defSoftenedTurns || 0) + 10;
        ml.push(`深淵神の呪いで防御が崩れた！防御力が半減した！(10ターン)`);
      }
    }
    /* 中級ボス固有 on-hit */
    if (m.baseKind === "im_boss_titan" && Math.random() < 0.35) {
      pl.immobileTurns = (pl.immobileTurns || 0) + 3;
      ml.push(`${m.name}の強烈な一撃！移動封じ！(3ターン)`);
    }
  }
  /* 吹き飛ばしの魔方陣：近接攻撃を受けたプレイヤーを吹き飛ばす */
  if (dg.pentacles?.length > 0 && dmg > 0 && !inMagicSealRoom(pl.x, pl.y, dg)) {
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
 *                         | "thief" | "goldthief" | "runner" | "itemblast" | "stealthrower"
 *                         (特殊AIが必要なら monsterAI に追記)
 *        wandEffect: subtype:"wanduser" のとき使う杖エフェクト名
 *   2. 同じエントリの levels: [...] にLv2・Lv3のテンプレートを記述
 *      (省略するとレベルアップ不可)
 *   3. 特殊AIが必要なら monsterAI() の subtype 判定ブロックに追加
 * ────────────────────────────────────────────────────────────────
 */
/* ── 各モンスターに minFloor / maxFloor を設定。
 *    pickMonsterDef(depth) が範囲フィルタ＋lv2/lv3スポーン確率を計算する。
 *    コメントの「N〜M階」は minFloor〜maxFloor に対応。
 * ── */
export const MONS = [
  { name: "ネズミ",       hp: 7,   atk: 5,  def: 0,  exp: 3,   speed: 1,   tile: 6,  kind: "beast",    baseKind: "rat",          monLevel: 1, minFloor: 1,  maxFloor: 10, dungeonFloors: { beginner: { min: 1, max: 3 }, intermediate: { min: 1, max: 4 }, advanced: { min: 1, max: 3 } },
    levels: [
      { name: "殺人ネズミ",         hp: 35,  atk: 15, def: 4,  exp: 18, dungeonFloors: { advanced: { min: 8, max: 9 } } },
      { name: "ものすごいネズミ",   hp: 52,  atk: 21, def: 7,  exp: 32, dungeonFloors: { advanced: { min: 14, max: 15 } } },
    ],
  },
  { name: "バット",       hp: 8,   atk: 5,  def: 0,  exp: 4,   speed: 1,   tile: 103, kind: "beast",   baseKind: "bat",           monLevel: 1, minFloor: 1,  maxFloor: 9,  float: true, dungeonFloors: { beginner: { min: 1, max: 4 }, intermediate: { min: 1, max: 7 }, advanced: { min: 1, max: 4 } },
    levels: [
      { name: "青バット",               hp: 30,  atk: 14, def: 3,  exp: 16, dungeonFloors: { advanced: { min: 7, max: 9 } } },
      { name: "ゴルァバット",           hp: 46,  atk: 20, def: 6,  exp: 28, dungeonFloors: { advanced: { min: 13, max: 15 } } },
    ],
  },
  { name: "ムカデ",       hp: 10,  atk: 4,  def: 2,  exp: 5,   speed: 1,   tile: 12,  kind: "beast",   baseKind: "centipede",     monLevel: 1, minFloor: 1,  maxFloor: 9,  dungeonFloors: { beginner: { min: 2, max: 5 }, intermediate: { min: 1, max: 7 }, advanced: { min: 1, max: 5 } },
    levels: [
      { name: "大ムカデ",               hp: 26,  atk: 11, def: 10, exp: 22, dungeonFloors: { advanced: { min: 9, max: 11 } } },
      { name: "覇ムカデ",               hp: 40,  atk: 17, def: 16, exp: 38, dungeonFloors: { advanced: { min: 15, max: 17 } } },
    ],
  },
  { name: "マイナーダイミョウ", hp: 30,  atk: 17, def: 3,  exp: 42,  speed: 1,   tile: 39,  kind: "humanoid", baseKind: "itemblaster",  monLevel: 1, minFloor: 6,  maxFloor: 22, subtype: "itemblast", dungeonFloors: { beginner: null, intermediate: { min: 11, max: 16 }, advanced: { min: 7, max: 15 } },
    levels: [
      { name: "メジャーダイミョウ",     hp: 48,  atk: 23, def: 5,  exp: 68,  dungeonFloors: { advanced: { min: 27, max: 29 } } },
      { name: "ミフネ",                 hp: 70,  atk: 29, def: 8,  exp: 98  },
    ],
  },
  { name: "盗投士",       hp: 28,  atk: 16, def: 3,  exp: 45,  speed: 1,   tile: 69, kind: "humanoid", baseKind: "stealthrower", monLevel: 1, minFloor: 8,  maxFloor: 24, subtype: "stealthrower", dungeonFloors: { beginner: null, intermediate: { min: 12, max: 17 }, advanced: { min: 9, max: 17 } },
    levels: [
      { name: "大盗投士",               hp: 46,  atk: 22, def: 5,  exp: 72,  dungeonFloors: { advanced: { min: 24, max: 26 } } },
      { name: "覇盗投士",               hp: 67,  atk: 29, def: 8,  exp: 108 },
    ],
  },
  { name: "コボルド",     hp: 15,  atk: 8,  def: 2,  exp: 10,  speed: 1,   tile: 7,  kind: "humanoid", baseKind: "kobold",        monLevel: 1, minFloor: 2,  maxFloor: 13, dungeonFloors: { beginner: { min: 3, max: 6 }, intermediate: { min: 3, max: 9 }, advanced: { min: 4, max: 5 } },
    levels: [
      { name: "コボルド戦士",       hp: 38,  atk: 17, def: 8,  exp: 24, dungeonFloors: { advanced: { min: 10, max: 11 } } },
      { name: "コボルド族長",       hp: 60,  atk: 25, def: 13, exp: 42, dungeonFloors: { advanced: { min: 16, max: 17 } } },
    ],
  },
  { name: "ゴブリン",     hp: 23,  atk: 16, def: 5,  exp: 20,  speed: 1,   tile: 8,  kind: "humanoid", baseKind: "goblin",        monLevel: 1, minFloor: 3,  maxFloor: 16, dungeonFloors: { beginner: { min: 4, max: 7 }, intermediate: { min: 3, max: 10 }, advanced: { min: 5, max: 7 } },
    levels: [
      { name: "ゴブリン頭",         hp: 50,  atk: 21, def: 9,  exp: 34, dungeonFloors: { advanced: { min: 12, max: 13 } } },
      { name: "ゴブリン王",         hp: 80,  atk: 28, def: 11, exp: 58, dungeonFloors: { advanced: { min: 18, max: 20 } } },
    ],
  },
  { name: "インプ",       hp: 26,  atk: 18, def: 4,  exp: 28,  speed: 2,   tile: 53, kind: "beast",    baseKind: "imp",           monLevel: 1, minFloor: 3,  maxFloor: 17, float: true, dungeonFloors: { beginner: { min: 8, max: 10 }, intermediate: { min: 6, max: 12 }, advanced: { min: 5, max: 12 } },
    levels: [
      { name: "強インプ",           hp: 42,  atk: 23, def: 7,  exp: 45, dungeonFloors: { advanced: { min: 15, max: 18 } } },
      { name: "覇インプ",           hp: 65,  atk: 30, def: 11, exp: 70, dungeonFloors: { advanced: { min: 20, max: 22 } } },
    ],
  },
  { name: "スケルトン",   hp: 24,  atk: 19, def: 5,  exp: 25,  speed: 1,   tile: 9,  kind: "undead",   baseKind: "skeleton",      monLevel: 1, minFloor: 4,  maxFloor: 18, dungeonFloors: { beginner: { min: 6, max: 9 }, intermediate: { min: 4, max: 11 }, advanced: { min: 5, max: 12 } },
    levels: [
      { name: "強スケルトン",       hp: 39,  atk: 26, def: 9,  exp: 40, dungeonFloors: { advanced: { min: 15, max: 18 } } },
      { name: "アンデッドナイト",   hp: 61,  atk: 32, def: 13, exp: 62, dungeonFloors: { advanced: { min: 20, max: 22 } } },
    ],
  },
  { name: "フクマル",     hp: 11,  atk: 0,  def: 0,  exp: 50,  speed: 2,   tile: 70, kind: "beast",    baseKind: "runner",        monLevel: 1, minFloor: 5,  maxFloor: 30, subtype: "runner", dungeonFloors: { beginner: { min: 5, max: 8 }, intermediate: { min: 4, max: 18 }, advanced: { min: 4, max: 22 } },
    levels: [
      { name: "フクフクマル",       hp: 16,  atk: 0,  def: 0,  exp: 80,  dungeonFloors: { advanced: { min: 17, max: 19 } } },
      { name: "コイトフクマル",     hp: 24,  atk: 0,  def: 0,  exp: 120, dungeonFloors: { advanced: { min: 20, max: 22 } } },
    ],
  },
  { name: "ゾンビ",       hp: 55,  atk: 24, def: 5,  exp: 45,  speed: 0.5, tile: 10, kind: "undead",   baseKind: "zombie",        monLevel: 1, minFloor: 6,  maxFloor: 19, elemWeak: "fire", dungeonFloors: { beginner: { min: 8, max: 10 }, intermediate: { min: 9, max: 15 }, advanced: { min: 5, max: 14 } },
    levels: [
      { name: "中ゾンビ",           hp: 85,  atk: 34, def: 12, exp: 72,  dungeonFloors: { advanced: { min: 17, max: 21 } } },
      { name: "強ゾンビ",           hp: 130, atk: 42, def: 18, exp: 110, dungeonFloors: { advanced: { min: 22, max: 24 } } },
    ],
  },
  { name: "ワッカ",       hp: 24,  atk: 17, def: 2,  exp: 28,  speed: 1,   tile: 67, kind: "beast",    baseKind: "wokka",         monLevel: 1, minFloor: 6,  maxFloor: 18, subtype: "stonethrow", dungeonFloors: { beginner: { min: 8, max: 10 }, intermediate: { min: 9, max: 14 }, advanced: { min: 6, max: 14 } },
    levels: [
      { name: "ぷにぷにワッカ",     hp: 38,  atk: 24, def: 5,  exp: 45 },
      { name: "シン・ワッカ",       hp: 61,  atk: 32, def: 7,  exp: 72 },
    ],
  },
  { name: "分裂スライム", hp: 30,  atk: 14, def: 2,  exp: 32,  speed: 1,   tile: 113, kind: "beast",    baseKind: "slime",         monLevel: 1, minFloor: 7,  maxFloor: 20, elemWeak: "fire", subtype: "splitter", dungeonFloors: { beginner: { min: 7, max: 10 }, intermediate: { min: 9, max: 15 }, advanced: { min: 6, max: 14 } },
    levels: [
      { name: "緑分裂スライム",     hp: 47,  atk: 22, def: 5,  exp: 51 },
      { name: "赤分裂スライム",     hp: 74,  atk: 29, def: 7,  exp: 80 },
    ],
  },
  { name: "アーチャー",   hp: 30,  atk: 18, def: 3,  exp: 34,  speed: 1,   tile: 39, kind: "humanoid", baseKind: "archer",        monLevel: 1, minFloor: 8,  maxFloor: 21, subtype: "archer", dungeonFloors: { beginner: { min: 7, max: 10 }, intermediate: { min: 6, max: 12 }, advanced: { min: 5, max: 12 } },
    levels: [
      { name: "古参アーチャー",     hp: 47,  atk: 25, def: 7,  exp: 54, dungeonFloors: { advanced: { min: 15, max: 20 } } },
      { name: "弓の達人",           hp: 74,  atk: 32, def: 12, exp: 85, dungeonFloors: { advanced: { min: 24, max: 26 } } },
    ],
  },
  { name: "ウルフ",       hp: 27,  atk: 20, def: 2,  exp: 40,  speed: 2,   tile: 56, kind: "beast",    baseKind: "wolf",          monLevel: 1, minFloor: 9,  maxFloor: 22, dungeonFloors: { beginner: null, intermediate: { min: 11, max: 17 }, advanced: { min: 7, max: 16 } },
    levels: [
      { name: "強ウルフ",           hp: 43,  atk: 28, def: 6,  exp: 64,  dungeonFloors: { advanced: { min: 19, max: 22 } } },
      { name: "フェンリル",         hp: 68,  atk: 36, def: 10, exp: 100, dungeonFloors: { advanced: { min: 24, max: 26 } } },
    ],
  },
  { name: "コソドロ",     hp: 16,  atk: 7,  def: 0,  exp: 35,  speed: 2,   tile: 69, kind: "humanoid", baseKind: "thief",         monLevel: 1, minFloor: 9,  maxFloor: 20, subtype: "thief", dungeonFloors: { beginner: null, intermediate: { min: 11, max: 16 }, advanced: { min: 7, max: 16 } },
    levels: [
      { name: "大盗賊",             hp: 27,  atk: 11, def: 2,  exp: 56  },
      { name: "怪盗",               hp: 43,  atk: 14, def: 3,  exp: 88  },
    ],
  },
  { name: "レプラコーン", hp: 20,  atk: 9,  def: 1,  exp: 38,  speed: 2,   tile: 109, kind: "humanoid", baseKind: "leprechaun",    monLevel: 1, minFloor: 11, maxFloor: 24, subtype: "goldthief", dungeonFloors: { beginner: null, intermediate: { min: 11, max: 17 }, advanced: { min: 7, max: 16 } },
    levels: [
      { name: "強レプラコーン",       hp: 33,  atk: 13, def: 3,  exp: 61  },
      { name: "覇レプラコーン",       hp: 52,  atk: 17, def: 5,  exp: 95  },
    ],
  },
  { name: "錆虫",         hp: 24,  atk: 13, def: 2,  exp: 40,  speed: 1,   tile: 75, kind: "beast",    baseKind: "rustbug",       monLevel: 1, minFloor: 10, maxFloor: 23, elemWeak: "thunder", subtype: "ruster", dungeonFloors: { beginner: null, intermediate: { min: 11, max: 17 }, advanced: { min: 8, max: 17 } },
    levels: [
      { name: "強錆虫",             hp: 39,  atk: 18, def: 5,  exp: 64,  dungeonFloors: { advanced: { min: 21, max: 23 } } },
      { name: "覇錆虫",             hp: 61,  atk: 25, def: 7,  exp: 100 },
    ],
  },
  { name: "ウィザード",   hp: 24,  atk: 17, def: 3,  exp: 42,  speed: 1,   tile: 40, kind: "humanoid", baseKind: "wizard",        monLevel: 1, minFloor: 11, maxFloor: 24, subtype: "wanduser", wandEffect: "lightning", dungeonFloors: { intermediate: { min: 11, max: 17 }, advanced: { min: 9, max: 17 } },
    levels: [
      { name: "強ウィザード",       hp: 39,  atk: 24, def: 7,  exp: 67,  dungeonFloors: { advanced: { min: 22, max: 25 } } },
      { name: "大魔導士",           hp: 61,  atk: 29, def: 12, exp: 105 },
    ],
  },
  { name: "ボムスライム", hp: 38,  atk: 14, def: 2,  exp: 55,  speed: 1,   tile: 114, kind: "beast",    baseKind: "bombslime",     monLevel: 1, minFloor: 11, maxFloor: 24, elemWeak: "fire", subtype: "deathbomb", dungeonFloors: { intermediate: { min: 13, max: 18 }, advanced: { min: 10, max: 19 } },
    levels: [
      { name: "強ボムスライム",     hp: 61,  atk: 22, def: 3,  exp: 88  },
      { name: "覇ボムスライム",     hp: 95,  atk: 29, def: 5,  exp: 138 },
    ],
  },
  { name: "ボルガ",       hp: 28,  atk: 12, def: 0,  exp: 60,  speed: 1,   tile: 8,  kind: "humanoid", baseKind: "bombgoblin",    monLevel: 1, minFloor: 12, maxFloor: 26, subtype: "kamikaze", dungeonFloors: { intermediate: { min: 13, max: 18 }, advanced: { min: 10, max: 19 } },
    levels: [
      { name: "ボルガ博士",         hp: 48,  atk: 18, def: 2,  exp: 96,  speed: 1 },
      { name: "頭の中にダイナマイト", hp: 75, atk: 24, def: 4,  exp: 150 },
    ],
  },
  { name: "水晶スライム", hp: 5,   atk: 18, def: 0,  exp: 50,  speed: 1,   tile: 115, kind: "beast",    baseKind: "crystalslime",  monLevel: 1, minFloor: 13, maxFloor: 26, elemWeak: "fire", fixedDamageOnly: true, dungeonFloors: { intermediate: { min: 13, max: 18 }, advanced: { min: 10, max: 19 } },
    levels: [
      { name: "強水晶スライム",     hp: 8,   atk: 25, def: 0,  exp: 80  },
      { name: "覇水晶スライム",     hp: 11,  atk: 32, def: 0,  exp: 125 },
    ],
  },
  { name: "ゴースト",     hp: 38,  atk: 18, def: 5,  exp: 45,  speed: 1,   tile: 68, kind: "undead",   baseKind: "rockspirit",    monLevel: 1, minFloor: 14, maxFloor: 28, wallWalker: true, dungeonFloors: { intermediate: { min: 13, max: 19 }, advanced: { min: 10, max: 20 } },
    levels: [
      { name: "ファントム",         hp: 61,  atk: 25, def: 9,  exp: 72  },
      /* 長居罰の最上位壁抜け：高耐久・高火力・2行動。壁・他敵を迂回して接近 */
      { name: "ミラージュ",         hp: 160, atk: 50, def: 22, exp: 220, speed: 2 },
    ],
  },
  { name: "オーク",       hp: 41,  atk: 22, def: 7,  exp: 48,  speed: 1,   tile: 11, kind: "humanoid", baseKind: "orc",           monLevel: 1, minFloor: 14, maxFloor: 26, dungeonFloors: { intermediate: { min: 13, max: 19 }, advanced: { min: 10, max: 19 } },
    levels: [
      { name: "オーク将",           hp: 65,  atk: 31, def: 12, exp: 77,  dungeonFloors: { advanced: { min: 22, max: 24 } } },
      { name: "オーク王",           hp: 101, atk: 40, def: 16, exp: 120, dungeonFloors: { advanced: { min: 25, max: 26 } } },
    ],
  },
  { name: "ゼラチンキューブ", hp: 81, atk: 22, def: 5, exp: 70,  speed: 0.5, tile: 79, kind: "beast", baseKind: "gelcube",       monLevel: 1, minFloor: 15, maxFloor: 50, elemWeak: "fire", dungeonFloors: { intermediate: { min: 15, max: 19 }, advanced: { min: 12, max: 22 } },
    levels: [
      { name: "強ゼラチンキューブ", hp: 130, atk: 31, def: 9,  exp: 112, dungeonFloors: { advanced: { min: 25, max: 27 } } },
      { name: "覇ゼラチンキューブ", hp: 203, atk: 40, def: 13, exp: 175, dungeonFloors: { advanced: { min: 28, max: 29 } } },
    ],
  },
  { name: "岩砕き",       hp: 68,  atk: 28, def: 7,  exp: 65,  speed: 0.5, tile: 76, kind: "beast",    baseKind: "walldigger",    monLevel: 1, minFloor: 16, maxFloor: 50, wallDigger: true, dungeonFloors: { intermediate: { min: 15, max: 19 }, advanced: { min: 12, max: 23 } },
    levels: [
      { name: "強岩砕き",           hp: 108, atk: 38, def: 12, exp: 104 },
      { name: "覇岩砕き",           hp: 169, atk: 50, def: 16, exp: 163 },
    ],
  },
  { name: "罠師",         hp: 34,  atk: 18, def: 3,  exp: 48,  speed: 1,   tile: 86, kind: "humanoid", baseKind: "trapmaster",    monLevel: 1, minFloor: 16, maxFloor: 50, subtype: "trapmaster", dungeonFloors: { intermediate: { min: 15, max: 19 }, advanced: { min: 12, max: 22 } },
    levels: [
      { name: "罠の達人",           hp: 54,  atk: 25, def: 7,  exp: 77  },
      { name: "罠の覇者",           hp: 85,  atk: 32, def: 12, exp: 120 },
    ],
  },
  { name: "大蛇",         hp: 47,  atk: 24, def: 5,  exp: 52,  speed: 1,   tile: 12, kind: "beast",    baseKind: "serpent",       monLevel: 1, minFloor: 17, maxFloor: 50, maxAttacks: 2, dungeonFloors: { intermediate: { min: 15, max: 19 }, advanced: { min: 12, max: 22 } },
    levels: [
      { name: "強大蛇",             hp: 76,  atk: 32, def: 9,  exp: 83  },
      { name: "覇大蛇",             hp: 119, atk: 42, def: 13, exp: 130 },
    ],
  },
  { name: "ゴールドタイガー", hp: 38,  atk: 20, def: 5,  exp: 55,  speed: 1,   tile: 39, kind: "humanoid", baseKind: "trapthrower",   monLevel: 1, minFloor: 18, maxFloor: 50, subtype: "trapthrower", dungeonFloors: { intermediate: { min: 17, max: 20 }, advanced: { min: 14, max: 24 } },
    levels: [
      { name: "ずっと見てタイガー", hp: 61,  atk: 28, def: 9,  exp: 88  },
      { name: "よく頑張っタイガー", hp: 95,  atk: 36, def: 13, exp: 138 },
    ],
  },
  { name: "呪術師",       hp: 34,  atk: 17, def: 5,  exp: 55,  speed: 1,   tile: 44, kind: "humanoid", baseKind: "witchdoc",      monLevel: 1, minFloor: 18, maxFloor: 50, subtype: "wanduser", wandEffect: "curse_wand", dungeonFloors: { intermediate: { min: 17, max: 20 }, advanced: { min: 14, max: 24 } },
    levels: [
      { name: "強呪術師",           hp: 54,  atk: 24, def: 9,  exp: 88  },
      { name: "大呪術師",           hp: 85,  atk: 29, def: 13, exp: 138 },
    ],
  },
  { name: "解装士",       hp: 38,  atk: 20, def: 5,  exp: 58,  speed: 1,   tile: 59, kind: "humanoid", baseKind: "disarmer",      monLevel: 1, minFloor: 19, maxFloor: 50, subtype: "disarmer", dungeonFloors: { intermediate: { min: 18, max: 20 }, advanced: { min: 15, max: 25 } },
    levels: [
      { name: "強解装士",           hp: 61,  atk: 28, def: 9,  exp: 93  },
      { name: "覇解装士",           hp: 95,  atk: 36, def: 13, exp: 145 },
    ],
  },
  { name: "かいりきベア", hp: 43,  atk: 22, def: 6,  exp: 62,  speed: 1,   tile: 11, kind: "humanoid", baseKind: "monsterthrow",  monLevel: 1, minFloor: 20, maxFloor: 50, subtype: "monsterthrow", dungeonFloors: { intermediate: { min: 18, max: 20 }, advanced: { min: 15, max: 25 } },
    levels: [
      { name: "かいりきベア・セブン", hp: 69,  atk: 31, def: 10, exp: 99  },
      { name: "かいりきベア・イレブン", hp: 108, atk: 40, def: 14, exp: 155 },
    ],
  },
  { name: "シャーマン",   hp: 41,  atk: 17, def: 5,  exp: 60,  speed: 1,   tile: 55, kind: "humanoid", baseKind: "shaman",        monLevel: 1, minFloor: 21, maxFloor: 50, subtype: "supporter", dungeonFloors: { intermediate: { min: 17, max: 20 }, advanced: { min: 14, max: 24 } },
    levels: [
      { name: "強シャーマン",       hp: 65,  atk: 24, def: 9,  exp: 96  },
      { name: "大シャーマン",       hp: 101, atk: 29, def: 13, exp: 150 },
    ],
  },
  { name: "合成獣",       hp: 54,  atk: 20, def: 5,  exp: 80,  speed: 0.5, tile: 80, kind: "beast",    baseKind: "synthmonster",  monLevel: 1, minFloor: 21, maxFloor: 50, dungeonFloors: { advanced: { min: 16, max: 26 } },
    levels: [
      { name: "強合成獣",           hp: 86,  atk: 29, def: 9,  exp: 128 },
      { name: "覇合成獣",           hp: 135, atk: 38, def: 13, exp: 200 },
    ],
  },
  { name: "バリア蟹",     hp: 43,  atk: 20, def: 3,  exp: 68,  speed: 1,   tile: 54, kind: "humanoid", baseKind: "barriermage",   monLevel: 1, minFloor: 22, maxFloor: 50, barrier: 1, dungeonFloors: { intermediate: { min: 18, max: 20 }, advanced: { min: 16, max: 27 } },
    levels: [
      { name: "シールド蟹",         hp: 69,  atk: 28, def: 6,  exp: 109, barrier: 2 },
      { name: "なんでも無効蟹",     hp: 108, atk: 36, def: 9,  exp: 170, barrier: 3 },
    ],
  },
  { name: "ウィンドメイジ", hp: 38, atk: 20, def: 5, exp: 65,  speed: 1,   tile: 54, kind: "humanoid", baseKind: "windmage",     monLevel: 1, minFloor: 23, maxFloor: 50, subtype: "wanduser", wandEffect: "blowback_wand", dungeonFloors: { intermediate: { min: 18, max: 20 }, advanced: { min: 17, max: 27 } },
    levels: [
      { name: "強ウィンドメイジ",   hp: 61,  atk: 28, def: 9,  exp: 104 },
      { name: "風の覇者",           hp: 95,  atk: 36, def: 13, exp: 163 },
    ],
  },
  { name: "混乱術師",     hp: 41,  atk: 20, def: 5,  exp: 72,  speed: 1,   tile: 81, kind: "humanoid", baseKind: "confusemage",   monLevel: 1, minFloor: 23, maxFloor: 50, subtype: "wanduser", wandEffect: "confuse_wand", dungeonFloors: { intermediate: { min: 17, max: 20 }, advanced: { min: 17, max: 27 } },
    levels: [
      { name: "強混乱術師",         hp: 65,  atk: 28, def: 9,  exp: 115 },
      { name: "大混乱術師",         hp: 101, atk: 35, def: 13, exp: 180 },
    ],
  },
  { name: "引きダコ",     hp: 61,  atk: 24, def: 6,  exp: 75,  speed: 1,   tile: 78, kind: "beast",    baseKind: "puller",        monLevel: 1, minFloor: 24, maxFloor: 50, subtype: "puller", dungeonFloors: { intermediate: { min: 18, max: 20 }, advanced: { min: 15, max: 25 } },
    levels: [
      { name: "強引きダコ",         hp: 97,  atk: 32, def: 10, exp: 120 },
      { name: "覇引きダコ",         hp: 153, atk: 43, def: 14, exp: 188 },
    ],
  },
  { name: "眠り術師",     hp: 43,  atk: 22, def: 6,  exp: 80,  speed: 1,   tile: 82, kind: "humanoid", baseKind: "sleepmage",     monLevel: 1, minFloor: 25, maxFloor: 50, subtype: "wanduser", wandEffect: "sleep_wand", dungeonFloors: { intermediate: { min: 19, max: 20 }, advanced: { min: 17, max: 27 } },
    levels: [
      { name: "強眠り術師",         hp: 69,  atk: 29, def: 10, exp: 128 },
      { name: "大眠り術師",         hp: 108, atk: 36, def: 16, exp: 200 },
    ],
  },
  { name: "トロル",       hp: 68,  atk: 29, def: 9,  exp: 75,  speed: 1,   tile: 13, kind: "humanoid", baseKind: "troll",         monLevel: 1, minFloor: 25, maxFloor: 50, dungeonFloors: { intermediate: { min: 19, max: 20 }, advanced: { min: 17, max: 27 } },
    levels: [
      { name: "強トロル",           hp: 108, atk: 40, def: 13, exp: 120 },
      { name: "覇トロル",           hp: 169, atk: 53, def: 17, exp: 188 },
    ],
  },
  { name: "火ダルマ",     hp: 74,  atk: 36, def: 6,  exp: 110, speed: 1,   tile: 61, kind: "beast",    baseKind: "firedemon",     monLevel: 1, minFloor: 25, maxFloor: 50, float: true, elemWeak: "ice", dungeonFloors: { intermediate: { min: 19, max: 20 }, advanced: { min: 17, max: 27 } },
    levels: [
      { name: "獄炎ダルマ",         hp: 119, atk: 50, def: 10, exp: 176 },
      { name: "煉獄ダルマ",         hp: 189, atk: 67, def: 14, exp: 275 },
    ],
  },
  { name: "転移術師",     hp: 47,  atk: 24, def: 6,  exp: 90,  speed: 1,   tile: 83, kind: "humanoid", baseKind: "warpmage",      monLevel: 1, minFloor: 26, maxFloor: 50, subtype: "wanduser", wandEffect: "teleport_wand", dungeonFloors: { advanced: { min: 19, max: 29 } },
    levels: [
      { name: "強転移術師",         hp: 76,  atk: 31, def: 10, exp: 144 },
      { name: "大転移術師",         hp: 117, atk: 38, def: 16, exp: 225 },
    ],
  },
  { name: "ガーゴイル",   hp: 88,  atk: 32, def: 16, exp: 90,  speed: 0.5, tile: 52, kind: "undead",   baseKind: "gargoyle",      monLevel: 1, minFloor: 26, maxFloor: 50, float: true, dungeonFloors: { advanced: { min: 19, max: 29 } },
    levels: [
      { name: "強ガーゴイル",       hp: 140, atk: 46, def: 21, exp: 144 },
      { name: "覇ガーゴイル",       hp: 220, atk: 58, def: 27, exp: 225 },
    ],
  },
  { name: "ヴァンパイア", hp: 81,  atk: 32, def: 10, exp: 92,  speed: 2,   tile: 15, kind: "undead",   baseKind: "vampire",       monLevel: 1, minFloor: 26, maxFloor: 50, maxAttacks: 2, float: true, dungeonFloors: { advanced: { min: 19, max: 29 } },
    levels: [
      { name: "強ヴァンパイア",     hp: 130, atk: 46, def: 14, exp: 147 },
      { name: "ヴァンパイア卿",     hp: 203, atk: 58, def: 19, exp: 230 },
    ],
  },
  { name: "ドラゴン",     hp: 122, atk: 43, def: 14, exp: 140, speed: 1,   tile: 14, kind: "dragon",   baseKind: "dragon",        monLevel: 1, minFloor: 27, maxFloor: 50, elemWeak: "ice", dungeonFloors: { advanced: { min: 22, max: 30 } },
    levels: [
      { name: "レッドドラゴン",       hp: 194, atk: 61, def: 19, exp: 224 },
      { name: "エンシェントドラゴン", hp: 304, atk: 78, def: 23, exp: 350 },
    ],
  },
  { name: "ゴーレム",     hp: 135, atk: 36, def: 23, exp: 115, speed: 0.5, tile: 57, kind: "beast",    baseKind: "golem",         monLevel: 1, minFloor: 27, maxFloor: 50, elemWeak: "thunder", dungeonFloors: { advanced: { min: 25, max: 30 } },
    levels: [
      { name: "強ゴーレム",         hp: 216, atk: 50, def: 28, exp: 184 },
      { name: "覇ゴーレム",         hp: 338, atk: 65, def: 34, exp: 288 },
    ],
  },
  { name: "デーモン",     hp: 108, atk: 50, def: 13, exp: 160, speed: 2,   tile: 58, kind: "beast",    baseKind: "daemon",        monLevel: 1, minFloor: 27, maxFloor: 50, maxAttacks: 3, float: true, dungeonFloors: { advanced: { min: 25, max: 30 } },
    levels: [
      { name: "強デーモン",         hp: 173, atk: 71, def: 19, exp: 256 },
      { name: "魔王",               hp: 270, atk: 90, def: 24, exp: 400 },
    ],
  },
  /* ===== 新型モンスター4種 ===== */
  { name: "からめ鬼",    hp: 55,  atk: 22, def: 10, exp: 55,  speed: 1,   tile: 108, kind: "beast",    baseKind: "grabber",       monLevel: 1, minFloor: 5,  maxFloor: 15, subtype: "grabber", dungeonFloors: { beginner: { min: 8, max: 10 }, intermediate: { min: 6, max: 13 }, advanced: { min: 6, max: 13 } },
    levels: [
      { name: "強からめ鬼",         hp: 88,  atk: 32, def: 14, exp: 88,  dungeonFloors: { advanced: { min: 16, max: 19 } } },
      { name: "覇からめ鬼",         hp: 138, atk: 43, def: 19, exp: 138, dungeonFloors: { advanced: { min: 20, max: 22 } } },
    ],
  },
  { name: "突進角獣",    hp: 62,  atk: 26, def: 8,  exp: 62,  speed: 1,   tile: 56, kind: "beast",    baseKind: "charger",       monLevel: 1, minFloor: 10, maxFloor: 35, subtype: "charger", dungeonFloors: { beginner: null, intermediate: { min: 11, max: 18 }, advanced: { min: 8, max: 18 } },
    levels: [
      { name: "強突進角獣",         hp: 99,  atk: 38, def: 12, exp: 99,  dungeonFloors: { advanced: { min: 23, max: 25 } } },
      { name: "覇突進角獣",         hp: 155, atk: 53, def: 16, exp: 155 },
    ],
  },
  { name: "ほっちもぺ",   hp: 68, atk: 24, def: 18, exp: 70, speed: 1,   tile: 57, kind: "beast",   baseKind: "reflector",     monLevel: 1, minFloor: 12, maxFloor: 45, subtype: "reflector", dungeonFloors: { intermediate: { min: 12, max: 18 }, advanced: { min: 9, max: 18 } },
    levels: [
      { name: "ほっちんもっぺ",     hp: 109, atk: 35, def: 24, exp: 112, dungeonFloors: { advanced: { min: 22, max: 26 } } },
      { name: "むちちむち",         hp: 170, atk: 46, def: 31, exp: 175 },
    ],
  },
  { name: "ハンマーオーガ", hp: 75, atk: 36, def: 9,  exp: 80,  speed: 1,   tile: 116, kind: "humanoid", baseKind: "knocker",      monLevel: 1, minFloor: 15, maxFloor: 50, subtype: "knocker", dungeonFloors: { intermediate: { min: 15, max: 19 }, advanced: { min: 12, max: 23 } },
    levels: [
      { name: "強ハンマーオーガ",   hp: 120, atk: 52, def: 13, exp: 128, dungeonFloors: { advanced: { min: 26, max: 28 } } },
      { name: "覇ハンマーオーガ",   hp: 188, atk: 67, def: 17, exp: 200 },
    ],
  },
  { name: "魔法反射師",   hp: 38,  atk: 19, def: 8,  exp: 75,  speed: 1,   tile: 55, kind: "humanoid", baseKind: "magicreflector", monLevel: 1, minFloor: 13, maxFloor: 50, subtype: "magicreflect", dungeonFloors: { intermediate: { min: 16, max: 20 }, advanced: { min: 12, max: 22 } },
    levels: [
      { name: "強魔法反射師",       hp: 61,  atk: 26, def: 13, exp: 120 },
      { name: "覇魔法反射師",       hp: 95,  atk: 35, def: 18, exp: 188 },
    ],
  },
  { name: "薬師",         hp: 30,  atk: 16, def: 3,  exp: 48,  speed: 1,   tile: 44, kind: "humanoid", baseKind: "potionthrower", monLevel: 1, minFloor: 10, maxFloor: 50, subtype: "potionthrow", dungeonFloors: { beginner: null, intermediate: { min: 11, max: 18 }, advanced: { min: 8, max: 18 } },
    levels: [
      { name: "ポーションメーカー", hp: 48,  atk: 22, def: 6,  exp: 76  },
      { name: "ポーションマスター", hp: 75,  atk: 29, def: 10, exp: 120 },
    ],
  },
  { name: "バーサーカー", hp: 55,  atk: 26, def: 8,  exp: 65,  speed: 1,   tile: 117, kind: "humanoid", baseKind: "berserker",     monLevel: 1, minFloor: 12, maxFloor: 45, subtype: "berserker", dungeonFloors: { advanced: { min: 11, max: 21 } },
    levels: [
      { name: "バーサーカー2",      hp: 90,  atk: 40, def: 13, exp: 104, dungeonFloors: { advanced: { min: 26, max: 27 } } },
      { name: "バーサーカー99",     hp: 145, atk: 58, def: 20, exp: 166, dungeonFloors: { advanced: { min: 28, max: 29 } } },
    ],
  },
  { name: "ルカチュウ", hp: 35, atk: 18, def: 4,  exp: 58,  speed: 1,   tile: 8, kind: "humanoid", baseKind: "killplaster",   monLevel: 1, minFloor: 12, maxFloor: 45, subtype: "defhalf", magicImmune: true, dungeonFloors: { advanced: { min: 11, max: 21 } },
    levels: [
      { name: "ラプラス",       hp: 56,  atk: 25, def: 7,  exp: 92,  dungeonFloors: { advanced: { min: 25, max: 27 } } },
      { name: "キラープラスター", hp: 88,  atk: 36, def: 11, exp: 148 },
    ],
  },
  { name: "ガーディアン",  hp: 48,  atk: 16, def: 14, exp: 70,  speed: 1,   tile: 59, kind: "humanoid", baseKind: "guardian",      monLevel: 1, minFloor: 10, maxFloor: 10, subtype: "guardian", dungeons: ["beginner"] },
  { name: "氷竜",         hp: 65,  atk: 32, def: 10, exp: 125, speed: 1,   tile: 14, kind: "beast",    baseKind: "icedragon",     monLevel: 1, minFloor: 18, maxFloor: 50, elemWeak: "thunder", dungeonFloors: { advanced: { min: 21, max: 30 } },
    levels: [
      { name: "ブルードラゴン",             hp: 105, atk: 44, def: 16, exp: 200 },
      { name: "ブルードラゴン 天界の七竜", hp: 168, atk: 58, def: 22, exp: 320 },
    ],
  },
  { name: "わてり",       hp: 40,  atk: 19, def: 6,  exp: 48,  speed: 1,   tile: 93, kind: "beast",    baseKind: "wateri",        monLevel: 1, minFloor: 6,  maxFloor: 20, elemWeak: "thunder", waterOnly: true, subtype: "watergunner", dungeonFloors: { beginner: null, intermediate: { min: 14, max: 19 }, advanced: { min: 12, max: 22 } },
    levels: [
      { name: "わてに",             hp: 64,  atk: 29, def: 10, exp: 77  },
      { name: "わてさん",           hp: 100, atk: 38, def: 14, exp: 120 },
    ],
  },
  /* ===== 視界操作モンスター ===== */
  { name: "スターライト", hp: 55,  atk: 26, def: 8,  exp: 80,  speed: 1,   tile: 53, kind: "beast",   baseKind: "starlight",     monLevel: 1, minFloor: 15, maxFloor: 50, float: true, dungeonFloors: { advanced: { min: 16, max: 27 } },
    desc: "同じ部屋にいるだけで周囲を明るく照らし続ける光の精霊。",
    levels: [
      { name: "スターライトⅡ",     hp: 88,  atk: 38, def: 12, exp: 128 },
      { name: "スターライトⅢ",     hp: 138, atk: 50, def: 17, exp: 200 },
    ],
  },
  { name: "ダークネス",   hp: 65,  atk: 30, def: 10, exp: 95,  speed: 1,   tile: 52, kind: "beast",   baseKind: "darkness",      monLevel: 1, minFloor: 20, maxFloor: 50, float: true, dungeonFloors: { advanced: { min: 21, max: 30 } },
    desc: "同じ部屋にいると周囲の光を喰らい、プレイヤーの視界を1マスに狭める闇の精霊。",
    levels: [
      { name: "ダークネスⅡ",       hp: 104, atk: 43, def: 15, exp: 152 },
      { name: "ダークネスⅢ",       hp: 163, atk: 56, def: 21, exp: 238 },
    ],
  },
  /* ===== タトゥーバード：回避+フェザーガード+痛恨の一撃 ===== */
  { name: "タトゥーバード", hp: 28,  atk: 12, def: 3,  exp: 42,  speed: 1,   tile: 112, kind: "beast",   baseKind: "tattoobird",    monLevel: 1, minFloor: 10, maxFloor: 30, float: true, subtype: "tattoobird", dungeonFloors: { beginner: null, intermediate: { min: 11, max: 18 }, advanced: { min: 8, max: 16 } },
    desc: "浮遊する鳥。近接攻撃を50%の確率でひらりとかわし、当たっても50%でフェザーガードが発動しダメージを半減。自身の攻撃は25%で痛恨の一撃。",
    levels: [
      { name: "スカーバード",   hp: 52,  atk: 21, def: 7,  exp: 78,  dungeonFloors: { intermediate: { min: 18, max: 20 }, advanced: { min: 14, max: 22 } } },
      { name: "クレストバード", hp: 85,  atk: 30, def: 13, exp: 135, speed: 2,  dungeonFloors: { advanced: { min: 22, max: 28 } } },
    ],
  },
  /* ===== ラクガキ魔：同部屋で自分の足元に魔方陣を描く ===== */
  { name: "ラクガキ魔",   hp: 22,  atk: 9,  def: 3,  exp: 36,  speed: 1,   tile: 111, kind: "humanoid", baseKind: "rakugakima",    monLevel: 1, minFloor: 10, maxFloor: 30, subtype: "pentaclePainter", dungeonFloors: { beginner: null, intermediate: { min: 11, max: 17 }, advanced: { min: 8, max: 15 } },
    desc: "同じ部屋にいると自分の足元に魔方陣を描いてくる。レベルが上がるほど凶悪な魔方陣に。",
    levels: [
      { name: "ラクガキ妖精",       hp: 42,  atk: 17, def: 7,  exp: 70,  dungeonFloors: { intermediate: { min: 17, max: 20 }, advanced: { min: 15, max: 22 } } },
      { name: "ラクガキバンシー",   hp: 68,  atk: 25, def: 12, exp: 118, dungeonFloors: { advanced: { min: 22, max: 28 } } },
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
  const nextLevel = (mon.monLevel || 1) + 1;
  const template = levels ? levels[nextLevel - 2] : null; // Lv2→index0, Lv3→index1
  if (!template) {
    /* 最強形態（ボス or Lv3）: 攻撃力・経験値を1.2倍ずつ強化（上限10倍） */
    const _curBoost = mon.overBoost || 1;
    const _newBoost = Math.min(10, _curBoost * 1.2);
    if (_curBoost >= 10) {
      ml.push(`${mon.name}はもう限界まで強化されている！`);
      return false;
    }
    const _baseAtk = mon._baseAtk ?? mon.atk;
    const _baseExp = mon._baseExp ?? mon.exp;
    if (!mon._baseAtk) { mon._baseAtk = mon.atk; mon._baseExp = mon.exp; }
    mon.atk = Math.round(_baseAtk * _newBoost);
    mon.exp = Math.round(_baseExp * _newBoost);
    mon.overBoost = _newBoost;
    ml.push(`${mon.name}がさらに強化された！（強化×${_newBoost.toFixed(2)}）`);
    return true;
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
  if (mon.baseKind === "gelcube" && nextLevel === 3) {
    mon.speed = 1;
    ml.push(`${oldName}がレベルアップして${mon.name}になった！動きが等速になった！`);
  } else if (mon.baseKind === "tattoobird" && nextLevel === 3) {
    mon.speed = 2;
    mon.baseSpeed = 2;
    ml.push(`${oldName}がレベルアップして${mon.name}になった！速度が2倍になった！`);
  } else {
    ml.push(`${oldName}がレベルアップして${mon.name}になった！`);
  }
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

/* ===== ボステンプレート（5階ごとに1体登場） ===== */
export const BOSSES = [
  /* 第1ボス B5F (depth=4) */
  { name: "好まざる猫「フリージア」", hp: 150,   atk: 24,  def: 16,  exp: 500,
    speed: 1,   tile: 89, kind: "beast",    baseKind: "boss_blaze",
    isBoss: true, bossTier: 1,  monLevel: 1, maxAttacks: 2 },
  /* 第2ボス B10F (depth=9) */
  { name: "シオン・ザ・ダークブレット", hp: 300,   atk: 35,  def: 23,  exp: 1200,
    speed: 1,   tile: 90, kind: "humanoid", baseKind: "boss_darkbullet",
    isBoss: true, bossTier: 2,  monLevel: 1, maxAttacks: 1 },
  /* 第3ボス B15F (depth=14) */
  { name: "深淵の番人", hp: 600,   atk: 56,  def: 32,  exp: 2500,
    speed: 1,   tile: 91, kind: "beast",    baseKind: "boss_guardian",
    isBoss: true, bossTier: 3,  monLevel: 1, maxAttacks: 3 },
  /* 第4ボス B20F (depth=19) */
  { name: "魔神王",     hp: 900,   atk: 73,  def: 41,  exp: 5000,
    speed: 2,   tile: 92, kind: "beast",    baseKind: "boss_demonking",
    isBoss: true, bossTier: 4,  monLevel: 1, maxAttacks: 3, float: true },
  /* 第5ボス B25F (depth=24)
   * 【鎧砕き蓄積型】遅いが攻撃を受けるたびに防御が半減し続ける。後半は1発が致命的になる。
   * 攻略：なるべく攻撃を受けず、防御アイテムを使いながら早期撃破 */
  { name: "魔将軍",     hp: 800,   atk: 96,  def: 55,  exp: 9000,
    speed: 1,   tile: 95, kind: "humanoid", baseKind: "boss_warlord",
    isBoss: true, bossTier: 5,  monLevel: 1, maxAttacks: 2 },
  /* 第6ボス B30F (depth=29)
   * 【物量召喚型】3ターンに2体召喚し続けて数で圧倒。HP吸収で長期戦も不利。
   * 攻略：通路など狭い場所で召喚を制限し本体に集中攻撃 */
  { name: "骸骨王",     hp: 1000,  atk: 108, def: 60,  exp: 15000,
    speed: 2,   tile: 96, kind: "undead",   baseKind: "boss_skullking",
    isBoss: true, bossTier: 6,  monLevel: 1, maxAttacks: 1, float: true },
  /* 第7ボス B35F (depth=34)
   * 【油炎コンボ型】倍速で動きながら油まみれブレスを吐く。油状態で攻撃を受けると炎ダメージ2倍。
   * 攻略：油を素早く解消するか炎耐性で対抗。ブレスターンか攻撃ターンかを読む */
  { name: "炎帝竜",     hp: 1200,  atk: 122, def: 68,  exp: 25000,
    speed: 2,   tile: 97, kind: "dragon",   baseKind: "boss_flamedragon",
    isBoss: true, bossTier: 7,  monLevel: 1, maxAttacks: 3 },
  /* 第8ボス B40F (depth=39)
   * 【消耗戦型】速度は遅いが毎ターン回復し、5ターンに1度ランダム状態異常を付与し続ける。
   * 攻略：封印されてもごり押せる火力を確保。回復量を超える火力を出し切る */
  { name: "虚無の僧侶", hp: 1500,  atk: 138, def: 82,  exp: 40000,
    speed: 1,   tile: 98, kind: "undead",   baseKind: "boss_voidmonk",
    isBoss: true, bossTier: 8,  monLevel: 1, maxAttacks: 2, float: true },
  /* 第9ボス B45F (depth=44)
   * 【激昂型】通常は倍速・攻撃2回だがHP50%以下で激昂してspeed3になり手がつけられない。
   * 攻略：激昂前に一気に仕留める。激昂後は即死火力か即逃げしか選択肢がない */
  { name: "煉獄公",     hp: 1900,  atk: 163, def: 87,  exp: 65000,
    speed: 2,   tile: 99, kind: "beast",    baseKind: "boss_infernoking",
    isBoss: true, bossTier: 9,  monLevel: 1, maxAttacks: 2, float: true },
  /* 第10ボス B50F (depth=49) ― 最終ボス
   * 【全部乗せ型】倍速+毎ターン回復+4T召喚+金縛り+防御半減が全部来る。全ての脅威の集大成。
   * 攻略：ダンジョン全体で収集したリソースを惜しまず使い切る */
  { name: "深淵神",     hp: 2400,  atk: 183, def: 97,  exp: 100000,
    speed: 2,   tile: 100, kind: "beast",   baseKind: "boss_abyssgod",
    isBoss: true, bossTier: 10, monLevel: 1, maxAttacks: 3, float: true },
];

/* ===== 中級ダンジョン専用ボス (全4体 B5F〜B20F) ===== */
export const INTERMEDIATE_BOSSES = [
  /* B5F (depth=4) 直線炎ブレス */
  { name: "サラマンダー", hp: 280, atk: 38, def: 20, exp: 700,
    speed: 1, tile: 93, kind: "dragon",   baseKind: "im_boss_salamander",
    isBoss: true, bossTier: 1, monLevel: 1, maxAttacks: 2,
    elemWeak: "ice", elemResist: "fire" },
  /* B10F (depth=9) 攻撃時35%移動封じ＋毎ターン5HP回復 */
  { name: "ティターン", hp: 460, atk: 52, def: 27, exp: 1500,
    speed: 1, tile: 94, kind: "humanoid", baseKind: "im_boss_titan",
    isBoss: true, bossTier: 2, monLevel: 1, maxAttacks: 1 },
  /* B15F (depth=14) 水中20HP/ターン回復＋HP半減で逃走＋一直線墨（暗闇+ダメージ） */
  { name: "クラーケン", hp: 720, atk: 65, def: 42, exp: 3000,
    speed: 1, tile: 95, kind: "beast",    baseKind: "im_boss_kraken",
    isBoss: true, bossTier: 3, monLevel: 1, maxAttacks: 2, float: true, elemWeak: "thunder" },
  /* B20F (depth=19) 攻撃力255・特技なし */
  { name: "2ヘッドドラゴン", hp: 1080, atk: 255, def: 48, exp: 6000,
    speed: 1, tile: 96, kind: "dragon",   baseKind: "im_boss_twohead",
    isBoss: true, bossTier: 4, monLevel: 1, maxAttacks: 1 },
];

/* ===== 警備員テンプレート ===== */
export const GUARD_TEMPLATE = { name: "警備員", hp: 200, atk: 100, def: 100, exp: 25, speed: 1, tile: 59, kind: "humanoid" };
export function makeGuard(x, y, plx, ply) {
  return { ...GUARD_TEMPLATE, id: uid(), x, y, maxHp: GUARD_TEMPLATE.hp, baseSpeed: GUARD_TEMPLATE.speed || 1, type: "guard",
    turnAccum: 0, aware: true, dir: { x: 0, y: 0 }, lastPx: plx, lastPy: ply, patrolTarget: null };
}

/* ===== モンスター生成ヘルパー ===== */

/**
 * depth に対応するフロア (depth+1) で出現可能なモンスター定義と
 * スポーンレベル (1〜3) を返す共通ロジック。
 * progress = (floor - minFloor) / range で lv2/lv3 の確率が上がる。
 */
export function pickMonsterDef(depth, dungeonType = null, excludeWaterOnly = false) {
  const floor = depth + 1;
  const eligible = MONS.filter(m => {
    if (excludeWaterOnly && m.waterOnly) return false;
    if (m.dungeons && dungeonType && !m.dungeons.includes(dungeonType)) return false;
    const df = dungeonType ? m.dungeonFloors?.[dungeonType] : undefined;
    if (df === null) return false; // このダンジョンには出現しない
    const minF = df?.min !== undefined ? df.min : m.minFloor;
    const maxF = df?.max !== undefined ? df.max : m.maxFloor;
    if (minF <= floor && floor <= maxF) return true;
    // baseの範囲外でも、レベルバリアントの出現範囲に該当すれば選択対象にする
    return m.levels?.some(lv => {
      const lvDf = dungeonType ? lv.dungeonFloors?.[dungeonType] : undefined;
      if (lvDf === null) return false;
      const lvMin = lvDf?.min ?? lv.minFloor;
      const lvMax = lvDf?.max ?? lv.maxFloor;
      return lvMin !== undefined && floor >= lvMin && (lvMax === undefined || floor <= lvMax);
    }) ?? false;
  });
  const base = eligible.length > 0 ? pick(eligible) : MONS[0];

  /* レベル決定：levelsエントリに minFloor/dungeonFloors が明示されている場合のみ昇格
     高レベルから順にチェックし、最初に条件を満たしたレベルを採用する */
  let spawnLevel = 1;
  if (base.levels?.length > 0) {
    for (let i = base.levels.length; i >= 1; i--) {
      const lv = base.levels[i - 1];
      const lvDf = dungeonType ? lv.dungeonFloors?.[dungeonType] : undefined;
      if (lvDf === null) continue;
      const lvMin = lvDf?.min ?? lv.minFloor;
      const lvMax = lvDf?.max ?? lv.maxFloor;
      if (lvMin !== undefined && floor >= lvMin && (lvMax === undefined || floor <= lvMax)) {
        spawnLevel = i + 1;
        break;
      }
    }
  }

  return { base, spawnLevel };
}

/** depth/spawnLevel からモンスターのステータスオブジェクトを作る */
function buildMonStats(base, spawnLevel) {
  const { levels: _lvls, ...mt } = base;
  if (spawnLevel >= 2 && base.levels?.[spawnLevel - 2]) {
    return { ...mt, ...base.levels[spawnLevel - 2], monLevel: spawnLevel };
  }
  return mt;
}

/** ランダムにモンスター1体を生成してオブジェクトを返す */
export function makeMonster(depth, x, y, { aware = false, lastPx = 0, lastPy = 0, immediateAct = false, dungeonType = null, excludeWaterOnly = false } = {}) {
  const { base, spawnLevel } = pickMonsterDef(depth, dungeonType, excludeWaterOnly);
  const st = buildMonStats(base, spawnLevel);
  return { ...st, id: uid(), x, y, maxHp: st.hp, baseSpeed: st.speed ?? 1, turnAccum: immediateAct ? -(st.speed ?? 1) : 0, aware, dir: { x: 0, y: 0 }, lastPx, lastPy, patrolTarget: null };
}

/** 指定のベース定義・レベルでモンスターを生成する（固定取り巻き用） */
export function makeMonsterFromBase(base, spawnLevel, x, y, { aware = false, lastPx = 0, lastPy = 0, dormant = false } = {}) {
  const st = buildMonStats(base, spawnLevel);
  return { ...st, id: uid(), x, y, maxHp: st.hp, baseSpeed: st.speed ?? 1, turnAccum: 0, aware, dormant, dir: { x: 0, y: 0 }, lastPx, lastPy, patrolTarget: null };
}

/* 石像の報酬敵は monsters 側から供給し、fixtures との循環 import を避ける。 */
function spawnStatueMonster(statue, dg, p, ml, depth) {
  const d = Math.max(0, (typeof depth === "number" ? depth : null) ?? (p?.depth ? p.depth - 1 : 0));
  let mx = statue.x, my = statue.y;
  const blocked = (x, y) =>
    (p && p.x === x && p.y === y) ||
    (dg.monsters || []).some((m) => m.x === x && m.y === y) ||
    dg.map[y]?.[x] === T.WALL || dg.map[y]?.[x] === T.BWALL;
  if (blocked(mx, my)) {
    for (const [ox, oy] of [[0,1],[1,0],[0,-1],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const nx = statue.x + ox, ny = statue.y + oy;
      if (nx < 0 || nx >= MW || ny < 0 || ny >= MH || blocked(nx, ny)) continue;
      mx = nx; my = ny;
      break;
    }
    if (blocked(mx, my)) {
      ml.push("強敵が出現しそうだったが、場所がなかった…");
      return;
    }
  }
  try {
    const { base, spawnLevel } = pickMonsterDef(d, dg.dungeonType ?? null, false);
    const boosted = Math.min(3, (spawnLevel || 1) + 1);
    const mon = makeMonsterFromBase(base, boosted, mx, my, {
      aware: true,
      lastPx: p?.x ?? mx,
      lastPy: p?.y ?? my,
    });
    dg.monsters.push(mon);
    ml.push(`${mon.name}が現れた！`);
  } catch {
    ml.push("強敵が出現しそうだったが、うまく出られなかった…");
  }
}

setStatueSpawnHandler(spawnStatueMonster);

/** count 体のモンスターを centerX,centerY 周辺 → ランダム部屋にスポーンさせる */
export function spawnMonsters(dg, count, depth, centerX, centerY, p, { aware = false, immediateAct = false } = {}) {
  const DIRS8 = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  let spawned = 0;
  /* 隣接マスに優先配置 */
  for (const [dy, dx] of DIRS8) {
    if (spawned >= count) break;
    const nx = centerX + dx, ny = centerY + dy;
    if (dg.map[ny]?.[nx] === T.FLOOR && !dg.monsters.some(m => m.x === nx && m.y === ny) && (!p || nx !== p.x || ny !== p.y)) {
      dg.monsters.push(makeMonster(depth, nx, ny, { aware, lastPx: centerX, lastPy: centerY, immediateAct, dungeonType: dg.dungeonType ?? null }));
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
        dg.monsters.push(makeMonster(depth, sx, sy, { aware: false, immediateAct, dungeonType: dg.dungeonType ?? null }));
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
export function bfsNext(map, mons, sx, sy, tx, ty, self, maxDist = 20, pentacles = null, float = false, tileFilter = null, fallbackNearest = false, rooms = null, dg = null) {
  if (sx === tx && sy === ty) return null;
  /* モンスター位置と聖域位置をSetに変換 (O(1)ルックアップ) */
  const monSet = new Set();
  for (const m of mons) { if (m !== self) monSet.add(m.x + m.y * MW); }
  const _noSanct = rooms ? inMagicSealRoom({ pentacles: pentacles || [], rooms }, sx, sy) : false;
  const sanctSet = new Set();
  if (pentacles && !_noSanct) for (const pc of pentacles) { if (pc.kind === "sanctuary") sanctSet.add(pc.x + pc.y * MW); }
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
  const _canEnterFn = tileFilter
    ? (x, y) => tileFilter(x, y)
    : (x, y) => canEnter(map, x, y, float, dg);
  /* fallbackNearest: 目標未到達時に最も目標に近いタイルへの第一歩を記録 */
  let _nearFx = null, _nearFy = null, _nearDist = Infinity;
  let steps = 0;
  while (qHead < queue.length && steps < maxDist * 50) {
    const cur = queue[qHead++];
    steps++;
    /* 到達不可能時フォールバック用: 目標に最も近いタイルを追跡 */
    if (fallbackNearest && cur.firstX !== null) {
      const _d = Math.max(Math.abs(cur.x - tx), Math.abs(cur.y - ty));
      if (_d < _nearDist) { _nearDist = _d; _nearFx = cur.firstX; _nearFy = cur.firstY; }
    }
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!_canEnterFn(nx, ny)) continue;
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
  /* 目標未到達: fallbackNearest が有効なら最近傍タイルへの第一歩を返す */
  if (fallbackNearest && _nearFx !== null) return { x: _nearFx, y: _nearFy };
  return null;
}

export function findRoom(rooms, x, y) {
  return (
    rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) ||
    null
  );
}

export function getOpenDirs(map, x, y, float = false, dg = null) {
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
    if (canEnter(map, nx, ny, float, dg))
      res.push({ x: dx, y: dy });
  }
  return res;
}

/** 部屋から廊下などへ出る出口マス（部屋外の歩行可能タイル） */
export function getRoomExits(map, room, dg = null, float = false) {
  if (!room) return [];
  const exits = [];
  const seen = new Set();
  const tryAdd = (ex, ey) => {
    if (!canEnter(map, ex, ey, float, dg)) return;
    const k = ex + ey * MW;
    if (seen.has(k)) return;
    seen.add(k);
    exits.push({ x: ex, y: ey });
  };
  for (let x = room.x; x < room.x + room.w; x++) {
    tryAdd(x, room.y - 1);
    tryAdd(x, room.y + room.h);
  }
  for (let y = room.y; y < room.y + room.h; y++) {
    tryAdd(room.x - 1, y);
    tryAdd(room.x + room.w, y);
  }
  return exits;
}

/**
 * プレイヤーから逃げる1歩。
 * 同室なら出口へBFS（一時的に近づいても廊下へ出る）。
 * その後は他部屋・遠方床を目指し、最後に局所で遠い隣接マス。
 * @returns {{x:number,y:number}|null}
 */
export function fleeFromPlayerStep(m, dg, pl, float = false) {
  if (!m || !dg || !pl) return null;
  const map = dg.map;
  const rooms = dg.rooms || [];
  const mons = dg.monsters || [];
  const plDist2 = (x, y) => (x - pl.x) * (x - pl.x) + (y - pl.y) * (y - pl.y);
  /* プレイヤーマスは通れない（通り道にすると隣接へ突っ込んでしまう） */
  const fleeFilter = (x, y) => {
    if (x === pl.x && y === pl.y) return false;
    return canEnter(map, x, y, float, dg);
  };
  const tryGoal = (tx, ty) => {
    if (tx == null || ty == null) return null;
    if (tx === m.x && ty === m.y) return null;
    const next = bfsNext(map, mons, m.x, m.y, tx, ty, m, 60, dg.pentacles, float, fleeFilter, true, rooms, dg);
    if (!next) return null;
    if (next.x === pl.x && next.y === pl.y) return null;
    if (mons.some(o => o !== m && o.x === next.x && o.y === next.y)) return null;
    if (!canEnter(map, next.x, next.y, float, dg)) return null;
    return next;
  };

  const room = findRoom(rooms, m.x, m.y);
  const plRoom = findRoom(rooms, pl.x, pl.y);

  /* A) プレイヤーと同室：遠い出口へ（近づくリスクを取ってでも廊下へ） */
  if (room && plRoom === room) {
    const exits = getRoomExits(map, room, dg, float);
    exits.sort((a, b) => plDist2(b.x, b.y) - plDist2(a.x, a.y));
    for (const ex of exits) {
      const n = tryGoal(ex.x, ex.y);
      if (n) return n;
    }
  }

  /* B) 他部屋の中心（プレイヤーと別部屋を優先）→ 遠方サンプル */
  const farGoals = [];
  for (const r of rooms) {
    if (plRoom && r === plRoom) continue;
    const cx = r.x + Math.floor(r.w / 2);
    const cy = r.y + Math.floor(r.h / 2);
    if (canEnter(map, cx, cy, float, dg)) farGoals.push({ x: cx, y: cy, score: plDist2(cx, cy) });
    /* 部屋の四隅も候補 */
    for (const [cx2, cy2] of [
      [r.x, r.y], [r.x + r.w - 1, r.y],
      [r.x, r.y + r.h - 1], [r.x + r.w - 1, r.y + r.h - 1],
    ]) {
      if (canEnter(map, cx2, cy2, float, dg)) farGoals.push({ x: cx2, y: cy2, score: plDist2(cx2, cy2) });
    }
  }
  for (let i = 0; i < 30; i++) {
    const x = rng(1, MW - 2), y = rng(1, MH - 2);
    if (!canEnter(map, x, y, float, dg)) continue;
    farGoals.push({ x, y, score: plDist2(x, y) });
  }
  farGoals.sort((a, b) => b.score - a.score);
  const seenG = new Set();
  let tried = 0;
  for (const g of farGoals) {
    const k = g.x + g.y * MW;
    if (seenG.has(k)) continue;
    seenG.add(k);
    const n = tryGoal(g.x, g.y);
    if (n) return n;
    if (++tried >= 10) break;
  }

  /* C) 局所：プレイヤーから遠い隣接（最後の手段） */
  const local = [];
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const nx = m.x + dx, ny = m.y + dy;
    if (!canEnter(map, nx, ny, float, dg)) continue;
    if (mons.some(o => o !== m && o.x === nx && o.y === ny)) continue;
    if (nx === pl.x && ny === pl.y) continue;
    if (!inMagicSealRoom(m.x, m.y, dg) &&
        dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === nx && pc.y === ny)) continue;
    local.push({ x: nx, y: ny, score: plDist2(nx, ny) });
  }
  local.sort((a, b) => b.score - a.score);
  if (local.length > 0) return { x: local[0].x, y: local[0].y };
  return null;
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
  if (dg.statues?.some(s => s.x === x && s.y === y)) return true;
  if (dg.bigboxes?.some(b => b.x === x && b.y === y)) return true;
  if (dg.pentacles?.some(pc => pc.x === x && pc.y === y)) return true;
  if (dg.items?.some(i => i.x === x && i.y === y)) return true;
  if (dg.traps?.some(t => t.x === x && t.y === y)) return true;
  if (dg.springs?.some(s => s.x === x && s.y === y)) return true;
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
  return null; /* 見つからなければ消滅 */
}

/* 落下位置が泉なら泉に落とし、そうでなければ床に置く。posがnullなら消滅 */
function _monDropWithSpring(pos, item, dg, ml) {
  if (!pos) return;
  const spr = dg.springs?.find(s => s.x === pos.x && s.y === pos.y);
  if (spr) { soakItemIntoSpring(spr, { ...item, x: pos.x, y: pos.y }, ml, dg, null); }
  else { dg.items.push({ ...item, x: pos.x, y: pos.y }); }
}

/* ===== MONSTER ARROW SHOT ===== */
function monsterShootArrow(m, dg, pl, ml, opts) {
  /* レベル別矢の種類: lv1=矢, lv2=強矢, lv3=貫きの矢 */
  const _mLv = m.monLevel || 1;
  const _isPierce = _mLv >= 3;
  const _makeAr = () => _mLv >= 3 ? makePiercingArrow(1) : _mLv >= 2 ? makeStrongArrow(1) : makeArrow(1);
  const _arName = _mLv >= 3 ? "貫きの矢" : _mLv >= 2 ? "強矢" : "矢";
  const _arColor = _mLv >= 3 ? "#ff8844" : _mLv >= 2 ? "#ffcc44" : "#d0a050";
  const _arAtkBonus = _mLv >= 3 ? 5 : _mLv >= 2 ? 8 : 3;
  const _maxDist = Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y));
  /* 矢落下：pierceなら消滅、それ以外は地面/泉に落とす */
  const _dropAr = (px, py, mlx) => {
    if (_isPierce) return;
    const _d = safeArrowDrop(px, py, dg);
    _monDropWithSpring(_d, _makeAr(), dg, mlx);
  };
  _resolveBolt(m, dg, pl, ml, null, {
    dx: Math.sign(pl.x - m.x), dy: Math.sign(pl.y - m.y),
    baseRange: _maxDist,
    animColor: _arColor,
    fireMsg: `${m.name}が${_arName}を放った！`,
    boltName: _arName,
    deathCause: `${m.name}の${_arName}の攻撃で`,
    calcPlDmg: () => calcAtkDefDmg(m.atk + _arAtkBonus, calcPlayerDef(pl), { defWeight: 1.5 }),
    calcMonDmg: () => Math.max(1, m.atk + rng(-2, 2)),
    hitChance: 0.80,
    applyVulnPentacle: true,
    wakeParalyze: true,
    pierce: _isPierce,
    onMiss: (px, py, mlx) => {
      _dropAr(px, py, mlx);
      /* 落下点が罠の場合はプレイヤーに罠発動 */
      if (px === pl.x && py === pl.y) {
        const _trap = dg.traps?.find(t => t.x === px && t.y === py);
        if (_trap && opts.fireTrapFn) opts.fireTrapFn(_trap, pl, dg, mlx);
      }
    },
    onMonHit: (mon, mlx) => {
      const _isFc = getFarcastMode(pl.x, pl.y, dg) === "farcast";
      /* gelcube：貫通/遠投以外なら矢を飲み込んで攻撃力上昇 */
      if (mon.baseKind === "gelcube" && !_isPierce && !_isFc) {
        mon.heldItems = mon.heldItems || [];
        mon.heldItems.push(_makeAr());
        if (!mon._gelBaseAtk) mon._gelBaseAtk = mon.atk;
        mon._gelBoost = Math.min(10, (mon._gelBoost || 1) * 1.2);
        mon.atk = Math.round(mon._gelBaseAtk * mon._gelBoost);
        mlx.push(`${m.name}の${_arName}が${mon.name}に飲み込まれた！（攻撃力×${mon._gelBoost.toFixed(2)}→${mon.atk}）`);
        return;
      }
      wakeIfDormant(mon, mlx);
      const _dmg = Math.max(1, m.atk + rng(-2, 2));
      mon.hp -= _dmg;
      mlx.push(`${m.name}の${_arName}が${mon.name}に命中！${_dmg}ダメージ！`);
      if (mon.hp <= 0) killMonster(mon, dg, pl, mlx, null, false, m);
    },
    onBigbox: (bb, lx, ly, mlx) => {
      mlx.push(`${m.name}の${_arName}が${bb.name}に当たった。`);
      if (opts.bbFn) opts.bbFn(bb, _makeAr(), dg, mlx);
      else dg.items.push({ ..._makeAr(), x: lx, y: ly });
    },
    onSpring: (spr, lx, ly, mlx) => {
      mlx.push(`${m.name}の${_arName}が泉に落ちた！`);
      soakItemIntoSpring(spr, { ..._makeAr(), x: lx, y: ly }, mlx, dg, null);
    },
    onWallStop: _dropAr,
    onFlyOff: _dropAr,
  });
}

/* ===== MONSTER STONE THROW (ワッカ) — ホーミング。風は本来の着弾点にあるときだけ曲がる ===== */
function monsterThrowStone(m, dg, pl, ml) {
  const lvl = m.monLevel || 1;
  const isMagic = lvl >= 3;
  const hitChance = 0.80;
  const stoneName = isMagic ? "魔法の石" : "石";
  const dropStone = () => isMagic ? makeMagicStone(1) : makeStone(1);
  const color = isMagic ? "#cc88ff" : "#aaaaaa";
  /* 本来の着弾点＝投げた瞬間のプレイヤー位置（ここで風があれば曲がる） */
  const aimX = pl.x, aimY = pl.y;
  const windAtAim = getWindAt(dg, aimX, aimY);
  ml.push(`${m.name}が${stoneName}を投げた！`);

  const _hitPlayer = () => {
    const _stDodgePcMode = getDodgePentacleMode(dg, pl.x, pl.y);
    if (_stDodgePcMode === "dodge") {
      ml.push(`みかわしの魔方陣の加護で${m.name}の${stoneName}をかわした！${stoneName}が落ちた。`);
      const _sd = safeArrowDrop(pl.x, pl.y, dg);
      _monDropWithSpring(_sd, dropStone(), dg, ml);
      return;
    }
    const _stSanc = !inMagicSealRoom(pl.x, pl.y, dg) && dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y);
    if (_stSanc) {
      const _sd = safeArrowDrop(pl.x, pl.y, dg);
      _monDropWithSpring(_sd, dropStone(), dg, ml);
      ml.push(`祝福された聖域の加護が${m.name}の${stoneName}を防いだ！${stoneName}が落ちた。`);
      return;
    }
    const dodged = _stDodgePcMode !== "sure" && hasAbility(pl.armor, "dodge") && Math.random() < 0.25;
    if (dodged) {
      ml.push(`${stoneName}をひらりとかわした！${stoneName}が落ちた。`);
      const _sd = safeArrowDrop(pl.x, pl.y, dg);
      _monDropWithSpring(_sd, dropStone(), dg, ml);
      return;
    }
    const miss = _stDodgePcMode !== "sure" && Math.random() >= hitChance;
    if (miss) {
      ml.push(`${stoneName}は外れた！${stoneName}が足元に落ちた。`);
      const _sd = safeArrowDrop(pl.x, pl.y, dg);
      _monDropWithSpring(_sd, dropStone(), dg, ml);
      return;
    }
    const _stVulnPc = findVulnPentacle(dg, pl.x, pl.y);
    const _stBonus = isMagic ? 5 : 3;
    const _stAp = m.atk + _stBonus;
    const _stPdef = calcPlayerDef(pl);
    let dmg = calcAtkDefDmg(_stAp, _stPdef, { defWeight: 1.5 });
    if (_stVulnPc) dmg = _stVulnPc.cursed ? Math.max(1, Math.floor(dmg / 2)) : dmg * (_stVulnPc.blessed ? 4 : 2);
    pl.deathCause = `${m.name}の石投げで`;
    pl.hp -= dmg;
    ml.push(`${m.name}の${stoneName}が命中！${dmg}ダメージ！`);
    if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("衝撃で目が覚めた！"); }
    if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("衝撃で金縛りが解けた！"); }
  };

  let fdx = Math.sign(pl.x - m.x), fdy = Math.sign(pl.y - m.y);
  if (fdx === 0 && fdy === 0) fdy = 1;
  let cx = m.x, cy = m.y, lx = m.x, ly = m.y;
  let deflected = false;
  let windMsg = false;
  const path = [{ x: m.x, y: m.y }];
  const maxSteps = MW + MH;

  for (let d = 1; d <= maxSteps; d++) {
    if (!deflected) {
      /* ホーミング：毎マスプレイヤーへ向きを更新（途中の風は無視） */
      fdx = Math.sign(pl.x - cx);
      fdy = Math.sign(pl.y - cy);
      if (fdx === 0 && fdy === 0) {
        /* 同一マス＝既に重なっている扱いで命中処理 */
        _hitPlayer();
        if (path.length > 1) {
          pushAnim({ type: "monProjectile", fromX: m.x, fromY: m.y, toX: cx, toY: cy, color, path });
        }
        return;
      }
    }
    const tx = cx + fdx, ty = cy + fdy;
    if (tx < 0 || tx >= MW || ty < 0 || ty >= MH || dg.map[ty]?.[tx] === T.WALL || dg.map[ty]?.[tx] === T.BWALL) {
      const _sd = safeArrowDrop(lx, ly, dg);
      _monDropWithSpring(_sd, dropStone(), dg, ml);
      ml.push(`${stoneName}は壁に当たって落ちた。`);
      if (path.length > 1) {
        pushAnim({ type: "monProjectile", fromX: m.x, fromY: m.y, toX: lx, toY: ly, color, path });
      }
      return;
    }
    cx = tx; cy = ty; lx = tx; ly = ty;
    path.push({ x: tx, y: ty });

    /* 自分に戻った */
    if (tx === m.x && ty === m.y) {
      const _stBonus = isMagic ? 5 : 3;
      const dmg = calcAtkDefDmg(m.atk + _stBonus, m.def || 0, { defWeight: 1 });
      m.hp -= dmg;
      ml.push(`風に煽られた${stoneName}が${m.name}自身に当たった！${dmg}ダメージ！`);
      if (m.hp <= 0) killMonster(m, dg, pl, ml, null, false, null);
      pushAnim({ type: "monProjectile", fromX: m.x, fromY: m.y, toX: tx, toY: ty, color, path });
      return;
    }

    /* 石像 */
    if (statueAt(dg, tx, ty)) {
      ml.push(`${m.name}の${stoneName}が石像に命中！`);
      hitStatueWithAction(dg, tx, ty, pl, ml, null, pl?.depth, {
        breaks: true,
        itemDeps: getFixtureItemDeps(),
      });
      pushAnim({ type: "monProjectile", fromX: m.x, fromY: m.y, toX: tx, toY: ty, color, path });
      return;
    }

    /* 他モンスター */
    const hitMon = dg.monsters.find(o => o !== m && o.x === tx && o.y === ty);
    if (hitMon) {
      const _stBonus = isMagic ? 5 : 3;
      const dmg = calcAtkDefDmg(m.atk + _stBonus, hitMon.def || 0, { defWeight: 1 });
      hitMon.hp -= dmg;
      ml.push(`${m.name}の${stoneName}が${hitMon.name}に命中！${dmg}ダメージ！`);
      if (hitMon.hp <= 0) killMonster(hitMon, dg, pl, ml, null, false, m);
      pushAnim({ type: "monProjectile", fromX: m.x, fromY: m.y, toX: tx, toY: ty, color, path });
      return;
    }

    /* 本来の着弾点に風がある → 以降は風向きに直進（ホーミング終了） */
    if (!deflected && windAtAim && tx === aimX && ty === aimY) {
      const wdx = windAtAim.dx, wdy = windAtAim.dy;
      if (wdx !== fdx || wdy !== fdy) {
        fdx = wdx; fdy = wdy;
        deflected = true;
        if (!windMsg) { ml.push("風穴の風が石の軌道を変えた！"); windMsg = true; }
        /* プレイヤーが着弾点にいれば風より先に命中 */
        if (tx === pl.x && ty === pl.y) {
          _hitPlayer();
          pushAnim({ type: "monProjectile", fromX: m.x, fromY: m.y, toX: tx, toY: ty, color, path });
          return;
        }
        continue;
      }
    }

    /* プレイヤー命中（ホーミング中／偏向後） */
    if (tx === pl.x && ty === pl.y) {
      _hitPlayer();
      pushAnim({ type: "monProjectile", fromX: m.x, fromY: m.y, toX: tx, toY: ty, color, path });
      return;
    }

    /* 偏向後は一定距離で落下（無限飛行防止） */
    if (deflected && d > Math.max(Math.abs(aimX - m.x), Math.abs(aimY - m.y)) + 8) break;
  }

  const _sd = safeArrowDrop(lx, ly, dg);
  _monDropWithSpring(_sd, dropStone(), dg, ml);
  ml.push(`${stoneName}はどこかへ落ちた。`);
  if (path.length > 1) {
    pushAnim({ type: "monProjectile", fromX: m.x, fromY: m.y, toX: lx, toY: ly, color, path });
  }
}

/* ===== わてり：水鉄砲攻撃 ===== */
function monsterShootWaterGun(m, dg, pl, ml) {
  const adx = pl.x - m.x, ady = pl.y - m.y;
  let dx = Math.sign(adx), dy = Math.sign(ady);
  const maxDist = Math.max(Math.abs(adx), Math.abs(ady));
  ml.push(`${m.name}が水鉄砲を撃った！`);
  pushMonsterBoltAnim(m.x, m.y, dx, dy, dg, pl, "#20c0ff", { wind: true, range: maxDist });
  const miss = Math.random() < 0.20;
  /* みかわしの魔方陣 */
  const _wDodgePcMode = getDodgePentacleMode(dg, pl.x, pl.y);
  if (_wDodgePcMode === "dodge") {
    ml.push(`みかわしの魔方陣の加護で${m.name}の水鉄砲をかわした！`);
    return;
  }
  let _wgX = m.x, _wgY = m.y;
  for (let d = 1; d <= maxDist; d++) {
    const _st = stepProjectile(dg, _wgX, _wgY, dx, dy, { wind: true });
    dx = _st.dx; dy = _st.dy;
    const tx = _st.x, ty = _st.y;
    _wgX = tx; _wgY = ty;
    if (!isWalkable(dg.map, tx, ty, dg)) return;
    /* 射線上の魔方陣を消す */
    const _wgPcIdx = dg.pentacles ? dg.pentacles.findIndex(pc => pc.x === tx && pc.y === ty) : -1;
    if (_wgPcIdx >= 0) {
      const _wgPc = dg.pentacles[_wgPcIdx];
      dg.pentacles.splice(_wgPcIdx, 1);
      ml.push(`水鉄砲が${_wgPc.name}を消し去った！`);
    }
    /* 途中のモンスターに当たった場合 */
    const hitMon = dg.monsters.find(o => o !== m && o.x === tx && o.y === ty);
    if (hitMon) {
      const _wgWater = hitMon.waterOnly || hitMon.baseKind === "im_boss_kraken";
      if (_wgWater) {
        /* 水属性モンスターは回復 */
        const heal = Math.max(1, Math.floor(m.atk * 0.8) + rng(-1, 1));
        hitMon.hp = Math.min(hitMon.maxHp, hitMon.hp + heal);
        ml.push(`${m.name}の水鉄砲が${hitMon.name}に命中！${heal}HP回復した！`);
      } else {
        const dmg = Math.max(1, Math.floor(m.atk * 0.8) + rng(-1, 1));
        hitMon.hp -= dmg;
        ml.push(`${m.name}の水鉄砲が${hitMon.name}に命中！${dmg}ダメージ！`);
        if (hitMon.hp <= 0) { ml.push(`${hitMon.name}は倒れた！`); removeMonster(dg, hitMon); }
      }
      return;
    }
    if (tx === pl.x && ty === pl.y) {
      if (_wDodgePcMode !== "sure" && miss) {
        ml.push(`${m.name}の水鉄砲は外れた！`);
        return;
      }
      const _wVulnPc = findVulnPentacle(dg, pl.x, pl.y);
      let dmg = Math.max(1, Math.floor(m.atk * 0.8) + rng(-1, 1));
      if (_wVulnPc) dmg = _wVulnPc.cursed ? Math.max(1, Math.floor(dmg / 2)) : dmg * (_wVulnPc.blessed ? 4 : 2);
      pl.deathCause = `${m.name}の水鉄砲で`;
      pl.hp -= dmg;
      ml.push(`${m.name}の水鉄砲が命中！${dmg}ダメージ！`);
      if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("衝撃で目が覚めた！"); }
      if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("衝撃で金縛りが解けた！"); }
      /* ずぶ濡れ＋所持品への水影響（耐水で無効） */
      if (!hasWaterProof(pl)) {
        applySoakedStatus(pl, ml, 10, "水を浴びてずぶ濡れになった！(10ターン)");
        applyWaterGunToInventory(pl, ml, null);
      } else {
        ml.push("防具が水を弾いた！(耐水)");
      }
      /* Lv2以上：追加で食料腐敗 or 武器錆（耐水では防がない＝物理的劣化） */
      const _wLvl = m.monLevel || 1;
      if (_wLvl >= 2 && Math.random() < 0.5 && !hasWaterProof(pl)) {
        const _foods = pl.inventory.filter(i => i.type === "food" && !i.rotten);
        const _canDegrade = pl.weapon && !hasAbility(pl.weapon, "no_degrade");
        if (_foods.length > 0 && (_canDegrade ? Math.random() < 0.6 : true)) {
          const _tf = pick(_foods);
          rotFood(_tf);
          ml.push(`水びたしになって${resolveItemName(_tf)}が腐ってしまった！`);
        } else if (_canDegrade) {
          const _op = pl.weapon.plus || 0;
          pl.weapon.plus = _op - 1;
          const _fpp = v => v > 0 ? `+${v}` : v === 0 ? "無印" : `${v}`;
          ml.push(`水びたしになって${pl.weapon.name}が錆びた！(${_fpp(_op)}→${_fpp(_op - 1)})`);
        }
      }
      return;
    }
  }
}

/* ===== MONSTER AI ===== */
/* 重力ゾーンで罠を踏む処理 */
function _checkGravityTrap(m, dg, pl, ml, luFn) {
  if (!hasGravityPentacle(dg, m.x, m.y)) return;
  const trap = dg.traps?.find(t => t.x === m.x && t.y === m.y);
  if (!trap) return;
  trap.revealed = true;
  ml.push(`重力の力で${m.name}が${trap.name}を踏んだ！`);
  fireTrapItem(
    trap,
    { name: "重力の力", type: "misc", x: m.x, y: m.y, _ephemeralTrapTrigger: true },
    dg,
    m.x,
    m.y,
    ml,
    new Set(),
    pl,
    it => it.name,
    luFn,
  );
  if (trap.effect !== "explode" && !trap.permanent && Math.random() < trapStepBreakChance(trap)) {
    removeTrap(dg, trap, ml, { fromStep: true, message: `${trap.name}は壊れた。`, p: pl });
  }
}

/* ===== 直線飛翔の共通処理（物理弾道専用・魔法弾には使わない）=====
 * 第1引数 m: 射手（モンスターまたはプレイヤー）。プレイヤーの場合は isPlayerShooter:true を指定
 * 遠投の魔方陣: farcast→射程∞+壁貫通+貫通, cursed→射程1
 * みかわしの魔方陣: モンスター射手なら発射前に不発、プレイヤー射手では適用しない
 * みかわしの服: モンスター射手のみ、プレイヤー座標で25%回避
 * hitChance: プレイヤー命中時の命中判定（モンスター射手用、1.0=必中、0.80=矢、0.80=水鉄砲 など）
 * onMiss(px, py, ml): 回避/不発/外れ時のコールバック（矢などの弾薬を地面に落とす処理）
 * applyVulnPentacle: 脆弱の魔方陣のダメージ補正をプレイヤー命中時に適用するか
 * wakeParalyze: 命中時に金縛りを解除するか
 * pierce: trueなら壁・敵・プレイヤー・大箱・泉を貫通して飛び続ける（farcastと同等の挙動）
 * reflectorRange: reflector反射時の最大飛距離（デフォルト20）
 * customPlHit(ml, isReflected, reflectorMon): プレイヤー命中時のカスタム処理。指定するとデフォルトの
 *   ダメージ計算・deathCause・メッセージ・sleep解除をスキップして全てカスタム実装に委ねる。
 *   壺投げで割れて中身散乱、杖の効果発動など、ダメージ以外の処理を行いたい場合に使う。
 * onBigbox(bb, lx, ly, ml): 大箱命中時のコールバック（矢を大箱に入れる等）。
 *   未指定なら大箱を素通り（シオン銃弾など、アイテムでない弾向け）。
 *   pierce/farcastでない場合はbigboxで弾道終了（onBigbox指定時のみ）。
 * onSpring(spr, lx, ly, ml): 泉命中時のコールバック（矢を泉に沈める等）。
 *   未指定なら泉を素通り。pierce/farcastでない場合はspringで弾道終了（onSpring指定時のみ）。
 * onTrap(trap, lx, ly, ml) => string|undefined: 罠命中時のコールバック（押し出されアイテムが罠を踏む等）。
 *   未指定なら罠を素通り。"destroyed"を返すとアイテム消滅、それ以外は弾道はそこで終了。
 * onWallStop(lx, ly, ml): pierce/farcast以外で壁にぶつかって止まった時のコールバック
 * onFlyOff(lx, ly, ml): 飛距離を使い切って何にも当たらず終了した時のコールバック
 * isPlayerShooter: プレイヤーが射手の場合true（mにplを渡す）。dodge魔方陣の早期returnをスキップ、
 *   プレイヤー軌道アニメを使用、デフォルトメッセージから射手名プレフィクスを除去、
 *   モンスター撃破時のkillerMonをnullにして経験値加算する。
 */
export function _resolveBolt(m, dg, pl, ml, luFn, opts) {
  let {
    dx, dy,
    baseRange = 19,
    animColor = "#aaaaaa",
    fireMsg = null,
    boltName = "弾",
    deathCause = null,
    calcPlDmg = () => Math.max(1, m.atk - Math.floor(calcPlayerDef(pl) / 2) + rng(-3, 3)),
    calcMonDmg = (mon) => Math.max(1, m.atk - Math.floor((mon.def || 0) / 2) + rng(-2, 2)),
    onPlHit = null,
    onMonHit = null,
    onMiss = null,
    onBigbox = null,
    onSpring = null,
    onTrap = null,
    onWallStop = null,
    onFlyOff = null,
    hitChance = 1.0,
    applyVulnPentacle = false,
    wakeParalyze = false,
    pierce = false,
    isPlayerShooter = false,
    reflectorRange = 20,
    customPlHit = null,
  } = opts;
  /* 風穴で方向が変わるため let で保持（opts から分割代入した dx,dy） */
  dx = Math.sign(dx || 0);
  dy = Math.sign(dy || 0);
  if (dx === 0 && dy === 0) dy = 1;

  const _shooterPrefix = isPlayerShooter ? "" : `${m.name}の`;
  const _killerMon = isPlayerShooter ? null : m;

  const _fcMode = getFarcastMode(pl.x, pl.y, dg);
  const _isFc = _fcMode === "farcast";
  const _isCursedFc = _fcMode === "cursed";
  const _passthrough = _isFc || pierce;
  const maxRange = _isCursedFc ? 1 : _passthrough ? 50 : baseRange;

  const _dodgePcMode = getDodgePentacleMode(dg, pl.x, pl.y);
  /* モンスター射手のみ：プレイヤーがdodge魔方陣にいたら発射前に不発（仮想射手＝hp未定義は除外） */
  if (!isPlayerShooter && m.hp != null && _dodgePcMode === "dodge") {
    ml.push(`${m.name}が発射したが、みかわしの魔方陣の加護で${boltName}をかわした！`);
    if (onMiss) onMiss(pl.x, pl.y, ml);
    return;
  }

  if (fireMsg) ml.push(fireMsg);
  /* 矢・石など物理弾：風で曲がる */
  if (isPlayerShooter) pushBoltAnim(m.x, m.y, dx, dy, dg, animColor, true);
  else pushMonsterBoltAnim(m.x, m.y, dx, dy, dg, pl, animColor, true);

  let _plHit = false;
  let _lx = m.x, _ly = m.y;
  let _cx = m.x, _cy = m.y; /* 風で曲がるため現在位置を積算 */
  let _windAnnounced = false;
  for (let _d = 1; _d <= maxRange; _d++) {
    /* 風穴：現在マス／進入先で進行方向を上書きしてから1マス進む */
    const _step = stepProjectile(dg, _cx, _cy, dx, dy);
    if (_step.bent) {
      dx = _step.dx; dy = _step.dy;
      if (!_windAnnounced) { ml.push("風穴の風が飛び道具を曲げた！"); _windAnnounced = true; }
    } else {
      dx = _step.dx; dy = _step.dy;
    }
    const _tx = _step.x, _ty = _step.y;
    if (_tx < 0 || _tx >= MW || _ty < 0 || _ty >= MH) break;
    const _tile = dg.map[_ty]?.[_tx];
    if (_tile === T.WALL || _tile === T.BWALL) {
      if (_passthrough) { _cx = _tx; _cy = _ty; _lx = _tx; _ly = _ty; continue; }
      if (onWallStop) onWallStop(_lx, _ly, ml);
      return;
    }
    /* 石像：物理弾は破壊 */
    if (statueAt(dg, _tx, _ty)) {
      hitStatueWithAction(dg, _tx, _ty, pl, ml, luFn, pl?.depth, {
        breaks: true,
        itemDeps: getFixtureItemDeps(),
      });
      if (!_passthrough) return;
    }

    /* 風で曲がって射手（敵）自身に戻った */
    if (!isPlayerShooter && m.hp != null && _tx === m.x && _ty === m.y) {
      const _selfDmg = calcMonDmg(m);
      m.hp -= _selfDmg;
      ml.push(`風に煽られた${boltName}が${m.name}自身に当たった！${_selfDmg}ダメージ！`);
      if (m.hp <= 0) killMonster(m, dg, pl, ml, luFn, false, null);
      if (_passthrough) { _cx = _tx; _cy = _ty; _lx = _tx; _ly = _ty; continue; }
      return;
    }

    /* プレイヤー命中：敵の弾、または風で曲がって戻った自弾（_d>=1 で自分マス） */
    if (_tx === pl.x && _ty === pl.y && !_plHit) {
      _plHit = true;
      if (isPlayerShooter) {
        if (customPlHit) {
          customPlHit(ml, false, null);
        } else {
          let _sdmg = calcPlDmg();
          pl.hp -= _sdmg;
          pl.deathCause = deathCause ?? "風に煽られた飛び道具で";
          ml.push(`風に煽られた${boltName}が自分に当たった！${_sdmg}ダメージ！`);
        }
        if (onPlHit) onPlHit(ml);
        if (_passthrough) { _cx = _tx; _cy = _ty; _lx = _tx; _ly = _ty; continue; } return;
      }
      const _armDodge = _dodgePcMode !== "sure" && hasAbility(pl.armor, "dodge") && Math.random() < 0.25;
      if (_armDodge) {
        ml.push(`${boltName}をひらりとかわした！`);
        if (onMiss) onMiss(_tx, _ty, ml);
        if (_passthrough) { _cx = _tx; _cy = _ty; _lx = _tx; _ly = _ty; continue; } return;
      }
      if (!inMagicSealRoom(pl.x, pl.y, dg) && dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y)) {
        ml.push(`祝福された聖域の加護が${boltName}を防いだ！`);
        if (onMiss) onMiss(_tx, _ty, ml);
        if (_passthrough) { _cx = _tx; _cy = _ty; _lx = _tx; _ly = _ty; continue; } return;
      }
      if (_dodgePcMode !== "sure" && hitChance < 1.0 && Math.random() >= hitChance) {
        ml.push(`${_shooterPrefix}${boltName}は外れた！`);
        if (onMiss) onMiss(_tx, _ty, ml);
        if (_passthrough) { _cx = _tx; _cy = _ty; _lx = _tx; _ly = _ty; continue; } return;
      }
      if (customPlHit) {
        /* customPlHit: ダメージ・メッセージ・deathCauseを完全カスタム（壺投げで割れて中身散乱、杖で効果発動など） */
        customPlHit(ml, false, null);
      } else {
        let _dmg = calcPlDmg();
        if (applyVulnPentacle) {
          const _vp = findVulnPentacle(dg, pl.x, pl.y);
          if (_vp) _dmg = _vp.cursed ? Math.max(1, Math.floor(_dmg / 2)) : _dmg * (_vp.blessed ? 4 : 2);
        }
        pl.hp -= _dmg;
        pl.deathCause = deathCause ?? `${m.name}の${boltName}で`;
        ml.push(`${_shooterPrefix}${boltName}が命中！${_dmg}ダメージ！`);
        if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("衝撃で目が覚めた！"); }
        if (wakeParalyze && pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("衝撃で金縛りが解けた！"); }
      }
      if (onPlHit) onPlHit(ml);
      if (_passthrough) { _cx = _tx; _cy = _ty; _lx = _tx; _ly = _ty; continue; } return;
    }
    const _mon = dg.monsters.find(mn => mn.x === _tx && mn.y === _ty && mn !== m);
    if (_mon) {
      /* reflector（ほっちもぺ等）：弾を射手方向へ跳ね返す（遠投貫通中は反射しない） */
      if (_mon.subtype === "reflector" && !_passthrough) {
        ml.push(`${boltName}が${_mon.name}に弾き返された！`);
        let _rrx = _tx, _rry = _ty;
        for (let _ri = 1; _ri <= reflectorRange; _ri++) {
          const _rnx = _rrx - dx, _rny = _rry - dy;
          if (_rnx < 0 || _rnx >= MW || _rny < 0 || _rny >= MH) break;
          const _rtile = dg.map[_rny]?.[_rnx];
          if (_rtile === T.WALL || _rtile === T.BWALL) break;
          if (_rnx === pl.x && _rny === pl.y) {
            if (customPlHit) {
              customPlHit(ml, true, _mon);
            } else {
              let _rrdmg = calcPlDmg();
              if (applyVulnPentacle) {
                const _vp = findVulnPentacle(dg, pl.x, pl.y);
                if (_vp) _rrdmg = _vp.cursed ? Math.max(1, Math.floor(_rrdmg / 2)) : _rrdmg * (_vp.blessed ? 4 : 2);
              }
              pl.hp -= _rrdmg;
              pl.deathCause = `${_mon.name}に跳ね返された${boltName}で`;
              ml.push(`跳ね返された${boltName}がプレイヤーに命中！${_rrdmg}ダメージ！`);
              if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("衝撃で目が覚めた！"); }
              if (wakeParalyze && pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("衝撃で金縛りが解けた！"); }
            }
            if (onPlHit) onPlHit(ml);
            return; /* プレイヤー命中時は弾消滅（onFlyOff呼ばない） */
          }
          /* 実体ある射手のみ反射弾の衝突対象。仮想射手（hp未定義）はその位置を素通り */
          if (m.hp != null && _rnx === m.x && _rny === m.y) {
            const _rrdmg = calcMonDmg(m);
            m.hp -= _rrdmg;
            ml.push(`跳ね返された${boltName}が${m.name}に命中！${_rrdmg}ダメージ！`);
            if (m.hp <= 0) killMonster(m, dg, pl, ml, luFn, false, _mon);
            _rrx = _rnx; _rry = _rny;
            break;
          }
          const _rrMon = dg.monsters.find(o => o.x === _rnx && o.y === _rny && o !== m && o !== _mon);
          if (_rrMon) {
            wakeIfDormant(_rrMon, ml);
            const _rrdmg = calcMonDmg(_rrMon);
            _rrMon.hp -= _rrdmg;
            ml.push(`跳ね返された${boltName}が${_rrMon.name}に命中！${_rrdmg}ダメージ！`);
            if (_rrMon.hp <= 0) killMonster(_rrMon, dg, pl, ml, luFn, false, _mon);
            _rrx = _rnx; _rry = _rny;
            break;
          }
          _rrx = _rnx; _rry = _rny;
        }
        /* 反射後にプレイヤー命中以外で終了：弾着位置でonFlyOffを呼ぶ（矢の地面ドロップ等） */
        if (onFlyOff) onFlyOff(_rrx, _rry, ml);
        return;
      }
      if (onMonHit) { onMonHit(_mon, ml, _lx, _ly); }
      else {
        wakeIfDormant(_mon, ml);
        const _mdmg = calcMonDmg(_mon);
        _mon.hp -= _mdmg; ml.push(`${_shooterPrefix}${boltName}が${_mon.name}に命中！${_mdmg}ダメージ！`);
        if (_mon.hp <= 0) killMonster(_mon, dg, pl, ml, luFn, false, _killerMon);
      }
      if (_passthrough) { _cx = _tx; _cy = _ty; _lx = _tx; _ly = _ty; continue; } return;
    }
    /* 大箱命中（onBigbox未指定なら素通り：シオン銃弾などアイテムでない弾向け）。遠投中は無視して素通り */
    if (onBigbox && !_isFc) {
      const _bb = dg.bigboxes?.find(b => b.x === _tx && b.y === _ty);
      if (_bb) {
        onBigbox(_bb, _tx, _ty, ml);
        if (_passthrough) { _cx = _tx; _cy = _ty; _lx = _tx; _ly = _ty; continue; } return;
      }
    }
    /* 泉命中（onSpring未指定なら素通り：シオン銃弾などアイテムでない弾向け）。遠投中は無視して素通り */
    if (onSpring && !_isFc) {
      const _spr = dg.springs?.find(s => s.x === _tx && s.y === _ty);
      if (_spr) {
        onSpring(_spr, _tx, _ty, ml);
        if (_passthrough) { _cx = _tx; _cy = _ty; _lx = _tx; _ly = _ty; continue; } return;
      }
    }
    /* 罠命中（onTrap未指定なら素通り）。コールバックは"destroyed"を返すと弾消滅、それ以外は飛翔継続 */
    if (onTrap) {
      const _trap = dg.traps?.find(t => t.x === _tx && t.y === _ty);
      if (_trap) {
        const _trapResult = onTrap(_trap, _tx, _ty, ml);
        if (_trapResult === "destroyed") return;
        /* 罠を踏んでも壊れなければ弾は同位置で停止（壁等と同様） */
        if (_passthrough) { _cx = _tx; _cy = _ty; _lx = _tx; _ly = _ty; continue; } _lx = _tx; _ly = _ty; if (onFlyOff) onFlyOff(_lx, _ly, ml); return;
      }
    }
    _cx = _tx; _cy = _ty; _lx = _tx; _ly = _ty;
  }
  if (onFlyOff) onFlyOff(_lx, _ly, ml);
}

/* ===== モンスター杖振り魔法弾の共通処理 =====
 * 魔法弾は射程20マス（既定）の直線飛翔。命中時の効果のみが各杖で異なる。
 * 共通処理:
 *   - 魔封じの魔方陣で消滅
 *   - 壁/境界で跳ね返り→射手に効果（onWallReflect）
 *   - プレイヤー命中：反射の鎧→射手に反射（onPlayerReflect）、祝福聖域→ブロック、
 *     statusImmune→無効、proofAbility装備→ブロック、それ以外→onPlayerHit
 *   - モンスター命中：magicImmune→無効、magicreflect→反射（onMagicReflect）、
 *     barrier→1回分消費、それ以外→onMonsterHit
 *   - 大箱/アイテム/罠命中：弾道停止＋onBigbox/onItem/onTrap（指定なしなら「効果なし」メッセージ）
 *   - 何にも当たらず：「虚空に消えた」メッセージ
 * opts:
 *   dx, dy: 発射方向
 *   range: 飛距離（既定20）
 *   boltColor: pushMonsterBoltAnimのcolor/effectキー
 *   reflectColor: 反射の鎧アニメ用カラー
 *   wandLabel: メッセージ用名称（例「眠り」「混乱」）
 *   fireMsg: 開始メッセージ（例「${m.name}が眠りの杖を振った！」）
 *   proofAbility: プレイヤー側の耐性能力ID（例 "sleep_proof"）。指定があれば自動チェック。
 *   onPlayerHit(mlx): プレイヤー命中時の効果適用
 *   onMonsterHit(mon, mlx): 中間モンスター命中時の効果適用
 *   onWallReflect(mlx): 壁/境界で跳ね返って射手に効果
 *   onMagicReflect(reflectorMon, mlx): magicreflectで射手に効果
 *   onPlayerReflect(mlx): 反射の鎧で射手に効果
 *   onBigbox(bb, mlx): 大箱命中時（任意）
 *   onItem(it, mlx): アイテム命中時（任意）
 *   onTrap(trap, mlx): 罠命中時（任意）
 *   itemNameFn(it): 表示名関数（任意、未指定なら .name）
 *   bbNameFn(bb): 大箱表示名関数（任意、未指定なら .name）
 */
export function _resolveMonsterWandBolt(m, dg, pl, ml, opts) {
  let {
    dx, dy,
    range = 20,
    boltColor,
    reflectColor,
    wandLabel = "魔法",
    fireMsg = null,
    proofAbility = null,
    onPlayerHit,
    onMonsterHit,
    onWallReflect,
    onMagicReflect,
    onPlayerReflect,
    onBigbox = null,
    onItem = null,
    onTrap = null,
    itemNameFn = null,
    bbNameFn = (bb) => bb.name,
  } = opts;

  if (fireMsg) ml.push(fireMsg);
  /* 杖の魔法弾：判定・アニメとも風で曲がらない */
  pushMonsterBoltAnim(m.x, m.y, dx, dy, dg, pl, boltColor, false);

  let _hit = false;
  let _cx = m.x, _cy = m.y;
  for (let _d = 1; _d < range; _d++) {
    const _st = stepProjectile(dg, _cx, _cy, dx, dy, { wind: false });
    dx = _st.dx; dy = _st.dy;
    const _tx = _st.x, _ty = _st.y;
    _cx = _tx; _cy = _ty;
    /* 魔封じの魔方陣 */
    if (inMagicSealRoom(_tx, _ty, dg)) {
      ml.push("魔法弾が魔封じの魔方陣で消えた！");
      _hit = true; break;
    }
    /* 壁/境界：跳ね返って射手に効果 */
    if (_tx < 0 || _tx >= MW || _ty < 0 || _ty >= MH || dg.map[_ty][_tx] === T.WALL || dg.map[_ty][_tx] === T.BWALL) {
      onWallReflect(ml);
      _hit = true; break;
    }
    /* 石像：敵の杖弾は有害効果なので破壊 */
    if (statueAt(dg, _tx, _ty)) {
      hitStatueWithAction(dg, _tx, _ty, pl, ml, luFn, pl?.depth, {
        breaks: true,
        itemDeps: getFixtureItemDeps(),
      });
      _hit = true; break;
    }
    /* プレイヤー命中 */
    if (_tx === pl.x && _ty === pl.y) {
      if (hasAbility(pl.armor, "wand_reflect")) {
        ml.push(`反射の鎧が${wandLabel}の魔法弾を反射した！`);
        if (reflectColor) pushAnim({ type: "monProjectileReturn", fromX: pl.x, fromY: pl.y, toX: m.x, toY: m.y, color: reflectColor });
        onPlayerReflect(ml);
      } else if (!inMagicSealRoom(pl.x, pl.y, dg) && dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y)) {
        ml.push(`祝福された聖域の加護が${wandLabel}の魔法を防いだ！`);
      } else if ((pl.statusImmune || 0) > 0) {
        ml.push(`${wandLabel}の魔法弾を受けた！しかし状態防止中のため効かなかった！`);
      } else if (proofAbility && hasAbility(pl.armor, proofAbility)) {
        ml.push(`${wandLabel}の魔法弾を受けた！しかし防具が防いだ！`);
      } else {
        onPlayerHit(ml);
      }
      _hit = true; break;
    }
    /* モンスター命中 */
    const _mon = dg.monsters.find(mn => mn.x === _tx && mn.y === _ty && mn !== m);
    if (_mon) {
      /* 魔法無効（キラープラスター等）：杖の魔法弾を完全無効化 */
      if (_mon.magicImmune) {
        ml.push(`魔法は${_mon.name}に効かない！`);
      } else if (_mon.subtype === "magicreflect") {
        ml.push(`${_mon.name}が${wandLabel}の魔法弾を反射した！`);
        onMagicReflect(_mon, ml);
      } else if (consumeBarrier(_mon, ml)) {
        /* バリア術師：1回分のバリアで消滅 */
      } else {
        onMonsterHit(_mon, ml);
      }
      _hit = true; break;
    }
    /* 大箱：弾道停止＋カスタム効果 or「効果なし」 */
    const _bb = dg.bigboxes?.find(b => b.x === _tx && b.y === _ty);
    if (_bb) {
      if (onBigbox) onBigbox(_bb, ml);
      else ml.push(`${wandLabel}の魔法弾が${bbNameFn(_bb)}に命中したが効果がなかった。`);
      _hit = true; break;
    }
    /* アイテム */
    const _it = itemAt(dg, _tx, _ty);
    if (_it) {
      if (onItem) onItem(_it, ml);
      else ml.push(`${wandLabel}の魔法弾が${itemNameFn(_it)}に命中したが効果がなかった。`);
      _hit = true; break;
    }
    /* 罠 */
    const _tr = dg.traps?.find(t => t.x === _tx && t.y === _ty);
    if (_tr) {
      if (onTrap) onTrap(_tr, ml);
      else { _tr.revealed = true; ml.push(`${wandLabel}の魔法弾が${_tr.name}に命中したが効果がなかった。`); }
      _hit = true; break;
    }
  }
  if (!_hit) ml.push(`${wandLabel}の魔法弾は虚空に消えた。`);
}

function isStationaryGrabber(m) {
  return m && (m.subtype === "grabber" || m.baseKind === "grabber");
}

/** 魔方陣を描ける空床か（プレイヤーのペンと同じ：階段・アイテム・罠等があると不可） */
function isPentacleDrawBlocked(dg, x, y) {
  if (!dg?.map) return true;
  const tile = dg.map[y]?.[x];
  if (tile === T.WALL || tile === T.BWALL || tile === T.SD || tile === T.SU || tile === T.WATER) return true;
  if (dg.items?.some(i => i.x === x && i.y === y)) return true;
  if (dg.traps?.some(t => t.x === x && t.y === y)) return true;
  if (dg.springs?.some(s => s.x === x && s.y === y)) return true;
  if (dg.bigboxes?.some(b => b.x === x && b.y === y)) return true;
  if (dg.oilyTiles?.some(t => t.x === x && t.y === y)) return true;
  if (dg.statues?.some(s => s.x === x && s.y === y)) return true;
  if (dg.vents?.some(v => v.x === x && v.y === y)) return true;
  if (dg.pentacles?.some(pc => pc.x === x && pc.y === y)) return true;
  return false;
}

/** 長時間停滞／往復時に別方向へ1歩逃がす */
function tryUnstickMove(m, dg, pl, float = false) {
  if (!m || !dg) return false;
  if (isStationaryGrabber(m) || m.type === "shopkeeper" || m.dormant || m.dormantHouse) return false;
  const map = dg.map;
  const recent = new Set((m.posHistory || []).map(p => p.x + p.y * MW));
  recent.add(m.x + m.y * MW);
  const dirs = shuffle([[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]);
  const tryDirs = (preferNew) => {
    for (const [dx, dy] of dirs) {
      const nx = m.x + dx, ny = m.y + dy;
      if (!canEnter(map, nx, ny, float, dg)) continue;
      if (nx === pl?.x && ny === pl?.y) continue;
      if (dg.monsters.some(o => o !== m && o.x === nx && o.y === ny)) continue;
      if (!inMagicSealRoom(m.x, m.y, dg) &&
          dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === nx && pc.y === ny)) continue;
      if (preferNew && recent.has(nx + ny * MW)) continue;
      m.dir = { x: dx, y: dy };
      m.x = nx; m.y = ny;
      m.posHistory = [];
      m._idleStuck = 0;
      m.patrolTarget = null;
      return true;
    }
    return false;
  };
  /* 最近通ったマス以外を優先 → だめならどこでも */
  return tryDirs(true) || tryDirs(false);
}

function isPosHistoryStuck(m) {
  const ph = m.posHistory || [];
  if (ph.length < 6) return false;
  const allSame = ph.every(p => p.x === ph[0].x && p.y === ph[0].y);
  const isOsc = (ph[0].x !== ph[1].x || ph[0].y !== ph[1].y) &&
    ph.every((p, i) => i % 2 === 0
      ? (p.x === ph[0].x && p.y === ph[0].y)
      : (p.x === ph[1].x && p.y === ph[1].y));
  return allSame || isOsc;
}

/** モンスターAI。移動後は重力罠。長時間動けなければ別方向へ強制移動。 */
export function monsterAI(m, dg, pl, ml, opts = {}) {
  const _sx = m.x, _sy = m.y;
  const _float = !!(m.float || (m.floatTurns || 0) > 0) &&
    (m.magicImmune || !hasGravityPentacle(dg, m.x, m.y));
  try {
    _monsterAIBody(m, dg, pl, ml, opts);
  } finally {
    /* からめ鬼：AI中のスワップ等で動いたら必ず元位置へ（未発見歩行の原因） */
    if (isStationaryGrabber(m) && (m.x !== _sx || m.y !== _sy)) {
      m.x = _sx; m.y = _sy;
      m.dir = { x: 0, y: 0 };
    }
    const moved = m.x !== _sx || m.y !== _sy;
    if (moved) {
      _checkGravityTrap(m, dg, pl, ml, opts.luFn || (() => {}));
    }
    const movementDisabled =
      m.paralyzed ||
      (m.sleepTurns || 0) > 0 ||
      (m.immobileTurns || 0) > 0;
    if (movementDisabled) {
      m._idleStuck = 0;
      m.posHistory = [];
    }
    /* 攻撃専用フェーズでは詰まりカウントしない（移動フェーズのみ） */
    if (!movementDisabled && !opts.attackOnly && !isStationaryGrabber(m) && m.type !== "shopkeeper" &&
        !m.dormant && !m.dormantHouse) {
      /* プレイヤーと隣接中は戦闘優先：詰まり脱出で変な移動をしない */
      const _adjPl = pl && Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1 &&
        (pl.potConfinedTurns || 0) <= 0;
      if (_adjPl) {
        m._idleStuck = 0;
      } else {
        if (!moved) {
          m._idleStuck = (m._idleStuck || 0) + 1;
        } else {
          m._idleStuck = 0;
        }
        const stuckHist = isPosHistoryStuck(m);
        /* 9ターン以上同マス停滞、または往復・停滞パターンなら別方向へ */
        if (m._idleStuck >= 9 || stuckHist) {
          if (tryUnstickMove(m, dg, pl, _float)) {
            _checkGravityTrap(m, dg, pl, ml, opts.luFn || (() => {}));
          }
        }
      }
    }
  }
}

registerMonsterRuntime({
  getMonsterCatalog: () => MONS,
  spawnMonsters,
  monLevelUp,
  monLevelDown,
  resolveMonsterBolt: _resolveBolt,
  findMonsterRoom: findRoom,
  scaleMonsterFireDamage: scaleMonFireDmg,
  monsterFireDamageLabel: monFireDmgLabel,
});

function _monsterAIBody(m, dg, pl, ml, opts = {}) {
  const _moveOnly = opts.moveOnly || false;
  let _attackOnly = opts.attackOnly || false;
  const _luFn = opts.luFn || (() => {});
  const _onHit = opts.onPlayerHit;
  const _onMiss = opts.onPlayerMiss;
  const _plPotHidden = (pl.potConfinedTurns || 0) > 0;
  /* 重力の魔方陣：浮遊系モンスターの実効float（魔法無効モンスターは重力の影響を受けない）
   * floatTurns: 浮遊の罠など一時浮遊 */
  const _hasFloatFlag = !!(m.float || (m.floatTurns || 0) > 0);
  const _effFloat = _hasFloatFlag && (m.magicImmune || !hasGravityPentacle(dg, m.x, m.y));
  /* 呪い重力の魔方陣：ゾーン内モンスターは浮遊状態扱い（魔法無効モンスターには無効） */
  const _isCursedGravFloat = !_hasFloatFlag && !m.magicImmune && hasCursedGravityPentacle(dg, m.x, m.y);
  /* モンスターハウス仮眠：triggerMonsterHouseで解除されるまで動かない */
  if (m.dormantHouse) return;
  /* 目覚めたターンは行動しない（袋叩き防止） */
  if (m._justWoke) { m._justWoke = false; return; }
  /* 囮のペン（祝福）: 仮眠中でも起こして誘導（dormant チェックより先に処理）（魔封じで無効） */
  if (m.dormant && !m.dormantHouse && !inMagicSealRoom(m.x, m.y, dg) &&
      dg.pentacles?.some(pc => pc.kind === "decoy" && pc.blessed && !(pl.x === pc.x && pl.y === pc.y))) {
    m.dormant = false;
    m.aware = true;
    delete m._dormantHp;
    m._dormantTouched = false;
  }
  /* 通常仮眠：視界に入るか、何らかのアクションを受けたら即覚醒 */
  /* ボスは同じ部屋にプレイヤーが踏み込んだ瞬間に目覚める */
  if (m.dormant) {
    const _wasHit = m.hp < (m._dormantHp ?? m.hp);
    const _bossRoomEntry = m.isBoss && (() => {
      const _br = findRoom(dg.rooms, m.x, m.y);
      return _br !== null && findRoom(dg.rooms, pl.x, pl.y) === _br;
    })();
    if (dg.visible?.[m.y]?.[m.x] || _wasHit || m._dormantTouched || _bossRoomEntry) {
      wakeIfDormant(m, ml);
    } else {
      m._dormantHp = m.hp;
      return;
    }
  }
  /* 状態異常防止：毎ターンカウントダウン */
  if ((m.statusImmune || 0) > 0) {
    m.statusImmune = Math.max(0, m.statusImmune - (m.isBoss ? 2 : 1));
    if (m.statusImmune <= 0) ml.push(`${m.name}の状態防止が切れた！`);
  }
  /* バーサーク状態：カウントダウン */
  if ((m.berserkerTurns || 0) > 0) {
    if (!_attackOnly) m.berserkerTurns = Math.max(0, m.berserkerTurns - (m.isBoss ? 2 : 1));
    if (m.berserkerTurns <= 0) ml.push(`${m.name}のバーサーク状態が解けた！`);
  }
  /* 平和主義状態：攻撃できず、ランダムに1歩移動して終了 */
  if ((m.pacifistTurns || 0) > 0) {
    if (!_attackOnly) m.pacifistTurns = Math.max(0, m.pacifistTurns - (m.isBoss ? 2 : 1));
    if (m.pacifistTurns <= 0) { ml.push(`${m.name}の平和主義状態が解けた！`); m.turnAccum = 0; }
    else if (!_attackOnly) {
      const _pdirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
      const _pshuf = [..._pdirs].sort(() => Math.random() - 0.5);
      for (const [_pdx, _pdy] of _pshuf) {
        const _pnx = m.x + _pdx, _pny = m.y + _pdy;
        if (!canEnter(dg.map, _pnx, _pny, _effFloat, dg)) continue;
        if (dg.monsters.some(o => o !== m && o.x === _pnx && o.y === _pny)) continue;
        if (_pnx === pl.x && _pny === pl.y) continue;
        if (!inMagicSealRoom(m.x, m.y, dg) && dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _pnx && pc.y === _pny)) continue;
        m.dir = { x: _pdx, y: _pdy }; m.x = _pnx; m.y = _pny; m._movedThisTurn = true; break;
      }
      return;
    }
  }
  /* 毒状態：毎ターン現HP×10%+5ダメージ */
  if ((m.poisonedTurns || 0) > 0 && !_attackOnly) {
    m.poisonedTurns = Math.max(0, m.poisonedTurns - (m.isBoss ? 2 : 1));
    const _pdmg = Math.floor(m.hp * 0.1) + 5;
    m.hp -= _pdmg;
    ml.push(`毒に侵された${m.name}は${_pdmg}ダメージ！`);
    if (m.hp <= 0) { killMonster(m, dg, pl, ml, _luFn); return; }
    if (m.poisonedTurns <= 0) {
      ml.push(`${m.name}の毒が切れた。`);
      if (m.poisonHalfAtk) { m.atk = m.poisonOrigAtk ?? m.atk; delete m.poisonHalfAtk; delete m.poisonOrigAtk; }
    }
  }
  /* 盲目状態（ボスのみターン経過で解除） */
  if (m.blind && m.isBoss && !_attackOnly) {
    m.blindTurns = Math.max(0, ((m.blindTurns || 0) - 2));
    if (m.blindTurns <= 0) { m.blind = false; ml.push(`${m.name}の盲目が解けた！`); m.turnAccum = 0; m._movedThisTurn = true; return; }
  }
  /* 幻惑状態（ボスのみターン経過で解除） */
  if (m.bewitched && m.isBoss && !_attackOnly) {
    m.bewitchedTurns = Math.max(0, ((m.bewitchedTurns || 0) - 2));
    if (m.bewitchedTurns <= 0) { m.bewitched = false; ml.push(`${m.name}の幻惑が解けた！`); m.turnAccum = 0; m._movedThisTurn = true; return; }
  }
  /* 封印状態（ボスのみターン経過で解除） */
  if (m.sealed && m.isBoss && !_attackOnly) {
    if ((m.sealedTurns || 0) > 0) {
      m.sealedTurns = Math.max(0, m.sealedTurns - 2);
      if (m.sealedTurns <= 0) { m.sealed = false; ml.push(`${m.name}の封印が解けた！`); m.turnAccum = 0; m._movedThisTurn = true; return; }
    }
  }
  /* ── grabber捕獲解除チェック：プレイヤーが1マス超離れた or 捕獲者が状態異常 ── */
  if (m.subtype === "grabber" && pl.capturedBy === m.id) {
    const _gRelDist = Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y));
    const _gBadStatus = (m.sleepTurns || 0) > 0 || m.paralyzed || (m.confusedTurns || 0) > 0 ||
      (m.darknessTurns || 0) > 0 || (m.fleeingTurns || 0) > 0 || m.sealed || m.bewitched ||
      (m.poisonedTurns || 0) > 0 || (m.immobileTurns || 0) > 0 || m.blind || (m.oilyTurns || 0) > 0;
    if (_gRelDist > 1 || _gBadStatus) {
      pl.capturedBy = null;
      ml.push(`${m.name}の捕獲が解けた！`);
    }
  }
  if (m.sleepTurns > 0) {
    if (!_attackOnly) m.sleepTurns = Math.max(0, m.sleepTurns - (m.isBoss ? 2 : 1));
    if (m.sleepTurns <= 0) { ml.push(`${m.name}の睡眠が解けた！`); m.turnAccum = 0; m._movedThisTurn = true; }
    return;
  }
  /* 金縛り（ダメージを受けたら即解除、ボスのみターン経過でも解除） */
  if (m.paralyzed) {
    if (m._paralyzeHp != null && m.hp < m._paralyzeHp) {
      m.paralyzed = false; m._paralyzeHp = null;
      ml.push(`${m.name}はダメージで金縛りが解けた！`);
      m.turnAccum = 0; m._movedThisTurn = true; return;
    }
    if (m.isBoss && (m.paralyzeTurns || 0) > 0 && !_attackOnly) {
      m.paralyzeTurns = Math.max(0, m.paralyzeTurns - 2);
      if (m.paralyzeTurns <= 0) { m.paralyzed = false; m._paralyzeHp = null; ml.push(`${m.name}の金縛りが解けた！`); m.turnAccum = 0; m._movedThisTurn = true; return; }
    }
    if (m.paralyzed) return;
  }
  /* ===== ボス固有AI ===== */
  /* 遺物の番人：7ターンごとにプレイヤーの隣に瞬間移動（逃げ場なし）
     HP50%以下で激昂：毎ターン5HP回復 + 次ワープまでの間隔が4ターンに縮む */
  if (m.baseKind === "pursuer" && !_moveOnly) {
    const _enraged = m.hp <= m.maxHp * 0.5;
    if (_enraged && !m._enragedPursuer) {
      m._enragedPursuer = true;
      ml.push(`${m.name}が怒りに燃えた！その目が赤く輝く…！`);
    }
    /* HP回復（激昂後のみ） */
    if (_enraged) {
      const _rh = Math.min(5, m.maxHp - m.hp);
      if (_rh > 0) { m.hp += _rh; }
    }
    /* ワープカウントダウン */
    const _warpInterval = _enraged ? 4 : 7;
    m._warpCooldown = (m._warpCooldown === undefined ? _warpInterval : m._warpCooldown) - 1;
    if (m._warpCooldown <= 0) {
      m._warpCooldown = _warpInterval;
      const _warpDirs = shuffle([[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]);
      let _warped = false;
      for (const [_wdx, _wdy] of _warpDirs) {
        const _wx = pl.x + _wdx, _wy = pl.y + _wdy;
        if (dg.map[_wy]?.[_wx] !== T.FLOOR) continue;
        if (dg.monsters.some(mn => mn !== m && mn.x === _wx && mn.y === _wy)) continue;
        m.x = _wx; m.y = _wy;
        ml.push(`${m.name}が閃光とともにプレイヤーの目前に降り立った！`);
        _warped = true;
        break;
      }
      if (!_warped) m._warpCooldown = 1; /* 失敗したらすぐ再試行 */
    }
  }
  /* シオン・ザ・ダークブレット：直線上で銃撃 */
  if (m.baseKind === "boss_darkbullet" && !_moveOnly) {
    const _dbAdx = pl.x - m.x, _dbAdy = pl.y - m.y;
    const _dbLen = Math.max(Math.abs(_dbAdx), Math.abs(_dbAdy));
    const _dbInLine = _dbAdx === 0 || _dbAdy === 0 || Math.abs(_dbAdx) === Math.abs(_dbAdy);
    const _dbLOS = (dg.visible?.[m.y]?.[m.x] ?? false) && hasLOS(dg.map, m.x, m.y, pl.x, pl.y);
    if (_dbLOS && _dbInLine && _dbLen >= 2 && _dbLen <= 10 && m.turnAttacks < (m.maxAttacks ?? 1)) {
      _resolveBolt(m, dg, pl, ml, _luFn, {
        dx: Math.sign(pl.x - m.x), dy: Math.sign(pl.y - m.y),
        baseRange: 10, animColor: "#111111",
        fireMsg: `${m.name}が銃撃した！`, boltName: "銃弾",
        deathCause: `${m.name}の銃撃で`,
        calcPlDmg: () => calcAtkDefDmg(m.atk + 6, calcPlayerDef(pl), { defWeight: 1.5 }),
        calcMonDmg: (mon) => Math.max(1, m.atk - Math.floor((mon.def || 0) / 2) + rng(-2, 2)),
      });
      if (m.hp > 0) m.turnAttacks++;
      return;
    }
  }

  /* 深淵の番人：毎ターン8HP回復（最大HPを超えない） */
  if (m.baseKind === "boss_guardian" && !_moveOnly) {
    const _heal = Math.min(8, m.maxHp - m.hp);
    if (_heal > 0) { m.hp += _heal; ml.push(`${m.name}は傷を再生した！(+${_heal}HP)`); }
  }
  /* 魔神王：5ターンごとに周囲に取り巻きを1体召喚（召喚したターンは攻撃しない） */
  if (m.baseKind === "boss_demonking" && !_moveOnly) {
    m._summonCooldown = (m._summonCooldown || 0) - 1;
    if (m._summonCooldown <= 0) {
      m._summonCooldown = 5;
      const _bDirs = shuffle([[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]);
      const _shuffled = _bDirs;
      let _summoned = false;
      for (const [_sdx, _sdy] of _shuffled) {
        const _sx = m.x + _sdx, _sy = m.y + _sdy;
        if (dg.map[_sy]?.[_sx] !== T.FLOOR) continue;
        if (dg.monsters.some(mn => mn.x === _sx && mn.y === _sy)) continue;
        if (pl.x === _sx && pl.y === _sy) continue;
        const _depth = Math.max(0, (m.bossTier || 4) * 4);
        dg.monsters.push(makeMonster(_depth, _sx, _sy, { aware: true, lastPx: m.x, lastPy: m.y, dungeonType: dg.dungeonType ?? null }));
        ml.push(`${m.name}が魔力で手下を召喚した！`);
        _summoned = true;
        break;
      }
      if (_summoned) return; /* 召喚したターンは行動消費 */
      m._summonCooldown = 1; /* 召喚できなければすぐ再試行 */
    }
  }

  /* 骸骨王：3ターンごとに周囲に手下を2体召喚（最大8体）（召喚したターンは攻撃しない） */
  if (m.baseKind === "boss_skullking" && !_moveOnly) {
    m._summonCooldown = (m._summonCooldown || 0) - 1;
    if (m._summonCooldown <= 0) {
      m._summonCooldown = 3;
      const _bDirs = shuffle([[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]);
      const _nearMons = dg.monsters.filter(mn => Math.abs(mn.x - m.x) <= 3 && Math.abs(mn.y - m.y) <= 3 && mn !== m);
      if (_nearMons.length < 8) {
        let _summoned = 0;
        for (const [_sdx, _sdy] of _bDirs) {
          if (_summoned >= 2) break;
          const _sx = m.x + _sdx, _sy = m.y + _sdy;
          if (dg.map[_sy]?.[_sx] !== T.FLOOR) continue;
          if (dg.monsters.some(mn => mn.x === _sx && mn.y === _sy)) continue;
          if (pl.x === _sx && pl.y === _sy) continue;
          const _depth = Math.max(0, (m.bossTier || 6) * 4);
          dg.monsters.push(makeMonster(_depth, _sx, _sy, { aware: true, lastPx: m.x, lastPy: m.y, dungeonType: dg.dungeonType ?? null }));
          _summoned++;
        }
        if (_summoned > 0) { ml.push(`${m.name}が骨の手下を呼び寄せた！`); return; } /* 召喚行動消費 */
        else m._summonCooldown = 1;
      }
    }
  }
  /* 炎帝竜：毎ターン40%でプレイヤーに油まみれ付与（視界内時）（付与したターンは攻撃しない） */
  if (m.baseKind === "boss_flamedragon" && !_moveOnly) {
    const _fdVisible = (dg.visible?.[m.y]?.[m.x] ?? false) && hasLOS(dg.map, m.x, m.y, pl.x, pl.y);
    if (_fdVisible && Math.random() < 0.40) {
      pl.oilyTurns = (pl.oilyTurns || 0) + 8;
      ml.push(`${m.name}が炎の息を吐き散らした！油まみれになった！(8ターン)`);
      return; /* ブレス行動消費 */
    }
  }
  /* 虚無の僧侶：毎ターン12HP回復（行動消費なし）+ 5ターンごとにランダム状態異常付与（付与したターンは攻撃しない） */
  if (m.baseKind === "boss_voidmonk" && !_moveOnly) {
    const _vh = Math.min(12, m.maxHp - m.hp);
    if (_vh > 0) { m.hp += _vh; ml.push(`${m.name}は虚無の力で回復した！(+${_vh}HP)`); }
    m._statusCooldown = (m._statusCooldown || 0) - 1;
    if (m._statusCooldown <= 0) {
      m._statusCooldown = 5;
      const _r = Math.random();
      if (_r < 0.33) { pl.slowTurns = (pl.slowTurns || 0) + 6; ml.push(`${m.name}の呪いで足が重くなった！(6ターン)`); }
      else if (_r < 0.66) {
        if ((pl.yogurtImmuneTurns || 0) > 0) { ml.push(`${m.name}の幻術！しかし乳酸菌が混乱を防いだ！`); }
        else { pl.confusedTurns = (pl.confusedTurns || 0) + 4; ml.push(`${m.name}の幻術で混乱した！(4ターン)`); }
      }
      else { pl.sealedTurns = (pl.sealedTurns || 0) + 6; ml.push(`${m.name}の空間歪曲で魔法が封印された！(6ターン)`); }
      return; /* 状態異常付与行動消費 */
    }
  }
  /* 煉獄公：周囲4マスを油まみれタイルに（行動消費なし） + HP50%以下で激昂（speed+1、行動消費なし） */
  if (m.baseKind === "boss_infernoking" && !_moveOnly) {
    dg.oilyTiles = dg.oilyTiles || [];
    for (const [_dx, _dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const _tx = m.x + _dx, _ty = m.y + _dy;
      if (dg.map[_ty]?.[_tx] === T.FLOOR &&
          !dg.statues?.some(s => s.x === _tx && s.y === _ty) &&
          !dg.oilyTiles.some(t => t.x === _tx && t.y === _ty))
        dg.oilyTiles.push({ x: _tx, y: _ty });
      const _ikTrap = dg.traps?.find(t => t.x === _tx && t.y === _ty && !t.permanent);
      if (_ikTrap) removeTrap(dg, _ikTrap, ml, { message: `油で${_ikTrap.name}が消えた！`, p: pl });
    }
    if (!m._enraged && m.hp <= m.maxHp * 0.5) {
      m._enraged = true;
      m.speed = 3;        /* speed=2 → 3：3アクション/ターンで手がつけられない */
      m.maxAttacks = 3;   /* 攻撃回数上限も解放 */
      ml.push(`${m.name}が激昂した！速度が跳ね上がった！`);
    }
  }
  /* 深淵神：毎ターン20HP回復（行動消費なし）+ 4ターンごとに周囲に2体召喚（召喚したターンは攻撃しない） */
  if (m.baseKind === "boss_abyssgod" && !_moveOnly) {
    const _ah = Math.min(20, m.maxHp - m.hp);
    if (_ah > 0) { m.hp += _ah; ml.push(`${m.name}は深淵の力で回復した！(+${_ah}HP)`); }
    m._summonCooldown = (m._summonCooldown || 0) - 1;
    if (m._summonCooldown <= 0) {
      m._summonCooldown = 4;
      const _agDirs = shuffle([[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]);
      let _summoned = 0;
      for (const [_sdx, _sdy] of _agDirs) {
        if (_summoned >= 2) break;
        const _sx = m.x + _sdx, _sy = m.y + _sdy;
        if (dg.map[_sy]?.[_sx] !== T.FLOOR) continue;
        if (dg.monsters.some(mn => mn.x === _sx && mn.y === _sy)) continue;
        if (pl.x === _sx && pl.y === _sy) continue;
        const _depth = Math.max(0, (m.bossTier || 10) * 5);
        dg.monsters.push(makeMonster(_depth, _sx, _sy, { aware: true, lastPx: m.x, lastPy: m.y, dungeonType: dg.dungeonType ?? null }));
        _summoned++;
      }
      if (_summoned > 0) { ml.push(`${m.name}が深淵から手下を招いた！`); return; } /* 召喚行動消費 */
      else m._summonCooldown = 1;
    }
  }

  /* クラーケン：逃走AI＋墨吐き（二フェーズシステム対応） ※HP回復はGame.jsx側で実施 */
  if (m.baseKind === "im_boss_kraken") {
    if (_moveOnly) {
      if (!m._krakFleeing && m.hp < m.maxHp * 0.5) {
        m._krakFleeing = true;
        ml.push(`${m.name}はHPが半分を切り、水の奥へ逃げ出した！`);
      } else if (m._krakFleeing && m.hp >= m.maxHp * 0.8) {
        m._krakFleeing = false;
        ml.push(`${m.name}は体力を回復し、再び向かってきた！`);
      }
    }
    /* 逃走移動：moveOnlyフェーズで最近傍の水タイルにBFS移動 */
    if (m._krakFleeing && _moveOnly) {
      /* 最もスコアの高い水タイル（最深部）を目標に */
      let _target = null, _bestWaterScore = -1;
      for (let _wy = 0; _wy < MH; _wy++) {
        for (let _wx = 0; _wx < MW; _wx++) {
          if (dg.map[_wy]?.[_wx] !== T.WATER) continue;
          let _ws = 0;
          for (const [_dx2, _dy2] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]])
            if (dg.map[_wy + _dy2]?.[_wx + _dx2] === T.WATER) _ws++;
          if (_ws > _bestWaterScore) { _bestWaterScore = _ws; _target = { x: _wx, y: _wy }; }
        }
      }
      if (_target) {
        const _next = bfsNext(dg.map, dg.monsters, m.x, m.y, _target.x, _target.y, m, 40, dg.pentacles, true, null, false, dg.rooms, dg);
        if (_next && !(_next.x === pl.x && _next.y === pl.y)) { m.x = _next.x; m.y = _next.y; }
      }
      return;
    }
    /* 逃走中はattackOnlyで何もしない */
    if (m._krakFleeing) return;
    /* 墨吐き：moveOnlyで45%予約→attackOnlyで実行 */
    if (_moveOnly) {
      const _kiAdx = pl.x - m.x, _kiAdy = pl.y - m.y;
      const _kiDist = Math.max(Math.abs(_kiAdx), Math.abs(_kiAdy));
      const _kiInLine = _kiAdx === 0 || _kiAdy === 0 || Math.abs(_kiAdx) === Math.abs(_kiAdy);
      const _kiLOS = hasLOS(dg.map, m.x, m.y, pl.x, pl.y);
      if (_kiDist >= 2 && _kiInLine && _kiLOS && m.turnAttacks < (m.maxAttacks ?? 2) && Math.random() < 0.45) {
        m._krakInkReady = true;
        return; /* 移動しない→attackOnlyで墨発動 */
      }
      /* 予約なし：通常BFS移動に委ねる */
    } else if (m._krakInkReady) {
      /* attackOnlyフェーズ：予約済み墨吐きを実行 */
      delete m._krakInkReady;
      const _kidx = Math.sign(pl.x - m.x), _kidy = Math.sign(pl.y - m.y);
      for (let _ki2 = 1; _ki2 < 20; _ki2++) {
        const _ktx = m.x + _kidx * _ki2, _kty = m.y + _kidy * _ki2;
        if (_ktx < 0 || _ktx >= MW || _kty < 0 || _kty >= MH) break;
        if (dg.map[_kty]?.[_ktx] === T.WALL || dg.map[_kty]?.[_ktx] === T.BWALL) break;
        if (_ktx === pl.x && _kty === pl.y) {
          const _kiDmg = Math.max(1, Math.floor(m.atk * 0.6) - Math.floor(calcPlayerDef(pl) / 3));
          pl.hp -= _kiDmg;
          pl.deathCause = `${m.name}の墨で`;
          pl.darknessTurns = (pl.darknessTurns || 0) + 15;
          ml.push(`${m.name}が墨を吐いた！${_kiDmg}ダメージ！暗闇状態になった！(15ターン)`);
          _onHit?.(_kiDmg, m);
          break;
        }
        if (dg.monsters.find(mn => mn.x === _ktx && mn.y === _kty && mn !== m)) break;
      }
      m.turnAttacks++;
      return;
    }
  }

  /* ===== 混乱状態：ランダム方向に移動・攻撃 ===== */
  /* 鈍足（ボスのみターン経過で元の速度に戻る） */
  if (m.isBoss && (m.bossSlowTurns || 0) > 0 && !_attackOnly) {
    m.bossSlowTurns = Math.max(0, m.bossSlowTurns - 2);
    if (m.bossSlowTurns <= 0 && m._preSlowSpeed !== undefined) {
      m.speed = m._preSlowSpeed;
      delete m._preSlowSpeed;
      ml.push(`${m.name}の鈍足が解けた！`);
      m.turnAccum = 0; m._movedThisTurn = true; return;
    }
  }
  /* 毒矢攻撃力半減（ボス：10ターンで回復） */
  if (m.isBoss && m.bossPoisonHalfAtk && !_attackOnly) {
    m.bossPoisonHalfAtkTurns = Math.max(0, (m.bossPoisonHalfAtkTurns || 0) - 2);
    if (m.bossPoisonHalfAtkTurns <= 0) {
      m.atk = m.bossPoisonOrigAtk ?? m.atk;
      m.bossPoisonHalfAtk = false;
      delete m.bossPoisonOrigAtk;
      ml.push(`${m.name}の攻撃力が戻った！`);
    }
  }
  /* 強化解除巻物デバフ：ATK/DEF半減（50ターン） */
  if ((m.debuffAtkHalfTurns || 0) > 0 && !_attackOnly) {
    m.debuffAtkHalfTurns = Math.max(0, m.debuffAtkHalfTurns - (m.isBoss ? 2 : 1));
    if (m.debuffAtkHalfTurns <= 0) {
      if (m._debuffOrigAtk !== undefined) { m.atk = m._debuffOrigAtk; delete m._debuffOrigAtk; }
      ml.push(`${m.name}の攻撃力デバフが解けた！`);
    }
  }
  if ((m.debuffDefHalfTurns || 0) > 0 && !_attackOnly) {
    m.debuffDefHalfTurns = Math.max(0, m.debuffDefHalfTurns - (m.isBoss ? 2 : 1));
    if (m.debuffDefHalfTurns <= 0) {
      if (m._debuffOrigDef !== undefined) { m.def = m._debuffOrigDef; delete m._debuffOrigDef; }
      ml.push(`${m.name}の防御力デバフが解けた！`);
    }
  }
  /* 移動封じ（氷の杖・影ぬいなど）：移動はできないが攻撃・特技は可能 */
  if ((m.immobileTurns||0) > 0) {
    if (!_attackOnly) m.immobileTurns = Math.max(0, m.immobileTurns - (m.isBoss ? 2 : 1));
    if (m.immobileTurns <= 0) { ml.push(`${m.name}の移動封じが解けた！`); m.turnAccum = 0; m._movedThisTurn = true; return; }
    else _attackOnly = true;
  }
  /* ===== 混乱状態：ランダム方向に移動・攻撃 ===== */
  if ((m.confusedTurns || 0) > 0) {
    if (!_attackOnly) m.confusedTurns = Math.max(0, m.confusedTurns - (m.isBoss ? 2 : 1));
    if (isStationaryGrabber(m)) { if (m.confusedTurns <= 0) ml.push(`${m.name}の混乱が解けた！`); return; }
    const _cdirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
    const _rd = pick(_cdirs);
    const _cnx = m.x + _rd[0], _cny = m.y + _rd[1];
    if (inBounds(_cnx, _cny)) {
      if (_cnx === pl.x && _cny === pl.y && !_plPotHidden) {
        if (!_moveOnly && m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `混乱した${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn }); }
      } else {
        const _other = dg.monsters.find(o => o !== m && o.x === _cnx && o.y === _cny);
        if (_other) {
          if (!_moveOnly) {
            const _odmg = Math.max(1, calcAtkDefDmg(m.atk, _other.def || 0, { defWeight: 1, variance: false }) + rng(-1, 1));
            _other.hp -= _odmg;
            ml.push(`混乱した${m.name}が${_other.name}を攻撃！${_odmg}ダメージ！`);
            if (_other.hp <= 0) {
              ml.push(`${_other.name}は倒れた！`);
              removeMonster(dg, _other);
              monLevelUp(m, dg, ml);
            }
          }
        } else if (!_attackOnly && isWalkable(dg.map, _cnx, _cny, dg)) {
          m.x = _cnx; m.y = _cny;
        }
      }
    }
    if (m.confusedTurns <= 0) { ml.push(`${m.name}の混乱が解けた！`); m.turnAccum = 0; m._movedThisTurn = true; }
    return;
  }

  /* ===== 暗闇状態：まっすぐ進み途中の者を攻撃 ===== */
  if ((m.darknessTurns || 0) > 0) {
    const _isPerm = m.darknessTurns >= 9999;
    if (!_isPerm && !_attackOnly) m.darknessTurns = Math.max(0, m.darknessTurns - (m.isBoss ? 2 : 1));
    if (isStationaryGrabber(m)) { if (!_isPerm && m.darknessTurns <= 0) ml.push(`${m.name}の暗闇が晴れた！`); return; }
    if (!m.darkDir) {
      const _ddirs = [[-1,0],[1,0],[0,-1],[0,1]];
      m.darkDir = pick(_ddirs);
    }
    const _dnx = m.x + m.darkDir[0], _dny = m.y + m.darkDir[1];
    if (canEnter(dg.map, _dnx, _dny, _effFloat, dg)) {
      if (_dnx === pl.x && _dny === pl.y) {
        if (!_moveOnly && m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `暗闇の${m.name}が突進して攻撃！${d}ダメージ！`, { skipVuln: true, skipThorn: true, onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn }); }
      } else {
        const _dother = dg.monsters.find(o => o !== m && o.x === _dnx && o.y === _dny);
        if (_dother) {
          if (!_moveOnly) {
            const _dodmg = Math.max(1, calcAtkDefDmg(m.atk, _dother.def || 0, { defWeight: 1, variance: false }) + rng(-1, 1));
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
    if (!_isPerm && m.darknessTurns <= 0) { ml.push(`${m.name}の暗闇が晴れた！`); m.turnAccum = 0; m._movedThisTurn = true; }
    return;
  }

  /* ===== 幻惑状態：プレイヤーから逃げ回る ===== */
  if ((m.fleeingTurns || 0) > 0) {
    const _isPerm = m.fleeingTurns >= 9999;
    if (!_isPerm && !_attackOnly) m.fleeingTurns = Math.max(0, m.fleeingTurns - (m.isBoss ? 2 : 1));
    if (isStationaryGrabber(m)) { if (!_isPerm && m.fleeingTurns <= 0) ml.push(`${m.name}の幻惑が解けた！`); return; }
    if (!_attackOnly) {
      const _fleeStep = fleeFromPlayerStep(m, dg, pl, _effFloat);
      if (_fleeStep) {
        m.dir = { x: _fleeStep.x - m.x, y: _fleeStep.y - m.y };
        m.x = _fleeStep.x; m.y = _fleeStep.y;
      }
    }
    if (!_isPerm && m.fleeingTurns <= 0) { ml.push(`${m.name}の幻惑が解けた！`); m.turnAccum = 0; m._movedThisTurn = true; }
    return;
  }

  /* ===== 分裂スライム：ダメージを受けたターンに25%で分裂（体力全快の個体を生成） ===== */
  if (m.subtype === "splitter" && m.hp > 0) {
    const _prevHp = m._lastHp;
    m._lastHp = m.hp;
    if (_prevHp !== undefined && m.hp < _prevHp && Math.random() < 0.25) {
      const _splitDirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
      for (const [_sdx, _sdy] of _splitDirs) {
        const _snx = m.x + _sdx, _sny = m.y + _sdy;
        if (!canEnter(dg.map, _snx, _sny, false, dg)) continue;
        if (_snx === pl.x && _sny === pl.y) continue;
        if (dg.monsters.some(o => o.x === _snx && o.y === _sny)) continue;
        const _child = { ...m, id: uid(), x: _snx, y: _sny,
          hp: m.maxHp, maxHp: m.maxHp,
          posHistory: [], turnAccum: 0, patrolTarget: null, _lastHp: m.maxHp };
        delete _child.hasSplit;
        dg.monsters.push(_child);
        ml.push(`${m.name}が分裂した！`);
        break;
      }
    }
  }

  /* ===== ボムスライム：HPが一桁になると警告→次ターンに爆発 ===== */
  if (m.subtype === "deathbomb" && m.hp > 0 && m.hp <= 9 && !m.deathBombExploded) {
    if (m.deathBombReady) {
      if (isFireExplosionNullified(dg, pl)) {
        m.deathBombReady = false;
        return;
      }
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

  /* ===== 爆弾ゴブリン：プレイヤーに隣接すると確率で自爆、失敗時は通常攻撃 ===== */
  if (m.subtype === "kamikaze" && !m.sealed && !_moveOnly) {
    if (Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1) {
      const _kzChance = (m.monLevel || 1) >= 2 ? 0.50 : 0.25;
      if (m.turnAttacks < (m.maxAttacks ?? 1) && Math.random() < _kzChance) {
        m.turnAttacks++;
        if (isFireExplosionNullified(dg, pl)) return;
        const _kzX = m.x, _kzY = m.y, _kzName = m.name;
        m.hp = 0;
        killMonster(m, dg, pl, ml, _luFn, true);
        doExplosion(_kzX, _kzY, dg, pl, ml, null, `${_kzName}の自爆`, null, _luFn, false, true, true, true);
        return;
      }
      if (m.turnAttacks < (m.maxAttacks ?? 1)) {
        m.turnAttacks++;
        monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
      }
      return;
    }
  }

  /* ===== 罠師：部屋内（Lv3は廊下も可）で足元にランダムな罠を仕掛ける ===== */
  if (m.subtype === "trapmaster" && !m.sealed && !_attackOnly) {
    const _tmLvl = m.monLevel || 1;
    /* Lv3は廊下も可、Lv1/2は部屋内のみ */
    const _tmRoom = findRoom(dg.rooms, m.x, m.y);
    const _tmCanPlace = _tmLvl >= 3 ? isWalkable(dg.map, m.x, m.y, dg) : _tmRoom !== null;
    if (_tmCanPlace) {
      /* Lv2以上は発動確率50%、Lv1は25% */
      const _tmChance = _tmLvl >= 2 ? 0.25 : 0.125;
      /* 足元に罠以外のものがあれば設置不可 */
      const _tmBlocked =
        dg.items?.some(it => it.x === m.x && it.y === m.y) ||
        dg.springs?.some(s => s.x === m.x && s.y === m.y) ||
        dg.bigboxes?.some(b => b.x === m.x && b.y === m.y) ||
        dg.pentacles?.some(pc => pc.x === m.x && pc.y === m.y) ||
        dg.oilyTiles?.some(t => t.x === m.x && t.y === m.y) ||
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
          /* 既存の罠を除去して新しい罠に置き換える（仕掛け直しなのでアイテムは出さない） */
          removeTrap(dg, _existTrap, ml, { skipLoot: true, p: pl });
        }
        const _newTrap = { ...pickTrap(_candidates), id: uid(), x: m.x, y: m.y, revealed: true };
        dg.traps = dg.traps || [];
        dg.traps.push(_newTrap);
        ml.push(`${m.name}が罠を仕掛けた！`);
        return;
      }
    }
  }

  /* ===== バリア術師：非隣接時にバリアを張り直す／レベル2以上は隣接モンスターにも付与 ===== */
  if (m.baseKind === "barriermage" && !m.sealed) {
    const _adjPl = Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1;
    if (!_adjPl) {
      /* 自分のバリアが優先：なければ50%で張り直す */
      if (!m.barrier && rng(0, 1) === 0) {
        m.barrier = 1;
        ml.push(`${m.name}がバリアを張り直した！（残り1回）`);
        return;
      }
      /* レベル2以上かつ自分のバリアあり：バリアのない隣接モンスターに付与 */
      if (m.monLevel >= 2 && m.barrier) {
        const _adjTargets = dg.monsters.filter(o =>
          o !== m && Math.abs(o.x - m.x) <= 1 && Math.abs(o.y - m.y) <= 1 && !o.barrier && !o.sealed
        );
        if (_adjTargets.length > 0) {
          const _bt = _adjTargets[rng(0, _adjTargets.length - 1)];
          _bt.barrier = 1;
          ml.push(`${m.name}が${_bt.name}にバリアを付与した！`);
          return;
        }
      }
    }
  }

  /* ===== ゼラチンキューブ Lv2以上：最近アイテムを積極的に追う ===== */
  if (m.baseKind === "gelcube" && m.monLevel >= 2 && m.aware && !m.sealed) {
    const _gcAdjPl = Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1;
    if (_gcAdjPl) {
      if (!_moveOnly && m.turnAttacks < (m.maxAttacks ?? 1)) {
        m.turnAttacks++;
        monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
      }
      return;
    }
    if (dg.items.length > 0) {
      const _gcTarget = dg.items.reduce((best, it) =>
        Math.hypot(it.x - m.x, it.y - m.y) < Math.hypot(best.x - m.x, best.y - m.y) ? it : best
      );
      const _gcNext = bfsNext(dg.map, dg.monsters, m.x, m.y, _gcTarget.x, _gcTarget.y, m, 30, dg.pentacles, _effFloat, null, false, dg.rooms, dg);
      if (_gcNext && !dg.monsters.some(o => o !== m && o.x === _gcNext.x && o.y === _gcNext.y)) {
        if (_gcNext.x === pl.x && _gcNext.y === pl.y) {
          if (!_plOnSanc &&
              !_moveOnly && m.turnAttacks < (m.maxAttacks ?? 1)) {
            m.dir = { x: _gcNext.x - m.x, y: _gcNext.y - m.y };
            m.turnAttacks++;
            monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
          }
          return;
        }
        m.dir = { x: _gcNext.x - m.x, y: _gcNext.y - m.y };
        m.x = _gcNext.x;
        m.y = _gcNext.y;
        _gelCubeAbsorbItems(m, dg, ml);
        return;
      }
    }
    /* アイテムなし or 経路なし → 通常AIへフォールスルー */
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
      /* 聖域の魔法陣の上にいる場合は隣接フロアタイルに退く（魔封じで無効） */
      const _skSanctSupp = inMagicSealRoom(m.x, m.y, dg);
      if (!_skSanctSupp && dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === m.x && pc.y === m.y)) {
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
      const _skSanctSupp = inMagicSealRoom(_bp.x, _bp.y, dg);
      const _bpSanc = !_skSanctSupp && dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _bp.x && pc.y === _bp.y);
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
            const _bn = bfsNext(dg.map, dg.monsters, m.x, m.y, _bp.x, _bp.y, m, 10, null, _effFloat, null, false, dg.rooms, dg);
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
  const _plInvis = (pl.invisibleTurns || 0) > 0 || _plPotHidden;
  /*
   * 視認（相互認識）:
   * - 同部屋
   * - 隣接
   * - プレイヤーの視界内にいる（FOV 対称：見える敵はこちらも認識する）
   *
   * 旧実装は「FOV内 かつ hasLOS」で、廊下2マス視界内でも Bresenham が角壁で
   * hasLOS を落とすと canSee=false → 古い lastPx（画面右など）へ歩き続けた。
   * 遠くの暗闇の敵は FOV 外のままなので、認識しない挙動は維持される。
   */
  const _inPlayerFov = !!(dg.visible?.[m.y]?.[m.x]);
  const _adjPl = Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1;
  const canSee = !_plInvis && (_sameRoom || _adjPl || _inPlayerFov);
  if (_plPotHidden) {
    m.aware = false;
    m.lastPx = m.x;
    m.lastPy = m.y;
  }
  /* 聖域チェック（魔封じの魔方陣が同部屋にあれば聖域効果は無効） */
  const _sanctSuppressed = inMagicSealRoom(pl.x, pl.y, dg);
  const _plOnSanc = !_sanctSuppressed && dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y);
  const _plOnBlessedSanc = !_sanctSuppressed && _plOnSanc && dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y);

  if (canSee) {
    m.aware = true;
    m.lastPx = pl.x;
    m.lastPy = pl.y;
  } else if (m.aware && m.x === m.lastPx && m.y === m.lastPy) {
    m.aware = false;
  }
  /* 囮のペン（呪い）: フロア全敵が常にプレイヤーを認識して追跡（魔封じで無効） */
  if (!_plPotHidden && !inMagicSealRoom(m.x, m.y, dg) && dg.pentacles?.some(pc => pc.kind === "decoy" && pc.cursed)) {
    m.aware = true;
    m.lastPx = pl.x;
    m.lastPy = pl.y;
  }
  /* 囮のペン（祝福）: フロア全敵に囮への認識を付与（魔封じで無効） */
  if (!m.aware && !inMagicSealRoom(m.x, m.y, dg) && dg.pentacles?.some(pc => pc.kind === "decoy" && pc.blessed && !(pl.x === pc.x && pl.y === pc.y))) {
    m.aware = true;
  }

  /* ===== 壁歩き（ゴースト系）：壁を無視して接近。他モンスター・聖域は迂回 ===== */
  if (m.wallWalker && !_plPotHidden) {
    /* 隣接していれば攻撃 */
    if (Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1) {
      if (_plOnSanc) return;
      if (!_moveOnly && m.turnAttacks < (m.maxAttacks ?? 1)) {
        m.turnAttacks++;
        const _wwInWall = dg.map[m.y]?.[m.x] === T.WALL;
        monsterAttackPlayer(m, dg, pl, ml, d => _wwInWall
          ? `${m.name}が壁を突き抜けて攻撃！${d}ダメージ！`
          : `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
        return;
      }
      if (_moveOnly) return; /* moveOnlyフェーズ：隣接済みなので移動しない */
      /* 2回目以降は移動のみ → 経路探索へフォールスルー */
    }
    if (!_attackOnly) {
      /* 外周・破壊不能壁以外は壁も含め通行可（他モンスターは bfsNext が迂回） */
      const _wwCan = (x, y) =>
        x > 0 && x < MW - 1 && y > 0 && y < MH - 1 &&
        dg.map[y]?.[x] !== T.BWALL;
      const _wwOk = (nx, ny) =>
        _wwCan(nx, ny) &&
        !(nx === pl.x && ny === pl.y) &&
        !dg.monsters.some(o => o !== m && o.x === nx && o.y === ny) &&
        !(!inMagicSealRoom(m.x, m.y, dg) && dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === nx && pc.y === ny));
      const _wn = bfsNext(
        dg.map, dg.monsters, m.x, m.y, pl.x, pl.y, m,
        40, dg.pentacles, false, _wwCan, true, dg.rooms, dg
      );
      if (_wn && _wwOk(_wn.x, _wn.y)) {
        m.x = _wn.x; m.y = _wn.y;
      } else {
        /* BFS失敗時：周囲8方向でプレイヤー距離が縮まる空きマスへ */
        const _oldD = Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y));
        let _best = null, _bestD = _oldD;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = m.x + dx, ny = m.y + dy;
            if (!_wwOk(nx, ny)) continue;
            const d = Math.max(Math.abs(pl.x - nx), Math.abs(pl.y - ny));
            if (d < _bestD) { _bestD = d; _best = { x: nx, y: ny }; }
          }
        }
        if (_best) { m.x = _best.x; m.y = _best.y; }
      }
    }
    return;
  }

  /* ===== 壁掘り（岩砕き等）：覚醒時は壁を掘り進んでプレイヤーへ直進 ===== */
  if (m.wallDigger && m.aware) {
    if (Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1) {
      if (_plOnSanc) return;
      if (!_moveOnly && m.turnAttacks < (m.maxAttacks ?? 1)) {
        m.turnAttacks++;
        monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
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
            !(!inMagicSealRoom(m.x, m.y, dg) && dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _wdnx && pc.y === _wdny))) {
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

  /* ── わてり：水上以外では動けない（干上がり状態） ── */
  if (m.waterOnly) {
    const _wtOnWater = dg.map[m.y]?.[m.x] === T.WATER || dg.springs?.some(s => s.x === m.x && s.y === m.y);
    if (!_wtOnWater) {
      /* 水の外に出た：完全に無力化（攻撃・移動不可） */
      if (!m._waterlessWarned) {
        m._waterlessWarned = true;
        ml.push(`${m.name}は水の外では動けない！`);
      }
      return;
    }
    m._waterlessWarned = false;
  }

  if (m.aware) {
    /* ── grabber（からめ鬼等）：静止型 ─ 移動コードより先に処理して即return ── */
    if (isStationaryGrabber(m)) {
      if (Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1 && canSee) {
        let _justCaptured = false;
        if (!pl.capturedBy) {
          pl.capturedBy = m.id;
          _justCaptured = true;
          ml.push(`${m.name}に絡め取られた！倒さなければ逃げられない！`);
          if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("衝撃で目が覚めた！"); }
          if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("衝撃で金縛りが解けた！"); }
        }
        if (!_justCaptured && !_plOnSanc) {
          if (!_moveOnly && m.turnAttacks < (m.maxAttacks ?? 1)) {
            m.turnAttacks++;
            monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
          }
        }
      }
      return; /* からめ鬼は絶対に移動しない（スワップも finally で差し戻し） */
    }

    /* ===== 囮のペン（通常・祝福）: 特技含む全行動を囮に誘導 ===== */
    /* プレイヤーが魔方陣の上にいる場合は通常行動（下の special handlers に委ねる） */
    {
      const _decoyPc = dg.pentacles?.find(pc => pc.kind === "decoy" && !pc.cursed);
      if (_decoyPc && !(pl.x === _decoyPc.x && pl.y === _decoyPc.y)) {
        const _decoyRoom = findRoom(rooms, _decoyPc.x, _decoyPc.y);
        const _affByDecoy = _decoyPc.blessed
          ? true /* 祝福: フロア全体 */
          : (_decoyRoom !== null && _monRoom !== null &&
             _decoyRoom.x === _monRoom.x && _decoyRoom.y === _monRoom.y);
        if (_affByDecoy) {
          /* 既に囮の上に陣取り中 */
          if (m.x === _decoyPc.x && m.y === _decoyPc.y) {
            if (!_moveOnly) {
              const _nearMon = dg.monsters.find(o =>
                o !== m && Math.abs(o.x - m.x) <= 1 && Math.abs(o.y - m.y) <= 1
              );
              if (_nearMon && m.turnAttacks < (m.maxAttacks ?? 1)) {
                m.turnAttacks++;
                const _ddmg = Math.max(1, m.atk - Math.floor((_nearMon.def || 0) / 2));
                _nearMon.hp -= _ddmg;
                ml.push(`${m.name}が${_nearMon.name}を攻撃！${_ddmg}ダメージ！`);
                if (_nearMon.hp <= 0) {
                  killMonster(_nearMon, dg, pl, ml, null, true, m);
                }
              }
            }
            return; /* 陣取り中は動かない */
          }
          /* attackOnlyフェーズ: moveOnlyでBFS成功済みの場合のみ囮へのロジックを維持 */
          /* BFS失敗（_decoyLuredOkなし）なら通常AIにフォールスルーしてプレイヤーを攻撃 */
          if (_attackOnly) {
            if (m._decoyLuredOk) {
              delete m._decoyLuredOk;
              const _adjDist = Math.max(Math.abs(m.x - _decoyPc.x), Math.abs(m.y - _decoyPc.y));
              if (_adjDist <= 1 && m.turnAttacks < (m.maxAttacks ?? 1)) {
                const _adjOccup = dg.monsters.find(o =>
                  o !== m && o.x === _decoyPc.x && o.y === _decoyPc.y
                );
                if (_adjOccup) {
                  m.turnAttacks++;
                  const _ddmg = Math.max(1, m.atk - Math.floor((_adjOccup.def || 0) / 2));
                  _adjOccup.hp -= _ddmg;
                  ml.push(`${m.name}が${_adjOccup.name}を攻撃！${_ddmg}ダメージ！`);
                  if (_adjOccup.hp <= 0) {
                    killMonster(_adjOccup, dg, pl, ml, null, true, m);
                  }
                }
              }
              return; /* 囮に誘導中: 特技ハンドラに落ちないよう return */
            }
            return; /* BFS失敗でも attackOnly ではプレイヤーを攻撃しない（彷徨い中） */
          }
          /* moveOnly/通常フェーズ: BFSで囮に向かって移動（特技ハンドラをスキップ） */
          /* 祝福版はフロア全体が対象なので maxDist を大きくする */
          const _decoyMaxDist = _decoyPc.blessed ? 120 : 40;
          m._decoyLuredOk = false; /* BFS前にリセット */
          /* プレイヤー・他モンスターを障害物扱いにして迂回路を探す */
          const _decoyTileFilter = (x, y) =>
            (x === pl.x && y === pl.y) ? false : canEnter(map, x, y, _effFloat, dg);
          const _dn = bfsNext(map, dg.monsters, m.x, m.y, _decoyPc.x, _decoyPc.y, m, _decoyMaxDist, dg.pentacles, _effFloat, _decoyTileFilter, true, dg.rooms, dg);
          if (_dn) {
            /* BFS到達成功か最近傍タイルへの第一歩（到達不可の場合）を取得 */
            m._decoyLuredOk = true; /* 次のattackOnlyフェーズでも囮ロジック維持 */
            /* BFS次ステップがプレイヤー位置: 通常攻撃して重なりを防ぐ */
            if (_dn.x === pl.x && _dn.y === pl.y) {
              if (!_moveOnly && !_plOnSanc &&
                  m.turnAttacks < (m.maxAttacks ?? 1)) {
                m.turnAttacks++;
                m.dir = { x: _dn.x - m.x, y: _dn.y - m.y };
                monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
              }
              return;
            }
            const _occup = dg.monsters.find(o => o !== m && o.x === _dn.x && o.y === _dn.y);
            if (_occup && !_moveOnly) {
              /* 次マスに別の敵: 囮の争奪戦 */
              const _ddmg = Math.max(1, m.atk - Math.floor((_occup.def || 0) / 2));
              _occup.hp -= _ddmg;
              ml.push(`${m.name}が${_occup.name}を攻撃！${_ddmg}ダメージ！`);
              if (_occup.hp <= 0) {
                killMonster(_occup, dg, pl, ml, null, true, m);
              }
            } else if (!_occup) {
              m.dir = { x: _dn.x - m.x, y: _dn.y - m.y };
              m.x = _dn.x; m.y = _dn.y;
              m.aware = true;
            }
            return;
          }
          return; /* BFS経路なし: プレイヤーへの移動・攻撃なし（その場に留まる） */
        }
      }
    }
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
      const _dragonRdy0 = (m.baseKind === "dragon" || m.baseKind === "im_boss_salamander") && !m.sealed && _rAtks && _rLen >= 2 &&
        (m.baseKind === "im_boss_salamander" ? (canSee && _rLine) : (_dfLvl0 >= 2 ? _sameRoom : _rLine));
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
      const _chargerRdy = m.subtype === "charger" && !m.sealed && _rAtks && _rLine && _rLen >= 2;
      /* わてり：水鉄砲 */
      const _wgRdy = m.subtype === "watergunner" && !m.sealed && _rLine && _rLen >= 1 && _rLen <= 8 && _rAtks;
      const _ptLvl0 = m.monLevel || 1;
      const _ptRange0 = _ptLvl0 >= 3 ? 10 : _ptLvl0 >= 2 ? 7 : 5;
      const _ptRdy0 = m.subtype === "potionthrow" && !m.sealed && _rAtks && canSee && _rLine && Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y)) <= _ptRange0;
      const _iceDragonRdy0 = m.baseKind === "icedragon" && !m.sealed && _rAtks && _rLen >= 2 &&
        ((m.monLevel || 1) >= 2 ? _sameRoom : _rLine);
      const _guardDarkRdy0 = m.type === "guard" && !m.sealed && _rAtks && (_radx === 0 || _rady === 0) && _rLen >= 2 && _rLen <= 8;
      const _darkBulletRdy0 = m.baseKind === "boss_darkbullet" && !m.sealed && _rAtks && _rLine && _rLen >= 2 && _rLen <= 10;
      if ((_archerRdy || _stoneRdy || _wandRdy || _dragonRdy0 || _ttRdy0 || _mtRdy0 || _chargerRdy || _wgRdy || _ptRdy0 || _iceDragonRdy0 || _guardDarkRdy0 || _darkBulletRdy0) && (m.alwaysUseSpecial || Math.random() < 0.5)) {
        m._rangedAttackThisTurn = true;
        return; /* 攻撃ターンと決定→移動しない。attackOnlyフェーズで攻撃する */
      }
      /* defhalf：同部屋で20%防御半減魔法を予約（移動せず攻撃フェーズで発動） */
      if (m.subtype === "defhalf" && !m.sealed && _sameRoom && _rAtks && Math.random() < 0.20) {
        m._defHalfMagicReady = true;
        return;
      }
      /* pentaclePainter：同部屋で25%魔方陣描画を予約（足元の状態に関係なく同じ確率で試行） */
      if (m.subtype === "pentaclePainter" && !m.sealed && _sameRoom && _rAtks && Math.random() < 0.25) {
        m._pentacleDrawReady = true;
        return;
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

      /* ── charger（突進角獣等）：一直線上で突進攻撃（移動フェーズで予約済み） ── */
      if (m.subtype === "charger" && !m.sealed && _rdy && m.turnAttacks < (m.maxAttacks ?? 1)) {
        const _chAdx = pl.x - m.x, _chAdy = pl.y - m.y;
        const _chDist = Math.max(Math.abs(_chAdx), Math.abs(_chAdy));
        const _chLine = _chAdx === 0 || _chAdy === 0 || Math.abs(_chAdx) === Math.abs(_chAdy);
        const _chLvl = m.monLevel || 1;
        const _chRange = _chLvl >= 3 ? 8 : _chLvl >= 2 ? 5 : 3;
        if (_chLine && _chDist >= 2) {
          const _chdx = Math.sign(_chAdx), _chdy = Math.sign(_chAdy);
          let _chMoved = 0;
          for (let _ci = 0; _ci < _chRange; _ci++) {
            const _cnx = m.x + _chdx, _cny = m.y + _chdy;
            if (_cnx < 0 || _cnx >= MW || _cny < 0 || _cny >= MH) break;
            if (dg.map[_cny][_cnx] === T.WALL || dg.map[_cny][_cnx] === T.BWALL) break;
            if (_cnx === pl.x && _cny === pl.y) {
              if (!_plOnSanc) {
                m.turnAttacks++;
                monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}が突進して攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
              }
              break;
            }
            const _chOther = dg.monsters.find(o => o !== m && o.x === _cnx && o.y === _cny);
            if (_chOther) {
              m.turnAttacks++;
              const _chDmg = Math.max(1, calcAtkDefDmg(m.atk, _chOther.def || 0, { defWeight: 1, variance: false }) + rng(-1, 1));
              _chOther.hp -= _chDmg;
              ml.push(`${m.name}が突進して${_chOther.name}に当たった！${_chDmg}ダメージ！`);
              if (_chOther.hp <= 0) {
                ml.push(`${_chOther.name}は倒れた！`);
                removeMonster(dg, _chOther);
                monLevelUp(m, dg, ml);
              }
              break;
            }
            m.x = _cnx; m.y = _cny; _chMoved++;
          }
          if (_chMoved > 0) ml.push(`${m.name}が突進した！`);
          return;
        }
      }

      if (m.subtype === "archer" && !m.sealed && !_plOnBlessedSanc && inLine && lineLen >= 1 && lineLen <= 10 && m.turnAttacks < (m.maxAttacks ?? 1) && (_rdy || m.alwaysUseSpecial || Math.random() < 0.5)) {
        m.turnAttacks++;
        monsterShootArrow(m, dg, pl, ml, opts);
        return;
      }

      /* ── watergunner（わてり等）：一直線上で水鉄砲攻撃 ── */
      if (m.subtype === "watergunner" && !m.sealed && !_plOnBlessedSanc && inLine && lineLen >= 1 && lineLen <= 8 && m.turnAttacks < (m.maxAttacks ?? 1) && (_rdy || m.alwaysUseSpecial || Math.random() < 0.5)) {
        m.turnAttacks++;
        monsterShootWaterGun(m, dg, pl, ml);
        return;
      }

      if (m.subtype === "stonethrow" && !m.sealed && m.turnAttacks < (m.maxAttacks ?? 1)) {
        const _stLvl = m.monLevel || 1;
        const _stRange = _stLvl >= 3 ? 10 : _stLvl >= 2 ? 5 : 3;
        const _stDist = Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y));
        if (_stDist <= _stRange && !_plOnBlessedSanc && (_rdy || m.alwaysUseSpecial || Math.random() < 0.5)) {
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
        if (_ttCands.length > 0 && !_plOnBlessedSanc && (_rdy || m.alwaysUseSpecial || Math.random() < 0.5)) {
          const _ttTrap = _ttCands[0];
          m.turnAttacks++;
          pl.x = _ttTrap.x; pl.y = _ttTrap.y;
          ml.push(`${m.name}がプレイヤーを${_ttTrap.name}に向かって放り投げた！`);
          if ((pl.immobileTurns || 0) > 0) { pl.immobileTurns = 0; ml.push("吹き飛ばされて移動封じが解けた！"); }
          opts.fireTrapFn(_ttTrap, pl, dg, ml);
          return;
        }
      }

      if (m.subtype === "potionthrow" && !m.sealed && m.turnAttacks < (m.maxAttacks ?? 1)) {
        const _ptLvl = m.monLevel || 1;
        const _ptRange = _ptLvl >= 3 ? 10 : _ptLvl >= 2 ? 7 : 5;
        const _ptDist = Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y));
        const _ptStraight = adx === 0 || ady === 0 || Math.abs(adx) === Math.abs(ady);
        if (_ptStraight && _ptDist <= _ptRange && canSee && !_plOnBlessedSanc && (_rdy || m.alwaysUseSpecial || Math.random() < 0.5)) {
          m.turnAttacks++;
          monsterThrowPotion(m, dg, pl, ml, opts.bbFn);
          return;
        }
      }

      /* ── 警備員：縦・横の直線上で暗闇の薬投げ ── */
      if (m.type === "guard" && !m.sealed && !_plOnBlessedSanc && (adx === 0 || ady === 0) && lineLen >= 2 && lineLen <= 8 && m.turnAttacks < (m.maxAttacks ?? 1) && (_rdy || m.alwaysUseSpecial || Math.random() < 0.4)) {
        m.turnAttacks++;
        ml.push(`${m.name}が暗闇の薬を投げた！`);
        pushMonsterBoltAnim(m.x, m.y, Math.sign(pl.x - m.x), Math.sign(pl.y - m.y), dg, pl, "#334466");
        splashPotion(dg, pl.x, pl.y, "darkness", 20, pl, ml, null, false, false);
        return;
      }

      if (m.subtype === "monsterthrow" && !m.sealed && m.turnAttacks < (m.maxAttacks ?? 1)) {
        const _mtLvl = m.monLevel || 1;
        const _mtRange = _mtLvl >= 3 ? 10 : _mtLvl >= 2 ? 5 : 3;
        const _mtDist = Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y));
        if (_mtDist <= _mtRange) {
          const _adjMons = dg.monsters.filter(o => o !== m &&
            Math.max(Math.abs(o.x - m.x), Math.abs(o.y - m.y)) === 1);
          const _adjPl = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]
            .map(([ddx, ddy]) => ({ x: pl.x + ddx, y: pl.y + ddy }))
            .filter(({ x, y }) => isWalkable(dg.map, x, y, dg) &&
              !dg.monsters.some(o => o.x === x && o.y === y));
          if (_adjMons.length > 0 && _adjPl.length > 0 && !_plOnBlessedSanc && (_rdy || m.alwaysUseSpecial || Math.random() < 0.5)) {
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
        if (!_wSeal && !_plOnBlessedSanc) {
          m.turnAttacks++;
          opts.monsterWandFn(m, Math.sign(adx), Math.sign(ady));
          return;
        }
        // 魔封じの部屋・祝福聖域の場合は杖を使えず通常行動へフォールスルー
      }
    }

    /* ── ドラゴン炎ブレス（Lv1:一直線 / Lv2:同部屋 / Lv3:同フロア）＋サラマンダー ── */
    if (!_moveOnly && (m.baseKind === "dragon" || m.baseKind === "im_boss_salamander") && !m.sealed && m.turnAttacks < (m.maxAttacks ?? 1)) {
      const _dfAdx = pl.x - m.x, _dfAdy = pl.y - m.y;
      const _dfDist = Math.max(Math.abs(_dfAdx), Math.abs(_dfAdy));
      const _dfLvl = m.monLevel || 1;
      let _canFire = false;
      if (_dfDist >= 2) {
        if (m.baseKind === "im_boss_salamander") {
          _canFire = canSee && (_dfAdx === 0 || _dfAdy === 0 || Math.abs(_dfAdx) === Math.abs(_dfAdy));
        } else if (_dfLvl >= 3) {
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
      if (_canFire && !_plOnBlessedSanc) {
        m.turnAttacks++;
        monsterDragonFire(m, dg, pl, ml, _onHit);
        return;
      }
    }

    /* ── 氷竜ブレス（Lv1:一直線 / Lv2:同部屋 / Lv3:同フロア） ── */
    if (!_moveOnly && m.baseKind === "icedragon" && !m.sealed && m.turnAttacks < (m.maxAttacks ?? 1)) {
      const _ibAdx = pl.x - m.x, _ibAdy = pl.y - m.y;
      const _ibDist = Math.max(Math.abs(_ibAdx), Math.abs(_ibAdy));
      const _ibLvl = m.monLevel || 1;
      let _ibCanFire = false;
      if (_ibDist >= 2) {
        if (_ibLvl >= 3) { _ibCanFire = true; }
        else if (_ibLvl >= 2) { _ibCanFire = canSee && _sameRoom; }
        else { _ibCanFire = canSee && (_ibAdx === 0 || _ibAdy === 0 || Math.abs(_ibAdx) === Math.abs(_ibAdy)); }
      }
      const _ibRdy = m._rangedAttackThisTurn;
      if (_ibRdy) delete m._rangedAttackThisTurn;
      if (_ibCanFire && !_plOnBlessedSanc) {
        m.turnAttacks++;
        monsterIceBreath(m, dg, pl, ml, _onHit);
        return;
      }
    }

    /* ── runner（フクマル等）：認識中は効率逃走（出口BFS）。未覚醒は通常パトロール ── */
    /* 封印中は逃げずに通常AI（接近・攻撃）で動く */
    if (m.subtype === "runner" && !m.sealed) {
      if (!_attackOnly) {
        const _fleeStep = fleeFromPlayerStep(m, dg, pl, _effFloat);
        if (_fleeStep) {
          m.dir = { x: _fleeStep.x - m.x, y: _fleeStep.y - m.y };
          m.x = _fleeStep.x; m.y = _fleeStep.y;
        }
      }
      return;
    }

    /* ── thief（コソドロ等）：隣接時に所持品を1つ盗んでワープ、その後また近づく ── */
    if (m.subtype === "thief" && !m.sealed) {
      const _tdx = pl.x - m.x, _tdy = pl.y - m.y;
      const _adj = Math.abs(_tdx) <= 1 && Math.abs(_tdy) <= 1;
      if (_adj && _moveOnly) return; /* moveOnlyフェーズ：隣接済みなので移動しない */
      if (_adj) {
        /* 50%は様子を見るだけ（無駄行動） */
        if (Math.random() < 0.50) {
          ml.push(`${m.name}はこちらの様子を伺っている…`);
          return;
        }
        const _hasAntiSteal = hasAbility(pl.armor, "anti_steal");
        if (_hasAntiSteal) {
          ml.push(`護盗の鎧が${m.name}の盗みを防いだ！`);
          /* 盗めないので通常攻撃（聖域上なら不可） */
          if (!_plOnSanc && m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn }); }
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
                if (isWalkable(dg.map, _cx, _cy, dg) &&
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
          const _stolenFinal = (_stolen.name === "ロングソード" && Math.random() < 0.10) ? { ...SOBURO_T, id: uid(), plus: _stolen.plus || 0 } : _stolen;
          placeItemAt(dg, _wx, _wy, _stolenFinal, ml, _ft);
          const _soboroMsg = _stolenFinal !== _stolen ? "なぜかソボロ助広に変化した…！" : "";
          if (_thieveTpBlock) {
            ml.push(`${m.name}が${_stolen.name}を盗んだ！呪われたテレポートの魔方陣に阻まれて逃げられない！${_soboroMsg}`);
          } else {
            ml.push(`${m.name}が${_stolen.name}を盗んで煙の中に消えた！${_soboroMsg}`);
          }
          return;
        }
        /* 盗めるものがなければ通常攻撃（聖域上なら不可） */
        if (!_plOnSanc && m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn }); }
        return;
      }
    }

    /* ── goldthief（レプラコーン等）：ゴールドを盗んで持ち逃げ、倒すと取り戻せる ── */
    if (m.subtype === "goldthief" && !m.sealed) {
      /* 初回起動時に初期所持金を設定 */
      if (!m._goldReady) {
        m._goldReady = true;
        const _lv = m.monLevel || 1;
        const _initMin = [50, 150, 300][_lv - 1];
        const _initMax = [200, 500, 1000][_lv - 1];
        m.heldGold = rng(_initMin, _initMax);
      }
      /* 盗んだ後は逃げ回る（runnerと同じ効率逃走） */
      if (m._stolenFromPlayer) {
        if (!_attackOnly) {
          const _fleeStep = fleeFromPlayerStep(m, dg, pl, _effFloat);
          if (_fleeStep) {
            m.dir = { x: _fleeStep.x - m.x, y: _fleeStep.y - m.y };
            m.x = _fleeStep.x; m.y = _fleeStep.y;
          }
        }
        return;
      }
      /* 未盗み：隣接時に盗む */
      const _gtAdj = Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1;
      if (_gtAdj && _moveOnly) return;
      if (_gtAdj) {
        /* 50%は様子を見るだけ */
        if (Math.random() < 0.50) {
          ml.push(`${m.name}はこちらの様子を伺っている…`);
          return;
        }
        const _gtAntiSteal = hasAbility(pl.armor, "anti_steal");
        if (_gtAntiSteal) {
          ml.push(`護盗の鎧が${m.name}の盗みを防いだ！`);
          if (m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn }); }
          return;
        }
        if (pl.gold > 0) {
          const _lv = m.monLevel || 1;
          const _stealMin = [200, 800, 1500][_lv - 1];
          const _stealMax = [600, 2000, 3000][_lv - 1];
          const _gtAmount = Math.min(pl.gold, rng(_stealMin, _stealMax));
          pl.gold -= _gtAmount;
          m.heldGold = (m.heldGold || 0) + _gtAmount;
          m._stolenFromPlayer = true;
          const _gtTpDst = randomTeleportDest(dg, m.x, m.y);
          if (_gtTpDst) { m.x = _gtTpDst.x; m.y = _gtTpDst.y; }
          ml.push(`${m.name}が金貨${_gtAmount}枚を盗んでテレポートした！`);
          return;
        }
        /* ゴールドがなければ通常攻撃 */
        if (m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn }); }
        return;
      }
    }

    /* ── disarmer（解装士等）：隣接時に装備品を強制解除 ── */
    if (m.subtype === "disarmer" && !m.sealed) {
      const _ueAdj = Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1;
      if (_ueAdj && _moveOnly) return;
      if (_ueAdj) {
        /* 解除できる装備スロットを収集（呪いは除外） */
        const _ueSlots = [];
        if (pl.weapon && !pl.weapon.cursed) _ueSlots.push({ slot: "weapon", it: pl.weapon });
        if (pl.armor  && !pl.armor.cursed)  _ueSlots.push({ slot: "armor",  it: pl.armor  });
        for (const ring of (pl.rings || [])) {
          if (!ring.cursed) _ueSlots.push({ slot: "ring", it: ring });
        }
        if (_ueSlots.length > 0) {
          const _ueCount = m.monLevel || 1; /* Lv1:1個, Lv2:2個, Lv3:3個 */
          const _pool = [..._ueSlots];
          for (let i = 0; i < _ueCount && _pool.length > 0; i++) {
            const _pick = _pool.splice(Math.floor(Math.random() * _pool.length), 1)[0];
            if (_pick.slot === "weapon") pl.weapon = null;
            else if (_pick.slot === "armor") pl.armor = null;
            else if (_pick.slot === "ring") {
              pl.rings = (pl.rings || []).filter(r => r !== _pick.it);
              if (_pick.it.effect === "life_ring") {
                const _bonus = (_pick.it.plus || 0) * 5;
                pl.maxHp = Math.max(1, pl.maxHp - _bonus);
                pl.hp = Math.min(pl.hp, pl.maxHp);
              }
              if (_pick.it.effect === "torch_ring") pl.visionBonus = Math.max(0, (pl.visionBonus || 0) - 1);
            }
            ml.push(`${m.name}に${resolveItemName(_pick.it)}を外された！`);
          }
          return;
        }
        /* 外せる装備がなければ通常攻撃 */
        if (m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn }); }
        return;
      }
    }

    /* ── itemblast（弾き師等）：隣接時に所持品を後方に弾き飛ばす ── */
    if (m.subtype === "itemblast" && !m.sealed) {
      const _ibAdj = Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1;
      if (_ibAdj && _moveOnly) return;
      if (_ibAdj) {
        const _ibAntiSteal = hasAbility(pl.armor, "anti_steal");
        if (_ibAntiSteal) {
          ml.push(`護盗の鎧が${m.name}の弾き飛ばしを防いだ！`);
          if (m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn }); }
          return;
        }
        /* 25%で特技発動、75%は通常攻撃 */
        if (!m.alwaysUseSpecial && Math.random() >= 0.25) {
          if (m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn }); }
          return;
        }
        const _ibCands = pl.inventory.filter(i => i.type !== "gold" && i.type !== "goal");
        if (_ibCands.length > 0) {
          const _ibItem = pick(_ibCands);
          pl.inventory.splice(pl.inventory.indexOf(_ibItem), 1);
          const _ibN = opts.itemNameFn ? opts.itemNameFn(_ibItem) : _ibItem.name;
          /* 弾く方向：プレイヤーからモンスターの反対方向（プレイヤーの後ろ） */
          const _ibdx = Math.sign(pl.x - m.x), _ibdy = Math.sign(pl.y - m.y);
          /* 遠投の魔方陣判定 */
          const _ibFcMode = getFarcastMode(pl.x, pl.y, dg);
          const _ibMaxRange = _ibFcMode === "cursed" ? 1 : _ibFcMode === "farcast" ? 50 : 10;
          /* 仮想射手：プレイヤー位置から弾く（hpなしで反射時の自爆ダメージなし） */
          const _shooter = { x: pl.x, y: pl.y, name: m.name };
          throwItemAlongLine(_shooter, dg, _ibItem, _ibdx, _ibdy, _ibMaxRange, ml, pl, _luFn, {
            animColor: "#ffdd44",
            killerMon: m,
            bbFn: opts.bbFn,
            nameFn: opts.itemNameFn,
            applyWandFn: opts.applyWandFn,
            /* 通常アイテム：「弾いて」「当てた」 */
            monHitMsg: (target, dmg) => `${m.name}が${_ibN}を弾いて${target.name}に当てた！${dmg}ダメージ！消滅した。`,
            /* 壺：「弾かれ」「当たって割れた」 */
            potHitMsg: (target, dmg) => `${m.name}に${_ibN}を弾かれ${target.name}に当たって割れた！${dmg}ダメージ！`,
            /* 薬瓶：「弾かれ」「当たって割れた」（splash前にpush） */
            potionHitMsg: (target) => `${m.name}に${_ibN}を弾かれ${target.name}に当たって割れた！`,
            /* 杖：「弾いて」「当てた」（apply前にpush） */
            wandHitMsg: (target) => `${m.name}が${_ibN}を弾いて${target.name}に当てた！`,
            /* 反射→プレイヤー命中時の薬瓶/杖前置き */
            potionPlHitMsg: () => `弾き返された${_ibN}がプレイヤーに命中して割れた！`,
            wandPlHitMsg: () => `弾き返された${_ibN}がプレイヤーに当たった！`,
            /* 泉/大箱着弾 */
            springLandMsg: () => `${m.name}に${_ibN}を弾かれ泉に落ちた！`,
            bigboxLandMsg: (bb) => `${m.name}に${_ibN}を弾かれ${bb.name}に入った！`,
            /* 何にも当たらず着地 */
            noHitLandMsg: (lx, ly, it) =>
              it.type === "pot"    ? `${m.name}に${_ibN}を弾かれた！壺が割れた！` :
              it.type === "potion" ? `${m.name}に${_ibN}を弾かれた！薬が割れた！` :
                                     `${m.name}に${_ibN}を弾かれた！`,
          });
          return;
        }
        /* 弾くものがなければ通常攻撃（聖域上なら不可） */
        if (!_plOnSanc && m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn }); }
        return;
      }
    }

    /* ── stealthrower（盗投士等）：盗む→次ターンに投げる ── */
    if (m.subtype === "stealthrower" && !m.sealed) {
      m.heldItems = m.heldItems || [];
      const _srAdj = Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1;
      const _srDist = Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y));
      const _srStraight = pl.x === m.x || pl.y === m.y || Math.abs(pl.x - m.x) === Math.abs(pl.y - m.y);
      /* moveOnlyフェーズ：アイテム持ちで直線上かつ経路クリアなら移動せず（攻撃フェーズで投げる） */
      if (_moveOnly && m.heldItems.length > 0 && canSee && _srDist > 1 && _srDist <= 8 && _srStraight) {
        const _srDxM = Math.sign(pl.x - m.x), _srDyM = Math.sign(pl.y - m.y);
        let _srPathOkM = true;
        let _cxM = m.x + _srDxM, _cyM = m.y + _srDyM;
        while (_cxM !== pl.x || _cyM !== pl.y) {
          if (_cxM < 0 || _cxM >= MW || _cyM < 0 || _cyM >= MH ||
              dg.map[_cyM][_cxM] === T.WALL || dg.map[_cyM][_cxM] === T.BWALL ||
              dg.bigboxes?.some(b => b.x === _cxM && b.y === _cyM) ||
              dg.springs?.some(s => s.x === _cxM && s.y === _cyM)) {
            _srPathOkM = false; break;
          }
          if (dg.monsters.find(mo => mo.x === _cxM && mo.y === _cyM)) break; /* 途中の敵：攻撃フェーズに委ねる */
          _cxM += _srDxM; _cyM += _srDyM;
        }
        if (_srPathOkM) return; /* 経路クリア：移動せず攻撃フェーズに委ねる */
        /* 経路に障害物：移動コードへフォールスルーして接近 */
      }
      /* 投擲フェーズ：アイテムを持っていて視界内（moveOnlyは上でreturn済 or フォールスルー） */
      if (!_moveOnly && m.heldItems.length > 0 && canSee && _srDist <= 8) {
        const _srDx = Math.sign(pl.x - m.x), _srDy = Math.sign(pl.y - m.y);
        if (_srStraight) {
          /* 経路チェック：障害物があれば投げない、途中に敵がいればそちらに命中 */
          let _srHitMon = null, _srPathOk = true;
          let _cx = m.x + _srDx, _cy = m.y + _srDy;
          while (_cx !== pl.x || _cy !== pl.y) {
            if (_cx < 0 || _cx >= MW || _cy < 0 || _cy >= MH ||
                dg.map[_cy][_cx] === T.WALL || dg.map[_cy][_cx] === T.BWALL ||
                dg.bigboxes?.some(b => b.x === _cx && b.y === _cy) ||
                dg.springs?.some(s => s.x === _cx && s.y === _cy)) {
              _srPathOk = false; break;
            }
            const _midMon = dg.monsters.find(mo => mo.x === _cx && mo.y === _cy);
            if (_midMon) { _srHitMon = _midMon; break; }
            _cx += _srDx; _cy += _srDy;
          }
          if (_srPathOk) {
            const _throwItem = m.heldItems[0];
            /* 中間敵に命中する場合：throwItemAlongLineに任せる */
            /* 中間敵なし＋プレイヤー到達の場合：anti-steal/25%missを先に判定 */
            if (!_srHitMon) {
              const _srAntiSteal = hasAbility(pl.armor, "anti_steal");
              if (_srAntiSteal) {
                m.heldItems.splice(0, 1);
                pushMonsterBoltAnim(m.x, m.y, _srDx, _srDy, dg, pl, "#ff8800");
                ml.push(`護盗の鎧が${m.name}の投擲を防いだ！${_throwItem.name}は地面に落ちた！`);
                const _srft = new Set();
                placeItemAt(dg, pl.x, pl.y, _throwItem, ml, _srft);
                return;
              }
              if (Math.random() < 0.25) {
                m.heldItems.splice(0, 1);
                pushMonsterBoltAnim(m.x, m.y, _srDx, _srDy, dg, pl, "#ff8800");
                ml.push(`${m.name}が盗んだ${_throwItem.name}を投げてきたが外れた！足元に落ちた。`);
                const _srDrop = safeArrowDrop(pl.x, pl.y, dg);
                _monDropWithSpring(_srDrop, _throwItem, dg, ml);
                return;
              }
            }
            /* 投擲：throwItemAlongLineで弾道・命中・薬瓶splash・壺scatter・杖発動を統合処理 */
            m.heldItems.splice(0, 1);
            const _srRes = throwItemAlongLine(m, dg, _throwItem, _srDx, _srDy, _srDist, ml, pl, _luFn, {
              animColor: "#ff8800",
              killerMon: m,
              applyWandFn: opts.applyWandFn,
              /* 中間敵命中：「${m}が投げた${item}が${target}に...」 */
              monHitMsg: (target, dmg) => `${m.name}が投げた${_throwItem.name}が${target.name}に命中！${dmg}ダメージ！消滅した。`,
              potHitMsg: (target, dmg) => `${m.name}が投げた${_throwItem.name}が${target.name}に当たって割れた！${dmg}ダメージ！`,
              potionHitMsg: (target) => `${m.name}が投げた${_throwItem.name}が${target.name}に当たって割れた！`,
              wandHitMsg: (target) => `${m.name}が投げた${_throwItem.name}が${target.name}に命中！`,
              /* プレイヤー命中：「${m}が盗んだ${item}を投げてきた！...」 */
              plHitMsg: (dmg) => `${m.name}が盗んだ${_throwItem.name}を投げてきた！${dmg}ダメージ！消滅した。`,
              potPlHitMsg: (dmg) => `${m.name}が盗んだ${_throwItem.name}を投げてきた！${dmg}ダメージ！壺が割れた！`,
              potionPlHitMsg: () => `${m.name}が盗んだ${_throwItem.name}を投げてきた！`,
              wandPlHitMsg: () => `${m.name}が盗んだ${_throwItem.name}を投げてきた！`,
            });
            /* プレイヤー命中時の追加コールバック（既存仕様：potion/pot以外の命中で発動） */
            if (_srRes.hitPlayer && _throwItem.type !== "potion" && _throwItem.type !== "pot") {
              if (_onHit) _onHit(m);
            }
            return;
          }
          /* 経路に障害物：隣接なら通常攻撃、非隣接なら接近 */
        }
        /* 非直線または障害物：隣接なら通常攻撃して終了、非隣接は移動コードへ */
        if (_srAdj) {
          if (m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn }); }
          return;
        }
        /* 非隣接 → フォールスルーして移動 */
      }
      /* 盗みフェーズ：隣接かつ手ぶら（moveOnlyはフォールスルー） */
      if (!_moveOnly && _srAdj && m.heldItems.length === 0) {
        const _srAntiSteal = hasAbility(pl.armor, "anti_steal");
        if (_srAntiSteal) {
          ml.push(`護盗の鎧が${m.name}の盗みを防いだ！`);
          if (m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn }); }
          return;
        }
        const _srStealable = pl.inventory.filter(i => i.type !== "gold" && i.type !== "goal");
        if (_srStealable.length > 0 && Math.random() < 0.25) {
          const _stolen = pick(_srStealable);
          pl.inventory.splice(pl.inventory.indexOf(_stolen), 1);
          const _srFinal = (_stolen.name === "ロングソード" && Math.random() < 0.10) ? { ...SOBURO_T, id: uid(), plus: _stolen.plus || 0 } : _stolen;
          m.heldItems.push(_srFinal);
          const _srSoboroMsg = _srFinal !== _stolen ? "ソボロ助広に変化した！" : "";
          ml.push(`${m.name}が${_stolen.name}を盗んだ！次のターンに投げてくるぞ！${_srSoboroMsg}`);
          return;
        }
        /* 25%外れまたは盗むものなし：通常攻撃 */
        if (m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn }); }
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
          /* 隣接：回復（アンデッドには逆にダメージ） */
          const _heal = rng(5, 12);
          if (_healTarget.kind === "undead") {
            _healTarget.hp -= _heal;
            ml.push(`${m.name}が${_healTarget.name}に回復魔法をかけたが逆効果だ！${_heal}ダメージ！`);
            if (_healTarget.hp <= 0) killMonster(_healTarget, dg, pl, ml, _luFn);
          } else {
            _healTarget.hp = Math.min(_healTarget.maxHp, _healTarget.hp + _heal);
            ml.push(`${m.name}が${_healTarget.name}を回復した！(+${_heal}HP)`);
          }
          return;
        } else {
          /* 傷ついた味方へ接近 */
          const _hn = bfsNext(map, [], m.x, m.y, _healTarget.x, _healTarget.y, m, 15, dg.pentacles, _effFloat, null, false, dg.rooms, dg);
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
      if (_plOnSanc) return;
      if (m.turnAttacks < (m.maxAttacks ?? 1)) {
        m.turnAttacks++;
        monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
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
        if (isWalkable(dg.map, _pnx, _pny, dg) && !dg.monsters.some(o => o.x === _pnx && o.y === _pny)) {
          pl.x = _pnx; pl.y = _pny;
          ml.push(`${m.name}に引き寄せられた！`);
          if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("引っ張られて目が覚めた！"); }
          if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("引っ張られて金縛りが解けた！"); }
        }
      }
      /* 引き寄せ後も通常攻撃・移動にフォールスルー */
    }

    /* ── berserker（バーサーカー等）：敵味方区別なく攻撃、店主除く ── */
    if ((m.subtype === "berserker" || (m.berserkerTurns || 0) > 0) && !m.sealed) {
      m.aware = true;
      /* 隣接ターゲット（店主除く）を探す */
      const _bcAdj = dg.monsters.filter(o =>
        o !== m && o.type !== "shopkeeper" &&
        Math.abs(o.x - m.x) <= 1 && Math.abs(o.y - m.y) <= 1
      );
      const _bcAdjPl = Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1 && !_plOnSanc;
      /* 攻撃フェーズ：隣接ターゲットを攻撃 */
      if (!_moveOnly && (_bcAdj.length > 0 || _bcAdjPl) && m.turnAttacks < (m.maxAttacks ?? 1)) {
        m.turnAttacks++;
        if (_bcAdjPl && (_bcAdj.length === 0 || Math.random() < 0.5)) {
          monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
        } else {
          const _bTarget = pick(_bcAdj);
          const _bDmg = Math.max(1, m.atk - (_bTarget.def || 0) + rng(-2, 2));
          ml.push(`${m.name}が${_bTarget.name}に攻撃！${_bDmg}ダメージ！`);
          _bTarget.hp -= _bDmg;
          if (_bTarget.hp <= 0) killMonster(_bTarget, dg, pl, ml, _luFn, false, m);
        }
        return;
      }
      /* 移動フェーズ：最も近いターゲット（店主除く）に向かう */
      if (!_attackOnly) {
        let _bTx = pl.x, _bTy = pl.y;
        let _bNearDist = Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y));
        for (const _bm of dg.monsters) {
          if (_bm === m || _bm.type === "shopkeeper") continue;
          const _bd = Math.max(Math.abs(_bm.x - m.x), Math.abs(_bm.y - m.y));
          if (_bd < _bNearDist) { _bNearDist = _bd; _bTx = _bm.x; _bTy = _bm.y; }
        }
        const _bNext = bfsNext(map, [], m.x, m.y, _bTx, _bTy, m, 40, dg.pentacles, _effFloat, null, false, dg.rooms, dg);
        if (_bNext &&
            !dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _bNext.x && pc.y === _bNext.y) &&
            !dg.monsters.some(o => o !== m && o.x === _bNext.x && o.y === _bNext.y) &&
            !(_bNext.x === pl.x && _bNext.y === pl.y)) {
          m.dir = { x: _bNext.x - m.x, y: _bNext.y - m.y };
          m.x = _bNext.x; m.y = _bNext.y;
          m._movedThisTurn = true;
        }
      }
      return;
    }

    /* ── defhalf（キラープラスター等）：同部屋で20%防御半減魔法 ── */
    if (m.subtype === "defhalf" && !m.sealed) {
      /* 攻撃フェーズ */
      if (!_moveOnly && m.turnAttacks < (m.maxAttacks ?? 1)) {
        if (canSee && m._defHalfMagicReady) {
          delete m._defHalfMagicReady;
          /* 魔封じチェック */
          const _kpRoom = findRoom(rooms, m.x, m.y);
          const _kpSeal = dg.pentacles?.some(pc => pc.kind === "magic_seal" && pc.blessed) ||
            (_kpRoom && dg.pentacles?.some(pc =>
              pc.kind === "magic_seal" &&
              pc.x >= _kpRoom.x && pc.x < _kpRoom.x + _kpRoom.w &&
              pc.y >= _kpRoom.y && pc.y < _kpRoom.y + _kpRoom.h
            ));
          if (!_kpSeal) {
            m.turnAttacks++;
            if (hasAbility(pl.armor, "wand_reflect")) {
              /* 反射の鎧：魔法を跳ね返す */
              ml.push(`${m.name}の防御半減魔法！反射の鎧が弾き返した！`);
              if (m.magicImmune) {
                ml.push(`魔法は${m.name}に効かない！`);
              } else {
                m.def = Math.floor((m.def || 0) / 2);
                ml.push(`跳ね返った魔法が${m.name}に命中！${m.name}の防御力が半減した！`);
              }
            } else if (_plOnBlessedSanc) {
              ml.push("祝福された聖域の加護が防御半減魔法を防いだ！");
            } else {
              pl.defSoftenedTurns = (pl.defSoftenedTurns || 0) + 50;
              ml.push(`${m.name}の魔法！防御力が50ターン半減した！`);
            }
            return;
          }
          /* 魔封じで無効 → 隣接なら通常攻撃へフォールスルー */
          ml.push(`${m.name}の魔法が魔封じの魔方陣に封じられた！`);
        }
        /* 魔法不発 or 魔封じ → 隣接かつ聖域外なら通常攻撃 */
        if (Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1 && !_plOnSanc) {
          m.turnAttacks++;
          monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
          return;
        }
      }
      /* 移動フェーズ */
      if (!_attackOnly) {
        const _kpTx = canSee ? pl.x : m.lastPx;
        const _kpTy = canSee ? pl.y : m.lastPy;
        const _kpNext = bfsNext(map, [], m.x, m.y, _kpTx, _kpTy, m, 40, dg.pentacles, _effFloat, null, false, dg.rooms, dg);
        if (_kpNext &&
            !dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _kpNext.x && pc.y === _kpNext.y) &&
            !dg.monsters.some(o => o !== m && o.x === _kpNext.x && o.y === _kpNext.y) &&
            !(_kpNext.x === pl.x && _kpNext.y === pl.y)) {
          m.dir = { x: _kpNext.x - m.x, y: _kpNext.y - m.y };
          m.x = _kpNext.x; m.y = _kpNext.y;
        }
      }
      return;
    }

    /* ── pentaclePainter（ラクガキ魔等）：同部屋で自分の足元に魔方陣を描く ── */
    if (m.subtype === "pentaclePainter" && !m.sealed) {
      if (!_moveOnly && m.turnAttacks < (m.maxAttacks ?? 1)) {
        if (canSee && m._pentacleDrawReady) {
          delete m._pentacleDrawReady;
          /* 魔封じチェック */
          const _ppRoom = findRoom(rooms, m.x, m.y);
          const _ppSeal = dg.pentacles?.some(pc => pc.kind === "magic_seal" && pc.blessed) ||
            (_ppRoom && dg.pentacles?.some(pc =>
              pc.kind === "magic_seal" &&
              pc.x >= _ppRoom.x && pc.x < _ppRoom.x + _ppRoom.w &&
              pc.y >= _ppRoom.y && pc.y < _ppRoom.y + _ppRoom.h
            ));
          /* 描画試行は1回分の行動（成功も失敗も turnAttacks 消費・隣接攻撃にはしない） */
          m.turnAttacks++;
          if (_ppSeal) {
            ml.push(`${m.name}の魔方陣が魔封じの魔方陣に封じられた！`);
            return;
          }
          if (isPentacleDrawBlocked(dg, m.x, m.y)) {
            /* 階段・アイテム・罠など → 普通に書こうとして失敗（無駄行動） */
            ml.push(`${m.name}が魔方陣を描こうとしたが足元に別のものがあって失敗した！`);
            return;
          }
          const _ppLv = m.monLevel || 1;
          const _ppKinds1 = [["heal_aura","回復の魔方陣"],["stone_throw","石飛ばしの魔方陣"],["equal_speed","等速の魔方陣"],["light","明かりの魔方陣"]];
          const _ppKinds2 = [["trap_gen","罠の魔方陣"],["gravity","重力の魔方陣"],["farcast","遠投の魔方陣"],["dodge","みかわしの魔方陣"]];
          const _ppKinds3 = [["sanctuary","聖域の魔方陣"],["light","明かりの魔方陣"],["heal_aura","回復の魔方陣"],["teleport_trap","テレポートの魔方陣"]];
          const _ppPool = _ppLv >= 3 ? _ppKinds3 : _ppLv >= 2 ? _ppKinds2 : _ppKinds1;
          const [_ppKind, _ppName] = pick(_ppPool);
          const _ppCursed = _ppLv >= 3;
          dg.pentacles = dg.pentacles || [];
          dg.pentacles.push({ x: m.x, y: m.y, kind: _ppKind, name: _ppName, blessed: false, cursed: _ppCursed });
          ml.push(`${m.name}が足元に${_ppName}を描いた！`);
          return;
        }
        /* 描画予約なし → 隣接なら通常攻撃 */
        if (Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1 && !_plOnSanc) {
          m.turnAttacks++;
          monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
          return;
        }
      }
      /* 移動フェーズ */
      if (!_attackOnly) {
        const _ppTx = canSee ? pl.x : m.lastPx;
        const _ppTy = canSee ? pl.y : m.lastPy;
        const _ppNext = bfsNext(map, [], m.x, m.y, _ppTx, _ppTy, m, 40, dg.pentacles, _effFloat, null, false, dg.rooms, dg);
        if (_ppNext &&
            !dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _ppNext.x && pc.y === _ppNext.y) &&
            !dg.monsters.some(o => o !== m && o.x === _ppNext.x && o.y === _ppNext.y) &&
            !(_ppNext.x === pl.x && _ppNext.y === pl.y)) {
          m.dir = { x: _ppNext.x - m.x, y: _ppNext.y - m.y };
          m.x = _ppNext.x; m.y = _ppNext.y;
        }
      }
      return;
    }

    /* ── guardian（ガーディアン等）：仲間の隣に留まりかばう ── */
    if (m.subtype === "guardian") {
      /* 攻撃フェーズ：プレイヤーが隣接かつ聖域外なら攻撃 */
      if (!_moveOnly && Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1 && !_plOnSanc && m.turnAttacks < (m.maxAttacks ?? 1)) {
        m.turnAttacks++;
        monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
        return;
      }
      /* 移動フェーズ：仲間が隣接していれば動かない。いなければ最寄り仲間へ向かう */
      if (!_attackOnly) {
        const _gaAdjAlly = dg.monsters.some(o => o !== m && Math.abs(o.x - m.x) <= 1 && Math.abs(o.y - m.y) <= 1);
        if (!_gaAdjAlly) {
          let _gaTx = pl.x, _gaTy = pl.y, _gaNear = Infinity;
          for (const _gm of dg.monsters) {
            if (_gm === m) continue;
            const _gd = Math.max(Math.abs(_gm.x - m.x), Math.abs(_gm.y - m.y));
            if (_gd < _gaNear) { _gaNear = _gd; _gaTx = _gm.x; _gaTy = _gm.y; }
          }
          const _gaNext = bfsNext(map, [], m.x, m.y, _gaTx, _gaTy, m, 40, dg.pentacles, _effFloat, null, false, dg.rooms, dg);
          if (_gaNext &&
              !dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _gaNext.x && pc.y === _gaNext.y) &&
              !dg.monsters.some(o => o !== m && o.x === _gaNext.x && o.y === _gaNext.y) &&
              !(_gaNext.x === pl.x && _gaNext.y === pl.y)) {
            m.dir = { x: _gaNext.x - m.x, y: _gaNext.y - m.y };
            m.x = _gaNext.x; m.y = _gaNext.y;
          }
        }
      }
      return;
    }

    const tx = canSee ? pl.x : m.lastPx;
    const ty = canSee ? pl.y : m.lastPy;

    /* ── 遠距離タイプが部屋内で射線が合っていない場合：軸合わせ優先 ── */
    if (!_attackOnly && canSee && _sameRoom &&
        (m.subtype === "archer" || m.subtype === "wanduser" || m.subtype === "watergunner") && !m.sealed) {
      const _ralDx = pl.x - m.x, _ralDy = pl.y - m.y;
      const _inLineNow = _ralDx === 0 || _ralDy === 0 || Math.abs(_ralDx) === Math.abs(_ralDy);
      if (!_inLineNow) {
        const _alignCands = [];
        for (const [_amx, _amy] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
          const _anx = m.x + _amx, _any = m.y + _amy;
          if (m.waterOnly) {
            if (!inBounds(_anx, _any)) continue;
            if (map[_any][_anx] !== T.WATER && !dg.springs?.some(s => s.x === _anx && s.y === _any)) continue;
          } else {
            if (!isWalkable(map, _anx, _any, dg)) continue;
          }
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

    /* ── シオン・ザ・ダークブレット：プレイヤーから距離2を保つ ── */
    if (!_attackOnly && canSee && m.baseKind === "boss_darkbullet") {
      const _dbDx = pl.x - m.x, _dbDy = pl.y - m.y;
      const _dbDist = Math.max(Math.abs(_dbDx), Math.abs(_dbDy));

      if (_dbDist <= 1) {
        /* 隣接：最も遠ざかれる隣接マスへ移動 */
        const _farCands = [];
        for (const [_fdx, _fdy] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
          const _fnx = m.x + _fdx, _fny = m.y + _fdy;
          if (!isWalkable(map, _fnx, _fny, dg)) continue;
          if (dg.monsters.some(o => o !== m && o.x === _fnx && o.y === _fny)) continue;
          if (_fnx === pl.x && _fny === pl.y) continue;
          _farCands.push({ x: _fnx, y: _fny, dist: Math.max(Math.abs(pl.x - _fnx), Math.abs(pl.y - _fny)) });
        }
        _farCands.sort((a, b) => b.dist - a.dist);
        const _canEscape = _farCands.length > 0 && _farCands[0].dist > _dbDist;
        if (_canEscape) {
          const _fc = _farCands[0];
          m.dir = { x: _fc.x - m.x, y: _fc.y - m.y };
          m.x = _fc.x; m.y = _fc.y;
          return;
        }
        /* 逃げ場なし：近接攻撃 */
        if (!_moveOnly && !_plOnSanc &&
            m.turnAttacks < (m.maxAttacks ?? 1)) {
          m.turnAttacks++;
          monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
        }
        return;
      }

      if (_dbDist === 2) {
        /* 距離2：直線上でなければ直線上かつ距離2になれるマスへ移動 */
        const _inLineNow = _dbDx === 0 || _dbDy === 0 || Math.abs(_dbDx) === Math.abs(_dbDy);
        if (!_inLineNow) {
          const _alignCands = [];
          for (const [_amx, _amy] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
            const _anx = m.x + _amx, _any = m.y + _amy;
            if (!isWalkable(map, _anx, _any, dg)) continue;
            if (dg.monsters.some(o => o !== m && o.x === _anx && o.y === _any)) continue;
            if (_anx === pl.x && _any === pl.y) continue;
            const _d2x = pl.x - _anx, _d2y = pl.y - _any;
            const _newDist = Math.max(Math.abs(_d2x), Math.abs(_d2y));
            if (_newDist === 2 && (_d2x === 0 || _d2y === 0 || Math.abs(_d2x) === Math.abs(_d2y))) {
              _alignCands.push({ x: _anx, y: _any });
            }
          }
          if (_alignCands.length > 0) {
            const _ab = _alignCands[Math.floor(Math.random() * _alignCands.length)];
            m.dir = { x: _ab.x - m.x, y: _ab.y - m.y };
            m.x = _ab.x; m.y = _ab.y;
          }
        }
        return;
      }

      /* 距離3以上：プレイヤーに近づくがチェビシェフ距離2未満には踏み込まない */
      const _dbNext = bfsNext(map, [], m.x, m.y, pl.x, pl.y, m, 40, dg.pentacles, _effFloat, null, false, dg.rooms, dg);
      if (_dbNext) {
        const _newDist = Math.max(Math.abs(pl.x - _dbNext.x), Math.abs(pl.y - _dbNext.y));
        if (_newDist >= 2 && !dg.monsters.some(o => o !== m && o.x === _dbNext.x && o.y === _dbNext.y)) {
          m.dir = { x: _dbNext.x - m.x, y: _dbNext.y - m.y };
          m.x = _dbNext.x; m.y = _dbNext.y;
        }
      }
      return;
    }

    /* adjacent attack：隣接していれば canSee 不問（透明時は _plInvis で除外済み） */
    if (_adjPl && !_plInvis) {
      if (_moveOnly) return; /* moveOnlyフェーズ：隣接済みなので移動しない */
      /* 聖域チェック：プレイヤーが聖域の上なら攻撃不可 */
      if (_plOnSanc) return;
      if (m.turnAttacks < (m.maxAttacks ?? 1)) {
        m.turnAttacks++;
        monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
        return;
      }
      /* 2回目以降：攻撃せずBFSで移動を試みる */
    }

    if (_attackOnly) return; /* attackOnlyフェーズ：移動しない */

    /* move toward target */
    /* BFSで最短経路を求める。部屋内での壁ぶつかりを防ぎ、通路への最適経路を辿る。 */
    /* わてり：水タイル・泉のみ移動可能 */
    const _wateriFilter = m.waterOnly ? (nx, ny) => {
      if (!inBounds(nx, ny)) return false;
      return map[ny][nx] === T.WATER || (dg.springs?.some(s => s.x === nx && s.y === ny) ?? false);
    } : null;
    /* fallbackNearest: 完全到達不可でもプレイヤー方向へ寄る */
    let next = bfsNext(map, [], m.x, m.y, tx, ty, m, 60, dg.pentacles, _effFloat, _wateriFilter, true, dg.rooms, dg);
    /* 認識中なのに距離が縮まない／経路なし → 転送陣経由で接近 */
    if (canSee && !_plInvis) {
      const _curD = Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y));
      const _nextD = next ? Math.max(Math.abs(pl.x - next.x), Math.abs(pl.y - next.y)) : Infinity;
      if (!next || _nextD >= _curD) {
        const _pads = (dg.pentacles || []).filter(pc =>
          pc.kind === "fixed_portal" || (pc.kind === "portal" && !pc.cursed && !pc.fixed));
        let _bestToPad = null, _bestPairD = _curD;
        for (const _pad of _pads) {
          if (m.x === _pad.x && m.y === _pad.y) continue; /* 陣上は Phase2.5 に任せる */
          let _dest = null;
          if (_pad.kind === "fixed_portal") {
            _dest = (dg.pentacles || []).find(pc =>
              pc.kind === "fixed_portal" && pc.pairId === _pad.pairId && pc !== _pad);
          } else {
            _dest = (dg.pentacles || []).find(pc =>
              pc !== _pad && pc.kind === "portal" && !pc.cursed && !pc.fixed);
          }
          if (!_dest) continue;
          const _pairD = Math.max(Math.abs(pl.x - _dest.x), Math.abs(pl.y - _dest.y));
          if (_pairD >= _bestPairD) continue;
          const _toPad = bfsNext(map, [], m.x, m.y, _pad.x, _pad.y, m, 60, dg.pentacles, _effFloat, _wateriFilter, false, dg.rooms, dg);
          if (!_toPad) continue;
          _bestPairD = _pairD;
          _bestToPad = _toPad;
        }
        if (_bestToPad) next = _bestToPad;
      }
    }
    if (next && !inMagicSealRoom(m.x, m.y, dg) && dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === next.x && pc.y === next.y)) return;
    if (next) {
      if (next.x === pl.x && next.y === pl.y) {
        /* 聖域チェック：プレイヤーが聖域の上なら攻撃不可 */
        if (_plOnSanc) return;
        m.dir = { x: next.x - m.x, y: next.y - m.y };
        if (!_moveOnly && m.turnAttacks < (m.maxAttacks ?? 1)) {
          m.turnAttacks++;
          monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
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
        return;
      }
      /* 次マスが別モンスターに占有 */
      /* 対向（互いに相手のマスへ向かっている）なら位置を交換してデッドロック解消 */
      const _blocker = dg.monsters.find(o => o !== m && o.x === next.x && o.y === next.y);
      if (_blocker && !isStationaryGrabber(_blocker) && _blocker.type !== "shopkeeper") {
        const _bNext = bfsNext(map, [], _blocker.x, _blocker.y,
          (_blocker.aware ? (_blocker.lastPx ?? pl.x) : (m.x)),
          (_blocker.aware ? (_blocker.lastPy ?? pl.y) : (m.y)),
          _blocker, 4, dg.pentacles, _blocker.float, null, false, dg.rooms, dg);
        if (_bNext && _bNext.x === m.x && _bNext.y === m.y &&
            /* waterOnly：スワップ先が水/泉でない場合はスワップ不可 */
            (!m.waterOnly || map[next.y]?.[next.x] === T.WATER || dg.springs?.some(s => s.x === next.x && s.y === next.y))) {
          /* 正面衝突：スワップ（店主・からめ鬼はスワップ不可） */
          _blocker.x = m.x; _blocker.y = m.y;
          m.dir = { x: next.x - m.x, y: next.y - m.y };
          m.x = next.x; m.y = next.y;
          if (m.baseKind === "firedemon") _fireDemonBurnItems(m, dg, ml);
          if (m.baseKind === "gelcube") _gelCubeAbsorbItems(m, dg, ml);
          return;
        }
      }
      /* 塞がれた場合：チェビシェフ距離でソートして隣接を維持できる方向を選ぶ */
      const _curDist = Math.max(Math.abs(tx - m.x), Math.abs(ty - m.y));
      const _altMoves = [];
      for (const [_adx, _ady] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        const _anx = m.x + _adx, _any = m.y + _ady;
        if (_anx === next.x && _any === next.y) continue;
        if (m.waterOnly) {
          if (!inBounds(_anx, _any)) continue;
          if (map[_any][_anx] !== T.WATER && !dg.springs?.some(s => s.x === _anx && s.y === _any)) continue;
        } else {
          if (!canEnter(map, _anx, _any, _effFloat, dg)) continue;
        }
        if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _anx && pc.y === _any)) continue;
        if (dg.monsters.some(o => o !== m && o.x === _anx && o.y === _any)) continue;
        if (_adx !== 0 && _ady !== 0) {
          if (!canEnter(map, m.x + _adx, m.y, _effFloat, dg) && !canEnter(map, m.x, m.y + _ady, _effFloat, dg)) continue;
        }
        const _nd = Math.max(Math.abs(tx - _anx), Math.abs(ty - _any));
        if (_nd <= _curDist) _altMoves.push({ x: _anx, y: _any, dist: _nd });
      }
      if (_altMoves.length > 0) {
        _altMoves.sort((a, b) => a.dist - b.dist);
        const _ab = _altMoves[0];
        if (_ab.x === pl.x && _ab.y === pl.y) {
          if (!_moveOnly && !_plOnSanc &&
              m.turnAttacks < (m.maxAttacks ?? 1)) {
            m.turnAttacks++; m.dir = { x: _ab.x - m.x, y: _ab.y - m.y };
            monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
          }
          return;
        }
        m.dir = { x: _ab.x - m.x, y: _ab.y - m.y };
        m.x = _ab.x; m.y = _ab.y;
        if (m.baseKind === "firedemon") _fireDemonBurnItems(m, dg, ml);
        if (m.baseKind === "gelcube") _gelCubeAbsorbItems(m, dg, ml);
        return;
      }
      return; /* 前の敵が動けない場合は自然なキューイングで待機 */
    }
    /* BFS 経路なし（壁で完全遮断）：_forceAlt 時のみランダム脱出を試みる */
    if (_forceAlt) {
      const _fd4 = shuffle([[0,-1],[0,1],[-1,0],[1,0]]);
      for (const [_fdx, _fdy] of _fd4) {
        const _fnx = m.x + _fdx, _fny = m.y + _fdy;
        if (m.waterOnly) {
          if (!inBounds(_fnx, _fny)) continue;
          if (map[_fny][_fnx] !== T.WATER && !dg.springs?.some(s => s.x === _fnx && s.y === _fny)) continue;
        } else if (!canEnter(map, _fnx, _fny, _effFloat, dg)) continue;
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
    /* waterOnlyモンスターは水上のみ移動可能なため、未覚醒時はその場で待機 */
    if (m.waterOnly) return;
    /* grabberは覚醒前も動かない */
    if (isStationaryGrabber(m)) return;
    const room = findRoom(rooms, m.x, m.y);
    const _arrived = m.patrolTarget &&
      m.x === m.patrolTarget.x && m.y === m.patrolTarget.y;

    /* ターゲット到着・未設定・稀なリセット → 次の目標を選ぶ */
    if (_arrived || !m.patrolTarget || Math.random() < 0.02) {
      /* 直前に訪れたターゲットを記録（往復防止に使う） */
      if (_arrived) m.lastPatrolTarget = { x: m.patrolTarget.x, y: m.patrolTarget.y };
      m.patrolTarget = null;

      if (room) {
        /* ── 別の部屋をランダムに目標にする（フロア全体を徘徊） ── */
        const otherRooms = rooms.filter(r => r !== room);
        if (otherRooms.length > 0) {
          /* 直前に訪れた部屋を優先除外（往復防止） */
          const _prev = m.lastPatrolTarget;
          const destCands = _prev
            ? otherRooms.filter(r => !(r.x <= _prev.x && _prev.x < r.x + r.w && r.y <= _prev.y && _prev.y < r.y + r.h))
            : otherRooms;
          const destRoom = pick(destCands.length > 0 ? destCands : otherRooms);
          /* 目標部屋内のランダムなフロアタイルを選ぶ */
          for (let _a = 0; _a < 30; _a++) {
            const _tx = rng(destRoom.x, destRoom.x + destRoom.w - 1);
            const _ty = rng(destRoom.y, destRoom.y + destRoom.h - 1);
            if (isWalkable(map, _tx, _ty, dg)) { m.patrolTarget = { x: _tx, y: _ty }; break; }
          }
        }
        if (!m.patrolTarget) {
          /* フォールバック：部屋の出口タイルを目標に */
          const exits = [];
          for (let ex = room.x; ex < room.x + room.w; ex++) {
            if (isWalkable(map, ex, room.y - 1, dg))     exits.push({ x: ex, y: room.y - 1 });
            if (isWalkable(map, ex, room.y + room.h, dg)) exits.push({ x: ex, y: room.y + room.h });
          }
          for (let ey = room.y; ey < room.y + room.h; ey++) {
            if (isWalkable(map, room.x - 1, ey, dg))     exits.push({ x: room.x - 1, y: ey });
            if (isWalkable(map, room.x + room.w, ey, dg)) exits.push({ x: room.x + room.w, y: ey });
          }
          if (exits.length > 0) {
            const _prev = m.lastPatrolTarget;
            const cands = _prev ? exits.filter(e => e.x !== _prev.x || e.y !== _prev.y) : exits;
            m.patrolTarget = pick(cands.length > 0 ? cands : exits);
          }
        }
      } else {
        /* 廊下・壁破壊後エリア：来た方向の逆を避けて進行方向を決定 */
        const dirs4 = [[0,1],[0,-1],[1,0],[-1,0]];
        const open = dirs4.filter(([dx,dy]) => isWalkable(map, m.x + dx, m.y + dy, dg));
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
            if (!isWalkable(map, _nx, _ny, dg)) break;
            _ptx = _nx; _pty = _ny;
          }
          m.patrolTarget = { x: _ptx, y: _pty };
        }
      }
    }

    /* BFSで1歩進む（壁のみ障害物、モンスターは無視して経路探索） */
    /* ── 壁掘り：未覚醒時に30%でランダムな隣接壁を掘る（掘ったターンは移動しない） ── */
    if (m.wallDigger && Math.random() < 0.3) {
      const _rdDirs = shuffle([[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]]);
      for (const [_rddx, _rddy] of _rdDirs) {
        const _rdnx = m.x + _rddx, _rdny = m.y + _rddy;
        if (_rdnx <= 0 || _rdnx >= MW - 1 || _rdny <= 0 || _rdny >= MH - 1) continue;
        if (dg.map[_rdny][_rdnx] === T.WALL) {
          dg.map[_rdny][_rdnx] = T.FLOOR;
          ml.push(`${m.name}が壁を掘った。`);
          return;
        }
      }
    }
    if (m.patrolTarget) {
      const next = bfsNext(map, [], m.x, m.y,
        m.patrolTarget.x, m.patrolTarget.y, m, 100, dg.pentacles, _effFloat, null, false, dg.rooms, dg);
      if (next && !(next.x === pl.x && next.y === pl.y) &&
          !((!inMagicSealRoom(m.x, m.y, dg)) && dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === next.x && pc.y === next.y))) {
        if (!dg.monsters.some(o => o !== m && o.x === next.x && o.y === next.y)) {
          m.dir = { x: next.x - m.x, y: next.y - m.y };
          m.x = next.x; m.y = next.y;
          return;
        }
        /* 次マスが別モンスターに占有 → ランダムな隣接空きタイルへ横ずれ */
        m.patrolTarget = null;
        const _tryDirs4 = shuffle([[0,1],[0,-1],[1,0],[-1,0]]);
        let _sidestepped = false;
        for (const [_adx, _ady] of _tryDirs4) {
          const _anx = m.x + _adx, _any = m.y + _ady;
          if (!isWalkable(map, _anx, _any, dg)) continue;
          if (_anx === pl.x && _any === pl.y) continue;
          if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _anx && pc.y === _any)) continue;
          if (dg.monsters.some(o => o !== m && o.x === _anx && o.y === _any)) continue;
          m.dir = { x: _adx, y: _ady };
          m.x = _anx; m.y = _any;
          _sidestepped = true;
          break;
        }
        if (!_sidestepped && m.dir) m.dir = { x: -m.dir.x, y: -m.dir.y };
        if (_sidestepped) return;
        if (!_forceAlt) return;
      }
      /* BFS経路なし（壁で遮断）→ 次ターンで目標を再選択 */
      if (!_forceAlt) { m.patrolTarget = null; return; }
      m.patrolTarget = null;
    }
    /* ===== パトロール詰まり脱出（_forceAlt 時のみ）===== */
    if (_forceAlt) {
      const _fd4 = shuffle([[0,-1],[0,1],[-1,0],[1,0]]);
      for (const [_fdx, _fdy] of _fd4) {
        const _fnx = m.x + _fdx, _fny = m.y + _fdy;
        if (!isWalkable(map, _fnx, _fny, dg)) continue;
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
