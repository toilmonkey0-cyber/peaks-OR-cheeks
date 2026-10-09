import type { Team } from "@/data/schema";
import type { VoidEntry } from "@/engine/void";
import { CreatureCanvas } from "./CreatureCanvas";
import { liftColor } from "@/util/color";
import "./VoidCard.css";

/** Ghost + mascot cards: the black-hole frame, the house's own collection. */
export function VoidCard({ entry, team, small = false }: { entry: VoidEntry; team?: Team; small?: boolean }) {
  const tp = liftColor(team?.primary ?? "#5b4b8a");
  const ts = liftColor(team?.secondary ?? "#2e2447");
  if (entry.kind === "mascot") {
    return (
      <div className={`void-card mascot${small ? " small" : ""}`} data-testid="void-card"
        style={{ "--tp": tp, "--ts": ts } as React.CSSProperties}>
        <span className="vc-tag">HOUSE ORIGINAL</span>
        <CreatureCanvas seed={entry.id} archetype={entry.archetype} primary={tp} secondary={ts}
          scale={small ? 5 : 9} />
        <div className="vc-name">{entry.name}</div>
        {!small && <div className="vc-meta">{entry.id} · THE HOUSE'S COLLECTION</div>}
      </div>
    );
  }
  return (
    <div className={`void-card ghost${small ? " small" : ""}`} data-testid="void-card"
      style={{ "--tp": tp, "--ts": ts } as React.CSSProperties}>
      <span className="vc-tag">MANIFESTATION</span>
      <div className="vc-code">{entry.code}</div>
      <div className="vc-title">{entry.title}</div>
      <ul className="vc-stats">
        {entry.stats.map((s) => (
          <li key={s.label}><span>{s.label}</span><b>{s.value}</b></li>
        ))}
      </ul>
    </div>
  );
}
