"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import QueryState from "@/components/workspace/QueryState";
import VacancyForm, { emptyDraft, toPayload, type VacancyDraft } from "@/components/workspace/VacancyForm";
import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";
import { queryClient } from "@/queryClient";

/**
 * Post a vacancy.
 *
 * Save and publish are two buttons, not one. A school that is still deciding the
 * salary should be able to keep a draft, and an unverified school can save but
 * cannot publish — which the backend enforces and which this surfaces as the
 * message rather than as a failed button.
 */
export default function NewSchoolVacancy() {
  const router = useRouter();
  const school = useQuery({ queryKey: ["school", "profile"], queryFn: ApiController.getSchool });
  const facets = useQuery({
    queryKey: ["public", "facets"],
    queryFn: ApiController.getVacancyFacets,
    staleTime: 10 * 60 * 1000,
  });
  const [draft, setDraft] = useState<VacancyDraft>(emptyDraft());

  // Seeded from the school once it loads: its city and type are right far more
  // often than not, and a form that starts blank is a form that gets them wrong.
  const [seeded, setSeeded] = useState(false);
  if (school.data && !seeded) {
    setDraft((current) => ({
      ...current,
      city: current.city || school.data.city,
      state: current.state || school.data.state,
      institution_type: school.data.institution_type,
      board: current.board || school.data.board,
    }));
    setSeeded(true);
  }

  function fail(error: unknown) {
    if (error instanceof ClientError && error.errors) {
      toast.error(Object.values(error.errors)[0] ?? error.message);
      return;
    }
    toast.error(error instanceof Error ? error.message : "That did not save.");
  }

  const create = useMutation({
    mutationFn: () => ApiController.createSchoolVacancy(toPayload(draft)),
    onError: fail,
  });

  async function save(publish: boolean) {
    const vacancy = await create.mutateAsync();
    if (publish) {
      try {
        const answer = await ApiController.schoolVacancyAction(vacancy.id, "publish");
        toast.success(answer.message || "Published.");
      } catch (error) {
        // The draft is saved either way — a school whose institution is not yet
        // verified must not lose the form they just filled in.
        if (error instanceof ClientError) {
          toast.info(`Saved as a draft. ${error.message}`);
        } else {
          fail(error);
        }
      }
    } else {
      toast.success("Saved as a draft.");
    }
    queryClient.invalidateQueries({ queryKey: ["school"] });
    router.push("/school/vacancies");
  }

  const ready = Boolean(draft.title && draft.post && draft.city);

  return (
    <QueryState isLoading={school.isLoading} error={school.error} loadingLabel="Loading">
      {school.data ? (
        <>
          <Column className="gap-1">
            <h2 className="font-display text-lg font-bold text-ink-1">Post a vacancy</h2>
            <p className="text-sm text-ink-2">
              The card on the right is what teachers will see. Matching teachers get a
              notification when it goes live.
            </p>
          </Column>

          <VacancyForm
            draft={draft}
            onChange={setDraft}
            facets={facets.data ?? null}
            institutionName={school.data.name}
            institutionInitials={school.data.initials}
          />

          <Row className="sticky bottom-0 flex-wrap items-center justify-end gap-2.5 border-t border-line bg-paper/95 py-3 backdrop-blur">
            {!ready ? (
              <span className="mr-auto text-sm text-ink-3">A title, a post and a city are needed.</span>
            ) : null}
            <button
              type="button"
              onClick={() => save(false)}
              disabled={!ready || create.isPending}
              className="btn btn-outline"
            >
              Save as a draft
            </button>
            <button
              type="button"
              onClick={() => save(true)}
              disabled={!ready || create.isPending}
              className="btn btn-accent"
            >
              {create.isPending ? "Saving…" : "Publish it"}
            </button>
          </Row>
        </>
      ) : null}
    </QueryState>
  );
}
