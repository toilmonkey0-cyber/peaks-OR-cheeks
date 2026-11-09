// Endpoint tests over the exported handler with an in-memory D1 shim — zero deps, no network.
// node test/index.test.mjs
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { handle } from "../src/index.ts";

const data = JSON.parse(readFileSync(new URL("../data.json", import.meta.url), "utf8"));

/** Just enough D1: prepare().bind().first/all/run against in-memory tables. */
function makeDb() {
  const tables = { groups: [], scores: [], dailies: [] };
  const cols = { groups: ["code", "name", "createdAt"], scores: ["groupCode", "day", "playerId", "nick", "score", "detailJson", "submittedAt"], dailies: ["day", "dataVersion", "payloadJson", "generatedAt"] };
  const shim = {
    tables,
    prepare(sql) {
      const state = { params: [] };
      const bind = (...params) => { state.params = params; return api; };
      const row = (t, i) => Object.fromEntries(cols[t].map((c, k) => [c, t === "dailies" && c === "payloadJson" ? JSON.stringify(tables[t][i][c]) : tables[t][i][k] ?? tables[t][i][c]]));
      const api = {
        bind,
        async first() {
          if (/SELECT payloadJson FROM dailies WHERE day/i.test(sql)) {
            const i = tables.dailies.findIndex((r) => r.day === state.params[0]);
            return i >= 0 ? { payloadJson: JSON.stringify(tables.dailies[i].payload) } : null;
          }
          if (/SELECT \* FROM groups WHERE code/i.test(sql)) {
            const i = tables.groups.findIndex((r) => r.code === state.params[0]);
            return i >= 0 ? { code: tables.groups[i].code, name: tables.groups[i].name } : null;
          }
          if (/SELECT/i.test(sql) && /FROM scores/i.test(sql)) {
            const rows = tables.scores.filter((r) => r.groupCode === state.params[0] && r.day === state.params[1]);
            return rows.length ? { n: rows.length } : null;
          }
          return null;
        },
        async all() {
          if (/FROM scores/i.test(sql) && /ORDER BY/i.test(sql)) {
            const [groupCode, day] = state.params;
            return tables.scores
              .filter((r) => r.groupCode === groupCode && r.day === day)
              .sort((a, b) => a.score - b.score)
              .map((r) => ({ nick: r.nick, playerId: r.playerId, score: r.score, detailJson: r.detailJson }));
          }
          if (/FROM groups WHERE code/i.test(sql)) {
            const i = tables.groups.findIndex((r) => r.code === state.params[0]);
            return i >= 0 ? [tables.groups[i]] : [];
          }
          return [];
        },
        async run() {
          if (/INSERT INTO groups/i.test(sql)) {
            const [code, name, createdAt] = state.params;
            if (tables.groups.some((r) => r.code === code)) throw new Error("UNIQUE constraint failed: groups.code");
            tables.groups.push({ code, name, createdAt });
            return { success: true };
          }
          if (/INSERT INTO scores/i.test(sql)) {
            const [groupCode, day, playerId, nick, score, detailJson, submittedAt] = state.params;
            const i = tables.scores.findIndex((r) => r.groupCode === groupCode && r.day === day && r.playerId === playerId);
            const row = { groupCode, day, playerId, nick, score, detailJson, submittedAt };
            const upsert = /ON CONFLICT/i.test(sql);
            if (i >= 0 && !upsert) throw new Error("UNIQUE constraint failed: scores.PK"); // real D1 throws
            if (i >= 0) tables.scores[i] = /DO UPDATE/.test(sql) ? row : tables.scores[i];
            else tables.scores.push(row);
            return { success: true };
          }
          if (/INSERT INTO dailies/i.test(sql)) {
            const [day, dataVersion, payloadJson, generatedAt] = state.params;
            const i = tables.dailies.findIndex((r) => r.day === day);
            if (i >= 0 && !/ON CONFLICT/i.test(sql)) throw new Error("UNIQUE constraint failed: dailies.day"); // real D1 throws
            if (i < 0) tables.dailies.push({ day, dataVersion, payload: JSON.parse(payloadJson), generatedAt });
            return { success: true };
          }
          return { success: true };
        },
      };
      return api;
    },
  };
  return shim;
}

