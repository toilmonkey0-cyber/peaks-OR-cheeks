import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RevealCard } from "./RevealCard";
import { apparentClass } from "./apparent";
import type { Card } from "@/data/schema";

const legend: Card = { playerId: "L", name: "Leg End", fullName: "Leg End", position: "WR",
  team: "ARI", jersey: 1, age: 25, rating: 95, tier: "legend",
  keyStats: [], fantasyPpg: 20, avatarSeed: "L" };
const common: Card = { ...legend, playerId: "C", rating: 55, tier: "common", name: "Com Mon" };
const rare: Card = { ...legend, playerId: "R", rating: 70, tier: "rare", name: "Rar E" };
const elite: Card = { ...legend, playerId: "E", rating: 88, tier: "elite", name: "Eli Te" };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("RevealCard", () => {
  it("standard script: tap flips and calls onDone once", async () => {
    const onDone = vi.fn();
    render(<RevealCard card={common} script="standard" skip={false} onDone={onDone} />);
    expect(screen.queryByText("Com Mon")).toBeNull(); // face down
    fireEvent.click(screen.getByTestId("reveal-surface"));
    vi.advanceTimersByTime(500); // fire the 450ms flip-complete timeout
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Com Mon")).toBeInTheDocument();
  });
  it("skip=true fast-forwards", async () => {
    const onDone = vi.fn();
    render(<RevealCard card={legend} script="escalated" skip onDone={onDone} />);
    vi.advanceTimersByTime(500);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  it("troll script requires hold, then shows TROLLED +25 stamp", async () => {
    const onDone = vi.fn();
    render(<RevealCard card={common} script="troll" skip={false} onDone={onDone} />);
    // plain tap does NOT flip a hold card
    fireEvent.click(screen.getByTestId("reveal-surface"));
    expect(screen.queryByText("TROLLED")).toBeNull();
    // hold 1.2s then release (fake timers advance both the interval and Date.now)
    fireEvent.pointerDown(screen.getByTestId("reveal-surface"));
    vi.advanceTimersByTime(1300);
    fireEvent.pointerUp(screen.getByTestId("reveal-surface"));
    vi.advanceTimersByTime(500);
    expect(screen.getByText("TROLLED")).toBeInTheDocument();
    expect(screen.getByText("+25")).toBeInTheDocument();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("apparentClass tell ladder (spec §7)", () => {
  it("fake-outs: gem always dull, troll always gold", () => {
    expect(apparentClass(common, "gem")).toBe("apparent-dull");
    expect(apparentClass(legend, "gem")).toBe("apparent-dull");
    expect(apparentClass(common, "troll")).toBe("apparent-gold");
    expect(apparentClass(legend, "troll")).toBe("apparent-gold");
  });
  it("real-tier ladder: subtle, mid, blue, gold", () => {
    expect(apparentClass(common, "standard")).toBe("apparent-subtle");
    expect(apparentClass(rare, "standard")).toBe("apparent-mid");
    expect(apparentClass(elite, "escalated")).toBe("apparent-blue");
    expect(apparentClass(legend, "escalated")).toBe("apparent-gold");
    expect(apparentClass({ ...legend, tier: "xfactor" }, "standard")).toBe("apparent-gold");
  });
  it("escalated elite back shows the strong blue tell, not dull/gold", () => {
    render(<RevealCard card={elite} script="escalated" skip={false} onDone={() => {}} />);
    const cls = screen.getByTestId("reveal-surface").className;
    expect(cls).toContain("apparent-blue");
    expect(cls).not.toContain("apparent-dull");
    expect(cls).not.toContain("apparent-gold");
  });
  it("standard rare back shows the mid tell", () => {
    render(<RevealCard card={rare} script="standard" skip={false} onDone={() => {}} />);
    expect(screen.getByTestId("reveal-surface").className).toContain("apparent-mid");
  });
  it("standard common back shows the subtle tell", () => {
    render(<RevealCard card={common} script="standard" skip={false} onDone={() => {}} />);
    expect(screen.getByTestId("reveal-surface").className).toContain("apparent-subtle");
  });
});

describe("RevealCard round-1 fixes", () => {
  it("gem script: dull back pre-flip, HIDDEN GEM stamp on reveal, onDone once", () => {
    const onDone = vi.fn();
    render(<RevealCard card={legend} script="gem" skip={false} onDone={onDone} />);
    expect(screen.getByTestId("reveal-surface").className).toContain("apparent-dull");
    expect(screen.queryByText("HIDDEN GEM")).toBeNull();
    fireEvent.pointerDown(screen.getByTestId("reveal-surface"));
    vi.advanceTimersByTime(1300);
    fireEvent.pointerUp(screen.getByTestId("reveal-surface"));
    vi.advanceTimersByTime(500);
    expect(screen.getByText("HIDDEN GEM")).toBeInTheDocument();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  it("escalated legend: plain tap does NOT flip; hold ≥1 then release does", () => {
    const onDone = vi.fn();
    render(<RevealCard card={legend} script="escalated" skip={false} onDone={onDone} />);
    fireEvent.click(screen.getByTestId("reveal-surface"));
    expect(screen.queryByText("Leg End")).toBeNull(); // still face down
    fireEvent.pointerDown(screen.getByTestId("reveal-surface"));
    vi.advanceTimersByTime(1300);
    fireEvent.pointerUp(screen.getByTestId("reveal-surface"));
    vi.advanceTimersByTime(500);
    expect(screen.getByText("Leg End")).toBeInTheDocument();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  it("hold interval is cleared on unmount — no leaked haptics", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    const { unmount } = render(<RevealCard card={legend} script="escalated" skip={false} onDone={() => {}} />);
    fireEvent.pointerDown(screen.getByTestId("reveal-surface"));
    vi.advanceTimersByTime(1200); // interval ticks → hold pulses fire
    expect(vibrate.mock.calls.length).toBeGreaterThan(0);
    unmount();
    const atUnmount = vibrate.mock.calls.length;
    vi.advanceTimersByTime(2000);
    expect(vibrate.mock.calls.length).toBe(atUnmount);
  });
  it("gem hold stays muted (no gold hold class, no shake); escalated legend escalates", () => {
    const { unmount } = render(<RevealCard card={legend} script="gem" skip={false} onDone={() => {}} />);
    fireEvent.pointerDown(screen.getByTestId("reveal-surface"));
    vi.advanceTimersByTime(1300);
    let cls = screen.getByTestId("reveal-surface").className;
    expect(cls).not.toContain("hold-2");
    expect(cls).not.toContain("hold-1");
    expect(cls).not.toContain("shake");
    expect(cls).toContain("pulse-2"); // dim heartbeat channel instead
    unmount();
    render(<RevealCard card={legend} script="escalated" skip={false} onDone={() => {}} />);
    fireEvent.pointerDown(screen.getByTestId("reveal-surface"));
    vi.advanceTimersByTime(1300);
    cls = screen.getByTestId("reveal-surface").className;
    expect(cls).toContain("hold-2");
    expect(cls).toContain("shake");
  });
  it("gem hold haptics stay flat — only [10] ticks, never holdPulse shapes; escalated legend escalates", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    const { unmount } = render(<RevealCard card={legend} script="gem" skip={false} onDone={() => {}} />);
    fireEvent.pointerDown(screen.getByTestId("reveal-surface"));
    vi.advanceTimersByTime(1300); // interval ticks at 400/800/1200ms — past holdPulse(2) territory
    // snapshot BEFORE pointerUp so the release haptic (HAPTICS.gem) is excluded
    const duringHold = vibrate.mock.calls.slice();
    expect(duringHold.length).toBeGreaterThan(0);
    for (const call of duringHold) expect(call[0]).toEqual([10]); // HAPTICS.tick, flat
    expect(duringHold.some((c) => JSON.stringify(c[0]) === JSON.stringify([20, 30, 20]))).toBe(false);
    unmount();
    vibrate.mockClear();
    render(<RevealCard card={legend} script="escalated" skip={false} onDone={() => {}} />);
    fireEvent.pointerDown(screen.getByTestId("reveal-surface"));
    vi.advanceTimersByTime(1300);
    const shapes = vibrate.mock.calls.map((c) => JSON.stringify(c[0]));
    expect(shapes).toContain(JSON.stringify([20, 30, 20])); // holdPulse(2) still escalates
  });
});
