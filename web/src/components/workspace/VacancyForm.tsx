"use client";

import { useMemo, useState } from "react";

import { TagInput } from "@/components/auth/ChipMultiSelect";
import Column from "@/components/common/Column";
import Field from "@/components/common/Field";
import Row from "@/components/common/Row";
import VacancyCard from "@/components/site/VacancyCard";
import type { VacancyCard as Card, VacancyFacets, VacancyPanel } from "@/networking/types";

/**
 * The vacancy form, shared by the school's workspace and the office's panel.
 *
 * "Fill it in, see the card you are about to publish." The preview is not
 * decoration: the card is what a teacher decides on, and the single most common
 * mistake in a job post is leaving off the thing that disqualifies people — so
 * showing the card as it will look is what makes a missing qualification obvious
 * before anyone applies.
 *
 * It renders the REAL `VacancyCard`, not a mock-up of one. A preview drawn by
 * separate code is a preview that drifts, and then lies.
 */
export interface VacancyDraft {
  title: string;
  post: string;
  subject: string;
  institution_type: string;
  board: string;
  grades: string;
  openings: number;
  city: string;
  state: string;
  locality: string;
  qualification: string;
  qualification_codes: string[];
  experience_min: string;
  experience_max: string;
  salary_min_lpa: string;
  salary_max_lpa: string;
  salary_note: string;
  salary_hidden: boolean;
  description: string;
  duties: string[];
  requirements: string[];
  demo_class: string;
  closes_on: string;
  is_urgent: boolean;
}

export function emptyDraft(overrides: Partial<VacancyDraft> = {}): VacancyDraft {
  return {
    title: "", post: "", subject: "", institution_type: "school", board: "",
    grades: "", openings: 1, city: "", state: "", locality: "",
    qualification: "", qualification_codes: [],
    experience_min: "", experience_max: "",
    salary_min_lpa: "", salary_max_lpa: "", salary_note: "", salary_hidden: false,
    description: "", duties: [], requirements: [], demo_class: "",
    closes_on: "", is_urgent: false,
    ...overrides,
  };
}

export function draftFrom(vacancy: VacancyPanel): VacancyDraft {
  return emptyDraft({
    title: vacancy.title,
    post: vacancy.post,
    subject: vacancy.subject,
    institution_type: vacancy.institution_type,
    board: vacancy.board,
    grades: vacancy.grades,
    openings: vacancy.openings,
    city: vacancy.city,
    state: vacancy.state,
    locality: vacancy.locality,
    qualification: vacancy.qualification,
    qualification_codes: vacancy.qualification_codes ?? [],
    experience_min: vacancy.experience_min ?? "",
    experience_max: vacancy.experience_max ?? "",
    salary_min_lpa: vacancy.salary_min_lpa ?? "",
    salary_max_lpa: vacancy.salary_max_lpa ?? "",
    salary_note: vacancy.salary_note,
    salary_hidden: vacancy.salary_hidden,
    description: vacancy.description,
    duties: vacancy.duties ?? [],
    requirements: vacancy.requirements ?? [],
    demo_class: vacancy.demo_class,
    closes_on: vacancy.closes_on ?? "",
    is_urgent: vacancy.is_urgent,
  });
}

/** The payload for the API. Empty numeric strings become null — Django rejects ""
 *  for a decimal or a date, and null is how "not set" is stored. */
export function toPayload(draft: VacancyDraft): Record<string, unknown> {
  const number = (value: string) => (value === "" ? null : value);
  return {
    ...draft,
    openings: Number(draft.openings) || 1,
    experience_min: number(draft.experience_min),
    experience_max: number(draft.experience_max),
    salary_min_lpa: number(draft.salary_min_lpa),
    salary_max_lpa: number(draft.salary_max_lpa),
    closes_on: draft.closes_on || null,
  };
}

