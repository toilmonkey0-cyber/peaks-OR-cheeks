import { memo } from "react";
import type { Card } from "@/data/schema";
import { verdictOf, type Verdict } from "@/engine/draw";
import "./LuckStrip.css";

export interface Tick { verdict: Verdict; rating: number; id: string }

export function ticksFromLog(log: string[], byId: Record<string, Card>): Tick[] {
  return log.map((id) => byId[id]).filter(Boolean).map((c) =>
    ({ verdict: verdictOf(c), rating: c.rating, id: c.playerId }));
}

/** Tick geometry: peaks rise above the midline (taller = better), cheeks sag below. */
export function tickStyle(t: Tick): { className: string; style: React.CSSProperties } {
  if (t.verdict === "peak") {
    return { className: "tick peak", style: { height: `${34 + ((t.rating - 80) / 19) * 46}%` } };
  }
  if (t.verdict === "atomic") {
    return { className: "tick atomic", style: { height: `${88 - (t.rating - 54) * 1.5}%` } };
  }
  if (t.verdict === "cheeks") {
    return { className: "tick cheeks", style: { height: `${46 + (62 - t.rating) * 2.2}%` } };
  }
  return { className: "tick mid", style: {} };
}

function LuckStripBase({ ticks, pullCount, onOpen }: { ticks: Tick[]; pullCount: number; onOpen: () => void }) {
  return (
    <div className="luck-strip" data-testid="luck-strip">
      <div className="strip-track">
        <div className="strip-line" />
        {ticks.length === 0 && <span className="strip-empty">no pulls yet — hold SCAN</span>}
        {ticks.map((t, i) => {
          const { className, style } = tickStyle(t);
          return <span key={`${t.id}-${i}`} className={className} style={style} title={`${t.verdict ?? "mid"} · ${t.rating}`} />;
        })}
      </div>
      <button className="vault-btn" data-testid="vault-btn" onClick={onOpen} aria-label="Open the vault">
        <FootballMark />
        <span className="vault-count">{pullCount}</span>
      </button>
    </div>
  );
}

export const LuckStrip = memo(LuckStripBase);

/** Procedural chrome football — app iconography, no league marks. */
export function FootballMark() {
  return (
    <svg viewBox="0 0 34 22" className="football-mark" aria-hidden>
      <defs>
        <linearGradient id="fb-chrome" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#aab6cf" />
          <stop offset="0.5" stopColor="#5d6b8a" />
          <stop offset="1" stopColor="#c5d1e8" />
        </linearGradient>
      </defs>
      <path d="M2 11 C2 5.5, 8 2.5, 17 2.5 C26 2.5, 32 5.5, 32 11 C32 16.5, 26 19.5, 17 19.5 C8 19.5, 2 16.5, 2 11 Z"
        fill="rgba(14,21,38,0.9)" stroke="url(#fb-chrome)" strokeWidth="1.4" />
      <line x1="10" y1="11" x2="24" y2="11" stroke="url(#fb-chrome)" strokeWidth="1.2" />
      <g stroke="#c5d1e8" strokeWidth="1" opacity="0.8">
        <line x1="13" y1="8.6" x2="13" y2="13.4" /><line x1="17" y1="8.2" x2="17" y2="13.8" /><line x1="21" y1="8.6" x2="21" y2="13.4" />
      </g>
    </svg>
  );
}
