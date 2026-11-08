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

  it("CALL opens a 32-team picker; a wrong pick burns a down and that team is crossed out next time", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "CALL the offense" }));
    const sheet = screen.getByRole("dialog", { name: "CALL THE OFFENSE" });
    expect(within(sheet).getAllByTestId(/^pick-/).length).toBe(32);
    fireEvent.click(within(sheet).getByTestId("pick-NE"));
    expect(screen.queryByRole("dialog", { name: "CALL THE OFFENSE" })).toBeNull();
    expect(litPips()).toBe(3);
    const callBtn = screen.getByRole("button", { name: "CALL the offense" });
    await waitFor(() => expect(callBtn).not.toBeDisabled(), { timeout: 3000 });
    fireEvent.click(callBtn);
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

  /** The test runner's Node process (the app's tsconfig has no Node types, by design). */
  type Proc = { on(e: string, f: (x: unknown) => void): void; off(e: string, f: (x: unknown) => void): void };
  const proc = (globalThis as unknown as { process: Proc }).process;

  /** Collect anything thrown after the screen is gone (rejections from the sequence, errors from frames/timers). */
  async function errorsAfterUnmount(start: () => void): Promise<unknown[]> {
    const errors: unknown[] = [];
    const onRej = (e: unknown) => errors.push(e);
    const onErr = (e: ErrorEvent) => errors.push(e.error ?? e.message);
    proc.on("unhandledRejection", onRej);
    window.addEventListener("error", onErr);
    try {
      const { unmount } = mount();
      start();
      unmount();
      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      proc.off("unhandledRejection", onRej);
      window.removeEventListener("error", onErr);
    }
    return errors;
  }

  it("leaving mid-pull is clean: the sequence stops, nothing throws after the screen is gone", async () => {
    const errors = await errorsAfterUnmount(() => {
      fireEvent.pointerDown(screen.getByTestId("hold-btn"));
      fireEvent.pointerUp(window);
    });
    expect(errors).toEqual([]);
  });

  it("leaving mid-charge is clean: the charge loop stops with the screen", async () => {
    const errors = await errorsAfterUnmount(() => {
      fireEvent.pointerDown(screen.getByTestId("hold-btn"));
    });
    expect(errors).toEqual([]);
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

describe("call theatricals", () => {
  const realMatchMedia = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({
      matches: q.includes("reduce"), media: q, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => { window.matchMedia = realMatchMedia; });

  const pick = (side: "offense" | "defense", abbr: string) => {
    fireEvent.click(screen.getByRole("button", { name: `CALL the ${side}` }));
    fireEvent.click(screen.getByTestId(`pick-${abbr}`));
  };
  const stampText = () => screen.getAllByTestId(/^stamp-/).map((el) => el.className.includes("go") ? el.textContent : "").join("|");

  it("a wrong call is flat: a gray 'no.' and nothing else — no team tint, no CONFIRMED", async () => {
    mount();
    pick("offense", "NE");
    await waitFor(() => expect(stampText()).toContain("no."), { timeout: 2000 });
    expect(screen.getByTestId("stamp-0").className).not.toContain("confirmed");
    expect(screen.getByTestId("fm-field").querySelector(".fm-tint")).toBeNull();
    expect(litPips()).toBe(3);
  });

  it("CALL buttons lock while a ceremony plays, then come back", async () => {
    mount();
    pick("offense", "NE");
    expect(screen.getByRole("button", { name: "CALL the offense" })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("button", { name: "CALL the offense" })).not.toBeDisabled(), { timeout: 3000 });
  });

  it("a correct call is the spectacle: CONFIRMED, the team tint floods in, the side's slots wave", async () => {
    mount();
    pick("offense", "KC");
    await waitFor(() => expect(stampText()).toContain("CONFIRMED."), { timeout: 2000 });
    expect(screen.getByTestId("fm-field").querySelector(".fm-tint.enter")).not.toBeNull();
    await waitFor(() => expect(screen.getByTestId("fm-field").querySelectorAll(".fm-chip.wave").length).toBeGreaterThan(0), { timeout: 2000 });
    expect(screen.getByText(/Kansas City Chiefs/)).toBeInTheDocument();
  });

  it("calling both sides right ends the quarter: Q1 FINAL with the spin count", async () => {
    mount();
    pick("offense", "KC");
    await waitFor(() => expect(screen.getByRole("button", { name: "CALL the defense" })).not.toBeDisabled(), { timeout: 4000 });
    pick("defense", "BUF");
    await waitFor(() => expect(screen.getByRole("dialog", { name: "PEAK QUARTER" })).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByText("0 spins.")).toBeInTheDocument();
  });

  it("four wrong calls = TURNOVER ON DOWNS, and the answers are revealed", async () => {
    mount();
    for (const t of ["NE", "ARI", "ATL", "CAR"]) {
      await waitFor(() => expect(screen.getByRole("button", { name: "CALL the offense" })).not.toBeDisabled(), { timeout: 3000 });
      pick("offense", t);
    }
    await waitFor(() => expect(screen.getByRole("dialog", { name: "TURNOVER ON DOWNS" })).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByText(/OFFENSE: Kansas City Chiefs/)).toBeInTheDocument();
  });

  it("the halftime shop sells schemes at the Q2 final whistle", async () => {
    const g = createGame("h", L, ["KC", "BUF"]);
    g.quarter = 2;
    g.chips = 3;
    render(<FormationScreen lineups={L} teams={snap.teams} onExit={() => {}} initialGame={g} />);
    pick("offense", "KC");
    await waitFor(() => expect(screen.getByRole("button", { name: "CALL the defense" })).not.toBeDisabled(), { timeout: 4000 });
    pick("defense", "BUF");
    const shop = await screen.findByLabelText("Halftime adjustments", {}, { timeout: 5000 });
    fireEvent.click(within(shop).getByText(/STAR POWER/));
    expect(within(shop).getByText(/Owned/)).toBeInTheDocument();
    expect(within(shop).getByText("HALFTIME ADJUSTMENTS · ◆ 1")).toBeInTheDocument();
  });
});
