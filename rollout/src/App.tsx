import { useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { loadAllSnapshots } from "./data/snapshot";
import { loadSave, writeSave, type SaveState } from "./storage/storage";
import { Scanner } from "./screens/Scanner";
import { buildLineups } from "./formation/engine/lineups";
import { FormationScreen } from "./formation/FormationScreen";

const snapshots = loadAllSnapshots();
// FORMATION always plays the current game's rosters (M27), independent of the scanner's source toggle
const formationLineups = buildLineups(snapshots.m27);

export function App() {
  const [save, setSave] = useState<SaveState>(loadSave);
  const [updateReady, setUpdateReady] = useState(false);
  // a #formation link opens straight into FORMATION (phone bench, share links)
  const [view, setView] = useState<"scanner" | "formation">(() => (window.location.hash.startsWith("#formation") ? "formation" : "scanner"));
  const applyUpdate = useRef<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => { writeSave(save); }, [save]);

  useEffect(() => {
    // prompt pattern: cache-first load, background check, toast when the new
    // build is downloaded; the user's tap swaps it in — no double-reload dance
    if ("serviceWorker" in navigator) {
      applyUpdate.current = registerSW({
        onNeedRefresh: () => setUpdateReady(true),
        onOfflineReady: () => {},
      });
    }
    const check = () => navigator.serviceWorker?.ready
      .then((r) => r.update()).catch(() => {});
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    const hourly = setInterval(check, 60 * 60 * 1000);
    return () => { document.removeEventListener("visibilitychange", onVisible); clearInterval(hourly); };
  }, []);

  return (
    <>
      {view === "scanner" ? (
        <Scanner save={save} setSave={setSave} snapshots={snapshots} onFormation={() => setView("formation")} />
      ) : (
        <FormationScreen lineups={formationLineups} teams={snapshots.m27.teams} onExit={() => setView("scanner")} />
      )}
      {updateReady && (
        <div className="update-toast" data-testid="update-toast" role="status">
          <span>FRESH CARDS READY</span>
          <button onClick={() => { void applyUpdate.current?.(true); }}>UPDATE</button>
          <button className="dismiss" aria-label="Dismiss update" onClick={() => setUpdateReady(false)}>LATER</button>
        </div>
      )}
    </>
  );
}
