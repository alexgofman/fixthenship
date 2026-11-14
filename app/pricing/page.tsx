import type { Metadata } from "next";
import Link from "next/link";
import pricing from "../../lib/content/pricing.json";
import "./pricing.css";

export const metadata: Metadata = {
  title: "Pricing · FixThenShip",
  description: "Free to check. Pay when you want it fixed.",
};

export type PricingTier = {
  name: string;
  price: string;
  priceNote: string;
  forWhom: string;
  includes: string[];
  cta: string;
  href: string;
  featured: boolean;
};

export type PricingContent = {
  note: string;
  tiers: PricingTier[];
};

export const PRICING: PricingContent = pricing;

const FIX_COSTS = [
  "A review uses a small AI model for about three minutes: well under $1.",
  "Each fix is one Devin session: about $4 to $5.",
  "So a seven-fix app costs us about $30 to deliver. These are estimates from one day of runs.",
];

function TierButton({ tier }: { tier: PricingTier }) {
  const className = tier.featured ? "btn-primary pricing-cta" : "pricing-cta pricing-cta-plain";
  if (tier.href.startsWith("/")) {
    return (
      <Link href={tier.href} className={className}>
        {tier.cta}
      </Link>
    );
  }
  return (
    <a href={tier.href} className={className}>
      {tier.cta}
    </a>
  );
}

export default function PricingPage() {
  return (
    <main className="pricing">
      <section className="hero">
        <h1 className="hero-title pricing-title">Free to check. Pay when you want it fixed.</h1>
        <p className="hero-line">
          Start with your app&apos;s web link. You only need your code on GitHub when you want the fixes.
        </p>
      </section>

      <ul className="pricing-tiers">
        {PRICING.tiers.map((tier) => (
          <li key={tier.name} className={tier.featured ? "pricing-tier pricing-tier-featured" : "pricing-tier"}>
            <h2 className="pricing-name">{tier.name}</h2>
            <p className="pricing-price">
              <span className="pricing-amount">{tier.price}</span>
              <span className="pricing-price-note">{tier.priceNote}</span>
            </p>
            <p className="pricing-for">{tier.forWhom}</p>
            <ul className="pricing-includes">
              {tier.includes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <TierButton tier={tier} />
          </li>
        ))}
      </ul>

      <p className="pricing-note">{PRICING.note}</p>

      <section className="pricing-costs" aria-labelledby="pricing-costs-title">
        <h2 id="pricing-costs-title">What a fix costs us</h2>
        {FIX_COSTS.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </section>

      <p className="pricing-promise">
        We never say Apple will approve an app. We say what would likely get it rejected, fix it, and check again.
      </p>
    </main>
  );
}
