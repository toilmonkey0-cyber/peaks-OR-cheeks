import { useMemo, useState } from "react";
import type { Snapshot, Team } from "@/data/schema";
import { SQUAD_SLOTS, type SaveState } from "@/storage/storage";
import { canFill, squadRating, exportText, exportCsv, renderShareImage } from "@/squad/squad";
import { CardView } from "@/components/CardView";
import "./Squad.css";

export function Squad({ save, setSave, snapshot, teams }: {
  save: SaveState;
  setSave: React.Dispatch<React.SetStateAction<SaveState>>;
  snapshot: Snapshot;
  teams: Record<string, Team>;
}) {
  const [picking, setPicking] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const cardsById = useMemo(
    () => new Map(snapshot.players.map((p) => [p.playerId, p])), [snapshot]);
  const ownedCards = useMemo(
    () => snapshot.players.filter((p) => (save.owned[p.playerId] ?? 0) > 0),
    [snapshot, save.owned]);
  // squads are single-use: a card fielded in one slot is not offered for another
  // (the card currently in the picked slot stays listed, so it can be re-picked)
  const picks = useMemo(() => {
    if (!picking) return [];
    const elsewhere = new Set(
      SQUAD_SLOTS.filter((s) => s !== picking)
        .map((s) => save.squad[s])
        .filter((id): id is string => id !== null));
    return ownedCards
      .filter((c) => canFill(picking, c) && !elsewhere.has(c.playerId))
      .slice().sort((a, b) => b.rating - a.rating);
  }, [picking, ownedCards, save.squad]);

  function assign(slot: string, playerId: string) {
    setSave((prev) => ({ ...prev, squad: { ...prev.squad, [slot]: playerId } }));
    setPicking(null);
  }

  function remove(slot: string) {
    setSave((prev) => ({ ...prev, squad: { ...prev.squad, [slot]: null } }));
    setPicking(null);
  }

  async function copy() {
    const text = exportText(save.squad, cardsById);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setToast(text.split("\n")[0]);
    } catch {
      setToast(text); // no clipboard: surface the squad so it can be copied by hand
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    // revoke a tick later: revoking in the same tick can abort the download
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function downloadCsv() {
    downloadBlob(new Blob([exportCsv(save.squad, cardsById)], { type: "text/csv" }),
      "rippack-squad.csv");
  }

  function downloadImage() {
    const canvas = document.createElement("canvas");
    if (!canvas.getContext("2d")) { setToast("Image export unavailable"); return; }
    renderShareImage(canvas, save.squad, cardsById, teams);
    canvas.toBlob((blob) => { if (blob) downloadBlob(blob, "rippack-squad.png"); }, "image/png");
  }

  return (
    <section className="squad" data-testid="screen-squad">
      <h2 className="squad-ovr">Squad — OVR {squadRating(save.squad, cardsById)}</h2>
      <div className="squad-grid">
        {SQUAD_SLOTS.map((slot) => {
          const id = save.squad[slot] ?? null;
          const card = id ? cardsById.get(id) : undefined;
          return (
            <button key={slot} data-testid={`slot-${slot}`} className="squad-slot"
              onClick={() => setPicking(slot)}>
              {card
                ? <CardView card={card} team={teams[card.team]} size="sm" />
                : <span className="slot-empty">{slot}</span>}
            </button>
          );
        })}
      </div>
      <div className="squad-exports">
        <button data-testid="export-copy" onClick={() => void copy()}>Copy</button>
        <button data-testid="export-csv" onClick={downloadCsv}>CSV</button>
        <button data-testid="export-image" onClick={downloadImage}>Image</button>
      </div>
      {toast && <div data-testid="export-toast" className="export-toast">{toast}</div>}
      {picking && (
        <div className="picker-overlay" role="dialog" aria-label={`Choose ${picking}`}>
          <div className="picker">
            <header className="picker-head">
              <h3>Choose {picking}</h3>
              {save.squad[picking] != null && (
                <button data-testid="picker-remove" className="picker-remove"
                  onClick={() => remove(picking)}>Remove</button>
              )}
              <button data-testid="picker-close" onClick={() => setPicking(null)}>Close</button>
            </header>
            <div className="picker-list">
              {picks.map((c) => (
                <button key={c.playerId} data-testid={`pick-${c.playerId}`} className="picker-row"
                  onClick={() => assign(picking, c.playerId)}>
                  <CardView card={c} team={teams[c.team]} size="sm" />
                </button>
              ))}
              {picks.length === 0 && <p className="picker-empty">No eligible cards owned</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
