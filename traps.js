import { rng, T, MW, MH, uid, clamp, monsterAt, removeMonster, hasAbility, randomTeleportDest, getDodgePentacleMode } from "./utils.js";
import { ARROW_T, makeArrow, makePoisonArrow, placeItemAt, doExplosion, hasCursedExplosionPentacle, hasRingEffect, doTimeBombExplosion, rotFood, genFood } from "./items.js";
import { MONS, spawnMonsters } from "./monsters.js";

export function fireTrapPlayer(trap, p, dg, ml, nameFn = null, luFn = null) {
  trap.revealed = true;
  let r = null;
  let noBreak = false; /* trueのとき作動後の30%破壊チェックをスキップ */

  switch (trap.effect) {
    case "explode": {
      /* 地雷は敵の移動後に爆発させるため、遅延情報を返す。地雷自身を即除去して二重爆発を防ぐ */
      dg.traps = dg.traps.filter(t => t !== trap);
      noBreak = true;
      r = "deferred_explosion";
      break;
    }
    case "arrow_trap": {
      ml.push(`${trap.name}が発動！`);
      let wx = trap.x;
      while (wx > 0 && dg.map[trap.y][wx - 1] !== T.WALL) wx--;
      wx = Math.max(0, wx - 1);
      let hp = false;
      for (let fx = wx + 1; fx < MW; fx++) {
        if (dg.map[trap.y][fx] === T.WALL) break;
        if (fx === p.x && trap.y === p.y) {
          const _atDodgePc = getDodgePentacleMode(dg, p.x, p.y);
          if (_atDodgePc === "dodge") {
            ml.push("みかわしの魔方陣の加護で矢をかわした！矢が落ちた。");
            hp = true;
            placeItemAt(dg, fx, trap.y, makeArrow(1), ml, new Set([trap.id]));
            break;
          }
          const d = ARROW_T.atk + rng(1, 4);
          p.deathCause = `${trap.name}により`;
          p.hp -= d;
          ml.push(`矢が命中！${d}ダメージ！`);
          hp = true;
          break;
        }
        const m = monsterAt(dg, fx, trap.y);
        if (m) {
          /* reflector：矢をプレイヤー方向（左）へ跳ね返す */
          if (m.subtype === "reflector") {
            ml.push(`矢が${m.name}に弾き返された！`);
            let _atRx = fx, _atRHit = false;
            for (let _atRi = fx - 1; _atRi >= 0; _atRi--) {
              if (dg.map[trap.y][_atRi] === T.WALL || dg.map[trap.y][_atRi] === T.BWALL) break;
              if (_atRi === p.x && trap.y === p.y) { _atRHit = true; break; }
              _atRx = _atRi;
            }
            if (_atRHit) {
              const d = ARROW_T.atk + rng(1, 4);
              p.deathCause = `${trap.name}により`;
              p.hp -= d;
              ml.push(`跳ね返された矢がプレイヤーに命中！${d}ダメージ！`);
            } else {
              placeItemAt(dg, _atRx, trap.y, makeArrow(1), ml, new Set([trap.id]));
            }
            hp = true; break;
          }
          const _atMonDodgePc = getDodgePentacleMode(dg, m.x, m.y);
          if (_atMonDodgePc === "dodge") {
            ml.push(`みかわしの魔方陣の加護で矢が${m.name}に当たらなかった！矢が落ちた。`);
            placeItemAt(dg, fx, trap.y, makeArrow(1), ml, new Set([trap.id]));
          } else {
            const d = ARROW_T.atk + rng(0, 3);
            m.hp -= d;
            ml.push(`矢が${m.name}に命中！${d}ダメージ！`);
            if (m.hp <= 0) {
              ml.push(`${m.name}は倒れた！`);
              dg.monsters = dg.monsters.filter((m2) => m2 !== m);
            }
          }
          hp = true;
          break;
        }
      }
      if (!hp) {
        const ar = makeArrow(1);
        const ft2 = new Set();
        ft2.add(trap.id);
        let ex = trap.x;
        for (let fx = wx + 1; fx < MW; fx++) {
          if (dg.map[trap.y][fx] === T.WALL) break;
          ex = fx;
        }
        placeItemAt(dg, ex, trap.y, ar, ml, ft2);
      }
      break;
    }
    case "pitfall":
      ml.push(`${trap.name}が発動！穴に落ちた！`);
      r = "pitfall";
      break;
    case "rust": {
      const _eq = p.weapon || p.armor;
      if (_eq) {
        const _op = _eq.plus || 0;
        _eq.plus = _op - 1;
        const _fp = (v) => (v > 0 ? `+${v}` : v === 0 ? `無印` : `${v}`);
        ml.push(
          `${trap.name}が発動！${_eq.name}が錆びた！(${_fp(_op)}→${_fp(_eq.plus)})`,
        );
      } else {
        ml.push(`${trap.name}が発動！何も起こらなかった。`);
      }
      break;
    }
    case "spin": {
      const _spinDst = randomTeleportDest(dg, p.x, p.y, (x, y) => !dg.monsters.some(m => m.x === x && m.y === y));
      if (_spinDst) { p.x = _spinDst.x; p.y = _spinDst.y; }
      ml.push(`${trap.name}が発動！吹き飛ばされた！`);
      if ((p.immobileTurns || 0) > 0) { p.immobileTurns = 0; ml.push("吹き飛ばされて移動封じが解けた！"); }
      const _spinLandTrap = dg.traps.find(t => t !== trap && t.x === p.x && t.y === p.y);
      if (_spinLandTrap) fireTrapPlayer(_spinLandTrap, p, dg, ml, nameFn, luFn);
      break;
    }
    case "sleep":
      if (hasAbility(p.armor, "sleep_proof")) {
        ml.push(`${trap.name}が発動！しかし眠れなかった！(耐眠)`);
      } else {
        p.sleepTurns = (p.sleepTurns || 0) + rng(3, 6);
        ml.push(`${trap.name}が発動！眠りに落ちた...(${p.sleepTurns}ターン)`);
      }
      break;
    case "poison_arrow": {
      ml.push(`${trap.name}が発動！`);
      let _pawx = trap.x;
      while (_pawx > 0 && dg.map[trap.y][_pawx - 1] !== T.WALL) _pawx--;
      _pawx = Math.max(0, _pawx - 1);
      let _pahp = false;
      let _paex = trap.x;
      for (let fx = _pawx + 1; fx < MW; fx++) {
        if (dg.map[trap.y][fx] === T.WALL) break;
        if (fx === p.x && trap.y === p.y) {
          const _paDodgePc = getDodgePentacleMode(dg, p.x, p.y);
          if (_paDodgePc === "dodge") {
            ml.push("みかわしの魔方陣の加護で毒矢をかわした！矢が落ちた。");
            placeItemAt(dg, fx, trap.y, makePoisonArrow(1), ml, new Set([trap.id]));
            _pahp = true;
            break;
          }
          const d = ARROW_T.atk + rng(1, 4);
          p.deathCause = `${trap.name}により`;
          p.hp -= d;
          if (hasRingEffect(p, "antidote_ring")) {
            ml.push(`毒矢が命中！${d}ダメージ！しかし指輪が毒を消した！`);
          } else {
            p.poisoned = true;
            ml.push(`毒矢が命中！${d}ダメージ！毒を受けた！`);
          }
          _pahp = true;
          break;
        }
        const m = monsterAt(dg, fx, trap.y);
        if (m) {
          /* reflector：毒矢をプレイヤー方向（左）へ跳ね返す */
          if (m.subtype === "reflector") {
            ml.push(`毒矢が${m.name}に弾き返された！`);
            let _paRx = fx, _paRHit = false;
            for (let _paRi = fx - 1; _paRi >= 0; _paRi--) {
              if (dg.map[trap.y][_paRi] === T.WALL || dg.map[trap.y][_paRi] === T.BWALL) break;
              if (_paRi === p.x && trap.y === p.y) { _paRHit = true; break; }
              _paRx = _paRi;
            }
            if (_paRHit) {
              const d = ARROW_T.atk + rng(1, 4);
              p.deathCause = `${trap.name}により`;
              p.hp -= d;
              if (hasRingEffect(p, "antidote_ring")) {
                ml.push(`跳ね返された毒矢がプレイヤーに命中！${d}ダメージ！しかし指輪が毒を消した！`);
              } else {
                p.poisoned = true;
                ml.push(`跳ね返された毒矢がプレイヤーに命中！${d}ダメージ！毒を受けた！`);
              }
            } else {
              placeItemAt(dg, _paRx, trap.y, makePoisonArrow(1), ml, new Set([trap.id]));
            }
            _pahp = true; break;
          }
          const _paMonDodgePc = getDodgePentacleMode(dg, m.x, m.y);
          if (_paMonDodgePc === "dodge") {
            ml.push(`みかわしの魔方陣の加護で毒矢が${m.name}に当たらなかった！矢が落ちた。`);
            placeItemAt(dg, fx, trap.y, makePoisonArrow(1), ml, new Set([trap.id]));
          } else {
            const d = ARROW_T.atk + rng(0, 3);
            m.hp -= d;
            m.atk = Math.max(1, Math.floor((m.atk || 1) / 2));
            ml.push(`毒矢が${m.name}に命中！${d}ダメージ！攻撃力が半減した！`);
            if (m.hp <= 0) {
              ml.push(`${m.name}は倒れた！`);
              dg.monsters = dg.monsters.filter((m2) => m2 !== m);
            }
          }
          _pahp = true;
          break;
        }
        _paex = fx;
      }
      if (!_pahp) {
        const _par = makePoisonArrow(1);
        const _paft = new Set([trap.id]);
        placeItemAt(dg, _paex, trap.y, _par, ml, _paft);
      }
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
        p.slowTurns = (p.slowTurns || 0) + 10;
        ml.push(`${trap.name}が発動！体が重くなった...(鈍足10ターン)`);
      }
      break;
    }
    case "bewitch_trap": {
      if (hasAbility(p.armor, "bewitch_proof")) {
        ml.push(`${trap.name}が発動！しかし防具が幻惑を防いだ！(耐惑わし)`);
      } else {
        p.bewitchedTurns = (p.bewitchedTurns || 0) + 50;
        ml.push(`${trap.name}が発動！幻惑された！周囲の見た目がおかしくなった！(50ターン)`);
      }
      break;
    }
    case "darkness_trap": {
      if (hasAbility(p.armor, "darkness_proof")) {
        ml.push(`${trap.name}が発動！しかし防具が暗闇を防いだ！(耐暗闇)`);
      } else {
        p.darknessTurns = (p.darknessTurns || 0) + 20;
        ml.push(`${trap.name}が発動！暗闇に包まれた！視界が1マスになる！(20ターン)`);
      }
      break;
    }
    case "seal_trap": {
      if (hasAbility(p.armor, "seal_proof")) {
        ml.push(`${trap.name}が発動！しかし防具が封印を防いだ！(耐封印)`);
      } else {
        p.sealedTurns = (p.sealedTurns || 0) + 50;
        ml.push(`${trap.name}が発動！魔法が封印された！(50ターン)`);
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
        ml.push(`${trap.name}が発動！${nameFn ? nameFn(_stItem) : _stItem.name}がどこかへ飛んでいった！`);
      } else {
        ml.push(`${trap.name}が発動！しかし何も盗まれなかった。`);
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
      p.immobileTurns = (p.immobileTurns || 0) + 5;
      ml.push(`${trap.name}が作動！影に縫い付けられた！(5ターン移動不能)`);
      break;
    }
    case "rockfall": {
      const _rfd = rng(15, 25);
      p.deathCause = `${trap.name}により`;
      p.hp -= _rfd;
      ml.push(`${trap.name}が作動！岩が降ってきた！${_rfd}ダメージ！`);
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
    case "rot_trap": {
      const _rFoods = (p.inventory || []).filter(i => i.type === "food" && !i.rotten);
      if (_rFoods.length > 0) {
        const _rTarget = _rFoods[rng(0, _rFoods.length - 1)];
        const _rOrigName = _rTarget.name;
        rotFood(_rTarget);
        ml.push(`${trap.name}が発動！${_rOrigName}が腐ってしまった！`);
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
        if (_btLandTrap) fireTrapPlayer(_btLandTrap, p, dg, ml, nameFn, luFn);
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
    dg.traps = dg.traps.filter((t) => t !== trap);
    ml.push(`${trap.name}は壊れた。`);
  }
  return r;
}

