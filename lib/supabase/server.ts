import "server-only";

import { createSupabaseServerClient } from "./shared";

const supabaseServer = createSupabaseServerClient();

export default supabaseServer;