export default function VacancyForm({
  draft, onChange, facets, institutionName, institutionInitials, showInstitutionType = false,
}: {
  draft: VacancyDraft;
  onChange: (draft: VacancyDraft) => void;
  facets: VacancyFacets | null;
  institutionName: string;
  institutionInitials: string;
  /** The office posts on behalf of schools of every kind, so it picks; a school's
   *  own type is already known. */
  showInstitutionType?: boolean;
}) {
  const set = <K extends keyof VacancyDraft>(key: K, value: VacancyDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const [showPreview, setShowPreview] = useState(true);

  // The card, built from the draft exactly as the backend would — including the
  // salary label, so the preview shows "Not disclosed" the moment the box is
  // ticked rather than after a save.
  const preview: Card = useMemo(() => {
    const label = (list: { value: string; label: string }[] | undefined, value: string) =>
      list?.find((entry) => entry.value === value)?.label ?? "";
    return {
      id: "preview",
      title: draft.title || "Your vacancy title",
      post: (draft.post || "tgt") as Card["post"],
      post_label: label(facets?.taxonomy.posts, draft.post) || "Post",
      subject: draft.subject,
      institution: institutionName,
      initials: institutionInitials,
      logo: "",
      institution_type: draft.institution_type,
      institution_label: label(facets?.taxonomy.institutions, draft.institution_type),
      board: draft.board,
      board_label: label(facets?.taxonomy.boards, draft.board),
      city: draft.city || "City",
      locality: draft.locality,
      grades: draft.grades,
      openings: Number(draft.openings) || 1,
      qualification: draft.qualification,
      experience_band: "fresher",
      experience_label: experienceLabel(draft.experience_min, draft.experience_max),
      salary: salaryLabel(draft),
      salary_min_lpa: draft.salary_min_lpa || null,
      salary_max_lpa: draft.salary_max_lpa || null,
      salary_note: draft.salary_note,
      is_new: true,
      is_featured: false,
      is_urgent: draft.is_urgent,
      published_at: new Date().toISOString(),
    };
  }, [draft, facets, institutionName, institutionInitials]);

  return (
    <Row className="flex-col items-start gap-6 lg:flex-row">
      <Column className="min-w-0 flex-1 gap-5">
        <Column className="card gap-4 p-4 sm:p-5">
          <h2 className="font-display text-base font-bold text-ink-1">The post</h2>

          <Field label="Title" hint="What a teacher will recognise — “PGT Physics”, “Vice Principal”.">
            <input value={draft.title} onChange={(e) => set("title", e.target.value)} className="field" />
          </Field>

          <Row className="flex-col gap-4 sm:flex-row">
            <Field label="Post" className="flex-1">
              <select value={draft.post} onChange={(e) => set("post", e.target.value)} className="field">
                <option value="">Choose a post</option>
                {(facets?.taxonomy.posts ?? []).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Subject" className="flex-1">
              <input
                value={draft.subject}
                onChange={(e) => set("subject", e.target.value)}
                placeholder="Physics, Mathematics…"
                className="field"
              />
            </Field>
          </Row>

          <Row className="flex-col gap-4 sm:flex-row">
            {showInstitutionType ? (
              <Field label="Institution type" className="flex-1">
                <select
                  value={draft.institution_type}
                  onChange={(e) => set("institution_type", e.target.value)}
                  className="field"
                >
                  {(facets?.taxonomy.institutions ?? []).map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field label="Board or affiliation" className="flex-1">
              <select value={draft.board} onChange={(e) => set("board", e.target.value)} className="field">
                <option value="">Not specified</option>
                {(facets?.taxonomy.boards ?? []).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Classes" className="flex-1">
              <input
                value={draft.grades}
                onChange={(e) => set("grades", e.target.value)}
                placeholder="VI–X, XI–XII"
                className="field"
              />
            </Field>
          </Row>

          <Row className="flex-col gap-4 sm:flex-row">
            <Field label="City" className="flex-1">
              <input value={draft.city} onChange={(e) => set("city", e.target.value)} className="field" />
            </Field>
            <Field label="Locality (optional)" className="flex-1">
              <input value={draft.locality} onChange={(e) => set("locality", e.target.value)} className="field" />
            </Field>
            <Field label="Openings" className="sm:w-28">
              <input
                type="number"
                min={1}
                value={draft.openings}
                onChange={(e) => set("openings", Number(e.target.value) || 1)}
                className="field"
              />
            </Field>
          </Row>
        </Column>

        <Column className="card gap-4 p-4 sm:p-5">
          <Column className="gap-1">
            <h2 className="font-display text-base font-bold text-ink-1">Qualification and experience</h2>
            <p className="text-sm text-ink-2">
              The qualification is the first line on the card, because it is the first
              thing that rules someone out.
            </p>
          </Column>

          <Field label="Qualification, as you would write it" hint="“M.Sc + B.Ed”, “PhD or NET”, “NTT / Montessori”.">
            <input
              value={draft.qualification}
              onChange={(e) => set("qualification", e.target.value)}
              className="field"
            />
          </Field>

          <Field
            label="And which of these are required"
            hint="Used to match teachers — a teacher who does not hold these will not be shown the post."
            group
          >
            <Row className="flex-wrap gap-2">
              {(facets?.taxonomy.qualifications ?? []).map((option) => {
                const on = draft.qualification_codes.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      set(
                        "qualification_codes",
                        on
                          ? draft.qualification_codes.filter((code) => code !== option.value)
                          : [...draft.qualification_codes, option.value],
                      )
                    }
                    className={on ? "chip chip-accent" : "chip hover:border-accent hover:text-accent"}
                  >
                    {option.label}
                  </button>
                );
              })}
            </Row>
          </Field>

          <Row className="flex-col gap-4 sm:flex-row">
            <Field label="Minimum years" hint="Leave blank for freshers welcome." className="flex-1">
              <input
                value={draft.experience_min}
                onChange={(e) => set("experience_min", e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                className="field"
              />
            </Field>
            <Field label="Up to (optional)" className="flex-1">
              <input
                value={draft.experience_max}
                onChange={(e) => set("experience_max", e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                className="field"
              />
            </Field>
          </Row>
        </Column>

        <Column className="card gap-4 p-4 sm:p-5">
          <h2 className="font-display text-base font-bold text-ink-1">Salary</h2>
          <Row className="flex-col gap-4 sm:flex-row">
            <Field label="From (LPA)" className="flex-1">
              <input
                value={draft.salary_min_lpa}
                onChange={(e) => set("salary_min_lpa", e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                disabled={draft.salary_hidden}
                className="field"
              />
            </Field>
            <Field label="To (LPA)" className="flex-1">
              <input
                value={draft.salary_max_lpa}
                onChange={(e) => set("salary_max_lpa", e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                disabled={draft.salary_hidden}
                className="field"
              />
            </Field>
            <Field label="Note" hint="“+ accommodation”, “as per CBSE norms”." className="flex-1">
              <input
                value={draft.salary_note}
                onChange={(e) => set("salary_note", e.target.value)}
                maxLength={80}
                className="field"
              />
            </Field>
          </Row>
          <label className="flex items-start gap-2.5 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={draft.salary_hidden}
              onChange={(e) => set("salary_hidden", e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            />
            Do not show the salary — the card reads “Not disclosed”. Fewer teachers apply.
          </label>
        </Column>

        <Column className="card gap-4 p-4 sm:p-5">
          <h2 className="font-display text-base font-bold text-ink-1">The detail</h2>

          <Field label="About the post">
            <textarea
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              className="field resize-y"
            />
          </Field>

          <Field label="What they will teach" hint="One per line. Type and press Enter." group>
            <TagInput
              value={draft.duties}
              onChange={(duties) => set("duties", duties)}
              placeholder="Physics for Classes XI and XII"
              max={8}
            />
          </Field>

          <Field label="What you are looking for" hint="One per line." group>
            <TagInput
              value={draft.requirements}
              onChange={(requirements) => set("requirements", requirements)}
              placeholder="M.Sc Physics with B.Ed"
              max={8}
            />
          </Field>

          <Field
            label="How the selection works"
            hint="Say the format now — the length, the class, and when the topic is given. It is the thing teachers ask about most."
          >
            <textarea
              value={draft.demo_class}
              onChange={(e) => set("demo_class", e.target.value)}
              rows={2}
              placeholder="Demo class: 30 minutes, Class XII, topic given one day in advance."
              className="field resize-y"
            />
          </Field>

          <Row className="flex-col gap-4 sm:flex-row sm:items-end">
            <Field label="Closes on (optional)" className="flex-1">
              <input
                type="date"
                value={draft.closes_on}
                onChange={(e) => set("closes_on", e.target.value)}
                className="field"
              />
            </Field>
            <label className="flex items-start gap-2.5 pb-2.5 text-sm text-ink-2">
              <input
                type="checkbox"
                checked={draft.is_urgent}
                onChange={(e) => set("is_urgent", e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
              />
              Mark as urgent
            </label>
          </Row>
        </Column>
      </Column>

      <Column className="w-full shrink-0 gap-3 lg:sticky lg:top-20 lg:w-[22rem]">
        <Row className="items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold text-ink-1">What teachers will see</h2>
          <button
            type="button"
            onClick={() => setShowPreview((open) => !open)}
            className="text-xs font-semibold text-accent lg:hidden"
          >
            {showPreview ? "Hide" : "Show"}
          </button>
        </Row>
        {showPreview ? (
          <>
            {/* `pointer-events-none` because the real card is a link to a vacancy
                that does not exist yet — a preview that navigates is a trap. */}
            <div className="pointer-events-none">
              <VacancyCard vacancy={preview} />
            </div>
            <p className="text-xs text-ink-3">
              This is the card itself, not a mock-up — it is the same component the
              board uses.
            </p>
          </>
        ) : null}
      </Column>
    </Row>
  );
}

function experienceLabel(min: string, max: string): string {
  if (!min && !max) return "Fresher";
  if (min && max) return `${min}–${max} yrs`;
  if (min) return `${min}+ yrs`;
  return `Up to ${max} yrs`;
}

/** Mirrors `Vacancy.salary_label` on the backend, including the trailing-zero trim,
 *  so the preview matches what will actually be published. */
function salaryLabel(draft: VacancyDraft): string {
  if (draft.salary_hidden) return "Not disclosed";
  const trim = (value: string) => String(Number(value)).replace(/\.0+$/, "");
  const low = draft.salary_min_lpa;
  const high = draft.salary_max_lpa;
  if (low && high && low !== high) return `₹${trim(low)} – ${trim(high)} LPA`;
  const one = high || low;
  return one ? `₹${trim(one)} LPA` : "Not disclosed";
}
