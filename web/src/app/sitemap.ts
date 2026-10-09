import type { MetadataRoute } from "next";

import { serverGet } from "@/networking/server";
import type { Paginated, VacancyCard } from "@/networking/types";

const ORIGIN = (process.env.NEXT_PUBLIC_SITE_ORIGIN || "http://localhost:3000").replace(/\/$/, "");

/**
 * The sitemap the proposal promises, with every live vacancy in it.
 *
 * The five static pages alone would be a sitemap that tells Google nothing it
 * could not crawl. The value is the vacancy URLs: they are what rank, they change
 * weekly, and `lastModified` is what gets a new post crawled in days rather than
 * weeks.
 *
 * Only signed-in surfaces are left out — they are behind a token and would be a
 * page of nothing to a crawler.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statics: MetadataRoute.Sitemap = [
    { url: `${ORIGIN}/`, changeFrequency: "daily", priority: 1 },
    { url: `${ORIGIN}/jobs`, changeFrequency: "daily", priority: 0.9 },
    { url: `${ORIGIN}/institutions`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${ORIGIN}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${ORIGIN}/contact`, changeFrequency: "monthly", priority: 0.5 },
  ];

  // One page of 100 covers a board this size comfortably. If the client ever runs
  // more than that, this needs paging — the count in the response is what will
  // say so.
  const board = await serverGet<Paginated<VacancyCard>>(
    "/v1/public/vacancies/?page_size=100",
    { revalidate: 3600 },
  );

  const vacancies: MetadataRoute.Sitemap = (board?.results ?? []).map((vacancy) => ({
    url: `${ORIGIN}/jobs/${vacancy.id}`,
    lastModified: vacancy.published_at ? new Date(vacancy.published_at) : undefined,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...statics, ...vacancies];
}
