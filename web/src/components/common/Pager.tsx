"use client";

import Row from "./Row";

interface Props {
  page: number;
  count: number;
  pageSize?: number;
  onChange: (page: number) => void;
}

/**
 * Page controls for the DRF-paginated lists. `count` is the total row count the
 * backend sends, not the number of pages — so the arithmetic lives here rather
 * than in every list that uses it.
 */
export default function Pager({ page, count, pageSize = 10, onChange }: Props) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (pages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);

  return (
    <Row className="items-center justify-between gap-3 pt-2">
      <span className="text-sm text-ink-3">
        {from}–{to} of {count}
      </span>
      <Row className="items-center gap-2">
        <button
          type="button"
          className="btn btn-outline btn-sm px-3 py-1.5 text-sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Previous
        </button>
        <span className="text-sm text-ink-2">
          {page} / {pages}
        </span>
        <button
          type="button"
          className="btn btn-outline px-3 py-1.5 text-sm"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </button>
      </Row>
    </Row>
  );
}