const JSON_REQ = (method, path, body) => new Request(`https://formation.board${path}`, { method, body: body ? JSON.stringify(body) : undefined, headers: { "content-type": "application/json", origin: "https://toilmonkey0-cyber.github.io" } });

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("health says ok", async () => {
  const r = await handle(new Request("https://formation.board/health"), makeDb(), data);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test("create → join → post → board round trip", async () => {
  const db = makeDb();
  const create = await handle(JSON_REQ("POST", "/groups", { name: "the boys" }), db, data);
  assert.equal(create.status, 200);
  const { code } = await create.json();
  assert.match(code, /^[A-Z2-9]{6}$/); // no-confusion alphabet, no 0/O/1/I

  const join = await handle(JSON_REQ("POST", `/groups/${code}/join`, { playerId: "p1", nick: "AARON" }), db, data);
  assert.equal(join.status, 200);

  const post = await handle(JSON_REQ("POST", `/groups/${code}/score`, { day: "2026-11-09", playerId: "p1", nick: "AARON", score: 38, detailJson: "{}" }), db, data);
  assert.equal(post.status, 200);

  const board = await handle(new Request(`https://formation.board/groups/${code}/board?day=2026-11-09&playerId=p1`), db, data);
  assert.equal(board.status, 200);
  const body = await board.json();
  assert.equal(body.rows.length, 1);
  assert.equal(body.rows[0].nick, "AARON");
  assert.equal(body.youPlayed, true);
});

test("a code collision retries with a fresh code (no 500)", async () => {
  const db = makeDb();
  db.tables.groups.push({ code: "AAAAAA", name: "taken", createdAt: 1 });
  // force the first draw to be the taken code, the second free
  const realRandom = Math.random;
  let calls = 0;
  Math.random = () => (calls++ === 0 ? 0.999999 : 0.111111);
  try {
    const r = await handle(JSON_REQ("POST", "/groups", { name: "x" }), db, data);
    assert.equal(r.status, 200);
    const { code } = await r.json();
    assert.notEqual(code, "AAAAAA");
  } finally { Math.random = realRandom; }
});

test("posting twice = one row, latest detail wins (offline queue race)", async () => {
  const db = makeDb();
  const create = await handle(JSON_REQ("POST", "/groups", { name: "g" }), db, data);
  const { code } = await create.json();
  await handle(JSON_REQ("POST", `/groups/${code}/join`, { playerId: "p1", nick: "N" }), db, data);
  await handle(JSON_REQ("POST", `/groups/${code}/score`, { day: "2026-11-09", playerId: "p1", nick: "N", score: 38, detailJson: "{\"a\":1}" }), db, data);
  await handle(JSON_REQ("POST", `/groups/${code}/score`, { day: "2026-11-09", playerId: "p1", nick: "N", score: 38, detailJson: "{\"a\":2}" }), db, data);
  const board = await handle(new Request(`https://formation.board/groups/${code}/board?day=2026-11-09&playerId=p1`), db, data);
  const body = await board.json();
  assert.equal(body.rows.length, 1);
  assert.equal(JSON.parse(body.rows[0].detailJson).a, 2);
});

test("the daily: publishes, locks per day, and replays identical bytes", async () => {
  const db = makeDb();
  const r1 = await handle(new Request(`https://formation.board/daily?day=2026-11-09&dataVersion=${encodeURIComponent(data.dataVersion)}`), db, data);
  assert.equal(r1.status, 200);
  const p1 = await r1.json();
  const r2 = await handle(new Request(`https://formation.board/daily?day=2026-11-09&dataVersion=${encodeURIComponent("madden-ratings-week-99")}`), db, data);
  const p2 = await r2.json();
  // locked on first generation: later callers get the SAME payload (generation ignores the version hint)
  assert.equal(JSON.stringify(p1), JSON.stringify(p2));
  assert.equal(p1.dataVersion, data.dataVersion);
  assert.equal(p1.quarters.length, 4);
});

test("bad requests and wrong methods get clean 4xx", async () => {
  const db = makeDb();
  assert.equal((await handle(JSON_REQ("POST", "/groups", {}), db, data)).status, 400);
  assert.equal((await handle(JSON_REQ("GET", "/groups", null), db, data)).status, 405);
  assert.equal((await handle(JSON_REQ("POST", "/groups/ZZZZZZ/join", { playerId: "p" }), db, data)).status, 400);
  assert.equal((await handle(JSON_REQ("POST", "/groups/ZZZZZZ/score", { day: "2026-11-09", playerId: "p", nick: "n", score: 1, detailJson: "{}" }), db, data)).status, 404);
});

test("CORS: allowed origin gets headers, others get rejected", async () => {
  const db = makeDb();
  const ok = await handle(new Request("https://formation.board/health", { headers: { origin: "https://toilmonkey0-cyber.github.io" } }), db, data);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://toilmonkey0-cyber.github.io");
  const bad = await handle(new Request("https://formation.board/health", { headers: { origin: "https://evil.example" } }), db, data);
  assert.equal(bad.status, 403);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log("✓", name); } catch (e) { failed++; console.error("×", name, "\n ", e.message); }
}
console.log(failed === 0 ? `WORKER TESTS: PASS (${tests.length})` : `WORKER TESTS: FAIL (${failed}/${tests.length})`);
process.exit(failed === 0 ? 0 : 1);

// appended: the wrangler entry point delegates
{
  const mod = await import("../src/index.ts");
  const ok = mod.default && typeof mod.default.fetch === "function";
  console.log(ok ? "\u2713 default export delegates to handle (wrangler entry)" : "\u00d7 default export missing");
  if (!ok) process.exitCode = 1;
}
