import type { Metadata } from "next";

import Column from "@/components/common/Column";
import EmptyState from "@/components/common/EmptyState";
import Row from "@/components/common/Row";
import JobFilters from "@/components/site/JobFilters";
import JobPager from "@/components/site/JobPager";
import JobSort from "@/components/site/JobSort";
import VacancyCard from "@/components/site/VacancyCard";
import { serverGet, serverGetData } from "@/networking/server";
import type { Paginated, VacancyCard as Vacancy, VacancyFacets } from "@/networking/types";

type Search = Record<string, string | string[] | undefined>;

/**
 * The vacancy board.
 *
 * Server-rendered from the URL's query string, which is what makes a filtered
 * board indexable AND shareable — most teachers arrive from a WhatsApp link, and
 * that link has to carry the filter.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Search>;
}): Promise<Metadata> {
  const params = await searchParams;
  // Labels, not the raw slug. `?post=pgt` was producing the title "Teaching jobs
  // — pgt", which is what Google shows and what a teacher reads in a WhatsApp
  // preview. The facets fetch is the same one the page itself makes, so Next
  // dedupes it within the request rather than calling twice.
  const facets = await serverGetData<VacancyFacets>("/v1/public/vacancies/filters/", {
    revalidate: 300,
  });
  const post = one(params.post);
  // The taxonomy label is written for a form ("PGT — Post Graduate Teacher");
  // in a title the part before the dash is the whole point, and the full label
  // produces "Teaching jobs — PGT — Post Graduate Teacher, Lucknow".
  const postLabel = (
    facets?.taxonomy.posts.find((entry) => entry.value === post)?.label ?? post.toUpperCase()
  ).split("—")[0].trim();
  const parts = [post ? postLabel : "", one(params.subject), one(params.city)].filter(Boolean);
  const title = parts.length ? `Teaching jobs — ${parts.join(", ")}` : "Teaching jobs";
  return {
    title,
    description:
      "Verified teaching vacancies in schools, colleges and universities. Filter by city, post and institution.",
    // A filtered board is a near-duplicate of the unfiltered one as far as Google
    // is concerned, so every variant points at the canonical board. Without this
    // the same twelve vacancies compete with themselves across dozens of URLs.
    alternates: { canonical: "/jobs" },
  };
}

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of [
    "city", "post", "institution_type", "board", "subject",
    "experience", "qualification", "salary_min", "q", "sort", "only", "page",
  ]) {
    const value = one(params[key]);
    if (value) query.set(key, value);
  }

  const [facets, board] = await Promise.all([
    serverGetData<VacancyFacets>("/v1/public/vacancies/filters/", { revalidate: 120 }),
    serverGet<Paginated<Vacancy>>(
      `/v1/public/vacancies/${query.toString() ? `?${query}` : ""}`,
      { revalidate: 60 },
    ),
  ]);

  const results = board?.results ?? [];
  const count = board?.count ?? 0;
  const page = Number(one(params.page) || 1) || 1;
  const search = one(params.q);

  return (
    <Column className="mx-auto w-full max-w-6xl gap-7 px-4 py-9 sm:px-6 sm:py-12">
      <Column className="gap-2">
        <h1 className="font-display text-2xl font-extrabold text-ink-1 sm:text-4xl">Teaching jobs</h1>
        <p className="text-[15px] text-ink-2">
          {count === 0
            ? "No vacancies match what you have chosen."
            : `${count} ${count === 1 ? "vacancy" : "vacancies"}, verified before listing.`}
          {search ? <span className="text-ink-3"> Searching “{search}”.</span> : null}
        </p>
      </Column>

      <Row className="flex-col gap-7 lg:flex-row lg:items-start">
        {/* Filters on the left, as in the signed-off demo. */}
        <aside className="card w-full shrink-0 p-4 lg:sticky lg:top-20 lg:w-64">
          <JobFilters facets={facets} />
        </aside>

        <Column className="min-w-0 flex-1 gap-4">
          <Row className="items-center justify-between gap-3">
            <span className="text-sm text-ink-3">
              {count ? `Showing ${results.length} of ${count}` : ""}
            </span>
            <JobSort />
          </Row>

          {results.length ? (
            <>
              <Column className="gap-4">
                {results.map((vacancy) => (
                  <VacancyCard key={vacancy.id} vacancy={vacancy} />
                ))}
              </Column>
              <JobPager page={page} count={count} />
            </>
          ) : (
            <EmptyState
              title="Nothing matches those filters"
              hint="Try clearing the city or the post. New vacancies are added through the week, and the app notifies you the moment one in your subject opens."
            />
          )}
        </Column>
      </Row>
    </Column>
  );
}
