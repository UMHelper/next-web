import React from "react";

import { Comments } from "@/components/comments";
import { ReviewPagination } from "@/components/review-pagination";
import { getPublicCommentPage } from "@/lib/database/get-public-comment-list";

export default async function ReviewComments({
  profInfoId,
  page,
  code,
  prof,
  total,
}: {
  profInfoId: number;
  page: number;
  code: string;
  prof: string;
  total: number;
}) {
  const comments: any[] = await getPublicCommentPage(profInfoId, page - 1);

  return (
    <div className='max-w-screen-xl mx-auto p-4'>
      <Comments comments={comments} />
      <ReviewPagination
        code={code}
        prof={prof}
        page_num={page}
        total_page={Math.ceil(total / 20)}
      />
    </div>
  );
}
