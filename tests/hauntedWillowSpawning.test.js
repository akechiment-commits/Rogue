import { afterEach, describe, expect, it, vi } from 'vitest';
import { MONS, isMonsterDefAvailableAt, pickMonsterDef } from '../monsters.js';
const willow=MONS.find(mon=>mon.baseKind==='hauntedWillow');
afterEach(()=>vi.restoreAllMocks());
describe('お化け柳の実際の出現候補',()=>{
  it.each(['intermediate','advanced','legend'])('%sの宣言範囲と実際の階別候補が一致する',type=>{
    const isAvailable = floor => type === 'intermediate' ? floor >= 18 && floor <= 20
      : type === 'advanced' ? floor >= 18 && floor <= 29
        : (floor >= 20 && floor <= 29) || (floor >= 35 && floor <= 39) || (floor >= 44 && floor <= 50);
    for(let floor=1;floor<=50;floor++) {
      expect(isMonsterDefAvailableAt(willow,floor-1,type),type + ' B' + floor + 'F').toBe(isAvailable(floor));
    }
  });
  it.each([
    ['intermediate',18,1],['intermediate',20,1],
    ['advanced',18,1],['advanced',24,1],['advanced',25,2],['advanced',29,2],
    ['legend',20,1],['legend',29,1],['legend',35,2],['legend',39,2],['legend',44,3],['legend',50,3],
  ])('%s B%sFの実抽選で柳の形態を選べる',(type,floor,level)=>{
    const eligible=MONS.filter(mon=>isMonsterDefAvailableAt(mon,floor-1,type));
    const index=eligible.indexOf(willow);
    expect(index).toBeGreaterThanOrEqual(0);
    vi.spyOn(Math,'random').mockReturnValue((index+0.5)/eligible.length);
    expect(pickMonsterDef(floor-1,type)).toEqual({base:willow,spawnLevel:level});
  });
});
