import { supabase } from "./supabase";

export async function register(email, password) {
  return supabase.auth.signUp({ email, password });
}
