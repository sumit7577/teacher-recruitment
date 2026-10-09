"use client";

import { CheckCircleIcon, ClockIcon } from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Drawer from "@/components/common/Drawer";
import Field from "@/components/common/Field";
import Row from "@/components/common/Row";
import ProgressBar from "@/components/workspace/ProgressBar";
import StageBadge from "@/components/workspace/StageBadge";
import { cn } from "@/lib/cn";
import { queryClient } from "@/queryClient";
import type { ApplicantDetail, ApplicantPanel as Applicant } from "@/networking/types";

/**
 * One applicant, opened as a side panel.
 *
 * "An applicant with documents verified, the progress so far, and Make an offer at
 * the end of it."
 *
 * The actions are passed in rather than chosen here, because the school and the
 * office can do different things to the same application — a school may shortlist
 * and reject, but only the office may mark a placement, which is what the firm
 * invoices for. The backend refuses either way; this just does not offer it.
 */
export type StageAction = { stage: string; label: string; variant?: "accent" | "deep" | "outline" | "ghost" };

export default function ApplicantPanel({
  applicant, stages, onClose, onStage, onDemo, onOffer, extra,
}: {
  applicant: ApplicantDetail | Applicant;
  stages: StageAction[];
  onClose: () => void;
  onStage: (stage: string, note: string) => Promise<unknown>;
  onDemo?: (body: Record<string, unknown>) => Promise<unknown>;
  onOffer?: (body: Record<string, unknown>) => Promise<unknown>;
  extra?: React.ReactNode;
}) {
  const [note, setNote] = useState("");
  const [sheet, setSheet] = useState<"none" | "demo" | "offer">("none");

  const move = useMutation({
    mutationFn: (stage: string) => onStage(stage, note),
    onSuccess: () => {
      toast.success("Saved. The teacher has been told.");
      setNote("");
      queryClient.invalidateQueries();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "That did not work."),
  });

  const teacher = applicant.teacher;
  const docs = Object.entries(teacher.documents_verified ?? {});

  return (
    <Drawer
      title={teacher.name}
      onClose={onClose}
      subtitle={
        <>
          <p className="text-sm text-ink-2">
            {teacher.post_label}
            {teacher.subjects.length ? ` · ${teacher.subjects.join(", ")}` : ""}
          </p>
          <p className="text-sm text-ink-3">
            {teacher.city} · {teacher.experience_label}
            {teacher.highest_qualification ? ` · ${teacher.highest_qualification}` : ""}
          </p>
        </>
      }
    >
      <Row className="flex-wrap items-center gap-2">
        <StageBadge stage={applicant.stage} label={applicant.stage_label} />
        {teacher.verification === "verified" ? <span className="chip chip-ok">Teacher verified</span> : null}
        {teacher.police_verified ? <span className="chip chip-ok">Police verified</span> : null}
      </Row>

      <ProgressBar value={applicant.progress} label="Progress" />

      {teacher.headline ? (
        <p className="text-[15px] font-semibold text-ink-1">{teacher.headline}</p>
      ) : null}
      {teacher.about ? <p className="text-sm leading-relaxed text-ink-2">{teacher.about}</p> : null}

      {applicant.cover_note ? (
        <Column className="gap-1 rounded-xl bg-surface-2 p-3.5">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-3">From the teacher</span>
          <p className="text-sm text-ink-2">{applicant.cover_note}</p>
        </Column>
      ) : null}

      {/* The ticks. "Each document marked verified" — this is what the school is
          paying for, so it is above the actions rather than buried under them. */}
      <Column className="gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-ink-3">Documents</span>
        {docs.length ? (
          <Column className="gap-1.5">
            {docs.map(([kind, verified]) => (
              <Row key={kind} className="items-center gap-2">
                {verified ? (
                  <CheckCircleIcon aria-hidden className="h-4 w-4 shrink-0 text-ok" />
                ) : (
                  <ClockIcon aria-hidden className="h-4 w-4 shrink-0 text-ink-3" />
                )}
                <span className={cn("text-sm", verified ? "text-ink-1" : "text-ink-3")}>
                  {kind.replace(/_/g, " ")}
                  {verified ? "" : " — being checked"}
                </span>
              </Row>
            ))}
          </Column>
        ) : (
          <p className="text-sm text-ink-3">Nothing uploaded yet.</p>
        )}
        {applicant.documents_pending.length ? (
          <p className="text-xs text-warn">
            Still to verify: {applicant.documents_pending.join(", ")}. Our office is on it.
          </p>
        ) : null}
      </Column>

      {"demo_classes" in applicant && applicant.demo_classes.length ? (
        <Column className="gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-3">Demo classes</span>
          {applicant.demo_classes.map((demo) => (
            <Column key={demo.id} className="gap-0.5 rounded-xl border border-line p-3">
              <Row className="flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink-1">
                  {new Date(demo.scheduled_at).toLocaleString("en-IN", {
                    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
                  })}
                </span>
                <span className="chip">{demo.status_label}</span>
              </Row>
              <span className="text-xs text-ink-3">
                {demo.topic}
                {demo.grade ? ` · ${demo.grade}` : ""} · {demo.duration_minutes} min
              </span>
              {demo.feedback ? <p className="pt-1 text-sm text-ink-2">{demo.feedback}</p> : null}
            </Column>
          ))}
        </Column>
      ) : null}

      {"offer" in applicant && applicant.offer ? (
        <Column className="gap-0.5 rounded-xl bg-ok-soft p-3.5">
          <span className="text-sm font-bold text-ok">Offer {applicant.offer.status_label.toLowerCase()}</span>
          <span className="text-sm text-ink-2">
            {applicant.offer.salary_lpa ? `₹${applicant.offer.salary_lpa} LPA` : "Salary not recorded"}
            {applicant.offer.joining_date ? ` · joining ${applicant.offer.joining_date}` : ""}
          </span>
        </Column>
      ) : null}

      {extra}

      {sheet === "demo" && onDemo ? (
        <DemoSheet onCancel={() => setSheet("none")} onSubmit={onDemo} />
      ) : sheet === "offer" && onOffer ? (
        <OfferSheet onCancel={() => setSheet("none")} onSubmit={onOffer} />
      ) : (
        <Column className="gap-3 border-t border-line pt-4">
          <Field label="A note (shown to the teacher when you are not selecting them)">
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              className="field resize-y"
            />
          </Field>
          <Row className="flex-wrap gap-2">
            {stages.map((action) => (
              <button
                key={action.stage}
                type="button"
                onClick={() => move.mutate(action.stage)}
                disabled={move.isPending || applicant.stage === action.stage}
                className={`btn btn-${action.variant ?? "outline"} text-sm`}
              >
                {action.label}
              </button>
            ))}
            {onDemo ? (
              <button type="button" onClick={() => setSheet("demo")} className="btn btn-accent text-sm">
                Book the demo class
              </button>
            ) : null}
            {onOffer ? (
              <button type="button" onClick={() => setSheet("offer")} className="btn btn-deep text-sm">
                Make an offer
              </button>
            ) : null}
          </Row>
        </Column>
      )}
    </Drawer>
  );
}

