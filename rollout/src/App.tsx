import { useEffect, useState } from "react";
import { loadSnapshot } from "./data/snapshot";
import { loadSave, writeSave, type SaveState } from "./storage/storage";
import { Scanner } from "./screens/Scanner";

const snap = loadSnapshot();

export function App() {
  const [save, setSave] = useState<SaveState>(loadSave);
  useEffect(() => { writeSave(save); }, [save]);
  return <Scanner save={save} setSave={setSave} snapshot={snap} />;
}
