"use client";

import { PlusIcon } from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Pager from "@/components/common/Pager";
import Row from "@/components/common/Row";
import QueryState from "@/components/workspace/QueryState";
import { cn } from "@/lib/cn";
import ApiController from "@/networking";
import { queryClient } from "@/queryClient";
import type { VacancyPanel } from "@/networking/types";

const TABS = [
  { value: "", label: "All" },
  { value: "open", label: "Live" },
  { value: "draft", label: "Drafts" },
  { value: "filled", label: "Filled" },
  { value: "closed", label: "Closed" },
];

export default function SchoolVacancies() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const vacancies = useQuery({
    queryKey: ["school", "vacancies", { status, page }],
    queryFn: () => ApiController.getSchoolVacancies({ ...(status ? { status } : {}), page }),
  });

  return (
    <>
      <Row className="flex-wrap items-center justify-between gap-3">
        <Row className="flex-wrap gap-1.5 rounded-xl bg-surface-2 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => { setStatus(tab.value); setPage(1); }}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors",
                status === tab.value ? "bg-surface text-ink-1 shadow-[var(--shadow-card)]" : "text-ink-3",
              )}
            >
              {tab.label}
            </button>
          ))}
        </Row>
        <Link href="/school/vacancies/new" className="btn btn-accent">
          <PlusIcon aria-hidden className="h-4 w-4" />
          Post a vacancy
        </Link>
      </Row>

      <QueryState
        isLoading={vacancies.isLoading}
        error={vacancies.error}
        isEmpty={(vacancies.data?.results ?? []).length === 0}
        emptyTitle={status ? "Nothing here" : "You have not posted a vacancy yet"}
        emptyHint="A post goes on the board and into the app, and matching teachers get a notification."
        action={<Link href="/school/vacancies/new" className="btn btn-accent">Post a vacancy</Link>}
      >
        <Column className="gap-3">
          {(vacancies.data?.results ?? []).map((vacancy) => (
            <VacancyRow key={vacancy.id} vacancy={vacancy} />
          ))}
          <Pager page={page} count={vacancies.data?.count ?? 0} onChange={setPage} />
        </Column>
      </QueryState>
    </>
  );
}

function VacancyRow({ vacancy }: { vacancy: VacancyPanel }) {
  const act = useMutation({
    mutationFn: (action: "publish" | "close" | "fill" | "unpublish") =>
      ApiController.schoolVacancyAction(vacancy.id, action),
    onSuccess: (answer) => {
      toast.success(answer.message || "Done.");
      queryClient.invalidateQueries({ queryKey: ["school"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "That did not work."),
  });

  const live = Boolean(vacancy.published_at) && ["live", "shortlisting"].includes(vacancy.status);

  return (
    <Column className="card gap-3 p-4 sm:p-5">
      <Row className="flex-wrap items-start justify-between gap-3">
        <Column className="min-w-0 gap-0.5">
          <Row className="flex-wrap items-center gap-2">
            <span className="font-display text-base font-bold text-ink-1">{vacancy.title}</span>
            <span className={cn("chip", live ? "chip-ok" : vacancy.status === "draft" ? "chip-warn" : undefined)}>
              {live ? "Live" : vacancy.status_label}
            </span>
          </Row>
          <span className="text-sm text-ink-2">
            {vacancy.post_label} · {vacancy.city}
            {vacancy.qualification ? ` · ${vacancy.qualification}` : ""}
          </span>
          <span className="text-sm font-semibold text-accent">{vacancy.salary}</span>
        </Column>
        <Column className="items-end gap-0.5">
          <span className="font-display text-xl font-extrabold text-ink-1">
            {vacancy.applications_count}
          </span>
          <span className="text-xs text-ink-3">
            {vacancy.applications_count === 1 ? "applicant" : "applicants"}
          </span>
        </Column>
      </Row>

      <Row className="flex-wrap items-center gap-2 border-t border-line pt-3">
        <Link
          href={`/school/applicants?vacancy=${vacancy.id}`}
          className="btn btn-outline text-sm"
        >
          See applicants
        </Link>
        {live ? (
          <>
            <button
              type="button"
              onClick={() => act.mutate("unpublish")}
              disabled={act.isPending}
              className="btn btn-ghost text-sm"
            >
              Take off the board
            </button>
            <button
              type="button"
              onClick={() => act.mutate("fill")}
              disabled={act.isPending}
              className="btn btn-ghost text-sm"
            >
              Mark as filled
            </button>
          </>
        ) : vacancy.status !== "closed" && vacancy.status !== "filled" ? (
          <button
            type="button"
            onClick={() => act.mutate("publish")}
            disabled={act.isPending}
            className="btn btn-accent text-sm"
          >
            {act.isPending ? "Publishing…" : "Publish"}
          </button>
        ) : null}
      </Row>
    </Column>
  );
}
