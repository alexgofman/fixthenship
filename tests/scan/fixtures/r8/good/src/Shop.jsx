import { loadStripe } from "@stripe/stripe-js";

export default function Shop() {
  return (
    <section>
      <h2>Printed notebook</h2>
      <p>A paper notebook shipped to your door.</p>
      <button>Checkout</button>
    </section>
  );
}
