import { rng, pick, uid, MW, MH, T, TI, DRO, removeFloorItem, monsterAt, itemAt, removeMonster } from './utils.js';
import { MONS, monLevelUp, monLevelDown } from './monsters.js';
import {
  killMonster, pushEntity, placeItemAt, scatterPotContents, monsterDrop,
  soakItemIntoSpring, splashPotion, inMagicSealRoom, inCursedMagicSealRoom,
  getFarcastMode, ITEMS, WANDS, BB_TYPES, TRAPS, isStatusImmune, weakenOrClearParalysis,
  chargeShopItem, burnFoodItem, applyLightningToInventory, wallBreakDrop,
} from './items.js';
import { fireTrapPlayer, fireTrapMonster } from './traps.js';

export function applyWandEffect(eff, kind, target, dx, dy, dg, p, ml, luFn, bbFn, blMult = 1, nameFn = null, collisionAtk = 0) {
  /* 地面のアイテムは未識別名で表示するため、呼び出し元から nameFn を受け取る */
  const _dname_item = (t) => (nameFn && kind === "item") ? nameFn(t) : t.name;
  /* ── big box pre-handler ── */
  if (kind === "bigbox") {
    if (eff === "swap") {
      if (blMult < 1) {
        // 呪い：プレイヤーが大箱の1マス手前に引き寄せられる
        const _lpx = target.x - dx, _lpy = target.y - dy;
        if (_lpx >= 0 && _lpx < MW && _lpy >= 0 && _lpy < MH &&
            dg.map[_lpy][_lpx] !== T.WALL && dg.map[_lpy][_lpx] !== T.BWALL &&
            !dg.monsters.some(m => m.x === _lpx && m.y === _lpy)) {
          p.x = _lpx; p.y = _lpy;
          ml.push(`${target.name}に引き寄せられた！`);
        } else {
          ml.push("引き寄せられなかった。");
        }
        return;
      }
      const [ox, oy] = [p.x, p.y];
      p.x = target.x; p.y = target.y;
      target.x = ox;  target.y = oy;
      ml.push(`${target.name}と位置が入れ替わった！`);
      return;
    }
    if (eff === "warp") {
      if (blMult < 1) {
        // 呪い：振った方向に1マス移動（障害物があれば失敗）
        const _w1x = target.x + dx, _w1y = target.y + dy;
        if (_w1x >= 0 && _w1x < MW && _w1y >= 0 && _w1y < MH &&
            dg.map[_w1y][_w1x] !== T.WALL && dg.map[_w1y][_w1x] !== T.BWALL &&
            dg.map[_w1y][_w1x] !== T.SD && dg.map[_w1y][_w1x] !== T.SU &&
            !dg.bigboxes?.some(b => b !== target && b.x === _w1x && b.y === _w1y) &&
            !dg.monsters.some(m => m.x === _w1x && m.y === _w1y) &&
            !dg.items.some(i => i.x === _w1x && i.y === _w1y) &&
            !dg.traps.some(t => t.x === _w1x && t.y === _w1y) &&
            !dg.springs?.some(s => s.x === _w1x && s.y === _w1y) &&
            !dg.pentacles?.some(pc => pc.x === _w1x && pc.y === _w1y)) {
          target.x = _w1x; target.y = _w1y;
          ml.push(`${target.name}が少し動いた。`);
        } else {
          ml.push(`${target.name}は動けなかった。`);
        }
        return;
      }
      if (blMult > 1) {
        // 祝福：下り階段の隣の空きマスへ
        let _stx = -1, _sty = -1;
        for (let fy = 0; fy < MH; fy++)
          for (let fx = 0; fx < MW; fx++)
            if (dg.map[fy][fx] === T.SD) { _stx = fx; _sty = fy; }
        if (_stx >= 0) {
          const _bbAdj = [];
          for (const [_ax, _ay] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]) {
            const _nx = _stx + _ax, _ny = _sty + _ay;
            if (_nx >= 0 && _nx < MW && _ny >= 0 && _ny < MH && dg.map[_ny][_nx] === T.FLOOR &&
                !dg.bigboxes?.some(b => b.x === _nx && b.y === _ny) &&
                !dg.monsters.some(m => m.x === _nx && m.y === _ny) &&
                !dg.items.some(i => i.x === _nx && i.y === _ny) &&
                !dg.traps.some(t => t.x === _nx && t.y === _ny) &&
                !dg.springs?.some(s => s.x === _nx && s.y === _ny) &&
                !dg.pentacles?.some(pc => pc.x === _nx && pc.y === _ny))
              _bbAdj.push({ x: _nx, y: _ny });
          }
          if (_bbAdj.length > 0) {
            const _bd = pick(_bbAdj);
            target.x = _bd.x; target.y = _bd.y;
            ml.push(`${target.name}は階段の隣にテレポートした！【祝】`);
          } else {
            // 隣に空きがない場合はランダムテレポート（以下の通常処理へ fall-through しない）
            const _wbf2 = [];
            for (let fy = 0; fy < MH; fy++)
              for (let fx = 0; fx < MW; fx++)
                if (dg.map[fy][fx] === T.FLOOR &&
                    !dg.bigboxes?.find(b => b.x === fx && b.y === fy) &&
                    !monsterAt(dg, fx, fy) &&
                    !dg.items.some(i => i.x === fx && i.y === fy) &&
                    !dg.traps.some(t => t.x === fx && t.y === fy) &&
                    !dg.springs?.some(s => s.x === fx && s.y === fy) &&
                    !dg.pentacles?.some(pc => pc.x === fx && pc.y === fy))
                  _wbf2.push({ x:fx, y:fy });
            if (_wbf2.length > 0) {
              const _wbd2 = pick(_wbf2);
              target.x = _wbd2.x; target.y = _wbd2.y;
              ml.push(`${target.name}はどこかへテレポートした！`);
            } else {
              ml.push("テレポートに失敗した。");
            }
          }
        } else {
          ml.push("テレポートに失敗した。");
        }
        return;
      }
      const wbf = [];
      for (let fy = 0; fy < MH; fy++)
        for (let fx = 0; fx < MW; fx++)
          if (dg.map[fy][fx] === T.FLOOR &&
              !dg.bigboxes?.find(b => b.x === fx && b.y === fy) &&
              !monsterAt(dg, fx, fy) &&
              !dg.items.some(i => i.x === fx && i.y === fy) &&
              !dg.traps.some(t => t.x === fx && t.y === fy) &&
              !dg.springs?.some(s => s.x === fx && s.y === fy) &&
              !dg.pentacles?.some(pc => pc.x === fx && pc.y === fy))
            wbf.push({ x:fx, y:fy });
      if (wbf.length > 0) {
        const wbd = pick(wbf);
        target.x = wbd.x; target.y = wbd.y;
        ml.push(`${target.name}はどこかへテレポートした！`);
      } else {
        ml.push("テレポートに失敗した。");
      }
      return;
    }
    if (eff === "knockback") {
      let bbx = target.x, bby = target.y, bbroke = false;
      for (let i = 0; i < 5; i++) {
        const nx = bbx + dx, ny = bby + dy;
        if (nx < 0 || nx >= MW || ny < 0 || ny >= MH || dg.map[ny][nx] === T.WALL || dg.map[ny][nx] === T.BWALL) {
          bbroke = true; break;
        }
        // アイテム・罠・泉・魔方陣・階段と重ならないよう手前で止まる
        if (dg.map[ny][nx] === T.SD || dg.map[ny][nx] === T.SU ||
            dg.items.some(i => i.x === nx && i.y === ny) ||
            dg.traps.some(t => t.x === nx && t.y === ny) ||
            dg.springs?.some(s => s.x === nx && s.y === ny) ||
            dg.pentacles?.some(pc => pc.x === nx && pc.y === ny)) break;
        bbx = nx; bby = ny;
      }
      if (bbroke) {
        dg.bigboxes = dg.bigboxes?.filter(b => b !== target);
        if (target.contents?.length > 0) {
          const fts = new Set();
          for (const ci of target.contents) placeItemAt(dg, bbx, bby, ci, ml, fts);
          ml.push(`${target.name}は壁に叩きつけられて壊れた！中身が飛び出した！`);
        } else {
          ml.push(`${target.name}は壁に叩きつけられて壊れた！`);
        }
      } else {
        target.x = bbx; target.y = bby;
        ml.push(`${target.name}が吹き飛んだ！`);
      }
      return;
    }
    if (eff === "leap") {
      if (blMult < 1) {
        // 呪い：大箱をランダムワープ
        const _lbf = [];
        for (let fy = 0; fy < MH; fy++)
          for (let fx = 0; fx < MW; fx++)
            if (dg.map[fy][fx] === T.FLOOR &&
                !dg.bigboxes?.some(b => b.x === fx && b.y === fy) &&
                !dg.monsters.some(m => m.x === fx && m.y === fy) &&
                !dg.items.some(i => i.x === fx && i.y === fy) &&
                !dg.traps.some(t => t.x === fx && t.y === fy) &&
                !dg.springs?.some(s => s.x === fx && s.y === fy) &&
                !dg.pentacles?.some(pc => pc.x === fx && pc.y === fy))
              _lbf.push({ x:fx, y:fy });
        if (_lbf.length > 0) {
          const _lbd = pick(_lbf);
          target.x = _lbd.x; target.y = _lbd.y;
          ml.push(`${target.name}はどこかへランダムにテレポートした！【呪】`);
        } else {
          ml.push("テレポートに失敗した。");
        }
      } else {
        // 通常/祝福：大箱の1マス手前に飛びつく
        const _lpx = target.x - dx, _lpy = target.y - dy;
        if ((dx !== 0 || dy !== 0) && _lpx >= 0 && _lpx < MW && _lpy >= 0 && _lpy < MH &&
            dg.map[_lpy][_lpx] !== T.WALL && dg.map[_lpy][_lpx] !== T.BWALL &&
            !(_lpx === p.x && _lpy === p.y)) {
          p.x = _lpx; p.y = _lpy;
          ml.push(`${target.name}の前に飛びついた！`);
        } else {
          ml.push("飛びつけなかった。");
        }
      }
      return;
    }
    if (eff === "slow" || eff === "paralyze" || eff === "sleep") {
      ml.push("効果がなかった。");
      return;
    }
    if (eff === "transform") {
      const others = BB_TYPES.filter(t => t.kind !== target.kind);
      const nt = pick(others);
      const oldName = target.name;
      target.kind = nt.kind;
      target.name = nt.name;
      target.capacity = nt.cap();
      ml.push(`${oldName}は${target.name}に変化した！`);
      return;
    }
    if (eff === "bless_wand") {
      const _bwBlessed = blMult > 1, _bwCursed = blMult < 1;
      if (_bwCursed) {
        const _newCap = Math.max(0, (target.capacity || 1) - 1);
        if ((target.contents?.length || 0) > _newCap) {
          const _fts = new Set();
          for (const _ci of (target.contents || [])) placeItemAt(dg, target.x, target.y, _ci, ml, _fts);
          dg.bigboxes = dg.bigboxes?.filter(b => b !== target);
          ml.push(`${target.name}が呪いで壊れた！中身が飛び出した！【呪】`);
        } else {
          target.capacity = _newCap;
          ml.push(`${target.name}が呪われた！(容量-1 → ${target.capacity})【呪】`);
        }
      } else {
        const _gain = _bwBlessed ? 2 : 1;
        target.capacity = (target.capacity || 0) + _gain;
        ml.push(`${target.name}が祝福された！(容量+${_gain} → ${target.capacity})${_bwBlessed ? "【祝】" : ""}`);
      }
      return;
    }
    if (eff === "curse_wand") {
      const _cwBlessed = blMult > 1, _cwCursed = blMult < 1;
      if (_cwCursed) {
        target.capacity = (target.capacity || 0) + 1;
        ml.push(`${target.name}が祝福された！(容量+1 → ${target.capacity})【呪→祝】`);
      } else {
        const _loss = _cwBlessed ? 2 : 1;
        const _newCap = Math.max(0, (target.capacity || 1) - _loss);
        if ((target.contents?.length || 0) > _newCap) {
          const _fts = new Set();
          for (const _ci of (target.contents || [])) placeItemAt(dg, target.x, target.y, _ci, ml, _fts);
          dg.bigboxes = dg.bigboxes?.filter(b => b !== target);
          ml.push(`${target.name}が呪いで壊れた！中身が飛び出した！${_cwBlessed ? "【祝】" : ""}`);
        } else {
          target.capacity = _newCap;
          ml.push(`${target.name}が呪われた！(容量-${_loss} → ${target.capacity})${_cwBlessed ? "【祝】" : ""}`);
        }
      }
      return;
    }
    /* default: break and scatter (dig, lightning, etc.) */
    dg.bigboxes = dg.bigboxes?.filter(b => b !== target);
    if (target.contents?.length > 0) {
      const fts = new Set();
      for (const ci of target.contents) placeItemAt(dg, target.x, target.y, ci, ml, fts);
      ml.push(`${target.name}が壊れて中身が飛び出した！`);
    } else {
      ml.push(`${target.name}が壊れた！`);
    }
    return;
  }

  /* any wand bolt hitting a monster weakens/clears its paralysis */
  if (kind === "monster") weakenOrClearParalysis(target, ml);

  switch (eff) {
    case "knockback": {
      const _blessed = blMult > 1, _cursed = blMult < 1;
      if (_cursed) {
        /* 呪い：引き寄せ（方向を逆にして目の前まで引っ張る） */
        if (kind === "monster") {
          const _pullX = p.x + dx, _pullY = p.y + dy;
          if (_pullX >= 0 && _pullX < MW && _pullY >= 0 && _pullY < MH &&
              dg.map[_pullY][_pullX] !== T.WALL && dg.map[_pullY][_pullX] !== T.BWALL &&
              !dg.monsters.some(m2 => m2 !== target && m2.x === _pullX && m2.y === _pullY)) {
            target.x = _pullX; target.y = _pullY;
            ml.push(`${target.name}を引き寄せた！`);
          } else {
            ml.push(`${target.name}を引き寄せようとしたが失敗した。`);
          }
          break;
        }
        if (kind === "player") {
          ml.push("引き寄せの力が自分に！");
          break;
        }
        if (kind === "item") {
          /* アイテムを目の前に引き寄せる */
          const _pullIx = p.x + dx, _pullIy = p.y + dy;
          if (_pullIx >= 0 && _pullIx < MW && _pullIy >= 0 && _pullIy < MH && dg.map[_pullIy][_pullIx] !== T.WALL && dg.map[_pullIy][_pullIx] !== T.BWALL) {
            removeFloorItem(dg, target);
            const ft = new Set();
            placeItemAt(dg, _pullIx, _pullIy, target, ml, ft);
            ml.push(`${target.name}を引き寄せた！`);
          }
          break;
        }
        break;
      }
      const d = _blessed ? 50 : 5; /* 祝福：壁まで飛ばす */
      const _kbDmgBase = _blessed ? 10 : 5; /* 祝福：ダメ2倍 */
      if (kind === "monster") {
        const _kbDmg = _kbDmgBase;
        ml.push(`${target.name}は吹き飛ばされた！`);
        target.hp -= _kbDmg;
        pushEntity(dg, target.x, target.y, dx, dy, d, ml, "monster", target, p, luFn, collisionAtk);
        /* 聖域の上に強制移動した敵は即死（壁激突によるHP0チェックより先に判定） */
        if (dg.monsters.includes(target) &&
            dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === target.x && pc.y === target.y)) {
          ml.push(`${target.name}は聖域に吹き飛ばされ消滅した！(+${target.exp}exp)`);
          p.exp += target.exp;
          monsterDrop(target, dg, ml, p);
          removeMonster(dg, target);
          luFn(p, ml);
        } else if (target.hp <= 0) {
          killMonster(target, dg, p, ml, luFn);
        }
        break;
      }
      if (kind === "player") {
        ml.push("自分が吹き飛ばされた！");
        p.hp -= _kbDmgBase;
        pushEntity(dg, p.x, p.y, dx, dy, d, ml, "player", p, p, luFn, collisionAtk);
        break;
      }
      if (kind === "item") {
        ml.push(`${target.name}が吹き飛んだ！`);
        removeFloorItem(dg, target);
        const res = pushEntity(dg, target.x, target.y, dx, dy, d, ml, "item", target, p, luFn);
        if (target.shopPrice) {
          const _allShopsW = dg.shops || (dg.shop ? [dg.shop] : []);
          const _iShopW = _allShopsW.find(s => s.id === target._shopId) || _allShopsW.find(s => s.unpaidTotal > 0);
          if (_iShopW) {
            const r = _iShopW.room;
            const inShop = res.x >= r.x && res.x < r.x + r.w && res.y >= r.y && res.y < r.y + r.h;
            if (!inShop) chargeShopItem(target, dg, ml);
          }
        }
        if (res.spring) {
          soakItemIntoSpring(res.spring, target, ml, dg);
        } else if (res.bigbox) {
          if (bbFn) bbFn(res.bigbox, target, dg, ml);
          else { const ft = new Set(); placeItemAt(dg, res.x, res.y, target, ml, ft); }
        } else if (target.type === "potion") {
          splashPotion(dg, res.x, res.y, target.effect, target.value || 0, p, ml, luFn, target.blessed || false, target.cursed || false);
        } else if (target.type === "pot") {
          scatterPotContents(target, dg, res.x, res.y, p, ml, luFn);
        } else if (!res.consumed) {
          const ft = new Set();
          placeItemAt(dg, res.x, res.y, target, ml, ft);
        }
        break;
      }
      if (kind === "trap") {
        ml.push(`${target.name}が吹き飛んだ！`);
        const _trapRes = pushEntity(dg, target.x, target.y, dx, dy, d, ml, "trap", target, p, luFn);
        if (_trapRes.hitPlayer) {
          ml.push(`飛んできた${target.name}がプレイヤーに命中！`);
          fireTrapPlayer(target, p, dg, ml, nameFn);
          dg.traps = dg.traps.filter(t => t !== target);
        } else if (_trapRes.hitMonster) {
          ml.push(`飛んできた${target.name}が${_trapRes.hitMonster.name}に命中！`);
          fireTrapMonster(target, _trapRes.hitMonster, dg, ml);
          dg.traps = dg.traps.filter(t => t !== target);
        }
        break;
      }
      break;
    }
    case "lightning": {
      const _lCursed = blMult < 1;
      if (_lCursed) {
        /* 呪い：25回復 */
        if (kind === "monster") {
          const _lheal = Math.min(25, target.maxHp - target.hp);
          if (_lheal > 0) { target.hp += _lheal; ml.push(`${target.name}のHPが${_lheal}回復した！`); }
          else ml.push(`${target.name}には効果がなかった。`);
          break;
        }
        if (kind === "player") {
          const _lheal = Math.min(25, p.maxHp - p.hp);
          if (_lheal > 0) { p.hp += _lheal; ml.push(`癒しの光に包まれた！HP+${_lheal}`); }
          else ml.push("HPは既に満タンだ。");
          break;
        }
      }
      /* 祝福：ダメ2倍 (blMult=1.5→×2にオーバーライド) */
      const _lBlessMult = blMult > 1 ? 2 : 1;
      let dmg = Math.max(1, Math.round(rng(15, 25) * _lBlessMult));
      if (kind === "monster" && inCursedMagicSealRoom(target.x, target.y, dg)) dmg *= 2;
      if (kind === "monster") {
        target.hp -= dmg;
        ml.push(`雷撃が${target.name}に命中！${dmg}ダメージ！`);
        if (target.hp <= 0) killMonster(target, dg, p, ml, luFn);
        break;
      }
      if (kind === "player") {
        if (inCursedMagicSealRoom(p.x, p.y, dg)) dmg *= 2;
        p.deathCause = "雷の杖の魔法により";
        p.hp -= dmg;
        ml.push(`雷撃が自分に命中！${dmg}ダメージ！`);
        applyLightningToInventory(p, dg, ml, luFn, nameFn);
        break;
      }
      if (kind === "item") {
        if (target.type === "potion" || target.type === "scroll" || target.type === "spellbook") {
          removeFloorItem(dg, target);
          chargeShopItem(target, dg, ml);
          ml.push(`${target.name}は雷で焼けた！`);
        } else if (target.type === "pot") {
          removeFloorItem(dg, target);
          chargeShopItem(target, dg, ml);
          ml.push(`雷撃で${_dname_item(target)}が割れた！`);
          scatterPotContents(target, dg, target.x, target.y, p, ml, luFn, nameFn);
        } else if (target.type === "bottle") {
          removeFloorItem(dg, target);
          chargeShopItem(target, dg, ml);
          ml.push(`${target.name}が雷撃で砕けた！`);
        } else if (target.type === "food") {
          if (!target.cooked) {
            target.value *= 2;
            target.cooked = true;
            target.name = "焼いた" + target.name;
            ml.push(`${target.name}になった！`);
          } else {
            burnFoodItem(target, ml);
          }
        } else {
          ml.push(`雷撃が${target.name}に落ちた！`);
        }
        break;
      }
      if (kind === "trap") {
        dg.traps = dg.traps.filter(t => t !== target);
        ml.push(`雷撃で${target.name}が破壊された！`);
        break;
      }
      break;
    }
    case "slow": {
      const _sBless = blMult > 1, _sCurse = blMult < 1;
      if (_sCurse) {
        /* 呪い：2倍速にする */
        if (kind === "monster") {
          target.speed = Math.min(4, target.speed * 2);
          ml.push(`${target.name}は2倍速になった！`);
          break;
        }
        if (kind === "player") {
          p.hasteTurns = (p.hasteTurns || 0) + 10;
          ml.push("体が軽くなった！(2倍速10ターン)");
          break;
        }
      } else {
        if (kind === "monster") {
          if (isStatusImmune(target, ml, target.name)) break;
          target.speed = Math.max(0.25, target.speed * 0.5);
          ml.push(`${target.name}は鈍足になった！`);
          if (_sBless) {
            /* 祝福：金縛りも追加 */
            target.paralyzed = true;
            ml.push(`さらに${target.name}は金縛りになった！`);
          }
          break;
        }
        if (kind === "player") {
          if (isStatusImmune(p, ml)) break;
          p.slowTurns = (p.slowTurns || 0) + 10;
          ml.push("体が重くなった...(鈍足10ターン)");
          if (_sBless) {
            p.paralyzeTurns = Math.max(p.paralyzeTurns || 0, 10);
            ml.push("さらに金縛りになった！(10ターン)");
          }
          break;
        }
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
    case "transform": {
      if (kind === "monster") {
        const nt = pick(MONS);
        ml.push(`${target.name}は${nt.name}に変化した！`);
        const ox = target.x, oy = target.y;
        Object.assign(target, { ...nt, id:target.id, x:ox, y:oy, maxHp:nt.hp,
          turnAccum:0, aware:target.aware, dir:target.dir,
          lastPx:target.lastPx, lastPy:target.lastPy,
          subtype:nt.subtype, wandEffect:nt.wandEffect, wallWalker:nt.wallWalker });
        break;
      }
      if (kind === "player") {
        const h = rng(-10, 10);
        p.hp += h;
        ml.push(h >= 0 ? `体に変化が...HP+${h}` : `体に異変が...HP${h}`);
        break;
      }
      if (kind === "item") {
        const nt = ITEMS[rng(0, ITEMS.length - 2)];
        const ox = target.x, oy = target.y;
        removeFloorItem(dg, target);
        chargeShopItem(target, dg, ml);
        const ni = { ...nt, id:uid(), x:ox, y:oy };
        if (ni.type === "gold") ni.value = rng(5, 50);
        dg.items.push(ni);
        ml.push(`${_dname_item(target)}は${nameFn ? nameFn(ni) : ni.name}に変化した！`);
        break;
      }
      if (kind === "trap") {
        const nt = pick(TRAPS);
        ml.push(`${target.name}は${nt.name}に変化した！`);
        Object.assign(target, { ...nt, id:target.id, x:target.x, y:target.y, revealed:true });
        break;
      }
      break;
    }
    case "swap": {
      const _swBless = blMult > 1, _swCurse = blMult < 1;
      if (_swCurse) {
        /* 呪い：飛びつきの杖と同じ効果（fireWandBolt内のleap処理で対応不可なのでここで実装） */
        /* 対象の1マス手前に移動 */
        if (kind === "monster") {
          const _leapX = target.x - dx, _leapY = target.y - dy;
          if (_leapX >= 0 && _leapX < MW && _leapY >= 0 && _leapY < MH &&
              dg.map[_leapY][_leapX] !== T.WALL && dg.map[_leapY][_leapX] !== T.BWALL &&
              !dg.monsters.some(m2 => m2 !== target && m2.x === _leapX && m2.y === _leapY) &&
              !(_leapX === p.x && _leapY === p.y)) {
            p.x = _leapX; p.y = _leapY;
            ml.push(`${target.name}の前に飛びついた！`);
          } else {
            ml.push("飛びつけなかった。");
          }
        } else if (kind === "item" || kind === "trap") {
          const _leapX = target.x - dx, _leapY = target.y - dy;
          if (_leapX >= 0 && _leapX < MW && _leapY >= 0 && _leapY < MH && dg.map[_leapY][_leapX] !== T.WALL && dg.map[_leapY][_leapX] !== T.BWALL) {
            p.x = _leapX; p.y = _leapY;
            ml.push(`${target.name}の前に飛びついた！`);
          }
        }
        break;
      }
      if (kind === "monster") {
        const [ox, oy] = [p.x, p.y];
        p.x = target.x; p.y = target.y;
        target.x = ox;  target.y = oy;
        ml.push(`${target.name}と位置が入れ替わった！`);
        /* 聖域の上に強制移動した敵は即死 */
        if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === target.x && pc.y === target.y)) {
          ml.push(`${target.name}は聖域に踏み込み消滅した！(+${target.exp}exp)`);
          p.exp += target.exp;
          monsterDrop(target, dg, ml, p);
          removeMonster(dg, target);
          luFn(p, ml);
        } else if (_swBless) {
          /* 祝福：入れ替わった先で金縛り */
          target.paralyzed = true;
          ml.push(`${target.name}は金縛りになった！`);
        }
        break;
      }
      if (kind === "player") { ml.push("何も起こらなかった。"); break; }
      if (kind === "item" || kind === "trap") {
        const [ox, oy] = [p.x, p.y];
        ml.push(`${target.name}と位置が入れ替わった！`);
        p.x = target.x; p.y = target.y;
        target.x = ox;  target.y = oy;
        break;
      }
      break;
    }
    case "dig": {
      const _digBlessMult = blMult > 1 ? 2 : 1; /* 祝福：ダメージ2倍 */
      let dmg = Math.max(1, Math.round(rng(10, 18) * _digBlessMult));
      if (kind === "monster") {
        if (inCursedMagicSealRoom(target.x, target.y, dg)) dmg *= 2;
        target.hp -= dmg;
        ml.push(`穴掘りの魔法弾が${target.name}に命中！${dmg}ダメージ！`);
        if (target.hp <= 0) killMonster(target, dg, p, ml, luFn);
      }
      if (kind === "player") {
        if (inCursedMagicSealRoom(p.x, p.y, dg)) dmg *= 2;
        p.deathCause = "穴掘りの魔法弾により";
        p.hp -= dmg;
        ml.push(`穴掘りの魔法弾が自分に命中！${dmg}ダメージ！`);
      }
      if (kind === "item") {
        removeFloorItem(dg, target);
        chargeShopItem(target, dg, ml);
        if (target.type === "pot") {
          if (target.contents && target.contents.length > 0) {
            const ft = new Set();
            for (const ci of target.contents) placeItemAt(dg, target.x, target.y, ci, ml, ft);
            ml.push(`${target.name}が壊れて中身が飛び出した！`);
          } else {
            ml.push(`${target.name}は壊れた！`);
          }
        } else {
          ml.push(`${target.name}は破壊された！`);
        }
      }
      if (kind === "trap") {
        dg.traps = dg.traps.filter(t => t !== target);
        ml.push(`穴掘りの魔法弾で${target.name}が壊れた！`);
      }
      break;
    }
    case "leap": {
      if (blMult < 1) {
        // 呪い：対象をランダムワープ
        const _lpf = [];
        for (let ly = 0; ly < MH; ly++)
          for (let lx = 0; lx < MW; lx++)
            if (dg.map[ly][lx] === T.FLOOR && !dg.monsters.some(m => m.x === lx && m.y === ly))
              _lpf.push({ x:lx, y:ly });
        if (_lpf.length === 0) { ml.push("テレポートに失敗した。"); break; }
        const _lpd = pick(_lpf);
        if (kind === "monster") { target.x = _lpd.x; target.y = _lpd.y; ml.push(`${target.name}はどこかへテレポートした！【呪】`); }
        else if (kind === "item") { target.x = _lpd.x; target.y = _lpd.y; ml.push(`${_dname_item(target)}はどこかへ飛んだ！【呪】`); }
        else if (kind === "trap") { target.x = _lpd.x; target.y = _lpd.y; ml.push(`${target.name}はどこかへ飛んだ！【呪】`); }
        else if (kind === "player") { p.x = _lpd.x; p.y = _lpd.y; ml.push("ランダムにテレポートした！【呪】"); }
      }
      break;
    }
    case "warp": {
      const _wCursed = blMult < 1, _wBlessed = blMult > 1;
      if (_wCursed) {
        /* 呪い：1マスだけテレポート（振った方向に1歩移動） */
        const _w1x = (kind === "monster" ? target.x : p.x) + dx;
        const _w1y = (kind === "monster" ? target.y : p.y) + dy;
        if (_w1x >= 0 && _w1x < MW && _w1y >= 0 && _w1y < MH &&
            dg.map[_w1y][_w1x] !== T.WALL && dg.map[_w1y][_w1x] !== T.BWALL &&
            !dg.monsters.some(m => m.x === _w1x && m.y === _w1y) &&
            !(kind === "monster" && p.x === _w1x && p.y === _w1y)) {
          if (kind === "monster") { target.x = _w1x; target.y = _w1y; ml.push(`${target.name}が少しだけテレポートした。`); }
          else if (kind === "player") { p.x = _w1x; p.y = _w1y; ml.push("少しだけテレポートした。"); }
          else if (kind === "item") { target.x = _w1x; target.y = _w1y; ml.push(`${target.name}が少し移動した。`); }
          else if (kind === "trap") { target.x = _w1x; target.y = _w1y; ml.push(`${target.name}が少し移動した。`); }
        } else {
          ml.push("テレポートに失敗した。");
        }
        break;
      }
      if (_wBlessed) {
        /* 祝福：下り階段の位置にテレポート＋金縛り */
        let stairsX = -1, stairsY = -1;
        for (let fy = 0; fy < MH; fy++)
          for (let fx = 0; fx < MW; fx++)
            if (dg.map[fy][fx] === T.SD) { stairsX = fx; stairsY = fy; }
        if (stairsX >= 0) {
          if (kind === "monster") {
            target.x = stairsX; target.y = stairsY;
            target.paralyzed = true;
            ml.push(`${target.name}は階段の上にテレポートし、金縛りになった！`);
          } else if (kind === "player") {
            p.x = stairsX; p.y = stairsY;
            p.paralyzeTurns = 10;
            ml.push("階段の上にテレポートした！しかし金縛りになった！(10ターン)");
          } else if (kind === "item" || kind === "trap") {
            // 下り階段の隣の空きマスへ
            const _wbAdj = [];
            for (const [_ax, _ay] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]) {
              const _nx = stairsX + _ax, _ny = stairsY + _ay;
              if (_nx >= 0 && _nx < MW && _ny >= 0 && _ny < MH && dg.map[_ny][_nx] === T.FLOOR &&
                  !dg.bigboxes?.some(b => b.x === _nx && b.y === _ny) &&
                  !dg.monsters.some(m => m.x === _nx && m.y === _ny) &&
                  !dg.items.some(i => i !== target && i.x === _nx && i.y === _ny) &&
                  !dg.traps.some(t => t !== target && t.x === _nx && t.y === _ny) &&
                  !dg.springs?.some(s => s.x === _nx && s.y === _ny) &&
                  !dg.pentacles?.some(pc => pc.x === _nx && pc.y === _ny))
                _wbAdj.push({ x: _nx, y: _ny });
            }
            if (_wbAdj.length > 0) {
              const _wd = pick(_wbAdj);
              target.x = _wd.x; target.y = _wd.y;
              ml.push(`${target.name}は階段の隣に飛んだ！`);
            } else {
              // 隣に空きがない場合はランダムテレポート
              const _wf = [];
              for (let fy = 0; fy < MH; fy++)
                for (let fx = 0; fx < MW; fx++)
                  if (dg.map[fy][fx] === T.FLOOR && !monsterAt(dg, fx, fy))
                    _wf.push({ x:fx, y:fy });
              if (_wf.length > 0) {
                const _wd2 = pick(_wf);
                target.x = _wd2.x; target.y = _wd2.y;
                ml.push(`${target.name}はどこかへ飛んだ！`);
              }
            }
          }
        } else {
          ml.push("テレポートに失敗した。");
        }
        break;
      }
      /* 通常テレポート */
      const floors = [];
      for (let fy = 0; fy < MH; fy++)
        for (let fx = 0; fx < MW; fx++)
          if (dg.map[fy][fx] === T.FLOOR && !monsterAt(dg, fx, fy))
            floors.push({ x:fx, y:fy });
      if (floors.length === 0) { ml.push("テレポートに失敗した。"); break; }
      const dest = pick(floors);
      if (kind === "monster") { target.x = dest.x; target.y = dest.y; ml.push(`${target.name}はどこかへテレポートした！`); }
      if (kind === "player")  { p.x = dest.x; p.y = dest.y; ml.push("テレポートした！"); }
      if (kind === "item")    { target.x = dest.x; target.y = dest.y; ml.push(`${target.name}はどこかへ飛んだ！`); }
      if (kind === "trap")    { target.x = dest.x; target.y = dest.y; ml.push(`${target.name}はどこかへ飛んだ！`); }
      break;
    }
    case "paralyze": {
      const _pzBlessed = blMult > 1, _pzCursed = blMult < 1;
      if (_pzCursed) {
        // 呪い→対象が状態異常防止状態200ターン
        if (kind === "monster") { target.statusImmune = (target.statusImmune || 0) + 200; ml.push(`${target.name}は状態異常を防ぐ力を得た！(200ターン)【呪】`); break; }
        if (kind === "player")  { p.statusImmune = (p.statusImmune || 0) + 200; ml.push("状態異常を防ぐ力が宿った！(200ターン)【呪→状態防止】"); break; }
        ml.push("魔法弾は効果なく消えた。"); break;
      }
      if (kind === "monster") {
        if (isStatusImmune(target, ml, target.name)) break;
        target.paralyzed = true;
        if (_pzBlessed) { target.paralyzeHits = 2; ml.push(`${target.name}は強い金縛りになった！2回アクションが必要！`); }
        else ml.push(`${target.name}は金縛りになった！動けない！`);
        break;
      }
      if (kind === "player") {
        if (isStatusImmune(p, ml)) break;
        p.paralyzeTurns = _pzBlessed ? 20 : 10;
        ml.push(`金縛りになった！(${p.paralyzeTurns}ターン)${_pzBlessed ? "(強金縛り)" : ""}`);
        break;
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
    case "sleep": {
      const st = rng(3, 6);
      if (kind === "monster") {
        if (isStatusImmune(target, ml, target.name)) break;
        target.sleepTurns = (target.sleepTurns || 0) + st;
        ml.push(`${target.name}は眠りに落ちた！(${st}ターン)`);
        break;
      }
      if (kind === "player") {
        if ((p.statusImmune || 0) > 0) { ml.push("状態防止中のため眠れなかった！"); break; }
        if (p.armor?.ability === "sleep_proof") {
          ml.push("しかし眠れなかった！(耐眠)");
        } else {
          p.sleepTurns = (p.sleepTurns || 0) + st;
          ml.push(`眠りに落ちた...(${st}ターン)`);
        }
        break;
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
    case "bless_wand": {
      const _bwBlessed = blMult > 1;
      const _bwCursed  = blMult < 1;
      if (kind === "item") {
        if (_bwCursed) {
          // 呪われた祝福の杖→落ちてるアイテムを呪う
          if (target.type === "pot") {
            const _newCap = Math.max(0, (target.capacity || 1) - 1);
            if ((target.contents?.length || 0) > _newCap) {
              removeFloorItem(dg, target);
              const _fts = new Set();
              for (const _ci of (target.contents || [])) placeItemAt(dg, target.x, target.y, _ci, ml, _fts);
              ml.push(`${_dname_item(target)}が呪いで割れた！中身が飛び出した！`);
            } else {
              target.capacity = _newCap;
              ml.push(`${_dname_item(target)}が呪いで容量が減った！(容量-1 → ${target.capacity})【呪】`);
            }
          } else {
            target.cursed = true; target.blessed = false; target.bcKnown = true;
            ml.push(`${_dname_item(target)}が呪われた！【呪】`);
          }
          break;
        }
        if (target.type === "pot") {
          const _potGain = _bwBlessed ? 2 : 1;
          target.capacity = (target.capacity || 1) + _potGain;
          ml.push(`${_dname_item(target)}が祝福の光を受け容量が増えた！(容量+${_potGain} → ${target.capacity})${_bwBlessed ? "【祝】" : ""}`);
        } else {
          target.blessed = true; target.cursed = false; target.bcKnown = true;
          ml.push(`${_dname_item(target)}が祝福された！【祝】`);
        }
        break;
      }
      if (kind === "monster") {
        if (_bwCursed) {
          // 呪われた祝福の杖→敵を鈍足にする
          target.speed = Math.max(0.25, (target.speed || 1) * 0.5);
          ml.push(`${target.name}が呪いで鈍足になった！【呪】`);
        } else {
          const _bh = Math.round(rng(10, 20) * blMult);
          target.hp = Math.min(target.maxHp, target.hp + _bh);
          ml.push(`${target.name}は祝福の光を浴び、HPが${_bh}回復した！${_bwBlessed ? "（祝福）" : ""}`);
        }
        break;
      }
      if (kind === "player") {
        const _inv = (p.inventory || []).filter(i => i.type !== "gold" && i.type !== "arrow");
        if (_bwCursed) {
          // 呪われた祝福の杖→所持品を1つ呪う
          if (_inv.length === 0) { ml.push("所持品がないので効果がなかった。"); break; }
          const _t = pick(_inv);
          _t.cursed = true; _t.blessed = false; _t.bcKnown = true;
          ml.push(`${_t.name}が呪われた！【呪】`);
        } else {
          // 通常→1つ祝福、祝福→2つ祝福
          if (_inv.length === 0) { ml.push("所持品がないので効果がなかった。"); break; }
          const _count = _bwBlessed ? 2 : 1;
          const _pool = [..._inv].sort(() => Math.random() - 0.5).slice(0, _count);
          for (const _t of _pool) { _t.blessed = true; _t.cursed = false; _t.bcKnown = true; ml.push(`${_t.name}が祝福された！【祝】`); }
          if (_bwBlessed) ml.push("（祝福の杖の力で2つ祝福された！）");
        }
        break;
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
    case "curse_wand": {
      const _cwBlessed = blMult > 1;
      const _cwCursed  = blMult < 1;
      if (kind === "item") {
        if (_cwCursed) {
          // 呪われた呪いの杖→落ちてるアイテムを祝福する（反転）
          if (target.type === "pot") {
            target.capacity = (target.capacity || 1) + 1;
            ml.push(`${_dname_item(target)}が呪いの反動で容量が増えた！(容量+1 → ${target.capacity})【呪→祝】`);
          } else {
            target.blessed = true; target.cursed = false; target.bcKnown = true;
            ml.push(`${_dname_item(target)}が祝福された！【呪→祝】`);
          }
          break;
        }
        if (target.type === "arrow") { ml.push("矢には呪いが効かない。"); break; }
        if (target.type === "pot") {
          const _potLoss = _cwBlessed ? 2 : 1;
          const _newCap = Math.max(0, (target.capacity || 1) - _potLoss);
          if ((target.contents?.length || 0) > _newCap) {
            removeFloorItem(dg, target);
            const _fts = new Set();
            for (const _ci of (target.contents || [])) placeItemAt(dg, target.x, target.y, _ci, ml, _fts);
            ml.push(`${_dname_item(target)}が呪いで割れた！中身が飛び出した！${_cwBlessed ? "【祝】" : ""}`);
          } else {
            target.capacity = _newCap;
            ml.push(`${_dname_item(target)}が呪いで容量が減った！(容量-${_potLoss} → ${target.capacity})${_cwBlessed ? "【祝】" : ""}`);
          }
        } else {
          target.cursed = true; target.blessed = false; target.bcKnown = true;
          ml.push(`${_dname_item(target)}が呪われた！【呪】`);
        }
        break;
      }
      if (kind === "monster") {
        if (_cwCursed) {
          // 呪われた呪いの杖→敵を回復する（反転）
          const _ch = rng(10, 20);
          target.hp = Math.min(target.maxHp, target.hp + _ch);
          ml.push(`${target.name}は呪いの魔法で回復した！${_ch}HP【呪→回復】`);
        } else {
          target.speed = Math.max(0.25, (target.speed || 1) * 0.5);
          ml.push(`${target.name}が呪いで鈍足になった！`);
        }
        break;
      }
      if (kind === "player") {
        const _inv = (p.inventory || []).filter(i => i.type !== "gold" && i.type !== "arrow");
        if (_cwCursed) {
          // 呪われた呪いの杖→所持品を1つ祝福（反転）
          if (_inv.length === 0) { ml.push("所持品がないので効果がなかった。"); break; }
          const _t = pick(_inv);
          _t.blessed = true; _t.cursed = false; _t.bcKnown = true;
          ml.push(`${_t.name}が祝福された！【呪→祝】`);
        } else {
          // 通常→1つ呪う、祝福→2つ呪う
          if (_inv.length === 0) { ml.push("所持品がないので効果がなかった。"); break; }
          const _count = _cwBlessed ? 2 : 1;
          const _pool = [..._inv].sort(() => Math.random() - 0.5).slice(0, _count);
          for (const _t of _pool) { _t.cursed = true; _t.blessed = false; _t.bcKnown = true; ml.push(`${_t.name}が呪われた！【呪】`); }
          if (_cwBlessed) ml.push("（祝福された呪いの杖の力で2つ呪われた！）");
        }
        break;
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
    case "confuse": {
      if (kind === "monster") {
        target.confusedTurns = (target.confusedTurns || 0) + 20;
        ml.push(`${target.name}が混乱した！(${target.confusedTurns}ターン)`);
        break;
      }
      if (kind === "player") {
        p.confusedTurns = (p.confusedTurns || 0) + 5;
        ml.push(`混乱した！(${p.confusedTurns}ターン)`);
        break;
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
    case "darkness": {
      const _dkBlessed = blMult > 1, _dkCursed = blMult < 1;
      if (_dkCursed) {
        for (let _ry = 0; _ry < MH; _ry++) for (let _rx = 0; _rx < MW; _rx++) dg.explored[_ry][_rx] = true;
        if (kind === "player") ml.push("呪われた暗闇の杖！フロア全体が見えた！【呪→透視】");
        else ml.push("呪われた魔法弾がフロアを照らした！【呪→透視】");
        break;
      }
      if (kind === "monster") {
        target.darknessTurns = _dkBlessed ? 9999 : 50;
        target.darkDir = null;
        target.aware = false;
        ml.push(`${target.name}は暗闇に包まれた！${_dkBlessed ? "(永続)" : "(50ターン)"}`);
        break;
      }
      if (kind === "player") {
        p.darknessTurns = (p.darknessTurns || 0) + (_dkBlessed ? 50 : 20);
        ml.push(`暗闇に包まれた！視界が1マスになる！(${p.darknessTurns}ターン)${_dkBlessed ? "(祝福)" : ""}`);
        break;
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
    case "bewitch": {
      const _bwBlessed = blMult > 1, _bwCursed = blMult < 1;
      if (_bwCursed) {
        dg.traps.forEach(t => t.revealed = true);
        ml.push("呪われた惑わしの杖！フロアの罠が全て見えた！【呪→罠看破】");
        break;
      }
      if (kind === "monster") {
        target.fleeingTurns = _bwBlessed ? 9999 : 50;
        ml.push(`${target.name}は幻惑状態になり逃げ出した！${_bwBlessed ? "(永続)" : "(50ターン)"}`);
        break;
      }
      if (kind === "player") {
        p.bewitchedTurns = (p.bewitchedTurns || 0) + (_bwBlessed ? 100 : 50);
        ml.push(`幻惑された！周囲の見た目がおかしくなった！(${p.bewitchedTurns}ターン)${_bwBlessed ? "(祝福)" : ""}`);
        break;
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
    case "levelup": {
      const _luCursed = blMult < 1, _luBlessed = blMult > 1;
      if (kind === "monster") {
        if (_luCursed) {
          monLevelDown(target, dg, ml);
        } else {
          const _times = _luBlessed ? 2 : 1;
          for (let _i = 0; _i < _times; _i++) monLevelUp(target, dg, ml);
        }
        break;
      }
      if (kind === "player") {
        if (_luCursed) {
          p._pendingWarpUp = true;
          ml.push("呪われた杖！天井を突き破って上の階へ飛ばされた！【呪】");
        } else {
          const _times = _luBlessed ? 2 : 1;
          for (let _i = 0; _i < _times; _i++) { p.exp = p.nextExp; luFn(p, ml); }
        }
        break;
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
  }
}

export function fireWandBolt(p, dg, eff, dx, dy, ml, luFn, bbFn, blMult = 1, nameFn = null) {
  /* 呪われた穴掘り：1マス先に壊せる壁を生成（敵がいたらダメージのみ） */
  if (eff === "dig" && blMult < 1) {
    const wx = p.x + dx, wy = p.y + dy;
    if (wx >= 0 && wx < MW && wy >= 0 && wy < MH && !(p.x === wx && p.y === wy)) {
      const _mon = monsterAt(dg, wx, wy);
      if (_mon) {
        const _dmg = rng(5, 15);
        _mon.hp -= _dmg;
        ml.push(`壁の魔法が${_mon.name}に${_dmg}ダメージ！`);
        if (_mon.hp <= 0) { luFn(_mon, ml); removeMonster(dg, _mon); }
      } else if (dg.map[wy][wx] === T.FLOOR) {
        dg.map[wy][wx] = T.BWALL;
        ml.push("壊せる壁が出現した！");
      } else {
        ml.push("魔法弾は消えた。");
      }
    } else {
      ml.push("魔法弾は消えた。");
    }
    return;
  }
  /* 呪われた吹きとばし：魔法弾は飛ばず、プレイヤー自身が逆方向に吹き飛ぶ */
  if (eff === "knockback" && blMult < 1) {
    ml.push("自分が逆方向に吹き飛ばされた！【呪】");
    applyWandEffect("knockback", "player", p, -dx, -dy, dg, p, ml, luFn, bbFn, 1);
    return;
  }
  let lastX = p.x, lastY = p.y;
  for (let d = 1; d < 20; d++) {
    const tx = p.x + dx * d, ty = p.y + dy * d;
    if (inMagicSealRoom(tx, ty, dg)) { ml.push("魔法弾が魔封じの魔方陣で消えた！"); return; }
    if (tx < 0 || tx >= MW || ty < 0 || ty >= MH || dg.map[ty][tx] === T.WALL || dg.map[ty]?.[tx] === T.BWALL) {
      if (eff === "dig") {
        const _digMax = blMult > 1 ? 20 : 10; /* 祝福：2倍距離 */
        let dug = 0, cx = tx, cy = ty;
        while (dug < _digMax && cx >= 0 && cx < MW && cy >= 0 && cy < MH && (dg.map[cy][cx] === T.WALL || dg.map[cy][cx] === T.BWALL)) {
          /* 壁埋めアイテムを解放 */
          const _wi = dg.items.find(i => i.x === cx && i.y === cy && i.wallEmbedded);
          if (_wi) { delete _wi.wallEmbedded; _wi.discovered = true; }
          dg.map[cy][cx] = T.FLOOR;
          wallBreakDrop(dg, cx, cy);
          dug++; cx += dx; cy += dy;
        }
        ml.push(dug > 0 ? `穴掘りの魔法弾が壁を${dug}マス掘り進んだ！` : "魔法弾は壁に消えた。");
        return;
      }
      if (eff === "leap") {
        if (blMult >= 1) { p.x = lastX; p.y = lastY; ml.push("壁の前に飛びついた！"); return; }
        // 呪い：跳ね返って自分に当たる → プレイヤーがランダムテレポート
        ml.push("魔法弾が跳ね返って自分に当たった！【呪】");
        applyWandEffect(eff, "player", p, -dx, -dy, dg, p, ml, luFn, bbFn, blMult);
        return;
      }
      ml.push("魔法弾は壁に跳ね返った！");
      applyWandEffect(eff, "player", p, -dx, -dy, dg, p, ml, luFn, bbFn, blMult);
      return;
    }
    const mon = monsterAt(dg, tx, ty);
    if (mon) {
      if (eff === "leap" && blMult >= 1) { p.x = lastX; p.y = lastY; ml.push(`${mon.name}の前に飛びついた！`); return; }
      applyWandEffect(eff, "monster", mon, dx, dy, dg, p, ml, luFn, bbFn, blMult);
      return;
    }
    const it = itemAt(dg, tx, ty);
    if (it) {
      if (eff === "leap" && blMult >= 1) { p.x = lastX; p.y = lastY; ml.push(`${it.name}の前に飛びついた！`); return; }
      /* water bottle → matching potion */
      const BOTTLE_XFORM = { slow:"鈍足の薬", paralyze:"金縛りの薬", sleep:"眠りの薬", confuse:"混乱の薬", darkness:"暗闇の薬", bewitch:"惑わしの薬", levelup:"レベルアップの薬" };
      if (it.effect === "water" && BOTTLE_XFORM[eff]) {
        const nm = BOTTLE_XFORM[eff];
        Object.assign(it, { name: nm, effect: eff, value: eff === "sleep" ? 4 : 0 });
        ml.push(`水が${nm}に変化した！`);
        return;
      }
      applyWandEffect(eff, "item", it, dx, dy, dg, p, ml, luFn, bbFn, blMult, nameFn);
      return;
    }
    const trap = dg.traps.find(t => t.x === tx && t.y === ty);
    if (trap) {
      trap.revealed = true;
      if (eff === "leap" && blMult >= 1) { p.x = lastX; p.y = lastY; ml.push(`${trap.name}の前に飛びついた！`); return; }
      applyWandEffect(eff, "trap", trap, dx, dy, dg, p, ml, luFn, bbFn, blMult);
      return;
    }
    const bb = dg.bigboxes?.find(b => b.x === tx && b.y === ty);
    if (bb) {
      if (eff === "leap" && blMult >= 1) { p.x = lastX; p.y = lastY; ml.push(`${bb.name}の前に飛びついた！`); return; }
      applyWandEffect(eff, "bigbox", bb, dx, dy, dg, p, ml, luFn, bbFn, blMult);
      return;
    }
    lastX = tx; lastY = ty;
  }
  if (eff === "leap" && blMult >= 1) { p.x = lastX; p.y = lastY; ml.push("虚空の先に飛びついた！"); return; }
  ml.push("魔法弾は虚空に消えた。");
}

/* ===== MONSTER LIGHTNING WAND (fires from cx,cy, checks player position) ===== */
export function monsterFireLightning(cx, cy, dg, pl, dx, dy, ml, luFn, bbFn, monName = "モンスター", nameFn = null) {
  for (let d = 1; d < 20; d++) {
    const tx = cx + dx * d, ty = cy + dy * d;
    if (inMagicSealRoom(tx, ty, dg)) { ml.push("魔法弾が魔封じの魔方陣で消えた！"); return; }
    if (tx < 0 || tx >= MW || ty < 0 || ty >= MH || dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) {
      ml.push("魔法弾は壁に消えた。");
      return;
    }
    if (tx === pl.x && ty === pl.y) {
      /* 祝福された聖域の魔方陣は飛び道具（雷撃）を防ぐ */
      const _lBlessedSanc = dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y);
      if (_lBlessedSanc) { ml.push("祝福された聖域の加護が雷撃を防いだ！"); return; }
      /* 反射の鎧: 雷撃を発射源のモンスターに反射 */
      const _hasReflect = pl.armor?.ability === "wand_reflect" || pl.armor?.abilities?.includes("wand_reflect");
      if (_hasReflect) {
        ml.push("反射の鎧が雷撃を反射した！");
        const _srcMon = monsterAt(dg, cx, cy);
        if (_srcMon) {
          const _rdmg = rng(15, 25);
          _srcMon.hp -= _rdmg;
          ml.push(`反射した雷撃が${monName}を直撃！${_rdmg}ダメージ！`);
          if (_srcMon.hp <= 0) luFn(_srcMon, ml);
        }
        return;
      }
      /* ゴムゴムの胴: 雷ダメージ半減・所持品破壊を防ぐ */
      const _hasLightRes = pl.armor?.ability === "lightning_resist" || pl.armor?.abilities?.includes("lightning_resist");
      let dmg = rng(15, 25);
      if (_hasLightRes) dmg = Math.max(1, Math.floor(dmg / 2));
      if (inCursedMagicSealRoom(pl.x, pl.y, dg)) dmg *= 2;
      pl.deathCause = `${monName}の雷撃により`;
      pl.hp -= dmg;
      ml.push(`雷撃が命中！${dmg}ダメージ！${_hasLightRes ? "（雷耐性）" : ""}`);
      if (!_hasLightRes) {
        applyLightningToInventory(pl, dg, ml, luFn, nameFn);
      } else {
        ml.push("ゴムゴムの胴がアイテムへの雷を弾いた！");
      }
      if (pl.sleepTurns > 0) { pl.sleepTurns = 0; ml.push("衝撃で目が覚めた！"); }
      if (pl.paralyzeTurns > 0) { pl.paralyzeTurns = 0; ml.push("衝撃で金縛りが解けた！"); }
      return;
    }
    const mon = monsterAt(dg, tx, ty);
    if (mon) {
      applyWandEffect("lightning", "monster", mon, dx, dy, dg, pl, ml, luFn, bbFn);
      return;
    }
    const it = itemAt(dg, tx, ty);
    if (it) {
      applyWandEffect("lightning", "item", it, dx, dy, dg, pl, ml, luFn, bbFn);
      return;
    }
    const trap = dg.traps.find(t => t.x === tx && t.y === ty);
    if (trap) {
      trap.revealed = true;
      applyWandEffect("lightning", "trap", trap, dx, dy, dg, pl, ml, luFn, bbFn);
      return;
    }
    const bb = dg.bigboxes?.find(b => b.x === tx && b.y === ty);
    if (bb) {
      applyWandEffect("lightning", "bigbox", bb, dx, dy, dg, pl, ml, luFn, bbFn);
      return;
    }
  }
  ml.push("魔法弾は虚空に消えた。");
}

export function breakWandAoE(p, dg, eff, ml, luFn, blMult = 1) {
  if (eff === "leap") { ml.push("杖が壊れたが何も起こらなかった。"); return; }
  if (eff === "dig") {
    if (blMult < 1) {
      /* 呪われた穴掘りの杖を壊した：周囲8方向を壊せる壁で囲む（敵がいたらダメージのみ） */
      const digDirs = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
      let walled = 0;
      for (const [adx, ady] of digDirs) {
        const wx = p.x + adx, wy = p.y + ady;
        if (wx >= 0 && wx < MW && wy >= 0 && wy < MH) {
          const _mon = monsterAt(dg, wx, wy);
          if (_mon) {
            const _dmg = rng(5, 15);
            _mon.hp -= _dmg;
            ml.push(`壁の魔法が${_mon.name}に${_dmg}ダメージ！`);
            if (_mon.hp <= 0) { luFn(_mon, ml); removeMonster(dg, _mon); }
          } else if (dg.map[wy][wx] === T.FLOOR) {
            dg.map[wy][wx] = T.BWALL;
            walled++;
          }
        }
      }
      ml.push(walled > 0 ? "壊せる壁に囲まれた！" : "杖が壊れたが何も起こらなかった。");
      return;
    }
    let dmg = rng(8, 15);
    if (inCursedMagicSealRoom(p.x, p.y, dg)) dmg *= 2;
    p.deathCause = "穴掘りの杖の自壊爆発により";
    p.hp -= dmg;
    ml.push(`穴掘りの杖が壊れた！爆発で${dmg}ダメージ！`);
    const digDirs = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
    for (const [adx, ady] of digDirs) {
      const wx = p.x + adx, wy = p.y + ady;
      if (wx >= 0 && wx < MW && wy >= 0 && wy < MH && (dg.map[wy][wx] === T.WALL || dg.map[wy][wx] === T.BWALL)) {
        const _wi2 = dg.items.find(i => i.x === wx && i.y === wy && i.wallEmbedded);
        if (_wi2) { delete _wi2.wallEmbedded; _wi2.discovered = true; }
        dg.map[wy][wx] = T.FLOOR;
      }
    }
    const _pfBlocked =
      dg.traps.find(t => t.x === p.x && t.y === p.y) ||
      dg.items.some(i => i.x === p.x && i.y === p.y) ||
      dg.springs?.some(s => s.x === p.x && s.y === p.y) ||
      dg.bigboxes?.some(b => b.x === p.x && b.y === p.y) ||
      dg.pentacles?.some(pc => pc.x === p.x && pc.y === p.y) ||
      dg.map[p.y][p.x] === T.SD || dg.map[p.y][p.x] === T.SU;
    if (!_pfBlocked) {
      dg.traps.push({ name:"落とし穴", effect:"pitfall", tile:27, id:uid(), x:p.x, y:p.y, revealed:true });
      ml.push("足元に落とし穴ができた！");
    }
    return;
  }
  if (eff === "warp") {
    const wDirs = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
    const ox = p.x, oy = p.y;
    const wTargets = [];
    for (const [adx, ady] of wDirs) {
      const ax = ox + adx, ay = oy + ady;
      if (ax < 0 || ax >= MW || ay < 0 || ay >= MH) continue;
      const wm = monsterAt(dg, ax, ay);
      if (wm) { wTargets.push({ kind:"monster", t:wm }); continue; }
      const wi = itemAt(dg, ax, ay);
      if (wi) { wTargets.push({ kind:"item", t:wi }); continue; }
      const wt = dg.traps.find(t2 => t2.x === ax && t2.y === ay);
      if (wt) { wTargets.push({ kind:"trap", t:wt }); continue; }
      const wb = dg.bigboxes?.find(b => b.x === ax && b.y === ay);
      if (wb) wTargets.push({ kind:"bigbox", t:wb });
    }
    applyWandEffect(eff, "player", p, 0, 0, dg, p, ml, luFn, null, blMult);
    for (const { kind, t } of wTargets) applyWandEffect(eff, kind, t, 0, 0, dg, p, ml, luFn, null, blMult);
    return;
  }
  const dirs = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  const rd = pick(dirs);
  applyWandEffect(eff, "player", p, rd[0], rd[1], dg, p, ml, luFn, null, blMult);
  const targets = [];
  for (const [adx, ady] of dirs) {
    const ax = p.x + adx, ay = p.y + ady;
    if (ax < 0 || ax >= MW || ay < 0 || ay >= MH) continue;
    const mon = monsterAt(dg, ax, ay);
    if (mon) { targets.push({ kind:"monster", t:mon, dx:adx, dy:ady }); continue; }
    const it = itemAt(dg, ax, ay);
    if (it)  { targets.push({ kind:"item", t:it, dx:adx, dy:ady }); continue; }
    const trap = dg.traps.find(t2 => t2.x === ax && t2.y === ay);
    if (trap) { trap.revealed = true; targets.push({ kind:"trap", t:trap, dx:adx, dy:ady }); continue; }
    const bb = dg.bigboxes?.find(b => b.x === ax && b.y === ay);
    if (bb) targets.push({ kind:"bigbox", t:bb, dx:adx, dy:ady });
  }
  for (const { kind, t, dx, dy } of targets) applyWandEffect(eff, kind, t, dx, dy, dg, p, ml, luFn, null, blMult);
}
