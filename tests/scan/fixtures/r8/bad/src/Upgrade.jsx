import { loadStripe } from "@stripe/stripe-js";

export default function Upgrade() {
  return (
    <section>
      <h2>Go Pro</h2>
      <p>Unlimited notes for $9 a month.</p>
      <a href="https://buy.stripe.com/test_123">Upgrade</a>
    </section>
  );
}
