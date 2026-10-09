"use client";

import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import QueryState from "@/components/workspace/QueryState";
import StageBadge from "@/components/workspace/StageBadge";
import StatCard from "@/components/workspace/StatCard";
import ApiController from "@/networking";

/**
 * "Live vacancies, new applications, the hiring pipeline for the session, and every
 * demo class booked this week."
 *
 * The order answers "what should the office do today". The things waiting on staff —
 * posts awaiting review, documents to check, institutions to verify, unanswered
 * enquiries — are above the pipeline, because the pipeline is information and those
 * are work.
 */
export default function PanelDashboard() {
  const dashboard = useQuery({
    queryKey: ["panel", "dashboard"],
    queryFn: ApiController.getDashboard,
    // The screen the office leaves open all day. 30s keeps "I just verified that"
    // honest without hammering the box.
    refetchInterval: 60_000,
  });

  const counts = dashboard.data?.counts;
  const waiting = counts
    ? counts.awaiting_review + counts.documents_pending + counts.schools_unverified + counts.new_enquiries
    : 0;

  return (
    <QueryState isLoading={dashboard.isLoading} error={dashboard.error} loadingLabel="Loading the dashboard">
      {dashboard.data && counts ? (
        <>
          {waiting > 0 ? (
            <Column className="card gap-3 border-warn/40 bg-warn-soft p-4 sm:p-5">
              <h2 className="font-display text-base font-bold text-ink-1">Waiting on the office</h2>
              <Row className="flex-wrap gap-2">
                {counts.awaiting_review > 0 ? (
                  <Link href="/panel/vacancies?status=pending_review" className="chip chip-warn">
                    {counts.awaiting_review} vacancies to review
                  </Link>
                ) : null}
                {counts.documents_pending > 0 ? (
                  <Link href="/panel/teachers?verification=pending" className="chip chip-warn">
                    {counts.documents_pending} documents to check
                  </Link>
                ) : null}
                {counts.schools_unverified > 0 ? (
                  <Link href="/panel/schools?status=pending" className="chip chip-warn">
                    {counts.schools_unverified} institutions to verify
                  </Link>
                ) : null}
                {counts.new_enquiries > 0 ? (
                  <Link href="/panel/enquiries?status=new" className="chip chip-warn">
                    {counts.new_enquiries} new enquiries
                  </Link>
                ) : null}
              </Row>
            </Column>
          ) : null}

          <Row className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Live vacancies"
              value={counts.live_vacancies}
              href="/panel/vacancies?status=open"
              tone="accent"
            />
            <StatCard
              label="New applications"
              value={counts.new_applications}
              note="Not yet worked"
              href="/panel/applications?stage=applied"
              tone={counts.new_applications > 0 ? "warn" : "plain"}
            />
            <StatCard
              label="In the pipeline"
              value={counts.in_pipeline}
              href="/panel/applications?stage=open"
            />
            <StatCard
              label="Placed this month"
              value={counts.placed_this_month}
              href="/panel/applications?stage=joined"
            />
            <StatCard label="Teachers" value={counts.teachers} note={`${counts.teachers_unverified} unverified`} href="/panel/teachers" />
            <StatCard label="Institutions" value={counts.schools} note={`${counts.schools_unverified} unverified`} href="/panel/schools" />
            <StatCard label="Demo classes this week" value={counts.demo_classes_this_week} href="/panel/applications" />
            <StatCard label="Enquiries" value={counts.new_enquiries} note="New" href="/panel/enquiries" />
          </Row>

          {/* The pipeline as a row of counts rather than a chart: with eight stages
              and tens of rows, the number IS the information, and a bar chart of
              eight bars takes more space to say less. */}
          <Column className="card gap-3 p-4 sm:p-5">
            <h2 className="font-display text-base font-bold text-ink-1">The pipeline</h2>
            <Row className="flex-wrap gap-2">
              {dashboard.data.pipeline.map((step) => (
                <Link
                  key={step.stage}
                  href={`/panel/applications?stage=${step.stage}`}
                  className="min-w-[7rem] flex-1 rounded-xl border border-line p-3 hover:border-accent"
                >
                  <Column className="gap-0.5">
                    <span className="font-display text-xl font-extrabold text-ink-1">{step.count}</span>
                    <span className="text-xs text-ink-3">{step.label}</span>
                  </Column>
                </Link>
              ))}
            </Row>
          </Column>

          {dashboard.data.needs_attention.length ? (
            <Column className="gap-3">
              <h2 className="font-display text-lg font-bold text-ink-1">Posts with people waiting</h2>
              <Column className="gap-2.5">
                {dashboard.data.needs_attention.map((vacancy) => (
                  <Link
                    key={vacancy.id}
                    href={`/panel/applications?vacancy=${vacancy.id}&stage=applied`}
                    className="card block p-4 hover:shadow-[var(--shadow-pop)]"
                  >
                    <Row className="flex-wrap items-center justify-between gap-3">
                      <Column className="min-w-0 gap-0.5">
                        <span className="truncate font-semibold text-ink-1">{vacancy.title}</span>
                        <span className="truncate text-sm text-ink-3">
                          {vacancy.institution} · {vacancy.city}
                          {vacancy.consultant_name ? ` · ${vacancy.consultant_name}` : " · unassigned"}
                        </span>
                      </Column>
                      <span className="chip chip-warn">
                        {vacancy.new_applications} waiting of {vacancy.applications_count}
                      </span>
                    </Row>
                  </Link>
                ))}
              </Column>
            </Column>
          ) : null}

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
              <h2 className="font-display text-lg font-bold text-ink-1">New applications</h2>
              <Link href="/panel/applications" className="text-sm font-semibold text-accent hover:underline">
                See all
              </Link>
            </Row>
            <Column className="gap-2.5">
              {dashboard.data.new_applications.map((row) => (
                <Link
                  key={row.id}
                  href={`/panel/applications?open=${row.id}`}
                  className="card block p-4 hover:shadow-[var(--shadow-pop)]"
                >
                  <Row className="flex-wrap items-center justify-between gap-3">
                    <Column className="min-w-0 gap-0.5">
                      <span className="truncate font-semibold text-ink-1">{row.teacher.name}</span>
                      <span className="truncate text-sm text-ink-3">
                        {row.vacancy_title} · {row.school_name}
                      </span>
                    </Column>
                    <Row className="items-center gap-2">
                      {row.documents_pending.length ? (
                        <span className="chip chip-warn">{row.documents_pending.length} to verify</span>
                      ) : (
                        <span className="chip chip-ok">Documents done</span>
                      )}
                      <StageBadge stage={row.stage} label={row.stage_label} />
                    </Row>
                  </Row>
                </Link>
              ))}
            </Column>
          </Column>
        </>
      ) : null}
    </QueryState>
  );
}
