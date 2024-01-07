import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

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
        return (
            <Pagination className="py-1">
                <PaginationContent>
                    {
                        page_num > 1 ? (
                            <PaginationPrevious href={`/reviews/${code}/${prof}/${page_num - 1}`} />
                        ) : null
                    }
                    {
                        page_num > 3 ? (
                            <PaginationLink size='xs' href={`/reviews/${code}/${prof}`}>1</PaginationLink>
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
                            <PaginationLink size='xs' href={`/reviews/${code}/${prof}/${page_num - 1}`}>{page_num - 1}</PaginationLink>
                        ) : null
                    }

                    <PaginationLink isActive size='xs' href={`/reviews/${code}/${prof}/${page_num}`}>{page_num}</PaginationLink>

                    {
                        page_num + 1 <= total_page ? (
                            <PaginationLink size='xs' href={`/reviews/${code}/${prof}/${page_num + 1}`}>{page_num + 1}</PaginationLink>
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
                            <PaginationLink size='xs' href={`/reviews/${code}/${prof}/${total_page}`}>{total_page}</PaginationLink>
                        ) : null

                    }
                    {
                        page_num < total_page ? (
                            <PaginationNext href={`/reviews/${code}/${prof}/${page_num + 1}`} />
                        ) : null
                    }
                </PaginationContent>
            </Pagination>

        )
    }
