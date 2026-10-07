import { afterEach, describe, expect, it, vi } from 'vitest';
import { monsterAt, T, MW, MH } from '../utils.js';
import { monsterAI } from '../monsters.js';
import { splashPotion, throwItemAlongLine, applySpellEffect, pushEntity } from '../items.js';
import { applyWandEffect, fireWandBolt, triggerWandBreakEffect } from '../wands.js';
import { monsterAreaHitCount, monsterBodyCells, canPlaceMonsterBody } from '../monsterGeometry.js';
import { monsterDrawBounds, drawLargeMonster } from '../monsterRendering.js';
import { makeEmptyDg, makePlayer } from './helpers.js';

afterEach(() => vi.restoreAllMocks());
function giant(size = 3, overrides = {}) {
  return { id:'giant', name:'巨大敵', x:10, y:10, hp:2000, maxHp:2000, atk:20, def:0,
    exp:10, speed:1, baseSpeed:1, bodySize:size, kind:'beast', baseKind:'giant',
    monLevel:1, aware:true, lastPx:5, lastPy:10, dir:{x:0,y:0}, ...overrides };
}
describe('巨大敵の体の命中判定', () => {
  it.each([2,3])('大きさ%sの全マスから同一の敵を取得する', size => {
    const m=giant(size), dg=makeEmptyDg({monsters:[m]});
    for(const cell of monsterBodyCells(m)) expect(monsterAt(dg,cell.x,cell.y)).toBe(m);
    expect(monsterAt(dg,8,10)).toBeUndefined();
  });
  it.each([[2,10,10,4],[3,9,10,6],[3,10,10,9]])('炎の飛沫: 大きさ%s・着弾(%s,%s)で%sヒット', (size,x,y,hits) => {
    vi.spyOn(Math,'random').mockReturnValue(0);
    const m=giant(size), dg=makeEmptyDg({monsters:[m]}), p=makePlayer({x:2,y:2});
    splashPotion(dg,x,y,'fire',50,p,[],()=>{});
    expect(m.hp).toBe(2000-45*hits);
    expect(monsterAreaHitCount(m,x-1,y-1,3)).toBe(hits);
  });
  it('実際に飛ばした薬は体の端で割れ、正面中央なら6ヒット', () => {
    vi.spyOn(Math,'random').mockReturnValue(0);
    const m=giant(), dg=makeEmptyDg({monsters:[m]}), p=makePlayer({x:5,y:10});
    throwItemAlongLine(p,dg,{id:'potion',name:'炎の薬',type:'potion',effect:'fire',value:50},1,0,15,[],p,()=>{},{isPlayerShooter:true});
    expect(m.hp).toBe(1730);
  });
  it('範囲の途中で倒れても経験値・撃破処理は1体分', () => {
    vi.spyOn(Math,'random').mockReturnValue(0);
    const m=giant(3,{hp:50}), dg=makeEmptyDg({monsters:[m]}), p=makePlayer({x:2,y:2,exp:0});
    const lu=vi.fn(), logs=[];
    splashPotion(dg,10,10,'fire',50,p,logs,lu);
    expect(dg.monsters).toEqual([]);
    expect(p.exp).toBe(10);
    expect(lu).toHaveBeenCalledTimes(1);
  });
  it('中心が視界外でも見えている体の3マスに雷魔法が当たる', () => {
    vi.spyOn(Math,'random').mockReturnValue(0);
    const m=giant(), visible=Array.from({length:MH},()=>Array(MW).fill(false));
    for(let y=9;y<=11;y++) visible[y][9]=true;
    const dg=makeEmptyDg({monsters:[m],visible}), p=makePlayer({x:2,y:2});
    applySpellEffect('lightning_magic','self',p,0,0,dg,p,[],()=>{});
    expect(m.hp).toBe(2000-22*3);
  });
  it('体の端に振った杖は単体として1回命中する', () => {
    vi.spyOn(Math,'random').mockReturnValue(0);
    const m=giant(), dg=makeEmptyDg({monsters:[m]}), p=makePlayer({x:5,y:10});
    fireWandBolt(p,dg,'lightning',1,0,[],()=>{},null);
    expect(m.hp).toBe(1980);
  });
  it('杖の破壊効果が体の全マスに命中しても撃破後の経験値を重ねない', () => {
    vi.spyOn(Math,'random').mockReturnValue(0);
    const m=giant(3,{hp:25}), p=makePlayer({x:2,y:2,exp:0}), dg=makeEmptyDg({monsters:[m]});
    const lu=vi.fn();
    triggerWandBreakEffect({type:'wand',effect:'lightning',charges:1},10,10,dg,p,[],lu);
    expect(dg.monsters).toEqual([]); expect(p.exp).toBe(10); expect(lu).toHaveBeenCalledTimes(1);
  });
});

