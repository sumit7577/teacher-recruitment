import { EnvelopeIcon, MapPinIcon, PhoneIcon } from "@heroicons/react/24/outline";
import type { Metadata } from "next";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import EnquiryForm from "@/components/site/EnquiryForm";
import { serverGetData } from "@/networking/server";
import type { PublicSiteResp, VacancyFacets } from "@/networking/types";

export const metadata: Metadata = {
  title: "Contact",
  description: "Call the office, or tell us what you are looking for — whether you teach or you are hiring.",
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const asParam = Array.isArray(query.as) ? query.as[0] : query.as;
  const [site, facets] = await Promise.all([
    serverGetData<PublicSiteResp>("/v1/public/site/", { revalidate: 300 }),
    serverGetData<VacancyFacets>("/v1/public/vacancies/filters/", { revalidate: 300 }),
  ]);
  const settings = site?.settings;

  return (
    <Column className="mx-auto w-full max-w-5xl gap-9 px-4 py-9 sm:px-6 sm:py-12">
      <Column className="max-w-2xl gap-2">
        <h1 className="font-display text-2xl font-extrabold text-ink-1 sm:text-4xl">Talk to the office</h1>
        <p className="text-[15px] text-ink-2">
          One form for both sides. Tell us whether you teach or you are hiring, and the right person
          calls you back.
        </p>
      </Column>

      <Row className="flex-col items-start gap-8 lg:flex-row">
        <Column className="w-full gap-4 lg:w-72">
          {settings?.phone ? (
            <Detail Icon={PhoneIcon} label="Phone" value={settings.phone} href={`tel:${settings.phone}`} />
          ) : null}
          {settings?.whatsapp ? (
            <Detail
              Icon={PhoneIcon}
              label="WhatsApp"
              value={settings.whatsapp}
              href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`}
            />
          ) : null}
          {settings?.email ? (
            <Detail Icon={EnvelopeIcon} label="Email" value={settings.email} href={`mailto:${settings.email}`} />
          ) : null}
          {settings?.address ? (
            <Detail Icon={MapPinIcon} label="Office" value={settings.address} />
          ) : null}
          {settings?.office_hours ? (
            <p className="text-sm text-ink-3">{settings.office_hours}</p>
          ) : null}
        </Column>

        <div className="min-w-0 flex-1">
          <EnquiryForm
            posts={facets?.taxonomy.posts ?? []}
            experience={facets?.taxonomy.experience ?? []}
            institutions={facets?.taxonomy.institutions ?? []}
            initialSide={asParam === "institution" ? "institution" : "teacher"}
          />
        </div>
      </Row>
    </Column>
  );
}

function Detail({
  Icon, label, value, href,
}: {
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  href?: string;
}) {
  const body = (
    <Row className="items-start gap-3">
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft">
        <Icon aria-hidden className="h-4 w-4 text-accent" />
      </span>
      <Column className="gap-0.5">
        <span className="text-xs font-bold uppercase tracking-wide text-ink-3">{label}</span>
        <span className="whitespace-pre-line text-sm font-medium text-ink-1">{value}</span>
      </Column>
    </Row>
  );
  return href ? (
    <a href={href} className="hover:opacity-80" rel="noopener noreferrer">{body}</a>
  ) : (
    <div>{body}</div>
  );
}
