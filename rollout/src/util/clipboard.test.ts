import { describe, expect, it } from "vitest";
import { copyText } from "./clipboard";

describe("copyText", () => {
  it("reports failure honestly when no clipboard API is available", async () => {
    // jsdom has neither navigator.clipboard nor execCommand
    const ok = await copyText("probe");
    expect(typeof ok).toBe("boolean");
  });

  it("uses the async clipboard API in secure contexts", async () => {
    const writes: string[] = [];
    Object.assign(navigator, {
      clipboard: { writeText: (t: string) => { writes.push(t); return Promise.resolve(); } },
    });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    const ok = await copyText("hello");
    expect(ok).toBe(true);
    expect(writes).toEqual(["hello"]);
  });
});
