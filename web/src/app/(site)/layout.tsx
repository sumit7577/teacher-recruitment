import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";
import { serverGetData } from "@/networking/server";
import type { PublicSiteResp } from "@/networking/types";

/**
 * The public site's chrome.
 *
 * A route group — `(site)` is not in the URL — so the five public pages share this
 * header and footer while /login, /teacher, /school and /panel do not. The
 * workspaces have their own shell and should not carry a marketing header.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const site = await serverGetData<PublicSiteResp>("/v1/public/site/", { revalidate: 300 });
  const settings = site?.settings ?? null;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader settings={settings} />
      <main className="flex-1">{children}</main>
      <SiteFooter settings={settings} />
    </div>
  );
}
