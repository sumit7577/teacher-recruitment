"use client";

import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

import EmailCard from "@/components/account/EmailCard";
import { ChipPicker, TagInput } from "@/components/auth/ChipMultiSelect";
import Column from "@/components/common/Column";
import Field from "@/components/common/Field";
import Row from "@/components/common/Row";
import ProgressBar from "@/components/workspace/ProgressBar";
import QueryState from "@/components/workspace/QueryState";
import { cn } from "@/lib/cn";
import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";
import { queryClient } from "@/queryClient";
import type { TeacherDocumentResp, TeacherProfileResp, VacancyFacets } from "@/networking/types";

/**
 * "One profile — CV, degree, B.Ed, CTET, experience letters."
 *
 * Three sections, in the order that decides whether an application is worth sending
 * to a school: the documents first (a CV is what gates applying at all), then the
 * matching fields, then the history.
 */
/** The 21+ titles from the brief. A designation is the title on the
 *  appointment letter; `post` is the band the board filters on, and the server
 *  derives one from the other so nobody answers twice. */
const DESIGNATIONS: [string, string][] = [
  ["pgt", "PGT — Post Graduate Teacher"],
  ["tgt", "TGT — Trained Graduate Teacher"],
  ["prt", "PRT — Primary Teacher"],
  ["pre_primary", "Pre-primary / NTT"],
  ["principal", "Principal"],
  ["vice_principal", "Vice-Principal"],
  ["academic_coordinator", "Academic Coordinator"],
  ["sports", "Sports Teacher"],
  ["music", "Music Teacher"],
  ["fine_arts", "Fine Arts Teacher"],
  ["dance", "Dance Teacher"],
  ["counsellor", "Counsellor"],
  ["wellness", "Wellness Teacher"],
  ["special_educator", "Special Educator"],
  ["librarian", "Librarian"],
  ["lab_assistant", "Lab Assistant"],
  ["it", "IT / Computer"],
  ["accounts", "Accounts"],
  ["cashier", "Cashier"],
  ["front_office", "Front Office (PRO)"],
  ["office_incharge", "Office Incharge"],
  ["hr_head", "HR Head"],
  ["hostel_warden", "Hostel Warden / Superintendent"],
  ["housekeeping", "Housekeeping Supervisor"],
  ["transport", "Transport Incharge"],
  ["other", "Any other"],
];

const CLASS_OPTIONS = [
  { value: "nursery", label: "Nursery" },
  { value: "lkg", label: "LKG" },
  { value: "ukg", label: "UKG" },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1), label: `Class ${i + 1}`,
  })),
];

export default function TeacherProfilePage() {
  const profile = useQuery({
    queryKey: ["teacher", "profile"],
    queryFn: ApiController.getTeacherProfile,
  });
  // The taxonomy. Public, unauthenticated, and it changes about never — hence the
  // long staleTime rather than refetching it beside every profile read.
  const facets = useQuery({
    queryKey: ["public", "facets"],
    queryFn: ApiController.getVacancyFacets,
    staleTime: 10 * 60 * 1000,
  });

  return (
    <QueryState isLoading={profile.isLoading} error={profile.error} loadingLabel="Loading your profile">
      {profile.data ? (
        <>
          <Column className="card gap-3 p-4 sm:p-5">
            <Row className="flex-wrap items-start justify-between gap-3">
              <Column className="gap-0.5">
                <span className="font-display text-lg font-bold text-ink-1">{profile.data.name}</span>
                <span className="text-sm text-ink-2">
                  {profile.data.post_label} · {profile.data.city} · {profile.data.experience_label}
                </span>
                <span className="text-sm text-ink-3">{profile.data.phone}</span>
              </Column>
              <Column className="items-end gap-1.5">
                <span
                  className={cn(
                    "chip",
                    profile.data.verification === "verified" ? "chip-ok" : "chip-warn",
                  )}
                >
                  {profile.data.verification === "verified"
                    ? "Verified by the office"
                    : profile.data.verification === "rejected"
                      ? "Needs attention"
                      : "Awaiting verification"}
                </span>
                {profile.data.police_verified ? <span className="chip chip-ok">Police verified</span> : null}
              </Column>
            </Row>
            <ProgressBar
              value={profile.data.completeness}
              label="Profile completeness"
              tone={profile.data.completeness === 100 ? "ok" : "accent"}
            />
          </Column>

          <EmailCard />

          <Documents profile={profile.data} />
          <MatchingFields profile={profile.data} facets={facets.data ?? null} />
          <Experience profile={profile.data} facets={facets.data ?? null} />
        </>
      ) : null}
    </QueryState>
  );
}

