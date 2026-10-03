import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { Settings, isStale } from "./Settings";
import type { Snapshot } from "@/data/schema";
import type { SaveState } from "@/storage/storage";
import { freshSave } from "@/storage/storage";
import { setHapticsEnabled } from "@/haptics/haptics";

vi.mock("@/haptics/haptics", () => ({
  setHapticsEnabled: vi.fn(),
  haptic: vi.fn(),
  HAPTICS: {},
}));

const snapAt = (builtAt: string): Snapshot =>
  ({ builtAt, xfactorIds: [], players: [], teams: [] });

let latest: SaveState | null = null;
function Harness({ initial, snapshot }: { initial: SaveState; snapshot: Snapshot }) {
  const [save, setSave] = useState(initial);
  latest = save;
  return <Settings save={save} setSave={setSave} snapshot={snapshot} />;
}

afterEach(() => { vi.clearAllMocks(); latest = null; });

describe("isStale", () => {
  it("30 days old is stale, 8 days old is not", () => {
    expect(isStale("2026-09-01", new Date("2026-10-03"))).toBe(true);
    expect(isStale("2026-09-25", new Date("2026-10-03"))).toBe(false);
  });
  it("boundary: exactly 14 days old is not stale", () => {
    expect(isStale("2026-09-19", new Date("2026-10-03"))).toBe(false);
  });
});

describe("Settings screen", () => {
  it("haptics toggle flips persisted hapticsOn and notifies the haptics module", () => {
    render(<Harness initial={freshSave()} snapshot={snapAt("2026-10-03")} />);
    const toggle = screen.getByTestId("haptics-toggle");
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(latest!.hapticsOn).toBe(false);
    expect(setHapticsEnabled).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByTestId("haptics-toggle"));
    expect(latest!.hapticsOn).toBe(true);
    expect(setHapticsEnabled).toHaveBeenCalledWith(true);
  });

  it("shows attributions and the builtAt date", () => {
    render(<Harness initial={freshSave()} snapshot={snapAt("2026-10-03")} />);
    expect(screen.getByTestId("screen-settings").textContent).toContain("Data: nflverse");
    expect(screen.getByTestId("screen-settings").textContent).toContain("Overalls: publicly published game ratings");
    expect(screen.getByTestId("screen-settings").textContent).toContain("Cards as of 2026-10-03");
  });

  it("stale banner appears only when builtAt is older than 14 days", () => {
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const { rerender } = render(<Harness initial={freshSave()} snapshot={snapAt(old)} />);
    const banner = screen.getByTestId("stale-banner");
    expect(banner.textContent).toContain(`Cards as of ${old} — data is stale`);
    rerender(<Harness initial={freshSave()} snapshot={snapAt(new Date().toISOString().slice(0, 10))} />);
    expect(screen.queryByTestId("stale-banner")).toBeNull();
  });

  it("reset is confirm-guarded and restores the fresh save (500 coins)", () => {
    const spent: SaveState = { ...freshSave(), coins: 120, owned: { q1: 3 }, streak: 5 };
    const confirm = vi.spyOn(window, "confirm");
    render(<Harness initial={spent} snapshot={snapAt("2026-10-03")} />);

    confirm.mockReturnValue(false);
    fireEvent.click(screen.getByTestId("reset-save"));
    expect(confirm).toHaveBeenCalled();
    expect(latest!.coins).toBe(120); // cancelled: untouched

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByTestId("reset-save"));
    expect(latest!.coins).toBe(500);
    expect(latest!.owned).toEqual({});
    expect(latest!.streak).toBe(0);
  });
});
