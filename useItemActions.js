import { useCallback } from "react";
import { MW, MH, T, rng, pick, uid, refreshFOV, DRO, monsterAt, getShops, hasAbility, hasGravityPentacle, consumeBarrier, clampDmgFixed } from "./utils.js";
import { findRoom, spawnMonsters } from "./monsters.js";
import {
  EMPTY_BOTTLE, SPELLS, TRAPS,
  applyLightningToInventory, applyPotEffect, applyPotionEffect, applyPotionToItem,
  applyWandEffect, applyWaterSplash, breakWandAoE, burnFoodItem,
  castSpellBolt, doExplosion, fireTrapItem, fireWandBolt,
  getBlessMultiplier, getFarcastMode, getIdentKey, hasCursedExplosionPentacle,
  inCursedMagicSealRoom, inMagicSealRoom, killMonster,
  makeArrow, makeMagicStone, makePiercingArrow, makePoisonArrow, makeStone,
  placeItemAt, scatterPotContents, shootArrow, soakItemIntoSpring, splashPotion,
  hasRingEffect, cookFoodMeta,
} from "./items.js";
import { _itemPickupSuffix, itemDisplayName } from "./render.js";
import { trackMonster, getDiscoveries } from "./DiscoveryTracker.js";
import { pushBoltAnim, pushProjectileAnim, pushExplosionAnim, pushAnim, pushLightningAnim, pushHealAnim, pushSplashAnim } from "./animEvents.js";

/* インベントリから消える際に装備スロットを強制解除するヘルパー */
function _forceUnequip(p, it) {
  if (p.weapon === it) p.weapon = null;
  if (p.armor  === it) p.armor  = null;
  if (p.arrow  === it) p.arrow  = null;
  if (p.rings?.includes(it)) {
    p.rings = p.rings.filter(r => r !== it);
    if (it.effect === "life_ring") {
      const _bonus = (it.plus || 0) * 5;
      p.maxHp = Math.max(1, p.maxHp - _bonus);
      p.hp = Math.min(p.hp, p.maxHp);
    }
  }
}

/* 合成獣：アイテムを飲み込むたびに速度を上げる */
function _synthMonsterSpeedup(m, ml) {
  const prev = m.speed || 0.5;
  m.speed = Math.min(3, prev + 0.5);
  /* maxAttacks を速度に合わせて更新：倍速・三倍速の際に複数回攻撃できるように */
  m.maxAttacks = Math.ceil(m.speed);
  if (m.speed !== prev) ml.push(`${m.name}の動きが速くなった！(速度${m.speed})`);
}

