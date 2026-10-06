import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the scanner shell", () => {
    render(<App />);
    expect(screen.getByText("ROLLOUT")).toBeInTheDocument();
    expect(screen.getByTestId("scan-btn")).toBeInTheDocument();
    expect(screen.getByTestId("lock-row")).toBeInTheDocument();
    expect(screen.getByTestId("history")).toBeInTheDocument();
    expect(screen.getByText("ALL")).toBeInTheDocument();
  });
});
