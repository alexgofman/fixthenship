import { useState } from "react";
import { supabase } from "./supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const github = () => supabase.auth.signInWithOAuth({ provider: "github" });
  const magicLink = () => supabase.auth.signInWithOtp({ email });
  return (
    <div>
      <button onClick={github}>Continue with GitHub</button>
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <button onClick={magicLink}>Email me a sign-in link</button>
    </div>
  );
}
