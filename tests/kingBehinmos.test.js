import { afterEach, describe, expect, it, vi } from 'vitest';
import { KING_BEHINMOS, monsterAI } from '../monsters.js';
import { genDungeon } from '../dungeon.js';
import { castMeteor, advanceMeteors, drawMeteorWarnings } from '../meteor.js';
import { resolveTurnHazards } from '../turnHazards.js';
import { runMonsterAttackPhase } from '../monsterAttackPhase.js';
import { monsterBodiesOverlap, monsterOccupiesCell } from '../monsterGeometry.js';
import { getMonsterDescription, getMonsterEncyclopediaEntry } from '../monsterEncyclopedia.js';
import { saveGameState, loadGameState } from '../GameSave.js';
import { TILE_NAMES, TILE_RENDER } from '../render.js';
import { MONSTER_SHEET_MAP, DAWNLIKE_FALLBACKS } from '../tilesetMap.js';
import { MW, MH, T } from '../utils.js';
import { makeEmptyDg, makePlayer } from './helpers.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup(overrides = {}) {
  const boss={...KING_BEHINMOS,id:'king',x:10,y:10,maxHp:1200,aware:true,lastPx:5,lastPy:10,dir:{x:0,y:0},...overrides};
  const player=makePlayer({x:5,y:10,exp:0,atk:10,weapon:{ability:'magic_power_2'}});
  const visible=Array.from({length:MH},()=>Array(MW).fill(true));
  const dungeon=makeEmptyDg({depth:24,monsters:[boss],rooms:[{x:1,y:1,w:20,h:20}],visible,explored:visible.map(row=>[...row])});
  return {boss,player,dungeon,messages:[]};
}
function hazards(s,opts={}) {
  resolveTurnHazards({dungeon:s.dungeon},s.player,s.messages,{
    hasRingEffect:()=>false,doExplosion:()=>{},runMineExplosion:()=>{},doTimeBombExplosion:()=>{},
    fireTrapPlayer:()=>{},getItemName:item=>item.name,lu:()=>{},...opts,
  });
}
function attack(s,actions=1) {
  s.boss.turnAttacks=0;
  runMonsterAttackPhase(s.dungeon,s.player,s.messages,{moveMons:(dg,p,ml)=>{
    for(let i=0;i<actions;i++) monsterAI(s.boss,dg,p,ml,{attackOnly:true,luFn:()=>{}});
  }});
}
describe('上級25階のキングベヒんもス',()=>{
  it('上級25階だけを置換し、取り巻きを巨大な体の外へ置く',()=>{
    for(let i=0;i<12;i++) {
      const dg=genDungeon(24,'advanced'), boss=dg.monsters.find(mon=>mon.isBoss);
      expect(boss.baseKind).toBe('boss_kingbehinmos'); expect(boss.bodySize).toBe(3);
      for(const other of dg.monsters.filter(mon=>mon!==boss)) expect(monsterBodiesOverlap(boss,other)).toBe(false);
      expect(monsterOccupiesCell(boss,dg.suX,dg.suY)).toBe(false);
    }
    expect(genDungeon(24,'legend').monsters.find(mon=>mon.isBoss).baseKind).toBe('boss_warlord');
    expect(genDungeon(19,'advanced').monsters.find(mon=>mon.isBoss).baseKind).toBe('boss_demonking');
  });
  it('図鑑・全スタイルのタイル定義から専用ボスを参照できる',()=>{
    expect(getMonsterEncyclopediaEntry(KING_BEHINMOS.name)).toBe(KING_BEHINMOS);
    expect(getMonsterDescription(KING_BEHINMOS.name)).toContain('2ターン後');
    expect(TILE_NAMES[224]).toBe('king_behinmos'); expect(TILE_RENDER[224].ch).toBe('獣');
    expect(MONSTER_SHEET_MAP[224]).toBeDefined(); expect(DAWNLIKE_FALLBACKS[224]).toBe(99);
  });
  it('実際の敵攻撃で詠唱し、次の2回目のフロア拍で着弾する',()=>{
    const s=setup();
    monsterAI(s.boss,s.dungeon,s.player,s.messages,{moveOnly:true});
    expect([s.boss.x,s.boss.y]).toEqual([10,10]);
    expect(s.dungeon.pendingMeteors||[]).toEqual([]);
    hazards(s); attack(s,3);
    expect(s.dungeon.pendingMeteors).toHaveLength(1);
    expect(s.dungeon.pendingMeteors[0].turnsLeft).toBe(2); expect(s.player.hp).toBe(100);
    hazards(s); attack(s,3); expect(s.dungeon.pendingMeteors[0].turnsLeft).toBe(1); expect(s.player.hp).toBe(100);
    hazards(s); expect(s.dungeon.pendingMeteors).toEqual([]); expect(s.player.hp).toBe(40);
    expect(s.messages.filter(m=>m.includes('着弾した'))).toHaveLength(1);
  });
  it('プレイヤーが移動しても予兆は追わず、2歩で範囲の外へ逃げられる',()=>{
    const s=setup(); attack(s);
    s.player.x=4; hazards(s); s.player.x=3; hazards(s);
    expect(s.player.hp).toBe(100); expect(s.dungeon.pendingMeteors).toEqual([]);
  });
  it('倍速の追加拍と時間停止中は進まず、2拍経過なら2拍を進める',()=>{
    const s=setup(); attack(s);
    hazards(s,{tickTimedEffects:false}); expect(s.dungeon.pendingMeteors[0].turnsLeft).toBe(2);
    s.dungeon.timeStopTurns=3; hazards(s); expect(s.dungeon.pendingMeteors[0].turnsLeft).toBe(2);
    s.dungeon.timeStopTurns=0; hazards(s,{worldTicks:2}); expect(s.player.hp).toBe(40);
    expect(s.boss.meteorCooldown).toBe(2);
  });
  it('再詠唱は最短4拍後で、途中に同じ敵の予兆を重ねない',()=>{
    const s=setup(); attack(s);
    for(let i=0;i<3;i++) { s.player.x=3; hazards(s); attack(s); }
    expect(s.dungeon.pendingMeteors).toEqual([]);
    hazards(s); attack(s); expect(s.dungeon.pendingMeteors).toHaveLength(1);
    expect(s.messages.filter(m=>m.includes('詠唱した'))).toHaveLength(2);
  });
  it.each([{sealed:true},{attackSealTurns:5},{sleepTurns:5},{paralyzed:true},{knockdownTurns:3},{confusedTurns:5},{blind:true,blindTurns:5},{bewitched:true,bewitchedTurns:5}])('行動不能・封印中に詠唱しない: %j',status=>{
    const s=setup(status); attack(s); expect(s.dungeon.pendingMeteors||[]).toEqual([]);
  });
  it('魔封じの部屋では詠唱せず、詠唱後の魔封じは着弾ダメージを防ぐ',()=>{
    const s=setup(); s.dungeon.pentacles=[{kind:'magic_seal',x:3,y:3}];
    attack(s); expect(s.dungeon.pendingMeteors||[]).toEqual([]);
    s.dungeon.pentacles=[]; attack(s); s.dungeon.pentacles=[{kind:'magic_seal',x:3,y:3}];
    hazards(s,{worldTicks:2}); expect(s.player.hp).toBe(100);
  });
  it.each([[2,4],[3,9]])('範囲の巨大敵%sは%s回被弾し、プレイヤー武器倍率を受けない', (size,hits)=>{
    const s=setup(); const victim={id:'victim',name:'巨大取り巻き',x:size===3?5:4,y:size===3?10:9,hp:1000,maxHp:1000,bodySize:size,def:0};
    s.player.x=3; s.dungeon.monsters.push(victim);
    castMeteor(s.boss,s.dungeon,{x:5,y:10},s.messages); hazards(s,{worldTicks:2});
    expect(victim.hp).toBe(1000-60*hits);
  });
  it('生存中の詠唱者の撃破扱いになり、経験値をプレイヤーへ与えない',()=>{
    const s=setup(), victim={id:'victim',name:'取り巻き',x:5,y:10,hp:1,maxHp:1,exp:20};
    s.dungeon.monsters.push(victim); s.player.x=3;
    castMeteor(s.boss,s.dungeon,{x:5,y:10},s.messages); hazards(s,{worldTicks:2});
    expect(s.dungeon.monsters).not.toContain(victim); expect(s.player.exp).toBe(0); expect(s.boss.overBoost).toBe(1.2);
    expect(s.boss.atk).toBe(115);
    expect(s.boss.bodySize).toBe(3);
  });
  it('詠唱者が倒れても着弾し、撃破をプレイヤーへ付け替えない',()=>{
    const s=setup(), victim={id:'victim',name:'取り巻き',x:5,y:10,hp:1,maxHp:1,exp:20};
    s.dungeon.monsters.push(victim); attack(s);
    s.dungeon.monsters=s.dungeon.monsters.filter(m=>m!==s.boss); s.boss.hp=0; s.player.x=3;
    hazards(s,{worldTicks:2}); expect(s.dungeon.monsters).toEqual([]); expect(s.player.exp).toBe(0);
  });
  it('詠唱者自身も9回巻き込まれ、床や道具は壊さない',()=>{
    const s=setup(), item={id:'item',name:'道具',x:10,y:10}; s.dungeon.items.push(item);
    s.dungeon.map[9][9]=T.WALL;
    castMeteor(s.boss,s.dungeon,{x:10,y:10},s.messages); hazards(s,{worldTicks:2});
    expect(s.boss.hp).toBe(1200-60*9); expect(s.dungeon.items).toEqual([item]); expect(s.dungeon.map[9][9]).toBe(T.WALL);
  });
  it('バリアは1マス分だけ防ぎ、魔法無効にはダメージを与えない',()=>{
    const s=setup(), victim={id:'v',name:'巨体',x:5,y:10,hp:1000,maxHp:1000,bodySize:3,barrier:true};
    s.dungeon.monsters.push(victim); s.player.x=3; castMeteor(s.boss,s.dungeon,{x:5,y:10},s.messages);
    hazards(s,{worldTicks:2}); expect(victim.hp).toBe(520); expect(victim.barrier).toBeFalsy();
    victim.magicImmune=true; s.boss.meteorCooldown=0; castMeteor(s.boss,s.dungeon,{x:5,y:10},s.messages);
    hazards(s,{worldTicks:2}); expect(victim.hp).toBe(520);
  });
  it('敵の致死ダメージとして処理し、満タンからの60ダメージを1HPに保護しない',()=>{
    const s=setup(); s.player.hp=50; s.player.maxHp=50; attack(s); hazards(s,{worldTicks:2}); expect(s.player.hp).toBeLessThanOrEqual(0);
  });
  it('セーブ後も体の大きさと予兆の残り1拍を保持する',()=>{
    vi.stubGlobal('localStorage',{data:{},setItem(k,v){this.data[k]=v},getItem(k){return this.data[k]??null}});
    const s=setup(); attack(s); hazards(s);
    expect(saveGameState({player:s.player,dungeon:s.dungeon,floors:{},dungeonType:'advanced'},[],{},null)).toBe(true);
    const loaded=loadGameState(); expect(loaded.dungeon.monsters[0].bodySize).toBe(3);
    expect(loaded.dungeon.pendingMeteors[0]).toMatchObject({x:5,y:10,turnsLeft:1});
    advanceMeteors(loaded.dungeon,loaded.player,[],()=>{}); expect(loaded.player.hp).toBe(40);
  });
  it('赤い予兆を見える9マスに描き、残りターンを表示する',()=>{
    const s=setup(); attack(s);
    const ctx=Object.fromEntries(['save','restore','fillRect','strokeRect','fillText','strokeText'].map(k=>[k,vi.fn()]));
    drawMeteorWarnings(ctx,s.dungeon,0,0,16);
    expect(ctx.fillRect).toHaveBeenCalledTimes(9); expect(ctx.fillText).toHaveBeenCalledWith('2',88,168);
    s.dungeon.visible[10][5]=false; ctx.fillRect.mockClear(); hazards(s); drawMeteorWarnings(ctx,s.dungeon,0,0,16);
    expect(ctx.fillRect).toHaveBeenCalledTimes(8); expect(ctx.fillText).toHaveBeenCalledWith('1',72,168);
  });
});
