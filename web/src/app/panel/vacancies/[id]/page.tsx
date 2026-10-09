"use client";

import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Field from "@/components/common/Field";
import Row from "@/components/common/Row";
import QueryState from "@/components/workspace/QueryState";
import VacancyForm, { draftFrom, toPayload, type VacancyDraft } from "@/components/workspace/VacancyForm";
import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";
import { queryClient } from "@/queryClient";

/** Editing a vacancy. Publishing stays a separate action, so a typo fix cannot
 *  accidentally push a notification to every matching teacher. */
export default function PanelVacancyEdit() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const vacancy = useQuery({
    queryKey: ["panel", "vacancy", id],
    queryFn: () => ApiController.panelVacancy(id),
    enabled: Boolean(id),
  });
  const facets = useQuery({
    queryKey: ["public", "facets"],
    queryFn: ApiController.getVacancyFacets,
    staleTime: 10 * 60 * 1000,
  });

  const [draft, setDraft] = useState<VacancyDraft | null>(null);
  const [note, setNote] = useState("");
  const [loadedId, setLoadedId] = useState<string | null>(null);

  // Seed the form from the server copy once, and re-seed if the id changes.
  if (vacancy.data && loadedId !== vacancy.data.id) {
    setDraft(draftFrom(vacancy.data));
    setNote(vacancy.data.internal_note);
    setLoadedId(vacancy.data.id);
  }

  const save = useMutation({
    mutationFn: () => ApiController.panelUpdateVacancy(id, toPayload(draft as VacancyDraft)),
    onSuccess: () => {
      toast.success("Saved.");
      queryClient.invalidateQueries({ queryKey: ["panel"] });
    },
    onError: (error: unknown) => {
      if (error instanceof ClientError && error.errors) {
        toast.error(Object.values(error.errors)[0] ?? error.message);
        return;
      }
      toast.error(error instanceof Error ? error.message : "That did not save.");
    },
  });

  const saveNote = useMutation({
    mutationFn: () => ApiController.panelVacancyAction(id, "note", { note }),
    onSuccess: () => {
      toast.success("Note saved.");
      queryClient.invalidateQueries({ queryKey: ["panel", "vacancy", id] });
    },
  });

  return (
    <QueryState isLoading={vacancy.isLoading} error={vacancy.error} loadingLabel="Loading the vacancy">
      {vacancy.data && draft ? (
        <>
          <Row className="flex-wrap items-center justify-between gap-3">
            <Link
              href="/panel/vacancies"
              className="flex items-center gap-1.5 text-sm font-semibold text-ink-3 hover:text-accent"
            >
              <ArrowLeftIcon aria-hidden className="h-4 w-4" />
              All vacancies
            </Link>
            <Row className="items-center gap-2">
              <span className="chip">{vacancy.data.status_label}</span>
              <span className="chip">{vacancy.data.view_count} views</span>
              <Link href={`/panel/applications?vacancy=${id}`} className="btn btn-outline text-sm">
                {vacancy.data.applications_count} applicants
              </Link>
            </Row>
          </Row>

          <VacancyForm
            draft={draft}
            onChange={setDraft}
            facets={facets.data ?? null}
            institutionName={vacancy.data.institution}
            institutionInitials={vacancy.data.initials}
            showInstitutionType
          />

          <Column className="card gap-3 p-4 sm:p-5">
            <Field label="The office's note" hint="Never shown to the teacher or the institution.">
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
                onClick={() => saveNote.mutate()}
                disabled={saveNote.isPending}
                className="btn btn-outline text-sm"
              >
                Save the note
              </button>
            </Row>
          </Column>

          <Row className="sticky bottom-0 justify-end gap-2.5 border-t border-line bg-paper/95 py-3 backdrop-blur">
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="btn btn-accent"
            >
              {save.isPending ? "Saving…" : "Save changes"}
            </button>
          </Row>
        </>
      ) : null}
    </QueryState>
  );
}
