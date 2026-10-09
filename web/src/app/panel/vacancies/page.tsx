"use client";

import { PlusIcon } from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Pager from "@/components/common/Pager";
import Row from "@/components/common/Row";
import QueryState from "@/components/workspace/QueryState";
import { cn } from "@/lib/cn";
import ApiController from "@/networking";
import { queryClient } from "@/queryClient";
import type { StaffMember, VacancyPanel } from "@/networking/types";

const TABS = [
  { value: "", label: "All" },
  { value: "open", label: "Live" },
  { value: "pending_review", label: "To review" },
  { value: "draft", label: "Drafts" },
  { value: "filled", label: "Filled" },
  { value: "closed", label: "Closed" },
];

export default function PanelVacancies() {
  const search = useSearchParams();
  const params = useMemo(() => new URLSearchParams(search?.toString() ?? ""), [search]);
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);

  const vacancies = useQuery({
    queryKey: ["panel", "vacancies", { status, query, mine, page }],
    queryFn: () =>
      ApiController.panelVacancies({
        ...(status ? { status } : {}),
        ...(query ? { q: query } : {}),
        ...(mine ? { mine: "1" as const } : {}),
        page,
      }),
  });
  const staff = useQuery({
    queryKey: ["panel", "staff"],
    queryFn: ApiController.getStaff,
    staleTime: 5 * 60 * 1000,
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
        <Link href="/panel/vacancies/new" className="btn btn-accent">
          <PlusIcon aria-hidden className="h-4 w-4" />
          Post a vacancy
        </Link>
      </Row>

      <Row className="flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setPage(1); }}
          placeholder="Search a title, subject, school or city"
          aria-label="Search vacancies"
          className="field max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={mine}
            onChange={(event) => { setMine(event.target.checked); setPage(1); }}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Only mine
        </label>
      </Row>

      <QueryState
        isLoading={vacancies.isLoading}
        error={vacancies.error}
        isEmpty={(vacancies.data?.results ?? []).length === 0}
        emptyTitle="Nothing here"
        emptyHint="Post a vacancy, or clear the filters."
      >
        <Column className="gap-3">
          {(vacancies.data?.results ?? []).map((vacancy) => (
            <VacancyRow key={vacancy.id} vacancy={vacancy} staff={staff.data ?? []} />
          ))}
          <Pager page={page} count={vacancies.data?.count ?? 0} onChange={setPage} />
        </Column>
      </QueryState>
    </>
  );
}

function VacancyRow({ vacancy, staff }: { vacancy: VacancyPanel; staff: StaffMember[] }) {
  const act = useMutation({
    mutationFn: (args: { action: "publish" | "close" | "fill" | "unpublish"; }) =>
      ApiController.panelVacancyAction(vacancy.id, args.action),
    onSuccess: (answer) => {
      // The publish answer carries how many teachers were notified — the number the
      // person who clicked it actually wants to see.
      toast.success(answer.message || "Done.");
      queryClient.invalidateQueries({ queryKey: ["panel"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "That did not work."),
  });

  const assign = useMutation({
    mutationFn: (consultant: string) =>
      ApiController.panelVacancyAction(vacancy.id, "assign", { consultant }),
    onSuccess: () => {
      toast.success("Assigned.");
      queryClient.invalidateQueries({ queryKey: ["panel"] });
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
            <Link
              href={`/panel/vacancies/${vacancy.id}`}
              className="font-display text-base font-bold text-ink-1 hover:text-accent"
            >
              {vacancy.title}
            </Link>
            <span className={cn("chip", live ? "chip-ok" : vacancy.status === "draft" ? "chip-warn" : undefined)}>
              {live ? "Live" : vacancy.status_label}
            </span>
            {vacancy.source === "school" ? <span className="chip">Posted by the institution</span> : null}
            {vacancy.school_status && vacancy.school_status !== "verified" ? (
              <span className="chip chip-warn">Institution {vacancy.school_status}</span>
            ) : null}
          </Row>
          <span className="text-sm text-ink-2">
            {vacancy.institution} · {vacancy.post_label} · {vacancy.city}
          </span>
          <span className="text-sm font-semibold text-accent">{vacancy.salary}</span>
        </Column>
        <Column className="items-end gap-0.5">
          <span className="font-display text-xl font-extrabold text-ink-1">{vacancy.applications_count}</span>
          <span className="text-xs text-ink-3">
            {vacancy.new_applications > 0 ? `${vacancy.new_applications} new` : "applicants"}
          </span>
        </Column>
      </Row>

      <Row className="flex-wrap items-center gap-2 border-t border-line pt-3">
        <Link href={`/panel/applications?vacancy=${vacancy.id}`} className="btn btn-outline text-sm">
          Applicants
        </Link>
        <Link href={`/panel/vacancies/${vacancy.id}`} className="btn btn-ghost text-sm">
          Edit
        </Link>
        {live ? (
          <>
            <button type="button" onClick={() => act.mutate({ action: "unpublish" })} disabled={act.isPending} className="btn btn-ghost text-sm">
              Take off the board
            </button>
            <button type="button" onClick={() => act.mutate({ action: "fill" })} disabled={act.isPending} className="btn btn-ghost text-sm">
              Filled
            </button>
          </>
        ) : vacancy.status !== "closed" && vacancy.status !== "filled" ? (
          <button
            type="button"
            onClick={() => act.mutate({ action: "publish" })}
            disabled={act.isPending}
            className="btn btn-accent text-sm"
            title="Publishing also notifies every matching teacher"
          >
            {act.isPending ? "Publishing…" : "Publish and notify"}
          </button>
        ) : null}

        <select
          value={vacancy.consultant ?? ""}
          onChange={(event) => assign.mutate(event.target.value)}
          aria-label={`Consultant for ${vacancy.title}`}
          className="field ml-auto w-auto py-1.5 text-sm"
        >
          <option value="">Unassigned</option>
          {staff.map((member) => (
            <option key={member.id} value={member.id}>{member.name}</option>
          ))}
        </select>
      </Row>
    </Column>
  );
}
