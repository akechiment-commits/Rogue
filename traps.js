import { rng, T, MW } from "./utils.js";
import { ARROW_T, makeArrow, placeItemAt } from "./items.js";

export function fireTrapPlayer(trap, p, dg, ml) {
  trap.revealed = true;
  let r = null;

  switch (trap.effect) {
    case "explode": {
      const d = rng(10, 20);
      p.deathCause = `${trap.name}により`;
      p.hp -= d;
      ml.push(`${trap.name}が発動！${d}ダメージ！`);
      const tx = trap.x,
        ty = trap.y;
      const blasted = new Set();
      for (let ddx = -1; ddx <= 1; ddx++) {
        for (let ddy = -1; ddy <= 1; ddy++) {
          if (ddx === 0 && ddy === 0) continue;
          const ax = tx + ddx,
            ay = ty + ddy;
          dg.monsters
            .filter((m) => m.x === ax && m.y === ay)
            .forEach((m) => {
              const md = rng(8, 15);
              m.hp -= md;
              ml.push(`爆風で${m.name}に${md}ダメージ！`);
            });
          for (const it of dg.items.filter((i) => i.x === ax && i.y === ay)) {
            if (it.type === "scroll") {
              blasted.add(it);
              ml.push(`巻物「${it.name}」が燃えてなくなった！`);
            } else if (it.type === "potion") {
              blasted.add(it);
              ml.push(`薬「${it.name}」が割れてなくなった！`);
            } else if (it.type === "food" && !it.cooked) {
              it.value *= 2;
              it.cooked = true;
              it.name = "焼いた" + it.name;
              ml.push(`${it.name}になった！`);
            } else if (it.type === "pot") {
              blasted.add(it);
              if (it.contents && it.contents.length > 0) {
                const ft2 = new Set([trap.id]);
                for (const ci of it.contents)
                  placeItemAt(dg, ax, ay, ci, ml, ft2);
                ml.push(`壺「${it.name}」が爆発で割れ、中身が飛び出した！`);
              } else {
                ml.push(`壺「${it.name}」が爆発で割れた！`);
              }
            }
          }
        }
      }
      if (blasted.size > 0)
        dg.items = dg.items.filter((it) => !blasted.has(it));
      dg.monsters = dg.monsters.filter((m) => m.hp > 0);
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
        const m = dg.monsters.find((m2) => m2.x === fx && m2.y === trap.y);
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
  }

  if (Math.random() < 0.3) {
    dg.traps = dg.traps.filter((t) => t !== trap);
    ml.push(`${trap.name}は壊れた。`);
  }
  return r;
}
