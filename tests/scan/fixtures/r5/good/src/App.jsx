import { Link } from "react-router-dom";

export default function App() {
  return (
    <main>
      <h1>Acme Notes</h1>
      <p>Write things down and find them later.</p>
      <footer>
        <Link to="/legal">Privacy</Link>
        <a href="/support">Support</a>
      </footer>
    </main>
  );
}
