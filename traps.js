import { rng, T, MW, MH, uid, clamp, monsterAt, removeMonster } from "./utils.js";
import { ARROW_T, makeArrow, makePoisonArrow, placeItemAt, doExplosion, hasCursedExplosionPentacle } from "./items.js";
import { MONS, spawnMonsters } from "./monsters.js";

export function fireTrapPlayer(trap, p, dg, ml, nameFn = null) {
  trap.revealed = true;
  let r = null;

  switch (trap.effect) {
    case "explode": {
      if (hasCursedExplosionPentacle(dg)) {
        trap.revealed = true;
        ml.push(`${trap.name}が発動したが、呪われた爆発の魔方陣が爆発を打ち消した！`);
        break;
      }
      ml.push(`${trap.name}が発動！`);
      doExplosion(trap.x, trap.y, dg, p, ml, nameFn, trap.name);
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
          const d = ARROW_T.atk + rng(1, 4);
          p.deathCause = `${trap.name}により`;
          p.hp -= d;
          ml.push(`矢が命中！${d}ダメージ！`);
          hp = true;
          break;
        }
        const m = monsterAt(dg, fx, trap.y);
        if (m) {
          const d = ARROW_T.atk + rng(0, 3);
          m.hp -= d;
          ml.push(`矢が${m.name}に命中！${d}ダメージ！`);
          if (m.hp <= 0) {
            ml.push(`${m.name}は倒れた！`);
            dg.monsters = dg.monsters.filter((m2) => m2 !== m);
          }
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
      const rm = dg.rooms[rng(0, dg.rooms.length - 1)];
      p.x = rng(rm.x, rm.x + rm.w - 1);
      p.y = rng(rm.y, rm.y + rm.h - 1);
      ml.push(`${trap.name}が発動！吹き飛ばされた！`);
      break;
    }
    case "sleep":
      if (p.armor?.ability === "sleep_proof") {
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
          const d = ARROW_T.atk + rng(1, 4);
          p.deathCause = `${trap.name}により`;
          p.hp -= d;
          p.poisoned = true;
          ml.push(`毒矢が命中！${d}ダメージ！毒を受けた！`);
          _pahp = true;
          break;
        }
        const m = monsterAt(dg, fx, trap.y);
        if (m) {
          const d = ARROW_T.atk + rng(0, 3);
          m.hp -= d;
          m.atk = Math.max(1, Math.floor((m.atk || 1) / 2));
          ml.push(`毒矢が${m.name}に命中！${d}ダメージ！攻撃力が半減した！`);
          if (m.hp <= 0) {
            ml.push(`${m.name}は倒れた！`);
            dg.monsters = dg.monsters.filter((m2) => m2 !== m);
          }
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
      const _sumSpawned = spawnMonsters(dg, _sumCount, _sumDepth + 1, p.x, p.y, p, { aware: true, immediateAct: true });
      ml.push(`${_sumSpawned}体の敵が現れた！`);
      break;
    }
    case "slow_trap": {
      p.slowTurns = (p.slowTurns || 0) + 10;
      ml.push(`${trap.name}が発動！体が重くなった...(鈍足10ターン)`);
      break;
    }
    case "seal_trap": {
      p.sealedTurns = (p.sealedTurns || 0) + 50;
      ml.push(`${trap.name}が発動！魔法が封印された！(50ターン)`);
      break;
    }
    case "steal_trap": {
      if (p.inventory && p.inventory.length > 0) {
        const _stIdx = rng(0, p.inventory.length - 1);
        const _stItem = p.inventory.splice(_stIdx, 1)[0];
        const _stFt = new Set([trap.id]);
        const _stRoom = dg.rooms[rng(0, dg.rooms.length - 1)];
        const _stX = rng(_stRoom.x, _stRoom.x + _stRoom.w - 1);
        const _stY = rng(_stRoom.y, _stRoom.y + _stRoom.h - 1);
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
        }
      }
      break;
    }
  }

  if (Math.random() < 0.3) {
    dg.traps = dg.traps.filter((t) => t !== trap);
    ml.push(`${trap.name}は壊れた。`);
  }
  return r;
}

