import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Card, Team } from "@/data/schema";
import { loadSnapshot } from "@/data/snapshot";
import { CardView } from "./CardView";

const card = (over: Partial<Card> = {}): Card => ({
  playerId: "ea-1", name: "T. Hill", fullName: "Tyreek Hill", position: "WR", team: "MIA",
  jersey: 10, age: 32, heightIn: 70, weightLb: 185, college: "West Alabama", yearsPro: 10,
  rating: 91, tier: "legend", attributes: [{ label: "SPD", value: 97 }, { label: "ACC", value: 96 }], coreStats: { SPD: 80, ACC: 80, AGI: 80, STR: 80, JMP: 80, AWR: 80 },
  xfactor: true, abilities: ["Double Me"], avatarSeed: "ea-1", ...over,
});

const team: Team = { abbr: "MIA", name: "Dolphins", city: "Miami", primary: "#00838F", secondary: "#FC4C02" };

describe("CardView", () => {
  it("renders the template layout: tabs, stacked name, pos+city, OVR, number, stats", () => {
    render(<CardView card={card()} team={team} size="lg" tab="M26" />);
    expect(screen.getByText("M26")).toBeInTheDocument();
    expect(screen.getByText("PLAYER CARD")).toBeInTheDocument();
    expect(screen.getByText("TYREEK")).toBeInTheDocument();
    expect(screen.getByText("HILL")).toBeInTheDocument();
    expect(screen.getByText("WR")).toBeInTheDocument();
    expect(screen.getByText("MIAMI")).toBeInTheDocument();
    expect(screen.getByText("91")).toBeInTheDocument();
    expect(screen.getByText("OVR")).toBeInTheDocument();
    expect(screen.getByText("#")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("SPD")).toBeInTheDocument();
    expect(screen.getByText("X-FACTOR")).toBeInTheDocument();
  });

  it("contains no canvas/avatar imagery — type and color only", () => {
    const { container } = render(<CardView card={card()} team={team} size="lg" tab="M27" />);
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("splits multi-word surnames onto the last line", () => {
    render(<CardView card={card({ fullName: "Marquez Valdes-Scantling" })} team={team} size="lg" />);
    expect(screen.getByText("MARQUEZ")).toBeInTheDocument();
    expect(screen.getByText("VALDES-SCANTLING")).toBeInTheDocument();
  });

  it("sm cards show the number inline and stay compact", () => {
    const { container } = render(<CardView card={card()} team={team} size="sm" />);
    expect(container.textContent).toContain("WR · MIA · 10");
    expect(screen.queryByText("PLAYER CARD")).toBeNull();
  });

  it("renders fine for real snapshot players of any team (incl. black palettes)", () => {
    const snap = loadSnapshot("m26");
    for (const abbr of ["PIT", "LV", "ARI", "KC"]) {
      const p = snap.players.find((c) => c.team === abbr) ?? snap.players[0];
      const t = snap.teams.find((x) => x.abbr === p.team);
      const { container, unmount } = render(<CardView card={p} team={t} size="lg" tab="M26" />);
      expect(container.querySelector(".ro-number-zone .digits")).not.toBeNull();
      unmount();
    }
  });
});
