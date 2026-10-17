"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Field from "@/components/common/Field";
import Row from "@/components/common/Row";
import QueryState from "@/components/workspace/QueryState";
import { cn } from "@/lib/cn";
import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";
import { queryClient } from "@/queryClient";
import type { TuitionRequirementResp } from "@/networking/types";

const CLASSES = [
  ["nursery", "Nursery"], ["lkg", "LKG"], ["ukg", "UKG"],
  ...Array.from({ length: 12 }, (_, i) => [String(i + 1), `Class ${i + 1}`]),
] as const;

/** "We need a maths tutor for class 9, twice a week." */
export default function RequirementsPage() {
  const [adding, setAdding] = useState(false);

  const list = useQuery({
    queryKey: ["student", "requirements"],
    queryFn: ApiController.getMyRequirements,
  });

  const rows = list.data?.results ?? [];

  return (
    <>
      <Row className="flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-3">
          Post what you need and teachers nearby can send an interest request.
        </p>
        <button
          type="button"
          onClick={() => setAdding((on) => !on)}
          className="btn btn-accent shrink-0"
        >
          {adding ? "Cancel" : "Post what we need"}
        </button>
      </Row>

      {adding ? <RequirementForm onDone={() => setAdding(false)} /> : null}

      <QueryState
        isLoading={list.isLoading}
        error={list.error}
        isEmpty={rows.length === 0 && !adding}
        emptyTitle="Nothing posted yet"
        emptyHint="Tell us the class and the subjects and we will show it to teachers who take home tuition near you."
      >
        <Column className="gap-2.5">
          {rows.map((row) => <RequirementRow key={row.id} row={row} />)}
        </Column>
      </QueryState>
    </>
  );
}

function RequirementForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    klass: "", subjects: "", medium: "", mode: "home",
    days_per_week: "", preferred_time: "", budget_min: "", budget_max: "",
    teacher_gender: "", description: "",
  });
  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const create = useMutation({
    mutationFn: () =>
      ApiController.createRequirement({
        ...form,
        // The API takes a list; the form takes a comma-separated line because
        // a parent types "Maths, Science" faster than they operate a tag input.
        subjects: form.subjects.split(",").map((s) => s.trim()).filter(Boolean),
        days_per_week: form.days_per_week ? Number(form.days_per_week) : null,
        budget_min: form.budget_min ? Number(form.budget_min) : null,
        budget_max: form.budget_max ? Number(form.budget_max) : null,
      }),
    onSuccess: async () => {
      toast.success("Posted.");
      await queryClient.invalidateQueries({ queryKey: ["student", "requirements"] });
      onDone();
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof ClientError || error instanceof Error
          ? error.message : "That didn't post.",
      ),
  });

  return (
    <Column className="card gap-3 p-4 sm:p-5">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <Row className="flex-col gap-3 sm:flex-row">
          <Field label="Class" className="flex-1">
            <select value={form.klass} onChange={(e) => set("klass", e.target.value)} required className="field">
              <option value="">Select</option>
              {CLASSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Subjects" className="flex-[2]" hint="Separate with commas.">
            <input
              value={form.subjects}
              onChange={(e) => set("subjects", e.target.value)}
              placeholder="Maths, Science"
              required
              className="field"
            />
          </Field>
        </Row>

        <Row className="flex-col gap-3 sm:flex-row">
          <Field label="Where" className="flex-1">
            <select value={form.mode} onChange={(e) => set("mode", e.target.value)} className="field">
              <option value="home">At our home</option>
              <option value="teacher_place">At the teacher&apos;s place</option>
              <option value="online">Online</option>
              <option value="either">Either</option>
            </select>
          </Field>
          <Field label="Medium" className="flex-1">
            <select value={form.medium} onChange={(e) => set("medium", e.target.value)} className="field">
              <option value="">Any</option>
              <option value="english">English</option>
              <option value="hindi">Hindi</option>
              <option value="both">Both</option>
            </select>
          </Field>
          <Field label="Days a week" className="flex-1">
            <input
              value={form.days_per_week}
              onChange={(e) => set("days_per_week", e.target.value.replace(/\D/g, "").slice(0, 1))}
              inputMode="numeric"
              className="field"
            />
          </Field>
        </Row>

        <Row className="flex-col gap-3 sm:flex-row">
          <Field label="Budget from" className="flex-1" hint="Rupees a month.">
            <input
              value={form.budget_min}
              onChange={(e) => set("budget_min", e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              className="field"
            />
          </Field>
          <Field label="Budget to" className="flex-1">
            <input
              value={form.budget_max}
              onChange={(e) => set("budget_max", e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              className="field"
            />
          </Field>
          <Field label="Teacher preference" className="flex-1">
            <select
              value={form.teacher_gender}
              onChange={(e) => set("teacher_gender", e.target.value)}
              className="field"
            >
              <option value="">No preference</option>
              <option value="female">Female teacher</option>
              <option value="male">Male teacher</option>
            </select>
          </Field>
        </Row>

        <Field label="When suits you" hint="e.g. after 5 pm, or weekend mornings.">
          <input
            value={form.preferred_time}
            onChange={(e) => set("preferred_time", e.target.value)}
            className="field"
          />
        </Field>

        <Field label="Anything else">
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            className="field"
          />
        </Field>

        <button type="submit" disabled={create.isPending} className="btn btn-accent w-fit">
          {create.isPending ? "Posting…" : "Post this"}
        </button>
      </form>
    </Column>
  );
}

function RequirementRow({ row }: { row: TuitionRequirementResp }) {
  const update = useMutation({
    mutationFn: (status: string) => ApiController.updateRequirement(row.id, { status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["student", "requirements"] });
    },
  });
  const remove = useMutation({
    mutationFn: () => ApiController.deleteRequirement(row.id),
    onSuccess: async () => {
      toast.success("Removed.");
      await queryClient.invalidateQueries({ queryKey: ["student", "requirements"] });
    },
  });

  return (
    <Column className="card gap-2 p-4">
      <Row className="flex-wrap items-start justify-between gap-2">
        <Column className="min-w-0 flex-1 gap-0.5">
          <span className="font-display text-sm font-bold text-ink-1">
            {row.klass_label} · {row.subjects.join(", ")}
          </span>
          <span className="text-xs text-ink-3">
            {row.mode_label}
            {row.days_per_week ? ` · ${row.days_per_week} days a week` : ""}
            {row.preferred_time ? ` · ${row.preferred_time}` : ""}
          </span>
          <span className="text-xs text-ink-2">{row.budget_label}</span>
        </Column>
        <span
          className={cn(
            "chip shrink-0",
            row.status === "open" && "chip-ok",
            row.status === "filled" && "chip-warn",
          )}
        >
          {row.status_label}
        </span>
      </Row>

      {row.description ? <p className="text-sm text-ink-2">{row.description}</p> : null}

      <Row className="flex-wrap gap-2">
        {row.status === "open" ? (
          <button
            type="button"
            onClick={() => update.mutate("filled")}
            className="btn btn-ghost px-3 py-2 text-sm"
          >
            We found someone
          </button>
        ) : (
          <button
            type="button"
            onClick={() => update.mutate("open")}
            className="btn btn-ghost px-3 py-2 text-sm"
          >
            Looking again
          </button>
        )}
        <button
          type="button"
          onClick={() => remove.mutate()}
          className="btn btn-ghost px-3 py-2 text-sm text-bad"
        >
          Remove
        </button>
      </Row>
    </Column>
  );
}
