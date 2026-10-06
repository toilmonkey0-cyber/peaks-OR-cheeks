import { useEffect, useState } from "react";
import { loadAllSnapshots } from "./data/snapshot";
import { loadSave, writeSave, type SaveState } from "./storage/storage";
import { Scanner } from "./screens/Scanner";

const snapshots = loadAllSnapshots();

export function App() {
  const [save, setSave] = useState<SaveState>(loadSave);
  useEffect(() => { writeSave(save); }, [save]);
  return <Scanner save={save} setSave={setSave} snapshots={snapshots} />;
}
