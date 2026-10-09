import Link from "next/link";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import type { SiteSettings } from "@/networking/types";

/** A server component — nothing here is interactive, so none of it needs to ship
 *  to the browser. */
export default function SiteFooter({ settings }: { settings: SiteSettings | null }) {
  const brand = settings?.brand_name || "Teacher Recruitment";
  const year = new Date().getFullYear();

  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <Column className="mx-auto w-full max-w-6xl gap-10 px-4 py-12 sm:px-6">
        <Row className="flex-col justify-between gap-10 md:flex-row">
          <Column className="max-w-sm gap-3">
            <span className="font-display text-lg font-extrabold text-ink-1">{brand}</span>
            <p className="text-sm leading-relaxed text-ink-2">
              {settings?.tagline ||
                "Teachers for schools, colleges and universities — before the session starts."}
            </p>
            {settings?.established_year ? (
              <p className="text-sm text-ink-3">Placing teachers since {settings.established_year}</p>
            ) : null}
          </Column>

          <Row className="flex-wrap gap-10">
            <Column className="gap-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-3">For teachers</p>
              <Link href="/jobs" className="text-sm text-ink-2 hover:text-accent">Teaching jobs</Link>
              <Link href="/register?as=teacher" className="text-sm text-ink-2 hover:text-accent">Register as a teacher</Link>
              <Link href="/login?as=teacher" className="text-sm text-ink-2 hover:text-accent">Sign in</Link>
            </Column>
            <Column className="gap-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-3">For institutions</p>
              <Link href="/institutions" className="text-sm text-ink-2 hover:text-accent">How it works</Link>
              <Link href="/register?as=school" className="text-sm text-ink-2 hover:text-accent">Register your institution</Link>
              <Link href="/contact" className="text-sm text-ink-2 hover:text-accent">Tell us about a vacancy</Link>
            </Column>
            <Column className="gap-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-3">Office</p>
              {settings?.phone ? (
                <a href={`tel:${settings.phone}`} className="text-sm text-ink-2 hover:text-accent">
                  {settings.phone}
                </a>
              ) : null}
              {settings?.whatsapp ? (
                <a
                  href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`}
                  className="text-sm text-ink-2 hover:text-accent"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  WhatsApp
                </a>
              ) : null}
              {settings?.email ? (
                <a href={`mailto:${settings.email}`} className="text-sm text-ink-2 hover:text-accent">
                  {settings.email}
                </a>
              ) : null}
              {settings?.office_hours ? (
                <span className="text-sm text-ink-3">{settings.office_hours}</span>
              ) : null}
            </Column>
          </Row>
        </Row>

        {settings?.address ? (
          <p className="max-w-md whitespace-pre-line text-sm text-ink-3">{settings.address}</p>
        ) : null}

        <Row className="flex-col justify-between gap-2 border-t border-line pt-6 text-xs text-ink-3 sm:flex-row">
          <span>© {year} {brand}. All rights reserved.</span>
          <span>Vacancies are verified before they are listed.</span>
        </Row>
      </Column>
    </footer>
  );
}
