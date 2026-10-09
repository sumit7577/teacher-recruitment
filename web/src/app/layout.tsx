import type { Metadata } from "next";

import Providers from "@/components/Providers";
import BrandStyle from "@/components/site/BrandStyle";
import { fontVariables } from "@/lib/fonts";
import { serverGetData } from "@/networking/server";
import type { PublicSiteResp } from "@/networking/types";

import "./globals.css";

/**
 * Titles, description and Search Console verification come from the panel, not
 * from this file — "Google title and description per page, a sitemap, and Search
 * Console connected" is something the client's staff have to be able to change.
 *
 * `%s | Brand` so each page supplies only its own half of the title.
 */
export async function generateMetadata(): Promise<Metadata> {
  const site = await serverGetData<PublicSiteResp>("/v1/public/site/", { revalidate: 300 });
  const settings = site?.settings;
  const brand = settings?.brand_name || "Teacher Recruitment";
  const title = settings?.seo_title || `${brand} — Teacher & faculty recruitment`;

  return {
    title: { default: title, template: `%s | ${brand}` },
    description:
      settings?.seo_description ||
      "Teaching jobs in schools, colleges and universities. Verified vacancies and placement before the session starts.",
    applicationName: brand,
    openGraph: {
      title,
      description: settings?.seo_description || "",
      type: "website",
      siteName: brand,
      ...(settings?.og_image ? { images: [{ url: settings.og_image }] } : {}),
    },
    ...(settings?.google_verification
      ? { verification: { google: settings.google_verification } }
      : {}),
    ...(settings?.favicon ? { icons: { icon: settings.favicon } } : {}),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = await serverGetData<PublicSiteResp>("/v1/public/site/", { revalidate: 300 });

  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <BrandStyle settings={site?.settings ?? null} />
        {/*
          Sets the dark class before the first paint. Inline and blocking on
          purpose: a deferred script runs after paint, which is exactly the flash
          of light it exists to prevent. Wrapped in try/catch because reading
          localStorage throws outright in some private-browsing modes, and a
          throw here would stop the rest of the document parsing.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
