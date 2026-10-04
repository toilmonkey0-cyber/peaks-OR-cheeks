import { useEffect, useRef, useState } from "react";
import type { Card, Snapshot } from "@/data/schema";
import { openPack, type PackResult, type PackType } from "@/engine/pack";
import { PACK_CONFIG, TROLL_COINS } from "@/engine/config";
import { applyDaily, totalDupeCoins } from "@/engine/economy";
import type { SaveState } from "@/storage/storage";
import { haptic, HAPTICS } from "@/haptics/haptics";
import { RevealCard } from "@/components/RevealCard";

export function Packs({ save, setSave, snapshot }: {
  save: SaveState; setSave: React.Dispatch<React.SetStateAction<SaveState>>; snapshot: Snapshot; }) {
  const [flow, setFlow] = useState<{ result: PackResult; skip: boolean; newIds: string[] } | null>(null);
  const [themePositions, setThemePositions] = useState<string[]>(["RB"]);
  const dailyFree = save.lastDailyClaim !== new Date().toISOString().slice(0, 10);

  function buy(packType: PackType) {
    const cost = packType === "standard" && dailyFree ? 0 : PACK_CONFIG[packType].cost;
    if (save.coins < cost) return;
    haptic(HAPTICS.rip);
    // openPack is a pure one-shot and stays OUTSIDE the state updater (ledger
    // mandate: the updater must be re-runnable, never a second pack source).
    const ownedIds = new Set(Object.keys(save.owned));
    const result = openPack({ packType, seed: crypto.randomUUID(),
      ownedIds, snapshot,
      themePositions: packType === "theme" ? themePositions : undefined });
    const trollCount = result.scripts.filter((s) => s === "troll").length;
    const gained = totalDupeCoins(result.dupesConverted) + trollCount * TROLL_COINS;
    // spec §8: cards NOT owned before the pack open get a NEW marker in the summary
    const newIds = result.cards.filter((c) => !ownedIds.has(c.playerId)).map((c) => c.playerId);
    const today = new Date().toISOString().slice(0, 10);
    setSave((prev) => {
      // all save-field reads come from prev inside the updater
      const owned = { ...prev.owned };
      for (const c of result.cards) owned[c.playerId] = (owned[c.playerId] ?? 0) + 1;
      // free daily pack claims the day AND banks the streak bonus in the same action
      let coins = prev.coins, streak = prev.streak, lastDailyClaim = prev.lastDailyClaim;
      if (cost === 0) {
        ({ coins, streak, lastDailyClaim } = applyDaily(
          { coins: prev.coins, streak: prev.streak, lastDailyClaim: prev.lastDailyClaim }, today));
      }
      return { ...prev, coins: coins - cost + gained, owned, streak, lastDailyClaim };
    });
    setFlow({ result, skip: false, newIds });
  }

  if (flow) return <PackFlow flow={flow} setFlow={setFlow} />;

  return (
    <section className="packs">
      {dailyFree && <button data-testid="buy-standard" className="free" onClick={() => buy("standard")}>
        FREE DAILY — Standard Pack</button>}
      {!dailyFree && <button data-testid="buy-standard" disabled={save.coins < PACK_CONFIG.standard.cost} onClick={() => buy("standard")}>
        Standard Pack — {PACK_CONFIG.standard.cost} 🪙</button>}
      <button data-testid="buy-premium" disabled={save.coins < PACK_CONFIG.premium.cost} onClick={() => buy("premium")}>
        Premium Pack — {PACK_CONFIG.premium.cost} 🪙</button>
      <button data-testid="buy-theme" disabled={save.coins < PACK_CONFIG.theme.cost} onClick={() => buy("theme")}>
        Theme Pack ({themePositions.join("/")}) — {PACK_CONFIG.theme.cost} 🪙</button>
      <select data-testid="theme-select" value={themePositions[0]}
        onChange={(e) => setThemePositions([e.target.value])}>
        {["QB", "RB", "WR", "TE", "K"].map((p) => <option key={p}>{p}</option>)}
      </select>
    </section>
  );
}

function PackFlow({ flow, setFlow }: {
  flow: { result: PackResult; skip: boolean; newIds: string[] };
  setFlow: (f: { result: PackResult; skip: boolean; newIds: string[] } | null) => void; }) {
  const [idx, setIdx] = useState(0);
  const [skip, setSkip] = useState(flow.skip);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // a pending hold timer must never fire after the flow unmounts
  useEffect(() => () => { if (pressTimer.current) clearTimeout(pressTimer.current); }, []);
  const result = flow.result;
  const newIdSet = new Set(flow.newIds);
  const card: Card | undefined = result.cards[idx];

  if (!card) {
    const dupCoins = totalDupeCoins(result.dupesConverted);
    return (
      <section data-testid="pack-summary" className="pack-summary">
        {result.cards.map((c) => <div key={c.playerId}>{c.name} ({c.tier})
          {newIdSet.has(c.playerId) && <span className="new-chip" data-testid={`new-${c.playerId}`}>NEW</span>}
        </div>)}
        {dupCoins > 0 && <p>Duplicates → +{dupCoins} 🪙</p>}
        <button data-testid="summary-done" onClick={() => setFlow(null)}>Done</button>
      </section>
    );
  }
  return (
    <section data-testid="pack-flow" className="pack-flow"
      onPointerDown={() => { pressTimer.current = setTimeout(() => setSkip(true), 400); }}
      onPointerUp={() => { if (pressTimer.current) clearTimeout(pressTimer.current); }}>
      {/* key={idx}: RevealCard holds per-card state (revealed/doneRef) that must
          reset for every card — without the remount the second card never finishes */}
      <RevealCard key={idx} card={card} script={result.scripts[idx]} skip={skip}
        onDone={() => setIdx(idx + 1)} />
      <p className="hint">{skip ? "" : "hold anywhere to fast-forward"}</p>
    </section>
  );
}
