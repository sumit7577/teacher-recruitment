import Link from "next/link";

import Column from "@/components/common/Column";

/**
 * One number on a dashboard.
 *
 * `href` is optional but almost always wanted: a count nobody can click is a count
 * that raises a question and then refuses to answer it.
 */
export default function StatCard({
  label, value, note, href, tone = "plain",
}: {
  label: string;
  value: number | string;
  note?: string;
  href?: string;
  tone?: "plain" | "accent" | "warn";
}) {
  const body = (
    <Column className="card h-full gap-1 p-4 transition-shadow hover:shadow-[var(--shadow-pop)]">
      <span className="text-xs font-bold uppercase tracking-wide text-ink-3">{label}</span>
      <span
        className={
          tone === "accent"
            ? "font-display text-2xl font-extrabold text-accent"
            : tone === "warn"
              ? "font-display text-2xl font-extrabold text-warn"
              : "font-display text-2xl font-extrabold text-ink-1"
        }
      >
        {value}
      </span>
      {note ? <span className="text-xs text-ink-3">{note}</span> : null}
    </Column>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}
