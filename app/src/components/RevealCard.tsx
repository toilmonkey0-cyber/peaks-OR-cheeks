import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Card } from "@/data/schema";
import type { RevealScript } from "@/engine/reveal";
import { CardView } from "./CardView";
import { HAPTICS, holdPulse, haptic } from "@/haptics/haptics";
import { TIER_RANK } from "@/engine/config";
import "./RevealCard.css";

const HOLD_REQUIRED_SCRIPT: Record<RevealScript, boolean> = {
  standard: false, escalated: false, troll: true, gem: false,
};

export function RevealCard({ card, script, skip, onDone }: {
  card: Card; script: RevealScript; skip: boolean; onDone: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [holdLevel, setHoldLevel] = useState(0);
  const [showOutcome, setShowOutcome] = useState(false);
  const doneRef = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const holdRequired = HOLD_REQUIRED_SCRIPT[script] || TIER_RANK[card.tier] >= 2;

  const finish = (wasTroll: boolean, wasGem: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (wasTroll) haptic(HAPTICS.troll);
    else if (wasGem) haptic(HAPTICS.gem);
    else if (TIER_RANK[card.tier] >= 2) haptic(HAPTICS.rumble);
    else if (card.tier === "rare") haptic(HAPTICS.doubleTick);
    else haptic(HAPTICS.tick);
    setRevealed(true);
    // flushSync: the 450ms timeout runs outside React's event batching, so the
    // outcome stamp must commit synchronously with onDone (React 19 mechanics).
    setTimeout(() => { flushSync(() => { setShowOutcome(true); }); onDone(); }, 450);
  };

  useEffect(() => { if (skip) finish(script === "troll", script === "gem"); /* eslint-disable-next-line */ }, [skip]);

  const startHold = () => {
    if (holdRequired && holdTimer.current === null) {
      const t0 = Date.now();
      holdTimer.current = setInterval(() => {
        const lvl = Math.min(2, Math.floor((Date.now() - t0) / 400)) as 0 | 1 | 2;
        // flushSync: interval callbacks commit async via the scheduler, but the
        // pointerUp handler must see the committed hold level immediately.
        flushSync(() => { setHoldLevel(lvl); });
        haptic(holdPulse(lvl));
      }, 400);
    }
  };
  const endHold = () => {
    if (holdTimer.current) { clearInterval(holdTimer.current); holdTimer.current = null; }
  };

  const apparentBig = script === "troll" || (script === "escalated" && TIER_RANK[card.tier] >= 3) || card.tier === "xfactor";

  return (
    <div data-testid="reveal-surface"
      className={["reveal-card", `apparent-${apparentBig ? "big" : "dull"}`,
                  script === "gem" ? "apparent-dull" : "", revealed ? "flipped" : "",
                  `hold-${holdLevel}`, holdRequired && !revealed ? "shake" : ""].join(" ")}
      onClick={() => { if (!revealed && !holdRequired) finish(false, false); }}
      onPointerDown={startHold}
      onPointerUp={() => { endHold(); if (!revealed && holdRequired && holdLevel >= 1) finish(script === "troll", script === "gem"); }}
      onPointerLeave={endHold}>
      {revealed
        ? <div className="reveal-front"><CardView card={card} size="lg" />
            {showOutcome && script === "troll" ? <div className="stamp troll">TROLLED<span>+25</span></div> : null}
            {showOutcome && script === "gem" ? <div className="stamp gem">HIDDEN GEM</div> : null}
          </div>
        : <div className="reveal-back"><span className="rip-logo">RIP</span></div>}
    </div>
  );
}
