import { useState } from "react";

export default function App() {
  const [open, setOpen] = useState(false);
  return (
    <main>
      <h1>Acme Notes</h1>
      <p>Write things down and find them later.</p>
      <a href="#features">See features</a>
      <a href="#" onClick={() => setOpen(true)}>Open menu</a>
      <button type="button" onClick={() => setOpen(!open)}>Share</button>
      <button type="submit" form="notes">Save</button>
      <footer>
        <a href="/privacy">Privacy Policy</a>
        <a href="/support">Support</a>
      </footer>
    </main>
  );
}
