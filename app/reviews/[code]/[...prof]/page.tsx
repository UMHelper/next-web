import React, { Suspense } from "react";
import { notFound } from "next/navigation";

import { ReviewCommentsSkeleton, ReviewHeaderSkeleton } from "@/components/loading-skeletons";
import { ReviewHeader } from "@/components/review/review-header";
import ReviewComments from "@/components/review/review-comments";
import { ReviewNotice } from "@/components/review-notice";
import { ReviewReload } from "@/components/review-reload";
import { getReviewInfo } from "@/lib/database/get-prof-info";
import { parseReviewRoute } from "@/lib/review-route";
import { buildReviewMetadata } from "@/lib/seo";

export const revalidate = 300;

export function generateMetadata(
    { params, searchParams }: { params: any, searchParams?: any }) {
    const route = parseReviewRoute(params.code, params.prof, searchParams?.page);
    const prof = decodeURI(route.prof).replaceAll('$', '/');
    return buildReviewMetadata({ code: route.code, prof });
}


const ReviewPage = async ({
    params,
    searchParams,
}: {
    params: { code: string, prof: string[] },
    searchParams?: { page?: string | string[] },
}) => {
    const route = parseReviewRoute(params.code, params.prof, searchParams?.page);
    const { code, prof, page: page_num } = route;

    const prof_info = await getReviewInfo(code, decodeURI(prof.replaceAll('$', '/')));
    if (prof_info == undefined) {
        return (
            notFound()
        )
    }

    return (
        <>
            <Suspense fallback={<ReviewHeaderSkeleton />}>
                <ReviewHeader code={code} prof={prof} profInfo={prof_info} />
            </Suspense>

            <Suspense fallback={<ReviewCommentsSkeleton count={6} />}>
                <ReviewComments
                    profInfoId={prof_info.id}
                    page={page_num}
                    code={code}
                    prof={prof}
                    total={prof_info.comments}
                />
            </Suspense>

            <ReviewReload />
            <ReviewNotice admin_note={prof_info.admin_note} admin_note_en={prof_info.admin_note_en} />
        </>
    )
}

export default ReviewPage
