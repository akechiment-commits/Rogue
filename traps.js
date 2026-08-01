import { rng, T, MW, MH, uid, clamp, monsterAt, removeMonster, hasAbility, randomTeleportDest, getDodgePentacleMode } from "./utils.js";
import { resolveItemName, ARROW_T, makeArrow, makePoisonArrow, placeItemAt, doExplosion, hasCursedExplosionPentacle, hasRingEffect, doTimeBombExplosion, rotFood, genFood, applyRockfallEffect, removeTrap, mineExplosionPending, fireTrapArrowFromFacing, multiplyRoomMonsters, unidentPlayerItems, applyWaterGunToInventory, applySoakedStatus, hasWaterProof, getFixtureItemDeps } from "./items.js";
import { MONS, spawnMonsters } from "./monsters.js";
import { materializeFakeStair } from "./fixtures.js";
import { statusTurns } from "./statusDuration.js";

export function fireTrapPlayer(trap, p, dg, ml, nameFn = null, luFn = null, ctx = null) {
  /* 偽階段：ランダムな通常罠に化けてから再発動 */
  if (trap?.effect === "fake_stair") {
    const _was = trap.name || "偽の階段";
    materializeFakeStair(trap, getFixtureItemDeps());
    ml.push(`${_was}が罠に化けた！（${trap.name}）`);
    return fireTrapPlayer(trap, p, dg, ml, nameFn, luFn, ctx);
  }
  trap.revealed = true;
  let r = null;
  let noBreak = false; /* trueのとき作動後の30%破壊チェックをスキップ */
  const identSet = ctx?.ident || null;

  switch (trap.effect) {
    case "explode": {
      /* 地雷は敵ターン後に爆発。破壊判定は爆発後（runMineExplosion） */
      noBreak = true;
      dg._pendingMineExplosion = mineExplosionPending(trap, nameFn);
      r = "deferred_explosion";
      break;
    }
    case "arrow_trap": {
      ml.push(`${trap.name}が発動！`);
      fireTrapArrowFromFacing(trap, p, dg, ml, { poison: false });
      break;
    }
    case "pitfall":
      ml.push(`${trap.name}が発動！穴に落ちた！`);
      r = "pitfall";
      break;
    case "rust": {
      const _rustCands = [];
      if (p.weapon && !hasAbility(p.weapon, "no_degrade")) _rustCands.push(p.weapon);
      if (p.armor  && !hasAbility(p.armor,  "no_degrade")) _rustCands.push(p.armor);
      const _eq = _rustCands[0];
      if (_eq) {
        const _op = _eq.plus || 0;
        _eq.plus = _op - 1;
        const _fp = (v) => (v > 0 ? `+${v}` : v === 0 ? `無印` : `${v}`);
        ml.push(`${trap.name}が発動！${_eq.name}が錆びた！(${_fp(_op)}→${_fp(_eq.plus)})`);
      } else {
        const _ndName = p.weapon?.name || p.armor?.name;
        if (_ndName) {
          ml.push(`${trap.name}が発動！しかし${_ndName}は錆びなかった！`);
        } else {
          ml.push(`${trap.name}が発動！何も起こらなかった。`);
        }
      }
      break;
    }
    case "spin": {
      const _spinDst = randomTeleportDest(dg, p.x, p.y, (x, y) => !dg.monsters.some(m => m.x === x && m.y === y));
      if (_spinDst) { p.x = _spinDst.x; p.y = _spinDst.y; }
      ml.push(`${trap.name}が発動！吹き飛ばされた！`);
      if ((p.immobileTurns || 0) > 0) { p.immobileTurns = 0; ml.push("吹き飛ばされて移動封じが解けた！"); }
      const _spinLandTrap = dg.traps.find(t => t !== trap && t.x === p.x && t.y === p.y);
      if (_spinLandTrap) fireTrapPlayer(_spinLandTrap, p, dg, ml, nameFn, luFn, ctx);
      break;
    }
    case "sleep":
      if (hasAbility(p.armor, "sleep_proof")) {
        ml.push(`${trap.name}が発動！しかし眠れなかった！(耐眠)`);
      } else {
        const _st = statusTurns("sleep", { kind: "player" });
        p.sleepTurns = (p.sleepTurns || 0) + _st;
        ml.push(`${trap.name}が発動！眠りに落ちた...(${_st}ターン)`);
      }
      break;
    case "poison_arrow": {
      ml.push(`${trap.name}が発動！`);
      fireTrapArrowFromFacing(trap, p, dg, ml, { poison: true });
      break;
    }
    case "strong_arrow": {
      ml.push(`${trap.name}が発動！`);
      fireTrapArrowFromFacing(trap, p, dg, ml, { strong: true });
      break;
    }
    case "summon_trap": {
      ml.push(`${trap.name}が発動！`);
      const _sumCount = rng(2, 4);
      const _sumDepth = p.depth || 1;
      const _sumSpawned = spawnMonsters(dg, _sumCount, _sumDepth - 1, p.x, p.y, p, { aware: true, immediateAct: true });
      ml.push(`${_sumSpawned}体の敵が現れた！`);
      break;
    }
    case "slow_trap": {
      if (hasAbility(p.armor, "slow_proof")) {
        ml.push(`${trap.name}が発動！しかし防具が鈍足を防いだ！(耐鈍足)`);
      } else {
        const _st = statusTurns("slow", { kind: "player" });
        p.slowTurns = (p.slowTurns || 0) + _st;
        ml.push(`${trap.name}が発動！体が重くなった...(鈍足${_st}ターン)`);
      }
      break;
    }
    case "confuse_trap": {
      if (hasAbility(p.armor, "confuse_proof")) {
        ml.push(`${trap.name}が発動！しかし防具が混乱を防いだ！(耐混乱)`);
      } else {
        const _ct = statusTurns("confuse", { kind: "player" });
        p.confusedTurns = (p.confusedTurns || 0) + _ct;
        ml.push(`${trap.name}が発動！頭がくらくらする！(混乱${_ct}ターン)`);
      }
      break;
    }
    case "bewitch_trap": {
      if (hasAbility(p.armor, "bewitch_proof")) {
        ml.push(`${trap.name}が発動！しかし防具が幻惑を防いだ！(耐惑わし)`);
      } else {
        const _bt = statusTurns("bewitch", { kind: "player" });
        p.bewitchedTurns = (p.bewitchedTurns || 0) + _bt;
        ml.push(`${trap.name}が発動！幻惑された！周囲の見た目がおかしくなった！(${_bt}ターン)`);
      }
      break;
    }
    case "darkness_trap": {
      if (hasAbility(p.armor, "darkness_proof")) {
        ml.push(`${trap.name}が発動！しかし防具が暗闇を防いだ！(耐暗闇)`);
      } else {
        const _dt = statusTurns("darkness", { kind: "player" });
        p.darknessTurns = (p.darknessTurns || 0) + _dt;
        ml.push(`${trap.name}が発動！暗闇に包まれた！視界が1マスになる！(${_dt}ターン)`);
      }
      break;
    }
    case "seal_trap": {
      if (hasAbility(p.armor, "seal_proof")) {
        ml.push(`${trap.name}が発動！しかし防具が封印を防いだ！(耐封印)`);
      } else {
        const _st = statusTurns("seal", { kind: "player" });
        p.sealedTurns = (p.sealedTurns || 0) + _st;
        ml.push(`${trap.name}が発動！魔法が封印された！(${_st}ターン)`);
      }
      break;
    }
    case "steal_trap": {
      if (hasAbility(p.armor, "anti_steal")) {
        ml.push(`${trap.name}が発動！しかし防具が盗みを防いだ！(護盗)`);
      } else if (p.inventory && p.inventory.length > 0) {
        const _stCandidates = p.inventory.filter(i => i.type !== "goal");
        if (_stCandidates.length === 0) { ml.push(`${trap.name}が発動！しかし大事なものは盗めなかった。`); break; }
        const _stItem = _stCandidates[rng(0, _stCandidates.length - 1)];
        const _stIdx = p.inventory.indexOf(_stItem);
        p.inventory.splice(_stIdx, 1);
        const _stFt = new Set([trap.id]);
        let _stX = p.x, _stY = p.y;
        for (let _a = 0; _a < 200; _a++) {
          const _stRoom = dg.rooms[rng(0, dg.rooms.length - 1)];
          const _tx = rng(_stRoom.x, _stRoom.x + _stRoom.w - 1);
          const _ty = rng(_stRoom.y, _stRoom.y + _stRoom.h - 1);
          if (dg.map[_ty]?.[_tx] === T.FLOOR) { _stX = _tx; _stY = _ty; break; }
        }
        placeItemAt(dg, _stX, _stY, _stItem, ml, _stFt);
        ml.push(`${trap.name}が発動！${resolveItemName(_stItem, nameFn)}がどこかへ飛んでいった！`);
      } else {
        ml.push(`${trap.name}が発動！しかし何も盗まれなかった。`);
      }
      break;
    }
    case "trip_trap": {
      /* 転倒：小ダメージ + 所持品を数個周囲へ落とす（罠・泉・水に落ち得る） */
      if (hasRingEffect(p, "core_ring")) {
        ml.push(`${trap.name}が発動！しかし体幹の指輪で踏ん張り、転ばなかった！`);
        break;
      }
      const _tripDmg = rng(3, 8);
      p.deathCause = `${trap.name}による転倒により`;
      p.hp -= _tripDmg;
      ml.push(`${trap.name}が発動！転んでしまった！${_tripDmg}ダメージ！`);
      /* 装備中の武器・防具・指輪は落とさない（インベントリ内の未装備のみ） */
      const _eq = new Set([p.weapon, p.armor, ...(p.rings || [])].filter(Boolean));
      const _tripCand = (p.inventory || []).filter((i) => i && i.type !== "goal" && !_eq.has(i));
      if (_tripCand.length === 0) {
        ml.push("しかし落とすものはなかった。");
      } else {
        const _tripN = Math.min(_tripCand.length, rng(2, 4));
        /* シャッフルして先頭から落とす */
        for (let i = _tripCand.length - 1; i > 0; i--) {
          const j = rng(0, i);
          const tmp = _tripCand[i];
          _tripCand[i] = _tripCand[j];
          _tripCand[j] = tmp;
        }
        const _tripDrop = _tripCand.slice(0, _tripN);
        const _tripFt = new Set([trap.id]);
        const _droppedNames = [];
        for (const _it of _tripDrop) {
          const _idx = p.inventory.indexOf(_it);
          if (_idx === -1) continue;
          p.inventory.splice(_idx, 1);
          placeItemAt(dg, p.x, p.y, _it, ml, _tripFt, 0, p, p.x, p.y);
          _droppedNames.push(resolveItemName(_it, nameFn));
        }
        if (_droppedNames.length > 0) {
          ml.push(`${_droppedNames.join("、")}を落とした！`);
        }
      }
      break;
    }
    case "hunger_trap": {
      const _loss = Math.floor((p.maxHunger || 100) * 0.1);
      p.hunger = Math.max(0, (p.hunger || 0) - _loss);
      ml.push(`${trap.name}が発動！急に空腹を感じた！満腹度が10%下がった。`);
      break;
    }
    case "shadow_stitch": {
      const _it = statusTurns("immobile", { kind: "player" });
      p.immobileTurns = (p.immobileTurns || 0) + _it;
      ml.push(`${trap.name}が作動！影に縫い付けられた！(${_it}ターン移動不能)`);
      break;
    }
    case "rockfall": {
      ml.push(`${trap.name}が作動！岩が降ってきた！`);
      applyRockfallEffect(dg, trap.x, trap.y, trap, ml, new Set([trap.id]), p);
      break;
    }
    case "time_bomb": {
      /* 作動した罠をトラップリストから除去し、pendingBombs に登録 */
      dg.traps = dg.traps.filter(t => t !== trap);
      dg.pendingBombs = dg.pendingBombs || [];
      dg.pendingBombs.push({ x: trap.x, y: trap.y, turnsLeft: 4, nameFn });
      ml.push(`${trap.name}が作動！4ターン後に大爆発が起きる！`);
      noBreak = true; /* 既に除去済み。重複メッセージを避ける */
      break;
    }
    case "mp_absorb_trap": {
      const _mpBefore = p.mp || 0;
      p.mp = Math.max(0, _mpBefore - 5);
      const _mpLost = _mpBefore - (p.mp || 0);
      ml.push(`${trap.name}が発動！MPが${_mpLost}吸い取られた！`);
      break;
    }
    case "float_trap": {
      const _ft = statusTurns("float", { kind: "player" });
      p.floatTurns = Math.max(p.floatTurns || 0, _ft);
      ml.push(`${trap.name}が発動！体がふわっと浮いた！(浮遊${_ft}ターン)`);
      break;
    }
    case "oil_trap": {
      const _ot = statusTurns("oily", { kind: "player" });
      p.oilyTurns = (p.oilyTurns || 0) + _ot;
      ml.push(`${trap.name}が発動！油まみれになった！炎ダメージが2倍になる！(${_ot}ターン)`);
      break;
    }
    case "unident_trap": {
      const _ur = unidentPlayerItems(p, identSet);
      if (_ur.count > 0 && _ur.item) {
        const _nm = resolveItemName(_ur.item, nameFn);
        ml.push(`${trap.name}が発動！${_nm}のことがわからなくなった…`);
      } else {
        ml.push(`${trap.name}が発動！特に思い浮かぶものがなかった。`);
      }
      break;
    }
    case "alarm_trap": {
      let _aw = 0;
      for (const m of dg.monsters || []) {
        if (m.type === "shopkeeper" && m.state === "friendly") continue;
        if (!m.aware) _aw++;
        m.aware = true;
        if (p) { m.lastPx = p.x; m.lastPy = p.y; }
      }
      ml.push(`${trap.name}が発動！フロアに警報が響いた！`);
      if (_aw > 0) ml.push(`敵が騒ぎに気づいた！`);
      else ml.push(`すでに敵は警戒していた…`);
      break;
    }
    case "multiply_trap": {
      ml.push(`${trap.name}が発動！`);
      multiplyRoomMonsters(dg, trap.x, trap.y, ml, p);
      break;
    }
    case "watergun_trap": {
      if (hasWaterProof(p)) {
        ml.push(`${trap.name}が発動！しかし防具が水を弾いた！(耐水)`);
      } else {
        ml.push(`${trap.name}が発動！水鉄砲を浴びた！`);
        applySoakedStatus(p, ml, 10, "ずぶ濡れになった！(10ターン)");
        applyWaterGunToInventory(p, ml, nameFn);
      }
      break;
    }
    case "rot_trap": {
      const _rAllFoods = (p.inventory || []).filter(i => i.type === "food" && !i.yabai);
      const _rTarget = _rAllFoods.length > 0 ? _rAllFoods[rng(0, _rAllFoods.length - 1)] : null;
      if (_rTarget) {
        const _rOrigName = _rTarget.name;
        const _rResult = rotFood(_rTarget);
        if (_rResult === "yabai") {
          ml.push(`${trap.name}が発動！${_rOrigName}がヤバイことになった！`);
        } else {
          ml.push(`${trap.name}が発動！${_rOrigName}が腐ってしまった！`);
        }
      } else {
        ml.push(`${trap.name}が発動！腐らせるものがなかった。`);
      }
      break;
    }
    case "blowback_trap": {
      const _pfd = p.facing || { dx: 0, dy: 1 };
      const _pbdx = -(_pfd.dx || 0), _pbdy = -(_pfd.dy || 0);
      ml.push(`${trap.name}が発動！向いていた方向と逆に吹き飛ばされた！`);
      if (_pbdx !== 0 || _pbdy !== 0) {
        let _bbHitWall = false, _bbHitMon = null;
        for (let i = 0; i < 10; i++) {
          const _pnx = p.x + _pbdx, _pny = p.y + _pbdy;
          if (_pnx < 0 || _pnx >= MW || _pny < 0 || _pny >= MH ||
              dg.map[_pny][_pnx] === T.WALL || dg.map[_pny][_pnx] === T.BWALL) {
            _bbHitWall = true; break;
          }
          const _bm = monsterAt(dg, _pnx, _pny);
          if (_bm) { _bbHitMon = _bm; break; }
          p.x = _pnx; p.y = _pny;
        }
        if (_bbHitWall) {
          p.deathCause = `${trap.name}による壁への衝突により`;
          p.hp -= 10;
          ml.push("壁に激突！10ダメージ！");
        } else if (_bbHitMon) {
          p.hp -= 10;
          _bbHitMon.hp -= 10;
          ml.push(`${_bbHitMon.name}に激突！お互いに10ダメージ！`);
          if (_bbHitMon.hp <= 0) {
            ml.push(`${_bbHitMon.name}は倒れた！`);
            removeMonster(dg, _bbHitMon);
          }
        } else if ((p.immobileTurns || 0) > 0) {
          /* 実際に移動できた場合、移動封じを解除 */
          p.immobileTurns = 0;
          ml.push("吹き飛ばされて移動封じが解けた！");
        }
        const _btLandTrap = dg.traps.find(t => t !== trap && t.x === p.x && t.y === p.y);
        if (_btLandTrap) fireTrapPlayer(_btLandTrap, p, dg, ml, nameFn, luFn, ctx);
      }
      break;
    }
    case "bone": {
      /* 骨の上を歩いても罠としては発動しない（拾えないアイテム扱い） */
      noBreak = true;
      break;
    }
  }

  const _breakChance = (trap.effect === "steal_trap" || trap.effect === "summon_trap") ? 0.5 : 0.25;
  if (!noBreak && !trap.permanent && Math.random() < _breakChance) {
    removeTrap(dg, trap, ml, { fromStep: true, message: `${trap.name}は壊れた。` });
  }
  return r;
}

