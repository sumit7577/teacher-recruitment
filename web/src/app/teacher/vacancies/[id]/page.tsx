"use client";

import { ArrowLeftIcon, CheckIcon } from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import QueryState from "@/components/workspace/QueryState";
import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";
import { queryClient } from "@/queryClient";

/**
 * One vacancy, with the Apply button.
 *
 * The teacher endpoint rather than the public one, because it answers `has_applied`
 * — without it the page shows an Apply button that fails on the unique constraint,
 * and a 409 reads as a bug rather than as "you already did this".
 */
export default function TeacherVacancyPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const [note, setNote] = useState("");

  const vacancy = useQuery({
    queryKey: ["teacher", "vacancy", id],
    queryFn: () => ApiController.getTeacherVacancy(id),
    enabled: Boolean(id),
  });

  const apply = useMutation({
    mutationFn: () => ApiController.apply(id, note),
    onSuccess: () => {
      toast.success("Applied. You will see the stage change here and in your applications.");
      queryClient.invalidateQueries({ queryKey: ["teacher"] });
      router.push("/teacher/applications");
    },
    onError: (error: unknown) => {
      // `cv_missing` is the one error with an action attached, so it gets a link
      // rather than a toast that tells them off and leaves them where they are.
      if (error instanceof ClientError && error.code === "cv_missing") {
        toast.error(error.message);
        router.push("/teacher/profile?focus=documents");
        return;
      }
      toast.error(error instanceof Error ? error.message : "That did not go through.");
    },
  });

  return (
    <QueryState isLoading={vacancy.isLoading} error={vacancy.error} loadingLabel="Loading the vacancy">
      {vacancy.data ? (
        <>
          <Link
            href="/teacher/vacancies"
            className="flex w-fit items-center gap-1.5 text-sm font-semibold text-ink-3 hover:text-accent"
          >
            <ArrowLeftIcon aria-hidden className="h-4 w-4" />
            Back to vacancies
          </Link>

          <Column className="card gap-5 p-5 sm:p-6">
            <Row className="items-start gap-4">
              <span
                aria-hidden
                className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-deep text-sm font-bold text-deep-ink"
              >
                {vacancy.data.initials}
              </span>
              <Column className="min-w-0 gap-1">
                <h2 className="font-display text-xl font-extrabold text-ink-1 sm:text-2xl">
                  {vacancy.data.title}
                </h2>
                <p className="text-[15px] text-ink-2">
                  {vacancy.data.institution} · {vacancy.data.city}
                </p>
              </Column>
            </Row>

            <Column className="gap-2.5 rounded-xl bg-surface-2 p-4">
              <Detail label="Qualification" value={vacancy.data.qualification || "—"} />
              <Detail label="Salary" value={vacancy.data.salary} accent />
              <Detail label="Experience" value={vacancy.data.experience_label} />
              {vacancy.data.grades ? <Detail label="Classes" value={vacancy.data.grades} /> : null}
            </Column>

            {vacancy.data.has_applied ? (
              <Row className="flex-wrap items-center gap-3 rounded-xl bg-ok-soft p-4">
                <CheckIcon aria-hidden className="h-5 w-5 text-ok" />
                <Column className="min-w-0 gap-0.5">
                  <span className="font-semibold text-ink-1">You have applied for this post</span>
                  <span className="text-sm text-ink-2">
                    Stage: {vacancy.data.application?.stage ?? "applied"}
                  </span>
                </Column>
                <Link href="/teacher/applications" className="btn btn-outline ml-auto">
                  See my applications
                </Link>
              </Row>
            ) : (
              <Column className="gap-3">
                <Column className="gap-0">
                  <label htmlFor="note" className="label">
                    Anything you want the school to know (optional)
                  </label>
                  <textarea
                    id="note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    placeholder="Available from April. Board results for XII since 2022."
                    className="field resize-y"
                  />
                </Column>
                <button
                  type="button"
                  onClick={() => apply.mutate()}
                  disabled={apply.isPending}
                  className="btn btn-accent w-full sm:w-auto"
                >
                  {apply.isPending ? "Applying…" : "Apply — your CV and certificates go with it"}
                </button>
              </Column>
            )}
          </Column>

          {vacancy.data.description ? (
            <Column className="gap-2">
              <h3 className="font-display text-base font-bold text-ink-1">About the post</h3>
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink-2">
                {vacancy.data.description}
              </p>
            </Column>
          ) : null}

          {vacancy.data.duties?.length ? <Bullets title="What you will teach" items={vacancy.data.duties} /> : null}
          {vacancy.data.requirements?.length ? (
            <Bullets title="What they are looking for" items={vacancy.data.requirements} />
          ) : null}

          {vacancy.data.demo_class ? (
            <Column className="card gap-1.5 border-accent/30 bg-accent-soft p-5">
              <h3 className="font-display text-base font-bold text-ink-1">How the selection works</h3>
              <p className="text-[15px] leading-relaxed text-ink-2">{vacancy.data.demo_class}</p>
            </Column>
          ) : null}
        </>
      ) : null}
    </QueryState>
  );
}

function Detail({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Row className="flex-wrap items-baseline justify-between gap-2">
      <span className="text-xs font-bold uppercase tracking-wide text-ink-3">{label}</span>
      <span className={accent ? "text-[15px] font-bold text-accent" : "text-[15px] font-semibold text-ink-1"}>
        {value}
      </span>
    </Row>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  return (
    <Column className="gap-2.5">
      <h3 className="font-display text-base font-bold text-ink-1">{title}</h3>
      <Column as="ul" className="gap-2">
        {items.map((item) => (
          <Row as="li" key={item} className="items-start gap-2.5">
            <CheckIcon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span className="text-[15px] leading-relaxed text-ink-2">{item}</span>
          </Row>
        ))}
      </Column>
    </Column>
  );
}
