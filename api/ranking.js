/**
 * Vercel Serverless: オンラインランキング
 * GET  /api/ranking?board=score|clear&dungeon=beginner&limit=50
 * GET  /api/ranking?board=score&dungeon=beginner&mine=1&playerId=...
 * GET  /api/ranking?stats=1
 * POST /api/ranking  body: run result
 *
 * Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */

import { Redis } from "@upstash/redis";

const ALLOWED_DUNGEONS = ["tutorial", "beginner", "intermediate", "advanced", "legend"];
const MAX_BOARD = 2000;
const MAX_MINE = 100;
const RATE_LIMIT_SEC = 8;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function scoreKey(dungeon) {
  return `rank:score:${dungeon}`;
}
function clearKey(dungeon) {
  return `rank:clear:${dungeon}`;
}
function runKey(runId) {
  return `run:${runId}`;
}
function playerRunsKey(playerId) {
  return `player:runs:${playerId}`;
}

function parseRunHash(h) {
  if (!h || typeof h !== "object") return null;
  return {
    runId: h.runId || "",
    playerId: h.playerId || "",
    playerName: h.playerName || "",
    dungeonType: h.dungeonType || "",
    score: Number(h.score) || 0,
    turns: Number(h.turns) || 0,
    elapsedMs: Number(h.elapsedMs) || 0,
    depth: Number(h.depth) || 0,
    level: Number(h.level) || 0,
    cleared: h.cleared === true || h.cleared === "true" || h.cleared === 1 || h.cleared === "1",
    survived: h.survived === true || h.survived === "true" || h.survived === 1 || h.survived === "1",
    cause: h.cause || "",
    gold: Number(h.gold) || 0,
    itemsValue: Number(h.itemsValue) || 0,
    ts: Number(h.ts) || 0,
  };
}

async function pruneBoard(redis, key, reverse) {
  const n = await redis.zcard(key);
  if (n <= MAX_BOARD) return;
  const drop = n - MAX_BOARD;
  if (reverse) {
    /* score board: drop lowest */
    await redis.zremrangebyrank(key, 0, drop - 1);
  } else {
    /* clear board: drop highest times */
    await redis.zremrangebyrank(key, -drop, -1);
  }
}

async function handleStats(redis, res) {
  if (!redis) {
    return json(res, 200, { offline: true, totalRuns: 0, clears: {} });
  }
  const totalRuns = Number(await redis.get("stats:totalRuns")) || 0;
  const clears = {};
  for (const d of ALLOWED_DUNGEONS) {
    clears[d] = Number(await redis.get(`stats:clears:${d}`)) || 0;
  }
  return json(res, 200, { offline: false, totalRuns, clears });
}

async function loadEntries(redis, board, dungeon, limit, mine, playerId) {
  if (mine && playerId) {
    const ids = await redis.lrange(playerRunsKey(playerId), 0, MAX_MINE - 1);
    const entries = [];
    const boardKey = board === "clear" ? clearKey(dungeon) : scoreKey(dungeon);
    const total = Number(await redis.zcard(boardKey)) || 0;
    for (const runId of ids || []) {
      const raw = await redis.hgetall(runKey(runId));
      const run = parseRunHash(raw);
      if (!run || run.dungeonType !== dungeon) continue;
      if (board === "clear" && !run.cleared) continue;
      let rank = null;
      if (board === "clear") {
        const r = await redis.zrank(boardKey, runId);
        rank = r == null ? null : r + 1;
      } else {
        const r = await redis.zrevrank(boardKey, runId);
        rank = r == null ? null : r + 1;
      }
      entries.push({ ...run, rank, total });
      if (entries.length >= limit) break;
    }
    return { entries, total };
  }

  const boardKey = board === "clear" ? clearKey(dungeon) : scoreKey(dungeon);
  const total = Number(await redis.zcard(boardKey)) || 0;
  let pairs;
  if (board === "clear") {
    pairs = await redis.zrange(boardKey, 0, limit - 1, { withScores: true });
  } else {
    pairs = await redis.zrange(boardKey, 0, limit - 1, { rev: true, withScores: true });
  }
  /* upstash may return [{score, member}] or flat [member, score, ...] depending on version */
  const members = [];
  if (Array.isArray(pairs) && pairs.length) {
    if (typeof pairs[0] === "object" && pairs[0] != null && "member" in pairs[0]) {
      for (const row of pairs) members.push({ id: row.member, score: row.score });
    } else {
      for (let i = 0; i < pairs.length; i += 2) {
        members.push({ id: pairs[i], score: pairs[i + 1] });
      }
    }
  }
  const entries = [];
  for (let i = 0; i < members.length; i++) {
    const { id } = members[i];
    const raw = await redis.hgetall(runKey(id));
    const run = parseRunHash(raw);
    if (!run) continue;
    entries.push({ ...run, rank: i + 1, total });
  }
  return { entries, total };
}

