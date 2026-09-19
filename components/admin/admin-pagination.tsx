"use client";

import { Button } from "@/components/ui/button";

type AdminPaginationProps = {
  page: number;
  limit: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
};

export default function AdminPagination({
  page,
  limit,
  total,
  loading = false,
  onPageChange,
}: AdminPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
      <div>
        Total {total} · Page {page} / {totalPages}
      </div>
      <div className="flex gap-2">
        <Button
          size="xs"
          variant="outline"
          disabled={loading || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={loading || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
