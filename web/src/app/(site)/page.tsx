import {
  AcademicCapIcon,
  ArrowRightIcon,
  CheckBadgeIcon,
  DocumentCheckIcon,
  PresentationChartBarIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import HomeSearch from "@/components/site/HomeSearch";
import VacancyCard from "@/components/site/VacancyCard";
import FaqSection from "@/components/site/FaqSection";
import StoriesSection from "@/components/site/StoriesSection";
import { serverGet, serverGetData } from "@/networking/server";
import type { Paginated, PublicSiteResp, VacancyCard as Vacancy, VacancyFacets } from "@/networking/types";

/**
 * Home.
 *
 * Server-rendered in one pass: the three fetches below run in parallel and the
 * page ships as HTML, which is the whole point of putting the marketing site on
 * Next rather than in the client bundle.
 *
 * Every number on this page is live. "47 vacancies" printed over an empty board
 * is the worst possible first impression, and a hard-coded figure becomes that
 * the first week nobody updates it.
 */
export default async function HomePage() {
  const [site, facets, featured] = await Promise.all([
    serverGetData<PublicSiteResp>("/v1/public/site/", { revalidate: 300 }),
    serverGetData<VacancyFacets>("/v1/public/vacancies/filters/", { revalidate: 120 }),
    serverGet<Paginated<Vacancy>>("/v1/public/vacancies/?only=featured", { revalidate: 120 }),
  ]);

  const settings = site?.settings ?? null;
  const live = site?.live_vacancies ?? 0;
  const posts = facets?.taxonomy.posts ?? [];
  const cities = facets?.city ?? [];
  const testimonial = (site?.testimonials ?? [])[0] ?? null;
  // Featured first; if the client has not featured anything yet the newest posts
  // are a better Home page than an empty section.
  const cards = (featured?.results ?? []).slice(0, 4);

  return (
    <>
      {/* ── hero ─────────────────────────────────────────────────────────── */}
      <section className="bg-deep text-deep-ink">
        <Column className="mx-auto w-full max-w-6xl gap-7 px-4 py-14 sm:px-6 sm:py-20">
          <Column className="max-w-3xl gap-4">
            {live > 0 ? (
              <Row className="w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[13px] font-semibold">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
                {live} {live === 1 ? "vacancy" : "vacancies"} open now
              </Row>
            ) : null}
            <h1 className="font-display text-3xl font-extrabold leading-[1.1] sm:text-5xl">
              {settings?.about_heading || "Teachers for schools, colleges and universities"}
            </h1>
            <p className="max-w-2xl text-[15px] leading-relaxed text-white/75 sm:text-lg">
              {settings?.tagline ||
                "Pre-primary to principal. Qualifications verified, demo classes arranged, and the post filled before the session starts."}
            </p>
          </Column>

          <div className="max-w-3xl">
            <HomeSearch cities={cities} />
          </div>

          {settings?.stats?.length ? (
            <Row className="flex-wrap gap-x-10 gap-y-5 pt-2">
              {settings.stats.map((stat) => (
                <Column key={stat.label} className="gap-0.5">
                  <span className="font-display text-2xl font-extrabold sm:text-3xl">{stat.value}</span>
                  <span className="text-[13px] font-medium text-white/70">{stat.label}</span>
                  {stat.note ? <span className="text-xs text-white/50">{stat.note}</span> : null}
                </Column>
              ))}
            </Row>
          ) : null}
        </Column>
      </section>

      {/* ── how it works, for teachers ───────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <Column className="gap-8">
          <Column className="max-w-2xl gap-2">
            <h2 className="font-display text-2xl font-extrabold text-ink-1 sm:text-3xl">
              One profile. Every vacancy you qualify for.
            </h2>
            <p className="text-[15px] text-ink-2">
              Upload your CV and certificates once. You see only the posts that match your
              qualification, and you apply in a single tap.
            </p>
          </Column>

          <Row className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            {[
              {
                Icon: AcademicCapIcon,
                title: "Matched on qualification",
                body: "B.Ed, D.El.Ed, NTT, CTET, NET, SET, PhD or RCI — we filter by what you hold, not by keywords.",
              },
              {
                Icon: DocumentCheckIcon,
                title: "Documents checked once",
                body: "Your certificates are verified by our office and reused for every application.",
              },
              {
                Icon: PresentationChartBarIcon,
                title: "Demo class, prepared",
                body: "You get the topic and the grade in advance — in the app, the moment it is fixed.",
              },
            ].map(({ Icon, title, body }) => (
              <Column key={title} className="card gap-3 p-5">
                <span aria-hidden className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft">
                  <Icon className="h-5 w-5 text-accent" />
                </span>
                <h3 className="font-display text-base font-bold text-ink-1">{title}</h3>
                <p className="text-sm leading-relaxed text-ink-2">{body}</p>
              </Column>
            ))}
          </Row>
        </Column>
      </section>

      {/* ── featured vacancies ───────────────────────────────────────────── */}
      {cards.length ? (
        <section className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6">
          <Column className="gap-6">
            <Row className="flex-wrap items-end justify-between gap-3">
              <Column className="gap-1">
                <h2 className="font-display text-2xl font-extrabold text-ink-1 sm:text-3xl">
                  Open vacancies
                </h2>
                <p className="text-[15px] text-ink-2">Every post is verified before it is listed.</p>
              </Column>
              <Link href="/jobs" className="btn btn-outline">
                See all {live} <ArrowRightIcon aria-hidden className="h-4 w-4" />
              </Link>
            </Row>
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              {cards.map((vacancy) => (
                <VacancyCard key={vacancy.id} vacancy={vacancy} />
              ))}
            </div>
          </Column>
        </section>
      ) : null}

      {/* ── the posts we fill ────────────────────────────────────────────── */}
      {posts.length ? (
        <section className="border-y border-line bg-surface">
          <Column className="mx-auto w-full max-w-6xl gap-6 px-4 py-14 sm:px-6">
            <Column className="max-w-2xl gap-2">
              <h2 className="font-display text-2xl font-extrabold text-ink-1 sm:text-3xl">
                The posts we fill
              </h2>
              <p className="text-[15px] text-ink-2">
                The way a principal thinks about a vacancy — not a list of job categories.
              </p>
            </Column>
            <Row className="flex-wrap gap-2.5">
              {posts.map((post) => {
                const tally = facets?.post.find((entry) => entry.value === post.value)?.count ?? 0;
                return (
                  <Link
                    key={post.value}
                    href={`/jobs?post=${post.value}`}
                    className="chip hover:border-accent hover:text-accent"
                  >
                    {post.label}
                    {tally ? <span className="text-ink-3">{tally}</span> : null}
                  </Link>
                );
              })}
            </Row>
          </Column>
        </section>
      ) : null}

      {/* ── for institutions ─────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <Row className="card flex-col items-start justify-between gap-6 p-6 sm:p-9 md:flex-row md:items-center">
          <Column className="max-w-xl gap-3">
            <Row className="w-fit items-center gap-2 rounded-full bg-ok-soft px-3 py-1 text-[13px] font-semibold text-ok">
              <CheckBadgeIcon aria-hidden className="h-4 w-4" />
              For schools, colleges and universities
            </Row>
            <h2 className="font-display text-2xl font-extrabold text-ink-1 sm:text-3xl">
              Tell us the post. We handle the rest.
            </h2>
            <p className="text-[15px] leading-relaxed text-ink-2">
              Shortlists with documents already verified, demo classes coordinated, police
              verification on request, and a replacement within the same session if a placement
              does not work out.
            </p>
          </Column>
          <Column className="w-full gap-2.5 sm:w-auto">
            <Link href="/institutions" className="btn btn-deep">How it works</Link>
            <Link href="/contact?as=institution" className="btn btn-outline">Tell us about a vacancy</Link>
          </Column>
        </Row>
      </section>

      {/* ── placements, then the questions they raise ───────────────────── */}
      <StoriesSection stories={site?.stories ?? []} />

      {/* ── one testimonial ─────────────────────────────────────────────── */}
      {testimonial ? (
        <section className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6">
          <Column className="gap-5 text-center">
            <blockquote className="font-display text-xl font-bold leading-snug text-ink-1 sm:text-2xl">
              “{testimonial.quote}”
            </blockquote>
            <Column className="gap-0.5">
              <span className="text-sm font-semibold text-ink-1">{testimonial.author}</span>
              <span className="text-sm text-ink-3">
                {[testimonial.author_role, testimonial.institution].filter(Boolean).join(", ")}
              </span>
            </Column>
          </Column>
        </section>
      ) : null}

      <FaqSection faqs={site?.faqs ?? []} />
    </>
  );
}
