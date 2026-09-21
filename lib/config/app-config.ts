import "server-only";

import { unstable_cache } from "next/cache";

import { CACHE_TAGS } from "@/lib/cache-tags";
import { readAppConfig, type AppConfig } from "@/lib/config/app-config-core";
import supabaseServer from "@/lib/supabase/server";

export type { AppConfig } from "@/lib/config/app-config-core";

export const getAppConfig = unstable_cache(
  async (): Promise<AppConfig> => readAppConfig(supabaseServer),
  ["app-config"],
  { tags: [CACHE_TAGS.appConfig], revalidate: 300 },
);
