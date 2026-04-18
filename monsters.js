import { rng, pick, uid, MW, MH, T, DRO, removeMonster, removeFloorItem, itemAt, clamp, findVulnPentacle, hasAbility, hasGravityPentacle, hasCursedGravityPentacle, getDodgePentacleMode, shuffle } from "./utils.js";
import { getFarcastMode, placeItemAt, makeStone, makeMagicStone, makeArrow, makeStrongArrow, makePiercingArrow, applyLightningToInventory, hasCursedExplosionPentacle, hasCursedTeleportPentacle, killMonster, doExplosion, fireTrapItem, cookFoodMeta, soakItemIntoSpring, TRAPS, rotFood, burnFoodItem, splashPotion, scatterPotContents, applyWandEffect, getBlessMultiplier, hasRingEffect } from "./items.js";
import { pushMonsterBoltAnim, pushSplashAnim } from "./animEvents.js";

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
    ml.push(`${m.name}が「${it.name}」を取り込んだ！`);
  }
  dg.items = dg.items.filter(it => !(it.x === m.x && it.y === m.y));
}

/* ===== 境界・通行判定ヘルパー ===== */
function inBounds(x, y) { return x >= 0 && x < MW && y >= 0 && y < MH; }
function isWalkable(map, x, y) { return inBounds(x, y) && map[y][x] !== T.WALL && map[y][x] !== T.BWALL; }
/* 水タイルを考慮：浮遊(float)なら水上通行可 */
function canEnter(map, x, y, float = false) { return isWalkable(map, x, y) && (float || map[y]?.[x] !== T.WATER); }

/* ===== プレイヤー防御力計算ヘルパー ===== */
function calcPlayerDef(pl) {
  const _misoDef = (pl.misoDefTurns || 0) > 0 ? 8 : 0;
  return Math.floor((pl.def + (pl.armor?.def || 0) + (pl.armor?.plus || 0) + (pl.rings || []).reduce((s, r) => r.effect === "defense_ring" ? s + (r.plus || 0) : s, 0) + (hasAbility(pl.weapon, "def_bonus") ? 5 : 0) + _misoDef) * ((pl.defSoftenedTurns || 0) > 0 ? 0.5 : 1) * ((pl.defDebuffTurns || 0) > 0 ? 0.5 : 1));
}

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
  const pdef = calcPlayerDef(pl);
  let dmg = Math.max(1, Math.floor(m.atk * m.atk / (m.atk + pdef)) + rng(-2, 2));
  /* 脆弱の魔方陣 */
  const _vulnPc = findVulnPentacle(dg, pl.x, pl.y);
  if (_vulnPc) dmg = _vulnPc.cursed ? Math.max(1, Math.floor(dmg / 2)) : dmg * (_vulnPc.blessed ? 4 : 2);
  /* 耐火装備 / 万能耐性 / カレー炎耐性 */
  const _hasFireR = hasAbility(pl.armor, "fire_resist") || hasAbility(pl.armor, "all_resist");
  if (_hasFireR) dmg = Math.max(1, Math.floor(dmg / 2));
  if ((pl.curryFireResTurns || 0) > 0) dmg = Math.max(1, Math.floor(dmg / 2));
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

