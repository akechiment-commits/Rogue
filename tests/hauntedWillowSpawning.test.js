import { afterEach, describe, expect, it, vi } from 'vitest';
import { MONS, isMonsterDefAvailableAt, pickMonsterDef } from '../monsters.js';
import { legendMonsterSpawnWeight } from '../legendMonsterRules.js';
const willow=MONS.find(mon=>mon.baseKind==='hauntedWillow');
afterEach(()=>vi.restoreAllMocks());
describe('お化け柳の実際の出現候補',()=>{
  it.each(['intermediate','advanced','legend'])('%sの宣言範囲と実際の階別候補が一致する',type=>{
    const isAvailable = floor => type === 'intermediate' ? floor >= 18 && floor <= 20
      : type === 'advanced' ? floor >= 18 && floor <= 29
        : (floor >= 26 && floor <= 28) || (floor >= 37 && floor <= 39) || (floor >= 46 && floor <= 48);
    for(let floor=1;floor<=50;floor++) {
      expect(isMonsterDefAvailableAt(willow,floor-1,type),type + ' B' + floor + 'F').toBe(isAvailable(floor));
    }
  });
  it.each([
    ['intermediate',18,1],['intermediate',20,1],
    ['advanced',18,1],['advanced',24,1],['advanced',25,2],['advanced',29,2],
    ['legend',26,1],['legend',28,1],['legend',37,2],['legend',39,2],['legend',46,3],['legend',48,3],
  ])('%s B%sFの実抽選で柳の形態を選べる',(type,floor,level)=>{
    const eligible=MONS.filter(mon=>isMonsterDefAvailableAt(mon,floor-1,type));
    const index=eligible.indexOf(willow);
    expect(index).toBeGreaterThanOrEqual(0);
    if(type==='legend'){
      // legendは出現ウェイト付き抽選のため、柳のウェイト区間の中央を狙う
      const weights=eligible.map(mon=>legendMonsterSpawnWeight(mon.baseKind,floor));
      const total=weights.reduce((sum,weight)=>sum+weight,0);
      const before=weights.slice(0,index).reduce((sum,weight)=>sum+weight,0);
      vi.spyOn(Math,'random').mockReturnValue((before+weights[index]/2)/total);
    } else {
      vi.spyOn(Math,'random').mockReturnValue((index+0.5)/eligible.length);
    }
    expect(pickMonsterDef(floor-1,type)).toEqual({base:willow,spawnLevel:level});
  });
});
