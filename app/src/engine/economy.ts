import { STREAK_CAP, STREAK_STEP } from "./config";

export function canClaimDaily(lastClaim: string | null, today: string): boolean {
  return lastClaim !== today;
}

export function applyDaily(
  state: { coins: number; streak: number; lastDailyClaim: string | null },
  today: string,
): { coins: number; streak: number; lastDailyClaim: string } {
  if (!canClaimDaily(state.lastDailyClaim, today)) {
    // guard guarantees state.lastDailyClaim === today here
    return { coins: state.coins, streak: state.streak, lastDailyClaim: today };
  }
  const yesterday = new Date(Date.parse(today + "T00:00:00Z") - 86400000)
    .toISOString().slice(0, 10);
  const streak = state.lastDailyClaim === yesterday ? state.streak + 1 : 1;
  const bonus = Math.min(STREAK_STEP * (streak - 1), STREAK_CAP);
  return { coins: state.coins + bonus, streak, lastDailyClaim: today };
}

export function totalDupeCoins(dupes: { coins: number }[]): number {
  return dupes.reduce((a, d) => a + d.coins, 0);
}
