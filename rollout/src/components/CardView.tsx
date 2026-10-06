import { memo, useMemo } from "react";
import type { Card, Team } from "@/data/schema";
import { generateAvatar } from "@/avatar/avatar";
import { AvatarCanvas } from "@/avatar/AvatarCanvas";
import "./CardView.css";

function heightLabel(h: number | null): string {
  if (!h) return "";
  return `${Math.floor(h / 12)}'${h % 12}"`;
}

// memo: history rail re-renders on every scan; avatar generation is per-seed work
function CardViewBase({ card, team, size = "md", highlight = false }:
  { card: Card; team?: Team; size?: "sm" | "md" | "lg"; highlight?: boolean }) {
  const grid = useMemo(() => generateAvatar(card.avatarSeed), [card.avatarSeed]);
  const meta = [heightLabel(card.heightIn), card.weightLb ? `${card.weightLb} lb` : "",
    card.age ? `${card.age} yrs` : "", card.college].filter(Boolean).join(" · ");
  return (
    <div className={`ro-card tier-${card.tier} size-${size}${highlight ? " highlight" : ""}`}
      data-testid="ro-card">
      {card.xfactor && <span className="xf-badge" aria-label="X-Factor player">⚡ X-F</span>}
      <div className="ro-card-top">
        <span className="rating">{card.rating}</span>
        <span className="pos-team">{card.position} · {card.team}</span>
      </div>
      <AvatarCanvas grid={grid} primary={team?.primary ?? "#1f2937"}
        secondary={team?.secondary ?? "#9ca3af"} scale={size === "lg" ? 11 : 5} />
      <div className="ro-card-name">{card.name}</div>
      {size !== "sm" && (
        <>
          <ul className="ro-card-attrs">
            {card.attributes.map((a) => (
              <li key={a.label}><span className="attr-label">{a.label}</span>
                <span className="attr-value">{a.value}</span></li>
            ))}
          </ul>
          {card.abilities.length > 0 && size === "lg" && (
            <div className="ro-card-abilities">{card.abilities.map((a) => <span key={a}>{a}</span>)}</div>
          )}
          <div className="ro-card-meta">{meta}</div>
        </>
      )}
    </div>
  );
}

export const CardView = memo(CardViewBase);