/* ===== 氷竜ブレス ===== */
function monsterIceBreath(m, dg, pl, ml, onPlayerHit) {
  const _iLvl = m.monLevel || 1;
  const _idx = Math.sign(pl.x - m.x), _idy = Math.sign(pl.y - m.y);
  for (let _ii = 1; ; _ii++) {
    const _ix = m.x + _idx * _ii, _iy = m.y + _idy * _ii;
    if (_ix === pl.x && _iy === pl.y) break;
    if (_ix < 0 || _ix >= MW || _iy < 0 || _iy >= MH) return;
    if (_iLvl < 3 && (dg.map[_iy]?.[_ix] === T.WALL || dg.map[_iy]?.[_ix] === T.BWALL)) return;
    const _iBlock = dg.monsters.find(o => o.x === _ix && o.y === _iy);
    if (_iBlock) {
      const _iDmg = Math.max(1, Math.floor(m.atk * m.atk / (m.atk + (_iBlock.def || 0))) + rng(-2, 2));
      _iBlock.hp -= _iDmg;
      const _iSlow = rng(3, 5);
      _iBlock.slowTurns = (_iBlock.slowTurns || 0) + _iSlow;
      ml.push(`${m.name}の氷ブレスが${_iBlock.name}に命中！${_iDmg}ダメージ！鈍足${_iSlow}ターン！`);
      if (_iBlock.hp <= 0) killMonster(_iBlock, dg, pl, ml, null);
      return;
    }
  }
  const pdef = calcPlayerDef(pl);
  let _iDmg = Math.max(1, Math.floor(m.atk * m.atk / (m.atk + pdef)) + rng(-2, 2));
  const _iVulnPc = findVulnPentacle(dg, pl.x, pl.y);
  if (_iVulnPc) _iDmg = _iVulnPc.cursed ? Math.max(1, Math.floor(_iDmg / 2)) : _iDmg * (_iVulnPc.blessed ? 4 : 2);
  const _hasIceR = hasAbility(pl.armor, "ice_resist") || hasAbility(pl.armor, "all_resist");
  if (_hasIceR) _iDmg = Math.max(1, Math.floor(_iDmg / 2));
  pl.deathCause = `${m.name}の氷ブレスで`;
  pl.hp -= _iDmg;
  onPlayerHit?.(_iDmg, m);
  if (_hasIceR) {
    ml.push(`${m.name}が氷ブレスを吐いた！${_iDmg}ダメージ！（耐氷：ダメージ半減・鈍足無効）`);
  } else {
    const _iSlow = rng(3, 6);
    pl.slowTurns = (pl.slowTurns || 0) + _iSlow;
    ml.push(`${m.name}が氷ブレスを吐いた！${_iDmg}ダメージ！鈍足${_iSlow}ターン！`);
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
  const _ptdx = Math.sign(pl.x - m.x), _ptdy = Math.sign(pl.y - m.y);
  ml.push(`${m.name}が謎の薬を投げた！`);
  pushMonsterBoltAnim(m.x, m.y, _ptdx, _ptdy, dg, pl, "#ff88ff");
  /* 経路上の泉・大箱チェック */
  let _cx = m.x + _ptdx, _cy = m.y + _ptdy;
  while (_cx !== pl.x || _cy !== pl.y) {
    const _spr = dg.springs?.find(s => s.x === _cx && s.y === _cy);
    if (_spr) {
      const _potItem = { name: _pot.name, type: "potion", effect: _pot.effect, value: _pot.value || 0, tile: _pot.tile, id: uid() };
      soakItemIntoSpring(_spr, { ..._potItem, x: _cx, y: _cy }, ml, dg, it => it.name);
      return;
    }
    const _bb = dg.bigboxes?.find(b => b.x === _cx && b.y === _cy);
    if (_bb) {
      const _potItem = { name: _pot.name, type: "potion", effect: _pot.effect, value: _pot.value || 0, tile: _pot.tile, id: uid() };
      if (bbFn) bbFn(_bb, _potItem, dg, ml);
      else dg.items.push({ ..._potItem, x: _cx, y: _cy });
      return;
    }
    if (_cx < 0 || _cx >= MW || _cy < 0 || _cy >= MH ||
        dg.map[_cy][_cx] === T.WALL || dg.map[_cy][_cx] === T.BWALL) break;
    _cx += _ptdx; _cy += _ptdy;
  }
  splashPotion(dg, pl.x, pl.y, _pot.effect, _pot.value, pl, ml, null, false, false, null, m);
}

/* ===== モンスター近接攻撃ヘルパー ===== */
function monsterAttackPlayer(m, dg, pl, ml, msgFn, { skipVuln = false, skipThorn = false, onPlayerHit, onPlayerMiss, luFn = null } = {}) {
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
  /* 12% ミス */
  if (Math.random() >= 0.88) {
    ml.push(`${m.name}の攻撃は外れた！`);
    onPlayerMiss?.(m);
    return;
  }
  const pdef = calcPlayerDef(pl);
  let dmg = Math.max(1, Math.floor(m.atk * m.atk / (m.atk + pdef)) + rng(-2, 2));
  if (!skipVuln) {
    const vulnPc = findVulnPentacle(dg, pl.x, pl.y);
    if (vulnPc) dmg = vulnPc.cursed ? Math.max(1, Math.floor(dmg / 2)) : dmg * (vulnPc.blessed ? 4 : 2);
  }
  /* 脆弱：近接ダメージ+3 */
  if (hasAbility(pl.armor, "frail")) dmg += 3;
  /* 祝福防具：近接ダメージ-2 */
  if (pl.armor?.blessed) dmg = Math.max(1, dmg - 2);
  pl.deathCause = `${m.name}の攻撃で`;
  pl.hp -= dmg;
  onPlayerHit?.(dmg, m);
  ml.push(msgFn(dmg));
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
    const _hasFireR = hasAbility(pl.armor, "fire_resist");
    if ((pl.curryFireResTurns || 0) > 0) dmg = Math.max(1, Math.floor(dmg / 2));
    if (!_hasFireR) applyLightningToInventory(pl, dg, ml, null, null, true);
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
        ml.push(`灼熱の炎が頭を焼いた！しかし乳酸菌が混乱を防いだ！`);
      } else {
        pl.confusedTurns = (pl.confusedTurns || 0) + 3;
        ml.push(`灼熱の炎が頭を焼いた！混乱した！(3ターン)`);
      }
    }
    if (m.baseKind === "boss_sage" && Math.random() < 0.30) {
      const _st = rng(5, 8);
      pl.sealedTurns = (pl.sealedTurns || 0) + _st;
      ml.push(`呪縛の賢者の呪文が炸裂した！魔法が封印された！(${_st}ターン)`);
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
    if (m.baseKind === "im_boss_frost" && Math.random() < 0.30) {
      pl.immobileTurns = (pl.immobileTurns || 0) + 3;
      ml.push(`${m.name}の一撃が凍てついた！移動封じ！(3ターン)`);
    }
    if (m.baseKind === "im_boss_poison" && Math.random() < 0.35) {
      if (hasRingEffect(pl, "antidote_ring")) {
        ml.push(`${m.name}の毒刃に！しかし指輪が毒を消した！`);
      } else if ((pl.yogurtImmuneTurns || 0) > 0) {
        ml.push(`${m.name}の毒刃に！しかし乳酸菌が毒を防いだ！`);
      } else {
        pl.poisoned = true;
        ml.push(`${m.name}の毒刃に！毒を受けた！`);
      }
    }
    if (m.baseKind === "im_boss_ironwall" && Math.random() < 0.25) {
      pl.defSoftenedTurns = (pl.defSoftenedTurns || 0) + 5;
      ml.push(`${m.name}の豪打が鎧を砕いた！防御が半減した！(5ターン)`);
    }
    if (m.baseKind === "im_boss_darkfog" && Math.random() < 0.20) {
      pl.defSoftenedTurns = (pl.defSoftenedTurns || 0) + 5;
      ml.push(`${m.name}の闇の刃が鎧を貫いた！防御が半減した！(5ターン)`);
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
 *                         | "thief" | "runner" | "itemblast" | "stealthrower"
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
  { name: "ネズミ",       hp: 7,   atk: 5,  def: 0,  exp: 3,   speed: 1,   tile: 6,  kind: "beast",    baseKind: "rat",          monLevel: 1, minFloor: 1,  maxFloor: 10, dungeonFloors: { beginner: { min: 1, max: 3 }, intermediate: { min: 1, max: 4 } },
    levels: [
      { name: "強ネズミ",           hp: 11,  atk: 6,  def: 3,  exp: 5   },
      { name: "覇ネズミ",           hp: 18,  atk: 8,  def: 6,  exp: 8   },
    ],
  },
  { name: "コウモリ",     hp: 8,   atk: 5,  def: 0,  exp: 4,   speed: 1,   tile: 103, kind: "beast",   baseKind: "bat",           monLevel: 1, minFloor: 1,  maxFloor: 9,  float: true, dungeonFloors: { beginner: { min: 1, max: 4 }, intermediate: { min: 1, max: 7 } },
    levels: [
      { name: "大コウモリ",             hp: 14,  atk: 8,  def: 2,  exp: 7   },
      { name: "覇コウモリ",             hp: 22,  atk: 11, def: 4,  exp: 11  },
    ],
  },
  { name: "ムカデ",       hp: 10,  atk: 4,  def: 2,  exp: 5,   speed: 1,   tile: 12,  kind: "beast",   baseKind: "centipede",     monLevel: 1, minFloor: 1,  maxFloor: 9,  dungeonFloors: { beginner: { min: 2, max: 5 }, intermediate: { min: 1, max: 7 } },
    levels: [
      { name: "大ムカデ",               hp: 17,  atk: 7,  def: 4,  exp: 9   },
      { name: "覇ムカデ",               hp: 27,  atk: 10, def: 6,  exp: 14  },
    ],
  },
  { name: "弾き師",       hp: 30,  atk: 17, def: 3,  exp: 42,  speed: 1,   tile: 39,  kind: "humanoid", baseKind: "itemblaster",  monLevel: 1, minFloor: 6,  maxFloor: 22, subtype: "itemblast", dungeonFloors: { beginner: null, intermediate: { min: 9, max: 15 } },
    levels: [
      { name: "大弾き師",               hp: 48,  atk: 23, def: 5,  exp: 68  },
      { name: "覇弾き師",               hp: 70,  atk: 29, def: 8,  exp: 98  },
    ],
  },
  { name: "盗投士",       hp: 28,  atk: 16, def: 3,  exp: 45,  speed: 1,   tile: 69, kind: "humanoid", baseKind: "stealthrower", monLevel: 1, minFloor: 8,  maxFloor: 24, subtype: "stealthrower", dungeonFloors: { beginner: null, intermediate: { min: 9, max: 15 } },
    levels: [
      { name: "大盗投士",               hp: 46,  atk: 22, def: 5,  exp: 72  },
      { name: "覇盗投士",               hp: 67,  atk: 29, def: 8,  exp: 108 },
    ],
  },
  { name: "コボルド",     hp: 15,  atk: 8,  def: 2,  exp: 10,  speed: 1,   tile: 7,  kind: "humanoid", baseKind: "kobold",        monLevel: 1, minFloor: 2,  maxFloor: 13, dungeonFloors: { beginner: { min: 3, max: 6 }, intermediate: { min: 3, max: 9 } },
    levels: [
      { name: "コボルド戦士",       hp: 26,  atk: 13, def: 7,  exp: 16  },
      { name: "コボルド族長",       hp: 40,  atk: 17, def: 11, exp: 25  },
    ],
  },
  { name: "ゴブリン",     hp: 23,  atk: 16, def: 5,  exp: 20,  speed: 1,   tile: 8,  kind: "humanoid", baseKind: "goblin",        monLevel: 1, minFloor: 3,  maxFloor: 16, dungeonFloors: { beginner: { min: 4, max: 7 }, intermediate: { min: 3, max: 10 } },
    levels: [
      { name: "ゴブリン頭",         hp: 45,  atk: 22, def: 9,  exp: 32  },
      { name: "ゴブリン王",         hp: 68,  atk: 28, def: 15, exp: 50  },
    ],
  },
  { name: "インプ",       hp: 26,  atk: 18, def: 4,  exp: 28,  speed: 2,   tile: 53, kind: "beast",    baseKind: "imp",           monLevel: 1, minFloor: 3,  maxFloor: 17, float: true, dungeonFloors: { beginner: { min: 6, max: 9 }, intermediate: { min: 6, max: 12 } },
    levels: [
      { name: "強インプ",           hp: 42,  atk: 23, def: 7,  exp: 45  },
      { name: "覇インプ",           hp: 65,  atk: 30, def: 11, exp: 70  },
    ],
  },
  { name: "スケルトン",   hp: 24,  atk: 19, def: 5,  exp: 25,  speed: 1,   tile: 9,  kind: "undead",   baseKind: "skeleton",      monLevel: 1, minFloor: 4,  maxFloor: 18, dungeonFloors: { beginner: { min: 5, max: 8 }, intermediate: { min: 3, max: 11 } },
    levels: [
      { name: "強スケルトン",       hp: 39,  atk: 26, def: 9,  exp: 40  },
      { name: "アンデッドナイト",   hp: 61,  atk: 32, def: 13, exp: 62  },
    ],
  },
  { name: "コロポックル", hp: 11,  atk: 0,  def: 0,  exp: 50,  speed: 2,   tile: 70, kind: "beast",    baseKind: "runner",        monLevel: 1, minFloor: 5,  maxFloor: 30, subtype: "runner", dungeonFloors: { beginner: { min: 5, max: 8 }, intermediate: { min: 4, max: 18 } },
    levels: [
      { name: "大コロポックル",     hp: 16,  atk: 0,  def: 0,  exp: 80  },
      { name: "精霊コロポックル",   hp: 24,  atk: 0,  def: 0,  exp: 120 },
    ],
  },
  { name: "ゾンビ",       hp: 55,  atk: 24, def: 5,  exp: 45,  speed: 0.5, tile: 10, kind: "undead",   baseKind: "zombie",        monLevel: 1, minFloor: 6,  maxFloor: 19, elemWeak: "fire", dungeonFloors: { beginner: { min: 8, max: 10 }, intermediate: { min: 9, max: 15 } },
    levels: [
      { name: "強ゾンビ",           hp: 85,  atk: 34, def: 12, exp: 72  },
      { name: "屍鬼",               hp: 130, atk: 42, def: 18, exp: 110 },
    ],
  },
  { name: "ワッカ",       hp: 24,  atk: 17, def: 2,  exp: 28,  speed: 1,   tile: 67, kind: "beast",    baseKind: "wokka",         monLevel: 1, minFloor: 6,  maxFloor: 18, subtype: "stonethrow", dungeonFloors: { beginner: { min: 8, max: 10 }, intermediate: { min: 9, max: 14 } },
    levels: [
      { name: "強ワッカ",           hp: 38,  atk: 24, def: 5,  exp: 45  },
      { name: "覇ワッカ",           hp: 61,  atk: 32, def: 7,  exp: 72  },
    ],
  },
  { name: "分裂スライム", hp: 30,  atk: 14, def: 2,  exp: 32,  speed: 1,   tile: 77, kind: "beast",    baseKind: "slime",         monLevel: 1, minFloor: 7,  maxFloor: 20, elemWeak: "fire", subtype: "splitter", dungeonFloors: { beginner: { min: 7, max: 10 }, intermediate: { min: 9, max: 15 } },
    levels: [
      { name: "強スライム",         hp: 47,  atk: 22, def: 5,  exp: 51  },
      { name: "覇スライム",         hp: 74,  atk: 29, def: 7,  exp: 80  },
    ],
  },
  { name: "アーチャー",   hp: 30,  atk: 18, def: 3,  exp: 34,  speed: 1,   tile: 39, kind: "humanoid", baseKind: "archer",        monLevel: 1, minFloor: 8,  maxFloor: 21, subtype: "archer", dungeonFloors: { beginner: { min: 5, max: 8 }, intermediate: { min: 6, max: 12 } },
    levels: [
      { name: "古参アーチャー",     hp: 47,  atk: 25, def: 7,  exp: 54  },
      { name: "弓の達人",           hp: 74,  atk: 32, def: 12, exp: 85  },
    ],
  },
  { name: "ウルフ",       hp: 27,  atk: 20, def: 2,  exp: 40,  speed: 2,   tile: 56, kind: "beast",    baseKind: "wolf",          monLevel: 1, minFloor: 9,  maxFloor: 22, dungeonFloors: { beginner: null, intermediate: { min: 6, max: 12 } },
    levels: [
      { name: "強ウルフ",           hp: 43,  atk: 28, def: 6,  exp: 64  },
      { name: "フェンリル",         hp: 68,  atk: 36, def: 10, exp: 100 },
    ],
  },
  { name: "コソドロ",     hp: 16,  atk: 7,  def: 0,  exp: 35,  speed: 2,   tile: 69, kind: "humanoid", baseKind: "thief",         monLevel: 1, minFloor: 9,  maxFloor: 20, subtype: "thief", dungeonFloors: { beginner: null, intermediate: { min: 6, max: 13 } },
    levels: [
      { name: "大盗賊",             hp: 27,  atk: 11, def: 2,  exp: 56  },
      { name: "怪盗",               hp: 43,  atk: 14, def: 3,  exp: 88  },
    ],
  },
  { name: "錆虫",         hp: 24,  atk: 13, def: 2,  exp: 40,  speed: 1,   tile: 75, kind: "beast",    baseKind: "rustbug",       monLevel: 1, minFloor: 10, maxFloor: 23, elemWeak: "thunder", subtype: "ruster", dungeonFloors: { beginner: null, intermediate: { min: 11, max: 17 } },
    levels: [
      { name: "強錆虫",             hp: 39,  atk: 18, def: 5,  exp: 64  },
      { name: "覇錆虫",             hp: 61,  atk: 25, def: 7,  exp: 100 },
    ],
  },
  { name: "ウィザード",   hp: 24,  atk: 17, def: 3,  exp: 42,  speed: 1,   tile: 40, kind: "humanoid", baseKind: "wizard",        monLevel: 1, minFloor: 11, maxFloor: 24, subtype: "wanduser", wandEffect: "lightning", dungeonFloors: { intermediate: { min: 11, max: 17 } },
    levels: [
      { name: "強ウィザード",       hp: 39,  atk: 24, def: 7,  exp: 67  },
      { name: "大魔導士",           hp: 61,  atk: 29, def: 12, exp: 105 },
    ],
  },
  { name: "ボムスライム", hp: 38,  atk: 14, def: 2,  exp: 55,  speed: 1,   tile: 77, kind: "beast",    baseKind: "bombslime",     monLevel: 1, minFloor: 11, maxFloor: 24, elemWeak: "fire", subtype: "deathbomb", dungeonFloors: { intermediate: { min: 13, max: 18 } },
    levels: [
      { name: "強ボムスライム",     hp: 61,  atk: 22, def: 3,  exp: 88  },
      { name: "覇ボムスライム",     hp: 95,  atk: 29, def: 5,  exp: 138 },
    ],
  },
  { name: "爆弾ゴブリン", hp: 1,   atk: 14, def: 0,  exp: 60,  speed: 2,   tile: 8,  kind: "humanoid", baseKind: "bombgoblin",    monLevel: 1, minFloor: 12, maxFloor: 26, subtype: "kamikaze", dungeonFloors: { intermediate: { min: 13, max: 18 } },
    levels: [
      { name: "強爆弾ゴブリン",     hp: 1,   atk: 22, def: 0,  exp: 96  },
      { name: "自爆狂",             hp: 1,   atk: 29, def: 0,  exp: 150 },
    ],
  },
  { name: "水晶スライム", hp: 5,   atk: 18, def: 0,  exp: 50,  speed: 1,   tile: 77, kind: "beast",    baseKind: "crystalslime",  monLevel: 1, minFloor: 13, maxFloor: 26, elemWeak: "fire", fixedDamageOnly: true, dungeonFloors: { intermediate: { min: 13, max: 18 } },
    levels: [
      { name: "強水晶スライム",     hp: 8,   atk: 25, def: 0,  exp: 80  },
      { name: "覇水晶スライム",     hp: 11,  atk: 32, def: 0,  exp: 125 },
    ],
  },
  { name: "岩霊",         hp: 38,  atk: 18, def: 5,  exp: 45,  speed: 1,   tile: 68, kind: "undead",   baseKind: "rockspirit",    monLevel: 1, minFloor: 14, maxFloor: 28, wallWalker: true, dungeonFloors: { intermediate: { min: 13, max: 19 } },
    levels: [
      { name: "強岩霊",             hp: 61,  atk: 25, def: 9,  exp: 72  },
      { name: "岩の王",             hp: 95,  atk: 32, def: 13, exp: 113 },
    ],
  },
  { name: "オーク",       hp: 41,  atk: 22, def: 7,  exp: 48,  speed: 1,   tile: 11, kind: "humanoid", baseKind: "orc",           monLevel: 1, minFloor: 14, maxFloor: 26, dungeonFloors: { intermediate: { min: 13, max: 19 } },
    levels: [
      { name: "オーク将",           hp: 65,  atk: 31, def: 12, exp: 77  },
      { name: "オーク王",           hp: 101, atk: 40, def: 16, exp: 120 },
    ],
  },
  { name: "ゼラチンキューブ", hp: 81, atk: 22, def: 5, exp: 70,  speed: 0.5, tile: 79, kind: "beast", baseKind: "gelcube",       monLevel: 1, minFloor: 15, maxFloor: 50, elemWeak: "fire", dungeonFloors: { intermediate: { min: 16, max: 19 } },
    levels: [
      { name: "強ゼラチンキューブ", hp: 130, atk: 31, def: 9,  exp: 112 },
      { name: "覇ゼラチンキューブ", hp: 203, atk: 40, def: 13, exp: 175 },
    ],
  },
  { name: "岩砕き",       hp: 68,  atk: 28, def: 7,  exp: 65,  speed: 0.5, tile: 76, kind: "beast",    baseKind: "walldigger",    monLevel: 1, minFloor: 16, maxFloor: 50, wallDigger: true, dungeonFloors: { intermediate: { min: 16, max: 19 } },
    levels: [
      { name: "強岩砕き",           hp: 108, atk: 38, def: 12, exp: 104 },
      { name: "覇岩砕き",           hp: 169, atk: 50, def: 16, exp: 163 },
    ],
  },
  { name: "罠師",         hp: 34,  atk: 18, def: 3,  exp: 48,  speed: 1,   tile: 86, kind: "humanoid", baseKind: "trapmaster",    monLevel: 1, minFloor: 16, maxFloor: 50, subtype: "trapmaster", dungeonFloors: { intermediate: { min: 16, max: 19 } },
    levels: [
      { name: "罠の達人",           hp: 54,  atk: 25, def: 7,  exp: 77  },
      { name: "罠の覇者",           hp: 85,  atk: 32, def: 12, exp: 120 },
    ],
  },
  { name: "大蛇",         hp: 47,  atk: 24, def: 5,  exp: 52,  speed: 1,   tile: 12, kind: "beast",    baseKind: "serpent",       monLevel: 1, minFloor: 17, maxFloor: 50, maxAttacks: 2, dungeonFloors: { intermediate: { min: 16, max: 19 } },
    levels: [
      { name: "強大蛇",             hp: 76,  atk: 32, def: 9,  exp: 83  },
      { name: "覇大蛇",             hp: 119, atk: 42, def: 13, exp: 130 },
    ],
  },
  { name: "罠猟師",       hp: 38,  atk: 20, def: 5,  exp: 55,  speed: 1,   tile: 39, kind: "humanoid", baseKind: "trapthrower",   monLevel: 1, minFloor: 18, maxFloor: 50, subtype: "trapthrower", dungeonFloors: { intermediate: { min: 18, max: 19 } },
    levels: [
      { name: "罠猟師長",           hp: 61,  atk: 28, def: 9,  exp: 88  },
      { name: "罠猟師頭",           hp: 95,  atk: 36, def: 13, exp: 138 },
    ],
  },
  { name: "呪術師",       hp: 34,  atk: 17, def: 5,  exp: 55,  speed: 1,   tile: 44, kind: "humanoid", baseKind: "witchdoc",      monLevel: 1, minFloor: 18, maxFloor: 50, subtype: "wanduser", wandEffect: "curse_wand", dungeonFloors: { intermediate: { min: 18, max: 19 } },
    levels: [
      { name: "強呪術師",           hp: 54,  atk: 24, def: 9,  exp: 88  },
      { name: "大呪術師",           hp: 85,  atk: 29, def: 13, exp: 138 },
    ],
  },
  { name: "解装士",       hp: 38,  atk: 20, def: 5,  exp: 58,  speed: 1,   tile: 59, kind: "humanoid", baseKind: "disarmer",      monLevel: 1, minFloor: 19, maxFloor: 50, subtype: "disarmer", dungeonFloors: { intermediate: { min: 18, max: 19 } },
    levels: [
      { name: "強解装士",           hp: 61,  atk: 28, def: 9,  exp: 93  },
      { name: "覇解装士",           hp: 95,  atk: 36, def: 13, exp: 145 },
    ],
  },
  { name: "投擲士",       hp: 43,  atk: 22, def: 6,  exp: 62,  speed: 1,   tile: 11, kind: "humanoid", baseKind: "monsterthrow",  monLevel: 1, minFloor: 20, maxFloor: 50, subtype: "monsterthrow", dungeonFloors: { intermediate: { min: 18, max: 19 } },
    levels: [
      { name: "強投擲士",           hp: 69,  atk: 31, def: 10, exp: 99  },
      { name: "覇投擲士",           hp: 108, atk: 40, def: 14, exp: 155 },
    ],
  },
  { name: "シャーマン",   hp: 41,  atk: 17, def: 5,  exp: 60,  speed: 1,   tile: 55, kind: "humanoid", baseKind: "shaman",        monLevel: 1, minFloor: 21, maxFloor: 50, subtype: "supporter", dungeonFloors: { intermediate: { min: 18, max: 19 } },
    levels: [
      { name: "強シャーマン",       hp: 65,  atk: 24, def: 9,  exp: 96  },
      { name: "大シャーマン",       hp: 101, atk: 29, def: 13, exp: 150 },
    ],
  },
  { name: "合成獣",       hp: 54,  atk: 20, def: 5,  exp: 80,  speed: 0.5, tile: 80, kind: "beast",    baseKind: "synthmonster",  monLevel: 1, minFloor: 21, maxFloor: 50,
    levels: [
      { name: "強合成獣",           hp: 86,  atk: 29, def: 9,  exp: 128 },
      { name: "覇合成獣",           hp: 135, atk: 38, def: 13, exp: 200 },
    ],
  },
  { name: "バリア術師",   hp: 43,  atk: 20, def: 3,  exp: 68,  speed: 1,   tile: 54, kind: "humanoid", baseKind: "barriermage",   monLevel: 1, minFloor: 22, maxFloor: 50, barrier: 1,
    levels: [
      { name: "強バリア術師",       hp: 69,  atk: 28, def: 6,  exp: 109, barrier: 2 },
      { name: "結界師",             hp: 108, atk: 36, def: 9,  exp: 170, barrier: 3 },
    ],
  },
  { name: "ウィンドメイジ", hp: 38, atk: 20, def: 5, exp: 65,  speed: 1,   tile: 54, kind: "humanoid", baseKind: "windmage",     monLevel: 1, minFloor: 23, maxFloor: 50, subtype: "wanduser", wandEffect: "blowback_wand",
    levels: [
      { name: "強ウィンドメイジ",   hp: 61,  atk: 28, def: 9,  exp: 104 },
      { name: "風の覇者",           hp: 95,  atk: 36, def: 13, exp: 163 },
    ],
  },
  { name: "混乱術師",     hp: 41,  atk: 20, def: 5,  exp: 72,  speed: 1,   tile: 81, kind: "humanoid", baseKind: "confusemage",   monLevel: 1, minFloor: 23, maxFloor: 50, subtype: "wanduser", wandEffect: "confuse_wand",
    levels: [
      { name: "強混乱術師",         hp: 65,  atk: 28, def: 9,  exp: 115 },
      { name: "大混乱術師",         hp: 101, atk: 35, def: 13, exp: 180 },
    ],
  },
  { name: "引きダコ",     hp: 61,  atk: 24, def: 6,  exp: 75,  speed: 1,   tile: 78, kind: "beast",    baseKind: "puller",        monLevel: 1, minFloor: 24, maxFloor: 50, subtype: "puller", dungeonFloors: { intermediate: { min: 18, max: 19 } },
    levels: [
      { name: "強引きダコ",         hp: 97,  atk: 32, def: 10, exp: 120 },
      { name: "覇引きダコ",         hp: 153, atk: 43, def: 14, exp: 188 },
    ],
  },
  { name: "眠り術師",     hp: 43,  atk: 22, def: 6,  exp: 80,  speed: 1,   tile: 82, kind: "humanoid", baseKind: "sleepmage",     monLevel: 1, minFloor: 25, maxFloor: 50, subtype: "wanduser", wandEffect: "sleep_wand", dungeonFloors: { intermediate: { min: 18, max: 19 } },
    levels: [
      { name: "強眠り術師",         hp: 69,  atk: 29, def: 10, exp: 128 },
      { name: "大眠り術師",         hp: 108, atk: 36, def: 16, exp: 200 },
    ],
  },
  { name: "トロル",       hp: 68,  atk: 29, def: 9,  exp: 75,  speed: 1,   tile: 13, kind: "humanoid", baseKind: "troll",         monLevel: 1, minFloor: 25, maxFloor: 50, dungeonFloors: { intermediate: { min: 18, max: 19 } },
    levels: [
      { name: "強トロル",           hp: 108, atk: 40, def: 13, exp: 120 },
      { name: "覇トロル",           hp: 169, atk: 53, def: 17, exp: 188 },
    ],
  },
  { name: "火ダルマ",     hp: 74,  atk: 36, def: 6,  exp: 110, speed: 1,   tile: 61, kind: "beast",    baseKind: "firedemon",     monLevel: 1, minFloor: 25, maxFloor: 50, float: true, dungeonFloors: { intermediate: { min: 18, max: 19 } },
    levels: [
      { name: "強火ダルマ",         hp: 119, atk: 50, def: 10, exp: 176 },
      { name: "炎の悪魔",           hp: 189, atk: 67, def: 14, exp: 275 },
    ],
  },
  { name: "転移術師",     hp: 47,  atk: 24, def: 6,  exp: 90,  speed: 1,   tile: 83, kind: "humanoid", baseKind: "warpmage",      monLevel: 1, minFloor: 26, maxFloor: 50, subtype: "wanduser", wandEffect: "teleport_wand",
    levels: [
      { name: "強転移術師",         hp: 76,  atk: 31, def: 10, exp: 144 },
      { name: "大転移術師",         hp: 117, atk: 38, def: 16, exp: 225 },
    ],
  },
  { name: "ガーゴイル",   hp: 88,  atk: 32, def: 16, exp: 90,  speed: 0.5, tile: 52, kind: "undead",   baseKind: "gargoyle",      monLevel: 1, minFloor: 26, maxFloor: 50, float: true,
    levels: [
      { name: "強ガーゴイル",       hp: 140, atk: 46, def: 21, exp: 144 },
      { name: "覇ガーゴイル",       hp: 220, atk: 58, def: 27, exp: 225 },
    ],
  },
  { name: "ヴァンパイア", hp: 81,  atk: 32, def: 10, exp: 92,  speed: 2,   tile: 15, kind: "undead",   baseKind: "vampire",       monLevel: 1, minFloor: 26, maxFloor: 50, maxAttacks: 2, float: true,
    levels: [
      { name: "強ヴァンパイア",     hp: 130, atk: 46, def: 14, exp: 147 },
      { name: "ヴァンパイア卿",     hp: 203, atk: 58, def: 19, exp: 230 },
    ],
  },
  { name: "ドラゴン",     hp: 122, atk: 43, def: 14, exp: 140, speed: 1,   tile: 14, kind: "dragon",   baseKind: "dragon",        monLevel: 1, minFloor: 27, maxFloor: 50, elemWeak: "ice",
    levels: [
      { name: "強ドラゴン",         hp: 194, atk: 61, def: 19, exp: 224 },
      { name: "古龍",               hp: 304, atk: 78, def: 23, exp: 350 },
    ],
  },
  { name: "ゴーレム",     hp: 135, atk: 36, def: 23, exp: 115, speed: 0.5, tile: 57, kind: "beast",    baseKind: "golem",         monLevel: 1, minFloor: 27, maxFloor: 50, elemWeak: "thunder",
    levels: [
      { name: "強ゴーレム",         hp: 216, atk: 50, def: 28, exp: 184 },
      { name: "覇ゴーレム",         hp: 338, atk: 65, def: 34, exp: 288 },
    ],
  },
  { name: "デーモン",     hp: 108, atk: 50, def: 13, exp: 160, speed: 2,   tile: 58, kind: "beast",    baseKind: "daemon",        monLevel: 1, minFloor: 27, maxFloor: 50, maxAttacks: 3, float: true,
    levels: [
      { name: "強デーモン",         hp: 173, atk: 71, def: 19, exp: 256 },
      { name: "魔王",               hp: 270, atk: 90, def: 24, exp: 400 },
    ],
  },
  /* ===== 新型モンスター4種 ===== */
  { name: "からめ鬼",    hp: 55,  atk: 22, def: 10, exp: 55,  speed: 1,   tile: 108, kind: "beast",    baseKind: "grabber",       monLevel: 1, minFloor: 5,  maxFloor: 15, subtype: "grabber", dungeonFloors: { beginner: { min: 6, max: 9 }, intermediate: { min: 6, max: 13 } },
    levels: [
      { name: "強からめ鬼",         hp: 88,  atk: 32, def: 14, exp: 88  },
      { name: "覇からめ鬼",         hp: 138, atk: 43, def: 19, exp: 138 },
    ],
  },
  { name: "突進角獣",    hp: 62,  atk: 26, def: 8,  exp: 62,  speed: 1,   tile: 56, kind: "beast",    baseKind: "charger",       monLevel: 1, minFloor: 10, maxFloor: 35, subtype: "charger", dungeonFloors: { beginner: null, intermediate: { min: 11, max: 18 } },
    levels: [
      { name: "強突進角獣",         hp: 99,  atk: 38, def: 12, exp: 99  },
      { name: "覇突進角獣",         hp: 155, atk: 53, def: 16, exp: 155 },
    ],
  },
  { name: "ミラーゴーレム", hp: 68, atk: 24, def: 18, exp: 70, speed: 1,   tile: 57, kind: "beast",   baseKind: "reflector",     monLevel: 1, minFloor: 12, maxFloor: 45, subtype: "reflector", dungeonFloors: { intermediate: { min: 11, max: 18 } },
    levels: [
      { name: "強ミラーゴーレム",   hp: 109, atk: 35, def: 24, exp: 112 },
      { name: "覇ミラーゴーレム",   hp: 170, atk: 46, def: 31, exp: 175 },
    ],
  },
  { name: "ハンマーオーガ", hp: 75, atk: 36, def: 9,  exp: 80,  speed: 1,   tile: 13, kind: "humanoid", baseKind: "knocker",      monLevel: 1, minFloor: 15, maxFloor: 50, subtype: "knocker", dungeonFloors: { intermediate: { min: 16, max: 19 } },
    levels: [
      { name: "強ハンマーオーガ",   hp: 120, atk: 52, def: 13, exp: 128 },
      { name: "覇ハンマーオーガ",   hp: 188, atk: 67, def: 17, exp: 200 },
    ],
  },
  { name: "魔法反射師",   hp: 38,  atk: 19, def: 8,  exp: 75,  speed: 1,   tile: 55, kind: "humanoid", baseKind: "magicreflector", monLevel: 1, minFloor: 13, maxFloor: 50, subtype: "magicreflect",
    levels: [
      { name: "強魔法反射師",       hp: 61,  atk: 26, def: 13, exp: 120 },
      { name: "覇魔法反射師",       hp: 95,  atk: 35, def: 18, exp: 188 },
    ],
  },
  { name: "薬投げ師",     hp: 30,  atk: 16, def: 3,  exp: 48,  speed: 1,   tile: 44, kind: "humanoid", baseKind: "potionthrower", monLevel: 1, minFloor: 10, maxFloor: 50, subtype: "potionthrow", dungeonFloors: { beginner: null, intermediate: { min: 11, max: 18 } },
    levels: [
      { name: "強薬投げ師",         hp: 48,  atk: 22, def: 6,  exp: 76  },
      { name: "覇薬投げ師",         hp: 75,  atk: 29, def: 10, exp: 120 },
    ],
  },
  { name: "バーサーカー", hp: 55,  atk: 26, def: 8,  exp: 65,  speed: 1,   tile: 13, kind: "humanoid", baseKind: "berserker",     monLevel: 1, minFloor: 12, maxFloor: 45, subtype: "berserker",
    levels: [
      { name: "大バーサーカー",     hp: 90,  atk: 40, def: 13, exp: 104 },
      { name: "覇バーサーカー",     hp: 145, atk: 58, def: 20, exp: 166 },
    ],
  },
  { name: "キラープラスター", hp: 35, atk: 18, def: 4,  exp: 58,  speed: 1,   tile: 8, kind: "humanoid", baseKind: "killplaster",   monLevel: 1, minFloor: 12, maxFloor: 45, subtype: "defhalf",
    levels: [
      { name: "キラープラスターII", hp: 56,  atk: 25, def: 7,  exp: 92  },
      { name: "キラープラスターΩ",  hp: 88,  atk: 36, def: 11, exp: 148 },
    ],
  },
  { name: "ガーディアン",  hp: 48,  atk: 16, def: 14, exp: 70,  speed: 1,   tile: 59, kind: "humanoid", baseKind: "guardian",      monLevel: 1, minFloor: 10, maxFloor: 10, subtype: "guardian", dungeons: ["beginner"] },
  { name: "氷竜",         hp: 65,  atk: 32, def: 10, exp: 125, speed: 1,   tile: 14, kind: "beast",    baseKind: "icedragon",     monLevel: 1, minFloor: 18, maxFloor: 50, elemWeak: "thunder",
    levels: [
      { name: "大氷竜",             hp: 105, atk: 44, def: 16, exp: 200 },
      { name: "覇氷竜",             hp: 168, atk: 58, def: 22, exp: 320 },
    ],
  },
  { name: "わてり",       hp: 40,  atk: 19, def: 6,  exp: 48,  speed: 1,   tile: 93, kind: "beast",    baseKind: "wateri",        monLevel: 1, minFloor: 6,  maxFloor: 20, elemWeak: "thunder", waterOnly: true, subtype: "watergunner", dungeonFloors: { beginner: null },
    levels: [
      { name: "強わてり",           hp: 64,  atk: 29, def: 10, exp: 77  },
      { name: "覇わてり",           hp: 100, atk: 38, def: 14, exp: 120 },
    ],
  },
  /* ===== 視界操作モンスター ===== */
  { name: "スターライト", hp: 55,  atk: 26, def: 8,  exp: 80,  speed: 1,   tile: 53, kind: "beast",   baseKind: "starlight",     monLevel: 1, minFloor: 15, maxFloor: 50, float: true,
    desc: "同じ部屋にいるだけで周囲を明るく照らし続ける光の精霊。",
    levels: [
      { name: "強スターライト",     hp: 88,  atk: 38, def: 12, exp: 128 },
      { name: "覇スターライト",     hp: 138, atk: 50, def: 17, exp: 200 },
    ],
  },
  { name: "ダークネス",   hp: 65,  atk: 30, def: 10, exp: 95,  speed: 1,   tile: 52, kind: "beast",   baseKind: "darkness",      monLevel: 1, minFloor: 20, maxFloor: 50, float: true,
    desc: "同じ部屋にいると周囲の光を喰らい、プレイヤーの視界を1マスに狭める闇の精霊。",
    levels: [
      { name: "強ダークネス",       hp: 104, atk: 43, def: 15, exp: 152 },
      { name: "覇ダークネス",       hp: 163, atk: 56, def: 21, exp: 238 },
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

/* ===== ボステンプレート（5階ごとに1体登場） ===== */
export const BOSSES = [
  /* 第1ボス B5F (depth=4) */
  { name: "灼熱の覇者", hp: 216,   atk: 31,  def: 16,  exp: 500,
    speed: 1,   tile: 89, kind: "beast",    baseKind: "boss_blaze",
    isBoss: true, bossTier: 1,  monLevel: 1, maxAttacks: 2,
    dungeonNames: { intermediate: "炎眼の番兵" } },
  /* 第2ボス B10F (depth=9) */
  { name: "呪縛の賢者", hp: 360,   atk: 44,  def: 23,  exp: 1200,
    speed: 2,   tile: 90, kind: "humanoid", baseKind: "boss_sage",
    isBoss: true, bossTier: 2,  monLevel: 1, maxAttacks: 1,
    dungeonNames: { intermediate: "封呪の術士" } },
  /* 第3ボス B15F (depth=14) */
  { name: "深淵の番人", hp: 600,   atk: 56,  def: 32,  exp: 2500,
    speed: 1,   tile: 91, kind: "beast",    baseKind: "boss_guardian",
    isBoss: true, bossTier: 3,  monLevel: 1, maxAttacks: 3,
    dungeonNames: { intermediate: "深紅の守護獣" } },
  /* 第4ボス B20F (depth=19) */
  { name: "魔神王",     hp: 900,   atk: 73,  def: 41,  exp: 5000,
    speed: 2,   tile: 92, kind: "beast",    baseKind: "boss_demonking",
    isBoss: true, bossTier: 4,  monLevel: 1, maxAttacks: 3, float: true,
    dungeonNames: { intermediate: "深紅の魔王" } },
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
  /* B5F (depth=4) 攻撃時30%移動封じ */
  { name: "氷壁の番兵", hp: 280, atk: 38, def: 20, exp: 700,
    speed: 1, tile: 93, kind: "beast",    baseKind: "im_boss_frost",
    isBoss: true, bossTier: 1, monLevel: 1, maxAttacks: 2 },
  /* B10F (depth=9) 攻撃時35%毒付与 */
  { name: "猛毒の軍師", hp: 460, atk: 52, def: 27, exp: 1500,
    speed: 1, tile: 94, kind: "humanoid", baseKind: "im_boss_poison",
    isBoss: true, bossTier: 2, monLevel: 1, maxAttacks: 1 },
  /* B15F (depth=14) 毎ターン5HP回復＋攻撃時25%防御半減 */
  { name: "鉄壁の鬼将", hp: 720, atk: 65, def: 42, exp: 3000,
    speed: 1, tile: 95, kind: "humanoid", baseKind: "im_boss_ironwall",
    isBoss: true, bossTier: 3, monLevel: 1, maxAttacks: 2 },
  /* B20F (depth=19) 遠距離魔法弾＋暗闇（ターン消費）＋攻撃時20%防御半減 */
  { name: "闇霧の覇王", hp: 1080, atk: 82, def: 48, exp: 6000,
    speed: 2, tile: 96, kind: "beast",    baseKind: "im_boss_darkfog",
    isBoss: true, bossTier: 4, monLevel: 1, maxAttacks: 1, float: true },
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
    return minF <= floor && floor <= maxF;
  });
  const base = eligible.length > 0 ? pick(eligible) : MONS[0];
  const range = Math.max(base.maxFloor - base.minFloor, 1);
  const progress = Math.max(0, (floor - base.minFloor) / range);
  let spawnLevel = 1;
  if (base.levels?.length >= 2 && progress > 0.65 && Math.random() < 0.55) spawnLevel = 3;
  else if (base.levels?.length >= 1 && progress > 0.30 && Math.random() < 0.50) spawnLevel = 2;
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
export function makeMonster(depth, x, y, { aware = false, lastPx = 0, lastPy = 0, immediateAct = false, dungeonType = null } = {}) {
  const { base, spawnLevel } = pickMonsterDef(depth, dungeonType);
  const st = buildMonStats(base, spawnLevel);
  return { ...st, id: uid(), x, y, maxHp: st.hp, baseSpeed: st.speed ?? 1, turnAccum: immediateAct ? -(st.speed ?? 1) : 0, aware, dir: { x: 0, y: 0 }, lastPx, lastPy, patrolTarget: null };
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
export function bfsNext(map, mons, sx, sy, tx, ty, self, maxDist = 20, pentacles = null, float = false, tileFilter = null, fallbackNearest = false) {
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
  const _canEnterFn = tileFilter
    ? (x, y) => tileFilter(x, y)
    : (x, y) => canEnter(map, x, y, float);
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
  /* レベル別矢の種類: lv1=矢, lv2=強矢, lv3=貫きの矢 */
  const _mLv = m.monLevel || 1;
  const _isPierce = _mLv >= 3;
  const _makeAr = () => _mLv >= 3 ? makePiercingArrow(1) : _mLv >= 2 ? makeStrongArrow(1) : makeArrow(1);
  const _arName = _mLv >= 3 ? "貫きの矢" : _mLv >= 2 ? "強矢" : "矢";
  const _travelMax = _isFc ? 50 : (_isPierce ? maxDist + 50 : maxDist);
  ml.push(`${m.name}が${_arName}を放った！`);
  pushMonsterBoltAnim(m.x, m.y, dx, dy, dg, pl, _mLv >= 3 ? "#ff8844" : _mLv >= 2 ? "#ffcc44" : "#d0a050");
  let lx = m.x, ly = m.y;
  let _plHit = false;
  for (let d = 1; d <= _travelMax; d++) {
    const tx = m.x + dx * d, ty = m.y + dy * d;
    if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
    if (!isWalkable(dg.map, tx, ty)) {
      if (_isPierce) continue; /* 貫きの矢：壁を貫通して直進 */
      /* arrow hits wall — drop at last valid position (avoid pentacle) */
      const _wd = safeArrowDrop(lx, ly, dg);
      _monDropWithSpring(_wd, _makeAr(), dg, ml);
      return;
    }
    if (tx === pl.x && ty === pl.y && !_plHit) {
      /* 祝福された聖域の魔方陣のみ矢を防ぐ（通常聖域は近接のみ） */
      const _arSanc = dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y);
      const _arDodgePc = getDodgePentacleMode(dg, pl.x, pl.y);
      const _arForceMiss = _arDodgePc === "dodge";
      const _arForceSure = _arDodgePc === "sure";
      const _arMissAll = _arForceMiss || (!_arForceSure && (miss || _arSanc));
      if (_arMissAll) {
        if (_arSanc) {
          /* 祝福された聖域は貫きの矢も阻む */
          const _ad = safeArrowDrop(lx, ly, dg);
          _monDropWithSpring(_ad, _makeAr(), dg, ml);
          ml.push(`${m.name}の${_arName}は祝福された聖域の加護に阻まれた！${_arName}が落ちた。`);
          return;
        }
        /* 聖域なしのミス：貫きの矢は落とさず飛び続ける */
        if (!_isPierce) {
          const _ad = safeArrowDrop(pl.x, pl.y, dg);
          _monDropWithSpring(_ad, _makeAr(), dg, ml);
        }
        if (_arForceMiss) ml.push(`みかわしの魔方陣の加護で${m.name}の${_arName}をかわした！${!_isPierce ? `${_arName}が落ちた。` : ""}`);
        else ml.push(`${m.name}の${_arName}は外れた！${!_isPierce ? `${_arName}が落ちた。` : ""}`);
        const trap = dg.traps?.find(t => t.x === pl.x && t.y === pl.y);
        if (trap && opts.fireTrapFn) opts.fireTrapFn(trap, pl, dg, ml);
        if (!_isFc && !_isPierce) return;
      } else {
        let dmg = Math.max(1, m.atk + rng(-2, 2));
        const _arVulnPc = findVulnPentacle(dg, pl.x, pl.y);
        if (_arVulnPc) dmg = _arVulnPc.cursed ? Math.max(1, Math.floor(dmg / 2)) : dmg * (_arVulnPc.blessed ? 4 : 2);
        pl.deathCause = `${m.name}の${_arName}の攻撃で`;
        pl.hp -= dmg;
        ml.push(`${m.name}の${_arName}が命中！${dmg}ダメージ！`);
        if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("衝撃で目が覚めた！"); }
        if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("衝撃で金縛りが解けた！"); }
        if (!_isFc && !_isPierce) return;
        /* farcast / 貫通: arrow continues past player */
        _plHit = true;
        if (_isPierce) ml.push(`${_arName}は貫通して飛んでいく！`);
        else ml.push(`矢は貫通して飛んでいく！`);
      }
    }
    /* intermediate monster */
    const hitMon = dg.monsters.find(o => o !== m && o.x === tx && o.y === ty);
    if (hitMon) {
      const dmg = Math.max(1, m.atk + rng(-2, 2));
      hitMon.hp -= dmg;
      ml.push(`${m.name}の${_arName}が${hitMon.name}に命中！${dmg}ダメージ！`);
      if (hitMon.hp <= 0) {
        ml.push(`${hitMon.name}は倒れた！`);
        opts.monsterDropFn?.(hitMon, dg, ml);
        removeMonster(dg, hitMon);
        monLevelUp(m, dg, ml);
      }
      if (!_isFc && !_isPierce) return;
    }
    /* bigbox */
    const bb = dg.bigboxes?.find(b => b.x === tx && b.y === ty);
    if (bb) {
      ml.push(`${m.name}の${_arName}が${bb.name}に当たった。`);
      if (opts.bbFn) opts.bbFn(bb, _makeAr(), dg, ml);
      else dg.items.push({ ..._makeAr(), x:tx, y:ty });
      if (!_isFc && !_isPierce) return;
    }
    lx = tx; ly = ty;
  }
  /* fell through — drop at last position (貫きの矢は消滅) */
  if (!_isPierce) {
    const _fd = safeArrowDrop(lx, ly, dg);
    _monDropWithSpring(_fd, _makeAr(), dg, ml);
  }
}

/* ===== MONSTER STONE THROW (ワッカ) ===== */
function monsterThrowStone(m, dg, pl, ml) {
  const lvl = m.monLevel || 1;
  const isMagic = lvl >= 3;
  const hitChance = lvl >= 3 ? 0.99 : lvl >= 2 ? 0.90 : 0.75;
  const stoneName = isMagic ? "魔法の石" : "石";
  ml.push(`${m.name}が${stoneName}を投げた！`);
  pushMonsterBoltAnim(m.x, m.y, Math.sign(pl.x - m.x), Math.sign(pl.y - m.y), dg, pl, isMagic ? "#cc88ff" : "#aaaaaa");

  /* みかわしの魔方陣 */
  const _stDodgePcMode = getDodgePentacleMode(dg, pl.x, pl.y);
  if (_stDodgePcMode === "dodge") {
    ml.push(`みかわしの魔方陣の加護で${m.name}の${stoneName}をかわした！${stoneName}が落ちた。`);
    const _sd = safeArrowDrop(pl.x, pl.y, dg);
    _monDropWithSpring(_sd, isMagic ? makeMagicStone(1) : makeStone(1), dg, ml);
    return;
  }

  /* みかわし（防具の効果） */
  const dodged = _stDodgePcMode !== "sure" && hasAbility(pl.armor, "dodge") && Math.random() < 0.25;
  if (dodged) {
    ml.push(`${stoneName}をひらりとかわした！${stoneName}が落ちた。`);
    const _sd = safeArrowDrop(pl.x, pl.y, dg);
    _monDropWithSpring(_sd, isMagic ? makeMagicStone(1) : makeStone(1), dg, ml);
    return;
  }

  const miss = _stDodgePcMode !== "sure" && Math.random() >= hitChance;
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

/* ===== わてり：水鉄砲攻撃 ===== */
function monsterShootWaterGun(m, dg, pl, ml) {
  const adx = pl.x - m.x, ady = pl.y - m.y;
  const dx = Math.sign(adx), dy = Math.sign(ady);
  const maxDist = Math.max(Math.abs(adx), Math.abs(ady));
  ml.push(`${m.name}が水鉄砲を撃った！`);
  pushMonsterBoltAnim(m.x, m.y, dx, dy, dg, pl, "#20c0ff");
  const miss = Math.random() < 0.20;
  /* みかわしの魔方陣 */
  const _wDodgePcMode = getDodgePentacleMode(dg, pl.x, pl.y);
  if (_wDodgePcMode === "dodge") {
    ml.push(`みかわしの魔方陣の加護で${m.name}の水鉄砲をかわした！`);
    return;
  }
  for (let d = 1; d <= maxDist; d++) {
    const tx = m.x + dx * d, ty = m.y + dy * d;
    if (!isWalkable(dg.map, tx, ty)) return;
    /* 途中のモンスターに当たった場合 */
    const hitMon = dg.monsters.find(o => o !== m && o.x === tx && o.y === ty);
    if (hitMon) {
      const dmg = Math.max(1, Math.floor(m.atk * 0.8) + rng(-1, 1));
      hitMon.hp -= dmg;
      ml.push(`${m.name}の水鉄砲が${hitMon.name}に命中！${dmg}ダメージ！`);
      if (hitMon.hp <= 0) { ml.push(`${hitMon.name}は倒れた！`); removeMonster(dg, hitMon); }
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
      /* Lv2以上：命中時に食料を腐らせるか武器を劣化させる */
      const _wLvl = m.monLevel || 1;
      if (_wLvl >= 2 && Math.random() < 0.5) {
        const _foods = pl.inventory.filter(i => i.type === "food" && !i.rotten);
        const _canDegrade = pl.weapon && !hasAbility(pl.weapon, "no_degrade");
        if (_foods.length > 0 && (_canDegrade ? Math.random() < 0.6 : true)) {
          /* 食料をランダムに1つ腐らせる */
          const _tf = pick(_foods);
          rotFood(_tf);
          ml.push(`水びたしになって${_tf.name}が腐ってしまった！`);
        } else if (_canDegrade) {
          /* 装備中の武器を劣化させる */
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
  /* 目覚めたターンは行動しない（袋叩き防止） */
  if (m._justWoke) { m._justWoke = false; return; }
  /* 囮のペン（祝福）: 仮眠中でも起こして誘導（dormant チェックより先に処理） */
  if (m.dormant && !m.dormantHouse &&
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
  /* 金縛り（paralyzeTurns があればボスのみターン経過で解除） */
  if (m.paralyzed) {
    if (m.isBoss && (m.paralyzeTurns || 0) > 0 && !_attackOnly) {
      m.paralyzeTurns = Math.max(0, m.paralyzeTurns - 2);
      if (m.paralyzeTurns <= 0) { m.paralyzed = false; ml.push(`${m.name}の金縛りが解けた！`); m.turnAccum = 0; m._movedThisTurn = true; return; }
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
      if (dg.map[_ty]?.[_tx] === T.FLOOR && !dg.oilyTiles.some(t => t.x === _tx && t.y === _ty))
        dg.oilyTiles.push({ x: _tx, y: _ty });
      const _ikTrap = dg.traps?.find(t => t.x === _tx && t.y === _ty && !t.permanent);
      if (_ikTrap) { dg.traps = dg.traps.filter(t => t !== _ikTrap); ml.push(`油で${_ikTrap.name}が消えた！`); }
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

  /* 鉄壁の鬼将：毎ターン5HP回復（行動消費なし） */
  if (m.baseKind === "im_boss_ironwall" && !_moveOnly) {
    const _ih = Math.min(5, m.maxHp - m.hp);
    if (_ih > 0) { m.hp += _ih; ml.push(`${m.name}は鋼の意志で傷を癒した！(+${_ih}HP)`); }
  }

  /* 闇霧の覇王：遠距離魔法弾（非隣接LOS直線）& 暗闇（同室非隣接） */
  if (m.baseKind === "im_boss_darkfog" && !_moveOnly) {
    const _dfRoom = findRoom(dg.rooms, m.x, m.y);
    const _dfSeal = (dg.pentacles?.some(pc => pc.kind === "magic_seal" && pc.blessed)) ||
      (_dfRoom && dg.pentacles?.some(pc =>
        pc.kind === "magic_seal" &&
        pc.x >= _dfRoom.x && pc.x < _dfRoom.x + _dfRoom.w &&
        pc.y >= _dfRoom.y && pc.y < _dfRoom.y + _dfRoom.h));
    if (!_dfSeal) {
      const _dfAdx = Math.abs(pl.x - m.x), _dfAdy = Math.abs(pl.y - m.y);
      const _dfDist = _dfAdx + _dfAdy;
      const _dfDdx = Math.sign(pl.x - m.x), _dfDdy = Math.sign(pl.y - m.y);
      const _dfInLine = _dfAdx === 0 || _dfAdy === 0 || _dfAdx === _dfAdy;
      const _dfLOS = (dg.visible?.[m.y]?.[m.x] ?? false) && hasLOS(dg.map, m.x, m.y, pl.x, pl.y);
      /* 遠距離（非隣接）& 直線LOS → 魔法弾 */
      if (_dfDist > 1 && _dfInLine && _dfLOS && m.turnAttacks < (m.maxAttacks ?? 1)) {
        pushMonsterBoltAnim(m.x, m.y, _dfDdx, _dfDdy, dg, pl, "#7020b0");
        for (let _bd = 1; _bd < 20; _bd++) {
          const _btx = m.x + _dfDdx * _bd, _bty = m.y + _dfDdy * _bd;
          if (_btx < 0 || _btx >= MW || _bty < 0 || _bty >= MH ||
              dg.map[_bty][_btx] === T.WALL || dg.map[_bty][_btx] === T.BWALL) break;
          if (_btx === pl.x && _bty === pl.y) {
            if (hasAbility(pl.armor, "wand_reflect")) {
              ml.push(`反射の鎧が${m.name}の魔法弾を反射した！`);
              const _rfDmg = Math.max(1, Math.floor(m.atk * 0.5));
              m.hp -= _rfDmg;
              ml.push(`魔法弾が${m.name}に命中！${_rfDmg}ダメージ！`);
            } else if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y)) {
              ml.push("祝福された聖域の加護が魔法弾を防いだ！");
            } else {
              const _dfDmg = Math.max(1, m.atk - Math.floor(pl.def / 2));
              pl.hp -= _dfDmg;
              ml.push(`${m.name}の闇の魔法弾が命中！${_dfDmg}ダメージ！`);
            }
            break;
          }
          const _dfMon = dg.monsters.find(mn => mn.x === _btx && mn.y === _bty && mn !== m);
          if (_dfMon) { ml.push(`${m.name}の魔法弾が${_dfMon.name}に当たったが効果はなかった。`); break; }
        }
        m.turnAttacks++;
        return; /* 射撃行動消費 */
      }
      /* 同室 & 非隣接 → 50%で暗闇 */
      const _dfPlRoom = findRoom(dg.rooms, pl.x, pl.y);
      const _dfSameRoom = _dfRoom && _dfPlRoom &&
        _dfRoom.x === _dfPlRoom.x && _dfRoom.y === _dfPlRoom.y;
      if (_dfSameRoom && _dfDist > 1 && Math.random() < 0.50) {
        pl.darknessTurns = (pl.darknessTurns || 0) + 20;
        ml.push(`${m.name}が暗黒の霧を解き放った！部屋全体が暗闇に包まれた！(20ターン)`);
        return; /* 暗闇行動消費 */
      }
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
    if (m.subtype === "grabber") { if (m.confusedTurns <= 0) ml.push(`${m.name}の混乱が解けた！`); return; } /* grabberは混乱中も絶対移動しない */
    const _cdirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
    const _rd = pick(_cdirs);
    const _cnx = m.x + _rd[0], _cny = m.y + _rd[1];
    if (inBounds(_cnx, _cny)) {
      if (_cnx === pl.x && _cny === pl.y) {
        if (!_moveOnly && m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `混乱した${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn }); }
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
    if (m.confusedTurns <= 0) { ml.push(`${m.name}の混乱が解けた！`); m.turnAccum = 0; m._movedThisTurn = true; }
    return;
  }

  /* ===== 暗闇状態：まっすぐ進み途中の者を攻撃 ===== */
  if ((m.darknessTurns || 0) > 0) {
    const _isPerm = m.darknessTurns >= 9999;
    if (!_isPerm && !_attackOnly) m.darknessTurns = Math.max(0, m.darknessTurns - (m.isBoss ? 2 : 1));
    if (m.subtype === "grabber") { if (!_isPerm && m.darknessTurns <= 0) ml.push(`${m.name}の暗闇が晴れた！`); return; } /* grabberは暗闇中も絶対移動しない */
    if (!m.darkDir) {
      const _ddirs = [[-1,0],[1,0],[0,-1],[0,1]];
      m.darkDir = pick(_ddirs);
    }
    const _dnx = m.x + m.darkDir[0], _dny = m.y + m.darkDir[1];
    if (canEnter(dg.map, _dnx, _dny, _effFloat)) {
      if (_dnx === pl.x && _dny === pl.y) {
        if (!_moveOnly && m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `暗闇の${m.name}が突進して攻撃！${d}ダメージ！`, { skipVuln: true, skipThorn: true, onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn }); }
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
    if (!_isPerm && m.darknessTurns <= 0) { ml.push(`${m.name}の暗闇が晴れた！`); m.turnAccum = 0; m._movedThisTurn = true; }
    return;
  }

  /* ===== 幻惑状態：プレイヤーから逃げ回る ===== */
  if ((m.fleeingTurns || 0) > 0) {
    const _isPerm = m.fleeingTurns >= 9999;
    if (!_isPerm && !_attackOnly) m.fleeingTurns = Math.max(0, m.fleeingTurns - (m.isBoss ? 2 : 1));
    if (m.subtype === "grabber") { if (!_isPerm && m.fleeingTurns <= 0) ml.push(`${m.name}の幻惑が解けた！`); return; } /* grabberは幻惑中も絶対移動しない */
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
        if (!canEnter(dg.map, _snx, _sny)) continue;
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
  /* 囮のペン（呪い）: フロア全敵が常にプレイヤーを認識して追跡 */
  if (dg.pentacles?.some(pc => pc.kind === "decoy" && pc.cursed)) {
    m.aware = true;
    m.lastPx = pl.x;
    m.lastPy = pl.y;
  }
  /* 囮のペン（祝福）: フロア全敵に囮への認識を付与（未覚醒モンスターも対象にするため if(m.aware) の外で処理） */
  if (!m.aware && dg.pentacles?.some(pc => pc.kind === "decoy" && pc.blessed && !(pl.x === pc.x && pl.y === pc.y))) {
    m.aware = true;
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
          : `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
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
    if (m.subtype === "grabber") {
      if (Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1 && canSee) {
        let _justCaptured = false;
        if (!pl.capturedBy) {
          pl.capturedBy = m.id;
          _justCaptured = true;
          ml.push(`${m.name}に絡め取られた！倒さなければ逃げられない！`);
          if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("衝撃で目が覚めた！"); }
          if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("衝撃で金縛りが解けた！"); }
        }
        if (!_justCaptured && !dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y)) {
          if (!_moveOnly && m.turnAttacks < (m.maxAttacks ?? 1)) {
            m.turnAttacks++;
            monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
          }
        }
      }
      return; /* からめ鬼は絶対に移動しない */
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
            (x === pl.x && y === pl.y) ? false : canEnter(map, x, y, _effFloat);
          const _dn = bfsNext(map, dg.monsters, m.x, m.y, _decoyPc.x, _decoyPc.y, m, _decoyMaxDist, dg.pentacles, _effFloat, _decoyTileFilter, true);
          if (_dn) {
            /* BFS到達成功か最近傍タイルへの第一歩（到達不可の場合）を取得 */
            m._decoyLuredOk = true; /* 次のattackOnlyフェーズでも囮ロジック維持 */
            /* BFS次ステップがプレイヤー位置: 通常攻撃して重なりを防ぐ */
            if (_dn.x === pl.x && _dn.y === pl.y) {
              if (!_moveOnly && !dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y) &&
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
      const _chargerRdy = m.subtype === "charger" && !m.sealed && _rAtks && _rLine && _rLen >= 2;
      /* わてり：水鉄砲 */
      const _wgRdy = m.subtype === "watergunner" && !m.sealed && _rLine && _rLen >= 1 && _rLen <= 8 && _rAtks;
      const _ptLvl0 = m.monLevel || 1;
      const _ptRange0 = _ptLvl0 >= 3 ? 10 : _ptLvl0 >= 2 ? 7 : 5;
      const _ptRdy0 = m.subtype === "potionthrow" && !m.sealed && _rAtks && canSee && _rLine && Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y)) <= _ptRange0;
      const _iceDragonRdy0 = m.baseKind === "icedragon" && !m.sealed && _rAtks && _rLen >= 2 &&
        ((m.monLevel || 1) >= 2 ? _sameRoom : _rLine);
      const _guardDarkRdy0 = m.type === "guard" && !m.sealed && _rAtks && (_radx === 0 || _rady === 0) && _rLen >= 2 && _rLen <= 8;
      if ((_archerRdy || _stoneRdy || _wandRdy || _dragonRdy0 || _ttRdy0 || _mtRdy0 || _chargerRdy || _wgRdy || _ptRdy0 || _iceDragonRdy0 || _guardDarkRdy0) && (m.alwaysUseSpecial || Math.random() < 0.5)) {
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
              m.turnAttacks++;
              monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}が突進して攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
              break;
            }
            const _chOther = dg.monsters.find(o => o !== m && o.x === _cnx && o.y === _cny);
            if (_chOther) {
              m.turnAttacks++;
              const _chDmg = Math.max(1, Math.floor(m.atk * m.atk / (m.atk + (_chOther.def || 0))) + rng(-1, 1));
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

      if (m.subtype === "archer" && !m.sealed && inLine && lineLen >= 1 && lineLen <= 10 && m.turnAttacks < (m.maxAttacks ?? 1) && (_rdy || m.alwaysUseSpecial || Math.random() < 0.5)) {
        m.turnAttacks++;
        monsterShootArrow(m, dg, pl, ml, opts);
        return;
      }

      /* ── watergunner（わてり等）：一直線上で水鉄砲攻撃 ── */
      if (m.subtype === "watergunner" && !m.sealed && inLine && lineLen >= 1 && lineLen <= 8 && m.turnAttacks < (m.maxAttacks ?? 1) && (_rdy || m.alwaysUseSpecial || Math.random() < 0.5)) {
        m.turnAttacks++;
        monsterShootWaterGun(m, dg, pl, ml);
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

      if (m.subtype === "potionthrow" && !m.sealed && m.turnAttacks < (m.maxAttacks ?? 1)) {
        const _ptLvl = m.monLevel || 1;
        const _ptRange = _ptLvl >= 3 ? 10 : _ptLvl >= 2 ? 7 : 5;
        const _ptDist = Math.max(Math.abs(pl.x - m.x), Math.abs(pl.y - m.y));
        const _ptStraight = adx === 0 || ady === 0 || Math.abs(adx) === Math.abs(ady);
        if (_ptStraight && _ptDist <= _ptRange && canSee && (_rdy || m.alwaysUseSpecial || Math.random() < 0.5)) {
          m.turnAttacks++;
          monsterThrowPotion(m, dg, pl, ml, opts.bbFn);
          return;
        }
      }

      /* ── 警備員：縦・横の直線上で暗闇の薬投げ ── */
      if (m.type === "guard" && !m.sealed && (adx === 0 || ady === 0) && lineLen >= 2 && lineLen <= 8 && m.turnAttacks < (m.maxAttacks ?? 1) && (_rdy || m.alwaysUseSpecial || Math.random() < 0.4)) {
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
            .filter(({ x, y }) => isWalkable(dg.map, x, y) &&
              !dg.monsters.some(o => o.x === x && o.y === y));
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
      if (_ibCanFire && (_ibRdy || m.alwaysUseSpecial || Math.random() < 0.5)) {
        m.turnAttacks++;
        monsterIceBreath(m, dg, pl, ml, _onHit);
        return;
      }
    }

    /* ── runner（コロポックル等）：常にプレイヤーから逃げる。攻撃しない ── */
    /* 封印中は逃げずに通常AI（接近・攻撃）で動く */
    if (m.subtype === "runner" && !m.sealed) {
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
        /* 50%は様子を見るだけ（無駄行動） */
        if (Math.random() < 0.50) {
          ml.push(`${m.name}はこちらの様子を伺っている…`);
          return;
        }
        const _hasAntiSteal = hasAbility(pl.armor, "anti_steal");
        if (_hasAntiSteal) {
          ml.push(`護盗の鎧が${m.name}の盗みを防いだ！`);
          /* 盗めないので通常攻撃 */
          if (m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn }); }
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
            ml.push(`${m.name}に${_pick.it.name}を外された！`);
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
        if (Math.random() >= 0.25) {
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
          /* 射線をトレースして着地点を決定（泉・大箱があれば入る） */
          let _lx = pl.x, _ly = pl.y;
          let _ibHitMon = null, _ibHitSpring = null, _ibHitBB = null;
          for (let _si = 1; _si <= 10; _si++) {
            const _nx = pl.x + _ibdx * _si, _ny = pl.y + _ibdy * _si;
            const _ibSpr = dg.springs?.find(s => s.x === _nx && s.y === _ny);
            if (_ibSpr) { _ibHitSpring = _ibSpr; _lx = _nx; _ly = _ny; break; }
            const _ibBB = dg.bigboxes?.find(b => b.x === _nx && b.y === _ny);
            if (_ibBB) { _ibHitBB = _ibBB; _lx = _nx; _ly = _ny; break; }
            if (!isWalkable(dg.map, _nx, _ny)) break;
            _lx = _nx; _ly = _ny;
            _ibHitMon = dg.monsters.find(o => o.x === _nx && o.y === _ny);
            if (_ibHitMon) break;
          }
          pushMonsterBoltAnim(pl.x, pl.y, _ibdx, _ibdy, dg, pl, "#ffdd44");
          /* 泉に入った */
          if (_ibHitSpring) {
            ml.push(`${m.name}に${_ibN}を弾かれ泉に落ちた！`);
            soakItemIntoSpring(_ibHitSpring, { ..._ibItem, x: _lx, y: _ly }, ml, dg, it => it.name);
            return;
          }
          /* 大箱に入った */
          if (_ibHitBB) {
            ml.push(`${m.name}に${_ibN}を弾かれ${_ibHitBB.name}に入った！`);
            if (opts.bbFn) opts.bbFn(_ibHitBB, _ibItem, dg, ml);
            else dg.items.push({ ..._ibItem, x: _lx, y: _ly });
            return;
          }
          /* アイテム種別ごとに既存の投擲命中ルールを適用 */
          if (_ibItem.type === "potion") {
            /* 薬：着地点でsplash（敵に当たっても同じ位置でsplash） */
            if (_ibHitMon) ml.push(`${m.name}に${_ibN}を弾かれ${_ibHitMon.name}に当たって割れた！`);
            else ml.push(`${m.name}に${_ibN}を弾かれた！薬が割れた！`);
            splashPotion(dg, _lx, _ly, _ibItem.effect, _ibItem.value || 0, pl, ml, _luFn, false, false);
          } else if (_ibItem.type === "pot") {
            /* 壺：衝撃ダメージ（敵命中時）＋中身散乱 */
            if (_ibHitMon) {
              const _ibDmg = Math.max(1, 3 + rng(0, 3));
              _ibHitMon.hp -= _ibDmg;
              ml.push(`${m.name}に${_ibN}を弾かれ${_ibHitMon.name}に当たって割れた！${_ibDmg}ダメージ！`);
              if (_ibHitMon.hp <= 0) killMonster(_ibHitMon, dg, pl, ml, _luFn, false, m);
            } else {
              ml.push(`${m.name}に${_ibN}を弾かれた！壺が割れた！`);
            }
            scatterPotContents(_ibItem, dg, _lx, _ly, pl, ml, _luFn);
          } else if (_ibItem.type === "wand") {
            /* 杖：命中した敵に杖効果発動、消滅 */
            if (_ibHitMon) {
              const _ibWdx = Math.sign(_lx - pl.x), _ibWdy = Math.sign(_ly - pl.y);
              ml.push(`${m.name}が${_ibN}を弾いて${_ibHitMon.name}に当てた！`);
              applyWandEffect(_ibItem.effect, "monster", _ibHitMon, _ibWdx, _ibWdy, dg, pl, ml, _luFn, null, getBlessMultiplier(_ibItem), null, 0, m);
            } else {
              ml.push(`${m.name}に${_ibN}を弾かれた！`);
              const _ibft = new Set();
              placeItemAt(dg, _lx, _ly, _ibItem, ml, _ibft);
            }
          } else {
            /* それ以外：敵に命中→投擲ダメージで消滅、外れ→着地 */
            if (_ibHitMon) {
              const _ibDmg = Math.max(1,
                (_ibItem.type === "weapon"
                  ? (_ibItem.atk || 3) + (_ibItem.plus || 0)
                  : 3) + rng(0, 3));
              _ibHitMon.hp -= _ibDmg;
              ml.push(`${m.name}が${_ibN}を弾いて${_ibHitMon.name}に当てた！${_ibDmg}ダメージ！消滅した。`);
              if (_ibHitMon.hp <= 0) killMonster(_ibHitMon, dg, pl, ml, _luFn, false, m);
            } else {
              ml.push(`${m.name}に${_ibN}を弾かれた！`);
              const _ibft = new Set();
              placeItemAt(dg, _lx, _ly, _ibItem, ml, _ibft);
            }
          }
          return;
        }
        /* 弾くものがなければ通常攻撃 */
        if (m.turnAttacks < (m.maxAttacks ?? 1)) { m.turnAttacks++; monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn }); }
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
            const _throwItem = m.heldItems.splice(0, 1)[0];
            pushMonsterBoltAnim(m.x, m.y, _srDx, _srDy, dg, pl, "#ff8800");
            if (_srHitMon) {
              /* 途中の敵に命中 */
              const _srDmg = Math.max(1, ((_throwItem.type === "weapon" ? (_throwItem.atk || 3) + (_throwItem.plus || 0) : 3) + rng(0, 3)));
              ml.push(`${m.name}が投げた${_throwItem.name}が${_srHitMon.name}に命中！${_srDmg}ダメージ！消滅した。`);
              _srHitMon.hp -= _srDmg;
              if (_srHitMon.hp <= 0) { killMonster(_srHitMon, dg, pl, ml, _luFn, false, m); }
            } else {
              const _srAntiSteal = hasAbility(pl.armor, "anti_steal");
              const _srMiss = !_srAntiSteal && Math.random() < 0.25;
              if (_srAntiSteal) {
                ml.push(`護盗の鎧が${m.name}の投擲を防いだ！${_throwItem.name}は地面に落ちた！`);
                const _srft = new Set();
                placeItemAt(dg, pl.x, pl.y, _throwItem, ml, _srft);
              } else if (_srMiss) {
                ml.push(`${m.name}が盗んだ${_throwItem.name}を投げてきたが外れた！足元に落ちた。`);
                const _srDrop = safeArrowDrop(pl.x, pl.y, dg);
                _monDropWithSpring(_srDrop, _throwItem, dg, ml);
              } else if (_throwItem.type === "potion") {
                ml.push(`${m.name}が盗んだ${_throwItem.name}を投げてきた！`);
                splashPotion(dg, pl.x, pl.y, _throwItem.effect, _throwItem.value || 0, pl, ml, _luFn, false, false);
              } else if (_throwItem.type === "pot") {
                ml.push(`${m.name}が盗んだ${_throwItem.name}を投げてきた！`);
                scatterPotContents(_throwItem, dg, pl.x, pl.y, pl, ml, _luFn);
              } else if (_throwItem.type === "wand") {
                ml.push(`${m.name}が盗んだ${_throwItem.name}を投げてきた！`);
                applyWandEffect(_throwItem.effect, "player", pl, _srDx, _srDy, dg, pl, ml, _luFn, null, getBlessMultiplier(_throwItem), null);
                if (_onHit) _onHit(m);
              } else {
                const _srDmg = Math.max(1, ((_throwItem.type === "weapon" ? (_throwItem.atk || 3) + (_throwItem.plus || 0) : 3) + rng(0, 3)));
                ml.push(`${m.name}が盗んだ${_throwItem.name}を投げてきた！${_srDmg}ダメージ！消滅した。`);
                pl.hp -= _srDmg;
                if (_onHit) _onHit(m);
              }
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
          m.heldItems.push(_stolen);
          ml.push(`${m.name}が${_stolen.name}を盗んだ！次のターンに投げてくるぞ！`);
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
        if (isWalkable(dg.map, _pnx, _pny) && !dg.monsters.some(o => o.x === _pnx && o.y === _pny)) {
          pl.x = _pnx; pl.y = _pny;
          ml.push(`${m.name}に引き寄せられた！`);
          if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("引っ張られて目が覚めた！"); }
          if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("引っ張られて金縛りが解けた！"); }
        }
      }
      /* 引き寄せ後も通常攻撃・移動にフォールスルー */
    }

    /* ── berserker（バーサーカー等）：敵味方区別なく攻撃、店主除く ── */
    if (m.subtype === "berserker" && !m.sealed) {
      m.aware = true;
      /* 隣接ターゲット（店主除く）を探す */
      const _bcAdj = dg.monsters.filter(o =>
        o !== m && o.type !== "shopkeeper" &&
        Math.abs(o.x - m.x) <= 1 && Math.abs(o.y - m.y) <= 1
      );
      const _bcAdjPl = Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1;
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
        const _bNext = bfsNext(map, [], m.x, m.y, _bTx, _bTy, m, 40, dg.pentacles, _effFloat);
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
        if (canSee && _sameRoom && Math.random() < 0.20) {
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
              m.def = Math.floor((m.def || 0) / 2);
              ml.push(`跳ね返った魔法が${m.name}に命中！${m.name}の防御力が半減した！`);
            } else if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y)) {
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
        /* 魔法不発 or 魔封じ → 隣接なら通常攻撃 */
        if (Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1) {
          m.turnAttacks++;
          monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
          return;
        }
      }
      /* 移動フェーズ */
      if (!_attackOnly) {
        const _kpTx = canSee ? pl.x : m.lastPx;
        const _kpTy = canSee ? pl.y : m.lastPy;
        const _kpNext = bfsNext(map, [], m.x, m.y, _kpTx, _kpTy, m, 40, dg.pentacles, _effFloat);
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

    /* ── guardian（ガーディアン等）：仲間の隣に留まりかばう ── */
    if (m.subtype === "guardian") {
      /* 攻撃フェーズ：プレイヤーが隣接なら攻撃 */
      if (!_moveOnly && Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1 && m.turnAttacks < (m.maxAttacks ?? 1)) {
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
          const _gaNext = bfsNext(map, [], m.x, m.y, _gaTx, _gaTy, m, 40, dg.pentacles, _effFloat);
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
            if (!isWalkable(map, _anx, _any)) continue;
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

    /* adjacent attack */
    if (Math.abs(pl.x - m.x) <= 1 && Math.abs(pl.y - m.y) <= 1 && canSee) {
      if (_moveOnly) return; /* moveOnlyフェーズ：隣接済みなので移動しない */
      /* 聖域チェック：プレイヤーが聖域の上なら攻撃不可 */
      if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y)) return;
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
    const next = bfsNext(map, [], m.x, m.y, tx, ty, m, 40, dg.pentacles, _effFloat, _wateriFilter);
    if (next && dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === next.x && pc.y === next.y)) return;
    if (next) {
      if (next.x === pl.x && next.y === pl.y) {
        /* 聖域チェック：プレイヤーが聖域の上なら攻撃不可 */
        if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === pl.x && pc.y === pl.y)) return;
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
        if (_bNext && _bNext.x === m.x && _bNext.y === m.y && _blocker.type !== "shopkeeper" &&
            /* waterOnly：スワップ先が水/泉でない場合はスワップ不可 */
            (!m.waterOnly || map[next.y]?.[next.x] === T.WATER || dg.springs?.some(s => s.x === next.x && s.y === next.y))) {
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
        if (m.waterOnly) {
          if (!inBounds(_anx, _any)) continue;
          if (map[_any][_anx] !== T.WATER && !dg.springs?.some(s => s.x === _anx && s.y === _any)) continue;
        } else {
          if (!canEnter(map, _anx, _any, _effFloat)) continue;
        }
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
            monsterAttackPlayer(m, dg, pl, ml, d => `${m.name}の攻撃！${d}ダメージ！`, { onPlayerHit: _onHit, onPlayerMiss: _onMiss, luFn: _luFn });
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
      const _fd4 = shuffle([[0,-1],[0,1],[-1,0],[1,0]]);
      for (const [_fdx, _fdy] of _fd4) {
        const _fnx = m.x + _fdx, _fny = m.y + _fdy;
        if (m.waterOnly) {
          if (!inBounds(_fnx, _fny)) continue;
          if (map[_fny][_fnx] !== T.WATER && !dg.springs?.some(s => s.x === _fnx && s.y === _fny)) continue;
        } else if (!canEnter(map, _fnx, _fny, _effFloat)) continue;
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
    if (m.subtype === "grabber") return;
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
            if (isWalkable(map, _tx, _ty)) { m.patrolTarget = { x: _tx, y: _ty }; break; }
          }
        }
        if (!m.patrolTarget) {
          /* フォールバック：部屋の出口タイルを目標に */
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
            const _prev = m.lastPatrolTarget;
            const cands = _prev ? exits.filter(e => e.x !== _prev.x || e.y !== _prev.y) : exits;
            m.patrolTarget = pick(cands.length > 0 ? cands : exits);
          }
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
        m.patrolTarget.x, m.patrolTarget.y, m, 100, dg.pentacles, _effFloat);
      if (next && !(next.x === pl.x && next.y === pl.y) &&
          !dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === next.x && pc.y === next.y)) {
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
          if (!isWalkable(map, _anx, _any)) continue;
          if (_anx === pl.x && _any === pl.y) continue;
          if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === _anx && pc.y === _any)) continue;
          if (dg.monsters.some(o => o !== m && o.x === _anx && o.y === _any)) continue;
          m.dir = { x: _adx, y: _ady };
          m.x = _anx; m.y = _any;
          _sidestepped = true;
          break;
        }
        if (!_sidestepped && m.dir) m.dir = { x: -m.dir.x, y: -m.dir.y };
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