/* ── documents ────────────────────────────────────────────────────────────── */

function Documents({ profile }: { profile: TeacherProfileResp }) {
  const documents = useQuery({
    queryKey: ["teacher", "documents"],
    queryFn: ApiController.getTeacherDocuments,
  });
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [kind, setKind] = useState("cv");

  // Deep-linked from the Apply button's `cv_missing` error, so the teacher lands on
  // the thing they were told to fix rather than at the top of the page.
  const section = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("focus") === "documents") {
      section.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const upload = useMutation({
    mutationFn: (form: FormData) => ApiController.uploadTeacherDocument(form),
    onSuccess: () => {
      toast.success("Uploaded. The office will check it.");
      queryClient.invalidateQueries({ queryKey: ["teacher"] });
    },
    onError: (error: unknown) => {
      if (error instanceof ClientError && error.errors) {
        toast.error(Object.values(error.errors)[0] ?? error.message);
        return;
      }
      toast.error(error instanceof Error ? error.message : "That did not upload.");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => ApiController.deleteTeacherDocument(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teacher"] }),
  });

  const required = documents.data?.required ?? [];
  const held = documents.data?.documents ?? [];
  const kinds = [
    ...required,
    { kind: "bed", label: "B.Ed certificate" },
    { kind: "ctet", label: "CTET / TET scorecard" },
    { kind: "net", label: "NET / SET certificate" },
    { kind: "phd", label: "PhD certificate" },
    { kind: "rci", label: "RCI registration" },
    { kind: "experience", label: "Experience letter" },
    { kind: "photo", label: "Photograph" },
    { kind: "other", label: "Something else" },
    // The required list already contains some of these; de-duplicated by kind so
    // the dropdown never lists "CV / Resume" twice.
  ].filter((entry, index, all) => all.findIndex((e) => e.kind === entry.kind) === index);

  return (
    <Column ref={section} className="card gap-4 p-4 sm:p-5">
      <Column className="gap-1">
        <h2 className="font-display text-base font-bold text-ink-1">Your documents</h2>
        <p className="text-sm text-ink-2">
          Uploaded once and reused for every application. The office checks them, and a
          school sees the ticks — never the files until you apply.
        </p>
      </Column>

      {profile.missing_documents.length ? (
        <Row className="flex-wrap items-center gap-2 rounded-xl bg-warn-soft p-3.5">
          <ExclamationCircleIcon aria-hidden className="h-5 w-5 shrink-0 text-warn" />
          <span className="text-sm text-ink-2">
            Still needed: <strong className="font-semibold">{profile.missing_documents.join(", ")}</strong>.
            Schools will not see an application without a CV.
          </span>
        </Row>
      ) : null}

      <Row className="flex-col gap-2.5 sm:flex-row sm:items-end">
        <Column className="flex-1">
          <label htmlFor="kind" className="label">What are you uploading?</label>
          <select id="kind" value={kind} onChange={(event) => setKind(event.target.value)} className="field">
            {kinds.map((entry) => (
              <option key={entry.kind} value={entry.kind}>{entry.label}</option>
            ))}
          </select>
        </Column>
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const form = new FormData();
            form.set("kind", kind);
            form.set("file", file);
            upload.mutate(form);
            // Cleared so re-picking the same file fires change again — otherwise a
            // failed upload cannot be retried without choosing a different file.
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={upload.isPending}
          className="btn btn-accent"
        >
          <ArrowUpTrayIcon aria-hidden className="h-4 w-4" />
          {upload.isPending ? "Uploading…" : "Choose a file"}
        </button>
      </Row>
      <p className="-mt-2 text-xs text-ink-3">
        PDF or a clear photo, up to 10 MB. Uploading the same kind again replaces it.
      </p>

      {held.length ? (
        <Column className="gap-2">
          {held.map((document) => (
            <DocumentRow
              key={document.id}
              document={document}
              onRemove={() => remove.mutate(document.id)}
              removing={remove.isPending}
            />
          ))}
        </Column>
      ) : null}
    </Column>
  );
}

function DocumentRow({
  document, onRemove, removing,
}: {
  document: TeacherDocumentResp;
  onRemove: () => void;
  removing: boolean;
}) {
  const Icon =
    document.status === "verified" ? CheckCircleIcon
      : document.status === "rejected" ? ExclamationCircleIcon
        : ClockIcon;
  const tone =
    document.status === "verified" ? "text-ok"
      : document.status === "rejected" ? "text-bad"
        : "text-ink-3";

  return (
    <Row className="flex-wrap items-center gap-3 rounded-xl border border-line p-3">
      <Icon aria-hidden className={cn("h-5 w-5 shrink-0", tone)} />
      <Column className="min-w-0 flex-1 gap-0.5">
        <span className="truncate text-sm font-semibold text-ink-1">{document.kind_label}</span>
        <span className="text-xs text-ink-3">
          {document.status_label}
          {document.verified_by_name ? ` by ${document.verified_by_name}` : ""}
        </span>
        {document.note ? <span className="text-xs text-bad">{document.note}</span> : null}
      </Column>
      {document.file ? (
        <a
          href={document.file}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-accent hover:underline"
        >
          View
        </a>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        aria-label={`Remove ${document.kind_label}`}
        className="btn btn-ghost p-2"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </Row>
  );
}

/* ── the fields that decide matching ──────────────────────────────────────── */

function MatchingFields({
  profile, facets,
}: {
  profile: TeacherProfileResp;
  facets: VacancyFacets | null;
}) {
  const [form, setForm] = useState({
    post: profile.post,
    subjects: profile.subjects,
    qualifications: profile.qualifications,
    city: profile.city,
    preferred_cities: profile.preferred_cities,
    willing_to_relocate: profile.willing_to_relocate,
    experience_years: profile.experience_years,
    headline: profile.headline,
    about: profile.about,
    expected_salary_lpa: profile.expected_salary_lpa ?? "",
    is_open_to_work: profile.is_open_to_work,
    // Added with the fuller profile. `teaching_preferences` is the one that
    // actually gates a feature: the parent-facing tutor search filters on it
    // containing "home_tuition", so without a row here no teacher can ever
    // opt in and that search is permanently empty.
    designation: profile.designation ?? "",
    teaching_preferences: profile.teaching_preferences ?? [],
    medium: profile.medium ?? "",
    exams: profile.exams ?? [],
    classes_taught: profile.classes_taught ?? [],
    pincode: profile.pincode ?? "",
    open_to_residential: profile.open_to_residential ?? false,
    accommodation_preference: profile.accommodation_preference ?? "",
    food_preference: profile.food_preference ?? "",
    is_hidden: profile.is_hidden ?? false,
  });

  const save = useMutation({
    mutationFn: () =>
      ApiController.updateTeacherProfile({
        ...form,
        // An empty string is not a number; Django rejects "" for a decimal field,
        // and null is how "no expectation" is stored.
        expected_salary_lpa: form.expected_salary_lpa === "" ? null : form.expected_salary_lpa,
      }),
    onSuccess: () => {
      toast.success("Saved. Your matches update straight away.");
      queryClient.invalidateQueries({ queryKey: ["teacher"] });
    },
    onError: (error: unknown) => {
      if (error instanceof ClientError && error.errors) {
        toast.error(Object.values(error.errors)[0] ?? error.message);
        return;
      }
      toast.error(error instanceof Error ? error.message : "That did not save.");
    },
  });

  return (
    <Column className="card gap-4 p-4 sm:p-5">
      <Column className="gap-1">
        <h2 className="font-display text-base font-bold text-ink-1">What you teach</h2>
        <p className="text-sm text-ink-2">
          These four decide which vacancies reach you — the post, your subjects, what
          you hold, and where you will work.
        </p>
      </Column>

      <Row className="flex-col gap-4 sm:flex-row">
        <Field label="Post" className="flex-1">
          <select
            value={form.post}
            onChange={(event) => setForm({ ...form, post: event.target.value as typeof form.post })}
            className="field"
          >
            {(facets?.taxonomy.posts ?? []).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Years of experience" className="sm:w-44">
          <input
            value={form.experience_years}
            onChange={(event) =>
              setForm({ ...form, experience_years: event.target.value.replace(/[^\d.]/g, "") })
            }
            inputMode="decimal"
            className="field"
          />
        </Field>
      </Row>

      <Field label="Subjects" group>
        <TagInput
          value={form.subjects}
          onChange={(subjects) => setForm({ ...form, subjects })}
          placeholder="Type one and press Enter"
        />
      </Field>

      <Field label="What you hold" group>
        <ChipPicker
          options={facets?.taxonomy.qualifications ?? []}
          value={form.qualifications}
          onChange={(qualifications) => setForm({ ...form, qualifications })}
        />
      </Field>

      <Field label="Where you will work" group hint="A school post and home tuition are not exclusive — tick both if you want both.">
        <ChipPicker
          options={[
            { value: "school", label: "School teaching" },
            { value: "coaching", label: "Coaching institute" },
            { value: "home_tuition", label: "Home tuition" },
          ]}
          value={form.teaching_preferences}
          onChange={(teaching_preferences) => setForm({ ...form, teaching_preferences })}
        />
      </Field>

      <Row className="flex-col gap-4 sm:flex-row">
        <Field label="Your designation" className="flex-1" hint="The title on your appointment letter.">
          <select
            value={form.designation}
            onChange={(event) => setForm({ ...form, designation: event.target.value })}
            className="field"
          >
            <option value="">Not set</option>
            {DESIGNATIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="Teaching medium" className="flex-1">
          <select
            value={form.medium}
            onChange={(event) => setForm({ ...form, medium: event.target.value })}
            className="field"
          >
            <option value="">Not set</option>
            <option value="english">English</option>
            <option value="hindi">Hindi</option>
            <option value="both">English and Hindi</option>
            <option value="regional">Regional language</option>
          </select>
        </Field>
      </Row>

      <Field label="Classes you take" group>
        <ChipPicker
          options={CLASS_OPTIONS}
          value={form.classes_taught}
          onChange={(classes_taught) => setForm({ ...form, classes_taught })}
        />
      </Field>

      <Field label="Exams you prepare students for" group>
        <ChipPicker
          options={[
            { value: "jee", label: "JEE" },
            { value: "neet", label: "NEET" },
            { value: "olympiad", label: "Olympiad" },
            { value: "ntse", label: "NTSE" },
            { value: "boards", label: "Board exams" },
            { value: "foundation", label: "Foundation (9th–10th)" },
          ]}
          value={form.exams}
          onChange={(exams) => setForm({ ...form, exams })}
        />
      </Field>

      {/* The residential block. Asked symmetrically of the vacancy, so a match
          is a comparison rather than an interpretation. */}
      <Column className="gap-2.5 rounded-xl border border-line p-3.5">
        <label className="flex items-start gap-2.5 text-sm font-semibold text-ink-1">
          <input
            type="checkbox"
            checked={form.open_to_residential}
            onChange={(event) => setForm({ ...form, open_to_residential: event.target.checked })}
            className="mt-0.5"
          />
          I would take a residential post
        </label>
        {form.open_to_residential ? (
          <Row className="flex-col gap-3 sm:flex-row">
            <Field label="Accommodation you would accept" className="flex-1">
              <select
                value={form.accommodation_preference}
                onChange={(event) =>
                  setForm({ ...form, accommodation_preference: event.target.value })
                }
                className="field"
              >
                <option value="">No preference</option>
                <option value="separate_room">Separate room</option>
                <option value="shared_room">Shared room</option>
                <option value="dormitory">Dormitory</option>
                <option value="family_quarter">Family quarter</option>
              </select>
            </Field>
            <Field label="Food" className="flex-1">
              <select
                value={form.food_preference}
                onChange={(event) => setForm({ ...form, food_preference: event.target.value })}
                className="field"
              >
                <option value="">No preference</option>
                <option value="veg">Vegetarian</option>
                <option value="non_veg">Non-vegetarian</option>
                <option value="both">Both</option>
              </select>
            </Field>
          </Row>
        ) : null}
      </Column>

      <Row className="flex-col gap-4 sm:flex-row">
        <Field label="Your city" className="flex-1">
          <input
            value={form.city}
            onChange={(event) => setForm({ ...form, city: event.target.value })}
            className="field"
          />
        </Field>
        <Field label="PIN code" className="sm:w-36" hint="Used for 'tutors near me'.">
          <input
            value={form.pincode}
            onChange={(event) =>
              setForm({ ...form, pincode: event.target.value.replace(/\D/g, "").slice(0, 6) })
            }
            inputMode="numeric"
            className="field"
          />
        </Field>
        <Field label="Expected salary (LPA, optional)" className="flex-1">
          <input
            value={String(form.expected_salary_lpa ?? "")}
            onChange={(event) =>
              setForm({ ...form, expected_salary_lpa: event.target.value.replace(/[^\d.]/g, "") })
            }
            inputMode="decimal"
            className="field"
          />
        </Field>
      </Row>

      <Field label="Other cities you would work in" group>
        <TagInput
          value={form.preferred_cities}
          onChange={(preferred_cities) => setForm({ ...form, preferred_cities })}
          placeholder="Noida, Ghaziabad…"
        />
      </Field>

      <Field label="One line about you">
        <input
          value={form.headline}
          onChange={(event) => setForm({ ...form, headline: event.target.value })}
          placeholder="PGT Physics, 4 years CBSE, board results since 2022"
          maxLength={160}
          className="field"
        />
      </Field>

      <Field label="A short note for schools">
        <textarea
          value={form.about}
          onChange={(event) => setForm({ ...form, about: event.target.value })}
          rows={4}
          className="field resize-y"
        />
      </Field>

      <Column className="gap-2.5">
        <label className="flex items-start gap-2.5 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={form.willing_to_relocate}
            onChange={(event) => setForm({ ...form, willing_to_relocate: event.target.checked })}
            className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
          />
          Show me vacancies in any city
        </label>
        <label className="flex items-start gap-2.5 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={form.is_open_to_work}
            onChange={(event) => setForm({ ...form, is_open_to_work: event.target.checked })}
            className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
          />
          I am looking for a post — untick this to go quiet without closing your account
        </label>
      </Column>

      <Row className="justify-end">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="btn btn-accent"
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </Row>
    </Column>
  );
}

/* ── where they have taught ───────────────────────────────────────────────── */

function Experience({
  profile, facets,
}: {
  profile: TeacherProfileResp;
  facets: VacancyFacets | null;
}) {
  const [adding, setAdding] = useState(false);
  const [row, setRow] = useState({
    institution: "", post: "", subject: "", city: "", is_current: false,
    started_on: "", ended_on: "",
  });

  const add = useMutation({
    mutationFn: () =>
      ApiController.addTeacherExperience({
        ...row,
        // Django's DateField rejects "", and these are genuinely optional.
        started_on: row.started_on || null,
        ended_on: row.ended_on || null,
      }),
    onSuccess: () => {
      setAdding(false);
      setRow({ institution: "", post: "", subject: "", city: "", is_current: false, started_on: "", ended_on: "" });
      queryClient.invalidateQueries({ queryKey: ["teacher"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "That did not save."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => ApiController.deleteTeacherExperience(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teacher"] }),
  });

  return (
    <Column className="card gap-4 p-4 sm:p-5">
      <Row className="flex-wrap items-start justify-between gap-3">
        <Column className="gap-1">
          <h2 className="font-display text-base font-bold text-ink-1">Where you have taught</h2>
          <p className="text-sm text-ink-2">
            A school reads this on your applicant card, and the office checks it against
            your experience letters.
          </p>
        </Column>
        <button type="button" onClick={() => setAdding((open) => !open)} className="btn btn-outline">
          {adding ? "Cancel" : "Add a school"}
        </button>
      </Row>

      {adding ? (
        <Column className="gap-3 rounded-xl bg-surface-2 p-4">
          <Row className="flex-col gap-3 sm:flex-row">
            <Field label="Institution" className="flex-1">
              <input
                value={row.institution}
                onChange={(event) => setRow({ ...row, institution: event.target.value })}
                className="field"
              />
            </Field>
            <Field label="City" className="flex-1">
              <input
                value={row.city}
                onChange={(event) => setRow({ ...row, city: event.target.value })}
                className="field"
              />
            </Field>
          </Row>
          <Row className="flex-col gap-3 sm:flex-row">
            <Field label="Post" className="flex-1">
              <select
                value={row.post}
                onChange={(event) => setRow({ ...row, post: event.target.value })}
                className="field"
              >
                <option value="">Choose</option>
                {(facets?.taxonomy.posts ?? []).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Subject" className="flex-1">
              <input
                value={row.subject}
                onChange={(event) => setRow({ ...row, subject: event.target.value })}
                className="field"
              />
            </Field>
          </Row>
          <Row className="flex-col gap-3 sm:flex-row">
            <Field label="From" className="flex-1">
              <input
                type="date"
                value={row.started_on}
                onChange={(event) => setRow({ ...row, started_on: event.target.value })}
                className="field"
              />
            </Field>
            <Field label="To" className="flex-1">
              <input
                type="date"
                value={row.ended_on}
                onChange={(event) => setRow({ ...row, ended_on: event.target.value })}
                disabled={row.is_current}
                className="field"
              />
            </Field>
          </Row>
          <label className="flex items-center gap-2.5 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={row.is_current}
              onChange={(event) => setRow({ ...row, is_current: event.target.checked, ended_on: "" })}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            I am still here
          </label>
          <Row className="justify-end">
            <button
              type="button"
              onClick={() => add.mutate()}
              disabled={add.isPending || !row.institution}
              className="btn btn-accent"
            >
              {add.isPending ? "Saving…" : "Add"}
            </button>
          </Row>
        </Column>
      ) : null}

      {profile.experience.length ? (
        <Column className="gap-2">
          {profile.experience.map((entry) => (
            <Row key={entry.id} className="flex-wrap items-center gap-3 rounded-xl border border-line p-3">
              <Column className="min-w-0 flex-1 gap-0.5">
                <span className="truncate text-sm font-semibold text-ink-1">{entry.institution}</span>
                <span className="text-xs text-ink-3">
                  {[entry.post_label, entry.subject, entry.city].filter(Boolean).join(" · ")}
                  {entry.is_current ? " · current" : ""}
                </span>
              </Column>
              <button
                type="button"
                onClick={() => remove.mutate(entry.id)}
                disabled={remove.isPending}
                aria-label={`Remove ${entry.institution}`}
                className="btn btn-ghost p-2"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </Row>
          ))}
        </Column>
      ) : (
        <p className="text-sm text-ink-3">Nothing added yet.</p>
      )}
    </Column>
  );
}
