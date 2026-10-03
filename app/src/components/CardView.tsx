import type { Card, Team } from "@/data/schema";
import { generateAvatar } from "@/avatar/avatar";
import { AvatarCanvas } from "@/avatar/AvatarCanvas";
import "./CardView.css";

export function CardView({ card, team, size = "md", count }:
  { card: Card; team?: Team; size?: "sm" | "md" | "lg"; count?: number }) {
  const grid = generateAvatar(card.avatarSeed);
  return (
    <div className={`rip-card tier-${card.tier} size-${size}`}>
      {count && count > 1 ? <span className="dupe-badge" data-testid="dupe-badge">×{count}</span> : null}
      <div className="rip-card-top">
        <span className="rating">{card.rating}</span>
        <span className="pos-team">{card.position} · {card.team}</span>
      </div>
      <AvatarCanvas grid={grid} primary={team?.primary ?? "#1f2937"} secondary={team?.secondary ?? "#9ca3af"} scale={size === "lg" ? 10 : 6} />
      <div className="rip-card-name">{card.name}</div>
      <ul className="rip-card-stats">
        {card.keyStats.map((s) => (
          <li key={s.label}><span className="stat-label">{s.label}</span><span className="stat-value">{s.value}</span></li>
        ))}
      </ul>
    </div>
  );
}
