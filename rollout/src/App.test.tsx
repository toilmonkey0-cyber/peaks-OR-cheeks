import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the scanner shell", () => {
    const { container } = render(<App />);
    expect(container.textContent).toContain("PEAKS");
    expect(container.textContent).toContain("CHEEKS");
    expect(screen.getByTestId("scan-btn")).toBeInTheDocument();
    expect(screen.getByTestId("lock-row")).toBeInTheDocument();
    expect(screen.getByTestId("luck-strip")).toBeInTheDocument();
    expect(screen.getByText("ALL")).toBeInTheDocument();
  });
});
