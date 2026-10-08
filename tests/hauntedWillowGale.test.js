import { afterEach, describe, expect, it, vi } from 'vitest';
import { MONS, makeMonsterFromBase, monsterAI } from '../monsters.js';
import { makeEmptyDg, makePlayer } from './helpers.js';
afterEach(()=>vi.restoreAllMocks());
function gale(victimOverrides={}) {
  vi.spyOn(Math,'random').mockReturnValue(0.1);
  const willow=makeMonsterFromBase(MONS.find(mon=>mon.baseKind==='hauntedWillow'),1,10,10);
  Object.assign(willow,{aware:true,_willowAttackType:'gale'});
  const player=makePlayer({x:3,y:3,hp:200,maxHp:200});
  const victim={id:'victim',name:'相手',x:6,y:6,hp:100,maxHp:100,def:0,barrier:2,...victimOverrides};
  const dungeon=makeEmptyDg({monsters:[willow,victim],rooms:[{x:1,y:1,w:20,h:20}]});
  const messages=[];
  monsterAI(willow,dungeon,player,messages,{attackOnly:true,luFn:()=>{}});
  return {willow,victim,player,messages};
}
describe('柳の烈風が他の敵へ当たる場合のバリア',()=>{
  it('バリアを1回分消費して烈風を防ぐ',()=>{
    const s=gale(); expect(s.player.hp).toBeLessThan(200);
    expect(s.victim.hp).toBe(100); expect(s.victim.barrier).toBe(1);
  });
  it('巨大敵の体にも、1体分のバリアだけを消費する',()=>{
    const s=gale({bodySize:3}); expect(s.victim.hp).toBe(100); expect(s.victim.barrier).toBe(1);
  });
  it('封印でバリア特性が無効なら烈風が当たる',()=>{
    const s=gale({sealed:true}); expect(s.victim.hp).toBeLessThan(100); expect(s.victim.barrier).toBe(2);
  });
});