describe('巨大敵の移動と表示', () => {
  it('1マス幅の廊下を進み、体の端に隣接したら止まって攻撃する', () => {
    vi.spyOn(Math,'random').mockReturnValue(0.1);
    const m=giant(3,{x:10,y:10}), p=makePlayer({x:5,y:10});
    const map=Array.from({length:MH},()=>Array(MW).fill(T.WALL));
    for(let x=1;x<MW-1;x++) map[10][x]=T.FLOOR;
    const dg=makeEmptyDg({map,monsters:[m],rooms:[],visible:[]});
    monsterAI(m,dg,p,[],{moveOnly:true}); expect(m.x).toBe(9);
    monsterAI(m,dg,p,[],{moveOnly:true}); expect(m.x).toBe(8);
    monsterAI(m,dg,p,[],{moveOnly:true}); expect(m.x).toBe(7);
    monsterAI(m,dg,p,[],{moveOnly:true}); expect(m.x).toBe(7);
    monsterAI(m,dg,p,[],{attackOnly:true}); expect(p.hp).toBeLessThan(100);
  });
  it('吹き飛ばされた体の端でもプレイヤーとの衝突を検出する', () => {
    const m=giant(), p=makePlayer({x:14,y:10}), dg=makeEmptyDg({monsters:[m]});
    pushEntity(dg,m.x,m.y,1,0,10,[],'monster',m,p,()=>{},10);
    expect(m.x).toBe(12); expect(p.hp).toBe(90);
    expect(canPlaceMonsterBody(dg,m,13,10,p)).toBe(false);
  });
  it('隣接した位置交換で体がプレイヤーに重なる場合は実行しない', () => {
    const m=giant(), p=makePlayer({x:8,y:10}), dg=makeEmptyDg({monsters:[m]});
    // 中心同士は2マス離れるので、このケースは交換できる。
    applyWandEffect('swap','monster',m,1,0,dg,p,[],()=>{});
    expect([m.x,p.x]).toEqual([8,10]);
    const blocker={...giant(1),id:'other',x:7,y:10};
    dg.monsters.push(blocker);
    applyWandEffect('swap','monster',m,-1,0,dg,p,[],()=>{});
    expect([m.x,p.x]).toEqual([10,8]);
    expect(canPlaceMonsterBody(dg,m,8,10,p)).toBe(false);
  });
  it('1枚の画像を3マス幅に描き、視界外の体を隠す', () => {
    const m=giant(), dg=makeEmptyDg({visible:Array.from({length:MH},()=>Array(MW).fill(false))});
    dg.visible[10][9]=true;
    const ctx=Object.fromEntries(['save','restore','beginPath','rect','clip'].map(k=>[k,vi.fn()])), draw=vi.fn();
    expect(drawLargeMonster(ctx,m,dg,0,0,16,draw)).toBe(true);
    expect(ctx.rect).toHaveBeenCalledExactlyOnceWith(144,160,16,16);
    expect(draw).toHaveBeenCalledExactlyOnceWith(160,160);
    expect(monsterDrawBounds(m,160,160,16)).toEqual({x:144,y:144,size:48});
  });
});
