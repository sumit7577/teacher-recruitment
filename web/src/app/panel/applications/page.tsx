"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import Column from "@/components/common/Column";
import Field from "@/components/common/Field";
import Pager from "@/components/common/Pager";
import Row from "@/components/common/Row";
import ApplicantPanel, { type StageAction } from "@/components/workspace/ApplicantPanel";
import QueryState from "@/components/workspace/QueryState";
import StageBadge from "@/components/workspace/StageBadge";
import { cn } from "@/lib/cn";
import ApiController from "@/networking";
import { queryClient } from "@/queryClient";

/**
 * Every application, and the office may set any stage — including `joined`, which a
 * school cannot. That is the placement the firm invoices for.
 */
const STAGES: StageAction[] = [
  { stage: "screening", label: "Checking documents" },
  { stage: "shortlisted", label: "Shortlist", variant: "accent" },
  { stage: "interview", label: "Interview" },
  { stage: "joined", label: "Joined", variant: "deep" },
  { stage: "rejected", label: "Not selected", variant: "ghost" },
];

const TABS = [
  { value: "", label: "All" },
  { value: "applied", label: "New" },
  { value: "open", label: "In progress" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "demo_scheduled", label: "Demo booked" },
  { value: "joined", label: "Placed" },
];

export default function PanelApplications() {
  const search = useSearchParams();
  const params = useMemo(() => new URLSearchParams(search?.toString() ?? ""), [search]);
  const [stage, setStage] = useState(params.get("stage") ?? "");
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(params.get("open"));
  const vacancy = params.get("vacancy") ?? "";

  const applications = useQuery({
    queryKey: ["panel", "applications", { stage, query, mine, page, vacancy }],
    queryFn: () =>
      ApiController.panelApplications({
        ...(stage ? { stage } : {}),
        ...(query ? { q: query } : {}),
        ...(mine ? { mine: "1" } : {}),
        ...(vacancy ? { vacancy } : {}),
        page,
      }),
  });

  const detail = useQuery({
    queryKey: ["panel", "application", openId],
    queryFn: () => ApiController.panelApplication(openId as string),
    enabled: Boolean(openId),
  });

  const staff = useQuery({
    queryKey: ["panel", "staff"],
    queryFn: ApiController.getStaff,
    staleTime: 5 * 60 * 1000,
  });

  const demos = useQuery({
    queryKey: ["panel", "demos"],
    queryFn: () => ApiController.panelDemoCalendar(),
  });

  return (
    <>
      <Row className="flex-wrap gap-1.5 rounded-xl bg-surface-2 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => { setStage(tab.value); setPage(1); }}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors",
              stage === tab.value ? "bg-surface text-ink-1 shadow-[var(--shadow-card)]" : "text-ink-3",
            )}
          >
            {tab.label}
          </button>
        ))}
      </Row>

      <Row className="flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setPage(1); }}
          placeholder="Search a teacher, a post or a subject"
          aria-label="Search applications"
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

      {demos.data?.length ? (
        <Column className="card gap-2 p-4">
          <h2 className="font-display text-sm font-bold text-ink-1">Demo classes, next seven days</h2>
          <Row className="flex-wrap gap-2">
            {demos.data.map((demo) => (
              <span key={demo.id} className="chip chip-accent">
                {new Date(demo.scheduled_at).toLocaleString("en-IN", {
                  day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
                })}
                {" · "}
                {demo.teacher_name || "teacher"}
              </span>
            ))}
          </Row>
        </Column>
      ) : null}

      <QueryState
        isLoading={applications.isLoading}
        error={applications.error}
        isEmpty={(applications.data?.results ?? []).length === 0}
        emptyTitle="Nothing here"
        emptyHint="Applications appear as teachers apply to live vacancies."
      >
        <Column className="gap-2.5">
          {(applications.data?.results ?? []).map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setOpenId(row.id)}
              className="card p-4 text-left transition-shadow hover:shadow-[var(--shadow-pop)]"
            >
              <Row className="flex-wrap items-start justify-between gap-3">
                <Column className="min-w-0 gap-0.5">
                  <span className="truncate font-semibold text-ink-1">
                    {row.teacher.name}
                    <span className="pl-2 text-sm font-normal text-ink-3">{row.teacher_phone}</span>
                  </span>
                  <span className="truncate text-sm text-ink-2">
                    {row.vacancy_title} · {row.school_name}
                  </span>
                  <span className="truncate text-xs text-ink-3">
                    {row.consultant_name || "unassigned"} · applied{" "}
                    {new Date(row.applied_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                </Column>
                <Column className="items-end gap-1.5">
                  <StageBadge stage={row.stage} label={row.stage_label} />
                  {row.documents_pending.length ? (
                    <span className="chip chip-warn">{row.documents_pending.length} to verify</span>
                  ) : (
                    <span className="chip chip-ok">Documents done</span>
                  )}
                </Column>
              </Row>
            </button>
          ))}
          <Pager page={page} count={applications.data?.count ?? 0} onChange={setPage} />
        </Column>
      </QueryState>

      {openId && detail.data ? (
        <ApplicantPanel
            applicant={detail.data}
            stages={STAGES}
            onClose={() => setOpenId(null)}
            onStage={(stageValue, note) => ApiController.panelSetStage(openId, stageValue, note)}
            onDemo={(body) => ApiController.panelBookDemo(openId, body)}
            onOffer={(body) => ApiController.panelMakeOffer(openId, body)}
            extra={
              <Column className="gap-3 rounded-xl bg-surface-2 p-3.5">
                <Field label="Assigned consultant">
                  <select
                    value={detail.data.consultant ?? ""}
                    onChange={async (event) => {
                      await ApiController.panelUpdateApplication(openId, {
                        consultant: event.target.value || null,
                      });
                      queryClient.invalidateQueries({ queryKey: ["panel"] });
                    }}
                    className="field"
                  >
                    <option value="">Unassigned</option>
                    {(staff.data ?? []).map((member) => (
                      <option key={member.id} value={member.id}>{member.name}</option>
                    ))}
                  </select>
                </Field>
                {detail.data.internal_note ? (
                  <p className="text-sm text-ink-2">{detail.data.internal_note}</p>
                ) : null}
                <Column className="gap-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-ink-3">History</span>
                  {detail.data.events.map((event) => (
                    <span key={event.id} className="text-xs text-ink-3">
                      {new Date(event.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      {" — "}
                      {event.to_label}
                      {event.by_name ? ` by ${event.by_name}` : ""}
                      {event.note ? `: ${event.note}` : ""}
                    </span>
                  ))}
                </Column>
              </Column>
            }
        />
      ) : null}
    </>
  );
}
