import raw from "../../../data/madden.json";
import { SnapshotSchema, type Snapshot } from "./schema";

export { SnapshotSchema };

export function loadSnapshot(): Snapshot {
  return SnapshotSchema.parse(raw);
}
