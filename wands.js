import { rng, pick, uid, MW, MH, T, TI, DRO, removeFloorItem, monsterAt, itemAt, removeMonster, getShops, hasAbility, hasGravityPentacle, consumeBarrier, randomTeleportDest, shuffle, stepProjectile } from './utils.js';
import { monLevelUp, monLevelDown, pickTransformMonsterDef, wakeIfDormant, scaleMonFireDmg, monFireDmgLabel } from './monsters.js';
import {
  resolveItemName,
  killMonster, pushEntity, throwItemAlongLine, placeItemAt, scatterPotContents, monsterDrop,
  soakItemIntoSpring, splashPotion, inMagicSealRoom, inCursedMagicSealRoom,
  getFarcastMode, ITEMS, WANDS, BB_TYPES, TRAPS, pickTrap, isStatusImmune, weakenOrClearParalysis,
  chargeShopItem, burnFoodItem, applyLightningToInventory, wallBreakDrop, fireTrapItem,
  hasCursedExplosionPentacle, isFireExplosionNullified, hasCursedTeleportPentacle, cookFoodMeta, genFood, removeTrap,
  hasFireResist, hasLightningResist, hasIceResist,
  reduceFireDamage, reduceIceDamage, reduceLightningDamage,
  fireResistDamageLabel, iceResistDamageLabel, lightningResistDamageLabel,
  pickLootFromPool, freezeWaterTile, applyWaterIceFreeze, isPlayerOnWater, getFixtureItemDeps,
  setWandBreakEffectHandler,
} from "./items.js";
import { fireTrapPlayer } from './traps.js';
import { tryBreakStatueAt, hitStatueWithAction, displaceObjectsFromStatue } from './fixtures.js';
import { statueAt, wandEffectBreaksStatue, wandEffectStatueLootOnly } from './fixtureQueries.js';
import { pushAnim, pushMonsterBoltAnim, pushLightningAnim, pushHealAnim } from './animEvents.js';

/** 石像のテレポート先（他石像・敵・プレイヤー・床オブジェクトを避ける） */
function statueTeleportDest(dg, ox, oy, p) {
  return randomTeleportDest(dg, ox, oy, (x, y) =>
    !dg.monsters.some(m => m.x === x && m.y === y) &&
    !(p && p.x === x && p.y === y) &&
    !dg.statues?.some(s => s.x === x && s.y === y) &&
    !dg.bigboxes?.some(b => b.x === x && b.y === y) &&
    !dg.items?.some(i => i.x === x && i.y === y) &&
    !dg.traps?.some(t => t.x === x && t.y === y) &&
    !dg.springs?.some(s => s.x === x && s.y === y) &&
    !dg.pentacles?.some(pc => pc.x === x && pc.y === y) &&
    !dg.vents?.some(v => v.x === x && v.y === y) &&
    !dg.oilyTiles?.some(t => t.x === x && t.y === y)
  );
}

/*
 * 新しい杖エフェクトを追加する手順:
 *   1. items.js の WANDS配列に新しい杖を追加
 *   2. この関数の switch(eff) に case "effect名": { ... } を追加
 *      ※ 追加し忘れると console.warn が出て効果が発動しない
 */
