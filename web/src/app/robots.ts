import type { MetadataRoute } from "next";

const ORIGIN = (process.env.NEXT_PUBLIC_SITE_ORIGIN || "http://localhost:3000").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Behind a token, so a crawler would only ever see a sign-in redirect — and
      // a teacher's workspace URL has no business in anyone's index.
      disallow: ["/teacher/", "/school/", "/panel/", "/login", "/register"],
    },
    sitemap: `${ORIGIN}/sitemap.xml`,
  };
}
