/** オンラインランキング API クライアント */

export const RANKING_DUNGEONS = [
  { id: "beginner", label: "初心者" },
  { id: "intermediate", label: "中級者" },
  { id: "advanced", label: "上級者" },
  { id: "legend", label: "超上級者" },
];

export const RANKING_DUNGEON_IDS = RANKING_DUNGEONS.map((d) => d.id);

const LOCAL_RANKING_KEY = "roguelike_ranking_local_v1";
const LOCAL_RANKING_LIMIT = 1000;

/** クリアまたは死亡として確定した結果だけをランキング対象にする。 */
export function isRankableRun(result) {
  return result?.cleared === true || result?.survived === false;
}

/** 開始時に持ち込み金または持ち込みアイテムがあった冒険か。 */
export function isCarryInRun(config) {
  return Number(config?.startGold) > 0 || (Array.isArray(config?.startInventory) && config.startInventory.length > 0);
}

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
  if (!isRankableRun(body)) return { ok: false, error: "only clear or death results can be ranked" };
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
      carryIn: body.carryIn === true,
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

function readLocalRuns() {
  try {
    if (typeof localStorage === "undefined") return [];
    const parsed = JSON.parse(localStorage.getItem(LOCAL_RANKING_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry && typeof entry === "object" && isRankableRun(entry))
      : [];
  } catch {
    return [];
  }
}

function writeLocalRuns(runs) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(LOCAL_RANKING_KEY, JSON.stringify(runs));
    return true;
  } catch {
    return false;
  }
}

function makeLocalRunId() {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function storeLocalRun(body) {
  const localId = makeLocalRunId();
  const entry = {
    ...body,
    localId,
    runId: localId,
    createdAt: Date.now(),
    serverSubmitted: false,
  };
  const runs = readLocalRuns();
  const stored = writeLocalRuns([entry, ...runs].slice(0, LOCAL_RANKING_LIMIT));
  return { localId, stored };
}

function markLocalRunSubmitted(localId, serverRunId) {
  if (!localId) return;
  const runs = readLocalRuns();
  const next = runs.map((entry) => entry.localId === localId
    ? { ...entry, serverSubmitted: true, serverRunId: serverRunId || null }
    : entry);
  writeLocalRuns(next);
}

function localRunSignature(entry) {
  return [
    entry.playerId,
    entry.dungeonType,
    entry.score,
    entry.turns,
    entry.elapsedMs,
    entry.depth,
    entry.level,
    entry.cleared ? 1 : 0,
    entry.carryIn ? 1 : 0,
  ].join("|");
}

function getLocalRanking({ board, dungeon, playerId, carryIn = false, limit = 50, pendingOnly = false } = {}) {
  const runs = readLocalRuns()
    .filter((entry) => entry.playerId === playerId && entry.dungeonType === dungeon)
    .filter((entry) => carryIn ? entry.carryIn === true : entry.carryIn !== true)
    .filter((entry) => board !== "clear" || entry.cleared)
    .filter((entry) => !pendingOnly || !entry.serverSubmitted);
  runs.sort((a, b) => {
    const metric = board === "clear"
      ? (Number(a.elapsedMs) || 0) - (Number(b.elapsedMs) || 0)
      : (Number(b.score) || 0) - (Number(a.score) || 0);
    return metric || (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
  });
  return {
    entries: runs.slice(0, limit).map((entry) => ({
      ...entry,
      rank: null,
      total: null,
      localOnly: true,
    })),
    total: runs.length,
  };
}

function localOfflineResult(opts, board, dungeon, error = "offline") {
  const local = opts.mine && opts.playerId
    ? getLocalRanking({ board, dungeon, playerId: opts.playerId, carryIn: opts.carryIn, limit: opts.limit })
    : { entries: [], total: 0 };
  return {
    ok: true,
    offline: true,
    entries: local.entries,
    total: local.total,
    board,
    dungeon,
    local: true,
    error,
  };
}

function mergePendingLocalEntries(entries, opts, board, dungeon, limit) {
  if (!opts.mine || !opts.playerId) return entries.slice(0, limit);
  const pending = getLocalRanking({
    board,
    dungeon,
    playerId: opts.playerId,
    carryIn: opts.carryIn,
    limit,
    pendingOnly: true,
  }).entries;
  if (pending.length === 0) return entries.slice(0, limit);
  const serverSignatures = new Set(entries.map(localRunSignature));
  const pendingOnly = pending.filter((entry) => !serverSignatures.has(localRunSignature(entry)));
  return [...pendingOnly, ...entries].slice(0, limit);
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
  if (opts.carryIn !== undefined) params.set("carry", opts.carryIn ? "1" : "0");
  if (opts.mine && opts.playerId) {
    params.set("mine", "1");
    params.set("playerId", opts.playerId);
  }
  try {
    const res = await fetch(`/api/ranking?${params}`, { method: "GET" });
      const data = await parseJson(res);
    if (!res.ok || !data) {
      return localOfflineResult(opts, board, dungeon, data?.error || "fetch failed");
    }
    if (data.offline) {
      return localOfflineResult(opts, board, dungeon, data.error || "offline");
    }
    const serverEntries = Array.isArray(data.entries) ? data.entries.filter(isRankableRun) : [];
    return {
      ok: true,
      offline: false,
      entries: mergePendingLocalEntries(serverEntries, opts, board, dungeon, limit),
      total: Number(data.total) || 0,
      board: data.board || board,
      dungeon: data.dungeon || dungeon,
    };
  } catch {
    return localOfflineResult(opts, board, dungeon, "network");
  }
}

/** 全体統計 */
export async function fetchRankingStats(opts = {}) {
  try {
    const params = new URLSearchParams({ stats: "1" });
    if (RANKING_DUNGEON_IDS.includes(opts.dungeon)) params.set("dungeon", opts.dungeon);
    if (opts.carryIn !== undefined) params.set("carry", opts.carryIn ? "1" : "0");
    const res = await fetch(`/api/ranking?${params}`, { method: "GET" });
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
  const local = storeLocalRun(v.body);
  try {
    const res = await fetch("/api/ranking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v.body),
    });
    const data = await parseJson(res);
    if (res.status === 503 || data?.offline) {
      return { ok: false, offline: true, localId: local.localId, error: data?.error || "offline" };
    }
    if (!res.ok) {
      return { ok: false, localId: local.localId, error: data?.error || `http ${res.status}` };
    }
    markLocalRunSubmitted(local.localId, data?.runId);
    return { ok: true, localId: local.localId, runId: data?.runId, ranks: data?.ranks };
  } catch {
    return { ok: false, offline: true, localId: local.localId, error: "network" };
  }
}