async function handleGet(req, res, redis) {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.searchParams.get("stats") === "1") {
    return handleStats(redis, res);
  }
  const board = url.searchParams.get("board") === "clear" ? "clear" : "score";
  const dungeon = url.searchParams.get("dungeon") || "beginner";
  if (!ALLOWED_DUNGEONS.includes(dungeon)) {
    return json(res, 400, { error: "invalid dungeon" });
  }
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
  const mine = url.searchParams.get("mine") === "1";
  const playerId = (url.searchParams.get("playerId") || "").trim();

  if (!redis) {
    return json(res, 200, {
      offline: true,
      board,
      dungeon,
      entries: [],
      total: 0,
    });
  }

  try {
    const { entries, total } = await loadEntries(redis, board, dungeon, limit, mine, playerId);
    return json(res, 200, { offline: false, board, dungeon, entries, total });
  } catch (e) {
    console.error("ranking GET", e);
    return json(res, 500, { error: "server error", offline: true, entries: [], total: 0 });
  }
}

function validateBody(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid body" };
  const playerId = String(body.playerId || "").trim();
  const playerName = String(body.playerName || "").trim().slice(0, 12);
  const dungeonType = String(body.dungeonType || "").trim();
  if (!playerId || playerId.length > 80) return { ok: false, error: "playerId invalid" };
  if (!playerName) return { ok: false, error: "playerName invalid" };
  if (!ALLOWED_DUNGEONS.includes(dungeonType)) return { ok: false, error: "dungeonType invalid" };
  const score = Math.floor(Number(body.score));
  const turns = Math.floor(Number(body.turns));
  const elapsedMs = Math.floor(Number(body.elapsedMs));
  if (!Number.isFinite(score) || score < 0 || score > 1e12) return { ok: false, error: "score invalid" };
  if (!Number.isFinite(turns) || turns < 0 || turns > 1e9) return { ok: false, error: "turns invalid" };
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 1e12) return { ok: false, error: "elapsedMs invalid" };
  return {
    ok: true,
    data: {
      playerId,
      playerName,
      dungeonType,
      score,
      turns,
      elapsedMs,
      depth: Math.max(0, Math.floor(Number(body.depth) || 0)),
      level: Math.max(0, Math.floor(Number(body.level) || 0)),
      cleared: !!body.cleared,
      survived: !!body.survived,
      cause: String(body.cause || "").slice(0, 80),
      gold: Math.max(0, Math.floor(Number(body.gold) || 0)),
      itemsValue: Math.max(0, Math.floor(Number(body.itemsValue) || 0)),
    },
  };
}

async function handlePost(req, res, redis) {
  if (!redis) {
    return json(res, 503, { ok: false, offline: true, error: "ranking offline" });
  }

  let body = {};
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString("utf8");
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json(res, 400, { error: "invalid json" });
  }

  const v = validateBody(body);
  if (!v.ok) return json(res, 400, { error: v.error });
  const d = v.data;

  try {
    const rateKey = `rate:${d.playerId}`;
    const ok = await redis.set(rateKey, "1", { nx: true, ex: RATE_LIMIT_SEC });
    if (ok === null) {
      return json(res, 429, { error: "rate limited" });
    }

    const runId = `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const ts = Date.now();
    const hash = {
      runId,
      playerId: d.playerId,
      playerName: d.playerName,
      dungeonType: d.dungeonType,
      score: d.score,
      turns: d.turns,
      elapsedMs: d.elapsedMs,
      depth: d.depth,
      level: d.level,
      cleared: d.cleared ? "1" : "0",
      survived: d.survived ? "1" : "0",
      cause: d.cause,
      gold: d.gold,
      itemsValue: d.itemsValue,
      ts,
    };

    await redis.hset(runKey(runId), hash);
    await redis.zadd(scoreKey(d.dungeonType), { score: d.score, member: runId });
    await pruneBoard(redis, scoreKey(d.dungeonType), true);

    let clearRank = null;
    if (d.cleared) {
      await redis.zadd(clearKey(d.dungeonType), { score: d.elapsedMs, member: runId });
      await pruneBoard(redis, clearKey(d.dungeonType), false);
      await redis.incr(`stats:clears:${d.dungeonType}`);
      const cr = await redis.zrank(clearKey(d.dungeonType), runId);
      clearRank = cr == null ? null : cr + 1;
    }

    await redis.lpush(playerRunsKey(d.playerId), runId);
    await redis.ltrim(playerRunsKey(d.playerId), 0, MAX_MINE - 1);
    await redis.incr("stats:totalRuns");

    const sr = await redis.zrevrank(scoreKey(d.dungeonType), runId);
    const scoreRank = sr == null ? null : sr + 1;

    return json(res, 200, {
      ok: true,
      runId,
      ranks: { score: scoreRank, clear: clearRank },
    });
  } catch (e) {
    console.error("ranking POST", e);
    return json(res, 500, { error: "server error" });
  }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const redis = getRedis();

  if (req.method === "GET") {
    return handleGet(req, res, redis);
  }
  if (req.method === "POST") {
    return handlePost(req, res, redis);
  }
  return json(res, 405, { error: "method not allowed" });
}
