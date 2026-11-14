import { supabase } from "./supabase";

export default function Login() {
  const github = () => supabase.auth.signInWithOAuth({ provider: "github" });
  return <button onClick={github}>Continue with GitHub</button>;
}
