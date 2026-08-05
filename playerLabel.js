/** プレイヤー表示名まわり */

export const PLAYER_NAME_MIN = 1;
export const PLAYER_NAME_MAX = 12;

/**
 * 表示用ラベル。未設定時は「プレイヤー」。
 * @param {string|null|undefined} name
 */
export function playerLabel(name) {
  const s = name != null ? String(name).trim() : "";
  return s || "プレイヤー";
}

/**
 * 入力を正規化して検証する。
 * @returns {{ ok: true, name: string } | { ok: false, error: string }}
 */
export function normalizePlayerName(raw) {
  if (raw == null) return { ok: false, error: "名前を入力してください。" };
  // 前後空白・連続空白を整理
  const name = String(raw).replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: "名前を入力してください。" };
  if ([...name].length < PLAYER_NAME_MIN) {
    return { ok: false, error: "名前を入力してください。" };
  }
  if ([...name].length > PLAYER_NAME_MAX) {
    return { ok: false, error: `名前は${PLAYER_NAME_MAX}文字以内にしてください。` };
  }
  // 制御文字など不可視文字を弾く
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    return { ok: false, error: "使えない文字が含まれています。" };
  }
  return { ok: true, name };
}

/** 匿名プレイヤーIDを生成（ブラウザ対応） */
export function createPlayerId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * セーブに名前を確定して playerId を付与する（既に id があれば維持）。
 * @param {object} save
 * @param {string} rawName
 * @returns {{ ok: true, save: object } | { ok: false, error: string }}
 */
export function applyPlayerNameToSave(save, rawName) {
  const n = normalizePlayerName(rawName);
  if (!n.ok) return n;
  const playerId = save?.playerId || createPlayerId();
  return {
    ok: true,
    save: {
      ...save,
      playerName: n.name,
      playerId,
    },
  };
}
