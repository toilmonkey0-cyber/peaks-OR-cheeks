import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Card, Team } from "@/data/schema";
import { loadSnapshot } from "@/data/snapshot";
import { CardView } from "./CardView";

const card = (over: Partial<Card> = {}): Card => ({
  playerId: "ea-1", name: "T. Hill", fullName: "Tyreek Hill", position: "WR", team: "MIA",
  jersey: 10, age: 32, heightIn: 70, weightLb: 185, college: "West Alabama", yearsPro: 10,
  rating: 91, tier: "legend", attributes: [{ label: "SPD", value: 97 }, { label: "ACC", value: 96 }],
  xfactor: true, abilities: ["Double Me"], avatarSeed: "ea-1", ...over,
});

const team: Team = { abbr: "MIA", name: "Dolphins", city: "Miami", primary: "#00838F", secondary: "#FC4C02" };

describe("CardView", () => {
  it("renders the jersey number on a team-gradient plate", () => {
    const { container } = render(<CardView card={card()} team={team} size="lg" />);
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(container.querySelector(".ro-plate")).not.toBeNull();
    expect(screen.getByText("T. Hill")).toBeInTheDocument();
    expect(screen.getByText("WR · MIA")).toBeInTheDocument();
    expect(screen.getByText("SPD")).toBeInTheDocument();
    expect(screen.getByText("X-FACTOR")).toBeInTheDocument();
  });

  it("contains no canvas/avatar imagery — type and color only", () => {
    const { container } = render(<CardView card={card()} team={team} size="lg" />);
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("sm cards show the number inline and stay compact", () => {
    render(<CardView card={card()} team={team} size="sm" />);
    expect(screen.getByText("WR · MIA · 10")).toBeInTheDocument();
    expect(screen.queryByTestId("ro-number-stage")).toBeNull();
  });

  it("renders fine for real snapshot players of any team (incl. black palettes)", () => {
    const snap = loadSnapshot("m26");
    for (const abbr of ["PIT", "LV", "ARI", "KC"]) {
      const p = snap.players.find((c) => c.team === abbr) ?? snap.players[0];
      const t = snap.teams.find((x) => x.abbr === p.team);
      const { container, unmount } = render(<CardView card={p} team={t} size="lg" />);
      expect(container.querySelector(".ro-number")).not.toBeNull();
      unmount();
    }
  });
});
