import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("react", () => ({ useCallback: fn => fn, useEffect: () => {}, useRef: value => ({ current: value }) }));
import { fireTrapPlayer } from "../traps.js";
import { useItemActions } from "../useItemActions.js";
import { applyPotionEffect, applySpellEffect, castSpellBolt, applyFoodEffectsOnHit, applyWaterIceFreeze,
  applySoakedStatus, applySoakedFromWaterWalk, applySoakedStatusToMonster, fireTrapItem,
  fireTrapArrowFromFacing, makePoisonArrow, shootArrow, SPELLS, ITEMS, isStatusImmune } from "../items.js";
import { applyWandEffect } from "../wands.js";
import { MONS, BOSSES, makeMonsterFromBase, monsterAI } from "../monsters.js";
import { applyAttackSeal, applyMonsterParalyze, applyMonsterDarkness, applyMonsterBewitch,
  applyPlayerPoison, applyYabaiPoison } from "../statusDuration.js";
import { isStatusImmune as commonImmunity } from "../statusImmunity.js";
import { applySakeEffect } from "../intoxication.js";
import { advanceConsumableBuffTimers } from "../turnUpkeep.js";
import { MW, MH, T } from "../utils.js";
import { makeEmptyDg, makePlayer } from "./helpers.js";
const ailments = ["poisoned", "poisonedTurns", "poisonHalfAtk", "poisonAtkLoss", "sleepTurns", "confusedTurns",
  "slowTurns", "darknessTurns", "bewitchedTurns", "fleeingTurns", "sealed", "sealedTurns", "attackSealTurns",
  "immobileTurns", "frozenTurns", "paralyzed", "paralyzeTurns", "oilyTurns", "soakedTurns", "knockdownTurns",
  "drunkTurns", "drunkenTurns", "hypnosisPending", "dopingAftereffectTurns", "atkDebuffTurns", "defDebuffTurns"];
function context(kind = "player", size = 1, immune = true) {
  const player = makePlayer({ atk: 30, def: 12, mp: 100, maxMp: 100, hunger: 20 });
  const monster = makeMonsterFromBase(MONS.find(m => m.baseKind === "goblin"), 1, 6, 5);
  Object.assign(monster, { bodySize: size, hp: 500, maxHp: 500, atk: 30, def: 12 });
  const dungeon = makeEmptyDg({ rooms: [], monsters: [monster],
    explored: Array.from({ length: MH }, () => Array(MW).fill(false)),
    visible: Array.from({ length: MH }, () => Array(MW).fill(true)) });
  const victim = kind === "player" ? player : monster;
  if (immune) applyWandEffect("paralyze", kind, victim, 1, 0, dungeon, player, [], () => {}, null, 0.5);
  return { player, monster, dungeon, victim, messages: [] };
}
function expectProtected(victim) {
  for (const key of ailments) expect(victim[key] || 0, key).toBeFalsy();
  expect(victim.atk).toBe(30);
  expect(victim.def).toBe(12);
}
beforeEach(() => vi.spyOn(Math, "random").mockReturnValue(0.5));
afterEach(() => vi.restoreAllMocks());


it("既存全薬の通常・祝福・呪いを状態防止中の自分と敵へ適用する追加監査", () => {
 const failures=[];
 for(const item of ITEMS.filter(item=>item.type==="potion")) for(const flags of [{},{blessed:true},{cursed:true}]) {
  for(const kind of ["player","monster"]) {
   const {player,victim,dungeon,messages}=context(kind);
   victim.hp=5000;victim.maxHp=5000;
   applyPotionEffect(item.effect,item.value||0,kind,victim,dungeon,player,messages,()=>{},!!flags.blessed,!!flags.cursed);
   const active=ailments.filter(key=>!!victim[key]);
   if(active.length)failures.push({name:item.name,kind,flags,active});
  }
  const {player,dungeon}=context();player.hp=5000;player.maxHp=5000;
  player.inventory=[{...item,...flags}];
  const sr={current:{player,dungeon,ident:new Set(),floors:{},fakeNames:{},nicknames:{}}};
  useItemActions({sr,chgFloor:()=>null,endTurn:()=>{},dnameRef:it=>it.name,lu:()=>{},setGs:()=>{},setMsgs:()=>{},setShowInv:()=>{},setSelIdx:()=>{},setShowDesc:()=>{}}).doUseItem(0);
  const active=ailments.filter(key=>!!player[key]);
  if(active.length)failures.push({name:item.name,kind:"drink",flags,active});
 }
 expect(failures).toEqual([]);
});
