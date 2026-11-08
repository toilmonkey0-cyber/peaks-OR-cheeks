/**
 * FORMATION's one tuning file. Every number that changes how the game plays or how the pull
 * FEELS lives here, so a phone-bench session is a one-file edit. Values = spec §13 initial guesses.
 */
import type { SlotClass } from "./engine/lineups";

// ── game tuning ─────────────────────────────────────────────────────────────
/** Pull weights by rarity class: a lineman is 3× as likely as the QB. */
export const WEIGHTS: Record<SlotClass, number> = { common: 3, skill: 2, jack: 1 };
/** A turnover quarter scores this — must stay above the 66-pull maximum so it's worse than ANY solve. */
export const TURNOVER_PENALTY = 70;
/** Solve both sides in this many pulls or fewer → PEAK QUARTER. */
export const PEAK_QUARTER_PULLS = 8;
/** SCOUTING DEPT crosses out this many teams that aren't in the game, each remaining quarter. */
export const SCOUTING_CROSSES = 3;
/** Halftime scheme prices, in chips. */
export const SCHEME_PRICES = { starPower: 2, scouting: 3 } as const;

// ── the pull ────────────────────────────────────────────────────────────────
/** Hold this long for a full charge. */
export const FULL_CHARGE_MS = 1400;
/** Breaths per second, empty → full charge. */
export const BREATH_MIN = 0.9;
export const BREATH_MAX = 3.0;
/** At full charge the card is (1 + CARD_GROWTH)× and lifted this many px. */
export const CARD_GROWTH = 0.5;
export const CARD_LIFT_PX = 26;
/** Energy streaks spiraling into the card. */
export const STREAK_COUNT = 90;
/** Release at the top of a breath (sin(phase) above this) at full charge = PERFECT. Cosmetic only. */
export const PERFECT_SIN = 0.75;
/** Reel spin: first card of a release vs the second (NO-HUDDLE). */
export const REEL_FIRST_MS = 950;
export const REEL_MS = 620;
/** The arc flight from stage to slot. */
export const FLIGHT_MS = 560;
/** How long the verdict face holds before flight: plain vs PEAK/CHEEKS. */
export const VERDICT_PLAIN_MS = 430;
export const VERDICT_BIG_MS = 780;

// ── the call ────────────────────────────────────────────────────────────────
/** CONFIRMED: the wave pops one slot every this many ms. */
export const CONFIRMED_WAVE_STAGGER_MS = 75;
/** CONFIRMED show: beat before the wave starts, linger after the confetti. */
export const CONFIRMED_PRE_WAVE_MS = 300;
export const CONFIRMED_LINGER_MS = 640;
/** The last-down wrong call holds its turnover ending this long. */
export const TURNOVER_HOLD_MS = 1200;
/** After a card lands: how long the ring flash plays before the deck resets. */
export const LANDING_BEAT_MS = 200;
/** Reel mechanics: the flicker stops this close to the reveal, ticking at this cadence (reduced motion ticks faster). */
export const REEL_TAIL_MS = 110;
export const REEL_TICK_MS = 75;
export const REEL_TICK_RM_MS = 40;

/** The wrong call: dead air before the gray "no.", then how long it sits. */
export const FLAT_DEAD_AIR_MS = 380;
export const FLAT_HOLD_MS = 750;
