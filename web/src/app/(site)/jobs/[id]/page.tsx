import { ArrowLeftIcon, CheckIcon } from "@heroicons/react/24/outline";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import { serverGet } from "@/networking/server";
import type { VacancyDetail } from "@/networking/types";

/**
 * One vacancy, as a page rather than the demo's side panel.
 *
 * A panel cannot be linked to, and a vacancy link is the single most shared thing
 * on this site — it goes into WhatsApp groups. A page also gets its own title,
 * description and JobPosting structured data, which is how it appears in Google's
 * jobs results at all.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const vacancy = await serverGet<VacancyDetail>(`/v1/public/vacancies/${id}/`, { revalidate: 120 });
  if (!vacancy) return { title: "Vacancy not found" };
  return {
    title: `${vacancy.title} — ${vacancy.institution}, ${vacancy.city}`,
    description:
      vacancy.description?.slice(0, 180) ||
      `${vacancy.post_label} vacancy at ${vacancy.institution}, ${vacancy.city}. ${vacancy.qualification}.`,
    alternates: { canonical: `/jobs/${id}` },
  };
}

export default async function VacancyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vacancy = await serverGet<VacancyDetail>(`/v1/public/vacancies/${id}/`, { revalidate: 60 });
  if (!vacancy) notFound();

  return (
    <Column className="mx-auto w-full max-w-4xl gap-7 px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/jobs" className="flex w-fit items-center gap-1.5 text-sm font-semibold text-ink-3 hover:text-accent">
        <ArrowLeftIcon aria-hidden className="h-4 w-4" />
        All vacancies
      </Link>

      <Column className="card gap-5 p-5 sm:p-7">
        <Row className="items-start gap-4">
          {vacancy.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vacancy.logo} alt="" className="h-14 w-14 rounded-xl border border-line object-contain" />
          ) : (
            <span
              aria-hidden
              className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-deep text-sm font-bold tracking-wide text-deep-ink"
            >
              {vacancy.initials}
            </span>
          )}
          <Column className="min-w-0 gap-1.5">
            <Row className="flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-extrabold text-ink-1 sm:text-3xl">{vacancy.title}</h1>
              {vacancy.is_new ? <span className="chip chip-accent">New</span> : null}
            </Row>
            <p className="text-[15px] text-ink-2">
              {vacancy.institution} · {vacancy.city}
              {vacancy.locality ? `, ${vacancy.locality}` : ""}
            </p>
          </Column>
        </Row>

        {/* Qualification above salary — the first thing that disqualifies
            someone goes first. */}
        <Column className="gap-3 rounded-xl bg-surface-2 p-4">
          {vacancy.qualification ? (
            <Row className="flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-3">Qualification</span>
              <span className="text-[15px] font-bold text-ink-1">{vacancy.qualification}</span>
            </Row>
          ) : null}
          <Row className="flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-3">Salary</span>
            <span className="text-[15px] font-bold text-accent">
              {vacancy.salary}
              {vacancy.salary_note ? (
                <span className="pl-2 text-xs font-medium text-ink-3">{vacancy.salary_note}</span>
              ) : null}
            </span>
          </Row>
          <Row className="flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-3">Experience</span>
            <span className="text-[15px] font-semibold text-ink-1">{vacancy.experience_label}</span>
          </Row>
        </Column>

        <Row className="flex-wrap gap-2">
          <span className="chip">{vacancy.post_label}</span>
          {vacancy.subject ? <span className="chip">{vacancy.subject}</span> : null}
          {vacancy.grades ? <span className="chip">Classes {vacancy.grades}</span> : null}
          {vacancy.board_label ? <span className="chip">{vacancy.board_label}</span> : null}
          <span className="chip">{vacancy.institution_label}</span>
          {vacancy.openings > 1 ? <span className="chip">{vacancy.openings} openings</span> : null}
        </Row>

        <Row className="flex-col gap-2.5 sm:flex-row">
          <Link href={`/login?as=teacher&next=/teacher/vacancies/${vacancy.id}`} className="btn btn-accent">
            Apply for this post
          </Link>
          <Link href="/register?as=teacher" className="btn btn-outline">
            Register as a teacher
          </Link>
        </Row>
      </Column>

      {vacancy.description ? (
        <Column className="gap-2">
          <h2 className="font-display text-lg font-bold text-ink-1">About the post</h2>
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{vacancy.description}</p>
        </Column>
      ) : null}

      {vacancy.duties?.length ? <Bullets title="What you will teach" items={vacancy.duties} /> : null}
      {vacancy.requirements?.length ? <Bullets title="What they are looking for" items={vacancy.requirements} /> : null}

      {vacancy.demo_class ? (
        <Column className="card gap-2 border-accent/30 bg-accent-soft p-5">
          <h2 className="font-display text-lg font-bold text-ink-1">How the selection works</h2>
          <p className="text-[15px] leading-relaxed text-ink-2">{vacancy.demo_class}</p>
          <p className="text-sm text-ink-3">
            The topic and the grade are fixed in advance. You get both in the app the moment the date
            is set.
          </p>
        </Column>
      ) : null}

      {/*
        JobPosting structured data. This is what puts a vacancy into Google's jobs
        results rather than only its web results, and it is the single highest-value
        thing on the page for a recruitment site.

        Serialised with JSON.stringify so the backend's own text cannot break out
        of the script tag — a vacancy description containing "</script>" would
        otherwise end it.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "JobPosting",
            title: vacancy.title,
            description: [vacancy.description, ...(vacancy.duties ?? []), ...(vacancy.requirements ?? [])]
              .filter(Boolean)
              .join(" "),
            datePosted: vacancy.published_at,
            validThrough: vacancy.closes_on || undefined,
            employmentType: "FULL_TIME",
            hiringOrganization: { "@type": "Organization", name: vacancy.institution },
            jobLocation: {
              "@type": "Place",
              address: {
                "@type": "PostalAddress",
                addressLocality: vacancy.city,
                addressRegion: vacancy.state || undefined,
                addressCountry: "IN",
              },
            },
            ...(vacancy.salary_min_lpa && !vacancy.salary.startsWith("Not")
              ? {
                  baseSalary: {
                    "@type": "MonetaryAmount",
                    currency: "INR",
                    value: {
                      "@type": "QuantitativeValue",
                      // LPA → the per-year rupee figure Google expects.
                      minValue: Number(vacancy.salary_min_lpa) * 100000,
                      maxValue: Number(vacancy.salary_max_lpa ?? vacancy.salary_min_lpa) * 100000,
                      unitText: "YEAR",
                    },
                  },
                }
              : {}),
          }).replace(/</g, "\\u003c"),
        }}
      />
    </Column>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  return (
    <Column className="gap-3">
      <h2 className="font-display text-lg font-bold text-ink-1">{title}</h2>
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