export function applyWandEffect(eff, kind, target, dx, dy, dg, p, ml, luFn, bbFn, blMult = 1, nameFn = null, collisionAtk = 0, killerMon = null) {
  /* 石像：位置系は壊さず効果発動。穴掘り・軟化は敵なし破壊。それ以外は有害なら破壊 */
  if (kind === "statue") {
    if (wandEffectStatueLootOnly(eff)) {
      hitStatueWithAction(dg, target.x, target.y, p, ml, luFn, p?.depth, {
        breaks: true,
        spawnMonster: false,
        itemDeps: getFixtureItemDeps(),
      });
      return;
    }
    if (wandEffectBreaksStatue(eff)) {
      hitStatueWithAction(dg, target.x, target.y, p, ml, luFn, p?.depth, {
        breaks: true,
        itemDeps: getFixtureItemDeps(),
      });
      return;
    }
    /* 場所替え・テレポ・飛びつき（呪い）など：石像を壊さず効果を出す */
    if (eff === "swap") {
      const _swBless = blMult > 1, _swCurse = blMult < 1;
      if (_swCurse) {
        const _leapX = target.x - dx, _leapY = target.y - dy;
        if (_leapX >= 0 && _leapX < MW && _leapY >= 0 && _leapY < MH &&
            dg.map[_leapY]?.[_leapX] !== T.WALL && dg.map[_leapY]?.[_leapX] !== T.BWALL &&
            !dg.monsters.some(m2 => m2.x === _leapX && m2.y === _leapY) &&
            !(_leapX === p.x && _leapY === p.y) &&
            !dg.statues?.some(s => s !== target && s.x === _leapX && s.y === _leapY) &&
            !dg.bigboxes?.some(b => b.x === _leapX && b.y === _leapY)) {
          p.x = _leapX; p.y = _leapY;
          if ((p.immobileTurns || 0) > 0) { p.immobileTurns = 0; ml.push("移動封じが解けた！"); }
          ml.push(`${target.name}の前に飛びついた！【呪】`);
        } else {
          ml.push("飛びつけなかった。【呪】");
        }
        return;
      }
      const [ox, oy] = [p.x, p.y];
      p.x = target.x; p.y = target.y;
      target.x = ox; target.y = oy;
      displaceObjectsFromStatue(dg, target.x, target.y, ml, getFixtureItemDeps());
      if ((p.immobileTurns || 0) > 0) { p.immobileTurns = 0; ml.push("移動封じが解けた！"); }
      ml.push(`${target.name}と位置が入れ替わった！`);
      if (_swBless) {
        /* 石像に金縛りは意味がないので祝福は通常交換のみ */
      }
      return;
    }
    if (eff === "leap") {
      /* 通常飛びつきは fireWandBolt 側。ここは呪い：石像をランダムTP */
      if (blMult < 1) {
        const _lpd = statueTeleportDest(dg, target.x, target.y, p);
        if (!_lpd) { ml.push("テレポートに失敗した。"); return; }
        target.x = _lpd.x; target.y = _lpd.y;
        displaceObjectsFromStatue(dg, target.x, target.y, ml, getFixtureItemDeps());
        ml.push(`${target.name}はどこかへテレポートした！【呪】`);
      }
      return;
    }
    if (eff === "warp") {
      const _wCursed = blMult < 1, _wBlessed = blMult > 1;
      if (!_wCursed && hasCursedTeleportPentacle(dg)) {
        ml.push("呪われたテレポートの魔方陣に阻まれてテレポートできない！");
        return;
      }
      if (_wCursed) {
        const _w1x = target.x + dx, _w1y = target.y + dy;
        if (_w1x >= 0 && _w1x < MW && _w1y >= 0 && _w1y < MH &&
            dg.map[_w1y]?.[_w1x] !== T.WALL && dg.map[_w1y]?.[_w1x] !== T.BWALL &&
            !dg.monsters.some(m => m.x === _w1x && m.y === _w1y) &&
            !(p.x === _w1x && p.y === _w1y) &&
            !dg.statues?.some(s => s !== target && s.x === _w1x && s.y === _w1y) &&
            !dg.bigboxes?.some(b => b.x === _w1x && b.y === _w1y) &&
            !dg.items?.some(i => i.x === _w1x && i.y === _w1y) &&
            !dg.traps?.some(t => t.x === _w1x && t.y === _w1y)) {
          target.x = _w1x; target.y = _w1y;
          displaceObjectsFromStatue(dg, target.x, target.y, ml, getFixtureItemDeps());
          ml.push(`${target.name}が少しだけテレポートした。`);
        } else {
          ml.push("テレポートに失敗した。");
        }
        return;
      }
      if (_wBlessed) {
        let stairsX = -1, stairsY = -1;
        for (let fy = 0; fy < MH; fy++)
          for (let fx = 0; fx < MW; fx++)
            if (dg.map[fy][fx] === T.SD) { stairsX = fx; stairsY = fy; }
        if (stairsX >= 0) {
          const _wbAdj = [];
          for (const [_ax, _ay] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
            const _nx = stairsX + _ax, _ny = stairsY + _ay;
            if (_nx >= 0 && _nx < MW && _ny >= 0 && _ny < MH && dg.map[_ny][_nx] === T.FLOOR &&
                !dg.bigboxes?.some(b => b.x === _nx && b.y === _ny) &&
                !dg.monsters.some(m => m.x === _nx && m.y === _ny) &&
                !(p.x === _nx && p.y === _ny) &&
                !dg.statues?.some(s => s !== target && s.x === _nx && s.y === _ny) &&
                !dg.items?.some(i => i.x === _nx && i.y === _ny) &&
                !dg.traps?.some(t => t.x === _nx && t.y === _ny))
              _wbAdj.push({ x: _nx, y: _ny });
          }
          if (_wbAdj.length > 0) {
            const _wd = pick(_wbAdj);
            target.x = _wd.x; target.y = _wd.y;
            displaceObjectsFromStatue(dg, target.x, target.y, ml, getFixtureItemDeps());
            ml.push(`${target.name}は階段の隣に飛んだ！`);
            return;
          }
        }
      }
      const _dest = statueTeleportDest(dg, target.x, target.y, p);
      if (!_dest) { ml.push("テレポートに失敗した。"); return; }
      target.x = _dest.x; target.y = _dest.y;
      displaceObjectsFromStatue(dg, target.x, target.y, ml, getFixtureItemDeps());
      ml.push(`${target.name}はどこかへテレポートした！`);
      return;
    }
    ml.push(`${target.name}には効果がなかった。`);
    return;
  }
  if (kind === "monster") {
    wakeIfDormant(target, ml);
    /* 魔法無効（キラープラスター等）：杖の魔法弾を完全無効化 */
    if (target.magicImmune) { ml.push(`魔法は${target.name}に効かない！`); return; }
    /* バリア術師：近接以外の全効果（杖・状態異常・爆発等）を1回分無効化 */
    if (consumeBarrier(target, ml)) return;
  }
  /* 地面のアイテムは未識別名で表示するため、呼び出し元から nameFn を受け取る */
  const _dname_item = (t) => (kind === "item") ? resolveItemName(t, nameFn) : t.name;
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
          if ((p.immobileTurns||0) > 0) { p.immobileTurns = 0; ml.push("移動封じが解けた！"); }
          ml.push(`${target.name}に引き寄せられた！【呪】`);
        } else {
          ml.push("引き寄せられなかった。【呪】");
        }
        return;
      }
      const [ox, oy] = [p.x, p.y];
      p.x = target.x; p.y = target.y;
      target.x = ox;  target.y = oy;
      if ((p.immobileTurns||0) > 0) { p.immobileTurns = 0; ml.push("移動封じが解けた！"); }
      ml.push(`${target.name}と位置が入れ替わった！`);
      return;
    }
    if (eff === "warp") {
      if (blMult >= 1 && hasCursedTeleportPentacle(dg)) {
        ml.push("呪われたテレポートの魔方陣に阻まれてテレポートできない！");
        return;
      }
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
          ml.push(`${target.name}が少し動いた。【呪】`);
        } else {
          ml.push(`${target.name}は動けなかった。【呪】`);
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
      const _bbBlessed = blMult > 1;
      const _bbMaxDist = _bbBlessed ? 100 : 10; /* 通常10マス、祝福は実質無限（壁/敵まで飛ぶ） */
      let bbx = target.x, bby = target.y, bbroke = false;
      let _bbHitMon = null;
      for (let i = 0; i < _bbMaxDist; i++) {
        const nx = bbx + dx, ny = bby + dy;
        if (nx < 0 || nx >= MW || ny < 0 || ny >= MH || dg.map[ny][nx] === T.WALL || dg.map[ny][nx] === T.BWALL) {
          bbroke = true; break;
        }
        /* 敵に激突：大ダメージ＋箱破壊 */
        const _hm = monsterAt(dg, nx, ny);
        if (_hm) { _bbHitMon = _hm; bbroke = true; break; }
        /* アイテム・罠・泉・魔方陣・階段と重ならないよう手前で止まる */
        if (dg.map[ny][nx] === T.SD || dg.map[ny][nx] === T.SU ||
            dg.items.some(i => i.x === nx && i.y === ny) ||
            dg.traps.some(t => t.x === nx && t.y === ny) ||
            dg.springs?.some(s => s.x === nx && s.y === ny) ||
            dg.pentacles?.some(pc => pc.x === nx && pc.y === ny)) break;
        bbx = nx; bby = ny;
      }
      if (bbroke) {
        dg.bigboxes = dg.bigboxes?.filter(b => b !== target);
        if (_bbHitMon) {
          const _bbDmg = rng(20, 40);
          _bbHitMon.hp -= _bbDmg;
          ml.push(`${target.name}が${_bbHitMon.name}に激突！${_bbDmg}ダメージ！${target.name}は壊れた！`);
          if (_bbHitMon.hp <= 0) killMonster(_bbHitMon, dg, p, ml, luFn);
          if (target.contents?.length > 0) {
            const fts = new Set();
            for (const ci of target.contents) placeItemAt(dg, bbx, bby, ci, ml, fts);
            ml.push("中身が飛び出した！");
          }
        } else if (target.contents?.length > 0) {
          const fts = new Set();
          for (const ci of target.contents) placeItemAt(dg, bbx, bby, ci, ml, fts);
          ml.push(`${resolveItemName(target, nameFn)}は壁に叩きつけられて壊れた！中身が飛び出した！`);
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
    if (eff === "soften") {
      /* 大箱を破壊して中身を散乱 */
      const _sfts = new Set();
      for (const _ci of (target.contents || [])) placeItemAt(dg, target.x, target.y, _ci, ml, _sfts);
      dg.bigboxes = dg.bigboxes?.filter(b => b !== target);
      ml.push(`軟化の魔法弾で${resolveItemName(target, nameFn)}が崩れ落ちた！${(target.contents?.length||0) > 0 ? "中身が飛び出した！" : ""}`);
      return;
    }
    if (eff === "slow" || eff === "paralyze" || eff === "sleep" ||
        eff === "confuse" || eff === "darkness" || eff === "bewitch" ||
        eff === "seal" || eff === "levelup") {
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
          ml.push(`${resolveItemName(target, nameFn)}が呪いで壊れた！中身が飛び出した！【呪】`);
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
          ml.push(`${resolveItemName(target, nameFn)}が呪いで壊れた！中身が飛び出した！${_cwBlessed ? "【祝】" : ""}`);
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
      ml.push(`${resolveItemName(target, nameFn)}が壊れて中身が飛び出した！`);
    } else {
      ml.push(`${resolveItemName(target, nameFn)}が壊れた！`);
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
            ml.push(`${target.name}を引き寄せた！【呪】`);
          } else {
            ml.push(`${target.name}を引き寄せようとしたが失敗した。【呪】`);
          }
          break;
        }
        if (kind === "player") {
          ml.push("引き寄せの力が自分に！【呪】");
          break;
        }
        if (kind === "item") {
          /* アイテムを目の前に引き寄せる */
          const _pullIx = p.x + dx, _pullIy = p.y + dy;
          if (_pullIx >= 0 && _pullIx < MW && _pullIy >= 0 && _pullIy < MH && dg.map[_pullIy][_pullIx] !== T.WALL && dg.map[_pullIy][_pullIx] !== T.BWALL) {
            removeFloorItem(dg, target);
            const ft = new Set();
            placeItemAt(dg, _pullIx, _pullIy, target, ml, ft);
            ml.push(`${target.name}を引き寄せた！【呪】`);
          }
          break;
        }
        break;
      }
      const d = _blessed ? 100 : 10; /* 通常10マス、祝福は実質無限（壁まで飛ぶ） */
      const _kbDmgBase = _blessed ? 10 : 5; /* 祝福：ダメ2倍 */
      if (kind === "monster") {
        if (hasGravityPentacle(dg, target.x, target.y)) { ml.push(`重力の魔方陣の力で${target.name}への吹き飛ばしが無効になった！`); break; }
        const _kbDmg = _kbDmgBase;
        ml.push(`${target.name}は吹き飛ばされた！`);
        target.hp -= _kbDmg;
        pushEntity(dg, target.x, target.y, dx, dy, d, ml, "monster", target, p, luFn, collisionAtk);
        /* 聖域の上に強制移動した敵は即死（壁激突によるHP0チェックより先に判定） */
        if (dg.monsters.includes(target) &&
            dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === target.x && pc.y === target.y)) {
          if (killerMon) {
            ml.push(`${target.name}は聖域に吹き飛ばされ消滅した！`);
            monsterDrop(target, dg, ml, p);
            removeMonster(dg, target);
            monLevelUp(killerMon, dg, ml);
          } else {
            { const _se = Math.floor(target.exp * ((p.soyExpTurns||0)>0?1.3:1));
            ml.push(`${target.name}は聖域に吹き飛ばされ消滅した！(+${_se}exp${(p.soyExpTurns||0)>0?" 醤油効果!":""})`);
            p.exp += _se; }
            monsterDrop(target, dg, ml, p);
            removeMonster(dg, target);
            luFn(p, ml);
          }
        } else if (target.hp <= 0) {
          killMonster(target, dg, p, ml, luFn, false, killerMon);
        }
        break;
      }
      if (kind === "player") {
        if (hasGravityPentacle(dg, p.x, p.y)) { ml.push("重力の魔方陣の力で吹き飛ばしが無効になった！"); break; }
        ml.push("自分が吹き飛ばされた！");
        p.hp -= _kbDmgBase;
        pushEntity(dg, p.x, p.y, dx, dy, d, ml, "player", p, p, luFn, collisionAtk);
        const _kbLandTrap = dg.traps.find(t => t.x === p.x && t.y === p.y);
        if (_kbLandTrap) fireTrapPlayer(_kbLandTrap, p, dg, ml, nameFn, luFn);
        break;
      }
      if (kind === "item") {
        ml.push(`${target.name}が吹き飛んだ！`);
        removeFloorItem(dg, target);
        /* 仮想射手（押し出し起点：アイテムの元位置） */
        const _shooter = { x: target.x, y: target.y, name: target.name };
        const res = throwItemAlongLine(_shooter, dg, target, dx, dy, d, ml, p, luFn, {
          bbFn, nameFn, applyWandFn: applyWandEffect,
        });
        /* shop charge：店外に飛び出したら課金 */
        if (target.shopPrice) {
          const _allShopsW = getShops(dg);
          const _iShopW = _allShopsW.find(s => s.id === target._shopId) || _allShopsW.find(s => s.unpaidTotal > 0);
          if (_iShopW) {
            const r = _iShopW.room;
            const inShop = res.x >= r.x && res.x < r.x + r.w && res.y >= r.y && res.y < r.y + r.h;
            if (!inShop) chargeShopItem(target, dg, ml);
          }
        }
        break;
      }
      if (kind === "trap") {
        if (target.permanent) { ml.push(`${target.name}は吹き飛ばせない！`); break; }
        ml.push(`${target.name}が吹き飛んだ！`);
        const _trapRes = pushEntity(dg, target.x, target.y, dx, dy, d, ml, "trap", target, p, luFn);
        if (_trapRes.hitPlayer) {
          ml.push(`飛んできた${target.name}がプレイヤーに命中！`);
          const _trapPlR = fireTrapPlayer(target, p, dg, ml, nameFn, luFn);
          if (_trapPlR !== "deferred_explosion") {
            removeTrap(dg, target, ml, { fromStep: true, p });
          }
        } else if (_trapRes.hitMonster) {
          ml.push(`飛んできた${target.name}が${_trapRes.hitMonster.name}に命中！`);
          fireTrapItem(target, target, dg, _trapRes.x, _trapRes.y, ml, new Set(), p, nameFn, luFn);
          if (target.effect !== "explode") {
            removeTrap(dg, target, ml, { fromStep: true, p });
          }
        }
        break;
      }
      break;
    }
    case "lightning": {
      /* 呪われた爆発の魔方陣：雷を不発にする */
      if (hasCursedExplosionPentacle(dg)) { ml.push("呪われた爆発の魔方陣が雷を打ち消した！"); break; }
      const _lCursed = blMult < 1;
      if (_lCursed) {
        /* 呪い：rng(20,30)回復（アンデッドは逆にダメージ） */
        if (kind === "monster") {
          if (target.kind === "undead") {
            const _lcdmg = rng(20, 30);
            target.hp -= _lcdmg; ml.push(`${target.name}はアンデッドのため${_lcdmg}ダメージを受けた！【呪】`);
            if (target.hp <= 0) killMonster(target, dg, p, ml, luFn);
          } else {
            const _lheal = Math.min(rng(20, 30), target.maxHp - target.hp);
            if (_lheal > 0) { target.hp += _lheal; ml.push(`${target.name}のHPが${_lheal}回復した！`); pushHealAnim(target.x, target.y); }
            else ml.push(`${target.name}には効果がなかった。`);
          }
          break;
        }
        if (kind === "player") {
          const _lheal = Math.min(rng(20, 30), p.maxHp - p.hp);
          if (_lheal > 0) { p.hp += _lheal; ml.push(`癒しの光に包まれた！HP+${_lheal}`); pushHealAnim(p.x, p.y); }
          else ml.push("HPは既に満タンだ。");
          break;
        }
      }
      /* 祝福：ダメ2倍 (blMult=1.5→×2にオーバーライド) */
      const _lBlessMult = blMult > 1 ? 2 : 1;
      let dmg = Math.max(1, Math.round(rng(20, 30) * _lBlessMult));
      if (kind === "monster" && inCursedMagicSealRoom(target.x, target.y, dg)) dmg *= 2;
      if (kind === "monster") {
        const _lWeakMult = target.elemWeak === "thunder" ? 1.5 : 1;
        const _lFinalDmg = Math.round(dmg * _lWeakMult);
        target.hp -= _lFinalDmg;
        ml.push(`雷撃が${target.name}に命中！${_lFinalDmg}ダメージ！${_lWeakMult > 1 ? "雷弱点！" : ""}`);
        pushLightningAnim(target.x, target.y);
        if (target.hp <= 0) killMonster(target, dg, p, ml, luFn, false, killerMon);
        break;
      }
      if (kind === "player") {
        if (inCursedMagicSealRoom(p.x, p.y, dg)) dmg *= 2;
        dmg = reduceLightningDamage(dmg, p);
        p.deathCause = "雷の杖の魔法により";
        p.hp -= dmg;
        ml.push(`雷撃が自分に命中！${dmg}ダメージ！${lightningResistDamageLabel(p)}`);
        pushLightningAnim(p.x, p.y);
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
            cookFoodMeta(target);
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
        if (target.permanent) { ml.push(`${target.name}は破壊できない！`); break; }
        removeTrap(dg, target, ml, { message: `雷撃で${target.name}が破壊された！`, p });
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
          ml.push(`${target.name}は2倍速になった！【呪】`);
          break;
        }
        if (kind === "player") {
          p.hasteTurns = (p.hasteTurns || 0) + 10;
          ml.push("体が軽くなった！(2倍速10ターン)【呪】");
          break;
        }
      } else {
        if (kind === "monster") {
          if (isStatusImmune(target, ml, target.name)) break;
          if (target.isBoss && target._preSlowSpeed === undefined) target._preSlowSpeed = target.speed;
          target.speed = Math.max(0.25, target.speed * 0.5);
          if (target.isBoss) target.bossSlowTurns = (target.bossSlowTurns || 0) + (_sBless ? 20 : 10);
          ml.push(`${target.name}は鈍足になった！`);
          if (_sBless) {
            /* 祝福：金縛りも追加 */
            target.paralyzed = true; target._paralyzeHp = target.hp;
            if (target.isBoss) target.paralyzeTurns = Math.max(target.paralyzeTurns||0, 10);
            ml.push(`さらに${target.name}は金縛りになった！`);
          }
          break;
        }
        if (kind === "player") {
          if (isStatusImmune(p, ml)) break;
          if (hasAbility(p.armor, "slow_proof")) {
            ml.push("鈍足効果を受けたが防具が防いだ！(耐鈍足)");
          } else {
            p.slowTurns = (p.slowTurns || 0) + (_sBless ? 20 : 10);
            ml.push(`体が重くなった...(鈍足${_sBless ? 20 : 10}ターン)`);
          }
          if (_sBless) {
            if (hasAbility(p.armor, "paralyze_proof")) {
              ml.push("金縛り効果を受けたが防具が防いだ！(耐金縛り)");
            } else {
              p.paralyzeTurns = Math.max(p.paralyzeTurns || 0, 10);
              ml.push("さらに金縛りになった！(10ターン)");
            }
          }
          break;
        }
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
    case "transform": {
      if (kind === "monster") {
        if (target.isBoss) { ml.push(`${target.name}には変化の杖が効かなかった！`); break; }
        const levelOffset = blMult > 1 ? -1 : blMult < 1 ? 1 : 0;
        const nt = pickTransformMonsterDef(p.depth, dg.dungeonType ?? null, target.monLevel || 1, levelOffset);
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
        p.maxHp = Math.max(1, p.maxHp + h);
        p.hp = Math.min(p.hp, p.maxHp);
        if (h < 0) p.deathCause = "変化の杖で";
        ml.push(h >= 0 ? `体に変化が...最大HP+${h}` : `体に異変が...最大HP${h}`);
        break;
      }
      if (kind === "item") {
        if (target.type === "goal") { ml.push(`${_dname_item(target)}は変化しなかった！`); break; }
        const _chgPool = ITEMS.filter((i) => i.type !== "gold" && i.type !== "goal");
        const _chgContext = blMult > 1 ? "change_blessed" : blMult < 1 ? "change_cursed" : "change";
        const nt = pickLootFromPool(_chgPool, _chgContext) || pick(_chgPool);
        const ox = target.x, oy = target.y;
        removeFloorItem(dg, target);
        chargeShopItem(target, dg, ml);
        const ni = { ...nt, id: uid(), x: ox, y: oy };
        dg.items.push(ni);
        ml.push(`${_dname_item(target)}は${resolveItemName(ni, nameFn)}に変化した！`);
        break;
      }
      if (kind === "trap") {
        const nt = blMult > 1
          ? pickTrap(TRAPS, Math.random, 0.36, (trap) => trap.rarity === "D" || trap.rarity === "E")
          : pickTrap(TRAPS, Math.random, blMult < 1 ? 0.36 : 0);
        ml.push(`${target.name}は${nt.name}に変化した！`);
        Object.assign(target, { ...nt, id:target.id, x:target.x, y:target.y, revealed:true });
        break;
      }
      break;
    }
    case "soften": {
      const _sfBlessed = blMult > 1;
      if (kind === "monster") {
        const _prevDef = target.def || 0;
        target.def = _sfBlessed ? Math.floor(_prevDef / 4) : Math.floor(_prevDef / 2);
        const _ratio = _sfBlessed ? "4分の1" : "半分";
        ml.push(`軟化の魔法弾が${target.name}に命中！防御力が${_ratio}になった！(${_prevDef}→${target.def})`);
        break;
      }
      if (kind === "item") {
        if (target.type === "wand") {
          destroyFloorWand(dg, target, p, ml, luFn, `軟化の魔法弾で${_dname_item(target)}が崩れ落ちた！`);
          break;
        }
        removeFloorItem(dg, target);
        chargeShopItem(target, dg, ml);
        if (target.type === "pot" && target.contents && target.contents.length > 0) {
          const _sfFts = new Set();
          for (const _ci of target.contents) placeItemAt(dg, target.x, target.y, _ci, ml, _sfFts);
          ml.push(`軟化の魔法弾で${_dname_item(target)}が崩れ落ちた！中身が飛び出した！`);
        } else {
          ml.push(`軟化の魔法弾で${_dname_item(target)}が崩れ落ちた！`);
        }
        break;
      }
      if (kind === "trap") {
        removeTrap(dg, target, ml, { message: `軟化の魔法弾で${target.name}が崩れ落ちた！`, p });
        break;
      }
      if (kind === "player") {
        p.defSoftenedTurns = (p.defSoftenedTurns || 0) + 50;
        ml.push(`軟化の魔法弾が自分に命中！防御力が半減した！(50ターン)`);
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
            if ((p.immobileTurns||0) > 0) { p.immobileTurns = 0; ml.push("移動封じが解けた！"); }
            ml.push(`${target.name}の前に飛びついた！【呪】`);
          } else {
            ml.push("飛びつけなかった。【呪】");
          }
        } else if (kind === "item" || kind === "trap") {
          const _leapX = target.x - dx, _leapY = target.y - dy;
          if (_leapX >= 0 && _leapX < MW && _leapY >= 0 && _leapY < MH && dg.map[_leapY][_leapX] !== T.WALL && dg.map[_leapY][_leapX] !== T.BWALL) {
            p.x = _leapX; p.y = _leapY;
            if ((p.immobileTurns||0) > 0) { p.immobileTurns = 0; ml.push("移動封じが解けた！"); }
            ml.push(`${target.name}の前に飛びついた！【呪】`);
          }
        }
        break;
      }
      if (kind === "monster") {
        const [ox, oy] = [p.x, p.y];
        p.x = target.x; p.y = target.y;
        target.x = ox;  target.y = oy;
        if ((p.immobileTurns||0) > 0) { p.immobileTurns = 0; ml.push("移動封じが解けた！"); }
        ml.push(`${target.name}と位置が入れ替わった！`);
        /* 聖域の上に強制移動した敵は即死 */
        if (dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.x === target.x && pc.y === target.y)) {
          { const _se2 = Math.floor(target.exp * ((p.soyExpTurns||0)>0?1.3:1));
          ml.push(`${target.name}は聖域に踏み込み消滅した！(+${_se2}exp${(p.soyExpTurns||0)>0?" 醤油効果!":""})`);
          p.exp += _se2; }
          monsterDrop(target, dg, ml, p);
          removeMonster(dg, target);
          luFn(p, ml);
        } else if (_swBless) {
          /* 祝福：入れ替わった先で金縛り */
          target.paralyzed = true; target._paralyzeHp = target.hp;
          if (target.isBoss) target.paralyzeTurns = Math.max(target.paralyzeTurns||0, 10);
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
        if ((p.immobileTurns||0) > 0) { p.immobileTurns = 0; ml.push("移動封じが解けた！"); }
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
        if (target.type === "wand") {
          destroyFloorWand(dg, target, p, ml, luFn, `${target.name}は破壊された！`);
          break;
        }
        removeFloorItem(dg, target);
        chargeShopItem(target, dg, ml);
        if (target.type === "pot") {
          if (target.contents && target.contents.length > 0) {
            const ft = new Set();
            for (const ci of target.contents) placeItemAt(dg, target.x, target.y, ci, ml, ft);
            ml.push(`${resolveItemName(target, nameFn)}が壊れて中身が飛び出した！`);
          } else {
            ml.push(`${target.name}は壊れた！`);
          }
        } else {
          ml.push(`${target.name}は破壊された！`);
        }
      }
      if (kind === "trap") {
        removeTrap(dg, target, ml, { message: `穴掘りの魔法弾で${target.name}が壊れた！`, p });
      }
      break;
    }
    case "leap": {
      if (blMult < 1) {
        // 呪い：対象をランダムワープ
        const _lpOx = kind === "player" ? p.x : target.x;
        const _lpOy = kind === "player" ? p.y : target.y;
        const _lpd = randomTeleportDest(dg, _lpOx, _lpOy, (x, y) => !dg.monsters.some(m => m.x === x && m.y === y));
        if (!_lpd) { ml.push("テレポートに失敗した。"); break; }
        if (kind === "monster") { target.x = _lpd.x; target.y = _lpd.y; ml.push(`${target.name}はどこかへテレポートした！【呪】`); }
        else if (kind === "item") { target.x = _lpd.x; target.y = _lpd.y; ml.push(`${_dname_item(target)}はどこかへ飛んだ！【呪】`); }
        else if (kind === "trap") { target.x = _lpd.x; target.y = _lpd.y; ml.push(`${target.name}はどこかへ飛んだ！【呪】`); }
        else if (kind === "player") { p.x = _lpd.x; p.y = _lpd.y; ml.push("ランダムにテレポートした！【呪】"); }
      }
      break;
    }
    case "warp": {
      const _wCursed = blMult < 1, _wBlessed = blMult > 1;
      if (!_wCursed && hasCursedTeleportPentacle(dg)) {
        ml.push("呪われたテレポートの魔方陣に阻まれてテレポートできない！");
        break;
      }
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
            target.paralyzed = true; target._paralyzeHp = target.hp;
            if (target.isBoss) target.paralyzeTurns = Math.max(target.paralyzeTurns||0, 10);
            ml.push(`${target.name}は階段の上にテレポートし、金縛りになった！`);
          } else if (kind === "player") {
            const _stOccupied = dg.monsters.some(m => m.x === stairsX && m.y === stairsY);
            if (_stOccupied) {
              // 階段が塞がっている場合は隣の空きマスへ
              const _stAdj = [];
              for (const [_ax, _ay] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]) {
                const _nx = stairsX + _ax, _ny = stairsY + _ay;
                if (_nx >= 0 && _nx < MW && _ny >= 0 && _ny < MH &&
                    dg.map[_ny][_nx] !== T.WALL && dg.map[_ny][_nx] !== T.BWALL &&
                    !dg.monsters.some(m => m.x === _nx && m.y === _ny) &&
                    !dg.bigboxes?.some(b => b.x === _nx && b.y === _ny))
                  _stAdj.push({ x: _nx, y: _ny });
              }
              if (_stAdj.length > 0) {
                const _sd = pick(_stAdj);
                p.x = _sd.x; p.y = _sd.y;
              } else {
                // 隣も全部塞がっていればマップ全体から空きフロアを探す
                const _stAll = [];
                for (let fy = 0; fy < MH; fy++)
                  for (let fx = 0; fx < MW; fx++)
                    if (dg.map[fy][fx] === T.FLOOR &&
                        !dg.monsters.some(m => m.x === fx && m.y === fy) &&
                        !dg.bigboxes?.some(b => b.x === fx && b.y === fy))
                      _stAll.push({ x: fx, y: fy });
                if (_stAll.length > 0) {
                  const _sd2 = pick(_stAll);
                  p.x = _sd2.x; p.y = _sd2.y;
                } else {
                  p.x = stairsX; p.y = stairsY;
                }
              }
            } else {
              p.x = stairsX; p.y = stairsY;
            }
            if (hasAbility(p.armor, "paralyze_proof")) {
              ml.push("階段の上にテレポートした！金縛り効果を受けたが防具が防いだ！(耐金縛り)");
            } else {
              p.paralyzeTurns = 10;
              ml.push("階段の上にテレポートした！しかし金縛りになった！(10ターン)");
            }
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
      const _warpOx = kind === "player" ? p.x : target.x;
      const _warpOy = kind === "player" ? p.y : target.y;
      const dest = randomTeleportDest(dg, _warpOx, _warpOy, (x, y) => !monsterAt(dg, x, y));
      if (!dest) { ml.push("テレポートに失敗した。"); break; }
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
        target.paralyzed = true; target._paralyzeHp = target.hp;
        if (target.isBoss) target.paralyzeTurns = Math.max(target.paralyzeTurns||0, _pzBlessed ? 20 : 10);
        if (_pzBlessed) { target.paralyzeHits = 2; ml.push(`${target.name}は強い金縛りになった！2回アクションが必要！`); }
        else ml.push(`${target.name}は金縛りになった！動けない！`);
        break;
      }
      if (kind === "player") {
        if (isStatusImmune(p, ml)) break;
        if (hasAbility(p.armor, "paralyze_proof")) {
          ml.push("金縛り効果を受けたが防具が防いだ！(耐金縛り)");
        } else {
          p.paralyzeTurns = _pzBlessed ? 20 : 10;
          ml.push(`金縛りになった！(${p.paralyzeTurns}ターン)${_pzBlessed ? "(強金縛り)" : ""}`);
        }
        break;
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
    case "sleep": {
      const _slBlessed = blMult > 1, _slCursed = blMult < 1;
      if (_slCursed) {
        // 呪い→透視（眠りの薬の呪い効果と同じ）
        dg.monsterSenseActive = true;
        if (kind === "monster") ml.push(`${target.name}への眠り効果が反転！フロアの敵が全て見え続ける！【呪→透視】`);
        else if (kind === "player") ml.push("眠り効果が反転！フロアの敵が全て見え続ける！【呪→透視】");
        else ml.push("魔法弾は効果なく消えた。");
        break;
      }
      const st = _slBlessed ? 12 : 6;
      if (kind === "monster") {
        if (isStatusImmune(target, ml, target.name)) break;
        target.sleepTurns = (target.sleepTurns || 0) + st;
        ml.push(`${target.name}は眠りに落ちた！(${st}ターン)${_slBlessed ? "【祝=強眠】" : ""}`);
        break;
      }
      if (kind === "player") {
        if ((p.statusImmune || 0) > 0) { ml.push("状態防止中のため眠れなかった！"); break; }
        if (hasAbility(p.armor, "sleep_proof")) {
          ml.push("しかし眠れなかった！(耐眠)");
        } else {
          p.sleepTurns = (p.sleepTurns || 0) + st;
          ml.push(`眠りに落ちた...(${st}ターン)${_slBlessed ? "【祝=強眠】" : ""}`);
        }
        break;
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
    case "seal": {
      const _seBlessed = blMult > 1, _seCursed = blMult < 1;
      if (_seCursed) {
        // 呪い：敵→特技使用率100%、プレイヤー→MP封印解除
        if (kind === "monster") {
          target.alwaysUseSpecial = true;
          ml.push(`${target.name}の特技使用率が100%になった！【呪】`);
          break;
        }
        if (kind === "player") {
          p.mpCooldownTurns = 0;
          ml.push("MP封印が解けた！【呪→解封】");
          break;
        }
      } else {
        if (kind === "monster") {
          if (isStatusImmune(target, ml, target.name)) break;
          target.sealed = true;
          target.sealedTurns = Math.max(target.sealedTurns || 0, target.isBoss ? 20 : 9999);
          ml.push(`${target.name}は封印された！`);
          if (_seBlessed) {
            if (target.isBoss && target._preSlowSpeed === undefined) target._preSlowSpeed = target.speed;
            target.speed = Math.max(0.25, (target.speed || 1) * 0.5);
            if (target.isBoss) target.bossSlowTurns = (target.bossSlowTurns || 0) + 10;
            ml.push(`さらに${target.name}は鈍足になった！(祝福)`);
          }
          break;
        }
        if (kind === "player") {
          p.mpCooldownTurns = (p.mpCooldownTurns || 0) + (_seBlessed ? 100 : 50);
          ml.push(`魔力が封じられた！(MP封印${_seBlessed ? 100 : 50}ターン)`);
          if (_seBlessed) {
            if (hasAbility(p.armor, "slow_proof")) {
              ml.push("鈍足効果を受けたが防具が防いだ！(耐鈍足)");
            } else {
              p.slowTurns = (p.slowTurns || 0) + 10;
              ml.push("さらに鈍足10ターン！(祝福)");
            }
          }
          break;
        }
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
              ml.push(`${_dname_item(target)}が呪いで割れた！中身が飛び出した！【呪】`);
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
          if (target.isBoss && target._preSlowSpeed === undefined) target._preSlowSpeed = target.speed;
          target.speed = Math.max(0.25, (target.speed || 1) * 0.5);
          if (target.isBoss) target.bossSlowTurns = (target.bossSlowTurns || 0) + 10;
          ml.push(`${target.name}が呪いで鈍足になった！【呪】`);
        } else {
          const _bh = Math.round(rng(10, 20) * blMult);
          if (target.kind === "undead") {
            target.hp -= _bh; ml.push(`${target.name}はアンデッドのため${_bh}ダメージを受けた！`);
            if (target.hp <= 0) killMonster(target, dg, p, ml, luFn);
          } else {
            target.hp = Math.min(target.maxHp, target.hp + _bh);
            ml.push(`${target.name}は祝福の光を浴び、HPが${_bh}回復した！${_bwBlessed ? "（祝福）" : ""}`);
          }
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
          const _pool = shuffle([..._inv]).slice(0, _count);
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
          // 呪われた呪いの杖→敵を回復する（反転）（アンデッドはさらに反転してダメージ）
          const _ch = rng(10, 20);
          if (target.kind === "undead") {
            target.hp -= _ch; ml.push(`${target.name}はアンデッドのため${_ch}ダメージを受けた！`);
            if (target.hp <= 0) killMonster(target, dg, p, ml, luFn);
          } else {
            target.hp = Math.min(target.maxHp, target.hp + _ch);
            ml.push(`${target.name}は呪いの魔法で回復した！${_ch}HP【呪→回復】`);
          }
        } else {
          if (target.isBoss && target._preSlowSpeed === undefined) target._preSlowSpeed = target.speed;
          target.speed = Math.max(0.25, (target.speed || 1) * 0.5);
          if (target.isBoss) target.bossSlowTurns = (target.bossSlowTurns || 0) + 10;
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
          const _pool = shuffle([..._inv]).slice(0, _count);
          for (const _t of _pool) { _t.cursed = true; _t.blessed = false; _t.bcKnown = true; ml.push(`${_t.name}が呪われた！【呪】`); }
          if (_cwBlessed) ml.push("（祝福された呪いの杖の力で2つ呪われた！）");
        }
        break;
      }
      ml.push("魔法弾は効果なく消えた。");
      break;
    }
    case "confuse": {
      const _cfBlessed = blMult > 1, _cfCursed = blMult < 1;
      if (_cfCursed) {
        /* 呪い：必中状態付与（混乱の薬の呪い効果と同じ） */
        if (kind === "monster") { target.confusedTurns = 0; ml.push(`${target.name}の混乱が解けた！`); break; }
        if (kind === "player") {
          p.confusedTurns = 0;
          p.sureHitTurns = (p.sureHitTurns || 0) + 100;
          ml.push("頭が冴えた！混乱が消え、必中状態になった！(100ターン)【呪→必中】");
          break;
        }
        ml.push("魔法弾は効果なく消えた。"); break;
      }
      if (kind === "monster") {
        if (isStatusImmune(target, ml, target.name)) break;
        const _cfTurns = _cfBlessed ? 40 : 20;
        target.confusedTurns = (target.confusedTurns || 0) + _cfTurns;
        ml.push(`${target.name}が混乱した！(${target.confusedTurns}ターン)${_cfBlessed ? "【祝=強混乱】" : ""}`);
        break;
      }
      if (kind === "player") {
        if (hasAbility(p.armor, "confuse_proof")) {
          ml.push("混乱効果を受けたが防具が防いだ！(耐混乱)");
        } else {
          const _cfTurns = _cfBlessed ? 10 : 5;
          p.confusedTurns = (p.confusedTurns || 0) + _cfTurns;
          ml.push(`混乱した！(${p.confusedTurns}ターン)${_cfBlessed ? "【祝=強混乱】" : ""}`);
        }
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
        const _dkBaseTurns = _dkBlessed ? 9999 : (target.isBoss ? 25 : 50);
        target.darknessTurns = _dkBaseTurns;
        target.darkDir = null;
        target.aware = false;
        ml.push(`${target.name}は暗闇に包まれた！${_dkBlessed ? "(永続)" : `(${_dkBaseTurns}ターン)`}`);
        break;
      }
      if (kind === "player") {
        if (hasAbility(p.armor, "darkness_proof")) {
          ml.push("暗闇効果を受けたが防具が防いだ！(耐暗闇)");
        } else {
          p.darknessTurns = (p.darknessTurns || 0) + (_dkBlessed ? 40 : 20);
          ml.push(`暗闇に包まれた！視界が1マスになる！(${_dkBlessed ? 40 : 20}ターン)${_dkBlessed ? "(祝福)" : ""}`);
        }
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
        const _bwBaseTurns = _bwBlessed ? 9999 : (target.isBoss ? 25 : 50);
        target.fleeingTurns = _bwBaseTurns;
        ml.push(`${target.name}は幻惑状態になり逃げ出した！${_bwBlessed ? "(永続)" : `(${_bwBaseTurns}ターン)`}`);
        break;
      }
      if (kind === "player") {
        if (hasAbility(p.armor, "bewitch_proof")) {
          ml.push("幻惑効果を受けたが防具が防いだ！(耐惑わし)");
        } else {
          p.bewitchedTurns = (p.bewitchedTurns || 0) + (_bwBlessed ? 100 : 50);
          ml.push(`幻惑された！周囲の見た目がおかしくなった！(${p.bewitchedTurns}ターン)${_bwBlessed ? "(祝福)" : ""}`);
        }
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
    case "fire_wand": {
      const _fwBlessed = blMult > 1, _fwCursed = blMult < 1;
      const _fwOilyCheck = (char) => (char.oilyTurns||0)>0 || dg.oilyTiles?.some(t=>t.x===char.x&&t.y===char.y);
      if (!_fwCursed && isFireExplosionNullified(dg, p)) {
        ml.push((p.fireExplosionNullTurns || 0) > 0
          ? `炎と爆発が不発にされた！（残り${p.fireExplosionNullTurns}ターン）`
          : "呪われた爆発の魔方陣が炎を打ち消した！");
        break;
      }
      if (_fwCursed) {
        /* 呪い：rng(20,30)回復（アンデッドは逆にダメージ） */
        if (kind === "monster") {
          if (target.kind === "undead") {
            const _fwcd = rng(20, 30);
            target.hp -= _fwcd; ml.push(`${target.name}はアンデッドのため${_fwcd}ダメージを受けた！【呪】`);
            if (target.hp <= 0) killMonster(target, dg, p, ml, luFn);
          } else {
            const _fwh = Math.min(rng(20, 30), target.maxHp - target.hp);
            if (_fwh > 0) { target.hp += _fwh; ml.push(`${target.name}のHPが${_fwh}回復した！【呪】`); }
            else ml.push(`${target.name}には効果がなかった。`);
          }
          break;
        }
        if (kind === "player") {
          const _fwh = Math.min(rng(20, 30), p.maxHp - p.hp);
          if (_fwh > 0) { p.hp += _fwh; ml.push(`癒しの炎に包まれた！HP+${_fwh}【呪】`); }
          else ml.push("HPは既に満タンだ。");
          break;
        }
        break;
      }
      const _fwBlessMult = _fwBlessed ? 2 : 1;
      if (kind === "monster") {
        /* 火ダルマ：回復 */
        if (target.baseKind === "firedemon") {
          const _fwHeal = Math.min(Math.round(rng(20,30) * _fwBlessMult), target.maxHp - target.hp);
          if (_fwHeal > 0) { target.hp += _fwHeal; ml.push(`炎が${target.name}を癒した！HP+${_fwHeal}`); }
          else ml.push(`${target.name}には効果がなかった。`);
          break;
        }
        const _fwOily = _fwOilyCheck(target);
        let _fwDmg = Math.max(1, Math.round(rng(20,30) * _fwBlessMult * (_fwOily ? 2 : 1)));
        _fwDmg = scaleMonFireDmg(target, _fwDmg);
        target.hp -= _fwDmg;
        ml.push(`炎の弾が${target.name}に命中！${_fwDmg}ダメージ！${_fwOily ? "油まみれ×2！" : ""}${monFireDmgLabel(target)}`);
        if (target.hp <= 0) killMonster(target, dg, p, ml, luFn);
        break;
      }
      if (kind === "player") {
        const _fwOily = _fwOilyCheck(p);
        let _fwDmg = Math.max(1, Math.round(rng(20,30) * _fwBlessMult * (_fwOily ? 2 : 1)));
        _fwDmg = reduceFireDamage(_fwDmg, p, { includeRingFire: true });
        p.deathCause = "炎の杖の魔法により";
        p.hp -= _fwDmg;
        ml.push(`炎の弾が自分に命中！${_fwDmg}ダメージ！${fireResistDamageLabel(p, { includeRingFire: true })}`);
        applyLightningToInventory(p, dg, ml, luFn, nameFn, true);
        break;
      }
      if (kind === "item") {
        if (target.type === "spellbook" || target.type === "scroll" || target.type === "potion") {
          removeFloorItem(dg, target);
          chargeShopItem(target, dg, ml);
          ml.push(`炎で${_dname_item(target)}が燃えた！`);
        } else if (target.type === "food") {
          if (!target.cooked) {
            target.value *= 2;
            cookFoodMeta(target);
            target.name = "焼いた" + target.name;
            ml.push(`${target.name}になった！`);
          } else {
            burnFoodItem(target, ml);
          }
        } else {
          ml.push(`炎が${_dname_item(target)}に当たったが何も起こらなかった。`);
        }
        break;
      }
      if (kind === "trap") {
        if (target.effect === "bone") {
          removeTrap(dg, target, ml, { message: `炎で骨が燃え尽きた！復活は阻まれた！`, p });
        } else {
          ml.push(`炎が${target.name}に当たったが何も起こらなかった。`);
        }
        break;
      }
      break;
    }
    case "ice_wand": {
      const _iwBlessed = blMult > 1, _iwCursed = blMult < 1;
      if (_iwCursed) {
        /* 呪い：対象を回復し、移動封じ状態なら解除（アンデッドは回復が逆にダメージ） */
        if (kind === "monster") {
          if (target.kind === "undead") {
            target.hp -= 20; ml.push(`${target.name}はアンデッドのため20ダメージを受けた！【呪】`);
            if (target.hp <= 0) killMonster(target, dg, p, ml, luFn);
          } else {
            const _iwh = Math.min(20, target.maxHp - target.hp);
            if (_iwh > 0) { target.hp += _iwh; ml.push(`${target.name}のHPが${_iwh}回復した！【呪】`); }
            else ml.push(`${target.name}には効果がなかった。`);
          }
          if ((target.immobileTurns||0) > 0) { target.immobileTurns = 0; ml.push(`${target.name}の移動封じが解除された！【呪】`); }
          break;
        }
        if (kind === "player") {
          const _iwh = Math.min(20, p.maxHp - p.hp);
          if (_iwh > 0) { p.hp += _iwh; ml.push(`癒しの氷に包まれた！HP+${_iwh}【呪】`); }
          else ml.push("HPは既に満タンだ。");
          if ((p.immobileTurns||0) > 0) { p.immobileTurns = 0; ml.push("移動封じが解除された！【呪】"); }
          break;
        }
        break;
      }
      const _iwBlessMult = _iwBlessed ? 2 : 1;
      const _iwTurns = _iwBlessed ? 10 : 5;
      if (kind === "monster") {
        const _iwIceMult = target.elemWeak === "ice" ? 2 : 1;
        let _iwDmg = Math.max(1, Math.round(rng(15,25) * _iwBlessMult * _iwIceMult));
        target.hp -= _iwDmg;
        target.immobileTurns = (target.immobileTurns||0) + _iwTurns;
        ml.push(`氷の弾が${target.name}に命中！${_iwDmg}ダメージ！移動封じ${_iwTurns}ターン！${_iwIceMult>1 ? "氷弱点×2！" : ""}`);
        if (target.hp <= 0) killMonster(target, dg, p, ml, luFn);
        break;
      }
      if (kind === "player") {
        let _iwDmg = reduceIceDamage(Math.max(1, Math.round(rng(15,25) * _iwBlessMult)), p);
        p.deathCause = "氷の杖の魔法により";
        p.hp -= _iwDmg;
        if (hasIceResist(p)) {
          ml.push(`氷の弾が自分に命中！${_iwDmg}ダメージ！${iceResistDamageLabel(p)}・移動封じ無効`);
        } else if (isPlayerOnWater(p, dg)) {
          ml.push(`氷の弾が自分に命中！${_iwDmg}ダメージ！`);
          applyWaterIceFreeze(p, dg, ml, _iwTurns);
        } else {
          p.immobileTurns = (p.immobileTurns||0) + _iwTurns;
          ml.push(`氷の弾が自分に命中！${_iwDmg}ダメージ！移動封じ${_iwTurns}ターン！`);
        }
        break;
      }
      break;
    }
    case "godsparkwand": {
      /* 呪われた爆発の魔方陣：雷を不発にする */
      if (hasCursedExplosionPentacle(dg)) { ml.push("呪われた爆発の魔方陣がゴッドスパークを打ち消した！"); break; }
      const _gsBlessed = blMult > 1, _gsCursed = blMult < 1;
      if (_gsCursed) {
        /* 呪い：対象を100回復 */
        if (kind === "monster") {
          const _gsh = Math.min(100, target.maxHp - target.hp);
          if (_gsh > 0) { target.hp += _gsh; ml.push(`${target.name}のHPが${_gsh}回復した！【呪】`); }
          else ml.push(`${target.name}には効果がなかった。`);
          break;
        }
        if (kind === "player") {
          const _gsh = Math.min(100, p.maxHp - p.hp);
          if (_gsh > 0) { p.hp += _gsh; ml.push(`神の奇跡！HP+${_gsh}【呪】`); }
          else ml.push("HPは既に満タンだ。");
          break;
        }
        break;
      }
      const _gsDmg = _gsBlessed ? 200 : 100;
      if (kind === "monster") {
        target.hp -= _gsDmg;
        ml.push(`ゴッドスパーク炸裂！${target.name}に${_gsDmg}ダメージ！${_gsBlessed ? "【祝】" : ""}`);
        if (target.hp <= 0) killMonster(target, dg, p, ml, luFn);
        break;
      }
      if (kind === "player") {
        const _gsSelfDmg = reduceLightningDamage(_gsDmg, p);
        p.deathCause = "ゴッドスパークの杖により";
        p.hp -= _gsSelfDmg;
        ml.push(`ゴッドスパーク炸裂！自分に${_gsSelfDmg}ダメージ！${lightningResistDamageLabel(p)}${_gsBlessed ? "【祝】" : ""}`);
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
          ml.push(`雷撃で${resolveItemName(target, nameFn)}が割れた！`);
          scatterPotContents(target, dg, target.x, target.y, p, ml, luFn, nameFn);
        } else if (target.type === "bottle") {
          removeFloorItem(dg, target);
          chargeShopItem(target, dg, ml);
          ml.push(`${target.name}が雷撃で砕けた！`);
        } else if (target.type === "food") {
          if (!target.cooked) {
            target.value *= 2;
            cookFoodMeta(target);
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
        if (target.permanent) { ml.push(`${target.name}は破壊できない！`); break; }
        removeTrap(dg, target, ml, { message: `雷撃で${target.name}が破壊された！`, p });
        break;
      }
      break;
    }
    case "vitality_swap": {
      const _vsBless = blMult > 1, _vsCurse = blMult < 1;
      if (kind === "player") {
        /* 自分に振っても交換は起きないが、祝福・呪いの効果は出る */
        if (_vsBless) {
          /* 祝福：「相手のHPを1にする」効果が自分に返ってくる */
          p.hp = 1;
          ml.push("祝力が逆流して自分に！HPが1になった！");
        } else if (_vsCurse) {
          /* 呪い：通常通り自分のHPが1に */
          p.hp = 1;
          ml.push("呪いが自分に返ってきた！HPが1になった！【呪】");
        } else {
          ml.push("何も起こらなかった。");
        }
        break;
      }
      if (kind === "monster") {
        if (target.isBoss) {
          /* ボス：HP交換は無効、現在HPの4分の1ダメージだけ与える */
          const _bossDmg = Math.max(1, Math.floor(target.hp / 4));
          target.hp -= _bossDmg;
          ml.push(`${target.name}は体力交換を跳ね返した！${_bossDmg}ダメージ！`);
          if (target.hp <= 0) killMonster(target, dg, p, ml, luFn);
          break;
        }
        const _pOldHp = p.hp;
        const _mOldHp = target.hp;
        p.hp      = Math.min(p.maxHp,      Math.max(1, _mOldHp));
        target.hp = Math.min(target.maxHp, Math.max(1, _pOldHp));
        ml.push(`${target.name}と体力を入れ替えた！(自分 ${_pOldHp}→${p.hp}HP)`);
        if (_vsBless) {
          target.hp = 1;
          ml.push(`${target.name}のHPが1になった！`);
        }
        if (_vsCurse) {
          p.hp = 1;
          ml.push("呪いの代償で自分のHPが1になった！【呪】");
        }
        break;
      }
      ml.push("何も起こらなかった。");
      break;
    }
    case "wish":
      /* 願いは useItemActions の wand_wave で UI を開く。ここは壊した時など */
      ml.push("願いの力が空に散った…（願いにはならなかった）");
      break;
    default:
      /* 未登録の effect が渡された場合は警告 (items.js WANDS への追加を忘れずに) */
      console.warn(`[applyWandEffect] 未登録の effect: "${eff}" — applyWandEffect の switch に case を追加してください`);
  }
}

export function fireWandBolt(p, dg, eff, dx, dy, ml, luFn, bbFn, blMult = 1, nameFn = null) {
  /* 呪われた軟化：1マス先に壊せる壁を生成（穴掘り呪いと同一挙動） */
  if (eff === "soften" && blMult < 1) {
    const wx = p.x + dx, wy = p.y + dy;
    if (wx >= 0 && wx < MW && wy >= 0 && wy < MH && !(p.x === wx && p.y === wy)) {
      const _mon = monsterAt(dg, wx, wy);
      if (_mon) {
        if (!consumeBarrier(_mon, ml)) {
          const _dmg = rng(5, 15);
          _mon.hp -= _dmg;
          ml.push(`壁の魔法が${_mon.name}に${_dmg}ダメージ！`);
          if (_mon.hp <= 0) killMonster(_mon, dg, p, ml, luFn);
        }
      } else if (dg.map[wy][wx] === T.FLOOR) {
        dg.map[wy][wx] = T.BWALL;
        const _sfPc = dg.pentacles?.find(pc => pc.x === wx && pc.y === wy);
        if (_sfPc) { dg.pentacles = dg.pentacles.filter(pc => pc !== _sfPc); ml.push(`壁が${_sfPc.name}を押し潰した！`); }
        ml.push("壊せる壁が出現した！");
      } else {
        ml.push("魔法弾は消えた。");
      }
    } else {
      ml.push("魔法弾は消えた。");
    }
    return;
  }
  /* 呪われた穴掘り：1マス先に壊せる壁を生成（敵がいたらダメージのみ） */
  if (eff === "dig" && blMult < 1) {
    const wx = p.x + dx, wy = p.y + dy;
    if (wx >= 0 && wx < MW && wy >= 0 && wy < MH && !(p.x === wx && p.y === wy)) {
      const _mon = monsterAt(dg, wx, wy);
      if (_mon) {
        if (!consumeBarrier(_mon, ml)) {
          const _dmg = rng(5, 15);
          _mon.hp -= _dmg;
          ml.push(`壁の魔法が${_mon.name}に${_dmg}ダメージ！`);
          if (_mon.hp <= 0) killMonster(_mon, dg, p, ml, luFn);
        }
      } else if (dg.map[wy][wx] === T.FLOOR) {
        dg.map[wy][wx] = T.BWALL;
        const _digPc = dg.pentacles?.find(pc => pc.x === wx && pc.y === wy);
        if (_digPc) { dg.pentacles = dg.pentacles.filter(pc => pc !== _digPc); ml.push(`壁が${_digPc.name}を押し潰した！`); }
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
  const _wandColors = {
    lightning:"#88ccff", slow:"#20d0d0", paralyze:"#ffcc00", sleep:"#80ff40",
    confuse:"#ff40ff", darkness:"#606080", bewitch:"#ff80c0", levelup:"#ffff60",
    seal:"#8040e0", knockback:"#20e0c0", swap:"#ff8800", dig:"#aa8844",
    leap:"#40ff80", ice_wand:"#80ddff", curse_wand:"#9020b0", blowback_wand:"#20e0c0",
    soften:"#c8a060", vitality_swap:"#ff2255",
  };
  /* 重力の魔方陣：飛びつきを無効化（プレイヤーが重力ゾーンにいる場合） */
  if (eff === "leap" && blMult >= 1 && hasGravityPentacle(dg, p.x, p.y)) {
    ml.push("重力の魔方陣の力で飛びつきが無効になった！");
    return;
  }
  const _boltClr = _wandColors[eff] || "#a050f0";
  let lastX = p.x, lastY = p.y;
  let _fdx = dx, _fdy = dy, _cx = p.x, _cy = p.y;
  for (let d = 1; d < MW + MH; d++) {
    /* 杖の魔法弾は風で曲がらない */
    const _st = stepProjectile(dg, _cx, _cy, _fdx, _fdy, { wind: false });
    _fdx = _st.dx; _fdy = _st.dy;
    const tx = _st.x, ty = _st.y;
    _cx = tx; _cy = ty;
    if (inMagicSealRoom(tx, ty, dg)) { ml.push("魔法弾が魔封じの魔方陣で消えた！"); return; }
    if (tx < 0 || tx >= MW || ty < 0 || ty >= MH || dg.map[ty][tx] === T.WALL || dg.map[ty]?.[tx] === T.BWALL) {
      if (eff === "soften") {
        /* 最外周の壁：跳ね返って自分に当たる */
        if (tx <= 0 || tx >= MW - 1 || ty <= 0 || ty >= MH - 1) {
          ml.push("魔法弾が外周の壁に跳ね返った！");
          if (lastX !== p.x || lastY !== p.y) pushAnim({ type:"projectileReturn", fromX:lastX, fromY:lastY, toX:p.x, toY:p.y, color:"#c8a060" });
          applyWandEffect("soften", "player", p, -dx, -dy, dg, p, ml, luFn, null, blMult);
          return;
        }
        /* 内部の壁：1マスをランダムな食料に変化 */
        if (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) {
          const _sfFood = { ...genFood(), id: uid(), x: tx, y: ty };
          dg.map[ty][tx] = T.FLOOR;
          dg.items.push(_sfFood);
          ml.push(`軟化の魔法弾が壁を溶かした！${_sfFood.name}が現れた！`);
        } else {
          ml.push("魔法弾は壁に消えた。");
        }
        return;
      }
      if (eff === "dig") {
        const _digMax = blMult > 1 ? 20 : 10; /* 祝福：2倍距離 */
        let dug = 0, cx = tx, cy = ty;
        while (dug < _digMax && cx > 0 && cx < MW - 1 && cy > 0 && cy < MH - 1 && (dg.map[cy][cx] === T.WALL || dg.map[cy][cx] === T.BWALL)) {
          /* 壁埋めアイテムを解放 */
          const _wi = dg.items.find(i => i.x === cx && i.y === cy && i.wallEmbedded);
          if (_wi) { delete _wi.wallEmbedded; _wi.discovered = true; }
          dg.map[cy][cx] = T.FLOOR;
          wallBreakDrop(dg, cx, cy);
          dug++; cx += _fdx; cy += _fdy;
        }
        ml.push(dug > 0 ? `穴掘りの魔法弾が壁を${dug}マス掘り進んだ！` : "魔法弾は壁に消えた。");
        return;
      }
      if (eff === "leap") {
        if (blMult >= 1) { p.x = lastX; p.y = lastY; if ((p.immobileTurns||0) > 0) { p.immobileTurns = 0; ml.push("移動封じが解けた！"); } ml.push("壁の前に飛びついた！"); return; }
        // 呪い：跳ね返って自分に当たる → プレイヤーがランダムテレポート
        ml.push("魔法弾が跳ね返って自分に当たった！【呪】");
        if (lastX !== p.x || lastY !== p.y) pushAnim({ type: "projectileReturn", fromX: lastX, fromY: lastY, toX: p.x, toY: p.y, color: _boltClr });
        const _lpPreX = p.x, _lpPreY = p.y;
        applyWandEffect(eff, "player", p, -_fdx, -_fdy, dg, p, ml, luFn, bbFn, blMult);
        if (p.x !== _lpPreX || p.y !== _lpPreY) {
          pushAnim({ type: "playerKnockback", fromX: _lpPreX, fromY: _lpPreY, toX: p.x, toY: p.y });
        }
        return;
      }
      ml.push("魔法弾は壁に跳ね返った！");
      if (lastX !== p.x || lastY !== p.y) pushAnim({ type: "projectileReturn", fromX: lastX, fromY: lastY, toX: p.x, toY: p.y, color: _boltClr });
      /* 吹き飛び前のプレイヤー位置を記録 → projectileReturn の後に slide アニメ */
      const _kbPreX = p.x, _kbPreY = p.y;
      applyWandEffect(eff, "player", p, -dx, -dy, dg, p, ml, luFn, bbFn, blMult);
      if (p.x !== _kbPreX || p.y !== _kbPreY) {
        pushAnim({ type: "playerKnockback", fromX: _kbPreX, fromY: _kbPreY, toX: p.x, toY: p.y });
      }
      return;
    }
    /* 氷の杖：射線上の水を凍らせる（通過・命中判定はその後） */
    if (eff === "ice_wand") freezeWaterTile(dg, tx, ty, ml);
    const mon = monsterAt(dg, tx, ty);
    if (mon) {
      if (eff === "leap" && blMult >= 1) { p.x = lastX; p.y = lastY; if ((p.immobileTurns||0) > 0) { p.immobileTurns = 0; ml.push("移動封じが解けた！"); } ml.push(`${mon.name}の前に飛びついた！`); return; }
      /* 魔法反射：魔法ボルトをプレイヤーに跳ね返す */
      if (mon.subtype === "magicreflect") {
        ml.push(`${mon.name}が魔法を跳ね返した！`);
        pushAnim({ type: "projectileReturn", fromX: tx, fromY: ty, toX: p.x, toY: p.y, color: _boltClr });
        applyWandEffect(eff, "player", p, -_fdx, -_fdy, dg, p, ml, luFn, bbFn, blMult);
        return;
      }
      applyWandEffect(eff, "monster", mon, _fdx, _fdy, dg, p, ml, luFn, bbFn, blMult);
      return;
    }
    const it = itemAt(dg, tx, ty);
    if (it) {
      if (eff === "leap" && blMult >= 1) { p.x = lastX; p.y = lastY; if ((p.immobileTurns||0) > 0) { p.immobileTurns = 0; ml.push("移動封じが解けた！"); } ml.push(`${it.name}の前に飛びついた！`); return; }
      /* water bottle → matching potion */
      const BOTTLE_XFORM = { slow:"鈍足の薬", paralyze:"金縛りの薬", sleep:"眠りの薬", confuse:"混乱の薬", darkness:"暗闇の薬", bewitch:"惑わしの薬", levelup:"レベルアップの薬", seal:"封印の薬" };
      if (it.effect === "water" && BOTTLE_XFORM[eff]) {
        const nm = BOTTLE_XFORM[eff];
        Object.assign(it, { name: nm, effect: eff, value: eff === "sleep" ? 4 : 0 });
        ml.push(`水が${nm}に変化した！`);
        return;
      }
      applyWandEffect(eff, "item", it, _fdx, _fdy, dg, p, ml, luFn, bbFn, blMult, nameFn);
      return;
    }
    const trap = dg.traps.find(t => t.x === tx && t.y === ty);
    if (trap) {
      trap.revealed = true;
      if (eff === "leap" && blMult >= 1) { p.x = lastX; p.y = lastY; if ((p.immobileTurns||0) > 0) { p.immobileTurns = 0; ml.push("移動封じが解けた！"); } ml.push(`${trap.name}の前に飛びついた！`); return; }
      applyWandEffect(eff, "trap", trap, _fdx, _fdy, dg, p, ml, luFn, bbFn, blMult);
      return;
    }
    const bb = dg.bigboxes?.find(b => b.x === tx && b.y === ty);
    if (bb) {
      if (eff === "leap" && blMult >= 1) { p.x = lastX; p.y = lastY; if ((p.immobileTurns||0) > 0) { p.immobileTurns = 0; ml.push("移動封じが解けた！"); } ml.push(`${bb.name}の前に飛びついた！`); return; }
      applyWandEffect(eff, "bigbox", bb, _fdx, _fdy, dg, p, ml, luFn, bbFn, blMult);
      return;
    }
    /* 石像：飛びつきは前へ。それ以外は applyWandEffect（位置系は壊さず、穴掘り・軟化は敵なし破壊） */
    if (statueAt(dg, tx, ty)) {
      const st = statueAt(dg, tx, ty);
      if (eff === "leap" && blMult >= 1) {
        p.x = lastX; p.y = lastY;
        if ((p.immobileTurns || 0) > 0) { p.immobileTurns = 0; ml.push("移動封じが解けた！"); }
        ml.push(`${st.name}の前に飛びついた！`);
        return;
      }
      applyWandEffect(eff, "statue", st, _fdx, _fdy, dg, p, ml, luFn, bbFn, blMult, nameFn);
      return;
    }
    lastX = tx; lastY = ty;
  }
  if (eff === "leap" && blMult >= 1) { p.x = lastX; p.y = lastY; if ((p.immobileTurns||0) > 0) { p.immobileTurns = 0; ml.push("移動封じが解けた！"); } ml.push("虚空の先に飛びついた！"); return; }
  ml.push("魔法弾は虚空に消えた。");
}

/* ===== MONSTER LIGHTNING WAND (fires from cx,cy, checks player position) ===== */
export function monsterFireLightning(cx, cy, dg, pl, dx, dy, ml, luFn, bbFn, monName = "モンスター", nameFn = null, killerMon = null, blessed = false) {
  /* 杖の雷撃：判定・アニメとも風で曲がらない */
  pushMonsterBoltAnim(cx, cy, dx, dy, dg, pl, "lightning", false);
  let _fdx = dx, _fdy = dy, _cx = cx, _cy = cy;
  for (let d = 1; d < MW + MH; d++) {
    const _st = stepProjectile(dg, _cx, _cy, _fdx, _fdy, { wind: false });
    _fdx = _st.dx; _fdy = _st.dy;
    const tx = _st.x, ty = _st.y;
    _cx = tx; _cy = ty;
    if (inMagicSealRoom(tx, ty, dg)) { ml.push("魔法弾が魔封じの魔方陣で消えた！"); return; }
    if (tx < 0 || tx >= MW || ty < 0 || ty >= MH || dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) {
      if (killerMon && !consumeBarrier(killerMon, ml)) {
        const _wdmg = Math.round(rng(15, 25) * (blessed ? 2 : 1));
        killerMon.hp -= _wdmg;
        ml.push(`雷撃が壁に跳ね返り${killerMon.name}を直撃！${_wdmg}ダメージ！`);
        pushLightningAnim(killerMon.x, killerMon.y);
        if (killerMon.hp <= 0) killMonster(killerMon, dg, pl, ml, luFn);
      } else if (!killerMon) {
        ml.push("魔法弾は壁に消えた。");
      }
      return;
    }
    if (tx === pl.x && ty === pl.y) {
      /* 祝福された聖域の魔方陣は飛び道具（雷撃）を防ぐ */
      const _lBlessedSanc = dg.pentacles?.some(pc => pc.kind === "sanctuary" && pc.blessed && pc.x === pl.x && pc.y === pl.y);
      if (_lBlessedSanc) { ml.push("祝福された聖域の加護が雷撃を防いだ！"); return; }
      /* 反射の鎧: 雷撃を発射源のモンスターに反射 */
      const _hasReflect = hasAbility(pl.armor, "wand_reflect");
      if (_hasReflect) {
        ml.push("反射の鎧が雷撃を跳ね返した！");
        const _srcMon = monsterAt(dg, cx, cy);
        if (_srcMon) {
          if (!consumeBarrier(_srcMon, ml)) {
            const _rdmg = rng(15, 25);
            _srcMon.hp -= _rdmg;
            ml.push(`跳ね返った雷撃が${monName}を直撃！${_rdmg}ダメージ！`);
            pushLightningAnim(_srcMon.x, _srcMon.y);
            if (_srcMon.hp <= 0) killMonster(_srcMon, dg, pl, ml, luFn);
          }
        }
        return;
      }
      /* ゴムゴムの胴 / 万能耐性: 雷ダメージ半減・所持品破壊を防ぐ */
      const _hasLightRes = hasLightningResist(pl);
      let dmg = Math.round(rng(15, 25) * (blessed ? 2 : 1));
      dmg = reduceLightningDamage(dmg, pl);
      if (inCursedMagicSealRoom(pl.x, pl.y, dg)) dmg *= 2;
      pl.deathCause = `${monName}の雷撃により`;
      pl.hp -= dmg;
      ml.push(`雷撃が命中！${dmg}ダメージ！${lightningResistDamageLabel(pl)}`);
      pushLightningAnim(pl.x, pl.y);
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
      if (mon.subtype === "magicreflect" && killerMon) {
        ml.push(`${mon.name}が雷撃を跳ね返した！`);
        if (!consumeBarrier(killerMon, ml)) {
          const _rdmg = rng(15, 25);
          killerMon.hp -= _rdmg;
          ml.push(`跳ね返った雷撃が${killerMon.name}を直撃！${_rdmg}ダメージ！`);
          pushLightningAnim(killerMon.x, killerMon.y);
          if (killerMon.hp <= 0) killMonster(killerMon, dg, pl, ml, luFn);
        }
      } else {
        applyWandEffect("lightning", "monster", mon, dx, dy, dg, pl, ml, luFn, bbFn, blessed ? 2 : 1, null, 0, killerMon);
      }
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
    if (statueAt(dg, tx, ty)) {
      hitStatueWithAction(dg, tx, ty, pl, ml, luFn, pl?.depth, {
        breaks: true,
        itemDeps: getFixtureItemDeps(),
      });
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

const _BW_DIRS = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];

function _wandBreakSnapshot(wand) {
  return {
    type: "wand",
    effect: wand.effect,
    charges: wand.charges ?? 0,
    blessed: !!wand.blessed,
    cursed: !!wand.cursed,
    name: wand.name,
  };
}

function _centerWandTarget(dg, cx, cy, p) {
  if (p.x === cx && p.y === cy) return { kind: "player", t: p };
  const mon = monsterAt(dg, cx, cy);
  if (mon) return { kind: "monster", t: mon };
  const it = itemAt(dg, cx, cy);
  if (it) return { kind: "item", t: it };
  const trap = dg.traps?.find(t => t.x === cx && t.y === cy);
  if (trap) { trap.revealed = true; return { kind: "trap", t: trap }; }
  const bb = dg.bigboxes?.find(b => b.x === cx && b.y === cy);
  if (bb) return { kind: "bigbox", t: bb };
  const st = dg.statues?.find(s => s.x === cx && s.y === cy);
  if (st) return { kind: "statue", t: st };
  return null;
}

/** 壊し効果の中心から見た周囲8マスの対象（プレイヤー含む） */
function _collectBreakAdjacentTargets(dg, cx, cy, p) {
  const targets = [];
  for (const [adx, ady] of _BW_DIRS) {
    const ax = cx + adx, ay = cy + ady;
    if (ax < 0 || ax >= MW || ay < 0 || ay >= MH) continue;
    if (p.x === ax && p.y === ay) {
      targets.push({ kind: "player", t: p, dx: adx, dy: ady });
      continue;
    }
    const mon = monsterAt(dg, ax, ay);
    if (mon) { targets.push({ kind: "monster", t: mon, dx: adx, dy: ady }); continue; }
    const it = itemAt(dg, ax, ay);
    if (it) { targets.push({ kind: "item", t: it, dx: adx, dy: ady }); continue; }
    const trap = dg.traps.find(t2 => t2.x === ax && t2.y === ay);
    if (trap) { trap.revealed = true; targets.push({ kind: "trap", t: trap, dx: adx, dy: ady }); continue; }
    const bb = dg.bigboxes?.find(b => b.x === ax && b.y === ay);
    if (bb) { targets.push({ kind: "bigbox", t: bb, dx: adx, dy: ady }); continue; }
    const st = statueAt(dg, ax, ay);
    if (st) targets.push({ kind: "statue", t: st, dx: adx, dy: ady });
  }
  return targets;
}

function _pitfallBlockedAt(dg, cx, cy) {
  return dg.traps.find(t => t.x === cx && t.y === cy) ||
    dg.items.some(i => i.x === cx && i.y === cy) ||
    dg.springs?.some(s => s.x === cx && s.y === cy) ||
    dg.bigboxes?.some(b => b.x === cx && b.y === cy) ||
    dg.pentacles?.some(pc => pc.x === cx && pc.y === cy) ||
    dg.oilyTiles?.some(t => t.x === cx && t.y === cy) ||
    statueAt(dg, cx, cy) ||
    dg.map[cy][cx] === T.SD || dg.map[cy][cx] === T.SU;
}

function _damageWandBreakCenter(dg, p, cx, cy, baseDmg, deathCause, ml, luFn, label) {
  let dmg = baseDmg;
  if (inCursedMagicSealRoom(cx, cy, dg)) dmg *= 2;
  if (p.x === cx && p.y === cy) {
    p.deathCause = deathCause;
    p.hp -= dmg;
    ml.push(`${label}爆発で${dmg}ダメージ！`);
    return;
  }
  const mon = monsterAt(dg, cx, cy);
  if (mon && !consumeBarrier(mon, ml)) {
    mon.hp -= dmg;
    ml.push(`${label}爆発で${mon.name}に${dmg}ダメージ！`);
    if (mon.hp <= 0) killMonster(mon, dg, p, ml, luFn);
  }
}

/** 残回数ありの杖が破壊されたとき、指定座標を中心に壊し効果を発動 */
export function triggerWandBreakEffect(wand, cx, cy, dg, p, ml, luFn, opts = {}) {
  const { skipSealCheck = false, singleTargetKind = null, singleTarget = null, effectDx = 0, effectDy = 0 } = opts;
  if (!wand || wand.type !== "wand") return { triggered: false };
  const blMult = wand.blessed ? 1.5 : wand.cursed ? 0.5 : 1;
  if ((wand.charges ?? 0) <= 0) {
    if (!singleTargetKind || !singleTarget) return { triggered: false };
    if (!skipSealCheck && inMagicSealRoom(cx, cy, dg)) {
      ml.push("魔法が封印されている！効果は発動しなかった。");
      return { triggered: false };
    }
    const _edx = effectDx || 1;
    const _edy = effectDy || 0;
    applyWandEffect(wand.effect, singleTargetKind, singleTarget, _edx, _edy, dg, p, ml, luFn, null, blMult);
    return { triggered: true, zeroChargeSingle: true };
  }
  if (!skipSealCheck && inMagicSealRoom(cx, cy, dg)) {
    ml.push("魔法が封印されている！効果は発動しなかった。");
    return { triggered: false };
  }
  const times = Math.max(1, Math.ceil((wand.charges ?? 0) / 2));
  const center = { x: cx, y: cy };
  for (let t = 0; t < times; t++) breakWandAoE(p, dg, wand.effect, ml, luFn, blMult, center);
  return { triggered: true };
}

/** 床の杖を除去してから壊し効果を発動（applyWandEffect 等から呼ぶ） */
export function destroyFloorWand(dg, wand, p, ml, luFn, destroyMsg = null) {
  if (!wand || wand.type !== "wand") return false;
  const snap = _wandBreakSnapshot(wand);
  const cx = wand.x, cy = wand.y;
  removeFloorItem(dg, wand);
  chargeShopItem(wand, dg, ml);
  if (destroyMsg) ml.push(destroyMsg);
  triggerWandBreakEffect(snap, cx, cy, dg, p, ml, luFn);
  return true;
}

export function breakWandAoE(p, dg, eff, ml, luFn, blMult = 1, center = null) {
  const cx = center?.x ?? p.x;
  const cy = center?.y ?? p.y;
  if (eff === "leap") { ml.push("杖が壊れたが何も起こらなかった。"); return; }
  if (eff === "dig") {
    if (blMult < 1) {
      /* 呪われた穴掘りの杖を壊した：周囲8方向を壊せる壁で囲む（敵がいたらダメージのみ） */
      let walled = 0;
      for (const [adx, ady] of _BW_DIRS) {
        const wx = cx + adx, wy = cy + ady;
        if (wx >= 0 && wx < MW && wy >= 0 && wy < MH) {
          const _mon = monsterAt(dg, wx, wy);
          if (_mon) {
            if (!consumeBarrier(_mon, ml)) {
              const _dmg = rng(5, 15);
              _mon.hp -= _dmg;
              ml.push(`壁の魔法が${_mon.name}に${_dmg}ダメージ！`);
              if (_mon.hp <= 0) killMonster(_mon, dg, p, ml, luFn);
            }
          } else if (dg.map[wy][wx] === T.FLOOR) {
            dg.map[wy][wx] = T.BWALL;
            const _digBPc = dg.pentacles?.find(pc => pc.x === wx && pc.y === wy);
            if (_digBPc) { dg.pentacles = dg.pentacles.filter(pc => pc !== _digBPc); ml.push(`壁が${_digBPc.name}を押し潰した！`); }
            walled++;
          }
        }
      }
      ml.push(walled > 0 ? "壊せる壁に囲まれた！【呪】" : "杖が壊れたが何も起こらなかった。【呪】");
      return;
    }
    ml.push("穴掘りの杖が壊れた！");
    _damageWandBreakCenter(dg, p, cx, cy, rng(8, 15), "穴掘りの杖の自壊爆発により", ml, luFn, "穴掘りの杖の");
    for (const [adx, ady] of _BW_DIRS) {
      const wx = cx + adx, wy = cy + ady;
      if (wx > 0 && wx < MW - 1 && wy > 0 && wy < MH - 1 && (dg.map[wy][wx] === T.WALL || dg.map[wy][wx] === T.BWALL)) {
        const _wi2 = dg.items.find(i => i.x === wx && i.y === wy && i.wallEmbedded);
        if (_wi2) { delete _wi2.wallEmbedded; _wi2.discovered = true; }
        dg.map[wy][wx] = T.FLOOR;
      }
    }
    if (!_pitfallBlockedAt(dg, cx, cy)) {
      dg.traps.push({ name:"落とし穴", effect:"pitfall", tile:27, id:uid(), x:cx, y:cy, revealed:true });
      ml.push(p.x === cx && p.y === cy ? "足元に落とし穴ができた！" : "その場に落とし穴ができた！");
    }
    return;
  }
  if (eff === "soften") {
    if (blMult < 1) {
      /* 呪われた軟化の杖を壊した：周囲8方向を壊せる壁で囲む（呪われた穴掘りと同一挙動） */
      let _sfcWalled = 0;
      for (const [adx, ady] of _BW_DIRS) {
        const wx = cx + adx, wy = cy + ady;
        if (wx >= 0 && wx < MW && wy >= 0 && wy < MH) {
          const _mon = monsterAt(dg, wx, wy);
          if (_mon) {
            if (!consumeBarrier(_mon, ml)) {
              const _dmg = rng(5, 15);
              _mon.hp -= _dmg;
              ml.push(`壁の魔法が${_mon.name}に${_dmg}ダメージ！`);
              if (_mon.hp <= 0) killMonster(_mon, dg, p, ml, luFn);
            }
          } else if (dg.map[wy][wx] === T.FLOOR) {
            dg.map[wy][wx] = T.BWALL;
            const _sfcPc = dg.pentacles?.find(pc => pc.x === wx && pc.y === wy);
            if (_sfcPc) { dg.pentacles = dg.pentacles.filter(pc => pc !== _sfcPc); ml.push(`壁が${_sfcPc.name}を押し潰した！`); }
            _sfcWalled++;
          }
        }
      }
      ml.push(_sfcWalled > 0 ? "壊せる壁に囲まれた！【呪】" : "杖が壊れたが何も起こらなかった。【呪】");
      return;
    }
    /* 通常/祝福：中心の防御半減50ターン＋落とし穴＋周囲に軟化効果（壁は食料に変化） */
    const _sfcEnt = _centerWandTarget(dg, cx, cy, p);
    if (_sfcEnt?.kind === "player") {
      p.defSoftenedTurns = (p.defSoftenedTurns || 0) + 50;
      ml.push("軟化の杖が壊れた！防御力が半減した！(50ターン)");
    } else if (_sfcEnt?.kind === "monster") {
      applyWandEffect("soften", "monster", _sfcEnt.t, 0, 0, dg, p, ml, luFn, null, blMult);
      ml.push("軟化の杖が壊れた！");
    } else if (_sfcEnt?.kind === "statue") {
      applyWandEffect("soften", "statue", _sfcEnt.t, 0, 0, dg, p, ml, luFn, null, blMult);
      ml.push("軟化の杖が壊れた！");
    } else {
      ml.push("軟化の杖が壊れた！");
    }
    if (!_pitfallBlockedAt(dg, cx, cy)) {
      dg.traps.push({ name:"落とし穴", effect:"pitfall", tile:27, id:uid(), x:cx, y:cy, revealed:true });
      ml.push(p.x === cx && p.y === cy ? "足元に落とし穴ができた！" : "その場に落とし穴ができた！");
    }
    for (const [adx, ady] of _BW_DIRS) {
      const ax = cx + adx, ay = cy + ady;
      if (ax < 0 || ax >= MW || ay < 0 || ay >= MH) continue;
      /* 壁（最外周を除く）→ 食料に変化 */
      if ((dg.map[ay][ax] === T.WALL || dg.map[ay][ax] === T.BWALL) &&
          ax > 0 && ax < MW - 1 && ay > 0 && ay < MH - 1) {
        const _sfbFood = { ...genFood(), id: uid(), x: ax, y: ay };
        dg.map[ay][ax] = T.FLOOR;
        dg.items.push(_sfbFood);
        ml.push(`壁が溶けて${_sfbFood.name}が現れた！`);
        continue;
      }
      if (p.x === ax && p.y === ay) { applyWandEffect("soften", "player", p, adx, ady, dg, p, ml, luFn, null, blMult); continue; }
      const _sfbMon = monsterAt(dg, ax, ay);
      if (_sfbMon) { applyWandEffect("soften", "monster", _sfbMon, adx, ady, dg, p, ml, luFn, null, blMult); continue; }
      const _sfbIt = itemAt(dg, ax, ay);
      if (_sfbIt) { applyWandEffect("soften", "item", _sfbIt, adx, ady, dg, p, ml, luFn, null, blMult); continue; }
      const _sfbTrap = dg.traps.find(t2 => t2.x === ax && t2.y === ay);
      if (_sfbTrap) { _sfbTrap.revealed = true; applyWandEffect("soften", "trap", _sfbTrap, adx, ady, dg, p, ml, luFn, null, blMult); continue; }
      const _sfbBb = dg.bigboxes?.find(b => b.x === ax && b.y === ay);
      if (_sfbBb) { applyWandEffect("soften", "bigbox", _sfbBb, adx, ady, dg, p, ml, luFn, null, blMult); continue; }
      const _sfbSt = statueAt(dg, ax, ay);
      if (_sfbSt) applyWandEffect("soften", "statue", _sfbSt, adx, ady, dg, p, ml, luFn, null, blMult);
    }
    return;
  }
  if (eff === "ice_wand") {
    let frozenCount = 0;
    for (const [adx, ady] of [[0, 0], ..._BW_DIRS]) {
      const wx = cx + adx, wy = cy + ady;
      if (wx < 0 || wx >= MW || wy < 0 || wy >= MH) continue;
      if (freezeWaterTile(dg, wx, wy, null)) frozenCount++;
    }
    if (frozenCount > 0) ml.push(`周囲${frozenCount}マスの水が凍りついた！`);
  }
  if (eff === "warp") {
    const _wCenter = _centerWandTarget(dg, cx, cy, p);
    if (_wCenter) applyWandEffect(eff, _wCenter.kind, _wCenter.t, 0, 0, dg, p, ml, luFn, null, blMult);
    for (const { kind, t } of _collectBreakAdjacentTargets(dg, cx, cy, p)) {
      applyWandEffect(eff, kind, t, 0, 0, dg, p, ml, luFn, null, blMult);
    }
    return;
  }
  /* 体力交換の杖：壊すと隣接する中で最もHPが高いモンスターとHP交換 */
  if (eff === "vitality_swap") {
    let _vsbMax = null;
    for (const [adx, ady] of _BW_DIRS) {
      const ax = cx + adx, ay = cy + ady;
      if (ax < 0 || ax >= MW || ay < 0 || ay >= MH) continue;
      const _bm = monsterAt(dg, ax, ay);
      if (_bm && (!_vsbMax || _bm.hp > _vsbMax.hp)) _vsbMax = _bm;
    }
    if (_vsbMax) {
      if (!consumeBarrier(_vsbMax, ml)) {
        applyWandEffect(eff, "monster", _vsbMax, 0, 0, dg, p, ml, luFn, null, blMult);
      }
    } else {
      ml.push("杖が壊れたが周囲にモンスターがいなかった。");
    }
    return;
  }
  const rd = pick(_BW_DIRS);
  const _defCenter = _centerWandTarget(dg, cx, cy, p);
  if (_defCenter) applyWandEffect(eff, _defCenter.kind, _defCenter.t, rd[0], rd[1], dg, p, ml, luFn, null, blMult);
  const targets = _collectBreakAdjacentTargets(dg, cx, cy, p);
  const _footBb = dg.bigboxes?.find(b => b.x === cx && b.y === cy);
  if (_footBb && !_defCenter) targets.push({ kind:"bigbox", t:_footBb, dx:rd[0], dy:rd[1] });
  for (const { kind, t, dx, dy } of targets) applyWandEffect(eff, kind, t, dx, dy, dg, p, ml, luFn, null, blMult);
}

setWandBreakEffectHandler(triggerWandBreakEffect);
