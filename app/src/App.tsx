import { useEffect, useState } from "react";
import { loadSnapshot } from "./data/snapshot";
import { loadSave, writeSave, type SaveState } from "./storage/storage";
import { Home } from "./screens/Home";
import { Packs } from "./screens/Packs";
import { Collection } from "./screens/Collection";

const snap = loadSnapshot();
const teams = Object.fromEntries(snap.teams.map((t) => [t.abbr, t]));

export type Tab = "home" | "packs" | "collection" | "squad" | "settings";
export type SetSave = React.Dispatch<React.SetStateAction<SaveState>>;

export function App() {
  const [save, setSave] = useState<SaveState>(loadSave);
  const [tab, setTab] = useState<Tab>("home");
  useEffect(() => { writeSave(save); }, [save]);

  return (
    <div className="app">
      <header className="topbar"><span className="brand">RipPack</span>
        <span data-testid="coin-balance" data-coins={save.coins}>🪙 {save.coins}</span></header>
      <main>
        {tab === "home" && <Home save={save} goPacks={() => setTab("packs")} />}
        {tab === "packs" && <Packs save={save} setSave={setSave} snapshot={snap} />}
        {tab === "collection" && <Collection save={save} snapshot={snap} teams={teams} />}
        {tab === "squad" && <section data-testid="screen-squad" />}
        {tab === "settings" && <section data-testid="screen-settings" />}
      </main>
      <nav className="tabbar">
        {(["home", "packs", "collection", "squad", "settings"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            aria-current={tab === t ? "page" : undefined}
            className={tab === t ? "active" : ""}>
            {t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </nav>
    </div>
  );
}
