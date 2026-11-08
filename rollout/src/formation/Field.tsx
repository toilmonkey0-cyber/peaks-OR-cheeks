import type { GameState } from "./engine/game";
import { SlotChip } from "./SlotChip";
import type { TeamView } from "./teams";

/** Chip centers in % of the field box, keyed by slot key. Defense top, offense bottom, LOS at 50%. */
export const FIELD: Record<"off" | "def", Record<string, [number, number]>> = {
  off: { WR1: [5.5, 57], LT: [29, 57], LG: [39.5, 57], C: [50, 57], RG: [60.5, 57], RT: [71, 57], TE: [81.5, 57], WR3: [16, 63.5], WR2: [94.5, 63.5], QB: [50, 71], HB: [50, 86] },
  def: { FS: [35, 9], SS: [65, 9], MIKE: [43, 28], WILL: [57, 28], CB3: [16, 34], CB1: [5.5, 38.5], CB2: [94.5, 38.5], REDG: [27, 43], DT1: [42, 43], DT2: [58, 43], LEDG: [73, 43] },
};

export interface FieldProps {
  game: GameState;
  teams: Map<string, TeamView>;
  landing: Set<string>; // "side-index" keys that just landed (one render of pop)
  enterTint: number | null; // side whose tint should animate in (the CONFIRMED flood)
  wave: Set<string>; // slots mid-wave
  onSlot: (side: 0 | 1, index: number) => void;
}

export function Field({ game, teams, landing, enterTint, wave, onSlot }: FieldProps) {
  return (
    <div className="fm-field" data-testid="fm-field">
      <div className="fm-los" aria-hidden="true" />
      <span className="fm-flabel top" aria-hidden="true">DEFENSE</span>
      <span className="fm-flabel bot" aria-hidden="true">OFFENSE</span>
      {([1, 0] as const).map((side) => {
        const S = game.sides[side];
        const known = S.solved || game.over !== null;
        const t = teams.get(S.team);
        return (
          <div key={side} className="fm-side">
            {known && t && (
              <div className={`fm-tint ${side ? "top" : "bot"}${enterTint === side ? " enter" : ""}`} style={{ ["--team" as string]: t.color } as React.CSSProperties} aria-hidden="true">
                <span>{S.team}</span>
              </div>
            )}
            {S.lineup.map((player, index) => {
              const [x, y] = FIELD[side ? "def" : "off"][player.key];
              const slot = S.slots[index];
              const k = `${side}-${index}`;
              return (
                <SlotChip
                  key={k}
                  side={side}
                  index={index}
                  player={player}
                  slot={slot}
                  known={known}
                  teamColor={t?.color}
                  filmable={game.film && !game.over && !slot.fd && !slot.sealed && slot.layer >= 1 && slot.layer < 3}
                  landing={landing.has(k) || wave.has(k)}
                  x={x}
                  y={y}
                  onTap={onSlot}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
