import "server-only";

import { createSupabaseAdminClient } from "./shared";

const supabaseAdmin = createSupabaseAdminClient();

export default supabaseAdmin;
