"use client";

import { XMarkIcon } from "@heroicons/react/24/outline";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import { cn } from "@/lib/cn";
import type { VacancyFacets } from "@/networking/types";

/**
 * The board's filters. "Filtering happens instantly, with no page reload."
 *
 * State lives in the URL rather than in this component, which buys three things a
 * `useState` version cannot: a filtered board is a shareable link (and most
 * teachers arrive from a WhatsApp link), the Back button works, and the results
 * are server-rendered so Google indexes them.
 *
 * `router.replace` + `useTransition` is what keeps it feeling instant — Next does
 * a soft navigation, re-rendering only the server part while this panel stays
 * mounted, and `isPending` dims the results instead of blanking them. `replace`
 * rather than `push` so ten filter clicks do not leave ten history entries
 * between the teacher and the page they came from.
 */
export default function JobFilters({ facets }: { facets: VacancyFacets | null }) {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  // useSearchParams can be null — a copy, so every read below is non-null and a
  // missing query string simply means "no filters applied".
  const params = useMemo(() => new URLSearchParams(search?.toString() ?? ""), [search]);

  const set = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      // Any filter change invalidates the page number — staying on page 3 of a
      // narrower result set shows an empty board, which reads as "no vacancies".
      next.delete("page");
      startTransition(() => router.replace(`/jobs${next.toString() ? `?${next}` : ""}`, { scroll: false }));
    },
    [params, router],
  );

  const active = ["city", "post", "institution_type", "board", "experience", "q", "subject"].filter(
    (key) => params.get(key),
  );

  if (!facets) return null;

  return (
    <Column className={cn("gap-5", pending && "opacity-70")}>
      {active.length ? (
        <Row className="flex-wrap items-center gap-2">
          {active.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => set(key, "")}
              className="chip chip-accent inline-flex items-center hover:opacity-80"
            >
              {params.get(key)}
              <XMarkIcon aria-hidden className="h-3.5 w-3.5" />
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              startTransition(() => router.replace("/jobs", { scroll: false }))
            }
            className="text-xs font-semibold text-ink-3 underline hover:text-ink-1"
          >
            Clear all
          </button>
        </Row>
      ) : null}

      <Group label="City">
        <Select
          value={params.get("city") ?? ""}
          onChange={(value) => set("city", value)}
          placeholder="Any city"
          options={facets.city.map((entry) => ({
            value: entry.value,
            label: `${entry.value} (${entry.count})`,
          }))}
        />
      </Group>

      <Group label="Post">
        <Column className="gap-1">
          {facets.taxonomy.posts.map((post) => {
            const tally = facets.post.find((entry) => entry.value === post.value)?.count ?? 0;
            const selected = params.get("post") === post.value;
            return (
              <button
                key={post.value}
                type="button"
                onClick={() => set("post", selected ? "" : post.value)}
                className={cn(
                  "flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                  selected ? "bg-accent-soft font-semibold text-accent" : "text-ink-2 hover:bg-surface-2",
                  !tally && !selected && "opacity-45",
                )}
              >
                <span className="truncate">{post.label}</span>
                <span className="shrink-0 pl-2 text-xs text-ink-3">{tally || "—"}</span>
              </button>
            );
          })}
        </Column>
      </Group>

      <Group label="Institution">
        <Select
          value={params.get("institution_type") ?? ""}
          onChange={(value) => set("institution_type", value)}
          placeholder="Any institution"
          options={facets.taxonomy.institutions.map((entry) => ({
            value: entry.value,
            label: entry.label,
          }))}
        />
      </Group>

      <Group label="Board">
        <Select
          value={params.get("board") ?? ""}
          onChange={(value) => set("board", value)}
          placeholder="Any board"
          options={facets.taxonomy.boards.map((entry) => ({ value: entry.value, label: entry.label }))}
        />
      </Group>

      <Group label="Experience">
        <Select
          value={params.get("experience") ?? ""}
          onChange={(value) => set("experience", value)}
          placeholder="Any experience"
          options={facets.taxonomy.experience.map((entry) => ({
            value: entry.value,
            label: entry.label,
          }))}
        />
      </Group>

      <Group label="Qualification">
        <Select
          value={params.get("qualification") ?? ""}
          onChange={(value) => set("qualification", value)}
          placeholder="Any qualification"
          options={facets.taxonomy.qualifications.map((entry) => ({
            value: entry.value,
            label: entry.label,
          }))}
        />
      </Group>
    </Column>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Column className="gap-2">
      <span className="text-xs font-bold uppercase tracking-wide text-ink-3">{label}</span>
      {children}
    </Column>
  );
}

function Select({
  value, onChange, placeholder, options,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={placeholder}
      className="field"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
