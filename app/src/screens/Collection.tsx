import { useState } from "react";
import type { Card, Snapshot, Team } from "@/data/schema";
import type { SaveState } from "@/storage/storage";
import { CardView } from "@/components/CardView";
import "./Collection.css";

const TIERS = ["common", "rare", "elite", "legend", "xfactor"] as const;

export function Collection({ save, snapshot, teams }: {
  save: SaveState; snapshot: Snapshot; teams: Record<string, Team>; }) {
  const [album, setAlbum] = useState<"team" | "tier">("team");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const matches = (c: Card) =>
    q === "" || c.fullName.toLowerCase().includes(q) || c.team.toLowerCase().includes(q);
  const players = snapshot.players.filter(matches);
  const owned = (id: string) => (save.owned[id] ?? 0) > 0;

  // album = { key, title, players } — one section per team or per tier
  const albums = album === "team"
    ? snapshot.teams.map((t) => ({
        key: t.abbr, title: `${t.city} ${t.name}`,
        cards: players.filter((c) => c.team === t.abbr) }))
    : TIERS.map((tier) => ({
        key: tier, title: tier[0].toUpperCase() + tier.slice(1),
        cards: players.filter((c) => c.tier === tier) }));
  // hide albums the search emptied (no query → keep every album visible)
  const visible = q === "" ? albums : albums.filter((a) => a.cards.length > 0);

  return (
    <section className="collection" data-testid="screen-collection">
      <input data-testid="collection-search" className="collection-search"
        placeholder="Search player or team…" value={query}
        onChange={(e) => setQuery(e.target.value)} />
      <div className="album-tabs" role="tablist">
        <button role="tab" aria-selected={album === "team"}
          className={album === "team" ? "active" : ""}
          onClick={() => setAlbum("team")}>By Team</button>
        <button role="tab" aria-selected={album === "tier"}
          className={album === "tier" ? "active" : ""}
          onClick={() => setAlbum("tier")}>By Tier</button>
      </div>
      {visible.map((a) => {
        const have = a.cards.filter((c) => owned(c.playerId)).length;
        const pct = a.cards.length === 0 ? 0 : Math.round((have / a.cards.length) * 100);
        return (
          <div key={a.key} className="album">
            <h3 data-testid={`album-${a.key}`} className="album-header">
              <span>{a.title}</span>
              <span className="album-progress">{have}/{a.cards.length} ({pct}%)</span>
            </h3>
            <div className="album-grid">
              {a.cards.map((c) => (
                <div key={c.playerId} data-testid={`card-${c.playerId}`}
                  data-owned={owned(c.playerId) ? "true" : "false"} className="album-card">
                  <CardView card={c} team={teams[c.team]} size="sm" count={save.owned[c.playerId]} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
