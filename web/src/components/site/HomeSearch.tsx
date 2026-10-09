"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useState } from "react";

import Row from "@/components/common/Row";
import type { Facet } from "@/networking/types";

/**
 * The hero search. "The search finds a real vacancy and takes you to it."
 *
 * Cities come from the live board rather than a hard-coded list, so the dropdown
 * never offers a city with nothing in it — and the count next to each tells a
 * teacher where the work actually is.
 */
export default function HomeSearch({ cities }: { cities: Facet[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (city) params.set("city", city);
    router.push(`/jobs${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center">
      <Row className="min-w-0 flex-1 items-center gap-2 px-2">
        <MagnifyingGlassIcon aria-hidden className="h-5 w-5 shrink-0 text-ink-3" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Subject or post — Physics, PGT, Vice Principal"
          aria-label="Subject or post"
          className="w-full bg-transparent py-2 text-[15px] text-ink-1 outline-none placeholder:text-ink-3"
        />
      </Row>
      <select
        value={city}
        onChange={(event) => setCity(event.target.value)}
        aria-label="City"
        className="field w-full border-line sm:w-44"
      >
        <option value="">Any city</option>
        {cities.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.value} ({entry.count})
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-accent w-full sm:w-auto">
        Find vacancies
      </button>
    </form>
  );
}
