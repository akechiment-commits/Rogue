/**
 * 復活抑制ルール。
 * 呪われた復活の魔方陣がある部屋では、各種の「蘇り」を禁止する。
 */

function roomAt(rooms, x, y) {
  if (!rooms?.length) return null;
  return rooms.find(
    (r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h,
  ) || null;
}

/**
 * (x,y) が呪われた復活の魔方陣の影響下か。
 * - 魔方陣と同じマス
 * - または同じ部屋（廊下など部屋外は同マスのみ）
 *
 * @param {object} dg dungeon
 * @param {number} x
 * @param {number} y
 */
export function isRevivalSuppressedAt(dg, x, y) {
  const pcs = dg?.pentacles;
  if (!pcs?.length) return false;
  const here = roomAt(dg.rooms, x, y);
  for (const pc of pcs) {
    if (pc.kind !== "revival" || !pc.cursed) continue;
    if (pc.x === x && pc.y === y) return true;
    if (here) {
      const pr = roomAt(dg.rooms, pc.x, pc.y);
      if (pr && pr === here) return true;
    }
  }
  return false;
}

/** メッセージ用（必要なら呼び出し側で push） */
export const REVIVAL_SUPPRESS_MSG = "呪われた復活の魔方陣が蘇りを妨げた！";
