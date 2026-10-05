import fs from "node:fs";
import * as items from "../items.js";
import * as utils from "../utils.js";
import * as wands from "../wands.js";
import * as status from "../statusDuration.js";
import * as discovery from "../DiscoveryTracker.js";
import * as gameHelpers from "../GameHelpers.js";
import { findRoom } from "../monsters.js";
import { itemDisplayName } from "../render.js";
import { pl } from "../playerLabel.js";

// React と表示だけを省き、Game の実際の投入・箱破壊コールバックを実行する。
// 合成処理はこのハーネスの対象外。呼ばれた場合は明示的に失敗させる。
export function createGameBigboxHandlers(state) {
  const source = fs.readFileSync(new URL("../Game.jsx", import.meta.url), "utf8");
  const breakStart = source.indexOf("  const breakBigbox = useCallback(");
  const breakEnd = source.indexOf("  const trySynthesize = useCallback(", breakStart);
  const addStart = source.indexOf("  const bigboxAddItem = useCallback(");
  const addEnd = source.indexOf("  /** 願い成功時：泉を必ず干上がらせる */", addStart);
  if ([breakStart, breakEnd, addStart, addEnd].some(index => index < 0)) throw new Error("Game big-box callback boundary not found");
  const deps = { ...items, ...utils, ...wands, ...status, ...discovery, ...gameHelpers,
    sr: { current: state }, useCallback: fn => fn, lu: () => {}, findRoom, itemDisplayName,
    pl, trySynthesize: () => { throw new Error("Synthesis is outside this harness"); } };
  return new Function(...Object.keys(deps), `${source.slice(breakStart, breakEnd)}\n${source.slice(addStart, addEnd)}\nreturn { bigboxAddItem, breakBigbox };`)(...Object.values(deps));
}
