"use client";

import { CheckCircleIcon, ClockIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Drawer from "@/components/common/Drawer";
import Field from "@/components/common/Field";
import Pager from "@/components/common/Pager";
import Row from "@/components/common/Row";
import QueryState from "@/components/workspace/QueryState";
import { cn } from "@/lib/cn";
import ApiController from "@/networking";
import { queryClient } from "@/queryClient";
import type { TeacherPanelResp } from "@/networking/types";

/**
 * "A teacher's documents ticked off one by one, with who verified them."
 *
 * Verifying is one click per document and it records who did it — the signature is
 * what makes the firm's promise to schools answerable. A rejection requires a
 * reason, because the teacher is shown it and a rejection they cannot act on is a
 * phone call.
 */
const TABS = [
  { value: "", label: "All" },
  { value: "pending", label: "To verify" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
];

export default function PanelTeachers() {
  const search = useSearchParams();
  const params = useMemo(() => new URLSearchParams(search?.toString() ?? ""), [search]);
  const [verification, setVerification] = useState(params.get("verification") ?? "");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const teachers = useQuery({
    queryKey: ["panel", "teachers", { verification, query, page }],
    queryFn: () =>
      ApiController.panelTeachers({
        ...(verification ? { verification } : {}),
        ...(query ? { q: query } : {}),
        page,
      }),
  });

  const detail = useQuery({
    queryKey: ["panel", "teacher", openId],
    queryFn: () => ApiController.panelTeacher(openId as string),
    enabled: Boolean(openId),
  });

  return (
    <>
      <Row className="flex-wrap gap-1.5 rounded-xl bg-surface-2 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => { setVerification(tab.value); setPage(1); }}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors",
              verification === tab.value ? "bg-surface text-ink-1 shadow-[var(--shadow-card)]" : "text-ink-3",
            )}
          >
            {tab.label}
          </button>
        ))}
      </Row>

      <input
        value={query}
        onChange={(event) => { setQuery(event.target.value); setPage(1); }}
        placeholder="Search a name, a number or a subject"
        aria-label="Search teachers"
        className="field max-w-sm"
      />

      <QueryState
        isLoading={teachers.isLoading}
        error={teachers.error}
        isEmpty={(teachers.data?.results ?? []).length === 0}
        emptyTitle="No teachers here"
        emptyHint="Teachers appear as they register on the website or in the app."
      >
        <Column className="gap-2.5">
          {(teachers.data?.results ?? []).map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setOpenId(row.id)}
              className="card p-4 text-left transition-shadow hover:shadow-[var(--shadow-pop)]"
            >
              <Row className="flex-wrap items-start justify-between gap-3">
                <Column className="min-w-0 gap-0.5">
                  <span className="truncate font-semibold text-ink-1">
                    {row.name || "Unnamed"}
                    <span className="pl-2 text-sm font-normal text-ink-3">{row.phone}</span>
                  </span>
                  <span className="truncate text-sm text-ink-2">
                    {row.post_label}
                    {row.subjects.length ? ` · ${row.subjects.join(", ")}` : ""}
                    {` · ${row.city} · ${row.experience_label}`}
                  </span>
                  <span className="truncate text-xs text-ink-3">
                    {row.applications_count} applications · {row.placed_count} placed · profile{" "}
                    {row.completeness}%
                  </span>
                </Column>
                <Column className="items-end gap-1.5">
                  <span
                    className={cn(
                      "chip",
                      row.verification === "verified" ? "chip-ok"
                        : row.verification === "rejected" ? "chip-bad" : "chip-warn",
                    )}
                  >
                    {row.verification}
                  </span>
                  {row.documents.some((document) => document.status === "pending") ? (
                    <span className="chip chip-warn">
                      {row.documents.filter((document) => document.status === "pending").length} to check
                    </span>
                  ) : null}
                </Column>
              </Row>
            </button>
          ))}
          <Pager page={page} count={teachers.data?.count ?? 0} onChange={setPage} />
        </Column>
      </QueryState>

      {openId && detail.data ? (
        <TeacherDrawer teacher={detail.data} onClose={() => setOpenId(null)} />
      ) : null}
    </>
  );
}

