import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import { Squad } from "./Squad";
import type { Card, Snapshot, Team } from "@/data/schema";
import type { SaveState } from "@/storage/storage";
import { freshSave } from "@/storage/storage";

const mk = (id: string, position: string, rating = 80, tier: Card["tier"] = "rare"): Card => ({
  playerId: id, name: id, fullName: `Full ${id}`, position, team: "ARI", jersey: 1,
  age: 25, rating, tier, keyStats: [], fantasyPpg: 1, avatarSeed: id });
const players = [mk("q1", "QB", 90), mk("q2", "QB", 70), mk("w1", "WR", 85), mk("d1", "DEF", 80)];
const teamList: Team[] = [{ abbr: "ARI", name: "Cardinals", city: "Arizona",
  primary: "#97233F", secondary: "#000" }];
const snapshot: Snapshot = { builtAt: "2026-10-03", xfactorIds: [], players, teams: teamList };
const teams = Object.fromEntries(teamList.map((t) => [t.abbr, t]));

// renders Squad against real state so setSave round-trips are observable
let latest: SaveState | null = null;
function Harness({ initial }: { initial: SaveState }) {
  const [save, setSave] = useState(initial);
  latest = save;
  return <Squad save={save} setSave={setSave} snapshot={snapshot} teams={teams} />;
}

afterEach(async () => {
  // deferred revokes (setTimeout 0) must fire while the URL stubs still exist
  await new Promise((r) => setTimeout(r, 0));
  vi.restoreAllMocks();
  delete (navigator as { clipboard?: unknown }).clipboard;
  delete (URL as { createObjectURL?: unknown }).createObjectURL;
  delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
  latest = null;
});

describe("Squad screen", () => {
  const ownedSave = (): SaveState =>
    ({ ...freshSave(), owned: { q1: 1, q2: 1, w1: 1, d1: 1 } });

  it("slot tap opens picker filtered by canFill, sorted rating desc; pick assigns", () => {
    render(<Harness initial={ownedSave()} />);
    fireEvent.click(screen.getByTestId("slot-QB"));
    expect(screen.getByTestId("pick-q1")).toBeInTheDocument();
    expect(screen.getByTestId("pick-q2")).toBeInTheDocument();
    expect(screen.queryByTestId("pick-w1")).toBeNull(); // WR cannot fill QB
    expect(screen.queryByTestId("pick-d1")).toBeNull();
    // rating desc: q1 (90) before q2 (70)
    expect(screen.getByTestId("pick-q1").compareDocumentPosition(screen.getByTestId("pick-q2"))
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByTestId("pick-q1"));
    expect(screen.queryByTestId("pick-q2")).toBeNull(); // modal closed
    expect(latest!.squad.QB).toBe("q1");
  });

  it("FLEX accepts RB/WR/TE but not QB or DEF", () => {
    render(<Harness initial={ownedSave()} />);
    fireEvent.click(screen.getByTestId("slot-FLEX"));
    expect(screen.getByTestId("pick-w1")).toBeInTheDocument();
    expect(screen.queryByTestId("pick-q1")).toBeNull();
    expect(screen.queryByTestId("pick-d1")).toBeNull();
    fireEvent.click(screen.getByTestId("picker-close"));
    expect(screen.queryByTestId("pick-w1")).toBeNull();
    expect(latest!.squad.FLEX).toBeNull(); // close alone does not assign
  });

  it("copy export falls back to a toast with the text when clipboard is missing", () => {
    render(<Harness initial={ownedSave()} />);
    fireEvent.click(screen.getByTestId("slot-QB"));
    fireEvent.click(screen.getByTestId("pick-q1"));
    fireEvent.click(screen.getByTestId("export-copy"));
    const toast = screen.getByTestId("export-toast");
    expect(toast.textContent).toContain("RipPack Squad (OVR 90)");
    expect(toast.textContent).toContain("QB  Full q1 — ARI QB [rare] 90");
  });

  it("copy export toasts only the first line when clipboard.writeText succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard",
      { value: { writeText }, configurable: true });
    render(<Harness initial={ownedSave()} />);
    fireEvent.click(screen.getByTestId("slot-QB"));
    fireEvent.click(screen.getByTestId("pick-q1"));
    fireEvent.click(screen.getByTestId("export-copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const toast = screen.getByTestId("export-toast");
    expect(toast.textContent).toContain("RipPack Squad (OVR 90)");
    expect(toast.textContent).not.toContain("QB  Full q1");
  });

  it("csv export downloads a Blob with the exact csv body", async () => {
    let blob: Blob | null = null;
    URL.createObjectURL = vi.fn((b: Blob) => { blob = b; return "blob:mock"; });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<Harness initial={ownedSave()} />);
    fireEvent.click(screen.getByTestId("slot-QB"));
    fireEvent.click(screen.getByTestId("pick-q1"));
    fireEvent.click(screen.getByTestId("export-csv"));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(await blob!.text()).toContain("slot,playerId,fullName,position,team,rating,tier");
    expect(await blob!.text()).toContain("QB,q1,Full q1,QB,ARI,90,rare");
    // revoke is deferred a tick after a.click() — must still happen
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock"));
  });

  it("a card assigned to one slot is not offered for another slot", () => {
    render(<Harness initial={ownedSave()} />);
    fireEvent.click(screen.getByTestId("slot-WR1"));
    fireEvent.click(screen.getByTestId("pick-w1"));
    expect(latest!.squad.WR1).toBe("w1");
    fireEvent.click(screen.getByTestId("slot-WR2"));
    expect(screen.queryByTestId("pick-w1")).toBeNull(); // already fielded at WR1
    fireEvent.click(screen.getByTestId("picker-close"));
    fireEvent.click(screen.getByTestId("slot-WR1")); // its own slot still lists it
    expect(screen.getByTestId("pick-w1")).toBeInTheDocument();
  });

  it("remove clears a filled slot and recomputes the OVR", () => {
    render(<Harness initial={ownedSave()} />);
    fireEvent.click(screen.getByTestId("slot-QB"));
    fireEvent.click(screen.getByTestId("pick-q1"));
    expect(screen.getByText("Squad — OVR 90")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("slot-QB"));
    fireEvent.click(screen.getByTestId("picker-remove"));
    expect(latest!.squad.QB).toBeNull();
    expect(screen.getByText("Squad — OVR 0")).toBeInTheDocument();
  });

  it("image export degrades to a toast when canvas 2d is unavailable", () => {
    render(<Harness initial={ownedSave()} />);
    fireEvent.click(screen.getByTestId("export-image"));
    expect(screen.getByTestId("export-toast").textContent).not.toBe("");
  });
});
