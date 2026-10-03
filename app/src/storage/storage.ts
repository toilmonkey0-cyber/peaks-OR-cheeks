import { z } from "zod";
import { STARTING_COINS } from "@/engine/config";

export const SQUAD_SLOTS = ["QB", "RB1", "RB2", "WR1", "WR2", "WR3", "TE", "FLEX", "K", "DEF"] as const;
export type SquadSlot = (typeof SQUAD_SLOTS)[number];

export const SaveStateSchema = z.object({
  version: z.literal(1),
  coins: z.number().int().nonnegative(),
  owned: z.record(z.string(), z.number().int().nonnegative()),
  squad: z.record(z.string(), z.string().nullable()),
  lastDailyClaim: z.string().nullable(),
  streak: z.number().int().nonnegative(),
  hapticsOn: z.boolean(),
});
export type SaveState = z.infer<typeof SaveStateSchema>;

export const SAVE_KEY = "rippack.save.v1";
export const BACKUP_KEY = "rippack.save.backup";

export function freshSave(): SaveState {
  const squad = Object.fromEntries(SQUAD_SLOTS.map((s) => [s, null])) as Record<string, string | null>;
  return { version: 1, coins: STARTING_COINS, owned: {}, squad,
           lastDailyClaim: null, streak: 0, hapticsOn: true };
}

export function loadSave(): SaveState {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw === null) return freshSave();
  try {
    return SaveStateSchema.parse(JSON.parse(raw));
  } catch {
    localStorage.setItem(BACKUP_KEY, raw);
    return freshSave();
  }
}

export function writeSave(s: SaveState): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(s));
}
