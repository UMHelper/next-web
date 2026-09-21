import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { buildReviewPath } from "@/lib/site";

export const ReviewPagination =
    ({
        page_num,
        total_page,
        code,
        prof
    }: {
        page_num: number,
        total_page: number,
        code: string,
        prof: string
    }) => {
        const decodedProf = decodeURIComponent(prof).replaceAll("$", "/")
        const reviewHref = (page: number) => buildReviewPath(code, decodedProf, page)

        return (
            <Pagination className="py-1 my-1">
                <PaginationContent>
                    {
                        page_num > 1 ? (
                            <PaginationPrevious href={reviewHref(page_num - 1)} />
                        ) : null
                    }
                    {
                        page_num > 3 ? (
                            <PaginationLink size='xs' href={reviewHref(1)}>1</PaginationLink>
                        ) : null

                    }
                    {
                        page_num > 3 ? (
                            <PaginationItem>
                                <PaginationEllipsis />
                            </PaginationItem>
                        ) : null

                    }

                    {
                        page_num - 1 > 0 ? (
                            <PaginationLink size='xs' href={reviewHref(page_num - 1)}>{page_num - 1}</PaginationLink>
                        ) : null
                    }

                    <PaginationLink isActive size='xs' href={reviewHref(page_num)}>{page_num}</PaginationLink>

                    {
                        page_num + 1 <= total_page ? (
                            <PaginationLink size='xs' href={reviewHref(page_num + 1)}>{page_num + 1}</PaginationLink>
                        ) : null
                    }

                    {
                        total_page - page_num > 3 ? (
                            <PaginationItem>
                                <PaginationEllipsis />
                            </PaginationItem>
                        ) : null

                    }
                    {
                        total_page - page_num > 3 ? (
                            <PaginationLink size='xs' href={reviewHref(total_page)}>{total_page}</PaginationLink>
                        ) : null

                    }
                    {
                        page_num < total_page ? (
                            <PaginationNext href={reviewHref(page_num + 1)} />
                        ) : null
                    }
                </PaginationContent>
            </Pagination>

        )
    }
