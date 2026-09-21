import { revalidateTag } from "next/cache";

import { CACHE_TAGS } from "@/lib/cache-tags";

export function invalidateAfterCommentWrite() {
  revalidateTag(CACHE_TAGS.comment);
  revalidateTag(CACHE_TAGS.statistics);
  revalidateTag(CACHE_TAGS.course);
  revalidateTag(CACHE_TAGS.professor);
  revalidateTag(CACHE_TAGS.catalog);
}

export function invalidateAfterReplyWrite() {
  revalidateTag(CACHE_TAGS.comment);
  revalidateTag(CACHE_TAGS.course);
  revalidateTag(CACHE_TAGS.professor);
}

export function invalidateAfterVoteWrite() {
  revalidateTag(CACHE_TAGS.comment);
  revalidateTag(CACHE_TAGS.course);
  revalidateTag(CACHE_TAGS.professor);
}
