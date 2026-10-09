import { useEffect, useRef } from "react";
import { makeRng } from "@/engine/rng";

// Procedural creature faces: 12x12 pixel archetypes, seeded variance
// (eyes, brows, marks) in team colors. Original art — never licensed marks.

const ARCHETYPES: Record<string, string[]> = {
  // 0 transparent, 1 primary, 2 secondary, 3 outline, 4 white, 5 dark
  bird: [
    "............",
    "....####....",
    "..##1111##..",
    ".#11122111#.",
    "#1112222111#",
    "#1114441111#",
    "#1114451111#",
    ".#1111111#3.",
    ".#22222223#.",
    "..#333333#..",
    "...#3..3#...",
    "............",
  ],
  feline: [
    "............",
    ".#........#.",
    ".##......##.",
    ".#1#....#1#.",
    ".#11#..#11#.",
    "..#111111#..",
    "..#144411#..",
    "..#145411#..",
    "..#111111#..",
    "...#2222#...",
    "....#22#....",
    ".....##.....",
  ],
  ursa: [
    "............",
    "..##....##..",
    ".#11#..#11#.",
    ".#11111111#.",
    "#1111111111#",
    "#1144114411#",
    "#1145114511#",
    "#1111111111#",
    ".#11222111#.",
    ".#22222222#.",
    "..########..",
    "............",
  ],
  hoof: [
    "............",
    "...##..##...",
    "..#1#..#1#..",
    "..#11##11#..",
    "..#111111#..",
    ".#11111111#.",
    ".#144111411#".slice(0, 12),
    ".#11111111#.",
    "..#222222#..",
    "..#2#..#2#..",
    "...#....#...",
    "............",
  ],
  canine: [
    "............",
    "..##....##..",
    ".#11#..#11#.",
    "#1111##1111#",
    "#1111111111#",
    "#1144114411#",
    "#1115115111#",
    "#1111111111#",
    ".#11222211#.",
    ".#22222222#.",
    "..########..",
    "............",
  ],
  reptile: [
    "............",
    "............",
    "...######...",
    "..#111111#..",
    ".#11111111#.",
    "#1141111411#".slice(0, 12),
    "#1114444111#",
    "#1111111111#",
    ".#22111122#.",
    "..#222222#..",
    "...######...",
    "............",
  ],
};

const COLORS: Record<number, string | null> = {
  0: null, 1: "PRIMARY", 2: "SECONDARY", 3: "#0b101d", 4: "#ffffff", 5: "#0b101d",
};

export function creatureGrid(seed: string, archetype: string): string[][] {
  const rng = makeRng(`creature:${seed}`);
  const base = ARCHETYPES[archetype] ?? ARCHETYPES.feline;
  return base.map((row) => [...row].map((ch) => {
    if (ch === "4" && rng() < 0.5) return "5"; // eye variant: dark eyes
    return ch;
  }));
}

export function CreatureCanvas({ seed, archetype, primary, secondary, scale = 8 }:
  { seed: string; archetype: string; primary: string; secondary: string; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const grid = creatureGrid(seed, archetype);
    ctx.imageSmoothingEnabled = false;
    for (let r = 0; r < grid.length; r++) for (let c = 0; c < grid[r].length; c++) {
      const key = COLORS[Number(grid[r][c]) ?? 0];
      if (!key) continue;
      ctx.fillStyle = key === "PRIMARY" ? primary : key === "SECONDARY" ? secondary : key;
      ctx.fillRect(c * scale, r * scale, scale, scale);
    }
  }, [seed, archetype, primary, secondary, scale]);
  return <canvas ref={ref} width={12 * scale} height={12 * scale} aria-hidden />;
}
