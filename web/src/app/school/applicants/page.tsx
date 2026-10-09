"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import Column from "@/components/common/Column";
import Pager from "@/components/common/Pager";
import Row from "@/components/common/Row";
import ApplicantPanel, { type StageAction } from "@/components/workspace/ApplicantPanel";
import QueryState from "@/components/workspace/QueryState";
import StageBadge from "@/components/workspace/StageBadge";
import { cn } from "@/lib/cn";
import ApiController from "@/networking";

/**
 * The school's applicants, with the panel opening over the list.
 *
 * A school may shortlist, reject, book the demo and make an offer. It may NOT mark
 * someone as joined — that is the placement the firm invoices for, and a school that
 * could mark it itself could also quietly not mark it. The backend refuses either
 * way; this simply does not offer the button.
 */
const STAGES: StageAction[] = [
  { stage: "screening", label: "Checking documents" },
  { stage: "shortlisted", label: "Shortlist", variant: "accent" },
  { stage: "interview", label: "Interview" },
  { stage: "rejected", label: "Not selected", variant: "ghost" },
];

const TABS = [
  { value: "", label: "All" },
  { value: "applied", label: "New" },
  { value: "open", label: "In progress" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "joined", label: "Placed" },
];

export default function SchoolApplicants() {
  const router = useRouter();
  const search = useSearchParams();
  const params = useMemo(() => new URLSearchParams(search?.toString() ?? ""), [search]);
  const [stage, setStage] = useState(params.get("stage") ?? "");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(params.get("open"));

  const vacancy = params.get("vacancy") ?? "";

  const applicants = useQuery({
    queryKey: ["school", "applicants", { stage, page, vacancy }],
    queryFn: () =>
      ApiController.getApplicants({ ...(stage ? { stage } : {}), ...(vacancy ? { vacancy } : {}), page }),
  });

  const detail = useQuery({
    queryKey: ["school", "applicant", openId],
    queryFn: () => ApiController.getApplicant(openId as string),
    enabled: Boolean(openId),
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

      {vacancy ? (
        <Row className="items-center gap-2">
          <span className="chip chip-accent">Filtered to one vacancy</span>
          <button
            type="button"
            onClick={() => router.replace("/school/applicants")}
            className="text-xs font-semibold text-ink-3 underline hover:text-ink-1"
          >
            Show all
          </button>
        </Row>
      ) : null}

      <QueryState
        isLoading={applicants.isLoading}
        error={applicants.error}
        isEmpty={(applicants.data?.results ?? []).length === 0}
        emptyTitle="No applicants yet"
        emptyHint="Teachers see your live posts the moment they are published, and matching ones get a notification."
      >
        <Column className="gap-2.5">
          {(applicants.data?.results ?? []).map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setOpenId(row.id)}
              className="card p-4 text-left transition-shadow hover:shadow-[var(--shadow-pop)]"
            >
              <Row className="flex-wrap items-start justify-between gap-3">
                <Column className="min-w-0 gap-0.5">
                  <span className="truncate font-semibold text-ink-1">{row.teacher.name}</span>
                  <span className="truncate text-sm text-ink-2">
                    {row.teacher.post_label}
                    {row.teacher.subjects.length ? ` · ${row.teacher.subjects.join(", ")}` : ""}
                    {` · ${row.teacher.experience_label}`}
                  </span>
                  <span className="truncate text-xs text-ink-3">
                    for {row.vacancy_title} · applied{" "}
                    {new Date(row.applied_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                </Column>
                <Column className="items-end gap-1.5">
                  <StageBadge stage={row.stage} label={row.stage_label} />
                  {row.documents_pending.length === 0 ? (
                    <span className="chip chip-ok">Documents verified</span>
                  ) : (
                    <span className="chip chip-warn">{row.documents_pending.length} pending</span>
                  )}
                </Column>
              </Row>
            </button>
          ))}
          <Pager page={page} count={applicants.data?.count ?? 0} onChange={setPage} />
        </Column>
      </QueryState>

      {openId && detail.data ? (
        <ApplicantPanel
            applicant={detail.data}
            stages={STAGES}
            onClose={() => setOpenId(null)}
            onStage={(stageValue, note) => ApiController.setApplicantStage(openId, stageValue, note)}
            onDemo={(body) => ApiController.bookDemoClass(openId, body)}
            onOffer={(body) => ApiController.makeOffer(openId, body)}
            extra={
              <p className="rounded-xl bg-surface-2 p-3.5 text-xs text-ink-3">
                Placements are confirmed by the office. Make the offer here and we will
                record the joining.
              </p>
            }
        />
      ) : null}
    </>
  );
}
