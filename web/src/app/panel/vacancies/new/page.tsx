"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Field from "@/components/common/Field";
import Row from "@/components/common/Row";
import VacancyForm, { emptyDraft, toPayload, type VacancyDraft } from "@/components/workspace/VacancyForm";
import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";
import { queryClient } from "@/queryClient";

/**
 * The office posting a vacancy, usually on behalf of a school with no account here.
 *
 * "Fill it in, see the card you are about to publish, and send a push notification
 * to matching teachers in the same action." The notification is part of publishing
 * rather than a second button: a vacancy that goes live without telling anybody is
 * the failure mode of every job board.
 */
export default function NewPanelVacancy() {
  const router = useRouter();
  const facets = useQuery({
    queryKey: ["public", "facets"],
    queryFn: ApiController.getVacancyFacets,
    staleTime: 10 * 60 * 1000,
  });
  const schools = useQuery({
    queryKey: ["panel", "schools", "all"],
    queryFn: () => ApiController.panelSchools({ page: 1 }),
  });

  const [draft, setDraft] = useState<VacancyDraft>(emptyDraft());
  // Either a registered institution, or a name typed in — most of the firm's
  // clients have no account here, which is why `Vacancy.school` is nullable.
  const [schoolId, setSchoolId] = useState("");
  const [schoolName, setSchoolName] = useState("");

  const chosen = (schools.data?.results ?? []).find((row) => row.id === schoolId);
  const name = chosen?.name || schoolName || "The institution";

  function fail(error: unknown) {
    if (error instanceof ClientError && error.errors) {
      toast.error(Object.values(error.errors)[0] ?? error.message);
      return;
    }
    toast.error(error instanceof Error ? error.message : "That did not save.");
  }

  const create = useMutation({
    mutationFn: () =>
      ApiController.panelCreateVacancy({
        ...toPayload(draft),
        ...(schoolId ? { school: schoolId } : { school_name: schoolName }),
      }),
    onError: fail,
  });

  async function save(publish: boolean) {
    try {
      const vacancy = await create.mutateAsync();
      if (publish) {
        const answer = await ApiController.panelVacancyAction(vacancy.id, "publish");
        toast.success(answer.message || "Published.");
      } else {
        toast.success("Saved as a draft.");
      }
      queryClient.invalidateQueries({ queryKey: ["panel"] });
      router.push("/panel/vacancies");
    } catch (error) {
      fail(error);
    }
  }

  const ready = Boolean(draft.title && draft.post && draft.city && (schoolId || schoolName));

  return (
    <>
      <Column className="card gap-4 p-4 sm:p-5">
        <Column className="gap-1">
          <h2 className="font-display text-base font-bold text-ink-1">Which institution?</h2>
          <p className="text-sm text-ink-2">
            Pick a registered one, or type the name — most clients do not have an
            account here, and that is fine.
          </p>
        </Column>
        <Row className="flex-col gap-4 sm:flex-row">
          <Field label="Registered institution" className="flex-1">
            <select
              value={schoolId}
              onChange={(event) => { setSchoolId(event.target.value); setSchoolName(""); }}
              className="field"
            >
              <option value="">Not registered / type the name</option>
              {(schools.data?.results ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} — {row.city}
                  {row.status !== "verified" ? ` (${row.status})` : ""}
                </option>
              ))}
            </select>
          </Field>
          {!schoolId ? (
            <Field label="Or the institution's name" className="flex-1">
              <input
                value={schoolName}
                onChange={(event) => setSchoolName(event.target.value)}
                className="field"
              />
            </Field>
          ) : null}
        </Row>
        {chosen && chosen.status !== "verified" ? (
          <p className="rounded-xl bg-warn-soft p-3 text-sm text-ink-2">
            That institution is not verified yet, so this post cannot go live until it
            is. It will save as a draft.
          </p>
        ) : null}
      </Column>

      <VacancyForm
        draft={draft}
        onChange={setDraft}
        facets={facets.data ?? null}
        institutionName={name}
        institutionInitials={initialsOf(name)}
        showInstitutionType
      />

      <Row className="sticky bottom-0 flex-wrap items-center justify-end gap-2.5 border-t border-line bg-paper/95 py-3 backdrop-blur">
        {!ready ? (
          <span className="mr-auto text-sm text-ink-3">
            An institution, a title, a post and a city are needed.
          </span>
        ) : null}
        <button type="button" onClick={() => save(false)} disabled={!ready || create.isPending} className="btn btn-outline">
          Save as a draft
        </button>
        <button type="button" onClick={() => save(true)} disabled={!ready || create.isPending} className="btn btn-accent">
          {create.isPending ? "Saving…" : "Publish and notify teachers"}
        </button>
      </Row>
    </>
  );
}

/** Mirrors `School.derive_initials` on the backend so the preview matches. */
function initialsOf(name: string): string {
  const skip = new Set(["of", "the", "and", "for", "in", "at", "a", "an"]);
  return name
    .split(/\s+/)
    .filter((word) => word && !skip.has(word.replace(/[.,]/g, "").toLowerCase()))
    .map((word) => word[0])
    .filter((letter) => /[a-z]/i.test(letter))
    .join("")
    .toUpperCase()
    .slice(0, 4);
}
