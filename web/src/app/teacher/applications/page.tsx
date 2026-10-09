"use client";

import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Pager from "@/components/common/Pager";
import Row from "@/components/common/Row";
import ProgressBar from "@/components/workspace/ProgressBar";
import QueryState from "@/components/workspace/QueryState";
import StageBadge from "@/components/workspace/StageBadge";
import ApiController from "@/networking";
import { queryClient } from "@/queryClient";
import type { MyApplication } from "@/networking/types";

/**
 * "Every application and the stage it has reached — set by the school, not guessed
 * at."
 *
 * This screen is the product's answer to the "koi update?" phone call, so it leads
 * with the stage and the demo-class date rather than with the vacancy.
 */
export default function TeacherApplications() {
  const [page, setPage] = useState(1);
  const applications = useQuery({
    queryKey: ["teacher", "applications", { page }],
    queryFn: () => ApiController.getMyApplications({ page }),
  });

  return (
    <QueryState
      isLoading={applications.isLoading}
      error={applications.error}
      isEmpty={(applications.data?.results ?? []).length === 0}
      emptyTitle="You have not applied for anything yet"
      emptyHint="Vacancies you qualify for are on the Vacancies tab. Applying takes one tap — your CV and certificates go with it."
      action={<Link href="/teacher/vacancies" className="btn btn-accent">See matching vacancies</Link>}
    >
      <Column className="gap-3">
        {(applications.data?.results ?? []).map((row) => (
          <ApplicationRow key={row.id} row={row} />
        ))}
        <Pager page={page} count={applications.data?.count ?? 0} onChange={setPage} />
      </Column>
    </QueryState>
  );
}

function ApplicationRow({ row }: { row: MyApplication }) {
  const closed = ["joined", "rejected", "withdrawn"].includes(row.stage);

  const withdraw = useMutation({
    mutationFn: () => ApiController.withdrawApplication(row.id, "Withdrawn by the teacher"),
    onSuccess: () => {
      toast.success("Withdrawn.");
      queryClient.invalidateQueries({ queryKey: ["teacher", "applications"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "That did not work."),
  });

  return (
    <Column className="card gap-4 p-4 sm:p-5">
      <Row className="flex-wrap items-start justify-between gap-3">
        <Column className="min-w-0 gap-0.5">
          <span className="font-display text-base font-bold text-ink-1">{row.vacancy.title}</span>
          <span className="text-sm text-ink-2">
            {row.vacancy.institution} · {row.vacancy.city}
          </span>
          <span className="text-xs text-ink-3">
            Applied {new Date(row.applied_at).toLocaleDateString("en-IN", {
              day: "numeric", month: "short", year: "numeric",
            })}
          </span>
        </Column>
        <StageBadge stage={row.stage} label={row.stage_label} />
      </Row>

      {!closed ? <ProgressBar value={row.progress} /> : null}

      {row.demo_class && row.demo_class.status === "scheduled" ? (
        <Column className="gap-1 rounded-xl bg-accent-soft p-3.5">
          <Row className="items-center gap-2">
            <CalendarDaysIcon aria-hidden className="h-4 w-4 text-accent" />
            <span className="text-sm font-bold text-ink-1">
              {new Date(row.demo_class.scheduled_at).toLocaleString("en-IN", {
                weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
              })}
            </span>
          </Row>
          <p className="text-sm text-ink-2">
            {row.demo_class.topic}
            {row.demo_class.grade ? ` · ${row.demo_class.grade}` : ""}
            {` · ${row.demo_class.duration_minutes} minutes`}
            {row.demo_class.mode === "online" ? " · online" : ""}
          </p>
          {row.demo_class.venue ? <p className="text-sm text-ink-3">{row.demo_class.venue}</p> : null}
          {row.demo_class.meeting_link ? (
            <a
              href={row.demo_class.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit text-sm font-semibold text-accent hover:underline"
            >
              Join the online demo →
            </a>
          ) : null}
        </Column>
      ) : null}

      {row.offer ? (
        <Column className="gap-1 rounded-xl bg-ok-soft p-3.5">
          <span className="text-sm font-bold text-ok">You have an offer</span>
          <p className="text-sm text-ink-2">
            {row.offer.salary_lpa ? `₹${row.offer.salary_lpa} LPA` : "Details with the office"}
            {row.offer.joining_date
              ? ` · joining ${new Date(row.offer.joining_date).toLocaleDateString("en-IN", {
                  day: "numeric", month: "short",
                })}`
              : ""}
          </p>
          {row.offer.terms ? <p className="text-sm text-ink-2">{row.offer.terms}</p> : null}
        </Column>
      ) : null}

      {row.outcome_note ? (
        <p className="rounded-xl bg-surface-2 p-3.5 text-sm text-ink-2">{row.outcome_note}</p>
      ) : null}

      {!closed ? (
        <Row className="justify-end">
          <button
            type="button"
            onClick={() => withdraw.mutate()}
            disabled={withdraw.isPending}
            className="btn btn-ghost text-sm"
          >
            {withdraw.isPending ? "Withdrawing…" : "Withdraw"}
          </button>
        </Row>
      ) : null}
    </Column>
  );
}
