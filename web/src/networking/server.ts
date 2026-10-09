/**
 * Server-side reads, for the public website only.
 *
 * The five public pages are server-rendered because the whole point of them is
 * Google: "Google title and description per page, a sitemap, and Search Console
 * connected so you appear in search." A board rendered by client-side axios is a
 * board Google sees as an empty div.
 *
 * Separate from `interceptor.ts` because that one reads localStorage for a token.
 * Nothing here is authenticated — these are the same endpoints an anonymous
 * visitor hits — so there is no way for one visitor's data to be cached and
 * served to another.
 */

const API_BASE = (
  process.env.API_BASE_INTERNAL || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"
).replace(/\/$/, "");

export interface FetchOptions {
  /** Seconds to cache. 0 opts out — use it for anything whose staleness would
   *  read as a bug, and nothing else. */
  revalidate?: number;
  tags?: string[];
}

/**
 * GET a public endpoint. Returns null rather than throwing.
 *
 * Null, not an exception, because these run during render: an API hiccup should
 * cost one section of a page, not the whole page. Every caller handles null by
 * drawing nothing — a Home page with no testimonials is still a Home page, and a
 * 500 is not.
 */
export async function serverGet<T>(path: string, options: FetchOptions = {}): Promise<T | null> {
  const { revalidate = 60, tags } = options;
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      ...(revalidate === 0
        ? { cache: "no-store" as const }
        : { next: { revalidate, ...(tags ? { tags } : {}) } }),
    });
    if (!response.ok) {
      console.error(`serverGet ${url} → ${response.status}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error(`serverGet ${url} failed`, error);
    return null;
  }
}

/** Unwrap the `{status, message, data}` envelope. */
export async function serverGetData<T>(path: string, options?: FetchOptions): Promise<T | null> {
  const body = await serverGet<{ status: string; data?: T }>(path, options);
  return body?.data ?? null;
}
