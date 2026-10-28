/** 冒険記録（localStorage: roguelike_scores） */

export const DUNGEON_SCORE_LABELS = {
  tutorial: "チュートリアル",
  beginner: "初心者ダンジョン",
  intermediate: "中級者ダンジョン",
  advanced: "上級者ダンジョン",
  legend: "超上級者ダンジョン",
  debug: "デバッグダンジョン",
};

const STORAGE_KEY = "roguelike_scores";
const PER_DUNGEON_LIMIT = 30;
const LEGACY_KEY = "_legacy";

export function dungeonScoreLabel(dungeonType) {
  if (dungeonType === LEGACY_KEY) return "旧記録（ダンジョン不明）";
  return DUNGEON_SCORE_LABELS[dungeonType] || dungeonType || "不明";
}

function normalizeEntry(s) {
  if (!s || typeof s !== "object") return null;
  const cause = s.cause || "";
  let result = s.result;
  if (!result) {
    if (cause === "クリア" || cause === "クリア！") result = "clear";
    else if (cause === "生還") result = "escape";
    else result = "death";
  }
  const dungeonType = s.dungeonType || LEGACY_KEY;
  return {
    ...s,
    dungeonType,
    result,
    cause,
    level: s.level ?? 0,
    depth: s.depth ?? 0,
    turns: s.turns ?? 0,
    gold: s.gold ?? 0,
  };
}

/** 旧形式（dungeonTypeなし）を _legacy に寄せて保存し直す */
export function migrateAdventureScores() {
  if (typeof localStorage === "undefined") return [];
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  let changed = false;
  const next = [];
  for (const s of raw) {
    const n = normalizeEntry(s);
    if (!n) continue;
    if (!s.dungeonType) changed = true;
    if (!s.result && n.result) changed = true;
    next.push(n);
  }
  if (changed) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* quota */
    }
  }
  return next;
}

export function loadAdventureScores() {
  return migrateAdventureScores();
}

/**
 * 指定ダンジョンの記録のみ（新しい順）。
 * 旧形式は dungeonType=_legacy。現在ダンジョン表示時は含めない（混ぜない）。
 */
export function scoresForDungeon(dungeonType) {
  const dt = dungeonType || "beginner";
  return loadAdventureScores().filter((s) => (s.dungeonType || LEGACY_KEY) === dt);
}

/**
 * 記録を追加して保存。
 * entry: { dungeonType, result: "death"|"clear"|"escape", cause, level, depth, turns, gold, score?, itemsValue?, elapsedMs?, date? }
 */
export function recordAdventureScore(entry) {
  if (typeof localStorage === "undefined") return;
  const dungeonType = entry.dungeonType || "beginner";
  let result = entry.result;
  if (!result) {
    if (entry.cause === "クリア" || entry.cause === "クリア！") result = "clear";
    else if (entry.cause === "生還") result = "escape";
    else result = "death";
  }
  const next = {
    dungeonType,
    result,
    cause: entry.cause || "",
    level: entry.level ?? 0,
    depth: entry.depth ?? 0,
    turns: entry.turns ?? 0,
    gold: entry.gold ?? 0,
    score: entry.score,
    itemsValue: entry.itemsValue,
    elapsedMs: entry.elapsedMs,
    date: entry.date || new Date().toLocaleDateString("ja-JP"),
  };
  const all = loadAdventureScores();
  all.unshift(next);
  const counts = Object.create(null);
  const kept = [];
  for (const s of all) {
    const t = s.dungeonType || LEGACY_KEY;
    counts[t] = (counts[t] || 0) + 1;
    if (counts[t] <= PER_DUNGEON_LIMIT) kept.push(s);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    /* quota */
  }
  return next;
}

/**
 * 死因文字列を自然な日本語表現（〜で倒れた、〜により倒れた等）にフォーマット
 */
export function formatDeathCause(cause) {
  let c = String(cause || "").trim();
  if (!c || c === "不明" || c === "不明の原因により") return "力尽きた";

  // 「でで倒れた」などの助詞重複があれば修復
  c = c.replace(/で+倒れた$/, "で倒れた");
  if (/(?:倒れた|力尽きた|死亡|果てた)$/.test(c)) return c;

  // 末尾に重複した「で」があれば1つに正規化
  c = c.replace(/で+$/, "で");

  // すでに「で」「て」「により」「によって」「にて」等の助詞や、連用形「埋まり」「沈み」「込まれ」で終わっている場合は「倒れた」のみ付加
  if (/(?:で|て|により|によって|にて|埋まり|沈み|込まれ)$/.test(c)) {
    return `${c}倒れた`;
  }
  // 体言止め等の場合は「で倒れた」
  return `${c}で倒れた`;
}

/** 表示用1行タイトル */
export function scoreHeadline(s) {
  if (s.result === "clear" || s.cause === "クリア" || s.cause === "クリア！") return "クリア！";
  if (s.result === "escape" || s.cause === "生還") return "生還";
  return formatDeathCause(s.cause);
}
