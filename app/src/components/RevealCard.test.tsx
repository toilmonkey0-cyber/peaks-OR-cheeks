import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RevealCard } from "./RevealCard";
import type { Card } from "@/data/schema";

const legend: Card = { playerId: "L", name: "Leg End", fullName: "Leg End", position: "WR",
  team: "ARI", jersey: 1, age: 25, rating: 95, tier: "legend",
  keyStats: [], fantasyPpg: 20, avatarSeed: "L" };
const common: Card = { ...legend, playerId: "C", rating: 55, tier: "common", name: "Com Mon" };

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
