"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
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
import type { EnquiryResp } from "@/networking/types";

/** The contact form's inbox. "Saved in the panel and emailed to you" — this is the
 *  saved half, and the one that survives a dead SMTP password. */
const TABS = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "converted", label: "Converted" },
  { value: "", label: "All" },
  { value: "spam", label: "Spam" },
];

export default function PanelEnquiries() {
  const search = useSearchParams();
  const params = useMemo(() => new URLSearchParams(search?.toString() ?? ""), [search]);
  const [status, setStatus] = useState(params.get("status") ?? "new");
  const [side, setSide] = useState("");
  const [page, setPage] = useState(1);

  const enquiries = useQuery({
    queryKey: ["panel", "enquiries", { status, side, page }],
    queryFn: () =>
      ApiController.panelEnquiries({ ...(status ? { status } : {}), ...(side ? { side } : {}), page }),
  });

  return (
    <>
      <Row className="flex-wrap items-center justify-between gap-3">
        <Row className="flex-wrap gap-1.5 rounded-xl bg-surface-2 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.label}
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
        <select
          value={side}
          onChange={(event) => { setSide(event.target.value); setPage(1); }}
          aria-label="Which side"
          className="field w-auto py-1.5 text-sm"
        >
          <option value="">Both sides</option>
          <option value="teacher">Teachers</option>
          <option value="institution">Institutions</option>
        </select>
      </Row>

      <QueryState
        isLoading={enquiries.isLoading}
        error={enquiries.error}
        isEmpty={(enquiries.data?.results ?? []).length === 0}
        emptyTitle="Nothing here"
        emptyHint="Enquiries from the website's contact form land here, and are emailed to the office at the same time."
      >
        <Column className="gap-2.5">
          {(enquiries.data?.results ?? []).map((row) => (
            <EnquiryRow key={row.id} enquiry={row} />
          ))}
          <Pager page={page} count={enquiries.data?.count ?? 0} onChange={setPage} />
        </Column>
      </QueryState>
    </>
  );
}

function EnquiryRow({ enquiry }: { enquiry: EnquiryResp }) {
  const [note, setNote] = useState(enquiry.internal_note);
  const [open, setOpen] = useState(false);

  const update = useMutation({
    mutationFn: (body: { status?: string; internal_note?: string }) =>
      ApiController.panelUpdateEnquiry(enquiry.id, body),
    onSuccess: () => {
      toast.success("Saved.");
      queryClient.invalidateQueries({ queryKey: ["panel", "enquiries"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "That did not work."),
  });

  return (
    <Column className="card gap-3 p-4">
      <Row className="flex-wrap items-start justify-between gap-3">
        <Column className="min-w-0 gap-0.5">
          <Row className="flex-wrap items-center gap-2">
            <span className="font-semibold text-ink-1">{enquiry.name}</span>
            <span className="chip">{enquiry.side_label}</span>
            {enquiry.status !== "new" ? <span className="chip chip-ok">{enquiry.status_label}</span> : null}
          </Row>
          <Row className="flex-wrap gap-x-3 text-sm text-ink-2">
            <a href={`tel:${enquiry.phone}`} className="font-medium text-accent hover:underline">
              {enquiry.phone}
            </a>
            {enquiry.email ? <span>{enquiry.email}</span> : null}
            {enquiry.city ? <span>{enquiry.city}</span> : null}
          </Row>
          <span className="text-xs text-ink-3">
            {enquiry.side === "teacher"
              ? [enquiry.post_label, enquiry.subject, enquiry.qualification].filter(Boolean).join(" · ")
              : [enquiry.institution_name, enquiry.vacancies_count ? `${enquiry.vacancies_count} vacancies` : ""]
                  .filter(Boolean)
                  .join(" · ")}
          </span>
          <span className="text-xs text-ink-3">
            {new Date(enquiry.created_at).toLocaleString("en-IN", {
              day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
            })}
            {enquiry.source_path ? ` · from ${enquiry.source_path}` : ""}
          </span>
        </Column>
        <Row className="items-center gap-2">
          {enquiry.cv ? (
            <a
              href={enquiry.cv}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline text-sm"
            >
              CV
            </a>
          ) : null}
          <button type="button" onClick={() => setOpen((value) => !value)} className="btn btn-ghost text-sm">
            {open ? "Close" : "Work it"}
          </button>
        </Row>
      </Row>

      {enquiry.message ? (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-ink-2">{enquiry.message}</p>
      ) : null}

      {open ? (
        <Column className="gap-3 border-t border-line pt-3">
          <Row className="flex-wrap gap-2">
            {["contacted", "converted", "closed", "spam"].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => update.mutate({ status: value })}
                disabled={update.isPending || enquiry.status === value}
                className={value === "spam" ? "btn btn-ghost text-sm" : "btn btn-outline text-sm"}
              >
                Mark {value}
              </button>
            ))}
          </Row>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder="What was said on the call"
            aria-label="Internal note"
            className="field resize-y"
          />
          <Row className="justify-end">
            <button
              type="button"
              onClick={() => update.mutate({ internal_note: note })}
              disabled={update.isPending}
              className="btn btn-outline text-sm"
            >
              Save the note
            </button>
          </Row>
          {enquiry.handled_by_name ? (
            <span className="text-xs text-ink-3">
              Last touched by {enquiry.handled_by_name}
              {enquiry.handled_at
                ? ` on ${new Date(enquiry.handled_at).toLocaleDateString("en-IN", {
                    day: "numeric", month: "short",
                  })}`
                : ""}
            </span>
          ) : null}
        </Column>
      ) : null}
    </Column>
  );
}
