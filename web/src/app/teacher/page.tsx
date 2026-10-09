"use client";

import { ArrowRightIcon, CalendarDaysIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import VacancyCard from "@/components/site/VacancyCard";
import ProgressBar from "@/components/workspace/ProgressBar";
import QueryState from "@/components/workspace/QueryState";
import StageBadge from "@/components/workspace/StageBadge";
import StatCard from "@/components/workspace/StatCard";
import ApiController from "@/networking";

/**
 * The teacher's dashboard.
 *
 * "Matching vacancies with an Apply button, the demo class with its date and topic,
 * and how much of the profile is still missing."
 *
 * Three queries rather than one combined endpoint, because each has a different
 * lifetime: the profile changes when they edit it, the matches change when the
 * office publishes, and the applications change when a school moves one. A single
 * payload would refetch all three every time any of them moved.
 */
export default function TeacherDashboard() {
  const profile = useQuery({
    queryKey: ["teacher", "profile"],
    queryFn: ApiController.getTeacherProfile,
  });
  const matching = useQuery({
    queryKey: ["teacher", "vacancies", "matching"],
    queryFn: () => ApiController.getMatchingVacancies(),
  });
  const applications = useQuery({
    queryKey: ["teacher", "applications"],
    queryFn: () => ApiController.getMyApplications(),
  });

  const open = (applications.data?.results ?? []).filter(
    (row) => !["joined", "rejected", "withdrawn"].includes(row.stage),
  );
  // The nearest demo class across every application — the thing a teacher opens
  // this page to check.
  const demo = (applications.data?.results ?? [])
    .map((row) => (row.demo_class ? { row, demo: row.demo_class } : null))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .filter((entry) => entry.demo.status === "scheduled")
    .sort((a, b) => a.demo.scheduled_at.localeCompare(b.demo.scheduled_at))[0];

  return (
    <>
      {/* The profile prompt, first — "ninety percent done, one reference to go". */}
      {profile.data && profile.data.completeness < 100 ? (
        <Column className="card gap-3 p-4 sm:p-5">
          <Row className="flex-wrap items-start justify-between gap-3">
            <Column className="gap-1">
              <h2 className="font-display text-base font-bold text-ink-1">Finish your profile</h2>
              <p className="text-sm text-ink-2">
                {profile.data.missing_documents.length
                  ? `Still to upload: ${profile.data.missing_documents.join(", ")}.`
                  : "A fuller profile is the first thing a school reads."}
              </p>
            </Column>
            <Link href="/teacher/profile" className="btn btn-accent">
              Finish it <ArrowRightIcon aria-hidden className="h-4 w-4" />
            </Link>
          </Row>
          <ProgressBar value={profile.data.completeness} label="Profile" />
        </Column>
      ) : null}

      {demo ? (
        <Column className="card gap-3 border-accent/30 bg-accent-soft p-4 sm:p-5">
          <Row className="items-center gap-2">
            <CalendarDaysIcon aria-hidden className="h-5 w-5 text-accent" />
            <h2 className="font-display text-base font-bold text-ink-1">Your demo class</h2>
          </Row>
          <Column className="gap-1">
            <span className="font-display text-lg font-extrabold text-ink-1">
              {new Date(demo.demo.scheduled_at).toLocaleString("en-IN", {
                weekday: "short", day: "numeric", month: "short",
                hour: "numeric", minute: "2-digit",
              })}
            </span>
            <p className="text-sm text-ink-2">
              {demo.demo.topic}
              {demo.demo.grade ? ` · ${demo.demo.grade}` : ""} · {demo.demo.duration_minutes} minutes
            </p>
            <p className="text-sm text-ink-2">
              {demo.row.vacancy.institution}, {demo.row.vacancy.city}
              {demo.demo.mode === "online" ? " · online" : ""}
            </p>
          </Column>
          <Link href={`/teacher/applications`} className="w-fit text-sm font-semibold text-accent hover:underline">
            See the application →
          </Link>
        </Column>
      ) : null}

      <Row className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Matching vacancies"
          value={matching.data?.count ?? "—"}
          note="You qualify for these"
          href="/teacher/vacancies"
          tone="accent"
        />
        <StatCard
          label="Applications in progress"
          value={open.length}
          note={`${applications.data?.count ?? 0} in total`}
          href="/teacher/applications"
        />
        <StatCard
          label="Profile"
          value={profile.data ? `${profile.data.completeness}%` : "—"}
          note={profile.data?.verification === "verified" ? "Verified by the office" : "Awaiting verification"}
          href="/teacher/profile"
        />
      </Row>

      {open.length ? (
        <Column className="gap-3">
          <h2 className="font-display text-lg font-bold text-ink-1">Where your applications are</h2>
          <Column className="gap-2.5">
            {open.slice(0, 4).map((row) => (
              <Link key={row.id} href="/teacher/applications" className="card block p-4 hover:shadow-[var(--shadow-pop)]">
                <Row className="flex-wrap items-center justify-between gap-3">
                  <Column className="min-w-0 gap-0.5">
                    <span className="truncate font-semibold text-ink-1">{row.vacancy.title}</span>
                    <span className="truncate text-sm text-ink-3">
                      {row.vacancy.institution} · {row.vacancy.city}
                    </span>
                  </Column>
                  <StageBadge stage={row.stage} label={row.stage_label} />
                </Row>
              </Link>
            ))}
          </Column>
        </Column>
      ) : null}

      <Column className="gap-3">
        <Row className="items-end justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-ink-1">Vacancies you qualify for</h2>
          <Link href="/teacher/vacancies" className="text-sm font-semibold text-accent hover:underline">
            See all
          </Link>
        </Row>
        <QueryState
          isLoading={matching.isLoading}
          error={matching.error}
          isEmpty={(matching.data?.results ?? []).length === 0}
          emptyTitle="No matches just now"
          emptyHint="We match on your post, your subjects and your city. Widen your cities or tick “I would move” on your profile to see more."
          action={<Link href="/teacher/profile" className="btn btn-outline">Edit my profile</Link>}
        >
          <Column className="gap-3">
            {(matching.data?.results ?? []).slice(0, 5).map((vacancy) => (
              <VacancyCard key={vacancy.id} vacancy={vacancy} href={`/teacher/vacancies/${vacancy.id}`} />
            ))}
          </Column>
        </QueryState>
      </Column>
    </>
  );
}
