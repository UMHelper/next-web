import React, { Suspense } from "react";
import { notFound, permanentRedirect } from "next/navigation";

import { ReviewCommentsSkeleton, ReviewHeaderSkeleton } from "@/components/loading-skeletons";
import { ReviewHeader } from "@/components/review/review-header";
import ReviewComments from "@/components/review/review-comments";
import { ReviewNotice } from "@/components/review-notice";
import { ReviewReload } from "@/components/review-reload";
import { resolveCourseCode } from "@/lib/database/course-equivalences";
import { getReviewInfo } from "@/lib/database/get-prof-info";
import { parseReviewRoute } from "@/lib/review-route";
import { buildReviewMetadata } from "@/lib/seo";
import { buildReviewPath } from "@/lib/site";

export const revalidate = 300;

type ReviewPageProps = {
    params: Promise<{ code: string, prof: string[] }>,
    searchParams: Promise<{ page?: string | string[] }>,
};

export async function generateMetadata(
    { params, searchParams }: ReviewPageProps) {
    const [{ code, prof }, query] = await Promise.all([params, searchParams]);
    const route = parseReviewRoute(code, prof, query?.page);
    const primary = await resolveCourseCode(route.code);
    const profName = decodeURI(route.prof).replaceAll('$', '/');
    return buildReviewMetadata({ code: primary, prof: profName });
}


const ReviewPage = async ({
    params,
    searchParams,
}: ReviewPageProps) => {
    const [{ code: rawCode, prof: rawProf }, query] = await Promise.all([params, searchParams]);
    const route = parseReviewRoute(rawCode, rawProf, query?.page);
    const { code, prof, page: page_num } = route;
    const primary = await resolveCourseCode(code);

    // Keep one canonical review URL: old code -> new code, preserving the
    // professor and page number.
    if (primary !== code) {
        const decodedProf = decodeURI(prof.replaceAll('$', '/'));
        permanentRedirect(buildReviewPath(primary, decodedProf, page_num));
    }

    const prof_info = await getReviewInfo(primary, decodeURI(prof.replaceAll('$', '/')));
    if (prof_info == undefined) {
        return (
            notFound()
        )
    }

    return (
        <>
            <Suspense fallback={<ReviewHeaderSkeleton />}>
                <ReviewHeader code={primary} prof={prof} profInfo={prof_info} />
            </Suspense>

            <Suspense fallback={<ReviewCommentsSkeleton count={6} />}>
                <ReviewComments
                    profInfoId={prof_info.id}
                    page={page_num}
                    code={primary}
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