/** Topic and grade are required here because the backend requires them — the whole
 *  promise is that a teacher knows both in advance. */
function DemoSheet({
  onCancel, onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [form, setForm] = useState({
    scheduled_at: "", duration_minutes: 30, topic: "", grade: "",
    mode: "in_person", venue: "", meeting_link: "", panel: "",
  });

  const book = useMutation({
    mutationFn: () =>
      onSubmit({
        ...form,
        // datetime-local gives "2026-11-20T10:30" with no zone; the server reads it
        // as its own timezone (Asia/Kolkata), which is what the school meant.
        scheduled_at: form.scheduled_at,
      }),
    onSuccess: () => {
      toast.success("Booked. The teacher sees the date immediately.");
      queryClient.invalidateQueries();
      onCancel();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "That did not book."),
  });

  return (
    <Column className="gap-3 border-t border-line pt-4">
      <h3 className="font-display text-base font-bold text-ink-1">Book the demo class</h3>
      <Field label="Date and time">
        <input
          type="datetime-local"
          value={form.scheduled_at}
          onChange={(event) => setForm({ ...form, scheduled_at: event.target.value })}
          className="field"
        />
      </Field>
      <Row className="flex-col gap-3 sm:flex-row">
        <Field label="Topic" className="flex-1">
          <input
            value={form.topic}
            onChange={(event) => setForm({ ...form, topic: event.target.value })}
            placeholder="Electrostatics"
            className="field"
          />
        </Field>
        <Field label="Class" className="flex-1">
          <input
            value={form.grade}
            onChange={(event) => setForm({ ...form, grade: event.target.value })}
            placeholder="Class XII"
            className="field"
          />
        </Field>
      </Row>
      <Row className="flex-col gap-3 sm:flex-row">
        <Field label="Minutes" className="sm:w-28">
          <input
            type="number"
            min={10}
            value={form.duration_minutes}
            onChange={(event) => setForm({ ...form, duration_minutes: Number(event.target.value) || 30 })}
            className="field"
          />
        </Field>
        <Field label="Where" className="flex-1">
          <select
            value={form.mode}
            onChange={(event) => setForm({ ...form, mode: event.target.value })}
            className="field"
          >
            <option value="in_person">At the institution</option>
            <option value="online">Online</option>
          </select>
        </Field>
      </Row>
      {form.mode === "online" ? (
        <Field label="Meeting link">
          <input
            value={form.meeting_link}
            onChange={(event) => setForm({ ...form, meeting_link: event.target.value })}
            placeholder="https://…"
            className="field"
          />
        </Field>
      ) : (
        <Field label="Venue (optional)">
          <input
            value={form.venue}
            onChange={(event) => setForm({ ...form, venue: event.target.value })}
            className="field"
          />
        </Field>
      )}
      <Field label="Who will watch it (optional)">
        <input
          value={form.panel}
          onChange={(event) => setForm({ ...form, panel: event.target.value })}
          placeholder="HOD and Vice Principal"
          className="field"
        />
      </Field>
      <Row className="justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn btn-ghost">Cancel</button>
        <button
          type="button"
          onClick={() => book.mutate()}
          disabled={book.isPending || !form.scheduled_at || !form.topic || !form.grade}
          className="btn btn-accent"
        >
          {book.isPending ? "Booking…" : "Book it"}
        </button>
      </Row>
      <p className="text-xs text-ink-3">
        The topic and the class are required — the teacher is told both as soon as you
        save.
      </p>
    </Column>
  );
}

function OfferSheet({
  onCancel, onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [form, setForm] = useState({ salary_lpa: "", joining_date: "", terms: "" });

  const send = useMutation({
    mutationFn: () =>
      onSubmit({
        salary_lpa: form.salary_lpa || null,
        joining_date: form.joining_date || null,
        terms: form.terms,
      }),
    onSuccess: () => {
      toast.success("Offer sent. The teacher has been notified.");
      queryClient.invalidateQueries();
      onCancel();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "That did not send."),
  });

  return (
    <Column className="gap-3 border-t border-line pt-4">
      <h3 className="font-display text-base font-bold text-ink-1">Make an offer</h3>
      <Row className="flex-col gap-3 sm:flex-row">
        <Field label="Salary (LPA)" className="flex-1">
          <input
            value={form.salary_lpa}
            onChange={(event) => setForm({ ...form, salary_lpa: event.target.value.replace(/[^\d.]/g, "") })}
            inputMode="decimal"
            className="field"
          />
        </Field>
        <Field label="Joining date" className="flex-1">
          <input
            type="date"
            value={form.joining_date}
            onChange={(event) => setForm({ ...form, joining_date: event.target.value })}
            className="field"
          />
        </Field>
      </Row>
      <Field label="Terms (optional)">
        <textarea
          value={form.terms}
          onChange={(event) => setForm({ ...form, terms: event.target.value })}
          rows={3}
          className="field resize-y"
        />
      </Field>
      <Row className="justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn btn-ghost">Cancel</button>
        <button
          type="button"
          onClick={() => send.mutate()}
          disabled={send.isPending}
          className="btn btn-deep"
        >
          {send.isPending ? "Sending…" : "Send the offer"}
        </button>
      </Row>
    </Column>
  );
}
