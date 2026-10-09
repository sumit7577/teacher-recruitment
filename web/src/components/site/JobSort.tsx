"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useTransition } from "react";

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "salary", label: "Highest salary" },
  { value: "salary_asc", label: "Lowest salary" },
];

export default function JobSort() {
  const router = useRouter();
  const search = useSearchParams();
  const [, startTransition] = useTransition();
  const params = useMemo(() => new URLSearchParams(search?.toString() ?? ""), [search]);

  return (
    <select
      value={params.get("sort") ?? "newest"}
      aria-label="Sort vacancies"
      className="field w-auto py-1.5 text-sm"
      onChange={(event) => {
        const next = new URLSearchParams(params.toString());
        next.set("sort", event.target.value);
        next.delete("page");
        startTransition(() => router.replace(`/jobs?${next}`, { scroll: false }));
      }}
    >
      {SORTS.map((sort) => (
        <option key={sort.value} value={sort.value}>
          {sort.label}
        </option>
      ))}
    </select>
  );
}
