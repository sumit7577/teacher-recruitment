"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useTransition } from "react";

import Row from "@/components/common/Row";

/** URL-driven paging, so page 2 of a filtered board is also a shareable link. */
export default function JobPager({ page, count, pageSize = 10 }: { page: number; count: number; pageSize?: number }) {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  const params = useMemo(() => new URLSearchParams(search?.toString() ?? ""), [search]);

  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (pages <= 1) return null;

  function go(next: number) {
    const query = new URLSearchParams(params.toString());
    if (next <= 1) query.delete("page");
    else query.set("page", String(next));
    startTransition(() => router.replace(`/jobs${query.toString() ? `?${query}` : ""}`, { scroll: true }));
  }

  return (
    <Row className="items-center justify-between gap-3 pt-4">
      <button
        type="button"
        className="btn btn-outline"
        disabled={page <= 1 || pending}
        onClick={() => go(page - 1)}
      >
        Previous
      </button>
      <span className="text-sm text-ink-3">
        Page {page} of {pages}
      </span>
      <button
        type="button"
        className="btn btn-outline"
        disabled={page >= pages || pending}
        onClick={() => go(page + 1)}
      >
        Next
      </button>
    </Row>
  );
}
