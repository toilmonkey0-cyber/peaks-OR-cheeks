import m26 from "../../../data/madden.json";
import m27 from "../../../data/madden27.json";
import { SnapshotSchema, type Snapshot } from "./schema";
import type { Source } from "@/storage/storage";

export { SnapshotSchema };

const FILES: Record<Source, unknown> = { m26, m27 };

export function loadSnapshot(source: Source): Snapshot {
  return SnapshotSchema.parse(FILES[source]);
}

export function loadAllSnapshots(): Record<Source, Snapshot> {
  return { m26: loadSnapshot("m26"), m27: loadSnapshot("m27") };
}

/** "23-super-bowl" → "FINAL" · "madden-ratings-week-3" → "W3" */
export function sourceLabel(source: Source, snapshot: Snapshot): string {
  if (source === "m26") return "M26 · FINAL";
  const m = /week-(\d+)/.exec(snapshot.sourceIteration);
  return m ? `M27 · W${m[1]}` : "M27 · LIVE";
}
