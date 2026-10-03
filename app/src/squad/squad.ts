import type { Card, Team } from "@/data/schema";
import { generateAvatar } from "@/avatar/avatar";
import { SQUAD_SLOTS } from "@/storage/storage";

export function canFill(slot: string, card: Card): boolean {
  if (slot === "FLEX") return ["RB", "WR", "TE"].includes(card.position);
  if (slot === "DEF") return card.position === "DEF";
  return card.position === slot.replace(/\d+$/, "");
}

export function squadRating(squad: Record<string, string | null>, byId: Map<string, Card>): number {
  const filled = SQUAD_SLOTS.map((s) => squad[s]).filter((id): id is string => id !== null)
    .map((id) => byId.get(id)).filter((c): c is Card => !!c);
  if (filled.length === 0) return 0;
  return Math.round(filled.reduce((a, c) => a + c.rating, 0) / filled.length);
}

export function exportText(squad: Record<string, string | null>, byId: Map<string, Card>): string {
  const lines = [`RipPack Squad (OVR ${squadRating(squad, byId)})`];
  for (const slot of SQUAD_SLOTS) {
    const c = squad[slot] ? byId.get(squad[slot]!) : undefined;
    lines.push(c ? `${slot}  ${c.fullName} — ${c.team} ${c.position} [${c.tier}] ${c.rating}`
                 : `${slot}  —`);
  }
  return lines.join("\n");
}

export function exportCsv(squad: Record<string, string | null>, byId: Map<string, Card>): string {
  const rows = ["slot,playerId,fullName,position,team,rating,tier"];
  for (const slot of SQUAD_SLOTS) {
    const c = squad[slot] ? byId.get(squad[slot]!) : undefined;
    rows.push(c ? `${slot},${c.playerId},${c.fullName},${c.position},${c.team},${c.rating},${c.tier}`
                : `${slot},,,,,,`);
  }
  return rows.join("\n");
}

// Pixel palette for the share-image avatar: 1=primary, 2=secondary, 3=outline,
// 4=white, 5=gray; 0 stays transparent (the card fill shows through).
const AVATAR_COLORS: Record<number, string> = { 3: "#374151", 4: "#f9fafb", 5: "#6b7280" };

export function renderShareImage(canvas: HTMLCanvasElement,
  squad: Record<string, string | null>, byId: Map<string, Card>,
  teams?: Record<string, Team>): void {
  const ctx = canvas.getContext("2d")!;
  canvas.width = 1200; canvas.height = 630;
  ctx.fillStyle = "#111827"; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "#fbbf24"; ctx.font = "bold 48px sans-serif";
  ctx.fillText(`RipPack Squad (OVR ${squadRating(squad, byId)})`, 40, 70);
  SQUAD_SLOTS.forEach((slot, i) => {
    const x = 40 + (i % 5) * 232, y = 110 + Math.floor(i / 5) * 250;
    const c = squad[slot] ? byId.get(squad[slot]!) : undefined;
    const t = c ? teams?.[c.team] : undefined;
    ctx.fillStyle = t?.primary ?? "#1f2937"; ctx.fillRect(x, y, 212, 230);
    if (c) {
      ctx.fillStyle = "#e5e7eb"; ctx.font = "20px sans-serif";
      ctx.fillText(c.name.slice(0, 14), x + 10, y + 200);
      ctx.fillStyle = "#fbbf24"; ctx.font = "bold 34px sans-serif";
      ctx.fillText(String(c.rating), x + 10, y + 40);
      ctx.fillStyle = "#9ca3af"; ctx.font = "16px sans-serif";
      ctx.fillText(`${c.position} · ${c.team}`, x + 10, y + 64);
      // 12×12 helmet avatar drawn as a scaled pixel loop (120×96 block)
      const grid = generateAvatar(c.avatarSeed);
      for (let r = 0; r < grid.h; r++) {
        for (let col = 0; col < grid.w; col++) {
          const p = grid.pixels[r][col];
          if (p === 0) continue;
          ctx.fillStyle = p === 1 ? (t?.primary ?? "#e5e7eb")
            : p === 2 ? (t?.secondary ?? "#9ca3af")
            : AVATAR_COLORS[p];
          ctx.fillRect(x + 46 + col * 10, y + 80 + r * 8, 10, 8);
        }
      }
    } else {
      ctx.fillStyle = "#374151"; ctx.font = "20px sans-serif";
      ctx.fillText(slot, x + 80, y + 120);
    }
  });
}
