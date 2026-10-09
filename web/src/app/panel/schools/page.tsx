"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
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
import type { SchoolPanelResp, StaffMember } from "@/networking/types";

/**
 * "Verifying an institution before its posts go live."
 *
 * Verifying also publishes whatever the school posted while it waited — a school
 * that registered, posted three vacancies and then sat in this queue should not have
 * to go back and publish each one by hand. The count is in the answer.
 */
const TABS = [
  { value: "", label: "All" },
  { value: "pending", label: "To verify" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
];

export default function PanelSchools() {
  const search = useSearchParams();
  const params = useMemo(() => new URLSearchParams(search?.toString() ?? ""), [search]);
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const schools = useQuery({
    queryKey: ["panel", "schools", { status, query, page }],
    queryFn: () =>
      ApiController.panelSchools({ ...(status ? { status } : {}), ...(query ? { q: query } : {}), page }),
  });
  const detail = useQuery({
    queryKey: ["panel", "school", openId],
    queryFn: () => ApiController.panelSchool(openId as string),
    enabled: Boolean(openId),
  });
  const staff = useQuery({
    queryKey: ["panel", "staff"],
    queryFn: ApiController.getStaff,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <>
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

      <input
        value={query}
        onChange={(event) => { setQuery(event.target.value); setPage(1); }}
        placeholder="Search a name, a city or a contact"
        aria-label="Search institutions"
        className="field max-w-sm"
      />

      <QueryState
        isLoading={schools.isLoading}
        error={schools.error}
        isEmpty={(schools.data?.results ?? []).length === 0}
        emptyTitle="No institutions here"
        emptyHint="Institutions appear as they register, and the office verifies them before their posts go live."
      >
        <Column className="gap-2.5">
          {(schools.data?.results ?? []).map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setOpenId(row.id)}
              className="card p-4 text-left transition-shadow hover:shadow-[var(--shadow-pop)]"
            >
              <Row className="flex-wrap items-start justify-between gap-3">
                <Column className="min-w-0 gap-0.5">
                  <span className="truncate font-semibold text-ink-1">{row.name}</span>
                  <span className="truncate text-sm text-ink-2">
                    {row.type_label} · {row.city}
                    {row.board_label ? ` · ${row.board_label}` : ""}
                  </span>
                  <span className="truncate text-xs text-ink-3">
                    {row.contact_person || "no contact person"} · {row.login_phone} ·{" "}
                    {row.live_vacancies} live of {row.vacancies_count}
                  </span>
                </Column>
                <Column className="items-end gap-1.5">
                  <span
                    className={cn(
                      "chip",
                      row.status === "verified" ? "chip-ok"
                        : row.status === "rejected" ? "chip-bad" : "chip-warn",
                    )}
                  >
                    {row.status}
                  </span>
                  {row.outstanding.length ? (
                    <span className="chip chip-warn">{row.outstanding.length} outstanding</span>
                  ) : null}
                </Column>
              </Row>
            </button>
          ))}
          <Pager page={page} count={schools.data?.count ?? 0} onChange={setPage} />
        </Column>
      </QueryState>

      {openId && detail.data ? (
        <SchoolDrawer school={detail.data} staff={staff.data ?? []} onClose={() => setOpenId(null)} />
      ) : null}
    </>
  );
}

function SchoolDrawer({
  school, staff, onClose,
}: {
  school: SchoolPanelResp;
  staff: StaffMember[];
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState(school.internal_note);

  const verify = useMutation({
    mutationFn: (status: string) => ApiController.panelVerifySchool(school.id, status, reason),
    onSuccess: (updated, status) => {
      toast.success(
        status === "verified"
          ? "Verified. Anything they had waiting is now live."
          : "Saved. They have been told.",
      );
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["panel"] });
      void updated;
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "That did not work."),
  });

  const update = useMutation({
    mutationFn: (body: { internal_note?: string; consultant?: string | null }) =>
      ApiController.panelUpdateSchool(school.id, body),
    onSuccess: () => {
      toast.success("Saved.");
      queryClient.invalidateQueries({ queryKey: ["panel"] });
    },
  });

  return (
    <Drawer
      title={school.name}
      onClose={onClose}
      subtitle={
        <>
          <p className="text-sm text-ink-2">
            {school.type_label} · {school.city}
            {school.board_label ? ` · ${school.board_label}` : ""}
          </p>
          <p className="text-sm text-ink-3">
            {school.contact_person}
            {school.designation ? `, ${school.designation}` : ""} · {school.login_phone}
          </p>
          {school.office_phone ? <p className="text-sm text-ink-3">Office: {school.office_phone}</p> : null}
        </>
      }
    >
      {school.about ? <p className="text-sm leading-relaxed text-ink-2">{school.about}</p> : null}

      <Row className="flex-wrap gap-2">
        <span className="chip">{school.live_vacancies} live</span>
        <span className="chip">{school.vacancies_count} posted in all</span>
        {school.established_year ? <span className="chip">Est. {school.established_year}</span> : null}
        {school.student_count ? <span className="chip">{school.student_count} students</span> : null}
      </Row>

      <Column className="gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-ink-3">Affiliation certificate</span>
        {school.affiliation_certificate ? (
          <a
            href={school.affiliation_certificate}
            target="_blank"
            rel="noopener noreferrer"
            className="w-fit text-sm font-semibold text-accent hover:underline"
          >
            Open it
          </a>
        ) : (
          <span className="text-sm text-warn">Not uploaded — ask them for it before verifying.</span>
        )}
        {school.outstanding.length ? (
          <span className="text-sm text-ink-3">Outstanding: {school.outstanding.join(", ")}</span>
        ) : null}
      </Column>

      <Column className="gap-3 border-t border-line pt-4">
        <Field label="A reason, if you are not verifying them" hint="The institution is shown this.">
          <input value={reason} onChange={(event) => setReason(event.target.value)} className="field" />
        </Field>
        <Row className="flex-wrap gap-2">
          <button
            type="button"
            onClick={() => verify.mutate("verified")}
            disabled={verify.isPending || school.status === "verified"}
            className="btn btn-accent text-sm"
          >
            {verify.isPending ? "Saving…" : "Verify, and publish what is waiting"}
          </button>
          <button
            type="button"
            onClick={() => verify.mutate("rejected")}
            disabled={verify.isPending || !reason.trim()}
            title="A reason is required — the institution is shown it"
            className="btn btn-ghost text-sm"
          >
            Not yet
          </button>
        </Row>

        <Field label="Account manager">
          <select
            value={school.consultant ?? ""}
            onChange={(event) => update.mutate({ consultant: event.target.value || null })}
            className="field"
          >
            <option value="">Unassigned</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
        </Field>

        <Field label="The office's note" hint="Never shown to the institution.">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className="field resize-y"
          />
        </Field>
        <Row className="justify-between">
          <Link href={`/panel/vacancies?q=${encodeURIComponent(school.name)}`} className="btn btn-outline text-sm">
            Their vacancies
          </Link>
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
