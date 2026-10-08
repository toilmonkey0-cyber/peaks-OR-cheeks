import { memo, useMemo } from "react";
import type { Card, Team } from "@/data/schema";
import { verdictOf, type Verdict } from "@/engine/draw";
import { liftColor } from "@/util/color";
import { FootballMark } from "./LuckStrip";
import "./Vault.css";

interface Entry { card: Card; verdict: Verdict; pulls: number }

const SECTION_ORDER: { key: string; label: string; accepts: Verdict[] }[] = [
  { key: "peaks", label: "PEAKS", accepts: ["peak"] },
  { key: "mids", label: "MIDS", accepts: [null] },
  { key: "cheeks", label: "CHEEKS", accepts: ["cheeks", "atomic"] },
];

function VaultBase({ log, byId, teams, bestId, noMids, onClose }: {
  log: string[];
  byId: Record<string, Card>;
  teams: Record<string, Team>;
  bestId: string | null;
  noMids: boolean;
  onClose: () => void;
}) {
  // newest occurrence wins position; count duplicates
  const entries = useMemo(() => {
    const seen = new Map<string, Entry>();
    for (const id of log) {
      const card = byId[id];
      if (!card) continue;
      const existing = seen.get(id);
      if (existing) existing.pulls++;
      else seen.set(id, { card, verdict: verdictOf(card), pulls: 1 });
    }
    return [...seen.values()];
  }, [log, byId]);

  const best = bestId ? byId[bestId] : null;

  return (
    <div className="vault" data-testid="vault" role="dialog" aria-label="The vault">
      <div className="vault-wash" onClick={onClose} />
      <div className="vault-panel">
        <header className="vault-head">
          <span className="vault-title"><FootballMark /> THE VAULT</span>
          <button className="vault-close" onClick={onClose}>CLOSE</button>
        </header>

        <div className="vault-scroll">
          {best && <BestShelf card={best} team={teams[best.team]} />}
          {entries.length === 0 && (
            <p className="vault-empty">Empty. The house respects restraint — but the button is right there.</p>
          )}
          {SECTION_ORDER.map(({ key, label, accepts }) => {
            const items = entries
              .filter((e) => accepts.includes(e.verdict))
              .sort((a, b) => b.card.rating - a.card.rating);
            return (
              <section key={key} className={`vault-section sec-${key}`}>
                <h3>{label}<span className="sec-count">{items.length}</span></h3>
                {items.length === 0
                  ? <p className="sec-none">{noMids && key === "mids" ? "none. as designed." : "none yet"}</p>
                  : <div className="vault-grid">
                      {items.map((e) => <VaultTile key={e.card.playerId} entry={e} team={teams[e.card.team]} />)}
                    </div>}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BestShelf({ card, team }: { card: Card; team?: Team }) {
  const tp = liftColor(team?.primary ?? "#3b4a63");
  const ts = liftColor(team?.secondary ?? "#25304a");
  return (
    <div className="best-shelf" style={{ "--tp": tp, "--ts": ts } as React.CSSProperties}>
      <span className="bs-label">SESSION BEST</span>
      <span className="bs-num">#{card.jersey ?? "—"}</span>
      <span className="bs-name">{card.fullName.toUpperCase()}</span>
      <span className="bs-meta">{card.position} · {card.team}</span>
      <span className="bs-rating">{card.rating}</span>
    </div>
  );
}

function VaultTile({ entry, team }: { entry: Entry; team?: Team }) {
  const { card, verdict, pulls } = entry;
  const tp = liftColor(team?.primary ?? "#3b4a63");
  const ts = liftColor(team?.secondary ?? "#25304a");
  return (
    <div className={`vault-tile v-${verdict ?? "mid"}`} style={{ "--tp": tp, "--ts": ts } as React.CSSProperties}>
      <span className="vt-num">#{card.jersey ?? "—"}</span>
      <div className="vt-body">
        <span className="vt-name">{card.name}</span>
        <span className="vt-meta">{card.position} · {card.team}</span>
      </div>
      <div className="vt-right">
        <span className="vt-rating">{card.rating}</span>
        {verdict && <span className={`vt-tag t-${verdict}`}>{verdict === "atomic" ? "ATOMIC" : verdict.toUpperCase()}</span>}
        {pulls > 1 && <span className="vt-pulls">×{pulls}</span>}
      </div>
    </div>
  );
}

export const Vault = memo(VaultBase);
