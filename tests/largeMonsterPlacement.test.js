import { afterEach, describe, expect, it, vi } from 'vitest';
import { genDungeon, applyMonsterHouseToRoom } from '../dungeon.js';
import { MONS, isMonsterDefAvailableAt } from '../monsters.js';
import { createSeededRng, T } from '../utils.js';
import { monsterBodiesOverlap, monsterOccupiesCell } from '../monsterGeometry.js';
import { canSpawnLargeMonsterAt, settleLargeMonsterSpawns } from '../largeMonsterPlacement.js';
import { makeEmptyDg, makePlayer } from './helpers.js';
afterEach(()=>vi.restoreAllMocks());
function willow(x=5,y=5) {return {id:'willow',baseKind:'hauntedWillow',bodySize:2,x,y,hp:78,maxHp:78,stationary:true};}
describe('巨大雑魚の初期生成配置',()=>{
  it('巻物で柳を発生させても、他の柳とプレイヤーへ体を重ねない',()=>{
    const eligible=MONS.filter(mon=>isMonsterDefAvailableAt(mon,22,'advanced'));
    const index=eligible.findIndex(mon=>mon.baseKind==='hauntedWillow');
    vi.spyOn(Math,'random').mockReturnValue((index+0.5)/eligible.length);
    const room={x:2,y:2,w:12,h:12}, dg=makeEmptyDg({rooms:[room],dungeonType:'advanced'}), p=makePlayer({x:7,y:7,depth:23});
    applyMonsterHouseToRoom(dg,room,p,[],{playerInRoom:true});
    expect(dg.monsters.some(mon=>mon.baseKind==='hauntedWillow')).toBe(true);
    for(let i=0;i<dg.monsters.length;i++) {
      expect(monsterOccupiesCell(dg.monsters[i],p.x,p.y)).toBe(false);
      for(let j=i+1;j<dg.monsters.length;j++) expect(monsterBodiesOverlap(dg.monsters[i],dg.monsters[j])).toBe(false);
    }
  });
  it('実際の上級23階生成でも柳の体が重ならない（再現乱数1）',()=>{
    vi.spyOn(Math,'random').mockImplementation(createSeededRng(1));
    const dg=genDungeon(22,'advanced');
    expect(dg.monsters.some(mon=>mon.baseKind==='hauntedWillow')).toBe(true);
    for(let i=0;i<dg.monsters.length;i++) for(let j=i+1;j<dg.monsters.length;j++) {
      const a=dg.monsters[i],b=dg.monsters[j];
      if(a.bodySize>1||b.bodySize>1) expect(monsterBodiesOverlap(a,b)).toBe(false);
    }
  });
  it('体が階段を覆う柳だけを移し、通常敵の位置・HP・状態は維持する',()=>{
    const tree=willow(), normal={id:'normal',x:10,y:10,hp:24,sleepTurns:3};
    const dg=makeEmptyDg({monsters:[tree,normal],stairUp:{x:6,y:6}});
    const before={...normal}; settleLargeMonsterSpawns(dg);
    expect(monsterOccupiesCell(tree,6,6)).toBe(false); expect(normal).toEqual(before);
    expect(tree).toMatchObject({hp:78,maxHp:78,stationary:true});
  });
  it('体の端が壁をまたぐ1マス幅の通路は生成可能',()=>{
    const tree=willow(), dg=makeEmptyDg({monsters:[tree]});
    dg.map=dg.map.map(row=>row.map(()=>T.WALL)); dg.map[5][5]=T.FLOOR;
    expect(canSpawnLargeMonsterAt(dg,tree,5,5)).toBe(true);
    settleLargeMonsterSpawns(dg); expect(dg.monsters).toEqual([tree]); expect([tree.x,tree.y]).toEqual([5,5]);
  });
  it('全身を置ける空きがないなら柳の初期生成だけを取り消す',()=>{
    const tree=willow(), blocker={id:'blocker',x:6,y:5,hp:10}, dg=makeEmptyDg({monsters:[tree,blocker]});
    dg.map=dg.map.map(row=>row.map(()=>T.WALL)); dg.map[5][5]=T.FLOOR; dg.map[5][6]=T.FLOOR;
    dg.stairUp={x:6,y:5}; settleLargeMonsterSpawns(dg);
    expect(dg.monsters).toEqual([blocker]); expect(blocker.hp).toBe(10);
  });
});