function TeacherDrawer({ teacher, onClose }: { teacher: TeacherPanelResp; onClose: () => void }) {
  const [note, setNote] = useState(teacher.internal_note);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const verifyDocument = useMutation({
    mutationFn: (args: { id: string; status: string; note: string }) =>
      ApiController.panelVerifyDocument(teacher.id, args.id, args.status, args.note),
    onSuccess: () => {
      toast.success("Saved. The teacher has been told.");
      queryClient.invalidateQueries({ queryKey: ["panel"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "That did not work."),
  });

  const update = useMutation({
    mutationFn: (body: { verification?: string; police_verified?: boolean; internal_note?: string }) =>
      ApiController.panelUpdateTeacher(teacher.id, body),
    onSuccess: () => {
      toast.success("Saved.");
      queryClient.invalidateQueries({ queryKey: ["panel"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "That did not work."),
  });

  return (
    <Drawer
      title={teacher.name || "Unnamed"}
      onClose={onClose}
      subtitle={
        <>
          <p className="text-sm text-ink-2">
            {teacher.phone}
            {teacher.email ? ` · ${teacher.email}` : ""}
          </p>
          <p className="text-sm text-ink-3">
            {teacher.post_label} · {teacher.city} · {teacher.experience_label}
          </p>
        </>
      }
    >
      {teacher.headline ? <p className="text-[15px] font-semibold text-ink-1">{teacher.headline}</p> : null}
      {teacher.about ? <p className="text-sm leading-relaxed text-ink-2">{teacher.about}</p> : null}

      <Row className="flex-wrap gap-2">
        {teacher.qualifications.map((code) => (
          <span key={code} className="chip">{code}</span>
        ))}
      </Row>

      <Column className="gap-3">
        <span className="text-xs font-bold uppercase tracking-wide text-ink-3">
          Documents — tick them off
        </span>
        {teacher.documents.length ? (
          teacher.documents.map((document) => (
            <Column key={document.id} className="gap-2 rounded-xl border border-line p-3">
              <Row className="flex-wrap items-center justify-between gap-2">
                <Row className="items-center gap-2">
                  {document.status === "verified" ? (
                    <CheckCircleIcon aria-hidden className="h-4 w-4 text-ok" />
                  ) : document.status === "rejected" ? (
                    <XCircleIcon aria-hidden className="h-4 w-4 text-bad" />
                  ) : (
                    <ClockIcon aria-hidden className="h-4 w-4 text-ink-3" />
                  )}
                  <span className="text-sm font-semibold text-ink-1">{document.kind_label}</span>
                </Row>
                {document.file ? (
                  <a
                    href={document.file}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-accent hover:underline"
                  >
                    Open it
                  </a>
                ) : null}
              </Row>
              {document.verified_by_name ? (
                <span className="text-xs text-ink-3">
                  {document.status_label} by {document.verified_by_name}
                  {document.verified_at
                    ? ` on ${new Date(document.verified_at).toLocaleDateString("en-IN", {
                        day: "numeric", month: "short",
                      })}`
                    : ""}
                </span>
              ) : null}
              {document.note ? <span className="text-xs text-bad">{document.note}</span> : null}
              <Row className="flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => verifyDocument.mutate({ id: document.id, status: "verified", note: "" })}
                  disabled={verifyDocument.isPending || document.status === "verified"}
                  className="btn btn-outline text-sm"
                >
                  Verified
                </button>
                <input
                  value={reasons[document.id] ?? ""}
                  onChange={(event) => setReasons({ ...reasons, [document.id]: event.target.value })}
                  placeholder="Why not?"
                  aria-label={`Reason for rejecting ${document.kind_label}`}
                  className="field flex-1 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    verifyDocument.mutate({
                      id: document.id,
                      status: "rejected",
                      note: reasons[document.id] ?? "",
                    })
                  }
                  disabled={verifyDocument.isPending || !(reasons[document.id] ?? "").trim()}
                  title="A reason is required — the teacher is shown it"
                  className="btn btn-ghost text-sm"
                >
                  Reject
                </button>
              </Row>
            </Column>
          ))
        ) : (
          <p className="text-sm text-ink-3">Nothing uploaded yet.</p>
        )}
      </Column>

      {teacher.experience.length ? (
        <Column className="gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-3">Where they have taught</span>
          {teacher.experience.map((entry) => (
            <span key={entry.id} className="text-sm text-ink-2">
              {entry.institution}
              {entry.subject ? ` — ${entry.subject}` : ""}
              {entry.city ? `, ${entry.city}` : ""}
              {entry.is_current ? " (current)" : ""}
            </span>
          ))}
        </Column>
      ) : null}

      <Column className="gap-3 border-t border-line pt-4">
        <Field label="Overall verification">
          <select
            value={teacher.verification}
            onChange={(event) => update.mutate({ verification: event.target.value })}
            className="field"
          >
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </Field>
        <label className="flex items-center gap-2.5 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={teacher.police_verified}
            onChange={(event) => update.mutate({ police_verified: event.target.checked })}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Police verification done
        </label>
        <Field label="The office's note" hint="Never shown to the teacher or to a school.">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className="field resize-y"
          />
        </Field>
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
      </Column>
    </Drawer>
  );
}
