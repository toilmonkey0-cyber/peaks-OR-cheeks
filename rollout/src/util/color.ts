// Team-color legibility helpers. Many franchises have near-black primaries
// (LV/PIT are #000); on a dark card they vanish, so art colors get lifted to a
// minimum relative luminance by mixing in white — palette identity survives.

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h || "000000", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4));

export function relLuminance(r: number, g: number, b: number): number {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const toHex = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");

/** Mix white in until relative luminance >= minLum (bright colors pass through). */
export function liftColor(hex: string, minLum = 0.3): string {
  let [r, g, b] = hexToRgb(hex);
  for (let i = 0; i < 24 && relLuminance(r, g, b) < minLum; i++) {
    r += (255 - r) * 0.12;
    g += (255 - g) * 0.12;
    b += (255 - b) * 0.12;
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
