"use client";

import { ArrowRightIcon, CalendarDaysIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import QueryState from "@/components/workspace/QueryState";
import StageBadge from "@/components/workspace/StageBadge";
import StatCard from "@/components/workspace/StatCard";
import VerificationBanner from "@/components/workspace/VerificationBanner";
import ApiController from "@/networking";

/**
 * "Live posts, new applicants with one-click shortlist, demo classes this week, and
 * the banner telling them their affiliation certificate is still outstanding."
 *
 * One request, because that is four cards and a list and four requests would be
 * four spinners on the screen a school opens first.
 */
export default function SchoolDashboard() {
  const dashboard = useQuery({
    queryKey: ["school", "dashboard"],
    queryFn: ApiController.getSchoolDashboard,
  });

  return (
    <QueryState isLoading={dashboard.isLoading} error={dashboard.error} loadingLabel="Loading your dashboard">
      {dashboard.data ? (
        <>
          <VerificationBanner school={dashboard.data.school} />

          <Row className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Live vacancies"
              value={dashboard.data.counts.live_vacancies}
              note={`${dashboard.data.counts.total_vacancies} posted in all`}
              href="/school/vacancies"
              tone="accent"
            />
            <StatCard
              label="New applicants"
              value={dashboard.data.counts.new_applications}
              note="Not yet looked at"
              href="/school/applicants?stage=applied"
              tone={dashboard.data.counts.new_applications > 0 ? "warn" : "plain"}
            />
            <StatCard
              label="In progress"
              value={dashboard.data.counts.in_progress}
              note="Shortlisted through to offered"
              href="/school/applicants?stage=open"
            />
            <StatCard
              label="Demo classes this week"
              value={dashboard.data.counts.demo_classes_this_week}
            />
          </Row>

          {dashboard.data.demo_classes.length ? (
            <Column className="card gap-3 p-4 sm:p-5">
              <Row className="items-center gap-2">
                <CalendarDaysIcon aria-hidden className="h-5 w-5 text-accent" />
                <h2 className="font-display text-base font-bold text-ink-1">Demo classes this week</h2>
              </Row>
              <Column className="gap-2">
                {dashboard.data.demo_classes.map((demo) => (
                  <Row
                    key={demo.id}
                    className="flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"
                  >
                    <Column className="min-w-0 gap-0.5">
                      <span className="truncate text-sm font-semibold text-ink-1">
                        {demo.teacher_name || "A teacher"} · {demo.vacancy_title}
                      </span>
                      <span className="text-xs text-ink-3">
                        {demo.topic}
                        {demo.grade ? ` · ${demo.grade}` : ""} · {demo.duration_minutes} min
                      </span>
                    </Column>
                    <span className="chip chip-accent">
                      {new Date(demo.scheduled_at).toLocaleString("en-IN", {
                        weekday: "short", day: "numeric", month: "short",
                        hour: "numeric", minute: "2-digit",
                      })}
                    </span>
                  </Row>
                ))}
              </Column>
            </Column>
          ) : null}

          <Column className="gap-3">
            <Row className="items-end justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-ink-1">New applicants</h2>
              <Link href="/school/applicants" className="text-sm font-semibold text-accent hover:underline">
                See all
              </Link>
            </Row>
            {dashboard.data.new_applications.length ? (
              <Column className="gap-2.5">
                {dashboard.data.new_applications.map((row) => (
                  <Link
                    key={row.id}
                    href={`/school/applicants?open=${row.id}`}
                    className="card block p-4 hover:shadow-[var(--shadow-pop)]"
                  >
                    <Row className="flex-wrap items-center justify-between gap-3">
                      <Column className="min-w-0 gap-0.5">
                        <span className="truncate font-semibold text-ink-1">{row.teacher.name}</span>
                        <span className="truncate text-sm text-ink-3">
                          {row.teacher.post_label}
                          {row.teacher.subjects.length ? ` · ${row.teacher.subjects.join(", ")}` : ""}
                          {` · ${row.teacher.experience_label}`}
                        </span>
                        <span className="truncate text-xs text-ink-3">for {row.vacancy_title}</span>
                      </Column>
                      <Row className="items-center gap-2">
                        {row.documents_pending.length === 0 ? (
                          <span className="chip chip-ok">Documents verified</span>
                        ) : (
                          <span className="chip chip-warn">
                            {row.documents_pending.length} document{row.documents_pending.length === 1 ? "" : "s"} pending
                          </span>
                        )}
                        <StageBadge stage={row.stage} label={row.stage_label} />
                      </Row>
                    </Row>
                  </Link>
                ))}
              </Column>
            ) : (
              <Column className="card gap-2 p-5">
                <p className="text-sm text-ink-2">
                  No new applicants. Teachers see your live posts the moment they are
                  published, and matching ones get a notification.
                </p>
                <Link href="/school/vacancies/new" className="w-fit btn btn-accent">
                  Post a vacancy <ArrowRightIcon aria-hidden className="h-4 w-4" />
                </Link>
              </Column>
            )}
          </Column>
        </>
      ) : null}
    </QueryState>
  );
}
