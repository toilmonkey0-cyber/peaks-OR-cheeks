import type { DailyResult } from "./engine/daily";

/** The share line, in the house's voice: `FORMATION 11/08 · 41 pulls · 3 PERFECT · 1 TO · 🔥5`. */
export function shareLine(r: DailyResult, streak: number): string {
  const [, m, d] = r.day.split("-");
  const parts = [`${r.score} pulls`];
  if (r.perfects > 0) parts.push(`${r.perfects} PERFECT`);
  if (r.turnovers > 0) parts.push(`${r.turnovers} TO`);
  let line = `FORMATION ${m}/${d} · ${parts.join(" · ")}`;
  if (r.quartersSolved === 0) line += " · all turnovers, as designed";
  return line + ` · 🔥${streak}`;
}
