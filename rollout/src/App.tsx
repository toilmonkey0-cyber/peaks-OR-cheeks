import { useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { loadAllSnapshots } from "./data/snapshot";
import { loadSave, writeSave, type SaveState } from "./storage/storage";
import { Scanner } from "./screens/Scanner";

const snapshots = loadAllSnapshots();

export function App() {
  const [save, setSave] = useState<SaveState>(loadSave);
  const [updateReady, setUpdateReady] = useState(false);
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
      <Scanner save={save} setSave={setSave} snapshots={snapshots} />
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
