export const MESSAGE_LOG_LIMIT = 80;

export function tagMessage(message, turn) {
  if (typeof message === "string") return { text: message, turn };
  return message?.turn !== undefined ? message : { ...message, turn };
}

/**
 * React state setter に渡すメッセージ更新を正規化する。
 * updater 形式では既存行の turn を保持し、追加された行だけ現在ターンを付与する。
 */
export function applyMessageUpdate(previous, update, turn) {
  if (typeof update === "function") {
    const next = update(previous);
    // ログを切り詰めた後の追加行は古い配列番号に入ることがある。
    // 既存オブジェクトのturnはtagMessageが保持し、文字列の追加行はすべて正規化する。
    return next.map(message => tagMessage(message, turn));
  }
  const messages = Array.isArray(update) ? update : [update];
  return messages.map((message) => tagMessage(message, turn));
}

export function appendMessages(previous, additions) {
  return [...previous.slice(-MESSAGE_LOG_LIMIT), ...additions];
}
