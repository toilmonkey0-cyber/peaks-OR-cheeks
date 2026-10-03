import { useEffect, useRef } from "react";
import type { PixelGrid } from "./avatar";

const COLORS: Record<number, string | null> = {
  0: null, 1: "PRIMARY", 2: "SECONDARY", 3: "#1f2937", 4: "#ffffff", 5: "#9ca3af",
};

export function AvatarCanvas({ grid, primary, secondary, scale = 8 }:
  { grid: PixelGrid; primary: string; secondary: string; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    for (let r = 0; r < grid.h; r++) for (let c = 0; c < grid.w; c++) {
      const key = COLORS[grid.pixels[r][c]];
      if (key === null || key === undefined) continue;
      ctx.fillStyle = key === "PRIMARY" ? primary : key === "SECONDARY" ? secondary : key;
      ctx.fillRect(c * scale, r * scale, scale, scale);
    }
  }, [grid, primary, secondary, scale]);
  return <canvas ref={ref} width={grid.w * scale} height={grid.h * scale} aria-hidden />;
}
