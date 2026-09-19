import { unstable_cache } from "next/cache";

import { CACHE_TAGS } from "@/lib/cache-tags";
import supabaseServer from "@/lib/supabase/server";

export const getStatistics = unstable_cache(
    async () => {
        const { data, error } = await supabaseServer.from("statistics").select("*");
        if (error) {
            console.error("[getStatistics] query failed:", error.message);
            return [];
        }
        return data ?? [];
    },
    ["statistics"],
    { revalidate: 3600, tags: [CACHE_TAGS.statistics] },
);
