import supabaseServer from "@/lib/supabase/server";
import supabaseAdmin from "@/lib/supabase/admin";

export default supabaseServer;
export const createServer = () => supabaseAdmin;
