import { detectVoice } from "@/engine/houseVoice";

/** The house speaks on quarter finals — pool lines now, on-device voice where it exists (PoC law: AI upgrades, never gates). */
export type QuarterKind = "peak-quarter" | "final" | "turnover";

const POOL: Record<QuarterKind, string[]> = {
  "peak-quarter": [
    "Four downs. Two calls. No doubt.",
    "Scouted, called, confirmed. Next.",
    "The house tips its cap. Once.",
  ],
  final: [
    "Both sides named. The tape doesn't lie.",
    "Clean work. The wall remembers.",
    "Filed under: knew it all along.",
  ],
  turnover: [
    "Four downs. Zero calls. Zero mercy.",
    "The house accepts your downs. All of them.",
    "Turnover on downs. As prophesied.",
  ],
};

export function quarterLine(kind: QuarterKind, rand: () => number = Math.random): string {
  const pool = POOL[kind];
  return pool[Math.floor(rand() * pool.length)];
}

export const voiceCapable = (): boolean => detectVoice();
