import { useSession } from "./session";
import Login from "./Login";
import Notes from "./Notes";

export default function App() {
  const session = useSession();
  if (!session) return <Login />;
  return (
    <main>
      <Notes />
      <footer>
        <a href="/privacy">Privacy Policy</a>
        <a href="/support">Support</a>
      </footer>
    </main>
  );
}
