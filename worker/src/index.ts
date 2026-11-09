// FORMATION's little server: groups, scores, and the published daily over D1.
// Deployed as a Cloudflare Worker; tested against an injected D1 shim (same interface).
import { publishDaily } from "./daily.ts";
import type { WorkerData, DailyPayload } from "./daily.ts";
import dataJson from "../data.json" with { type: "json" };

const DATA = dataJson as unknown as WorkerData;

/** the wrangler entry point: env carries the D1 binding and the CORS allow-list */
export default {
  async fetch(request: Request, env: { FORMATION_DB: Parameters<typeof handle>[1]; CORS_ORIGINS?: string }): Promise<Response> {
    return handle(request, env.FORMATION_DB, DATA, env.CORS_ORIGINS ?? "");
  },
};

/** The slice of D1 the handler uses — wrangler's env.FORMATION_DB satisfies this; tests inject a shim. */
interface D1Like {
  prepare(sql: string): { bind(...params: unknown[]): { first(): Promise<unknown>; all(): Promise<unknown[]>; run(): Promise<{ success: boolean }> } };
}

const JSON_BODY = (v: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json", ...extra } });

/** No-confusion alphabet: no 0/O/1/I. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = (): string =>
  Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const v = await request.json();
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function handle(request: Request, db: D1Like, data: WorkerData, corsOrigins = ""): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("origin") ?? "";
  // production gets the allow-list from env (wrangler.toml vars); tests pass it directly
  const allowedRaw = corsOrigins || "https://toilmonkey0-cyber.github.io,http://localhost:4174,http://localhost:4181";
  const allowed = allowedRaw.split(",").map((s) => s.trim()).filter(Boolean);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "access-control-allow-origin": allowed.includes(origin) ? origin : "", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" } });
  }
  // no Origin header (curl, monitoring, same-origin) needs no CORS; a present-but-unknown origin is rejected
  if (origin && !allowed.includes(origin)) return new Response("forbidden origin", { status: 403 });
  const corsHeaders = origin ? { "access-control-allow-origin": origin } : {};

  const path = url.pathname;
  const method = request.method;

  if (path === "/health") return JSON_BODY({ ok: true }, 200, corsHeaders);

  // ── the published daily ──────────────────────────────────────────────────
  if (path === "/daily" && method === "GET") {
    const day = url.searchParams.get("day");
    if (!day) return JSON_BODY({ error: "day required" }, 400, corsHeaders);
    const existing = await db.prepare("SELECT payloadJson FROM dailies WHERE day = ?").bind(day).first() as { payloadJson: string } | null;
    if (existing) return new Response(existing.payloadJson, { status: 200, headers: { "content-type": "application/json", ...corsHeaders } });
    // the worker always seeds from ITS snapshot - the requester version param is a hint, never the source (Ruling C7)
    const payload: DailyPayload = publishDaily(day, data.dataVersion, data);
    // race-safe: a concurrent first request wins the lock; both payloads are identical anyway
    await db.prepare("INSERT INTO dailies (day, dataVersion, payloadJson, generatedAt) VALUES (?, ?, ?, ?) ON CONFLICT(day) DO NOTHING")
      .bind(day, payload.dataVersion, JSON.stringify(payload), Date.now()).run();
    const locked = await db.prepare("SELECT payloadJson FROM dailies WHERE day = ?").bind(day).first() as { payloadJson: string } | null;
    return new Response(locked?.payloadJson ?? JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json", ...corsHeaders } });
  }

  // ── groups ───────────────────────────────────────────────────────────────
  if (path === "/groups" && method === "POST") {
    const body = await readJson(request);
    const name = str(body?.name);
    if (!name) return JSON_BODY({ error: "name required" }, 400, corsHeaders);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newCode();
      const clash = await db.prepare("SELECT * FROM groups WHERE code = ?").bind(code).first();
      if (clash) continue;
      await db.prepare("INSERT INTO groups (code, name, createdAt) VALUES (?, ?, ?)").bind(code, name, Date.now()).run();
      return JSON_BODY({ code }, 200, corsHeaders);
    }
    return JSON_BODY({ error: "code space exhausted" }, 500, corsHeaders);
  }

  const join = /^\/groups\/([A-Z2-9]{6})\/join$/.exec(path);
  if (join && method === "POST") {
    const body = await readJson(request);
    const playerId = str(body?.playerId);
    const nick = str(body?.nick);
    if (!playerId || !nick) return JSON_BODY({ error: "playerId and nick required" }, 400, corsHeaders);
    const group = await db.prepare("SELECT * FROM groups WHERE code = ?").bind(join[1]).first() as { code: string } | null;
    if (!group) return JSON_BODY({ error: "no such group" }, 404, corsHeaders);
    return JSON_BODY({ ok: true }, 200, corsHeaders); // membership is implicit in posted rows
  }

  const board = /^\/groups\/([A-Z2-9]{6})\/board$/.exec(path);
  if (board && method === "GET") {
    const day = url.searchParams.get("day");
    const playerId = url.searchParams.get("playerId");
    if (!day || !playerId) return JSON_BODY({ error: "day and playerId required" }, 400, corsHeaders);
    const group = await db.prepare("SELECT * FROM groups WHERE code = ?").bind(board[1]).first() as { code: string } | null;
    if (!group) return JSON_BODY({ error: "no such group" }, 404, corsHeaders);
    const rows = (await db.prepare("SELECT nick, playerId, score, detailJson FROM scores WHERE groupCode = ? AND day = ? ORDER BY score ASC")
      .bind(board[1], day).all()) as { nick: string; playerId: string; score: number; detailJson: string }[];
    return JSON_BODY({ rows, youPlayed: rows.some((r) => r.playerId === playerId) }, 200, corsHeaders);
  }

  const score = /^\/groups\/([A-Z2-9]{6})\/score$/.exec(path);
  if (score && method === "POST") {
    const body = await readJson(request);
    const day = str(body?.day);
    const playerId = str(body?.playerId);
    const nick = str(body?.nick);
    const s = num(body?.score);
    const detail = str(body?.detailJson);
    if (!day || !playerId || !nick || s === null || !detail) return JSON_BODY({ error: "day, playerId, nick, score, detailJson required" }, 400, corsHeaders);
    const group = await db.prepare("SELECT * FROM groups WHERE code = ?").bind(score[1]).first() as { code: string } | null;
    if (!group) return JSON_BODY({ error: "no such group" }, 404, corsHeaders);
    // upsert: the offline queue guarantees re-posts - latest write wins on every field (PK groupCode+day+playerId)
    await db.prepare("INSERT INTO scores (groupCode, day, playerId, nick, score, detailJson, submittedAt) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(groupCode, day, playerId) DO UPDATE SET nick=excluded.nick, score=excluded.score, detailJson=excluded.detailJson, submittedAt=excluded.submittedAt")
      .bind(score[1], day, playerId, nick, s, detail, Date.now()).run();
    return JSON_BODY({ ok: true }, 200, corsHeaders);
  }

  return JSON_BODY({ error: "method not allowed" }, 405, corsHeaders);
}
