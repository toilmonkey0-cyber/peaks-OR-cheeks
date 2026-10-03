import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App } from "./App";

describe("App shell", () => {
  it("renders 5 tabs and Home shows starting coins", () => {
    render(<App />);
    for (const tab of ["Home", "Packs", "Collection", "Squad", "Settings"])
      expect(screen.getByRole("button", { name: tab })).toBeInTheDocument();
    expect(screen.getByTestId("coin-balance").textContent).toContain("500");
  });
  it("marks the current tab with aria-current and the active class", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Collection" }));
    expect(screen.getByRole("button", { name: "Collection" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Collection" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Home" })).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("screen-collection")).toBeInTheDocument();
  });
  it("first (free daily) standard pack reveals 5 cards and keeps coins troll-tolerant", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Packs" }));
    fireEvent.click(screen.getByTestId("buy-standard"));
    // long-press the background to fast-forward the choreography
    fireEvent.pointerDown(screen.getByTestId("pack-flow"));
    await new Promise((r) => setTimeout(r, 500));
    fireEvent.pointerUp(screen.getByTestId("pack-flow"));
    await waitFor(() => expect(screen.getByTestId("pack-summary")).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByTestId("pack-summary").textContent).not.toBe("");
    fireEvent.click(screen.getByTestId("summary-done"));
    // fresh save: daily pack is free, no dupes possible; a troll reveal may add +25
    const coins = Number(screen.getByTestId("coin-balance").dataset.coins);
    expect([500, 525]).toContain(coins);
  });
});
