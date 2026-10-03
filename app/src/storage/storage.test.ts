import { describe, it, expect, beforeEach } from "vitest";
import { loadSave, writeSave, freshSave, SAVE_KEY, BACKUP_KEY } from "./storage";

beforeEach(() => localStorage.clear());

describe("storage", () => {
  it("fresh save has 500 coins and 10 empty squad slots", () => {
    const s = freshSave();
    expect(s.coins).toBe(500);
    expect(Object.values(s.squad).every((v) => v === null)).toBe(true);
    expect(Object.keys(s.squad)).toHaveLength(10);
  });
  it("round-trips", () => {
    const s = { ...freshSave(), coins: 777, owned: { C1: 2 } };
    writeSave(s);
    expect(loadSave()).toEqual(s);
  });
  it("corrupt save is backed up and replaced by fresh", () => {
    localStorage.setItem(SAVE_KEY, "{not json");
    const s = loadSave();
    expect(s.coins).toBe(500);
    expect(localStorage.getItem(BACKUP_KEY)).toBe("{not json");
  });
  it("save with wrong shape (negative coins) is rejected to fresh", () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...freshSave(), coins: -5 }));
    expect(loadSave().coins).toBe(500);
  });
});
