import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

const preview = process.env.PREVIEW_DB_READONLY === "1";

export default defineCloudflareConfig({
  incrementalCache: preview ? "dummy" : r2IncrementalCache,
  tagCache: preview ? "dummy" : d1NextTagCache,
});
