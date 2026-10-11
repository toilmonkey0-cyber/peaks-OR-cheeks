import { afterEach, describe, expect, it, vi } from "vitest";
import { detectVoice, validateLine, voiceUserPrompt, anchorsFor, chooseLine, generateHouseLine } from "./houseVoice";
import { CHEEKS_LINES, PEAK_LINES } from "./config";
import type { Card } from "@/data/schema";
import type { HouseVerdict } from "./houseVoice";

const card = (over: Partial<Card> = {}): Card => ({
  playerId: "p1", name: "C. Ham", fullName: "Chad Ham", position: "WR", team: "BUF",
  jersey: 13, age: 26, heightIn: 72, weightLb: 200, college: "Rochester", yearsPro: 4,
  rating: 58, tier: "common", xfactor: false, attributes: [], coreStats: [],
  ...over,
} as unknown as Card);

describe("detectVoice", () => {
  const g = globalThis as { LanguageModel?: unknown; ai?: unknown };
  const hadLM = "LanguageModel" in g, hadAI = "ai" in g;
  afterEach(() => {
    if (hadLM) delete g.LanguageModel; else delete (g as Record<string, unknown>).LanguageModel;
    if (!hadAI) delete g.ai;
  });
  it("is false without the API", () => {
    delete (g as Record<string, unknown>).LanguageModel; g.ai = undefined;
    expect(detectVoice()).toBe(false);
  });
  it("detects the LanguageModel constructor", () => {
    (g as Record<string, unknown>).LanguageModel = class {};
    expect(detectVoice()).toBe(true);
  });
});

describe("voiceUserPrompt", () => {
  const stepRand = () => { let n = 0; return () => (n++ * 0.037) % 1; }; // distinct picks
  it("carries player facts, verdict, anchors, and the one-line rule", () => {
    const p = voiceUserPrompt(card(), "cheeks", stepRand());
    expect(p).toContain("C. Ham");
    expect(p).toContain("58 OVR");
    expect(p).toContain("Verdict: CHEEKS.");
    expect(p).toContain(`- ${CHEEKS_LINES[0]}`);
    expect(p).toContain("ONE new line");
  });
  it("anchors from the matching pool", () => {
    expect(voiceUserPrompt(card({ rating: 91 }), "peak", stepRand())).toContain(`- ${PEAK_LINES[0]}`);
  });
});

describe("anchorsFor", () => {
  it("returns 3 distinct lines", () => {
    let i = 0;
    const cyc = () => { i = (i + 1) % 7; return i / 7; };
    const a = anchorsFor("peak", cyc);
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
  });
  it("never spins on a degenerate constant rng", () => {
    const a = anchorsFor("peak", () => 0);
    expect(a.length).toBeGreaterThanOrEqual(1);
    expect(a.length).toBeLessThanOrEqual(3);
  });
});

describe("validateLine", () => {
  it("accepts and trims a good line", () => {
    expect(validateLine("  \"He eats film for breakfast.\"  ")).toBe("He eats film for breakfast.");
  });
  it("rejects too short, too long, multiline, and AI-tell openers", () => {
    expect(validateLine("bad")).toBeNull();
    expect(validateLine("x".repeat(130))).toBeNull();
    expect(validateLine("Here's a line about him.")).toBeNull();
    expect(validateLine("As an AI, I rate him poorly.")).toBeNull();
    expect(validateLine("line one\nline two")).toBe("line one");
  });
  it("rejects emoji clutter", () => {
    expect(validateLine("He is ass \u{1F44E}\u{FE0F}")).toBeNull();
  });
});

describe("chooseLine", () => {
  it("uses a generated line and marks it ai", () => {
    const r = chooseLine("Fresh from the house.", "cheeks");
    expect(r).toEqual({ line: "Fresh from the house.", ai: true });
  });
  it("falls back to the verdict pool when no generated line", () => {
    const rand = vi.fn().mockReturnValue(0);
    expect(chooseLine(null, "cheeks", rand)).toEqual({ line: CHEEKS_LINES[0], ai: false });
  });
});

describe("generateHouseLine", () => {
  const g = globalThis as Record<string, unknown>;
  const had = "LanguageModel" in g;
  afterEach(() => { if (!had) delete g.LanguageModel; });
  const verdict: HouseVerdict = "cheeks";

  function installFake(fake: { availability?: () => Promise<string>; prompt?: (s: string, o?: { signal?: AbortSignal }) => Promise<string> } | null) {
    if (!fake) { delete g.LanguageModel; return; }
    const avail = fake.availability ?? (() => Promise.resolve("available"));
    const promptFn = fake.prompt ?? (() => Promise.resolve("ok line here"));
    g.LanguageModel = class {
      static availability = avail;
      constructor(_opts: object) { /* session */ }
      prompt = promptFn;
      destroy() { /* noop */ }
    };
  }

  it("returns null when the API is absent", async () => {
    installFake(null);
    expect(await generateHouseLine(card(), verdict, { timeoutMs: 50 })).toBeNull();
  });
  it("returns null when the model is not resident (no surprise downloads)", async () => {
    installFake({ availability: () => Promise.resolve("downloadable") });
    expect(await generateHouseLine(card(), verdict)).toBeNull();
  });
  it("validates and returns a clean line", async () => {
    installFake({ prompt: () => Promise.resolve("  \"The scout retired mid-sentence.\" ") });
    expect(await generateHouseLine(card(), verdict)).toBe("The scout retired mid-sentence.");
  });
  it("null on dirty output", async () => {
    installFake({ prompt: () => Promise.resolve("Here's your line: terrible.") });
    expect(await generateHouseLine(card(), verdict)).toBeNull();
  });
  it("null on timeout", async () => {
    installFake({
      prompt: (_s: string, opts?: { signal?: AbortSignal }) =>
        new Promise<string>((_res, rej) => {
          opts?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
        }),
    });
    expect(await generateHouseLine(card(), verdict, { timeoutMs: 30 })).toBeNull();
  });
});
