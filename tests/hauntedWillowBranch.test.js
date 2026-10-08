import { afterEach, describe, expect, it, vi } from 'vitest';
import { MONS, makeMonsterFromBase, monsterAI } from '../monsters.js';
import { fireTrapPlayer } from '../traps.js';
import { T } from '../utils.js';
import { drainAnims } from '../animEvents.js';
import { makeEmptyDg, makePlayer } from './helpers.js';
afterEach(()=>{vi.restoreAllMocks();drainAnims();});
function scenario({core=false,wall=false,trapAtLanding=false,miss=false}={}) {
  drainAnims();
  vi.spyOn(Math,'random').mockReturnValue(miss?0.99:0.1);
  const willow=makeMonsterFromBase(MONS.find(mon=>mon.baseKind==='hauntedWillow'),1,10,10);
  Object.assign(willow,{aware:true,_willowAttackType:'branch'});
  const armor={name:'防具',type:'armor',def:3,plus:5};
  const player=makePlayer({x:9,y:10,hp:200,maxHp:200,armor,rings:core?[{effect:'core_ring'}]:[]});
  const trap={id:'rust',name:'錆の罠',effect:'rust',x:trapAtLanding?8:9,y:10,revealed:true,permanent:true};
  const dungeon=makeEmptyDg({monsters:[willow],traps:[trap],rooms:[{x:1,y:1,w:20,h:20}]});
  if(wall) dungeon.map[10][8]=T.WALL;
  const messages=[],fireTrapFn=vi.fn((t,p,dg,ml)=>fireTrapPlayer(t,p,dg,ml,it=>it.name,()=>{}));
  monsterAI(willow,dungeon,player,messages,{attackOnly:true,fireTrapFn,luFn:()=>{}});
  return {player,armor,fireTrapFn,messages};
}
describe('柳の枝払いは実際に押し出した着地先だけの罠を起動する',()=>{
  it.each([{core:true},{wall:true}])('指輪・壁で移動しない場合、足元の錆罠を再起動しない: %j',opts=>{
    const s=scenario(opts);
    expect([s.player.x,s.player.y]).toEqual([9,10]);
    expect(s.player.hp).toBeLessThan(200);
    expect(s.armor.plus).toBe(5); expect(s.fireTrapFn).not.toHaveBeenCalled();
  });
  it('通常の押し出しでは着地先の錆罠を1回起動する',()=>{
    const s=scenario({trapAtLanding:true});
    expect([s.player.x,s.player.y]).toEqual([8,10]);
    expect(s.armor.plus).toBe(4); expect(s.fireTrapFn).toHaveBeenCalledOnce();
    expect(drainAnims().filter(event=>event.type==='playerKnockback')).toHaveLength(1);
  });
  it('攻撃を外した場合は押し出しも罠起動もしない',()=>{
    const s=scenario({miss:true,trapAtLanding:true});
    expect([s.player.x,s.player.y]).toEqual([9,10]);
    expect(s.armor.plus).toBe(5); expect(s.fireTrapFn).not.toHaveBeenCalled();
  });
});
