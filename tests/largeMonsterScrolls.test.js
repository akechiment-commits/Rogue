import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react',()=>({useCallback:fn=>fn,useEffect:()=>{},useRef:value=>({current:value})}));
import { useItemActions } from '../useItemActions.js';
import { KING_BEHINMOS } from '../monsters.js';
import { makeEmptyDg, makePlayer } from './helpers.js';
import { MW, MH } from '../utils.js';
afterEach(()=>vi.restoreAllMocks());
describe('巨大ボスへ巻物を読む実処理',()=>{
  it.each([['flame',false,3,30],['thunder',false,3,30],['flame',true,9,60],['thunder',true,9,60],['recovery',false,3,50]])('%s・祝福%sは対象の体%sマスに各%s適用する',(effect,blessed,hits,damage)=>{
    vi.spyOn(Math,'random').mockReturnValue(0);
    const scroll={id:'scroll',name:'巻物',type:'scroll',effect,blessed,cursed:effect==='recovery',bcKnown:true};
    const player=makePlayer({x:2,y:2,depth:25,hp:500,maxHp:500,inventory:[scroll]});
    const boss={...KING_BEHINMOS,id:'king',x:10,y:10,maxHp:1200};
    const visible=Array.from({length:MH},()=>Array(MW).fill(false)); for(let y=9;y<=11;y++) visible[y][9]=true;
    const dungeon=makeEmptyDg({depth:24,monsters:[boss],visible,explored:visible.map(row=>[...row]),rooms:[]});
    const sr={current:{player,dungeon,ident:new Set([`s:${effect}`]),allBcKnown:true}},endTurn=vi.fn();
    const actions=useItemActions({sr,endTurn,dnameRef:it=>it.name,lu:()=>{},
      setGs:()=>{},setMsgs:()=>{},setShowInv:()=>{},setSelIdx:()=>{},setShowDesc:()=>{}});
    actions.doUseItem(0);
    expect(boss.hp).toBe(1200-hits*damage); expect(player.inventory).toEqual([]); expect(endTurn).toHaveBeenCalledOnce();
  });
});
