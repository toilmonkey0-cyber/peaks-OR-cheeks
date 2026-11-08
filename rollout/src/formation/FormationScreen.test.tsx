import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSnapshot } from "@/data/snapshot";
import { App } from "@/App";
import { buildLineups } from "./engine/lineups";
import { createGame } from "./engine/game";
import { FormationScreen } from "./FormationScreen";

const snap = loadSnapshot("m27");
const L = buildLineups(snap);

beforeEach(() => localStorage.clear());

const mount = (onExit = () => {}) =>
  render(<FormationScreen lineups={L} teams={snap.teams} onExit={onExit} initialTeams={["KC", "BUF"]} seed="t" />);
const litPips = () => screen.getAllByTestId("down-pip").filter((p) => p.dataset.on === "true").length;

describe("FormationScreen shell", () => {
  it("renders the field: 22 chips, Q1 HUD, four down pips, two CALL buttons, TAPE, HOLD", () => {
    mount();
    expect(screen.getByTestId("formation-screen")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^slot-/).length).toBe(22);
    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(screen.getAllByTestId("down-pip").length).toBe(4);
    expect(litPips()).toBe(4);
    expect(screen.getByRole("button", { name: "CALL the offense" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CALL the defense" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "TAPE" })).toBeInTheDocument();
    expect(screen.getByTestId("hold-btn")).toBeInTheDocument();
  });

  it("hidden slots show only their position, never a number", () => {
    mount();
    const qb = screen.getByTestId("slot-0-0");
    expect(qb.textContent).toBe("QB");
  });

  it("CALL opens a 32-team picker; a wrong pick burns a down and that team is crossed out next time", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "CALL the offense" }));
    const sheet = screen.getByRole("dialog", { name: "CALL THE OFFENSE" });
    expect(within(sheet).getAllByTestId(/^pick-/).length).toBe(32);
    fireEvent.click(within(sheet).getByTestId("pick-NE"));
    expect(screen.queryByRole("dialog", { name: "CALL THE OFFENSE" })).toBeNull();
    expect(litPips()).toBe(3);
    fireEvent.click(screen.getByRole("button", { name: "CALL the offense" }));
    expect(screen.getByTestId("pick-NE")).toBeDisabled();
  });

  it("TAPE opens the scout log", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "TAPE" }));
    expect(screen.getByRole("dialog", { name: "THE TAPE" })).toBeInTheDocument();
  });

  it("the back button exits", () => {
    let exited = false;
    mount(() => { exited = true; });
    fireEvent.click(screen.getByRole("button", { name: "Back to the scanner" }));
    expect(exited).toBe(true);
  });
});

describe("the door", () => {
  it("the scanner shows a FORMATION door that opens the game and comes back", () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("formation-door"));
    expect(screen.getByTestId("formation-screen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to the scanner" }));
    expect(screen.queryByTestId("formation-screen")).toBeNull();
    expect(screen.getByTestId("scan-btn")).toBeInTheDocument();
  });
});

describe("THE PULL", () => {
  const realMatchMedia = window.matchMedia;
  beforeEach(() => {
    // reduced motion: the pull keeps its sound/haptics but skips growth, particles, and flight
    window.matchMedia = ((q: string) => ({
      matches: q.includes("reduce"), media: q, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => { window.matchMedia = realMatchMedia; });

  const revealed = () => screen.getAllByTestId(/^slot-/).filter((el) => /number \d+|face-down PEAK/.test(el.getAttribute("aria-label") ?? "")).length;
  const spins = () => screen.getByText("SPINS").parentElement!.textContent;

  it("hold + release pulls exactly one clue onto the field and counts one spin", async () => {
    mount();
    expect(revealed()).toBe(0);
    fireEvent.pointerDown(screen.getByTestId("hold-btn"));
    fireEvent.pointerUp(window);
    await waitFor(() => expect(revealed()).toBe(1), { timeout: 3000 });
    expect(spins()).toBe("SPINS1");
  });

  it("holding the card itself also pulls", async () => {
    mount();
    fireEvent.pointerDown(screen.getByTestId("deck-card"));
    fireEvent.pointerUp(window);
    await waitFor(() => expect(revealed()).toBe(1), { timeout: 3000 });
  });

  it("keyboard: Space down + up on HOLD pulls", async () => {
    mount();
    const btn = screen.getByTestId("hold-btn");
    fireEvent.keyDown(btn, { key: " " });
    fireEvent.keyUp(btn, { key: " " });
    await waitFor(() => expect(revealed()).toBe(1), { timeout: 3000 });
  });

  it("every clue out with downs left: HOLD is locked and the house says make the call", () => {
    const g = createGame("x", L, ["KC", "BUF"]);
    for (const S of g.sides) S.slots.forEach((s) => { s.layer = 3; });
    render(<FormationScreen lineups={L} teams={snap.teams} onExit={() => {}} initialGame={g} />);
    expect(screen.getByTestId("hold-btn")).toBeDisabled();
    expect(screen.getByText(/make the call/i)).toBeInTheDocument();
  });

  it("a second hold while a pull is landing is ignored (one spin, one card)", async () => {
    mount();
    const btn = screen.getByTestId("hold-btn");
    fireEvent.pointerDown(btn);
    fireEvent.pointerUp(window);
    act(() => { fireEvent.pointerDown(btn); fireEvent.pointerUp(window); });
    await waitFor(() => expect(revealed()).toBe(1), { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 400));
    expect(spins()).toBe("SPINS1");
  });
});
