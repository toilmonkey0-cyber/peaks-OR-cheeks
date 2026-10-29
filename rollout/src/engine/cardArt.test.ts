import { describe, expect, it } from "vitest";
import { mutartCandidates, nameSlug, portraitUrl, teamLogoUrl } from "./cardArt";
import type { Card } from "@/data/schema";

const card = (over: Partial<Card> = {}): Card => ({
  playerId: "ea-112", name: "G. Smith", fullName: "Geno Smith", position: "QB",
  team: "SEA", jersey: 7, age: 34, heightIn: 74, weightLb: 225, college: "WVU",
  yearsPro: 12, rating: 81, tier: "elite", attributes: [], coreStats: {},
  xfactor: false, abilities: [], avatarSeed: "ea-112", ...over,
});

describe("portraitUrl", () => {
  it("builds the EA CDN url from the game/file ref", () => {
    expect(portraitUrl(card({ portrait: "27/1370" })))
      .toBe("https://ratings-images-prod.pulse.ea.com/madden-nfl-27/portraits/1370.png?im=FaceCrop,padding=0.7");
  });
  it("is null without a portrait ref", () => {
    expect(portraitUrl(card())).toBeNull();
  });
});

describe("nameSlug", () => {
  it("hyphenates names for mutart filename conventions", () => {
    expect(nameSlug("Ja'Marr Chase")).toBe("ja-marr-chase");
    expect(nameSlug("Patrick Mahomes II")).toBe("patrick-mahomes-ii");
  });
});

describe("mutartCandidates", () => {
  it("probes playerId and name-slug across supported extensions, playerId first", () => {
    const urls = mutartCandidates(card());
    expect(urls.slice(0, 3)).toEqual(["mutart/ea-112.png", "mutart/ea-112.jpg", "mutart/ea-112.webp"]);
    expect(urls.slice(3, 6)).toEqual(["mutart/geno-smith.png", "mutart/geno-smith.jpg", "mutart/geno-smith.webp"]);
  });
});

describe("teamLogoUrl", () => {
  it("serves all 32 team abbrs from the ESPN CDN", () => {
    const abbrs = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN",
      "DET", "GB", "HOU", "IND", "JAX", "KC", "LA", "LAC", "LV", "MIA", "MIN", "NE",
      "NO", "NYG", "NYJ", "PHI", "PIT", "SF", "SEA", "TB", "TEN", "WAS"];
    for (const a of abbrs) {
      expect(teamLogoUrl(a)).toBe(`https://a.espncdn.com/i/teamlogos/nfl/500/${a}.png`);
    }
  });
  it("yields nothing for free agents or unknowns", () => {
    expect(teamLogoUrl("FA")).toBeNull();
    expect(teamLogoUrl("")).toBeNull();
  });
});
