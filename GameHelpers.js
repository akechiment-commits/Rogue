import { getIdentKey } from "./items.js";

/* インベントリサブメニューのアクション数を返す（DPad左右カーソル用） */
export function _invActCount(it, absIdx, canUseFn, gs) {
  const _CAN_USE_TYPES = ["potion","food","scroll","weapon","armor","arrow","ring","pot","pen"];
  let n = 0;
  if (_CAN_USE_TYPES.includes(it.type)) n++;
  if (it.type === "spellbook") n++;
  if (it.type === "arrow") n++;
  if (it.type === "wand") n += 2;
  if (it.type === "marker") n++;
  if (it.type === "pot") n++;
  n += 3; // 置く + 投げる + 説明
  const _nik = getIdentKey(it);
  if (_nik && gs?.ident && !gs.ident.has(_nik)) n++;
  return Math.max(1, n);
}

/* 大箱の表示名を返す共通ヘルパー。未識別時は偽名+ニックネーム、識別済みは実名 */
export function bbDisplayName(bb, st, withCapacity = false) {
  if (!bb) return "大箱";
  const isRevealed = bb.revealed === true || !!st?.allBcKnown;
  if (isRevealed) {
    return withCapacity ? `${bb.name}(${bb.contents?.length || 0}/${bb.capacity})` : bb.name;
  }
  const fake = st?.bbFakeNames?.[bb.kind] || "謎の大箱";
  const nick = st?.nicknames?.["bk:" + bb.kind];
  const base = nick ? `${fake} (${nick})` : fake;
  return base;
}

export const FLOOR_TITLES = {
  bigRoom:           "ビッグルームだ！",
  middleRoom:        "ミドルルームだ！",
  miniRoom:          "ミニルームだ！とても狭い！",
  shoppingMall:      "ショッピングモールだ！",
  spinFloor:         "回転板の間だ！",
  corridorFloor:     "迷路の廊下だ！",
  gridRoom:          "格子の大部屋だ！",
  treasureRoom:      "隠し宝部屋だ！",
  ringCorridorFloor: "環状回廊の間だ！",
  caveFloor:         "洞窟の間だ！",
  bossFloor:         "ボスフロアだ！強大な敵が待ち受けている！",
  tutorialFloor:     "チュートリアルの間へようこそ！看板を読んで進もう。",
};

export const MODAL_INIT = { type: null, springMenuSel: 0, springPage: 0, bigboxMenuSel: 0, bigboxPage: 0, shopMenuSel: 0, putMenuSel: 0, putPage: 0, markerMenuSel: 0, markerPage: 0, spellMenuSel: 0, spellPage: 0, nicknameInput: '', data: null };

export function modalReducer(state, action) {
  switch (action.type) {
    case 'SET_MODAL': return { ...MODAL_INIT, type: action.modal, data: action.data || null };
    case 'CLOSE_MODAL': return MODAL_INIT;
    case 'UPDATE': return { ...state, ...action.payload };
    default: return state;
  }
}
