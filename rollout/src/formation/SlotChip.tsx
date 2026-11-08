import type { SlotPlayer } from "./engine/lineups";
import type { SlotState } from "./engine/game";

export interface SlotChipProps {
  side: 0 | 1;
  index: number;
  player: SlotPlayer;
  slot: SlotState;
  known: boolean; // side solved or quarter over
  teamColor?: string;
  filmable: boolean;
  landing: boolean;
  wave: boolean; // mid CONFIRMED wave
  x: number;
  y: number;
  onTap: (side: 0 | 1, index: number) => void;
}

const SIDE = ["OFFENSE", "DEFENSE"] as const;

export function SlotChip({ side, index, player, slot, known, teamColor, filmable, landing, wave, x, y, onTap }: SlotChipProps) {
  const cls = ["fm-chip"];
  let label = `${SIDE[side]} ${player.label}`;
  let tappable = false;
  let body: React.ReactNode = null;

  if (slot.sealed) {
    cls.push("sealed");
    body = <span className="num">–</span>;
    label += ", spent";
  } else if (slot.fd) {
    cls.push("fd");
    body = (<><span className="num">▲</span><span className="ini">PEAK</span></>);
    label += ", face-down PEAK, tap to decide";
    tappable = true;
  } else if (slot.layer > 0) {
    cls.push("lit");
    if (player.stamp === "P") cls.push("peak");
    if (player.stamp === "C") cls.push("cheeks");
    body = (
      <>
        <span className="num">{player.jersey}</span>
        {slot.layer >= 2 && <span className="ini">{player.ini}{slot.layer >= 3 ? "•" : ""}</span>}
        {player.stamp === "P" && <span className="mark" aria-hidden="true">▲</span>}
        {player.stamp === "C" && <span className="mark" aria-hidden="true">▼</span>}
      </>
    );
    label += `, number ${player.jersey}` + (slot.layer >= 2 ? `, initials ${player.ini}` : "");
    tappable = true;
  } else if (slot.ghost) {
    cls.push("ghost");
    body = <span className="num">{player.jersey}</span>;
    label += `, number ${player.jersey}`;
    tappable = true;
  } else {
    label += ", hidden";
  }
  if (known) cls.push("known");
  if (filmable) cls.push("filmable");
  if (landing) cls.push("landing");
  if (wave) cls.push("wave");

  const style = { left: `${x}%`, top: `${y}%`, ...(known && teamColor ? { ["--team" as string]: teamColor } : {}) } as React.CSSProperties;
  const content = (<><span className="pos">{player.label}</span>{body}</>);
  const common = { className: cls.join(" "), style, "data-testid": `slot-${side}-${index}`, "data-si": side, "data-i": index, "aria-label": label };
  return tappable
    ? <button type="button" {...common} onClick={() => onTap(side, index)}>{content}</button>
    : <div role="img" {...common}>{content}</div>;
}
