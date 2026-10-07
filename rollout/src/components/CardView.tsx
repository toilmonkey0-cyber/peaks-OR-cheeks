import { memo, useMemo } from "react";
import type { Card, Team } from "@/data/schema";
import { hexToRgb, liftColor, relLuminance } from "@/util/color";
import "./CardView.css";

function heightLabel(h: number | null): string {
  if (!h) return "";
  return `${Math.floor(h / 12)}'${h % 12}"`;
}

interface Props {
  card: Card;
  team?: Team;
  size?: "sm" | "md" | "lg";
  highlight?: boolean;
  /** Data-source tab (M26 / M27) shown on full-size cards. */
  tab?: string;
}

// memo: history rail re-renders on every scan; color lift is per-team work
function CardViewBase({ card, team, size = "md", highlight = false, tab }: Props) {
  const { tp, ts, ink } = useMemo(() => {
    const p = liftColor(team?.primary ?? "#3b4a63");
    const s = liftColor(team?.secondary ?? "#25304a");
    const [pr, pg, pb] = hexToRgb(p);
    const [sr, sg, sb] = hexToRgb(s);
    const bright = (relLuminance(pr, pg, pb) + relLuminance(sr, sg, sb)) / 2 > 0.38;
    return { tp: p, ts: s, ink: bright ? "#0a0e1a" : "#f4f7fd" };
  }, [team?.primary, team?.secondary]);

  const [firstName, ...rest] = card.fullName.split(" ");
  const lastName = rest.join(" ") || firstName;
  const meta = [heightLabel(card.heightIn), card.weightLb ? `${card.weightLb} lb` : "",
    card.age ? `${card.age} yrs` : "", card.college].filter(Boolean).join(" · ");
  const number = String(card.jersey ?? 0);
  const city = (team?.city ?? "").toUpperCase();
  const nameScale = lastName.length > 11 ? 0.78 : lastName.length > 8 ? 0.9 : 1;

  if (size === "sm") {
    return (
      <div className={`ro-card tier-${card.tier} size-sm${highlight ? " highlight" : ""}`}
        data-testid="ro-card" style={{ "--tp": tp, "--ts": ts } as React.CSSProperties}>
        <div className="ro-card-top">
          <span className="rating">{card.rating}</span>
          <span className="pos-team">
            <b className="gold">{card.position}</b> · {card.team}
            {card.jersey != null ? ` · ${number}` : ""}
          </span>
        </div>
        <div className="ro-card-name">{card.name}</div>
      </div>
    );
  }

  return (
    <div className={`ro-frame tier-${card.tier} size-${size}${highlight ? " highlight" : ""}`}
      style={{ "--tp": tp, "--ts": ts, "--ink": ink } as React.CSSProperties}>
      <div className="ro-card" data-testid="ro-card">
        <span className="tab tab-l">{tab ?? "PRO"}</span>
        <span className="tab tab-r">PLAYER CARD</span>
        {card.xfactor && <span className="xf-flag">X-FACTOR</span>}

        <div className="ro-identity">
          <div className="ro-name">
            <span className="first">{firstName.toUpperCase()}</span>
            <span className="last" style={{ fontSize: `${nameScale}em` }}>{lastName.toUpperCase()}</span>
          </div>
          <div className="ro-pos">
            <b className="gold">{card.position}</b>
            {city && <span className="city"> {city}</span>}
          </div>
        </div>

        <div className="ro-ovr" aria-label={`Overall ${card.rating}`}>
          <b>{card.rating}</b>
          <i>OVR</i>
        </div>

        <div className="ro-number-zone" aria-label={`Jersey number ${number}`}>
          <span className="hash">#</span><span className="digits">{number}</span>
        </div>

        <ul className="ro-stats">
          {card.attributes.slice(0, 6).map((a) => (
            <li key={a.label}>
              <span className="lab">{a.label}</span>
              <b className="val">{a.value}</b>
              <i className="bar" style={{ width: `${a.value}%` }} />
            </li>
          ))}
        </ul>

        {card.abilities.length > 0 && (
          <div className="ro-abilities">{card.abilities.map((a) => <span key={a}>{a}</span>)}</div>
        )}
        <div className="ro-meta">{meta}</div>
      </div>
    </div>
  );
}

export const CardView = memo(CardViewBase);
