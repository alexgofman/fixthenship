import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import pricing from "../lib/content/pricing.json";
import PricingPage, { PRICING } from "../app/pricing/page";

describe("pricing content", () => {
  it("loads the note and four tiers with every field", () => {
    expect(pricing.note).toMatch(/Payments are not switched on yet/);
    expect(pricing.tiers).toHaveLength(4);
    for (const tier of pricing.tiers) {
      expect(tier.name).toBeTruthy();
      expect(tier.price).toBeTruthy();
      expect(tier.priceNote).toBeTruthy();
      expect(tier.forWhom).toBeTruthy();
      expect(tier.includes.length).toBeGreaterThan(0);
      expect(tier.cta).toBeTruthy();
      expect(tier.href).toMatch(/^(\/|mailto:hello@fixthenship\.example$)/);
      expect(typeof tier.featured).toBe("boolean");
    }
    expect(pricing.tiers.filter((t) => t.featured).map((t) => t.name)).toEqual(["Fix pack"]);
  });
});

describe("pricing page", () => {
  const html = renderToStaticMarkup(<PricingPage />);

  it("renders four tiers, one featured, each with its price and button", () => {
    expect(html.match(/class="pricing-tier[ "]/g)).toHaveLength(4);
    expect(html.match(/pricing-tier-featured/g)).toHaveLength(1);
    for (const tier of PRICING.tiers) {
      expect(html).toContain(tier.name);
      expect(html).toContain(tier.price.replace("'", "&#x27;"));
    }
    expect(html.match(/href="mailto:hello@fixthenship.example"/g)).toHaveLength(2);
  });

  it("renders the note and never promises approval", () => {
    expect(html).toContain(PRICING.note);
    expect(html).toContain("What a fix costs us");
    expect(html).toContain("We never say Apple will approve an app.");
  });
});