export function useItemActions({
  sr, setGs, setMsgs, setShowInv, setSelIdx, setShowDesc,
  setThrowMode, throwMode, setMarkerMode, markerMode, setMarkerMenuSel,
  setPutMode, putMode, setPutMenuSel, setPutPage,
  setIdentifyMode, setRevealMode,
  lu, endTurn, chgFloor, withPitfallBag,
  dnameRef, bigboxAddItem,
  onReturnToHub, dropModeRef, setFloorSelectMode, setTpSelectMode,
}) {
  const doUseItem = useCallback((idx) => {
    if (!sr.current) return;
    const { player: p, dungeon: dg } = sr.current;
    const it = p.inventory[idx];
    if (!it) return;
    if (p.sleepTurns > 0 || p.paralyzeTurns > 0) return;

    const ml = [];
    // 未識別消耗品の判定（使用前に取得）
    const _ik_reveal = (it.type === 'potion' || it.type === 'scroll') ? getIdentKey(it) : null;
    const _wasUnknown = !!(_ik_reveal && !sr.current.ident.has(_ik_reveal));
    const _revFake = _wasUnknown ? itemDisplayName(it, sr.current.fakeNames, sr.current.ident, sr.current.nicknames) : null;
    const _revReal = _wasUnknown ? it.name : null;
    if (it.type === "potion") {
      const _potBm = getBlessMultiplier(it);
      p.inventory.splice(idx, 1);
      { const _ik = getIdentKey(it); if (_ik) sr.current.ident.add(_ik); }
      // 毒回復ヘルパー
      const _curePoison = () => {
        if (p.poisoned) {
          p.poisoned = false;
          if ((p.poisonAtkLoss || 0) > 0) { p.atk += p.poisonAtkLoss; p.poisonAtkLoss = 0; }
          return true;
        }
        return false;
      };
      if (it.effect === "heal") {
        if (it.cursed) {
          // 呪い：反転→ダメージ
          const d = Math.max(1, Math.round(it.value * 0.7));
          p.deathCause = "呪われた回復薬を飲んで";
          p.hp -= d;
          ml.push(`${it.name}を飲んだ。まずい！${d}ダメージ！【呪】`);
        } else {
          // 通常/祝福：HP回復（祝福=1.5x + 全状態異常回復）
          const h = Math.min(Math.round(it.value * _potBm), p.maxHp - p.hp);
          let _hMsg;
          if (h <= 0) {
            // HPが最大：最大HP上昇（回復薬+1/+2、大回復薬+2/+4）
            const _maxHpGain = (it.value >= 30 ? 2 : 1) * (it.blessed ? 2 : 1);
            p.maxHp += _maxHpGain;
            p.hp += _maxHpGain;
            _hMsg = `${it.name}を飲んだ。HPが最大なので最大HP+${_maxHpGain}！${it.blessed ? "（祝福）" : ""}`;
          } else {
            p.hp += h;
            _hMsg = `${it.name}を飲んだ。HP+${h}${it.blessed ? "（祝福）" : ""}`;
          }
          if (it.blessed) {
            const _cured = [];
            if ((p.sleepTurns || 0) > 0) { p.sleepTurns = 0; _cured.push("睡眠"); }
            if ((p.confusedTurns || 0) > 0) { p.confusedTurns = 0; _cured.push("混乱"); }
            if ((p.slowTurns || 0) > 0) { p.slowTurns = 0; _cured.push("鈍足"); }
            if (_curePoison()) _cured.push("毒");
            if (!p.poisoned && (p.poisonAtkLoss || 0) > 0) { p.atk += p.poisonAtkLoss; p.poisonAtkLoss = 0; _cured.push("毒による攻撃力低下"); }
            if (_cured.length > 0) _hMsg += ` ${_cured.join("・")}も解消！`;
          }
          ml.push(_hMsg);
        }
      } else if (it.effect === "poison") {
        if (it.cursed) {
          // 呪い：反転→解毒薬
          const _wasPoison = _curePoison();
          const _hadAtkLoss = !p.poisoned && (p.poisonAtkLoss || 0) > 0;
          if (_hadAtkLoss) { p.atk += p.poisonAtkLoss; p.poisonAtkLoss = 0; }
          if (_wasPoison || _hadAtkLoss) {
            ml.push(`${it.name}を飲んだ。毒が体から消えた！攻撃力も回復！【呪→解毒】`);
          } else {
            ml.push(`${it.name}を飲んだ。変な味がするが…毒はかかっていなかった。【呪→解毒】`);
          }
        } else if (hasRingEffect(p, "antidote_ring")) {
          ml.push(`${it.name}を飲んだ。毒を受けたが指輪が毒を消した！`);
        } else {
          // 通常：毒状態を付与。祝福=即時ATK-3の追加ペナルティ
          p.poisoned = true;
          if (it.blessed) {
            const _extraLoss = Math.min(3, p.atk - 1);
            p.atk -= _extraLoss;
            p.poisonAtkLoss = (p.poisonAtkLoss || 0) + _extraLoss;
            ml.push(`${it.name}を飲んだ。強烈な毒を浴びた！毒状態になり攻撃力が${_extraLoss}下がった！【祝=強毒】`);
          } else {
            ml.push(`${it.name}を飲んだ。毒状態になった！攻撃力が徐々に下がっていく…`);
          }
        }
      } else if (it.effect === "fire") {
        if (!it.cursed && dg.pentacles?.some(pc => pc.kind === "explosion" && pc.cursed)) {
          ml.push(`${it.name}を飲んだが、呪われた爆発の魔方陣が炎を打ち消した！`);
        } else if (it.cursed) {
          // 呪い：反転→HP回復
          const h = Math.min(it.value, p.maxHp - p.hp);
          p.hp += h;
          ml.push(`${it.name}を飲んだ。体が温まりHP+${h}回復した！【呪→回復】`);
        } else {
          // 通常/祝福：炎ダメージ（祝福=1.5x）
          const rd = Math.max(1, Math.round((it.value + rng(-5, 5)) * _potBm));
          const d =
            hasAbility(p.armor, "fire_resist")
              ? Math.floor(rd / 2)
              : rd;
          p.deathCause = "炎の薬を飲んで";
          p.hp -= d;
          ml.push(
            `${it.name}を飲んだ。体が燃えるように熱い！${d}ダメージ！${hasAbility(p.armor, "fire_resist") ? "(耘火)" : ""}${it.blessed ? "【祝=強炎】" : ""}`,
          );
        }
      } else if (it.effect === "sleep") {
        if (it.cursed) {
          // 呪い：反転→フロア中全ての敵の位置が常に見通せる
          dg.monsterSenseActive = true;
          ml.push(`${it.name}を飲んだ。幻覚が見える...フロアの敵が全て見え続ける！【呪→透視】`);
        } else {
          // 通常/祝福：プレイヤーを眠らせる（祝福=2倍ターン）
          const t = Math.max(1, Math.round((it.value + rng(-1, 1)) * (it.blessed ? 2 : 1)));
          if (
            hasAbility(p.armor, "sleep_proof")
          ) {
            ml.push(`${it.name}を飲んだ。なんとも無い。(耔眠)`);
          } else if ((p.statusImmune || 0) > 0) {
            ml.push(`${it.name}を飲んだ。状態防止中のため効かなかった！`);
          } else {
            p.sleepTurns = (p.sleepTurns || 0) + t;
            ml.push(
              `${it.name}を飲んだ。眠くなってきた...(${t}ターン)${it.blessed ? "【祝=強眠】" : ""}`,
            );
          }
        }
      } else if (it.effect === "power") {
        if (it.cursed) {
          // 呪い：反転→攻撃力減少
          const _pv = Math.max(1, Math.round(it.value * 0.5));
          p.atk = Math.max(1, p.atk - _pv);
          ml.push(`${it.name}を飲んだ。力が抜けた...攻撃力-${_pv}【呪】`);
        } else {
          // 通常/祝福：攻撃力増加（祝福=1.5x）
          const _pv = Math.max(1, Math.round(it.value * _potBm));
          p.atk += _pv;
          ml.push(`${it.name}を飲んだ。力が湧いてきた！攻撃力+${_pv}${it.blessed ? "（祝福）" : ""}`);
        }
      } else if (it.effect === "slow") {
        if (it.cursed) {
          // 呪い：反転→2倍速
          p.hasteTurns = (p.hasteTurns || 0) + 10;
          ml.push(`${it.name}を飲んだ。体が軽くなった！(2倍速10ターン)【呪→加速】`);
        } else {
          // 通常/祝福：鈍足（祝福=2倍ターン）
          const _st = it.blessed ? 20 : 10;
          if ((p.statusImmune || 0) > 0) {
            ml.push(`${it.name}を飲んだ。状態防止中のため効かなかった！`);
          } else if (hasAbility(p.armor, "slow_proof")) {
            ml.push(`${it.name}を飲んだ。しかし防具が鈍足を防いだ！(耐鈍足)`);
          } else {
            p.slowTurns = (p.slowTurns || 0) + _st;
            ml.push(`${it.name}を飲んだ。体が重くなった...(鈍足${_st}ターン)${it.blessed ? "【祝=強鈍】" : ""}`);
          }
        }
      } else if (it.effect === "confuse") {
        if (it.cursed) {
          // 呪い：混乱解消 + 必中100ターン
          p.confusedTurns = 0;
          p.sureHitTurns = (p.sureHitTurns || 0) + 100;
          ml.push(`${it.name}を飲んだ。頭が冴えた！混乱が消え、必中状態になった！(100ターン)【呪→必中】`);
        } else if ((p.statusImmune || 0) > 0) {
          ml.push(`${it.name}を飲んだ。状態防止中のため効かなかった！`);
        } else if (hasAbility(p.armor, "confuse_proof")) {
          ml.push(`${it.name}を飲んだ。しかし防具が混乱を防いだ！(耐混乱)`);
        } else {
          // 通常/祝福：混乱（祝福=2倍ターン）
          const _cturns = it.blessed ? 10 : 5;
          p.confusedTurns = (p.confusedTurns || 0) + _cturns;
          ml.push(`${it.name}を飲んだ。頭がくらくらする！(混乱${p.confusedTurns}ターン)${it.blessed ? "【祝=強混乱】" : ""}`);
        }
      } else if (it.effect === "paralyze") {
        if (it.cursed) {
          // 呪い→状態異常防止200ターン
          p.statusImmune = (p.statusImmune || 0) + 200;
          ml.push(`${it.name}を飲んだ。状態異常を防ぐ力が宿った！(200ターン)【呪→状態防止】`);
        } else {
          // 通常/祝福：金縛り（祝福=2倍ターン）
          if ((p.statusImmune || 0) > 0) {
            ml.push(`${it.name}を飲んだ。状態防止中のため効かなかった！`);
          } else if (hasAbility(p.armor, "paralyze_proof")) {
            ml.push(`${it.name}を飲んだ。しかし防具が金縛りを防いだ！(耐金縛り)`);
          } else {
            const _pt = it.blessed ? 20 : 10;
            p.paralyzeTurns = _pt;
            ml.push(`${it.name}を飲んだ。体が動かない！(${_pt}ターン金縛り)${it.blessed ? "【祝=強金縛り】" : ""}`);
          }
        }
      } else if (it.effect === "mana") {
        if (it.cursed) {
          // 呪い：反転→MP封印50ターン
          p.mpCooldownTurns = (p.mpCooldownTurns || 0) + 50;
          ml.push(`${it.name}を飲んだ。魔力が封じられた！(MP封印50ターン)【呪】`);
        } else if ((p.mpCooldownTurns || 0) > 0) {
          ml.push(`${it.name}を飲んだ。MPが封印中のため回復できない！(残り${p.mpCooldownTurns}ターン)`);
        } else {
          // 通常/祝福：MP回復（祝福=1.5x）。MP最大時は最大MP増加
          const _madd = Math.min(Math.round(it.value * _potBm), (p.maxMp || 20) - (p.mp || 0));
          if (_madd <= 0) {
            const _maxMpGain = it.blessed ? 2 : 1;
            p.maxMp = (p.maxMp || 20) + _maxMpGain;
            p.mp = (p.mp || 0) + _maxMpGain;
            ml.push(`${it.name}を飲んだ。MPが最大なので最大MP+${_maxMpGain}！${it.blessed ? "（祝福）" : ""}`);
          } else {
            p.mp = (p.mp || 0) + _madd;
            ml.push(`${it.name}を飲んだ。MP+${_madd}${it.blessed ? "（祝福）" : ""}`);
          }
        }
      } else if (it.effect === "seal") {
        if (it.cursed) {
          // 呪い：MP封印解除
          p.mpCooldownTurns = 0;
          ml.push(`${it.name}を飲んだ。MP封印が解けた！【呪→解封】`);
        } else {
          // 通常/祝福：MP封印50ターン（祝福：さらに鈍足10ターン）
          p.mpCooldownTurns = (p.mpCooldownTurns || 0) + 50;
          let _seMsg = `${it.name}を飲んだ。魔力が封じられた！(MP封印50ターン)${it.blessed ? "（祝福）" : ""}`;
          if (it.blessed) {
            if (hasAbility(p.armor, "slow_proof")) {
              _seMsg += " 鈍足は防具が防いだ！(耐鈍足)";
            } else {
              p.slowTurns = (p.slowTurns || 0) + 10;
              _seMsg += " さらに鈍足10ターン！";
            }
          }
          ml.push(_seMsg);
        }
      } else if (it.effect === "darkness") {
        if (it.cursed) {
          p.monsterSenseTurns = (p.monsterSenseTurns || 0) + 100;
          ml.push(`${it.name}を飲んだ。フロアのモンスターが感知できる！(100ターン)【呪→感知】`);
        } else if (hasAbility(p.armor, "darkness_proof")) {
          ml.push(`${it.name}を飲んだ。しかし防具が暗闇を防いだ！(耐暗闇)`);
        } else if ((p.statusImmune || 0) > 0) {
          ml.push(`${it.name}を飲んだ。状態防止中のため効かなかった！`);
        } else {
          const _dt = it.blessed ? 50 : 20;
          p.darknessTurns = (p.darknessTurns || 0) + _dt;
          ml.push(`${it.name}を飲んだ。暗闇に包まれた！視界が1マスになる！(${p.darknessTurns}ターン)${it.blessed ? "【祝=強暗闇】" : ""}`);
        }
      } else if (it.effect === "bewitch") {
        if (it.cursed) {
          dg.traps.forEach(t => t.revealed = true);
          ml.push(`${it.name}を飲んだ。フロアの罠が全て見えた！【呪→罠看破】`);
        } else if (hasAbility(p.armor, "bewitch_proof")) {
          ml.push(`${it.name}を飲んだ。しかし防具が幻惑を防いだ！(耐惑わし)`);
        } else if ((p.statusImmune || 0) > 0) {
          ml.push(`${it.name}を飲んだ。状態防止中のため効かなかった！`);
        } else {
          const _bt = it.blessed ? 100 : 50;
          p.bewitchedTurns = (p.bewitchedTurns || 0) + _bt;
          ml.push(`${it.name}を飲んだ。幻惑された！周囲の見た目がおかしくなった！(${p.bewitchedTurns}ターン)${it.blessed ? "【祝=強幻惑】" : ""}`);
        }
      } else if (it.effect === "levelup") {
        if (it.cursed) {
          // 呪い：1階上へワープ（1階なら効果なし）
          if (p.depth <= 1) {
            if (onReturnToHub) {
              ml.push(`${it.name}を飲んだ。天井を突き破って地上へ飛ばされた！【呪】`);
              setMsgs((prev) => [...prev.slice(-80), ...ml]);
              sr.current = { ...sr.current };
              const _hasGoalP = p.inventory.some(i => i.type === "goal");
              onReturnToHub({ earnedGold: p.gold, depth: p.depth, discoveries: getDiscoveries(), survived: true, returnItems: [...p.inventory], cleared: _hasGoalP });
              return;
            } else {
              ml.push(`${it.name}を飲んだ。ここは1階だ。何も起こらなかった。【呪】`);
            }
          } else {
            ml.push(`${it.name}を飲んだ。天井を突き破って上の階へ飛ばされた！【呪】`);
            const _luNd = chgFloor(p, -1, true);
            if (_luNd) sr.current.dungeon = _luNd;
          }
        } else {
          const _luTimes = it.blessed ? 2 : 1;
          for (let _lui = 0; _lui < _luTimes; _lui++) {
            p.exp = p.nextExp;
            lu(p, ml);
          }
          ml.push(`${it.name}を飲んだ。${it.blessed ? "【祝=2レベルアップ】" : ""}`);
        }
      }
      if (p.inventory.length < (p.maxInventory || 30)) {
        const bottle = { ...EMPTY_BOTTLE, id: uid() };
        p.inventory.push(bottle);
        ml.push("空き瓶が残った。");
      }
    } else if (it.type === "food") {
      const _foodBm = getBlessMultiplier(it);
      const _foodVal = Math.max(1, Math.round(it.value * _foodBm));
      p.inventory.splice(idx, 1);
      if (p.hunger < 0) p.hunger = 0;
      const _foodAdded = Math.min(_foodVal, p.maxHunger - p.hunger);
      p.hunger = Math.min(p.maxHunger, p.hunger + _foodVal);
      ml.push(
        `${it.name}を食べた。(満腹度+${_foodAdded})${it.blessed ? "（祝福：よく味わえた）" : it.cursed ? "（呪い：まずかった）" : ""}`,
      );
      const fe = it.effect;
      if (fe === "heal_food") {
        const h = rng(10, 20);
        const ah = Math.min(h, p.maxHp - p.hp);
        p.hp += ah;
        if (ah > 0) ml.push(`体が温まりHPが${ah}回復した。`);
      } else if (fe === "power_food") {
        p.atk += 1;
        ml.push("力が湧いてきた！攻撃力+1");
      } else if (fe === "speed_food") {
        if (p.sleepTurns > 0) {
          p.sleepTurns = 0;
          ml.push("目が覚めた！");
        } else ml.push("体が軽くなった！");
      } else if (fe === "def_food") {
        p.def += 1;
        ml.push("体が頑丈になった！防御力+1");
      } else if (fe === "vitality_food") {
        p.maxHp += 2;
        p.hp += 2;
        ml.push("生命力が増した！最大HP+2");
      } else if (fe === "exp_food") {
        const ex = rng(5, 10 + p.level * 3);
        p.exp += ex;
        ml.push(`知恵が付いた。経験値+${ex}`);
        lu(p, ml);
      } else if (fe === "luck_food") {
        const g = rng(10, 30);
        p.gold += g;
        ml.push(`幸運だ！${g}ゴールドを見つけた。`);
      } else if (fe === "reveal_food") {
        for (let y2 = 0; y2 < MH; y2++)
          for (let x2 = 0; x2 < MW; x2++) dg.explored[y2][x2] = true;
        dg.traps.forEach((t2) => (t2.revealed = true));
        ml.push("目が冴えてフロア全体が見えた！");
      } else if (fe === "antidote_food") {
        const _acured = [];
        if (p.sleepTurns > 0) { p.sleepTurns = 0; _acured.push("睡眠"); }
        if (p.paralyzeTurns > 0) { p.paralyzeTurns = 0; _acured.push("金縛り"); }
        if (p.poisoned) {
          p.poisoned = false;
          if ((p.poisonAtkLoss || 0) > 0) { p.atk += p.poisonAtkLoss; p.poisonAtkLoss = 0; }
          _acured.push("毒");
        } else if ((p.poisonAtkLoss || 0) > 0) {
          p.atk += p.poisonAtkLoss; p.poisonAtkLoss = 0;
          _acured.push("毒による攻撃力低下");
        }
        if (_acured.length > 0) ml.push(`状態異常が消えた！(${_acured.join("・")})`);
        const h2 = rng(3, 8);
        p.hp = Math.min(p.maxHp, p.hp + h2);
        ml.push(`体の調子が良くなった。HP+${h2}`);
      } else if (fe === "satiate_food") {
        ml.push("とても腹持ちが良い！");
      }
      if (it.potionEffects && it.potionEffects.length > 0) {
        for (const pe of it.potionEffects) {
          if (pe === "heal") {
            const ph = rng(10, 25);
            const pah = Math.min(ph, p.maxHp - p.hp);
            p.hp += pah;
            if (pah > 0) ml.push(`回復効果でHP+${pah}`);
          } else if (pe === "poison") {
            if (hasRingEffect(p, "antidote_ring")) {
              ml.push("毒が混じっていたが指輪が毒を消した！");
            } else {
              p.poisoned = true;
              ml.push("毒が混じっていた！毒状態になった！攻撃力が徐々に下がっていく…");
            }
          } else if (pe === "sleep") {
            const st = rng(3, 6);
            if ((p.statusImmune || 0) > 0) ml.push("睡眠効果！状態防止中のため効かなかった！");
            else { p.sleepTurns = (p.sleepTurns || 0) + st; ml.push(`睡眠効果で${st}ターン眠ってしまった...`); }
          } else if (pe === "power") {
            p.atk += 2;
            ml.push("強化効果で攻撃力+2！");
          } else if (pe === "mana") {
            if ((p.mpCooldownTurns || 0) > 0) {
              ml.push(`MP封印中のため魔力効果は発揮されなかった！(残り${p.mpCooldownTurns}ターン)`);
            } else {
              const _mpRec = Math.min(10, (p.maxMp || 0) - (p.mp || 0));
              p.mp = (p.mp || 0) + _mpRec;
              if (_mpRec > 0) ml.push(`魔力効果でMP+${_mpRec}`);
            }
          } else if (pe === "confuse") {
            if ((p.statusImmune || 0) > 0) { ml.push("混乱成分！状態防止中のため効かなかった！"); }
            else if (hasAbility(p.armor, "confuse_proof")) { ml.push("混乱成分！しかし防具が防いだ！(耐混乱)"); }
            else { const _ct = rng(3, 8); p.confusedTurns = (p.confusedTurns || 0) + _ct; ml.push(`混乱成分が！頭がくらくらする...(${_ct}ターン)`); }
          } else if (pe === "slow") {
            if ((p.statusImmune || 0) > 0) ml.push("鈍足成分！状態防止中のため効かなかった！");
            else if (hasAbility(p.armor, "slow_proof")) ml.push("鈍足成分！しかし防具が防いだ！(耐鈍足)");
            else { p.slowTurns = (p.slowTurns || 0) + 10; ml.push("鈍足成分が！体が重くなった...(鈍足10ターン)"); }
          } else if (pe === "darkness") {
            if (hasAbility(p.armor, "darkness_proof")) { ml.push("暗闇成分！しかし防具が防いだ！(耐暗闇)"); }
            else { p.darknessTurns = (p.darknessTurns || 0) + 20; ml.push("暗闇成分が！視界が1マスになった...(20ターン)"); }
          } else if (pe === "bewitch") {
            if (hasAbility(p.armor, "bewitch_proof")) { ml.push("幻惑成分！しかし防具が防いだ！(耐惑わし)"); }
            else { p.bewitchedTurns = (p.bewitchedTurns || 0) + 50; ml.push("幻惑成分が！周囲の見た目がおかしくなった！(50ターン)"); }
          } else if (pe === "paralyze") {
            if ((p.statusImmune || 0) > 0) ml.push("金縛り成分！状態防止中のため効かなかった！");
            else if (hasAbility(p.armor, "paralyze_proof")) ml.push("金縛り成分！しかし防具が防いだ！(耐金縛り)");
            else { p.paralyzeTurns = (p.paralyzeTurns || 0) + 10; ml.push("金縛り成分が！体が動かない！(10ターン)"); }
          // 呪い系効果
          } else if (pe === "c_heal") {
            if (hasRingEffect(p, "antidote_ring")) {
              ml.push("呪いの回復成分があったが指輪が毒を消した！");
            } else {
              p.poisoned = true;
              ml.push("呪いの回復成分が！毒状態になった！攻撃力が徐々に下がっていく…");
            }
          } else if (pe === "c_poison") {
            if (p.poisoned) {
              p.poisoned = false;
              if ((p.poisonAtkLoss || 0) > 0) { p.atk += p.poisonAtkLoss; p.poisonAtkLoss = 0; }
              ml.push("解毒成分が！毒が消えた！攻撃力も回復！");
            } else ml.push("解毒成分が入っていたが毒ではなかった。");
          } else if (pe === "c_sleep") {
            p.hasteTurns = (p.hasteTurns || 0) + 5;
            ml.push("覚醒成分が！体が覚醒した！(2倍速5ターン)");
          } else if (pe === "c_power") {
            p.atk = Math.max(1, p.atk - 2);
            ml.push("弱化成分が！攻撃力-2...");
          } else if (pe === "c_mana") {
            p.mpCooldownTurns = (p.mpCooldownTurns || 0) + 50;
            ml.push("封印成分が！MP封印50ターン！");
          } else if (pe === "c_confuse") {
            p.sureHitTurns = (p.sureHitTurns || 0) + 100;
            ml.push("必中成分が！必中状態になった！(100ターン)");
          } else if (pe === "c_slow") {
            p.hasteTurns = (p.hasteTurns || 0) + 10;
            ml.push("加速成分が！体が軽くなった！(2倍速10ターン)");
          } else if (pe === "c_darkness") {
            p.monsterSenseTurns = (p.monsterSenseTurns || 0) + 100;
            ml.push("感知成分が！フロアのモンスターが見えるようになった！(100ターン)");
          } else if (pe === "c_bewitch") {
            dg.traps.forEach(t => t.revealed = true);
            ml.push("看破成分が！フロアの罠が全て見えた！");
          } else if (pe === "c_paralyze") {
            p.statusImmune = (p.statusImmune || 0) + 100;
            ml.push("予防成分が！状態異常防止100ターン！");
          } else if (pe === "levelup") {
            const _luEx = rng(5, 10 + p.level * 3);
            p.exp += _luEx;
            ml.push(`知恵が付いた。経験値+${_luEx}`);
            lu(p, ml);
          } else if (pe === "c_levelup") {
            p.atk = Math.max(1, p.atk - 2);
            ml.push("退化成分が！攻撃力-2...");
          } else if (pe === "seal") {
            p.mpCooldownTurns = (p.mpCooldownTurns || 0) + 50;
            ml.push("封魔成分が！MP封印50ターン！");
          } else if (pe === "c_seal") {
            p.mpCooldownTurns = 0;
            ml.push("解封成分が！MP封印が解けた！");
          }
        }
      }
      /* 壺の味付け特殊効果 */
      if (it.smoked) {
        const _smInc = rng(3, 5);
        p.maxHunger = (p.maxHunger || 100) + _smInc;
        ml.push(`燻製の風味で最大満腹度が${_smInc}上がった！(最大${p.maxHunger})`);
      }
      if (it.potFlavors) {
        for (const _pf of it.potFlavors) {
          if (_pf === "choco") {
            const _chHeal = rng(10, 20);
            const _chAh = Math.min(_chHeal, p.maxHp - p.hp);
            p.hp += _chAh;
            if (_chAh > 0) ml.push(`チョコの甘さでHP+${_chAh}回復！`);
          } else if (_pf === "spicy") {
            p.spicyAtkTurns = (p.spicyAtkTurns || 0) + 30;
            ml.push("辛さでパワーアップ！攻撃力+3(30ターン)");
          }
        }
      }
    } else if (it.type === "scroll") {
      if (it.effect === "blank") {
        ml.push("白紙の巻物だ。魔法のマーカーで書き込めるかもしれない。");
        endTurn(sr.current, p, ml);
        setMsgs((prev) => [...prev.slice(-80), ...ml]);
        setSelIdx(null);
        setShowDesc(null);
        setShowInv(false);
        sr.current = { ...sr.current };
        setGs({ ...sr.current });
        return;
      }
      // 識別の巻物でダイアログが必要な場合は消費せず early-return（魔封じの魔方陣内は除く）
      if (it.effect === "identify" && !it.blessed && !inMagicSealRoom(p.x, p.y, dg)) {
        const _ik_scr = getIdentKey(it); // "s:identify"
        if (it.cursed) {
          const _tgts = p.inventory.filter((_ii, _i) => {
            if (_i === idx) return false;
            if (_ii.type === 'weapon' || _ii.type === 'armor') return _ii.fullIdent || _ii.bcKnown;
            const _k = getIdentKey(_ii); return _k && sr.current.ident.has(_k);
          });
          if (_tgts.length > 0) {
            if (_ik_scr) sr.current.ident.add(_ik_scr);
            const _rp = (_wasUnknown && _revFake && _revFake !== _revReal) ? [`${_revFake}は${_revReal}だった！`] : [];
            setMsgs((prev) => [...prev.slice(-80), ..._rp, "どのアイテムの識別を解除する？【呪】"]);
            setIdentifyMode({ mode: 'unidentify', sel: 0, scrollIdx: idx });
            setShowInv(false); setSelIdx(null); setShowDesc(null);
            sr.current = { ...sr.current }; setGs({ ...sr.current });
            return;
          }
        } else {
          const _tgts = p.inventory.filter((_ii, _i) => {
            if (_i === idx) return false;
            if (_ii.type === 'weapon' || _ii.type === 'armor') return !_ii.fullIdent && !_ii.bcKnown;
            const _k = getIdentKey(_ii); return !!_k && (!sr.current.ident.has(_k) || (!_ii.fullIdent && !_ii.bcKnown));
          });
          if (_tgts.length > 0) {
            if (_ik_scr) sr.current.ident.add(_ik_scr);
            const _rp = (_wasUnknown && _revFake && _revFake !== _revReal) ? [`${_revFake}は${_revReal}だった！`] : [];
            setMsgs((prev) => [...prev.slice(-80), ..._rp, "識別するアイテムを選んでください。"]);
            setIdentifyMode({ mode: 'identify', sel: 0, scrollIdx: idx });
            setShowInv(false); setSelIdx(null); setShowDesc(null);
            sr.current = { ...sr.current }; setGs({ ...sr.current });
            return;
          }
        }
      }
      /* 複製の巻物：アイテム選択ダイアログが必要な場合はsplice前にreturn（identify同様） */
      if (it.effect === "duplicate" && !inMagicSealRoom(p.x, p.y, dg) && !((p.sealedTurns || 0) > 0)) {
        const _dupTargets = p.inventory.filter((_ii) => _ii.type !== "gold");
        if (_dupTargets.length > 0) {
          const _ik_dup = getIdentKey(it);
          if (_ik_dup) sr.current.ident.add(_ik_dup);
          const _rp = (_wasUnknown && _revFake && _revFake !== _revReal) ? [`${_revFake}は${_revReal}だった！`] : [];
          setMsgs((prev) => [...prev.slice(-80), ..._rp]);
          setIdentifyMode({ mode: 'duplicate', blessed: it.blessed || false, cursed: it.cursed || false, scrollIdx: idx });
          setShowInv(false); setSelIdx(null); setShowDesc(null);
          sr.current = { ...sr.current }; setGs({ ...sr.current });
          return;
        }
      }
      const _scrBm = getBlessMultiplier(it);
      p.inventory.splice(idx, 1);
      { const _ik = getIdentKey(it); if (_ik) sr.current.ident.add(_ik); }
      if (inMagicSealRoom(p.x, p.y, dg) || (p.sealedTurns || 0) > 0) {
        ml.push(`${it.name}を読んだが、魔法が封印されている！`);
      } else if (it.effect === "teleport") {
        const _tpBlocked = dg.pentacles?.some(pc => pc.kind === "teleport_trap" && pc.cursed);
        if (_tpBlocked) {
          ml.push("呪われたテレポートの魔方陣に阻まれてテレポートできない！");
        } else if (it.cursed) {
          setFloorSelectMode({ sel: p.depth });
          { const _rp = (_wasUnknown && _revFake && _revFake !== _revReal) ? [`${_revFake}は${_revReal}だった！`] : [];
            setMsgs((prev) => [...prev.slice(-80), ..._rp, "飛びたい階層を選んでください... (↑↓:選択 Z/Enter:決定)"]); }
          setSelIdx(null); setShowDesc(null); setShowInv(false);
          sr.current = { ...sr.current };
          setGs({ ...sr.current });
          return;
        } else if (it.blessed) {
          setTpSelectMode({ cx: p.x, cy: p.y });
          { const _rp = (_wasUnknown && _revFake && _revFake !== _revReal) ? [`${_revFake}は${_revReal}だった！`] : [];
            setMsgs((prev) => [...prev.slice(-80), ..._rp, "テレポート先を選んでください... (Z/Enter:決定 X:キャンセル→ランダム)"]); }
          setSelIdx(null); setShowDesc(null); setShowInv(false);
          sr.current = { ...sr.current };
          setGs({ ...sr.current });
          return;
        } else {
          const rm = dg.rooms[rng(0, dg.rooms.length - 1)];
          p.x = rng(rm.x, rm.x + rm.w - 1);
          p.y = rng(rm.y, rm.y + rm.h - 1);
          if ((p.immobileTurns||0) > 0) { p.immobileTurns = 0; ml.push("テレポートして移動封じが解けた！"); }
          ml.push("テレポートした！");
        }
      } else if (it.effect === "reveal") {
        if (it.cursed) {
          // 呪い：マップも罠の位置も全て忘れる
          for (let y = 0; y < MH; y++)
            for (let x = 0; x < MW; x++) dg.explored[y][x] = false;
          dg.traps.forEach((t) => (t.revealed = false));
          ml.push("記憶が消えた…マップと罠の位置を全て忘れてしまった！【呪】");
        } else {
          for (let y = 0; y < MH; y++)
            for (let x = 0; x < MW; x++) dg.explored[y][x] = true;
          dg.traps.forEach((t) => (t.revealed = true));
          if (it.blessed) {
            // 祝福：全開示＋アイテム・敵の位置も地図に常時表示
            dg.itemsRevealed = true;
            dg.monsterSenseActive = true;
            ml.push("フロア全体・罠・アイテム・敵の位置が明らかになった！【祝】");
          } else {
            ml.push("フロア全体と罠が明らかになった！");
          }
        }
      } else if (it.effect === "weapon_up") {
        if (p.weapon) {
          const _bef = p.weapon.plus || 0;
          const _gain = it.blessed ? 2 : it.cursed ? -1 : 1;
          p.weapon.plus = _bef + _gain;
          const _fp = (v) => (v > 0 ? `+${v}` : v === 0 ? "無印" : `${v}`);
          let _wMsg = `${p.weapon.name}が${_gain > 0 ? "輝いた" : "くすんだ"}！(${_fp(_bef)}→${_fp(p.weapon.plus)})${it.blessed ? "（祝福）" : it.cursed ? "（呪い）" : ""}`;
          if (p.weapon.cursed) { p.weapon.cursed = false; _wMsg += " 呪いが解けた！"; }
          ml.push(_wMsg);
        } else {
          ml.push("武器を装備していないので効果がなかった。");
        }
      } else if (it.effect === "armor_up") {
        if (p.armor) {
          const _bef = p.armor.plus || 0;
          const _gain = it.blessed ? 2 : it.cursed ? -1 : 1;
          p.armor.plus = _bef + _gain;
          const _fp = (v) => (v > 0 ? `+${v}` : v === 0 ? "無印" : `${v}`);
          let _aMsg = `${p.armor.name}が${_gain > 0 ? "輝いた" : "くすんだ"}！(${_fp(_bef)}→${_fp(p.armor.plus)})${it.blessed ? "（祝福）" : it.cursed ? "（呪い）" : ""}`;
          if (p.armor.cursed) { p.armor.cursed = false; _aMsg += " 呪いが解けた！"; }
          ml.push(_aMsg);
        } else {
          ml.push("防具を装備していないので効果がなかった。");
        }
      } else if (it.effect === "thunder") {
        if (hasCursedExplosionPentacle(dg)) {
          ml.push("呪われた爆発の魔方陣が雷を打ち消した！");
        } else {
        // 祝福：フロア全モンスターに雷、通常：視界内のみ、呪い：視界内＋自分にも雷
        const _tTargets = it.blessed
          ? [...dg.monsters]
          : dg.monsters.filter((m) => dg.visible[m.y]?.[m.x]);
        if (_tTargets.length === 0 && !it.cursed) {
          ml.push("雷が走るが、視界に敵はいない。");
        } else {
          if (it.blessed && _tTargets.length === 0) {
            ml.push("雷が走るが、フロアに敵はいない。【祝】");
          }
          for (const _m of _tTargets) {
            if (_m.hp <= 0) continue;
            let _dmg = Math.max(1, Math.round(rng(20, 30) * _scrBm));
            if (inCursedMagicSealRoom(_m.x, _m.y, dg)) _dmg *= 2;
            _m.hp -= _dmg;
            ml.push(`雷が${_m.name}を直撃！${_dmg}ダメージ！${it.blessed ? "（祝福）" : it.cursed ? "（呪い）" : ""}`);
            pushLightningAnim(_m.x, _m.y);
            if (_m.hp <= 0) { trackMonster(_m); killMonster(_m, dg, p, ml, lu); }
          }
          // 呪い：自分にも雷が落ちる
          if (it.cursed) {
            const _selfDmg = Math.max(1, rng(10, 20));
            p.hp -= _selfDmg;
            p.deathCause = "呪われた雷の巻物で";
            ml.push(`呪われた雷が自分にも落ちた！${_selfDmg}ダメージ！【呪】`);
            pushLightningAnim(p.x, p.y);
          }
        }
        } // end hasCursedExplosionPentacle else
      } else if (it.effect === "recovery") {
        if (it.cursed) {
          // 呪い：自分がダメージ、視界内モンスターが回復
          const _rdmg = Math.max(1, rng(10, 20));
          p.hp -= _rdmg;
          p.deathCause = "呪われた回復の巻物で";
          ml.push(`体が焼けるような痛みが走った！${_rdmg}ダメージ！【呪】`);
          const _rvisC = dg.monsters.filter((m) => dg.visible[m.y]?.[m.x]);
          for (const _m of _rvisC) {
            const _ma = Math.min(rng(10, 20), _m.maxHp - _m.hp);
            if (_ma > 0) { _m.hp += _ma; ml.push(`${_m.name}が回復した！HP+${_ma}`); pushHealAnim(_m.x, _m.y); }
          }
        } else {
          const _rh = Math.max(1, Math.round(rng(15, 25) * _scrBm));
          const _ra = Math.min(_rh, p.maxHp - p.hp);
          p.hp += _ra;
          pushHealAnim(p.x, p.y);
          if (it.blessed) {
            // 祝福：自分だけ回復（敵は回復しない）
            ml.push(`体が癒された！HP+${_ra}（祝福：自分だけ回復！）`);
          } else {
            // 通常：自分と視界内モンスターも回復
            ml.push(`体が回復した！HP+${_ra}`);
            const _rvis = dg.monsters.filter((m) => dg.visible[m.y]?.[m.x]);
            for (const _m of _rvis) {
              const _mh = Math.max(1, Math.round(rng(10, 20)));
              const _ma = Math.min(_mh, _m.maxHp - _m.hp);
              if (_ma > 0) { _m.hp += _ma; ml.push(`${_m.name}も回復した！HP+${_ma}`); pushHealAnim(_m.x, _m.y); }
            }
          }
        }
      } else if (it.effect === "item_gather") {
        const _toG = dg.items.filter((gi) => !gi.shopPrice);
        const _cnt = _toG.length;
        if (_cnt === 0) {
          ml.push("引き寄せるアイテムがなかった。");
        } else if (it.cursed) {
          // 呪い：フロアのアイテムをランダムな場所に飛ばす
          dg.items = dg.items.filter((gi) => gi.shopPrice);
          const _floorCands = [];
          for (let _fy = 0; _fy < MH; _fy++)
            for (let _fx = 0; _fx < MW; _fx++)
              if (dg.map[_fy][_fx] !== T.WALL && dg.map[_fy][_fx] !== T.BWALL &&
                  dg.map[_fy][_fx] !== T.SD && dg.map[_fy][_fx] !== T.SU)
                _floorCands.push([_fx, _fy]);
          for (const gi of _toG) {
            const [_rx, _ry] = pick(_floorCands);
            gi.x = _rx; gi.y = _ry;
            delete gi.wallEmbedded;
            dg.items.push(gi);
          }
          ml.push(`${_cnt}個のアイテムがフロアに散らばった！【呪】`);
        } else if (it.blessed) {
          // 祝福：フロアのアイテムを直接インベントリに吸収（満杯分は通常の落下ルールで配置）
          dg.items = dg.items.filter((gi) => gi.shopPrice);
          let _picked = 0, _dropped = 0;
          const _blessFt = new Set();
          for (const gi of _toG) {
            delete gi.wallEmbedded;
            if (p.inventory.length < (p.maxInventory || 30)) {
              p.inventory.push(gi);
              _picked++;
            } else {
              placeItemAt(dg, p.x, p.y, gi, ml, _blessFt, 0, p);
              _dropped++;
            }
          }
          ml.push(`${_picked}個のアイテムを拾った！【祝】${_dropped > 0 ? `（${_dropped}個は満杯で周囲に配置）` : ""}`);
        } else {
          // 通常：隣接マスに引き寄せる
          dg.items = dg.items.filter((gi) => gi.shopPrice);
          const _gft = new Set();
          withPitfallBag(() => {
            for (const gi of _toG) {
              let _placed = false;
              for (const [_dx, _dy] of DRO) {
                const _cx = p.x + _dx, _cy = p.y + _dy;
                if (_cx < 0 || _cx >= MW || _cy < 0 || _cy >= MH) continue;
                if (dg.map[_cy][_cx] === T.WALL || dg.map[_cy][_cx] === T.BWALL || dg.map[_cy][_cx] === T.SD || dg.map[_cy][_cx] === T.SU) continue;
                const _gb = dg.bigboxes?.find((b) => b.x === _cx && b.y === _cy);
                if (_gb) { bigboxAddItem(_gb, gi, dg, ml); _placed = true; break; }
                const _gs = dg.springs?.find((s) => s.x === _cx && s.y === _cy);
                if (_gs) { soakItemIntoSpring(_gs, gi, ml, dg, dnameRef); _placed = true; break; }
                const _gt = dg.traps.find((t) => t.x === _cx && t.y === _cy && !_gft.has(t.id));
                if (_gt) {
                  _gft.add(_gt.id);
                  _gt.revealed = true;
                  const _gr = fireTrapItem(_gt, gi, dg, _cx, _cy, ml, _gft, p, dnameRef, lu);
                  if (Math.random() < 0.3) { dg.traps = dg.traps.filter((t) => t !== _gt); ml.push(`${_gt.name}は壊れた。`); }
                  if (_gr === "destroyed") { _placed = true; break; }
                  if (_gr === "restart") { placeItemAt(dg, _cx, _cy, gi, ml, _gft, 0, p); _placed = true; break; }
                  continue;
                }
                if (dg.items.some((i) => i.x === _cx && i.y === _cy)) continue;
                gi.x = _cx; gi.y = _cy;
                delete gi.wallEmbedded;
                dg.items.push(gi);
                _placed = true;
                break;
              }
              if (!_placed) ml.push(`${gi.name}は引き寄せられなかった！`);
            }
          });
          ml.push(`${_cnt}個のアイテムを引き寄せた！`);
        }
      } else if (it.effect === "sleep_scroll") {
        if (it.cursed) {
          // 呪い：プレイヤーが眠る
          const _pst = Math.max(2, rng(3, 5));
          if ((p.statusImmune || 0) > 0) ml.push("眠気が自分を襲った！状態防止中のため効かなかった！【呪】");
          else { p.sleepTurns = (p.sleepTurns || 0) + _pst; ml.push(`眠気が自分を襲った！${_pst}ターン眠ってしまう…【呪】`); }
        } else {
          // 通常：視界内、祝福：フロア全モンスター
          const _sSleep = it.blessed ? dg.monsters : dg.monsters.filter((m) => dg.visible[m.y]?.[m.x]);
          if (_sSleep.length === 0) {
            ml.push(it.blessed ? "眠気が漂うが、フロアに敵はいない。【祝】" : "眠気が漂うが、視界に敵はいない。");
          } else {
            for (const _m of _sSleep) {
              const _st = Math.max(1, Math.round(rng(3, 6) * _scrBm));
              if ((_m.statusImmune || 0) > 0) { ml.push(`${_m.name}には効かなかった！(状態防止中)`); continue; }
              _m.sleepTurns = (_m.sleepTurns || 0) + _st;
              ml.push(`${_m.name}が眠りに落ちた！(${_st}ターン)${it.blessed ? "【祝】" : ""}`);
            }
          }
        }
      } else if (it.effect === "identify") {
        if (it.blessed) {
          // 全アイテム完全識別（武器・防具も含む）
          for (const _ii of p.inventory) {
            const _k = getIdentKey(_ii);
            if (_k) { sr.current.ident.add(_k); _ii.fullIdent = true; }
            else if (_ii.type === 'weapon' || _ii.type === 'armor') { _ii.fullIdent = true; }
          }
          ml.push("全てのアイテムが識別された！");
        } else if (it.cursed) {
          // 識別済みアイテムを1つ選んで未識別に戻す（武器・防具も含む）
          const _targets = p.inventory.filter(_ii => {
            if (_ii.type === 'weapon' || _ii.type === 'armor') return _ii.fullIdent || _ii.bcKnown;
            const _k = getIdentKey(_ii); return _k && sr.current.ident.has(_k);
          });
          if (_targets.length === 0) {
            ml.push("未識別に戻せるアイテムがない。");
          } else {
            { const _rp = (_wasUnknown && _revFake && _revFake !== _revReal) ? [`${_revFake}は${_revReal}だった！`] : [];
              setMsgs((prev) => [...prev.slice(-80), ..._rp, ...ml, "どのアイテムの識別を解除する？【呪】"]); }
            setIdentifyMode({ mode: 'unidentify' });
            setShowInv(false); setSelIdx(null); setShowDesc(null);
            sr.current = { ...sr.current }; setGs({ ...sr.current });
            return;
          }
        } else {
          // 通常: 1つ選んで識別（武器・防具も含む）
          const _targets = p.inventory.filter(_ii => {
            if (_ii.type === 'weapon' || _ii.type === 'armor') return !_ii.fullIdent && !_ii.bcKnown;
            const _k = getIdentKey(_ii); return !!_k && (!sr.current.ident.has(_k) || (!_ii.fullIdent && !_ii.bcKnown));
          });
          if (_targets.length === 0) {
            ml.push("未識別のアイテムがない。");
          } else {
            { const _rp = (_wasUnknown && _revFake && _revFake !== _revReal) ? [`${_revFake}は${_revReal}だった！`] : [];
              setMsgs((prev) => [...prev.slice(-80), ..._rp, ...ml, "識別するアイテムを選んでください。"]); }
            setIdentifyMode({ mode: 'identify' });
            setShowInv(false); setSelIdx(null); setShowDesc(null);
            sr.current = { ...sr.current }; setGs({ ...sr.current });
            return;
          }
        }
      } else if (it.effect === "duplicate") {
        // ここに到達するのは「アイテムなし」または「魔封じ」の場合のみ
        const _dupTargets = p.inventory.filter((_ii) => _ii.type !== "gold");
        if (_dupTargets.length === 0) {
          ml.push("複製できるアイテムがない。");
        }
        /* 魔封じ時は魔法封印メッセージが ml に入っているので何もしない */
      } else if (it.effect === "summon") {
        // 召喚の巻物
        if (it.cursed) {
          // 呪い：同じ部屋の敵を別の部屋に飛ばす
          const _sumRoom = findRoom(dg.rooms, p.x, p.y);
          const _inRoom = _sumRoom
            ? dg.monsters.filter((m) => findRoom(dg.rooms, m.x, m.y) === _sumRoom)
            : [];
          if (_inRoom.length === 0) {
            ml.push("部屋に敵がいないのに呪いが発動した…【呪】");
          } else {
            const _otherRooms = dg.rooms.filter((r) => r !== _sumRoom);
            for (const _sm of _inRoom) {
              const _tr = pick(_otherRooms);
              if (!_tr) continue;
              for (let _att = 0; _att < 20; _att++) {
                const _tx = rng(_tr.x + 1, _tr.x + _tr.w - 2);
                const _ty = rng(_tr.y + 1, _tr.y + _tr.h - 2);
                if (dg.map[_ty]?.[_tx] === T.FLOOR && !dg.monsters.some((m) => m.x === _tx && m.y === _ty) && (_tx !== p.x || _ty !== p.y)) {
                  _sm.x = _tx; _sm.y = _ty; _sm.aware = false; break;
                }
              }
            }
            ml.push(`${_inRoom.length}体の敵が別の部屋へ飛んだ！【呪】`);
          }
        } else {
          // 通常4体、祝福8体召喚
          const _sumCount = it.blessed ? 8 : 4;
          let _spawned = 0;
          _spawned = spawnMonsters(dg, _sumCount, p.depth + 1, p.x, p.y, p, { aware: !!it.blessed });
          ml.push(it.blessed ? `${_spawned}体の敵に囲まれた！【祝】` : `${_spawned}体の敵が召喚された！`);
        }
      } else if (it.effect === "trap_scatter") {
        // 罠の巻物
        if (it.cursed) {
          dg.traps = [];
          ml.push("罠の巻物を読んだ！フロア内の全ての罠が消えた！【呪】");
        } else {
          const _tCount = it.blessed ? rng(15, 25) : rng(8, 15);
          let _placed = 0;
          for (let _ti = 0; _ti < _tCount * 3 && _placed < _tCount; _ti++) {
            const _tr = dg.rooms[rng(0, dg.rooms.length - 1)];
            const _tx = rng(_tr.x, _tr.x + _tr.w - 1);
            const _ty = rng(_tr.y, _tr.y + _tr.h - 1);
            if (_tx === p.x && _ty === p.y) continue;
            if (dg.map[_ty][_tx] !== T.FLOOR) continue;
            if (dg.traps.some(t => t.x === _tx && t.y === _ty)) continue;
            if (dg.items.some(i => i.x === _tx && i.y === _ty)) continue;
            const _td = pick(TRAPS);
            dg.traps.push({ ..._td, id: uid(), x: _tx, y: _ty, revealed: false });
            _placed++;
          }
          ml.push(it.blessed
            ? `罠の巻物を読んだ！大量の罠がフロアに出現した！(${_placed}個)【祝】`
            : `罠の巻物を読んだ！罠がフロアに出現した！(${_placed}個)`);
        }
      } else if (it.effect === "expand_inv") {
        // 収納上手の巻物
        const _curMax = p.maxInventory || 30;
        if (it.cursed) {
          const _loss = rng(1, 3);
          const _newMax = Math.max(10, _curMax - _loss);
          const _actual = _curMax - _newMax;
          p.maxInventory = _newMax;
          // 超過分のアイテムを足元に落とす
          if (p.inventory.length > _newMax) {
            const _excess = p.inventory.splice(_newMax);
            const _fts = new Set();
            for (const _ei of _excess) placeItemAt(dg, p.x, p.y, _ei, ml, _fts, 0, p);
            ml.push(`最大所持数が${_actual}減った…(${_curMax}→${_newMax}) 超過分が落ちた！【呪】`);
          } else {
            ml.push(`最大所持数が${_actual}減った…(${_curMax}→${_newMax})【呪】`);
          }
        } else {
          const _gain = it.blessed ? rng(2, 6) : rng(1, 3);
          p.maxInventory = _curMax + _gain;
          ml.push(it.blessed
            ? `収納が上手くなった！最大所持数が${_gain}増えた！(${_curMax}→${p.maxInventory})【祝】`
            : `収納が上手くなった！最大所持数が${_gain}増えた！(${_curMax}→${p.maxInventory})`);
        }
      }
    } else if (it.type === "pen") {
      if ((it.charges || 0) <= 0) {
        ml.push(`${it.name}のインクが尽きている。充填の大箱で補充できる。`);
        endTurn(sr.current, p, ml);
        setMsgs((prev) => [...prev.slice(-80), ...ml]);
        setSelIdx(null); setShowDesc(null); setShowInv(false);
        sr.current = { ...sr.current }; setGs({ ...sr.current });
        return;
      }
      const _exPen = dg.pentacles?.find((pc) => pc.x === p.x && pc.y === p.y);
      const _penBlocked =
        dg.items.some((gi) => gi.x === p.x && gi.y === p.y) ||
        dg.traps.some((tr) => tr.x === p.x && tr.y === p.y) ||
        dg.springs?.some((s) => s.x === p.x && s.y === p.y) ||
        dg.bigboxes?.some((b) => b.x === p.x && b.y === p.y) ||
        dg.map[p.y][p.x] === T.SD ||
        dg.map[p.y][p.x] === T.SU ||
        dg.map[p.y][p.x] === T.WATER;
      if (_exPen) {
        ml.push(`すでに${_exPen.name}がある。`);
      } else if (_penBlocked) {
        ml.push("足元に別のものがあって魔方陣を描けない。");
      } else {
        dg.pentacles = dg.pentacles || [];
        const _isBlessed = it.blessed || false;
        const _isCursed = it.cursed || false;
        const _penIK = getIdentKey(it); // "n:sanctuary" etc
        const _penIsIdent = !_penIK || sr.current.ident.has(_penIK);
        const _bcPrefix = _isBlessed ? "祝福された" : _isCursed ? "呪われた" : "";
        let _pName;
        if (_penIsIdent) {
          const _baseName =
            it.effect === "sanctuary"      ? "聖域の魔方陣" :
            it.effect === "vulnerability"  ? "脆弱の魔方陣" :
            it.effect === "magic_seal"     ? "魔封じの魔方陣" :
            it.effect === "thunder_trap"   ? "雷の魔方陣" :
            it.effect === "farcast"        ? "遠投の魔方陣" :
            it.effect === "light"          ? "明かりの魔方陣" :
            it.effect === "teleport_trap"  ? "テレポートの魔方陣" :
            it.effect === "trap_gen"       ? "罠の魔方陣" :
            it.effect === "stone_throw"    ? "石飛ばしの魔方陣" :
            it.effect === "knockback_aura" ? "吹き飛ばしの魔方陣" :
            it.effect === "explosion"      ? "爆発の魔方陣" :
            it.effect === "plain"          ? "無の魔方陣" :
            it.effect === "gravity"        ? "重力の魔方陣" : "魔方陣";
          _pName = _bcPrefix + _baseName;
        } else {
          const _nick = sr.current.nicknames?.[_penIK];
          let _circleBase;
          if (_nick) {
            _circleBase = `${_nick}の魔方陣`;
          } else {
            const _fake = sr.current.fakeNames?.[_penIK] ?? it.name;
            _circleBase = _fake.replace(/ペン$/, '魔方陣'); // "朱色のペン"→"朱色の魔方陣"
          }
          _pName = _bcPrefix ? `${_bcPrefix}${_circleBase}` : _circleBase;
        }
        dg.pentacles.push({ x: p.x, y: p.y, kind: it.effect, name: _pName, blessed: _isBlessed, cursed: _isCursed });
        it.charges = (it.charges || 1) - 1;
        if (it.charges <= 0) {
          ml.push(`足元に${_pName}を描いた！ペンのインクが尽きた。(充填の大箱で補充できる)`);
        } else {
          ml.push(`足元に${_pName}を描いた！(残り${it.charges}回)`);
        }
        /* 呪われた聖域の魔方陣：描いた直後に隣のマスに弾き出される */
        if (it.effect === "sanctuary" && _isCursed) {
          const _dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
          let _pushed = false;
          for (const [_pdx, _pdy] of _dirs) {
            const _px = p.x + _pdx, _py = p.y + _pdy;
            if (_px >= 0 && _px < MW && _py >= 0 && _py < MH && dg.map[_py][_px] !== T.WALL && dg.map[_py][_px] !== T.BWALL &&
                !dg.monsters.some(m => m.x === _px && m.y === _py) &&
                !dg.pentacles.some(pc => pc.kind === "sanctuary" && pc.cursed && pc.x === _px && pc.y === _py)) {
              p.x = _px; p.y = _py;
              ml.push("呪われた魔方陣に弾き出された！");
              _pushed = true;
              break;
            }
          }
          if (!_pushed) ml.push("逃げ場がない！");
        }
        /* テレポートの魔方陣：描いた瞬間に即テレポート（呪い以外） */
        if (it.effect === "teleport_trap" && !_isCursed) {
          const _tpRm = dg.rooms[rng(0, dg.rooms.length - 1)];
          p.x = rng(_tpRm.x, _tpRm.x + _tpRm.w - 1);
          p.y = rng(_tpRm.y, _tpRm.y + _tpRm.h - 1);
          if ((p.immobileTurns||0) > 0) { p.immobileTurns = 0; ml.push("テレポートして移動封じが解けた！"); }
          ml.push("魔方陣を描いた瞬間、テレポートした！");
        }
        /* 雷の魔方陣：描いたそのターンにも即座に発動 */
        if (it.effect === "thunder_trap") {
          if (_isCursed) {
            const _drawHeal = Math.min(25, p.maxHp - p.hp);
            if (_drawHeal > 0) { p.hp += _drawHeal; ml.push(`描いた瞬間、癒しの力が湧き上がった！HPが${_drawHeal}回復！`); }
          } else if (hasCursedExplosionPentacle(dg)) {
            ml.push("呪われた爆発の魔方陣が雷を打ち消した！");
          } else {
            const _tdrawDmg = _isBlessed ? 50 : 25;
            if (p.hp > 0) {
              p.deathCause = `${_pName}の雷撃により`;
              p.hp -= _tdrawDmg;
              ml.push(`描いた瞬間、雷が落ちた！${_tdrawDmg}ダメージ！`);
              applyLightningToInventory(p, dg, ml, lu,
                (it) => itemDisplayName(it, sr.current.fakeNames, sr.current.ident, sr.current.nicknames));
            }
            for (const _tm of [...dg.monsters]) {
              if (_tm.x === p.x && _tm.y === p.y) {
                _tm.hp -= _tdrawDmg;
                ml.push(`${_pName}が${_tm.name}を打った！${_tdrawDmg}ダメージ！`);
                if (_tm.hp <= 0) { trackMonster(_tm); killMonster(_tm, dg, p, ml, lu); }
              }
            }
          }
        }
        /* 重力の魔方陣：描いた瞬間の即時効果 */
        if (it.effect === "gravity") {
          if (_isCursed) {
            /* 呪い：部屋内の者全員が浮遊状態になる（魔方陣が存在する間は常時適用） */
            ml.push(`${_pName}の呪いが炸裂！部屋内の者が浮遊状態になった！【呪】`);
          } else {
            /* 通常/祝福：水上にいる浮遊系の敵を弾き出す or 即死 */
            const _gravRoom = !_isBlessed ? dg.rooms?.find(r => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h) : null;
            const _gravMons = dg.monsters.filter(m => {
              if (!m.float) return false;
              if (dg.map[m.y]?.[m.x] !== T.WATER) return false;
              if (_isBlessed) return true;
              return _gravRoom && m.x >= _gravRoom.x && m.x < _gravRoom.x + _gravRoom.w && m.y >= _gravRoom.y && m.y < _gravRoom.y + _gravRoom.h;
            });
            for (const _gm of [..._gravMons]) {
              const _gdirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
              let _gpushed = false;
              for (const [_gdx, _gdy] of _gdirs) {
                const _gx = _gm.x + _gdx, _gy = _gm.y + _gdy;
                if (_gx >= 0 && _gx < MW && _gy >= 0 && _gy < MH &&
                    dg.map[_gy][_gx] !== T.WALL && dg.map[_gy][_gx] !== T.BWALL &&
                    dg.map[_gy][_gx] !== T.WATER &&
                    !dg.monsters.some(o => o !== _gm && o.x === _gx && o.y === _gy) &&
                    !(_gx === p.x && _gy === p.y)) {
                  _gm.x = _gx; _gm.y = _gy;
                  ml.push(`重力の力で${_gm.name}が水上から弾き出された！`);
                  _gpushed = true;
                  break;
                }
              }
              if (!_gpushed) {
                ml.push(`重力の力で${_gm.name}は逃げ場がなく即死した！`);
                killMonster(_gm, dg, p, ml, lu);
              }
            }
          }
        }
      }
    } else if (it.type === "weapon") {
      if (p.weapon === it) {
        if (it.cursed) { ml.push(`${it.name}は呪われていて外せない！泉か強化の巻物で呪いを解こう。`); }
        else { p.weapon = null; ml.push(`${it.name}を外した。`); }
      } else {
        p.weapon = it;
        it.bcKnown = true;
        ml.push(`${it.name}を装備した。${it.cursed ? "【呪】呪われている！外せなくなった！" : ""}`);
      }
    } else if (it.type === "armor") {
      if (p.armor === it) {
        if (it.cursed) { ml.push(`${it.name}は呪われていて外せない！泉か強化の巻物で呪いを解こう。`); }
        else { p.armor = null; ml.push(`${it.name}を外した。`); }
      } else {
        p.armor = it;
        it.bcKnown = true;
        ml.push(`${it.name}を装備した。${it.cursed ? "【呪】呪われている！外せなくなった！" : ""}`);
      }
    } else if (it.type === "arrow") {
      if (p.arrow === it) { p.arrow = null; ml.push(`${it.name}を外した。`); }
      else { p.arrow = it; ml.push(`${it.name}(${it.count}${(it.stone || it.magicStone) ? "個" : "本"})を装備した。`); }
    } else if (it.type === "ring") {
      const equipped = (p.rings || []).some(r => r === it);
      if (equipped) {
        if (it.cursed) {
          ml.push(`${it.name}は呪われていて外せない！泉か強化の巻物で呪いを解こう。`);
        } else {
          p.rings = (p.rings || []).filter(r => r !== it);
          if (it.effect === "life_ring") {
            const _lifeBonus = (it.plus || 0) * 5;
            p.maxHp = Math.max(1, p.maxHp - _lifeBonus);
            p.hp = Math.min(p.hp, p.maxHp);
          }
          ml.push(`${it.name}を外した。`);
        }
      } else {
        if ((p.rings || []).length >= 2) {
          /* 最後に装備した指輪を外して新しいものを装備する */
          const _removed = p.rings[p.rings.length - 1];
          if (_removed.cursed) {
            ml.push(`${_removed.name}は呪われていて外せない！指輪を装備できなかった。`);
          } else {
            p.rings = p.rings.slice(0, p.rings.length - 1);
            if (_removed.effect === "life_ring") {
              const _lifeBonus = (_removed.plus || 0) * 5;
              p.maxHp = Math.max(1, p.maxHp - _lifeBonus);
              p.hp = Math.min(p.hp, p.maxHp);
            }
            ml.push(`${_removed.name}を外した。`);
            if (!p.rings) p.rings = [];
            p.rings.push(it);
            it.bcKnown = true;
            if (it.effect === "life_ring") {
              const _lifeBonus2 = (it.plus || 0) * 5;
              p.maxHp += _lifeBonus2;
              p.hp += _lifeBonus2;
            }
            ml.push(`${it.name}を装備した。${it.cursed ? "【呪】呪われている！外せなくなった！" : ""}`);
            if (it.effect === "explode_ring") {
              ml.push("指輪が爆発した！");
              const _rnFn2 = (gi) => gi.name;
              doExplosion(p.x, p.y, dg, p, ml, _rnFn2, "爆発の指輪", null, null, false, true);
            }
            if (it.effect === "antidote_ring" && p.poisoned) {
              p.poisoned = false;
              if ((p.poisonAtkLoss || 0) > 0) { p.atk += p.poisonAtkLoss; p.poisonAtkLoss = 0; }
              ml.push("指輪の力で毒が消えた！攻撃力も回復！");
            }
          }
        } else {
          if (!p.rings) p.rings = [];
          p.rings.push(it);
          it.bcKnown = true;
          if (it.effect === "life_ring") {
            const _lifeBonus3 = (it.plus || 0) * 5;
            p.maxHp += _lifeBonus3;
            p.hp += _lifeBonus3;
          }
          ml.push(`${it.name}を装備した。${it.cursed ? "【呪】呪われている！外せなくなった！" : ""}`);
          /* 爆発の指輪：装備時即爆発 */
          if (it.effect === "explode_ring") {
            ml.push("指輪が爆発した！");
            const _rnFn = (gi) => gi.name;
            doExplosion(p.x, p.y, dg, p, ml, _rnFn, "爆発の指輪", null, null, false, true);
          }
          /* 毒消しの指輪：装備時に毒を解除 */
          if (it.effect === "antidote_ring" && p.poisoned) {
            p.poisoned = false;
            if ((p.poisonAtkLoss || 0) > 0) { p.atk += p.poisonAtkLoss; p.poisonAtkLoss = 0; }
            ml.push("指輪の力で毒が消えた！攻撃力も回復！");
          }
        }
      }
    } else if (it.type === "pot") {
      if (it.contents.length >= it.capacity) {
        ml.push(`${itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}はいっぱいだ。`);
      } else {
        setPutMode({ potIdx: idx });
        setPutMenuSel(0);
        setPutPage(0);
        setShowInv(false);
        setSelIdx(null);
        setShowDesc(null);
        setMsgs((prev) => [
          ...prev.slice(-80),
          `${itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}に入れるアイテムを選んでください...(${it.contents.length}/${it.capacity})`,
        ]);
        sr.current = { ...sr.current };
        setGs({ ...sr.current });
        return;
      }
    }
    if (_wasUnknown && _revFake && _revFake !== _revReal) {
      setMsgs(prev => [...prev.slice(-80), `${_revFake}は${_revReal}だった！`]);
      if (ml.length) setRevealMode({ pendingMsgs: [...ml] });
    } else {
      if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
    }
    endTurn(sr.current, p, ml);
    refreshFOV(dg, p);
    setSelIdx(null);
    setShowDesc(null);
    setShowInv(false);
    sr.current = { ...sr.current };
    setGs({ ...sr.current });
  }, [lu, endTurn, chgFloor]);
  const doDropItem = useCallback((idx) => {
    if (!sr.current) return;
    const { player: p, dungeon: dg } = sr.current;
    const it = p.inventory[idx];
    if (!it) return;
    _forceUnequip(p, it);
    p.inventory.splice(idx, 1);
    const ml = [],
      ft = new Set();
    const _allShopsDrop = getShops(dg);
    const _itemShopDrop = _allShopsDrop.find(s => s.id === it._shopId) || _allShopsDrop.find(s => s.unpaidTotal > 0);
    const prevDebt = _itemShopDrop?.unpaidTotal ?? 0;
    /* 足元に泉があればアイテムを泉に落とす */
    const _dropSpr = dg.springs?.find((s) => s.x === p.x && s.y === p.y);
    if (_dropSpr) {
      soakItemIntoSpring(_dropSpr, it, ml, dg, dnameRef);
    } else {
      let _dr;
      withPitfallBag(() => { _dr = placeItemAt(dg, p.x, p.y, it, ml, ft, 0, p); });
      if (_dr === "pitfall_player") {
        const _nd = chgFloor(p, 1, true);
        if (_nd) {
          sr.current.dungeon = _nd;
          ml.push(`地下${p.depth}階に落ちた！`);
        }
      }
    }
    if (
      it.shopPrice &&
      _itemShopDrop &&
      _itemShopDrop.unpaidTotal < prevDebt &&
      _itemShopDrop.unpaidTotal > 0
    )
      ml.push(`${itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}を戻した。（残り${_itemShopDrop.unpaidTotal}G）`);
    if (ml.length === 0) {
      let _dropLbl = itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
      if (it.type === "weapon") {
        if (it.plus) _dropLbl += (it.plus > 0 ? "+" : "") + it.plus;
        _dropLbl += ` (攻+${it.atk + (it.plus || 0)})`;
      } else if (it.type === "armor") {
        if (it.plus) _dropLbl += (it.plus > 0 ? "+" : "") + it.plus;
        _dropLbl += ` (防+${it.def + (it.plus || 0)})`;
      } else if (it.type === "arrow") {
        _dropLbl += `(${it.count}${it.stone || it.magicStone ? "個" : "本"})`;
      } else if (it.type === "gold") {
        _dropLbl += `(${it.count}枚)`;
      }
      ml.push(`${_dropLbl}${_itemPickupSuffix(it, sr.current?.ident)}を置いた。`);
    }
    endTurn(sr.current, p, ml);
    setMsgs((prev) => [...prev.slice(-80), ...ml]);
    setSelIdx(null);
    setShowDesc(null);
    if (!dropModeRef.current) {
      setShowInv(false);
    }
    sr.current = { ...sr.current };
    setGs({ ...sr.current });
  }, [endTurn]);
  const doThrow = useCallback((idx) => {
    setShowInv(false);
    setSelIdx(null);
    setShowDesc(null);
    setThrowMode({ idx, mode: "throw" });
    const _it = sr.current?.player?.inventory[idx];
    const _nm = _it ? itemDisplayName(_it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames) : "アイテム";
    setMsgs((prev) => [...prev.slice(-80), `${_nm}を投げる方向を選んでください...`]);
  }, []);
  const doShoot = useCallback((idx) => {
    setShowInv(false);
    setSelIdx(null);
    setShowDesc(null);
    const _it = sr.current?.player?.inventory[idx];
    /* 石・魔法の石・爆弾矢は投げるモードで処理（装備時と同じ挙動） */
    if (_it?.stone || _it?.magicStone || _it?.bombArrow) {
      setThrowMode({ idx, mode: "throw" });
      const _nm = itemDisplayName(_it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
      setMsgs((prev) => [...prev.slice(-80), `${_nm}を投げる方向を選んでください...`]);
      return;
    }
    setThrowMode({ idx, mode: "shoot" });
    setMsgs((prev) => [...prev.slice(-80), "矢を射る方向を選んでください..."]);
  }, []);
  const doWaveWand = useCallback((idx) => {
    if (!sr.current) return;
    const it = sr.current.player.inventory[idx];
    if (!it || it.type !== "wand") return;
    if (it.charges <= 0) {
      setMsgs((prev) => [...prev.slice(-80), "杖の力が残っていない..."]);
      return;
    }
    setShowInv(false);
    setSelIdx(null);
    setShowDesc(null);
    setThrowMode({ idx, mode: "wand_wave" });
    setMsgs((prev) => [
      ...prev.slice(-80),
      `${itemDisplayName(it, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}を振る方向を選んでください...`,
    ]);
  }, []);
  const doBreakWand = useCallback(
    (idx) => {
      if (!sr.current) return;
      const { player: p, dungeon: dg } = sr.current;
      const it = p.inventory[idx];
      if (!it || it.type !== "wand") return;
      p.inventory.splice(idx, 1);
      const ml = [];
      ml.push(`${dnameRef(it)}を壊した！`);
      try {
        if (inMagicSealRoom(p.x, p.y, dg) || (p.sealedTurns || 0) > 0) {
          ml.push("魔法が封印されている！効果は発動しなかった。");
        } else {
          const times = Math.max(1, Math.ceil((it.charges ?? 0) / 2));
          const _bwBlMult = it.blessed ? 1.5 : it.cursed ? 0.5 : 1;
          for (let t = 0; t < times; t++) breakWandAoE(p, dg, it.effect, ml, lu, _bwBlMult);
          /* 呪われたレベルアップの杖の壊し：上の階へワープ */
          if (p._pendingWarpUp) {
            delete p._pendingWarpUp;
            if (p.depth > 1) {
              const _bwNd = chgFloor(p, -1);
              if (_bwNd) sr.current.dungeon = _bwNd;
            } else {
              ml.push("ここは1階だ。何も起こらなかった。");
            }
          }
        }
      } catch (e) {
        console.error("doBreakWand error:", e);
        ml.push("杖の破砕中にエラーが発生した。");
      }
      try { endTurn(sr.current, p, ml); } catch (e2) { console.error("doBreakWand endTurn error:", e2); }
      if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
      setSelIdx(null);
      setShowDesc(null);
      setShowInv(false);
      sr.current = { ...sr.current };
      setGs({ ...sr.current });
    },
    [lu, endTurn, chgFloor],
  );
  const doUseMarker = useCallback((idx) => {
    if (!sr.current) return;
    const { player: p } = sr.current;
    const it = p.inventory[idx];
    if (!it || it.type !== "marker") return;
    if (it.charges <= 0) {
      setMsgs((prev) => [...prev.slice(-80), "マーカーのインクが切れている..."]);
      return;
    }
    const blanks = p.inventory.filter((b) =>
      (b.type === "scroll" && b.effect === "blank") ||
      (b.type === "spellbook" && !b.spell)
    );
    if (blanks.length === 0) {
      setMsgs((prev) => [...prev.slice(-80), "白紙の巻物も白紙の魔法書もない。"]);
      return;
    }
    setShowInv(false);
    setSelIdx(null);
    setShowDesc(null);
    setMarkerMode({ markerIdx: idx, step: "select_blank", blankIdx: null, blankKind: null });
    setMarkerMenuSel(0);
    setMsgs((prev) => [...prev.slice(-80), "書き込む白紙アイテムを選んでください..."]);
    sr.current = { ...sr.current };
    setGs({ ...sr.current });
  }, []);
  const doReadSpellbook = useCallback((idx) => {
    if (!sr.current) return;
    const { player: p, dungeon: dg } = sr.current;
    const it = p.inventory[idx];
    if (!it || it.type !== "spellbook") return;
    const ml = [];
    if (!p.spells) p.spells = [];
    /* 未識別チェック（dnameRef は render後に定義されているが closure で参照可能） */
    const _sbIK = getIdentKey(it); // "b:fire_bolt" etc
    const _wasUnknown = !!(_sbIK && !sr.current.ident.has(_sbIK));
    const _revFake = _wasUnknown ? itemDisplayName(it, sr.current.fakeNames, sr.current.ident, sr.current.nicknames) : null;
    const _revReal = _wasUnknown ? it.name : null;
    /* 識別 */
    if (_sbIK && _wasUnknown) sr.current.ident.add(_sbIK);
    if (inMagicSealRoom(p.x, p.y, dg) || (p.sealedTurns || 0) > 0) {
      p.inventory.splice(idx, 1);
      ml.push(`${it.name}を読んだが、魔法が封印されている！魔法書は消えた。`);
    } else if (it.cursed) {
      // 呪い：この魔法以外のランダムな魔法を1つ選んで習得 or レベルアップ
      if (!p.spellLevels) p.spellLevels = {};
      const _otherSpells = SPELLS.filter((s) => s.id !== it.spell);
      const _candidates = _otherSpells.filter((s) => {
        if (!p.spells.includes(s.id)) return true;          // 未習得 → 習得できる
        return (p.spellLevels[s.id] || 1) < 6;              // 習得済みでも最大未満ならLvUP
      });
      p.inventory.splice(idx, 1);
      if (_candidates.length === 0) {
        ml.push(`${it.name}を読んだが、呪いで魔力が乱れ何も起きなかった。【呪】`);
      } else {
        const _tgt = pick(_candidates);
        if (p.spells.includes(_tgt.id)) {
          const _curLv = p.spellLevels[_tgt.id] || 1;
          const _newLv = _curLv + 1;
          p.spellLevels[_tgt.id] = _newLv;
          ml.push(`${it.name}を読んだ。呪いで魔力が乱れ「${_tgt.name}」がレベルアップした！(Lv.${_newLv})【呪】`);
        } else {
          p.spells = [...p.spells, _tgt.id];
          p.spellLevels[_tgt.id] = 1;
          ml.push(`${it.name}を読んだ。呪いで魔力が乱れ「${_tgt.name}」を習得した！(Lv.1)【呪】`);
        }
      }
    } else if (p.spells.includes(it.spell)) {
      // 既習得 → レベルアップ（祝福なら+2）
      if (!p.spellLevels) p.spellLevels = {};
      const _curLv = p.spellLevels[it.spell] || 1;
      const spellDef = SPELLS.find((s) => s.id === it.spell);
      const _spName = spellDef ? spellDef.name : it.spell;
      if (_curLv >= 6) {
        ml.push(`「${_spName}」はすでに最大レベルだ。(Lv.${_curLv} MP:${Math.max(1, 20 - (_curLv - 1) * 3)})`);
        // 最大レベルの場合は魔法書を消費しない
      } else {
        const _gain = it.blessed ? 2 : 1;
        const _newLv = Math.min(6, _curLv + _gain);
        p.spellLevels[it.spell] = _newLv;
        p.inventory.splice(idx, 1);
        const _newCost = Math.max(1, 20 - (_newLv - 1) * 3);
        ml.push(`${it.name}を読んだ。「${_spName}」がレベルアップ！(Lv.${_newLv} 消費MP:${_newCost})${it.blessed ? "【祝】" : ""}`);
      }
    } else {
      // 未習得 → 習得（祝福ならLv.2から）
      if (!p.spellLevels) p.spellLevels = {};
      const _startLv = it.blessed ? 2 : 1;
      p.spellLevels[it.spell] = _startLv;
      p.spells = [...p.spells, it.spell];
      p.inventory.splice(idx, 1);
      const spellDef = SPELLS.find((s) => s.id === it.spell);
      const _initCost = Math.max(1, 20 - (_startLv - 1) * 3);
      ml.push(`${it.name}を読んだ。「${spellDef ? spellDef.name : it.spell}」を習得した！(Lv.${_startLv} 消費MP:${_initCost})${it.blessed ? "【祝】" : ""}`);
    }
    setShowInv(false); setSelIdx(null); setShowDesc(null);
    endTurn(sr.current, p, ml);
    /* リビールメッセージ */
    if (_wasUnknown && _revFake && _revFake !== _revReal) {
      setMsgs(prev => [...prev.slice(-80), `${_revFake}は${_revReal}だった！`]);
      if (ml.length) setRevealMode({ pendingMsgs: [...ml] });
    } else {
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
    }
    sr.current = { ...sr.current }; setGs({ ...sr.current });
  }, [endTurn]);
  const doMarkerWrite = useCallback(
    (blankIdx, template) => {
      if (!sr.current || !markerMode) return;
      const { player: p } = sr.current;
      const marker = p.inventory[markerMode.markerIdx];
      const blank = p.inventory[blankIdx];
      if (!marker || marker.type !== "marker") { setMarkerMode(null); return; }
      const ml = [];
      if (markerMode.blankKind === "spellbook") {
        if (!blank || blank.type !== "spellbook" || blank.spell) { setMarkerMode(null); return; }
        if (marker.charges < 5) {
          ml.push(`インクが足りない！(必要:5回 現在:${marker.charges}回)`);
          setMarkerMode(null);
          setMsgs((prev) => [...prev.slice(-80), ...ml]);
          return;
        }
        blank.name = template.name;
        blank.spell = template.spell;
        blank.desc = template.desc;
        marker.charges -= 5;
        ml.push(`${template.name}に変化した！[${marker.name} 残り${marker.charges}回]`);
      } else {
        if (!blank || blank.effect !== "blank") { setMarkerMode(null); return; }
        blank.name = template.name;
        blank.effect = template.effect;
        blank.desc = template.desc;
        if (marker.blessed) { blank.blessed = true; blank.cursed = false; }
        else if (marker.cursed) { blank.cursed = true; blank.blessed = false; }
        marker.charges--;
        const _mBcLabel = marker.blessed ? "【祝】" : marker.cursed ? "【呪】" : "";
        ml.push(`${template.name}${_mBcLabel}に変化した！[${marker.name} 残り${marker.charges}回]`);
      }
      if (marker.charges <= 0) {
        p.inventory.splice(markerMode.markerIdx, 1);
        ml.push(`${marker.name}のインクが切れた。`);
      }
      setMarkerMode(null);
      endTurn(sr.current, p, ml);
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
      sr.current = { ...sr.current };
      setGs({ ...sr.current });
    },
    [markerMode, endTurn],
  );
  const doPutItem = useCallback(
    (itemIdx) => {
      if (!sr.current || !putMode) return;
      const { player: p, dungeon: dg } = sr.current;
      const pot = p.inventory[putMode.potIdx];
      if (!pot || pot.type !== "pot") {
        setPutMode(null);
        return;
      }
      const it = p.inventory[itemIdx];
      if (!it) return;
      if (it.type === "pot") {
        setMsgs((prev) => [...prev.slice(-80), "壺の中に壺は入れられない。"]);
        return;
      }
      if (it.type === "goal") {
        setMsgs((prev) => [...prev.slice(-80), "大事なものは壺に入れられない！"]);
        return;
      }
      if (pot.contents.length >= pot.capacity) {
        setMsgs((prev) => [...prev.slice(-80), `${itemDisplayName(pot, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}はいっぱいだ。`]);
        setPutMode(null);
        return;
      }
      _forceUnequip(p, it);
      p.inventory.splice(itemIdx, 1);
      if (itemIdx < putMode.potIdx) putMode.potIdx--;
      const ml = [];
      if (pot.potEffect === "boil") {
        if (it.type === "potion") {
          ml.push(`${dnameRef(it)}を加熱の壺に投じた！薬効が部屋中に広がった！`);
          const _boilRoom = findRoom(dg.rooms, p.x, p.y);
          const _potClr = { heal:"#88ffaa", fire:"#ff8844", poison:"#88ff88", sleep:"#ddffaa", paralyze:"#ffffaa", water:"#88ccff", levelup:"#ffff88" }[it.effect] || "#cc88ff";
          if (_boilRoom) {
            applyPotionEffect(it.effect, it.value || 0, "player", p, dg, p, ml, lu, it.blessed || false, it.cursed || false);
            pushSplashAnim(p.x, p.y, _potClr);
            const _boilMons = dg.monsters.filter(
              (m) => m.x >= _boilRoom.x && m.x < _boilRoom.x + _boilRoom.w &&
                     m.y >= _boilRoom.y && m.y < _boilRoom.y + _boilRoom.h,
            );
            for (const _bm of _boilMons) {
              applyPotionEffect(it.effect, it.value || 0, "monster", _bm, dg, p, ml, lu, it.blessed || false, it.cursed || false);
              pushSplashAnim(_bm.x, _bm.y, _potClr);
            }
            const _boilBurnSet = [];
            for (const _bi of dg.items.filter(
              (fi) => fi.x >= _boilRoom.x && fi.x < _boilRoom.x + _boilRoom.w &&
                      fi.y >= _boilRoom.y && fi.y < _boilRoom.y + _boilRoom.h,
            )) {
              const _br = applyPotionToItem(it.effect, it.value || 0, _bi, dg, ml, it.cursed || false, dnameRef);
              if (_br === "burn") _boilBurnSet.push(_bi);
            }
            if (_boilBurnSet.length > 0) dg.items = dg.items.filter((fi) => !_boilBurnSet.includes(fi));
          } else {
            ml.push("（回廊では薬効が拡散しにくい…自分にだけ効いた）");
            applyPotionEffect(it.effect, it.value || 0, "player", p, dg, p, ml, lu, it.blessed || false, it.cursed || false);
            pushSplashAnim(p.x, p.y, _potClr);
          }
          pot.capacity = Math.max(0, pot.capacity - 1);
          // 呪われたレベルアップの薬でワープフラグが立った場合
          if (p._pendingWarpUp) {
            delete p._pendingWarpUp;
            if (p.depth > 1) {
              const _boilWarpNd = chgFloor(p, -1, true);
              if (_boilWarpNd) sr.current.dungeon = _boilWarpNd;
            }
          }
          // 薬効発動後はアイテム欄を閉じる
          if (pot.contents.length >= pot.capacity) ml.push(`${itemDisplayName(pot, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}はいっぱいになった。`);
          endTurn(sr.current, p, ml);
          setMsgs((prev) => [...prev.slice(-80), ...ml]);
          setPutMode(null);
          setShowInv(false);
          setSelIdx(null);
          setShowDesc(null);
          sr.current = { ...sr.current };
          setGs({ ...sr.current });
          return;
        } else if (it.type === "scroll" || it.type === "spellbook") {
          ml.push(`${dnameRef(it)}は加熱の壺の熱で燃えてなくなった！`);
          pot.capacity = Math.max(0, pot.capacity - 1);
          /* 壺には残さない */
        } else if (it.type === "food" && !it.cooked) {
          it.value = it.value * 2;
          cookFoodMeta(it);
          it.name = "焼いた" + it.name;
          ml.push(`加熱の壺で${it.name}になった！`);
          pot.contents.push(it);
        } else if (it.type === "food" && it.cooked) {
          burnFoodItem(it, ml);
          pot.contents.push(it);
        } else {
          ml.push(`${dnameRef(it)}を加熱の壺に入れた。`);
          pot.contents.push(it);
        }
      } else {
        applyPotEffect(pot, it, ml, dnameRef);
        pot.contents.push(it);
      }
      if (pot.contents.length >= pot.capacity)
        ml.push(`${itemDisplayName(pot, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames)}はいっぱいになった。`);
      endTurn(sr.current, p, ml);
      setMsgs((prev) => [...prev.slice(-80), ...ml]);
      if (pot.contents.length < pot.capacity) {
        setPutMode({ potIdx: p.inventory.indexOf(pot) });
        setPutMenuSel(0);
        setPutPage(0);
        sr.current = { ...sr.current };
        setGs({ ...sr.current });
      } else {
        setPutMode(null);
        sr.current = { ...sr.current };
        setGs({ ...sr.current });
      }
    },
    [putMode, endTurn],
  );
  const doBreakPot = useCallback(
    (idx) => {
      if (!sr.current) return;
      const { player: p, dungeon: dg } = sr.current;
      const it = p.inventory[idx];
      if (!it || it.type !== "pot") return;
      p.inventory.splice(idx, 1);
      const ml = [];
      ml.push(`${dnameRef(it)}を割った！`);
      try {
        scatterPotContents(it, dg, p.x, p.y, p, ml, lu, dnameRef);
      } catch (e) {
        console.error("doBreakPot error:", e);
        ml.push("壺の処理中にエラーが発生した。");
      }
      endTurn(sr.current, p, ml);
      if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
      setSelIdx(null);
      setShowDesc(null);
      setShowInv(false);
      sr.current = { ...sr.current };
      setGs({ ...sr.current });
    },
    [lu, endTurn],
  );
  const execDirection = useCallback(
    (dx, dy) => {
      if (!throwMode || !sr.current) return;
      const { idx, mode } = throwMode;
      const { player: p, dungeon: dg } = sr.current;
      const ml = [];
      /* 遠投判定（投げ・射撃にのみ影響） */
      const _throwRelated = (mode === "shoot_equipped" || mode === "shoot" || mode === "throw" || !mode);
      const _rawFcMode = _throwRelated ? getFarcastMode(p.x, p.y, dg) : false;
      /* 遠投の指輪：常に遠投状態 */
      const _fcMode = (_throwRelated && hasRingEffect(p, "farcast_ring") && _rawFcMode !== "cursed")
        ? "farcast" : _rawFcMode;
      const _isFarcast = _fcMode === "farcast";
      const _isCursedFc = _fcMode === "cursed";
      const _maxRange = _isCursedFc ? 1 : _isFarcast ? 50 : 10;
      /* 下手投げの指輪：命中率0%（方向はそのまま、敵に当たっても必ず外れる） */
      const _forceMiss = _throwRelated && hasRingEffect(p, "miss_throw_ring");
      if (mode === "shoot_equipped") {
        if (!p.arrow || p.arrow.count <= 0) {
          ml.push("矢がない！");
          setThrowMode(null);
          if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
          return;
        }
        const _arItem = p.arrow;

        /* ── 石 / 魔法の石 専用処理 ── */
        if (_arItem.stone || _arItem.magicStone) {
          const _stName = _arItem.name;
          p.arrow.count--;
          if (_isFarcast) {
            /* 遠投：消滅 */
            ml.push(`${_stName}を投げた。${_stName}は消滅した。`);
          } else if (_arItem.magicStone) {
            /* 魔法の石：10マス以内の最近敵にホーミング */
            const _msDist = (mn) => Math.hypot(mn.x - p.x, mn.y - p.y);
            const _msTarget = [...dg.monsters]
              .filter(mn => Math.max(Math.abs(mn.x - p.x), Math.abs(mn.y - p.y)) <= 10)
              .sort((a, b) => _msDist(a) - _msDist(b))[0];
            if (_msTarget) pushProjectileAnim(p.x, p.y, _msTarget.x, _msTarget.y, "#cc88ff");
            ml.push(`${_stName}を投げた！`);
            if (!_msTarget) {
              ml.push(`近くに敵がいない！${_stName}は消えた。`);
            } else {
              const _msSureHit = (p.sureHitTurns || 0) > 0;
              const _msMiss = _forceMiss || (!_msSureHit && Math.random() >= 0.90);
              const _msDmg = (_arItem.atk || 5) + rng(0, 3);
              if (_msMiss) {
                ml.push(`${_stName}は${_msTarget.name}に外れ、足元に落ちた！`);
                const _msft = new Set();
                withPitfallBag(() => placeItemAt(dg, _msTarget.x, _msTarget.y, makeMagicStone(1), ml, _msft));
              } else {
                _msTarget.hp -= _msDmg;
                ml.push(`${_stName}が${_msTarget.name}にホーミング命中！${_msDmg}ダメージ！`);
                if (_msTarget.hp <= 0) { trackMonster(_msTarget); killMonster(_msTarget, dg, p, ml, lu); }
              }
            }
          } else {
            /* 通常の石：必ず3マス先（呪い遠投は1マス先）に着弾 */
            pushBoltAnim(p.x, p.y, dx, dy, dg, "#aaaaaa");
            const _stRange = _isCursedFc ? 1 : 3;
            let _stLx = p.x, _stLy = p.y;
            for (let d = 1; d <= _stRange; d++) {
              const tx = p.x + dx * d, ty = p.y + dy * d;
              if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
              if (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) break;
              _stLx = tx; _stLy = ty;
            }
            const _stM = monsterAt(dg, _stLx, _stLy);
            const _stSureHit = (p.sureHitTurns || 0) > 0;
            const _stDmg = (_arItem.atk || 3) + rng(0, 3);
            ml.push(`${_stName}を投げた！`);
            if (_stM) {
              const _stMiss = _forceMiss || (!_stSureHit && Math.random() >= 0.90);
              if (_stMiss) {
                ml.push(`${_stName}は${_stM.name}に外れた！`);
                const _stft = new Set();
                withPitfallBag(() => placeItemAt(dg, _stLx, _stLy, makeStone(1), ml, _stft));
              } else {
                _stM.hp -= _stDmg;
                ml.push(`${_stName}が${_stM.name}に命中！${_stDmg}ダメージ！`);
                if (_stM.hp <= 0) { trackMonster(_stM); killMonster(_stM, dg, p, ml, lu); }
              }
            } else {
              /* 敵なし：着弾点に落ちる（罠も起動） */
              const _stft = new Set();
              withPitfallBag(() => placeItemAt(dg, _stLx, _stLy, makeStone(1), ml, _stft));
            }
          }
          if (p.arrow.count <= 0) {
            const _stEx = p.arrow;
            p.arrow = null;
            p.inventory = p.inventory.filter(i => i !== _stEx);
            ml.push(`${_stName}を投げ尽くした。`);
          }
          endTurn(sr.current, p, ml);
          if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
          setThrowMode(null);
          sr.current = { ...sr.current };
          setGs({ ...sr.current });
          return;
        }

        /* ── 爆弾矢 専用処理 ── */
        if (_arItem.bombArrow) {
          const _baName = _arItem.name;
          const _baNF = (it) => itemDisplayName(it, sr.current.fakeNames, sr.current.ident, sr.current.nicknames);
          pushBoltAnim(p.x, p.y, dx, dy, dg, "#ff6622");
          p.arrow.count--;
          ml.push(`${_baName}を射った！`);
          if (_isFarcast) {
            ml.push(`${_baName}は消滅した。`);
          } else {
            let _baLx = p.x, _baLy = p.y;
            const _baMaxR = _isCursedFc ? 1 : 10;
            for (let d = 1; d <= _baMaxR; d++) {
              const tx = p.x + dx * d, ty = p.y + dy * d;
              if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
              if (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) break;
              const _baM = monsterAt(dg, tx, ty);
              if (_baM) {
                const _baDmg = (_arItem.atk || 6) + rng(1, 4);
                _baM.hp -= _baDmg;
                ml.push(`${_baName}が${_baM.name}に命中！${_baDmg}ダメージ！`);
                if (_baM.hp <= 0) { trackMonster(_baM); killMonster(_baM, dg, p, ml, lu); }
                _baLx = tx; _baLy = ty;
                break;
              }
              const _baBB = dg.bigboxes?.find(b => b.x === tx && b.y === ty);
              if (_baBB) {
                ml.push(`${_baName}が${_baBB.name}に命中！`);
                _baLx = tx; _baLy = ty;
                break;
              }
              _baLx = tx; _baLy = ty;
            }
            if (hasCursedExplosionPentacle(dg)) {
              ml.push("呪われた爆発の魔方陣が爆弾矢の爆発を打ち消した！");
            } else {
              ml.push("爆発！");
              doExplosion(_baLx, _baLy, dg, p, ml, _baNF, "爆弾矢の爆発", null, lu);
            }
          }
          if (p.arrow.count <= 0) {
            const _baEx = p.arrow;
            p.arrow = null;
            p.inventory = p.inventory.filter(i => i !== _baEx);
            ml.push(`${_baName}を使い切った。`);
          }
          endTurn(sr.current, p, ml);
          if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
          setThrowMode(null);
          sr.current = { ...sr.current }; setGs({ ...sr.current });
          return;
        }

        const _arIsPoison = !!_arItem.poison;
        const _arIsPierce = !!_arItem.pierce;
        const _arName = _arItem.name || "矢";
        const _arPierceMode = _arIsPierce || _isFarcast;
        const _arMaxRange = _isCursedFc ? 1 : _arPierceMode ? 50 : 10;
        const _arDropItem = () => _arIsPierce ? makePiercingArrow(1) : _arIsPoison ? makePoisonArrow(1) : makeArrow(1);
        pushBoltAnim(p.x, p.y, dx, dy, dg, _arIsPoison ? "#60d060" : _arIsPierce ? "#ff8844" : "#d0a050");
        p.arrow.count--;
        const dmg = (_arItem.atk || 4) + rng(1, 4);
        let lx = p.x,
          ly = p.y,
          hit = false;
        for (let d = 1; d <= _arMaxRange; d++) {
          const tx = p.x + dx * d,
            ty = p.y + dy * d;
          if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
          if (!_arPierceMode && (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL)) break;
          const m = monsterAt(dg, tx, ty);
          if (m) {
            /* 矢の命中率90%（必中状態なら100%） */
            const _arSureHit = (p.sureHitTurns || 0) > 0;
            const _arMiss = _forceMiss || (!_arSureHit && Math.random() >= 0.90);
            if (_arMiss) {
              ml.push(`${_arName}は${m.name}に外れ、足元に落ちた！`);
              lx = tx; ly = ty; hit = true;
              const _arMissItem = _arDropItem();
              const _arft = new Set();
              withPitfallBag(() => placeItemAt(dg, lx, ly, _arMissItem, ml, _arft));
              const _arTrap = dg.traps.find(t => t.x === tx && t.y === ty);
              if (_arTrap) fireTrapItem(_arTrap, _arMissItem, dg, tx, ty, ml, new Set(), p, dnameRef, lu);
              break;
            } else {
              m.hp -= dmg;
              if (_arIsPoison) m.atk = Math.max(1, Math.floor((m.atk || 1) / 2));
              ml.push(`${_arName}が${m.name}に命中！${dmg}ダメージ！${_arIsPoison ? "攻撃力が半減した！" : ""}`);
              if (m.hp <= 0) { trackMonster(m); killMonster(m, dg, p, ml, lu); }
              if (!_arPierceMode) { hit = true; break; }
              /* 貫通：飛び続ける */
            }
          }
          if (!_arPierceMode) {
            const bb = dg.bigboxes?.find((b) => b.x === tx && b.y === ty);
            if (bb) {
              ml.push(`${_arName}を射った。`);
              bigboxAddItem(bb, _arDropItem(), dg, ml);
              hit = true;
              break;
            }
          }
          lx = tx;
          ly = ty;
        }
        if (_arPierceMode || _isCursedFc) {
          ml.push(`${_arName}を射った。矢は消滅した。`);
          hit = true;
        }
        if (!hit) {
          ml.push(`${_arName}を射った。`);
          const ft = new Set();
          withPitfallBag(() => placeItemAt(dg, lx, ly, _arDropItem(), ml, ft));
        }
        if (p.arrow.count <= 0) {
          const _ex = p.arrow;
          p.arrow = null;
          p.inventory = p.inventory.filter(i => i !== _ex);
          ml.push(`${_arName}を撃ち尽くした。`);
        }
      } else if (mode === "shoot") {
        const it = p.inventory[idx];
        if (!it) {
          setThrowMode(null);
          return;
        }
        pushBoltAnim(p.x, p.y, dx, dy, dg, "#d0a050");
        shootArrow(p, dg, idx, dx, dy, ml, lu, bigboxAddItem);
        if (p.arrow && !p.inventory.includes(p.arrow)) p.arrow = null;
      } else if (mode === "wand_wave") {
        const it = p.inventory[idx];
        if (!it || it.type !== "wand") {
          setThrowMode(null);
          return;
        }
        const _wandBm = getBlessMultiplier(it);
        it.charges--;
        if (inMagicSealRoom(p.x, p.y, dg) || (p.sealedTurns || 0) > 0) {
          ml.push(`${dnameRef(it)}を振ったが、魔法が封印されている！[残${it.charges}回]`);
        } else {
          ml.push(`${dnameRef(it)}を振った！[残${it.charges}回]${it.blessed ? "（祝福）" : it.cursed ? "（呪い）" : ""}`);
          const _wandItemDName = (gi) => itemDisplayName(gi, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
          /* 杖発射前のプレイヤー位置を記録（ワープ系の盗賊判定用） */
          const _preWandPx = p.x, _preWandPy = p.y;
          pushBoltAnim(p.x, p.y, dx, dy, dg, it.effect);
          fireWandBolt(p, dg, it.effect, dx, dy, ml, lu, bigboxAddItem, _wandBm, _wandItemDName);
          /* プレイヤー位置が変わった場合、ショップ離脱盗賊チェック */
          if (p.x !== _preWandPx || p.y !== _preWandPy) {
            const _wAllShops = getShops(dg);
            for (const _ws of _wAllShops) {
              if (!_ws.room) continue;
              const _wWasIn = _preWandPx >= _ws.room.x && _preWandPx < _ws.room.x + _ws.room.w &&
                              _preWandPy >= _ws.room.y && _preWandPy < _ws.room.y + _ws.room.h;
              const _wNowIn = p.x >= _ws.room.x && p.x < _ws.room.x + _ws.room.w &&
                              p.y >= _ws.room.y && p.y < _ws.room.y + _ws.room.h;
              if (_wWasIn && !_wNowIn && _ws.unpaidTotal > 0) {
                dg.shopTheft = true;
                for (const _ci of p.inventory) { delete _ci.shopPrice; delete _ci._shopId; }
                ml.push("店から盗んで逃げた！");
                break;
              }
            }
          }
          if (p._pendingWarpUp) {
            delete p._pendingWarpUp;
            if (p.depth > 1) {
              const _warpNd = chgFloor(p, -1, true);
              if (_warpNd) sr.current.dungeon = _warpNd;
            } else {
              ml.push("ここは1階だ。何も起こらなかった。");
            }
          }
        }
        if (it.charges <= 0) {
          ml.push(`${dnameRef(it)}は力を失った...`);
          p.inventory.splice(idx, 1);
        }
      } else if (mode === "cast_spell") {
        const spellDef = SPELLS.find((s) => s.id === idx);
        if (!spellDef) { setThrowMode(null); return; }
        const _csLv = (p.spellLevels?.[spellDef.id] || 1);
        const _csCost = Math.max(1, 20 - (_csLv - 1) * 3);
        if (inMagicSealRoom(p.x, p.y, dg) || (p.sealedTurns || 0) > 0) {
          ml.push(`魔法が封印されている！MPは消費しない。`);
        } else if ((p.mp || 0) < _csCost) {
          ml.push(`MPが足りない！(必要:${_csCost} 現在:${p.mp || 0})`);
        } else {
          p.mp = (p.mp || 0) - _csCost;
          ml.push(`${spellDef.name}を唱えた！[MP -${_csCost}]`);
          pushBoltAnim(p.x, p.y, dx, dy, dg, "#60a0ff");
          castSpellBolt(p, dg, spellDef, dx, dy, ml, lu);
        }
      } else {
        const it = p.inventory[idx];
        if (!it) {
          setThrowMode(null);
          return;
        }
        if (it.type === "goal") {
          ml.push("大事なものは投げられない！");
          setThrowMode(null);
          if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
          sr.current = { ...sr.current }; setGs({ ...sr.current });
          return;
        }
        _forceUnequip(p, it);

        /* ── インベントリから投げる石／魔法の石 専用処理 ── */
        if (it.type === "arrow" && (it.stone || it.magicStone)) {
          /* スタックから1個だけ使う */
          it.count--;
          if (it.count <= 0) p.inventory.splice(idx, 1);
          const _invStName = it.name;
          const _invStAtk = it.atk || (it.magicStone ? 5 : 3);
          if (_isFarcast) {
            ml.push(`${_invStName}を投げた。${_invStName}は消滅した。`);
          } else if (it.magicStone) {
            const _msDist2 = (mn) => Math.hypot(mn.x - p.x, mn.y - p.y);
            const _msTarget2 = [...dg.monsters]
              .filter(mn => Math.max(Math.abs(mn.x - p.x), Math.abs(mn.y - p.y)) <= 10)
              .sort((a, b) => _msDist2(a) - _msDist2(b))[0];
            ml.push(`${_invStName}を投げた！`);
            if (!_msTarget2) {
              ml.push(`近くに敵がいない！${_invStName}は消えた。`);
            } else {
              const _msMiss2 = _forceMiss || (!((p.sureHitTurns || 0) > 0) && Math.random() >= 0.90);
              const _msDmg2 = _invStAtk + rng(0, 3);
              if (_msMiss2) {
                ml.push(`${_invStName}は${_msTarget2.name}に外れ、足元に落ちた！`);
                const _msft2 = new Set();
                withPitfallBag(() => placeItemAt(dg, _msTarget2.x, _msTarget2.y, makeMagicStone(1), ml, _msft2));
              } else {
                _msTarget2.hp -= _msDmg2;
                ml.push(`${_invStName}が${_msTarget2.name}にホーミング命中！${_msDmg2}ダメージ！`);
                if (_msTarget2.hp <= 0) { trackMonster(_msTarget2); killMonster(_msTarget2, dg, p, ml, lu); }
              }
            }
          } else {
            const _stRange2 = _isCursedFc ? 1 : 3;
            let _stLx2 = p.x, _stLy2 = p.y;
            for (let d = 1; d <= _stRange2; d++) {
              const tx = p.x + dx * d, ty = p.y + dy * d;
              if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
              if (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) break;
              _stLx2 = tx; _stLy2 = ty;
            }
            const _stM2 = monsterAt(dg, _stLx2, _stLy2);
            const _stDmg2 = _invStAtk + rng(0, 3);
            ml.push(`${_invStName}を投げた！`);
            if (_stM2) {
              const _stMiss2 = _forceMiss || (!((p.sureHitTurns || 0) > 0) && Math.random() >= 0.90);
              if (_stMiss2) {
                ml.push(`${_invStName}は${_stM2.name}に外れた！`);
                const _stft2 = new Set();
                withPitfallBag(() => placeItemAt(dg, _stLx2, _stLy2, makeStone(1), ml, _stft2));
              } else {
                _stM2.hp -= _stDmg2;
                ml.push(`${_invStName}が${_stM2.name}に命中！${_stDmg2}ダメージ！`);
                if (_stM2.hp <= 0) { trackMonster(_stM2); killMonster(_stM2, dg, p, ml, lu); }
              }
            } else {
              const _stft2 = new Set();
              withPitfallBag(() => placeItemAt(dg, _stLx2, _stLy2, makeStone(1), ml, _stft2));
            }
          }
          endTurn(sr.current, p, ml);
          if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
          setThrowMode(null);
          sr.current = { ...sr.current };
          setGs({ ...sr.current });
          return;
        }

        /* ── 爆弾矢 (道具欄から) 専用処理 ── */
        if (it.type === "arrow" && it.bombArrow) {
          it.count--;
          if (it.count <= 0) p.inventory.splice(idx, 1);
          const _baName2 = it.name;
          const _baNF2 = (gi) => itemDisplayName(gi, sr.current.fakeNames, sr.current.ident, sr.current.nicknames);
          ml.push(`${_baName2}を射った！`);
          if (_isFarcast) {
            ml.push(`${_baName2}は消滅した。`);
          } else {
            let _baLx2 = p.x, _baLy2 = p.y;
            const _baMaxR2 = _isCursedFc ? 1 : 10;
            for (let d = 1; d <= _baMaxR2; d++) {
              const tx = p.x + dx * d, ty = p.y + dy * d;
              if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
              if (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL) break;
              const _baM2 = monsterAt(dg, tx, ty);
              if (_baM2) {
                const _baDmg2 = (it.atk || 6) + rng(1, 4);
                _baM2.hp -= _baDmg2;
                ml.push(`${_baName2}が${_baM2.name}に命中！${_baDmg2}ダメージ！`);
                if (_baM2.hp <= 0) { trackMonster(_baM2); killMonster(_baM2, dg, p, ml, lu); }
                _baLx2 = tx; _baLy2 = ty;
                break;
              }
              const _baBB2 = dg.bigboxes?.find(b => b.x === tx && b.y === ty);
              if (_baBB2) {
                ml.push(`${_baName2}が${_baBB2.name}に命中！`);
                _baLx2 = tx; _baLy2 = ty;
                break;
              }
              _baLx2 = tx; _baLy2 = ty;
            }
            if (hasCursedExplosionPentacle(dg)) {
              ml.push("呪われた爆発の魔方陣が爆弾矢の爆発を打ち消した！");
            } else {
              ml.push("爆発！");
              doExplosion(_baLx2, _baLy2, dg, p, ml, _baNF2, "爆弾矢の爆発", null, lu);
            }
          }
          endTurn(sr.current, p, ml);
          if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
          setThrowMode(null);
          sr.current = { ...sr.current }; setGs({ ...sr.current });
          return;
        }

        p.inventory.splice(idx, 1);
        /* 投擲アニメーション */
        pushBoltAnim(p.x, p.y, dx, dy, dg, it.type === "potion" ? "#f050e0" : it.type === "pot" ? "#7a5a2a" : it.type === "wand" ? "#a050f0" : "#aaaaaa");
        if (it.type === "potion") {
          ml.push(`${dnameRef(it)}を投げた！`);
          let lx = p.x, ly = p.y, sprHit = null, _fdBurned = false;
          const _potHits = []; /* 遠投時：軌道上のモンスターを全て記録 */
          for (let d = 1; d <= _maxRange; d++) {
            const tx = p.x + dx * d, ty = p.y + dy * d;
            if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
            if (!_isFarcast && (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL)) break;
            const m = monsterAt(dg, tx, ty);
            if (m) {
              if (_isFarcast) {
                /* 遠投：splash せず個別に薬効果を適用、貫通 */
                _potHits.push(m);
              } else if (m.baseKind === "firedemon") {
                /* 火ダルマ：非遠投の薬を燃やして消滅 */
                ml.push(`${dnameRef(it)}が${m.name}に触れて燃えてなくなった！`);
                lx = tx; ly = ty; _fdBurned = true; break;
              } else if (m.baseKind === "synthmonster") {
                /* 合成獣：薬を飲み込んで合成 */
                m.synthBox = m.synthBox || { kind: "synthesis", name: m.name, contents: [], capacity: 99 };
                m.synthBox.capacity = 99; /* trySynthesizeがcapacityを縮小→breakBigbox防止 */
                bigboxAddItem(m.synthBox, it, dg, ml);
                _synthMonsterSpeedup(m, ml);
                lx = tx; ly = ty; _fdBurned = true; break;
              } else {
                lx = tx; ly = ty; break;
              }
            }
            if (!_isFarcast) {
              const spr = dg.springs?.find((s) => s.x === tx && s.y === ty);
              if (spr) { lx = tx; ly = ty; sprHit = spr; break; }
              const bb3 = dg.bigboxes?.find((b) => b.x === tx && b.y === ty);
              if (bb3) { lx = tx; ly = ty; sprHit = bb3; break; }
            }
            lx = tx; ly = ty;
          }
          if (_fdBurned) {
            /* 火ダルマに燃やされた：何もしない */
          } else if (_isFarcast) {
            /* 遠投：軌道上の全モンスターに個別に効果 */
            if (_potHits.length > 0) {
              for (const _pm of _potHits) {
                applyPotionEffect(it.effect, it.value || 0, "monster", _pm, dg, p, ml, lu, it.blessed || false, it.cursed || false);
                if (_pm.hp <= 0) { trackMonster(_pm); killMonster(_pm, dg, p, ml, lu); }
              }
            }
            ml.push(`${dnameRef(it)}は消滅した。`);
          } else if (_isCursedFc) {
            /* 呪い遠投：1マスで落ちてsplash */
            if (it.effect === "water") applyWaterSplash(dg, lx, ly, it.blessed || false, it.cursed || false, ml);
            else splashPotion(dg, lx, ly, it.effect, it.value || 0, p, ml, lu, it.blessed || false, it.cursed || false, dnameRef);
          } else if (sprHit?.kind) {
            bigboxAddItem(sprHit, it, dg, ml);
          } else if (sprHit && !sprHit.kind) {
            soakItemIntoSpring(sprHit, it, ml, dg, dnameRef);
          } else if (!sprHit) {
            if (it.effect === "water") applyWaterSplash(dg, lx, ly, it.blessed || false, it.cursed || false, ml);
            else splashPotion(dg, lx, ly, it.effect, it.value || 0, p, ml, lu, it.blessed || false, it.cursed || false, dnameRef);
          }
        } else if (it.type === "pot") {
          ml.push(`${dnameRef(it)}${_itemPickupSuffix(it, sr.current?.ident)}を投げた！`);
          let lx = p.x, ly = p.y, sprHit = null, _potFdBurned = false;
          for (let d = 1; d <= _maxRange; d++) {
            const tx = p.x + dx * d, ty = p.y + dy * d;
            if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
            if (!_isFarcast && (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL)) break;
            const m = monsterAt(dg, tx, ty);
            if (m) {
              const _potSureHit = (p.sureHitTurns || 0) > 0;
              const _potMiss = _forceMiss || (!_isFarcast && !_potSureHit && Math.random() >= 0.90);
              if (!_isFarcast && m.baseKind === "firedemon") {
                /* 火ダルマ：非遠投の壺を燃やして消滅 */
                ml.push(`${dnameRef(it)}が${m.name}に触れて燃えてなくなった！（中身も消えた）`);
                lx = tx; ly = ty; _potFdBurned = true; break;
              }
              if (_potMiss) {
                /* 外れ：敵の足元に落ちて壺の内容物が散らばる */
                lx = tx; ly = ty;
                ml.push(`${dnameRef(it)}は${m.name}に外れ、足元に落ちた！`);
                const _ptTrap = dg.traps.find(t => t.x === tx && t.y === ty);
                if (_ptTrap) fireTrapItem(_ptTrap, it, dg, tx, ty, ml, new Set(), p, dnameRef, lu);
                break;
              }
              if (consumeBarrier(m, ml)) { if (!_isFarcast) { lx = tx; ly = ty; break; } }
              else {
                const _ptd = clampDmgFixed(m, 3 + rng(0, 3), true);
                m.hp -= _ptd;
                ml.push(`${dnameRef(it)}が${m.name}に命中！${_ptd}ダメージ！`);
                if (m.hp <= 0) { trackMonster(m); killMonster(m, dg, p, ml, lu); }
              }
              if (!_isFarcast) { lx = tx; ly = ty; break; }
            }
            if (!_isFarcast) {
              const spr = dg.springs?.find((s) => s.x === tx && s.y === ty);
              if (spr) { lx = tx; ly = ty; sprHit = spr; break; }
              const bb4 = dg.bigboxes?.find((b) => b.x === tx && b.y === ty);
              if (bb4) { lx = tx; ly = ty; sprHit = bb4; break; }
            }
            lx = tx; ly = ty;
          }
          if (_potFdBurned) {
            /* 火ダルマに燃やされた：何もしない */
          } else if (_isFarcast) {
            /* 遠投：壺は消滅（中身もろとも） */
            ml.push(`${dnameRef(it)}は消滅した。`);
          } else if (sprHit?.kind) {
            bigboxAddItem(sprHit, it, dg, ml);
          } else if (sprHit && !sprHit.kind) {
            soakItemIntoSpring(sprHit, it, ml, dg, dnameRef);
          } else {
            scatterPotContents(it, dg, lx, ly, p, ml, lu, dnameRef);
          }
        } else {
          const td =
            (it.type === "weapon"
              ? it.atk || 3
              : it.type === "arrow"
                ? it.atk * Math.min(it.count, 5) + it.count
                : 3) + rng(0, 3);
          /* 投げメッセージ用ラベル生成：武器/防具は+値付き、杖/ペンはチャージ付き、矢は本数付き */
          const _mkThrowLb = () => {
            if (it.type === "arrow") return (it.stone || it.magicStone) ? `${it.name}(${it.count}個)` : `矢の束(${it.count}本)`;
            const _tnm = dnameRef(it);
            if (it.type === "weapon") {
              const _tp = it.plus ? (it.plus > 0 ? "+" : "") + it.plus : "";
              return `${_tnm}${_tp} (攻+${it.atk + (it.plus || 0)})`;
            }
            if (it.type === "armor") {
              const _tp = it.plus ? (it.plus > 0 ? "+" : "") + it.plus : "";
              return `${_tnm}${_tp} (防+${it.def + (it.plus || 0)})`;
            }
            return `${_tnm}${_itemPickupSuffix(it, sr.current?.ident)}`;
          };
          let lx = p.x, ly = p.y, hit = false, sprHit = null;
          let _wandFiredEffect = false; /* 杖が実際に効果を発動したか */
          let _throwSwapTarget = null; /* 遠投場所替え：最後に当たった敵を記録 */
          for (let d = 1; d <= _maxRange; d++) {
            const tx = p.x + dx * d, ty = p.y + dy * d;
            if (tx < 0 || tx >= MW || ty < 0 || ty >= MH) break;
            if (!_isFarcast && (dg.map[ty][tx] === T.WALL || dg.map[ty][tx] === T.BWALL)) break;
            const m = monsterAt(dg, tx, ty);
            if (m) {
              const _thSureHit = (p.sureHitTurns || 0) > 0;
              const _thMiss = _forceMiss || (!_isFarcast && !_thSureHit && Math.random() >= 0.90);
              const lb = _mkThrowLb();
              if (!_isFarcast && m.baseKind === "firedemon") {
                /* 火ダルマ：非遠投のアイテムを燃やして消滅（矢も含む） */
                ml.push(`${lb}が${m.name}に触れて燃えてなくなった！`);
                lx = tx; ly = ty; hit = true; break;
              }
              if (!_isFarcast && m.baseKind === "synthmonster") {
                /* 合成獣：種別を問わずアイテムを飲み込んで合成 */
                m.synthBox = m.synthBox || { kind: "synthesis", name: m.name, contents: [], capacity: 99 };
                m.synthBox.capacity = 99; /* trySynthesizeがcapacityを縮小→breakBigbox防止 */
                bigboxAddItem(m.synthBox, it, dg, ml);
                _synthMonsterSpeedup(m, ml);
                lx = tx; ly = ty; hit = true;
                if (it.type === "wand") _wandFiredEffect = true; /* 杖の二重配置を防止 */
                break;
              }
              if (_thMiss) {
                /* 外れ：敵の足元に落ちる */
                lx = tx; ly = ty; hit = true;
                ml.push(`${lb}は${m.name}に外れ、足元に落ちた！`);
                const _fm_ft = new Set();
                withPitfallBag(() => placeItemAt(dg, lx, ly, it, ml, _fm_ft));
                const _thTrap = dg.traps.find(t => t.x === tx && t.y === ty);
                if (_thTrap) fireTrapItem(_thTrap, it, dg, tx, ty, ml, new Set(), p, dnameRef, lu);
                break;
              }
              if (it.type === "wand") {
                /* 杖を投げて命中：チャージ不問で効果を1回発動し消滅 */
                const _throwWandBm = getBlessMultiplier(it);
                const _throwWandDName = (gi) => itemDisplayName(gi, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
                ml.push(`${lb}が${m.name}に命中！`);
                if (_isFarcast && it.effect === "swap") {
                  /* 遠投場所替え：最後に当たった敵を記録して後でまとめて入れ替え */
                  _throwSwapTarget = m;
                } else {
                  applyWandEffect(it.effect, "monster", m, dx, dy, dg, p, ml, lu, bigboxAddItem, _throwWandBm, _throwWandDName);
                  _wandFiredEffect = true;
                }
                if (p._pendingWarpUp) {
                  delete p._pendingWarpUp;
                  if (p.depth > 1) { const _wn = chgFloor(p, -1, true); if (_wn) sr.current.dungeon = _wn; }
                  else ml.push("ここは1階だ。何も起こらなかった。");
                }
              } else {
                if (consumeBarrier(m, ml)) { if (!_isFarcast) { lx = tx; ly = ty; hit = true; break; } }
                else {
                  const _itd = clampDmgFixed(m, td, true);
                  m.hp -= _itd;
                  ml.push(`${lb}が${m.name}に命中！${_itd}ダメージ！`);
                  if (m.hp <= 0) { trackMonster(m); killMonster(m, dg, p, ml, lu); }
                }
              }
              if (!_isFarcast) { lx = tx; ly = ty; hit = true; break; }
            }
            if (!_isFarcast) {
              const spr = dg.springs?.find((s) => s.x === tx && s.y === ty);
              if (spr) { lx = tx; ly = ty; sprHit = spr; break; }
              const bb5 = dg.bigboxes?.find((b) => b.x === tx && b.y === ty);
              if (bb5) { lx = tx; ly = ty; sprHit = bb5; break; }
            }
            lx = tx; ly = ty;
          }
          if (_isFarcast) {
            const lb = _mkThrowLb();
            /* 遠投場所替え：最後に当たった敵と入れ替え */
            if (it.type === "wand" && it.effect === "swap" && _throwSwapTarget) {
              const _throwWandBm = getBlessMultiplier(it);
              const _throwWandDName = (gi) => itemDisplayName(gi, sr.current?.fakeNames, sr.current?.ident, sr.current?.nicknames);
              applyWandEffect("swap", "monster", _throwSwapTarget, dx, dy, dg, p, ml, lu, bigboxAddItem, _throwWandBm, _throwWandDName);
            }
            ml.push(`${lb}を投げた。${lb}は消滅した。`);
          } else if (hit && it.type === "wand" && !_wandFiredEffect) {
            /* 外れた杖は足元に落ちる */
            const ft = new Set();
            withPitfallBag(() => placeItemAt(dg, lx, ly, it, ml, ft));
          } else if (!hit) {
            const lb = _mkThrowLb();
            ml.push(`${lb}を投げた。`);
            if (sprHit?.kind) {
              bigboxAddItem(sprHit, it, dg, ml);
            } else if (sprHit && !sprHit.kind) {
              soakItemIntoSpring(sprHit, it, ml, dg, dnameRef);
            } else if (it.type === "bottle") {
              ml.push(`${it.name}は割れてしまった！`);
            } else {
              const ft = new Set();
              withPitfallBag(() => placeItemAt(dg, lx, ly, it, ml, ft, 0, p));
            }
          }
        }
      }
      endTurn(sr.current, p, ml);
      if (ml.length) setMsgs((prev) => [...prev.slice(-80), ...ml]);
      setThrowMode(null);
      sr.current = { ...sr.current };
      setGs({ ...sr.current });
    },
    [throwMode, lu, endTurn, chgFloor],
  );
  return {
    doUseItem, doDropItem, doThrow, doShoot, doWaveWand, doBreakWand,
    doUseMarker, doReadSpellbook, doMarkerWrite, doPutItem, doBreakPot,
    execDirection,
  };
}
