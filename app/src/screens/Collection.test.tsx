import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Collection } from "./Collection";
import type { Card, Snapshot } from "@/data/schema";
import type { SaveState } from "@/storage/storage";
import { freshSave } from "@/storage/storage";

const mk = (id: string, team: string, tier: Card["tier"]): Card => ({
  playerId: id, name: id, fullName: `Full ${id}`, position: "WR", team, jersey: 1,
  age: 25, rating: 80, tier, keyStats: [], fantasyPpg: 1, avatarSeed: id });
const snapshot: Snapshot = {
  builtAt: "2026-10-03", xfactorIds: [],
  players: [mk("A1", "ARI", "common"), mk("A2", "ARI", "rare"), mk("B1", "BUF", "legend")],
  teams: [{ abbr: "ARI", name: "Cardinals", city: "Arizona", primary: "#97233F", secondary: "#000" },
          { abbr: "BUF", name: "Bills", city: "Buffalo", primary: "#00338D", secondary: "#C60C30" }],
};

describe("Collection", () => {
  it("team album shows completion and silhouettes unowned", () => {
    const save: SaveState = { ...freshSave(), owned: { A1: 1 } };
    render(<Collection save={save} snapshot={snapshot} teams={{}} />);
    expect(screen.getByTestId("album-ARI").textContent).toContain("1/2");
    expect(screen.getByTestId("album-ARI").textContent).toContain("50%");
    expect(screen.getByTestId("card-A2").dataset.owned).toBe("false");
    expect(screen.getByTestId("card-A1").dataset.owned).toBe("true");
  });
  it("search filters by name", () => {
    render(<Collection save={freshSave()} snapshot={snapshot} teams={{}} />);
    fireEvent.change(screen.getByTestId("collection-search"), { target: { value: "full b1" } });
    expect(screen.getByTestId("card-B1")).toBeInTheDocument();
    expect(screen.queryByTestId("card-A1")).toBeNull();
  });
  it("search hides cards but never changes the album completion metric", () => {
    const save: SaveState = { ...freshSave(), owned: { A1: 1 } };
    render(<Collection save={save} snapshot={snapshot} teams={{}} />);
    fireEvent.change(screen.getByTestId("collection-search"), { target: { value: "full a1" } });
    expect(screen.getByTestId("card-A1")).toBeInTheDocument();
    expect(screen.queryByTestId("card-A2")).toBeNull();
    // completion stays over the UNFILTERED album: still 1/2 (50%)
    expect(screen.getByTestId("album-ARI").textContent).toContain("1/2");
    expect(screen.getByTestId("album-ARI").textContent).toContain("50%");
  });
});
