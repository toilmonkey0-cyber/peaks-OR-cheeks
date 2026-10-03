import { z } from "zod";

export const TierSchema = z.enum(["common", "rare", "elite", "legend", "xfactor"]);
export type Tier = z.infer<typeof TierSchema>;

export const KeyStatSchema = z.object({ label: z.string(), value: z.string() });
export type KeyStat = z.infer<typeof KeyStatSchema>;

export const CardSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  fullName: z.string(),
  position: z.string(),
  team: z.string(),
  jersey: z.number().nullable(),
  age: z.number(),
  rating: z.number().int().min(40).max(99),
  tier: TierSchema,
  keyStats: z.array(KeyStatSchema),
  fantasyPpg: z.number().nullable(),
  avatarSeed: z.string(),
});
export type Card = z.infer<typeof CardSchema>;

export const TeamSchema = z.object({
  abbr: z.string(), name: z.string(), city: z.string(),
  primary: z.string(), secondary: z.string(),
});
export type Team = z.infer<typeof TeamSchema>;

export const SnapshotSchema = z.object({
  builtAt: z.string(),
  players: z.array(CardSchema),
  teams: z.array(TeamSchema),
  xfactorIds: z.array(z.string()),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
