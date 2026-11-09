import type { FormationSave } from "./store";
import { MASCOTS } from "@/engine/void";
import { MASCOT_ART } from "@/engine/void";

/** The house's 32: every team you've ever named, lit by its city-nickname mascot. */
export function WallSheet({ wall, onClose }: { wall: FormationSave["wall"]; onClose: () => void }) {
  const lit = Object.keys(wall).length;
  const abbrs = Object.keys(MASCOTS).sort();
  return (
    <>
      <div className="fm-scrim" onClick={onClose} />
      <div className="fm-sheet" role="dialog" aria-modal="true" aria-label="THE WALL">
        <div className="fm-sh-head">
          <span>THE WALL</span>
          <button type="button" className="fm-x" onClick={onClose}>CLOSE</button>
        </div>
        <p className="fm-note">{lit} of 32 named. Gold = called on the first try.</p>
        <div className="fm-wall">
          {abbrs.map((abbr) => {
            const e = wall[abbr];
            return (
              <div key={abbr} className={`fm-wall-tile${e ? " lit" : ""}${e?.gold ? " gold" : ""}`} data-testid={`wall-${abbr}`}
                title={e ? `${MASCOTS[abbr].name} — ${e.day}` : MASCOTS[abbr].name}>
                {e ? <img src={MASCOT_ART[abbr]} alt="" loading="lazy" /> : <span className="q" aria-hidden="true">?</span>}
                <small>{e ? MASCOTS[abbr].name : abbr}</small>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
