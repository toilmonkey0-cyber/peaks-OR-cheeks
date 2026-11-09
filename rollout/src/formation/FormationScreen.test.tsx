import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSnapshot } from "@/data/snapshot";
import { App } from "@/App";
import { buildLineups } from "./engine/lineups";
import { createGame, type GameState } from "./engine/game";
import { freshFormationSave, loadFormationSave, writeFormationSave } from "./store";
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
  it("a #formation link opens straight into the game", () => {
    window.location.hash = "#formation";
    try {
      render(<App />);
      expect(screen.getByTestId("formation-screen")).toBeInTheDocument();
    } finally {
      window.location.hash = "";
    }
  });

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

  it("while a pull is in flight, the field and the chip bank are inert and nothing is saved", async () => {
    mount();
    // land one clue, snapshot the save, then start a second pull and immediately poke everything
    fireEvent.pointerDown(screen.getByTestId("hold-btn"));
    fireEvent.pointerUp(window);
    await waitFor(() => expect(revealed()).toBe(1), { timeout: 3000 });
    const savedMidFlight = window.localStorage.getItem("rollout.formation.v1");
    const before = JSON.parse(savedMidFlight!);

    fireEvent.pointerDown(screen.getByTestId("hold-btn"));
    fireEvent.pointerUp(window);
    // poke immediately — under reduced motion the pull lands in ~250ms, so "mid-flight" is right now
    const lit = screen.getAllByTestId(/^slot-/).find((el) => /number \d+/.test(el.getAttribute("aria-label") ?? ""));
    expect(lit).toBeTruthy();
    fireEvent.click(lit!);
    expect(screen.queryByRole("dialog", { name: /OFFENSE ·|DEFENSE ·|PEAK ·/ })).toBeNull(); // no sheet opened
    fireEvent.click(screen.getByRole("button", { name: /banked chips/ })); // ◆ disabled with 0 chips — assert disabled instead
    expect(screen.getByRole("button", { name: /banked chips/ })).toBeDisabled();
    const after = JSON.parse(window.localStorage.getItem("rollout.formation.v1")!);
    expect(after).toEqual(before); // a poke mid-flight never wrote a save with pending:true inside
    // HOLD is disabled during the tail (a human can't press it); once it clears, the next pull works
    await waitFor(() => expect(screen.getByTestId("hold-btn")).not.toBeDisabled(), { timeout: 4000 });
    fireEvent.pointerDown(screen.getByTestId("hold-btn"));
    fireEvent.pointerUp(window);
    await waitFor(() => expect(revealed()).toBe(2), { timeout: 4000 });
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

describe("free play: quarters, tape, save + resume", () => {
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
  const ready = (side: "offense" | "defense") =>
    waitFor(() => expect(screen.getByRole("button", { name: `CALL the ${side}` })).not.toBeDisabled(), { timeout: 4000 });
  /** Solve the current quarter instantly: call both answers. */
  async function solveQuarter() {
    const off = screen.getByTestId("formation-screen").dataset.offense!;
    const def = screen.getByTestId("formation-screen").dataset.defense!;
    await ready("offense"); pick("offense", off);
    await ready("defense"); pick("defense", def);
    await screen.findByRole("dialog", { name: /FINAL|PEAK QUARTER|TURNOVER/ }, { timeout: 5000 });
  }

  it("NEXT QUARTER deals a fresh field: Q2, spins reset, all 22 slots hidden", async () => {
    mount();
    await solveQuarter();
    fireEvent.click(screen.getByRole("button", { name: "NEXT QUARTER" }));
    expect(screen.getByText("Q2")).toBeInTheDocument();
    expect(screen.getByText("SPINS").parentElement!.textContent).toBe("SPINS0");
    expect(screen.getAllByTestId(/^slot-/).every((el) => /hidden/.test(el.getAttribute("aria-label") ?? ""))).toBe(true);
  });

  it("four quarters reach the FINAL line, NEW GAME starts over at Q1 and records the game", async () => {
    mount();
    for (let q = 1; q <= 4; q++) {
      await solveQuarter();
      if (q < 4) fireEvent.click(screen.getByRole("button", { name: "NEXT QUARTER" }));
    }
    expect(screen.getByText(/FINAL: 0 spins − 0 chips =/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "NEW GAME" }));
    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(loadFormationSave()).toMatchObject({ bestGame: 0, gamesPlayed: 1 });
  });

  it("TAPE lists the log newest-first", async () => {
    mount();
    await ready("offense"); pick("offense", "NE");
    await ready("offense"); pick("offense", "ARI");
    await ready("offense");
    fireEvent.click(screen.getByRole("button", { name: "TAPE" }));
    const rows = within(screen.getByRole("dialog", { name: "THE TAPE" })).getAllByRole("listitem");
    expect(rows[0].textContent).toContain("not ARI");
    expect(rows[1].textContent).toContain("not NE");
  });

  it("a game in progress is saved and resumes where it left off", async () => {
    const { unmount } = mount();
    await ready("offense"); pick("offense", "NE");
    await ready("offense");
    unmount();
    render(<FormationScreen lineups={L} teams={snap.teams} onExit={() => {}} />);
    expect(litPips()).toBe(3);
    expect(screen.getByTestId("formation-screen").dataset.offense).toBe("KC");
  });

  it("a pull killed mid-flight resumes as if it never happened: slot pullable, no spin lost", () => {
    const g: GameState = createGame("mid", L, ["KC", "BUF"]);
    g.pulls = 3;
    g.sides[0].slots[4].pending = true; // the tab died with this card in the air
    writeFormationSave({ ...freshFormationSave(), inProgress: g });
    render(<FormationScreen lineups={L} teams={snap.teams} onExit={() => {}} />);
    expect(screen.getByText("SPINS").parentElement!.textContent).toBe("SPINS3");
    expect(screen.getByTestId("hold-btn")).not.toBeDisabled();
    expect(loadFormationSave().inProgress!.sides[0].slots[4].pending).toBe(false);
  });
});

describe("the trophy wall", () => {
  it("renders 32 tiles: unlit show ? and no art; solved teams show the mascot name", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "WALL" }));
    const sheet = screen.getByRole("dialog", { name: "THE WALL" });
    const tiles = within(sheet).getAllByTestId(/^wall-/);
    expect(tiles.length).toBe(32);
    expect(within(sheet).getByTestId("wall-KC").textContent).toContain("?");
    expect(within(sheet).getByTestId("wall-BUF").querySelector("img")).toBeNull();
  });

  it("solving a side lights that team's mascot; gold frame only for a first-try call", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "CALL the offense" }));
    fireEvent.click(screen.getByTestId("pick-NE")); // one wrong call first
    await waitFor(() => expect(screen.getByRole("button", { name: "CALL the offense" })).not.toBeDisabled(), { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "CALL the offense" }));
    fireEvent.click(screen.getByTestId("pick-KC"));
    await waitFor(() => expect(screen.getByText(/Kansas City Chiefs/)).toBeInTheDocument(), { timeout: 4000 });
    // clean up: solve defense first-try for a gold frame
    await waitFor(() => expect(screen.getByRole("button", { name: "CALL the defense" })).not.toBeDisabled(), { timeout: 4000 });
    fireEvent.click(screen.getByRole("button", { name: "CALL the defense" }));
    fireEvent.click(screen.getByTestId("pick-BUF"));
    await waitFor(() => expect(screen.getByText(/Buffalo Bills/)).toBeInTheDocument(), { timeout: 4000 });
    fireEvent.click(screen.getByRole("button", { name: "WALL" }));
    const sheet = screen.getByRole("dialog", { name: "THE WALL" });
    expect(within(sheet).getByTestId("wall-KC").className).not.toContain("gold");
    expect(within(sheet).getByTestId("wall-KC").textContent).toContain("BBQ NATION"); // his city-nickname name
    expect(within(sheet).getByTestId("wall-BUF").className).toContain("gold");
    expect(within(sheet).getByTestId("wall-BUF").querySelector("img")).not.toBeNull();
  });
});
