import { makeRng } from "@/engine/rng";

// 0 transparent, 1 primary, 2 secondary, 3 outline, 4 white, 5 gray
const HELMET = [
  "............",
  "....####....",
  "..########..",
  ".##########.",
  ".###1113###.",
  ".##111113##.",
  ".##111113##.",
  ".##111113##.",
  ".###1113###.",
  "..#########.",
  "...222222...",
  "....2..2....",
];

export interface PixelGrid { w: number; h: number; pixels: number[][] }

const CHAR_TO_IDX: Record<string, number> = { ".": 0, "#": 3, "1": 1, "2": 2, "4": 4, "5": 5 };

export function generateAvatar(seed: string): PixelGrid {
  const rng = makeRng("avatar:" + seed);
  const pixels = HELMET.map((row) => [...row].map((ch) => CHAR_TO_IDX[ch] ?? 0));
  // variant 1: center stripe in secondary (col 5-6, rows 1-8)
  if (rng() < 0.5) for (let r = 1; r <= 8; r++) { pixels[r][5] = 2; pixels[r][6] = 2; }
  // variant 2: side stripes (cols 3 and 8, rows 3-8)
  if (rng() < 0.4) for (let r = 3; r <= 8; r++) { pixels[r][2] = 2; pixels[r][9] = 2; }
  // variant 3: white facemask instead of secondary (rows 10-11)
  if (rng() < 0.3) for (let c = 3; c <= 8; c++) { pixels[10][c] = 4; pixels[11][c] = 4; }
  // speckle background (1 in 6 seeds gets 3 gray dots) for uniqueness
  if (rng() < 0.166) for (let i = 0; i < 3; i++) {
    const r = Math.floor(rng() * 12), c = Math.floor(rng() * 12);
    if (pixels[r][c] === 0) pixels[r][c] = 5;
  }
  return { w: 12, h: 12, pixels };
}
