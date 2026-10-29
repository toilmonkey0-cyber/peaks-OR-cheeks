// Real card art, two lanes (personal-use build):
//   lane A — EA's official ratings portraits + ability art, hotlinked from
//            EA CDNs (URLs live in the dataset; nothing copyrighted is hosted)
//   lane B — `public/mutart/` images saved by hand from mut.gg; gitignored,
//            probed by filename convention, never committed
// Resolution order: mutart → EA portrait → procedural card (no art).
import type { Card } from "@/data/schema";

const PORTRAIT_CDN = "https://ratings-images-prod.pulse.ea.com/madden-nfl-";

/** dataset stores portraits as "26/1370" (game namespace / image asset id). */
export function portraitUrl(card: Card): string | null {
  if (!card.portrait) return null;
  const [game, file] = card.portrait.split("/");
  if (!game || !file) return null;
  return `${PORTRAIT_CDN}${game}/portraits/${file}.png?im=FaceCrop,padding=0.7`;
}

export function nameSlug(fullName: string): string {
  return fullName.toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const MUTART_EXTS = ["png", "jpg", "webp"] as const;

/** Filename conventions the drop folder honors, in probe order. */
export function mutartCandidates(card: Card): string[] {
  const byKey = (key: string) => MUTART_EXTS.map((e) => `mutart/${key}.${e}`);
  return [...byKey(card.playerId), ...byKey(nameSlug(card.fullName))];
}

// All 32 verified 200 on a.espncdn.com (EA abbrs == ESPN abbrs incl. WAS).
const TEAM_ABBRS = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL",
  "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC", "LA", "LAC", "LV", "MIA", "MIN",
  "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SF", "SEA", "TB", "TEN", "WAS"] as const;

export function teamLogoUrl(abbr: string): string | null {
  return (TEAM_ABBRS as readonly string[]).includes(abbr)
    ? `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr}.png`
    : null;
}

export interface CardArt { kind: "mutart" | "portrait"; url: string }

// session-level memo: reveal-timing depends on warm entries being instant
const okCache = new Map<string, CardArt>();
const missCache = new Set<string>();
const inflight = new Map<string, Promise<CardArt | null>>();

function loadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") return resolve(false);
    const img = new Image();
    img.onload = () => {
      // decode now so the reveal frame never pays for it (guarded: jsdom has
      // no decode())
      if (typeof img.decode === "function") img.decode().then(() => resolve(true), () => resolve(true));
      else resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/** Kick art loading early (fire() — the card is already chosen). Idempotent. */
export function preloadCardArt(card: Card): Promise<CardArt | null> {
  const hit = okCache.get(card.playerId);
  if (hit) return Promise.resolve(hit);
  if (missCache.has(card.playerId)) return Promise.resolve(null);
  const running = inflight.get(card.playerId);
  if (running) return running;

  const job = (async (): Promise<CardArt | null> => {
    for (const url of mutartCandidates(card)) {
      if (await loadImage(url)) {
        const art: CardArt = { kind: "mutart", url };
        okCache.set(card.playerId, art);
        return art;
      }
    }
    const portrait = portraitUrl(card);
    if (portrait && await loadImage(portrait)) {
      const art: CardArt = { kind: "portrait", url: portrait };
      okCache.set(card.playerId, art);
      return art;
    }
    missCache.add(card.playerId);
    return null;
  })();
  inflight.set(card.playerId, job);
  job.finally(() => inflight.delete(card.playerId));
  return job;
}

/** Synchronous read for card mount — warm only via preloadCardArt. */
export function cachedCardArt(card: Card): CardArt | null {
  return okCache.get(card.playerId) ?? null;
}
