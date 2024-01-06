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
        console.log(page_num, total_page, code, prof)
        return (
                <Pagination>
                    <PaginationContent>
                        {
                            page_num > 1 ? (
                                <PaginationItem>
                                    <PaginationPrevious href={`/reviews/${code}/${prof}/${page_num - 1}`} />
                                </PaginationItem>
                            ) : null
                        }
                        {
                            page_num > 2 ? (
                                <PaginationItem>
                                    <PaginationEllipsis />
                                </PaginationItem>
                            ) : null

                        }

                        {
                            page_num - 1 > 0 ? (
                                <PaginationItem>
                                    <PaginationLink size='xs' href={`/reviews/${code}/${prof}/${page_num - 1}`}>{page_num - 1}</PaginationLink>
                                </PaginationItem>
                            ) : null
                        }

                        <PaginationItem>
                            <PaginationLink size='xs' href={`/reviews/${code}/${prof}/${page_num}`}>{page_num}</PaginationLink>
                        </PaginationItem>

                        {
                            page_num + 1 <= total_page ? (
                                <PaginationItem>
                                    <PaginationLink size='xs' href={`/reviews/${code}/${prof}/${page_num + 1}`}>{page_num + 1}</PaginationLink>
                                </PaginationItem>
                            ) : null
                        }

                        {
                            total_page - page_num > 2 ? (
                                <PaginationItem>
                                    <PaginationEllipsis />
                                </PaginationItem>
                            ) : null

                        }
                        {
                            page_num < total_page ? (
                                <PaginationItem>
                                    <PaginationNext href={`/reviews/${code}/${prof}/${page_num + 1}`} />
                                </PaginationItem>
                            ) : null
                        }
                    </PaginationContent>
                </Pagination>

        )
    }
