import { memo, useMemo } from "react";
import type { Card, Team } from "@/data/schema";
import { hexToRgb, liftColor, relLuminance } from "@/util/color";
import "./CardView.css";

function heightLabel(h: number | null): string {
  if (!h) return "";
  return `${Math.floor(h / 12)}'${h % 12}"`;
}

// memo: history rail re-renders on every scan; color lift is per-team work
function CardViewBase({ card, team, size = "md", highlight = false }:
  { card: Card; team?: Team; size?: "sm" | "md" | "lg"; highlight?: boolean }) {
  const { tp, ts, ink } = useMemo(() => {
    const p = liftColor(team?.primary ?? "#3b4a63");
    const s = liftColor(team?.secondary ?? "#25304a");
    const [pr, pg, pb] = hexToRgb(p);
    const [sr, sg, sb] = hexToRgb(s);
    // ink flips dark when the plate's average brightness is high (e.g. silver/gold pairs)
    const bright = (relLuminance(pr, pg, pb) + relLuminance(sr, sg, sb)) / 2 > 0.38;
    return { tp: p, ts: s, ink: bright ? "#0a0e1a" : "#f4f7fd" };
  }, [team?.primary, team?.secondary]);
  const meta = [heightLabel(card.heightIn), card.weightLb ? `${card.weightLb} lb` : "",
    card.age ? `${card.age} yrs` : "", card.college].filter(Boolean).join(" · ");
  const number = String(card.jersey ?? 0);
  return (
    <div className={`ro-card tier-${card.tier} size-${size}${highlight ? " highlight" : ""}`}
      data-testid="ro-card" style={{ "--tp": tp, "--ts": ts, "--ink": ink } as React.CSSProperties}>
      {card.xfactor && <span className="xf-badge">X-FACTOR</span>}
      <div className="ro-card-top">
        <span className="rating">{card.rating}</span>
        <span className="pos-team">
          {card.position} · {card.team}
          {size === "sm" && card.jersey != null ? ` · ${number}` : ""}
        </span>
      </div>
      {size !== "sm" && (
        <div className="ro-number-stage" aria-label={`Jersey number ${number}`}>
          <div className="ro-plate"><span className="ro-number">{number}</span></div>
          <div className="ro-number-rule" />
        </div>
      )}
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
