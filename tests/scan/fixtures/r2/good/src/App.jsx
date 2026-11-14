// TODO: split this component
export default function App() {
  return (
    <main>
      <h1>Acme Notes</h1>
      <h2>My Todo list</h2>
      {/* placeholder for the chart */}
      <input placeholder="Search notes" className="placeholder:text-gray-400" />
      <footer>
        <a href="/privacy">Privacy Policy</a>
        <a href="/support">Support</a>
      </footer>
    </main>
  );
}
