import type { Snapshot } from "@/data/schema";
import { freshSave, type SaveState } from "@/storage/storage";
import { setHapticsEnabled } from "@/haptics/haptics";
import "./Settings.css";

const STALE_DAYS = 14;
const DAY_MS = 86_400_000;

// builtAt is a date-only string (UTC midnight); compare on UTC day boundaries
// so the boundary case (exactly 14 days) is stable in every local timezone.
export function isStale(builtAt: string, today = new Date()): boolean {
  const built = new Date(`${builtAt}T00:00:00Z`).getTime();
  if (Number.isNaN(built)) return false;
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return (now - built) / DAY_MS > STALE_DAYS;
}

export function Settings({ save, setSave, snapshot }: {
  save: SaveState;
  setSave: React.Dispatch<React.SetStateAction<SaveState>>;
  snapshot: Snapshot;
}) {
  const builtAt = snapshot.builtAt;

  function toggleHaptics() {
    const next = !save.hapticsOn;
    setHapticsEnabled(next); // module flag flips immediately, save persists it
    setSave((prev) => ({ ...prev, hapticsOn: !prev.hapticsOn }));
  }

  function reset() {
    if (!window.confirm("Reset your save? All cards, coins and squad will be lost.")) return;
    setSave(() => freshSave());
  }

  return (
    <section className="settings" data-testid="screen-settings">
      <label className="settings-row">
        <span>Haptics</span>
        <input data-testid="haptics-toggle" type="checkbox" checked={save.hapticsOn}
          onChange={toggleHaptics} />
      </label>
      {isStale(builtAt) && (
        <p data-testid="stale-banner" className="stale-banner">
          Cards as of {builtAt} — data is stale</p>
      )}
      <div className="settings-about">
        <p>Cards as of {builtAt}</p>
        <p>Data: nflverse</p>
        <p>Overalls: publicly published game ratings</p>
      </div>
      <button data-testid="reset-save" className="danger" onClick={reset}>Reset save</button>
    </section>
  );
}
