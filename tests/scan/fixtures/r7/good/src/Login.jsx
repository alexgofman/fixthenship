import { supabase } from "./supabase";

export default function Login() {
  const google = () => supabase.auth.signInWithOAuth({ provider: "google" });
  const apple = () => supabase.auth.signInWithOAuth({ provider: "apple" });
  return (
    <div>
      <button onClick={google}>Continue with Google</button>
      <button onClick={apple}>Sign in with Apple</button>
    </div>
  );
}
