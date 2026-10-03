import { useEffect, useState } from "react";
import { loadSnapshot } from "./data/snapshot";
import { loadSave, writeSave, type SaveState } from "./storage/storage";
import { Home } from "./screens/Home";
import { Packs } from "./screens/Packs";

const snap = loadSnapshot();

export type Tab = "home" | "packs" | "collection" | "squad" | "settings";

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
        {tab === "collection" && <section data-testid="screen-collection" />}
        {tab === "squad" && <section data-testid="screen-squad" />}
        {tab === "settings" && <section data-testid="screen-settings" />}
      </main>
      <nav className="tabbar">
        {(["home", "packs", "collection", "squad", "settings"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </nav>
    </div>
  );
}
