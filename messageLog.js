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
    const existingLength = Math.min(previous.length, MESSAGE_LOG_LIMIT);
    return next.map((message, index) => (index < existingLength ? message : tagMessage(message, turn)));
  }
  const messages = Array.isArray(update) ? update : [update];
  return messages.map((message) => tagMessage(message, turn));
}

export function appendMessages(previous, additions) {
  return [...previous.slice(-MESSAGE_LOG_LIMIT), ...additions];
}
