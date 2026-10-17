"use client";

import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import { cn } from "@/lib/cn";
import { serverSessionSnapshot, sessionSnapshot, subscribeSession } from "@/networking/interceptor";
import type { SiteSettings } from "@/networking/types";

const LINKS = [
  { href: "/jobs?institution_type=school", label: "School Jobs" },
  { href: "/jobs?institution_type=coaching", label: "Coaching Jobs" },
  { href: "/tuition", label: "Tuition" },
  { href: "/institutions", label: "For Institutions" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

/** Where a signed-in person's own workspace is. */
const HOME_FOR: Record<string, string> = {
  teacher: "/teacher",
  school: "/school",
  staff: "/panel",
};

export default function SiteHeader({ settings }: { settings: SiteSettings | null }) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);

  // The session lives in localStorage, which is an external store — subscribing
  // to it is both correct and what keeps this component out of the
  // "setState inside an effect" pattern. The server snapshot is null, so the
  // header renders its signed-out state in the static HTML and swaps on hydrate.
  const session = useSyncExternalStore(subscribeSession, sessionSnapshot, serverSessionSnapshot);

  const brand = settings?.brand_name || "Teacher Recruitment";
  const workspace = session ? HOME_FOR[session.role] : null;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
      <Row className="mx-auto w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          {settings?.logo ? (
            // Not next/image: the logo comes from the client's own uploads at a
            // host that is not known at build time, and adding it to
            // `images.remotePatterns` would mean a deploy every time they change
            // where media is served from.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logo} alt={brand} className="h-8 w-auto" />
          ) : (
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-lg bg-deep text-sm font-bold text-deep-ink"
            >
              {brand.slice(0, 1)}
            </span>
          )}
          <Column className="leading-tight">
            <span className="font-display text-[15px] font-extrabold text-ink-1">{brand}</span>
            <span className="hidden text-[11px] text-ink-3 sm:block">Teacher &amp; faculty recruitment</span>
          </Column>
        </Link>

        <Row as="nav" className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink-1",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </Row>

        <Row className="items-center gap-2">
          {workspace ? (
            <Link href={workspace} className="btn btn-accent px-4 py-2 text-sm">
              My dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden btn btn-ghost px-3 py-2 text-sm sm:inline-flex">
                Sign in
              </Link>
              <Link href="/register" className="btn btn-accent px-4 py-2 text-sm">
                Register
              </Link>
            </>
          )}
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="btn btn-ghost p-2 lg:hidden"
          >
            {open ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
          </button>
        </Row>
      </Row>

      {open ? (
        <Column as="nav" className="border-t border-line bg-surface px-4 py-2 lg:hidden">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-3 text-sm font-medium text-ink-1 hover:bg-surface-2"
            >
              {link.label}
            </Link>
          ))}
          {!workspace ? (
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-3 text-sm font-medium text-ink-1 hover:bg-surface-2"
            >
              Sign in
            </Link>
          ) : null}
        </Column>
      ) : null}
    </header>
  );
}
