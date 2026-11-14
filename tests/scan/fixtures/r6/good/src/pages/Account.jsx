import { supabase } from "../supabase";

export default function Account() {
  const onDelete = () => supabase.functions.invoke("delete-user");
  return <button onClick={onDelete}>Delete account</button>;
}
