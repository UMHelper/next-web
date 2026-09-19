import { unstable_cache } from "next/cache";

import { CACHE_TAGS } from "@/lib/cache-tags";
import supabaseServer from "@/lib/supabase/server";
import type { FacultyStatisticRow } from "@/lib/database/types";

export const getStatistics = unstable_cache(
    async (): Promise<FacultyStatisticRow[]> => {
        const { data, error } = await supabaseServer.from("statistics").select("*");
        if (error) {
            console.error("[getStatistics] query failed:", error.message);
            return [];
        }
        return (data ?? []) as FacultyStatisticRow[];
    },
    ["statistics"],
    { revalidate: 3600, tags: [CACHE_TAGS.statistics] },
);
