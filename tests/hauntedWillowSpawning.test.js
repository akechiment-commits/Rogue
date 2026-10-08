import { afterEach, describe, expect, it, vi } from 'vitest';
import { MONS, isMonsterDefAvailableAt, pickMonsterDef } from '../monsters.js';
const willow=MONS.find(mon=>mon.baseKind==='hauntedWillow');
afterEach(()=>vi.restoreAllMocks());
describe('お化け柳の実際の出現候補',()=>{
  it.each(['intermediate','advanced','legend'])('%sの宣言範囲と実際の階別候補が一致する',type=>{
    const range=willow.dungeonFloors[type] || {min:willow.minFloor,max:willow.maxFloor};
    for(let floor=1;floor<=50;floor++) {
      expect(isMonsterDefAvailableAt(willow,floor-1,type),`${type} B${floor}F`).toBe(floor>=range.min && floor<=range.max);
    }
  });
  it.each([['intermediate',18],['intermediate',20],['advanced',18],['advanced',29],['legend',20],['legend',50]])('%s B%sFの実抽選でも柳を選べる',(type,floor)=>{
    const eligible=MONS.filter(mon=>isMonsterDefAvailableAt(mon,floor-1,type));
    const index=eligible.indexOf(willow);
    expect(index).toBeGreaterThanOrEqual(0);
    vi.spyOn(Math,'random').mockReturnValue((index+0.5)/eligible.length);
    expect(pickMonsterDef(floor-1,type)).toEqual({base:willow,spawnLevel:1});
  });
});
