import type { Team } from "@/data/schema";

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};
const lighten = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const m = (c: number) => Math.round((c + 255) / 2).toString(16).padStart(2, "0");
  return "#" + m((n >> 16) & 255) + m((n >> 8) & 255) + m(n & 255);
};

/** A team color that reads on the near-black field: primary if bright enough, else secondary, else primary lightened. */
export function teamAccent(t: Pick<Team, "primary" | "secondary">): string {
  if (lum(t.primary) >= 0.2) return t.primary;
  if (lum(t.secondary) >= 0.25) return t.secondary;
  return lighten(t.primary);
}

export interface TeamView { abbr: string; city: string; name: string; full: string; color: string }

export function teamViews(teams: Team[]): Map<string, TeamView> {
  return new Map(
    teams.filter((t) => t.abbr !== "FA").map((t) => [t.abbr, { abbr: t.abbr, city: t.city, name: t.name, full: `${t.city} ${t.name}`, color: teamAccent(t) }]),
  );
}
