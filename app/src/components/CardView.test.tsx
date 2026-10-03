import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CardView } from "./CardView";
import type { Card } from "@/data/schema";

const card: Card = {
  playerId: "00-001", name: "A. One", fullName: "Alpha One", position: "QB", team: "ARI",
  jersey: 1, age: 26, rating: 97, tier: "legend", keyStats: [{ label: "PASS YDS", value: "4,231" }],
  fantasyPpg: 21.4, avatarSeed: "00-001",
};

describe("CardView", () => {
  it("renders identity, rating, tier frame, stats", () => {
    render(<CardView card={card} />);
    expect(screen.getByText("A. One")).toBeInTheDocument();
    expect(screen.getByText("97")).toBeInTheDocument();
    expect(screen.getByText("QB · ARI")).toBeInTheDocument();
    expect(screen.getByText("PASS YDS")).toBeInTheDocument();
    expect(screen.getByText("4,231")).toBeInTheDocument();
    expect(document.querySelector(".tier-legend")).toBeTruthy();
  });
  it("shows a duplicate count badge when count > 1", () => {
    render(<CardView card={card} count={3} />);
    expect(screen.getByText("×3")).toBeInTheDocument();
  });
});
