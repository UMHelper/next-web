import { unstable_cache } from "next/cache";

import { CACHE_TAGS } from "@/lib/cache-tags";
import supabaseServer from "@/lib/supabase/server";

export const getReviewInfo = unstable_cache(
    async (code: string, prof: string) => {
        const { data, error } = await supabaseServer
            .from("prof_with_course")
            .select("*")
            .eq("course_id", code)
            .eq("prof_id", prof.replaceAll("%20", " ").replaceAll("%24", "/"))
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error("[getReviewInfo] query failed:", error.message);
            return null;
        }

        return data;
    },
    ["review-info"],
    { revalidate: 300, tags: [CACHE_TAGS.course, CACHE_TAGS.professor] },
);

export const getProfListByCourse = unstable_cache(
    async (code: string) => {
        const { data, error } = await supabaseServer
            .from("prof_with_course")
            .select("*")
            .eq("course_id", code)
            .order("is_offered", { ascending: false })
            .order("prof_id", { ascending: true });

        if (error) {
            console.error("[getProfListByCourse] query failed:", error.message);
            return [];
        }

        return data ?? [];
    },
    ["course-prof-list"],
    { revalidate: 3600, tags: [CACHE_TAGS.course, CACHE_TAGS.professor] },
);
