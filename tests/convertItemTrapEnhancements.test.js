import { describe, expect, it } from 'vitest';
import '../monsters.js';
import { convertRoomFloorItemsToMonsters } from '../items.js';
import { makeEmptyDg, makePlayer } from './helpers.js';
import { T } from '../utils.js';

describe('道具魔物化の罠（convertRoomFloorItemsToMonsters）の修正検証', () => {
  it('店の商品や壁埋まりアイテムはモンスター化対象から除外される', () => {
    const room = { x: 2, y: 2, w: 6, h: 6 };
    const player = makePlayer({ x: 3, y: 3, depth: 1 });
    const shopItem = { id: 's1', name: '店の商品', type: 'scroll', x: 4, y: 4, shopPrice: 300, _shopId: 'shop1' };
    const wallItem = { id: 'w1', name: '埋まりアイテム', type: 'pot', x: 2, y: 2, wallEmbedded: true };
    const normalItem = { id: 'n1', name: '普通の薬', type: 'potion', x: 5, y: 5 };
    const dungeon = makeEmptyDg({
      depth: 1,
      rooms: [room],
      items: [shopItem, wallItem, normalItem],
      monsters: []
    });
    const ml = [];

    const convertedCount = convertRoomFloorItemsToMonsters(dungeon, 3, 3, player, ml);

    // 通常アイテム1点のみが変化する
    expect(convertedCount).toBe(1);
    expect(dungeon.items.some(i => i.id === 's1')).toBe(true);
    expect(dungeon.items.some(i => i.id === 'w1')).toBe(true);
    expect(dungeon.items.some(i => i.id === 'n1')).toBe(false);
    expect(dungeon.monsters.length).toBe(1);
  });

  it('水マス上のアイテムがモンスター化する際、地上敵は水マスを避けて安全な床に配置される', () => {
    const room = { x: 2, y: 2, w: 6, h: 6 };
    const player = makePlayer({ x: 3, y: 3, depth: 1 });
    const itemOnWater = { id: 'iw1', name: '水上の薬', type: 'potion', x: 4, y: 4 };
    const dungeon = makeEmptyDg({
      depth: 1,
      rooms: [room],
      items: [itemOnWater],
      monsters: []
    });
    // (4, 4) を水マスにする
    dungeon.map[4][4] = T.WATER;
    const ml = [];

    const convertedCount = convertRoomFloorItemsToMonsters(dungeon, 3, 3, player, ml);

    expect(convertedCount).toBe(1);
    const spawnedMon = dungeon.monsters[0];
    expect(spawnedMon).toBeDefined();
    // 生成された敵が水生または浮遊でないなら、水マス(4, 4)ではなく隣接する安全な床マスにいるはず
    if (!spawnedMon.waterOnly && !spawnedMon.float) {
      expect(spawnedMon.x === 4 && spawnedMon.y === 4).toBe(false);
      expect(dungeon.map[spawnedMon.y][spawnedMon.x]).toBe(T.FLOOR);
    }
  });
});
