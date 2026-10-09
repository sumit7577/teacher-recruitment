"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import Column from "@/components/common/Column";
import Pager from "@/components/common/Pager";
import Row from "@/components/common/Row";
import VacancyCard from "@/components/site/VacancyCard";
import QueryState from "@/components/workspace/QueryState";
import { cn } from "@/lib/cn";
import ApiController from "@/networking";

/**
 * "Vacancies: only posts they qualify for."
 *
 * The All tab exists because a filtered-only view is a view people assume is
 * broken: a teacher who knows there are forty vacancies and sees three concludes
 * the site is not working, not that we matched them well.
 */
export default function TeacherVacancies() {
  const [all, setAll] = useState(false);
  const [page, setPage] = useState(1);

  const vacancies = useQuery({
    // `all` is in the key — without it, switching tabs shows the other tab's
    // cached list under the new label.
    queryKey: ["teacher", "vacancies", { all, page }],
    queryFn: () => ApiController.getMatchingVacancies({ ...(all ? { all: "1" as const } : {}), page }),
  });

  return (
    <>
      <Row className="w-fit rounded-xl bg-surface-2 p-1">
        {[
          [false, "Matching me"],
          [true, "Every vacancy"],
        ].map(([value, label]) => (
          <button
            key={String(value)}
            type="button"
            onClick={() => { setAll(Boolean(value)); setPage(1); }}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              all === value ? "bg-surface text-ink-1 shadow-[var(--shadow-card)]" : "text-ink-3",
            )}
          >
            {label as string}
          </button>
        ))}
      </Row>

      <p className="text-sm text-ink-2">
        {all
          ? "Everything on the board, including posts outside your subject and city."
          : "Matched on your post, your subjects and where you said you would work."}
      </p>

      <QueryState
        isLoading={vacancies.isLoading}
        error={vacancies.error}
        isEmpty={(vacancies.data?.results ?? []).length === 0}
        emptyTitle={all ? "The board is empty just now" : "Nothing matches your profile yet"}
        emptyHint={
          all
            ? "New vacancies are added through the week. We will notify you when one opens."
            : "Try the “Every vacancy” tab, or widen the cities on your profile."
        }
      >
        <Column className="gap-3">
          {(vacancies.data?.results ?? []).map((vacancy) => (
            <VacancyCard key={vacancy.id} vacancy={vacancy} href={`/teacher/vacancies/${vacancy.id}`} />
          ))}
          <Pager page={page} count={vacancies.data?.count ?? 0} onChange={setPage} />
        </Column>
      </QueryState>
    </>
  );
}
