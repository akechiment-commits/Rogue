/** オンラインランキング API クライアント */

export const RANKING_DUNGEONS = [
  { id: "beginner", label: "初心者" },
  { id: "intermediate", label: "中級者" },
  { id: "advanced", label: "上級者" },
  { id: "legend", label: "超上級者" },
];

export const RANKING_DUNGEON_IDS = RANKING_DUNGEONS.map((d) => d.id);

/**
 * @param {object} body
 * @returns {{ ok: true, body: object } | { ok: false, error: string }}
 */
export function validateSubmitPayload(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid body" };
  const playerId = String(body.playerId || "").trim();
  const playerName = String(body.playerName || "").trim();
  const dungeonType = String(body.dungeonType || "").trim();
  if (!playerId) return { ok: false, error: "playerId required" };
  if (!playerName || playerName.length > 12) return { ok: false, error: "playerName invalid" };
  if (!RANKING_DUNGEON_IDS.includes(dungeonType)) return { ok: false, error: "dungeonType invalid" };
  const score = Number(body.score);
  const turns = Number(body.turns);
  const elapsedMs = Number(body.elapsedMs);
  const depth = Number(body.depth);
  const level = Number(body.level);
  if (!Number.isFinite(score) || score < 0) return { ok: false, error: "score invalid" };
  if (!Number.isFinite(turns) || turns < 0) return { ok: false, error: "turns invalid" };
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return { ok: false, error: "elapsedMs invalid" };
  return {
    ok: true,
    body: {
      playerId,
      playerName,
      dungeonType,
      score: Math.floor(score),
      turns: Math.floor(turns),
      elapsedMs: Math.floor(elapsedMs),
      depth: Number.isFinite(depth) ? Math.floor(depth) : 0,
      level: Number.isFinite(level) ? Math.floor(level) : 0,
      cleared: !!body.cleared,
      survived: !!body.survived,
      cause: String(body.cause || "").slice(0, 80),
      itemsValue: Number.isFinite(Number(body.itemsValue)) ? Math.floor(Number(body.itemsValue)) : 0,
      gold: Number.isFinite(Number(body.gold)) ? Math.floor(Number(body.gold)) : 0,
    },
  };
}

async function parseJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * ランキング一覧を取得。
 * @param {{ board?: 'score'|'clear', dungeon?: string, limit?: number, playerId?: string, mine?: boolean }} opts
 */
export async function fetchRanking(opts = {}) {
  const board = opts.board === "clear" ? "clear" : "score";
  const dungeon = RANKING_DUNGEON_IDS.includes(opts.dungeon) ? opts.dungeon : "beginner";
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 50));
  const params = new URLSearchParams({ board, dungeon, limit: String(limit) });
  if (opts.mine && opts.playerId) {
    params.set("mine", "1");
    params.set("playerId", opts.playerId);
  }
  try {
    const res = await fetch(`/api/ranking?${params}`, { method: "GET" });
    const data = await parseJson(res);
    if (!res.ok || !data) {
      return { ok: false, offline: true, entries: [], total: 0, error: data?.error || "fetch failed" };
    }
    return {
      ok: true,
      offline: !!data.offline,
      entries: Array.isArray(data.entries) ? data.entries : [],
      total: Number(data.total) || 0,
      board: data.board || board,
      dungeon: data.dungeon || dungeon,
    };
  } catch {
    return { ok: false, offline: true, entries: [], total: 0, error: "network" };
  }
}

/** 全体統計 */
export async function fetchRankingStats() {
  try {
    const res = await fetch("/api/ranking?stats=1", { method: "GET" });
    const data = await parseJson(res);
    if (!res.ok || !data) {
      return { ok: false, offline: true, totalRuns: 0, clears: {} };
    }
    return {
      ok: true,
      offline: !!data.offline,
      totalRuns: Number(data.totalRuns) || 0,
      clears: data.clears || {},
    };
  } catch {
    return { ok: false, offline: true, totalRuns: 0, clears: {} };
  }
}

/**
 * 探索結果を投稿（fire-and-forget 想定）。
 * debug 等はクライアント側で弾く。
 */
export async function submitRunResult(raw) {
  const v = validateSubmitPayload(raw);
  if (!v.ok) return { ok: false, error: v.error };
  try {
    const res = await fetch("/api/ranking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v.body),
    });
    const data = await parseJson(res);
    if (res.status === 503 || data?.offline) {
      return { ok: false, offline: true, error: data?.error || "offline" };
    }
    if (!res.ok) {
      return { ok: false, error: data?.error || `http ${res.status}` };
    }
    return { ok: true, runId: data?.runId, ranks: data?.ranks };
  } catch {
    return { ok: false, offline: true, error: "network" };
  }
}
