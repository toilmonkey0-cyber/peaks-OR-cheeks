// Generates worker/data.json — the Worker's roster snapshot (the 704 projected starters).
// Run from worker/:  node build-data.mjs    (also part of the Friday refresh ritual).
import { readFileSync, writeFileSync } from "node:fs";

const OFF = [["QB","QB"],["HB","HB"],["WR","WR"],["WR","WR"],["WR","WR"],["TE","TE"],["LT","LT"],["LG","LG"],["C","C"],["RG","RG"],["RT","RT"]];
const DEF = [["LEDG","EDGE"],["REDG","EDGE"],["DT","DT"],["DT","DT"],["MIKE","MIKE"],["WILL","WILL"],["CB","CB"],["CB","CB"],["CB","CB"],["FS","FS"],["SS","SS"]];
const ini = (name) => name.replace(/ (Jr|Sr|II|III|IV)\.?$/, "").split(/[ -]/).filter(Boolean).map((w) => w[0].toUpperCase()).join(".") + ".";

const snap = JSON.parse(readFileSync(new URL("../data/madden27.json", import.meta.url), "utf8"));
const byTeam = new Map();
for (const p of snap.players) {
  if (p.team === "FA" || p.jersey === null || p.jersey === undefined) continue;
  byTeam.set(p.team, [...(byTeam.get(p.team) ?? []), p]);
}

const starters = []; // {team, key, label, pos, jersey, ini, college, rating, playerId}
const pick = (team, spec) => {
  const ps = byTeam.get(team) ?? [];
  const used = new Set();
  const seen = new Map();
  return spec.map(([pos, label]) => {
    const p = ps.filter((x) => x.position === pos && x.jersey !== null && !used.has(x.playerId)).sort((a, b) => b.rating - a.rating)[0];
    used.add(p.playerId);
    const n = (seen.get(pos) ?? 0) + 1;
    seen.set(pos, n);
    const repeats = spec.filter(([q]) => q === pos).length > 1;
    const side = OFF.some(([q]) => q === pos) ? "off" : "def";
    starters.push({ team, side, key: repeats ? pos + n : pos, label, pos, jersey: p.jersey, ini: ini(p.fullName), fullName: p.fullName, college: p.college, rating: p.rating, playerId: p.playerId });
  });
};

// pick every team's starters FIRST (stamps rank among all 704)
const teams = Object.keys(Object.fromEntries(byTeam)).sort();
for (const t of teams) {
  pick(t, OFF);
  pick(t, DEF);
}

// stamps among starters per position (3 per team-slot)
const stampOf = new Map();
for (const pos of new Set(starters.map((s) => s.pos))) {
  const ranked = starters.filter((s) => s.pos === pos).sort((a, b) => b.rating - a.rating);
  const k = 3 * (ranked.length / byTeam.size);
  ranked.forEach((s, i) => stampOf.set(s.playerId, i < k ? "P" : i >= ranked.length - k ? "C" : "M"));
}
for (const s of starters) s.stamp = stampOf.get(s.playerId);

// rarity classes: QB jack, offense slots 1-5 skill, 6-10 common; defense = its top-rated starter
for (const t of teams) {
  const mine = starters.filter((s) => s.team === t);
  mine.slice(0, 11).forEach((s, i) => { s.cls = i === 0 ? "jack" : i <= 5 ? "skill" : "common"; });
  const best = [...mine.slice(11)].sort((a, b) => b.rating - a.rating)[0];
  mine.slice(11).forEach((s) => { s.cls = s === best ? "jack" : "common"; });
}

const out = {
  dataVersion: snap.sourceIteration,
  teams: snap.teams.filter((t) => t.abbr !== "FA").map((t) => ({ abbr: t.abbr, name: t.name, city: t.city, primary: t.primary, secondary: t.secondary })),
  players: starters,
};
writeFileSync(new URL("./data.json", import.meta.url), JSON.stringify(out));
console.log(`worker/data.json: ${out.players.length} starters, ${out.teams.length} teams, version ${out.dataVersion}`);
