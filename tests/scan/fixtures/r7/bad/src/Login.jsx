import { supabase } from "./supabase";

export default function Login() {
  const google = () => supabase.auth.signInWithOAuth({ provider: "google" });
  return <button onClick={google}>Continue with Google</button>;
}
