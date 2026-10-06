import { z } from "zod";

export const TierSchema = z.enum(["common", "rare", "elite", "legend"]);
export type Tier = z.infer<typeof TierSchema>;

export const AttributeSchema = z.object({ label: z.string().max(4), value: z.number().int().min(0).max(99) });
export type Attribute = z.infer<typeof AttributeSchema>;

export const CardSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  fullName: z.string(),
  position: z.string(),
  team: z.string(),
  jersey: z.number().nullable(),
  age: z.number().int().min(18).max(50),
  heightIn: z.number().nullable(),
  weightLb: z.number().nullable(),
  college: z.string(),
  yearsPro: z.number().nullable(),
  rating: z.number().int().min(40).max(99),
  tier: TierSchema,
  attributes: z.array(AttributeSchema).max(6),
  xfactor: z.boolean(),
  abilities: z.array(z.string()).max(2),
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
  sourceIteration: z.string(),
  players: z.array(CardSchema),
  teams: z.array(TeamSchema),
  xfactorIds: z.array(z.string()),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
