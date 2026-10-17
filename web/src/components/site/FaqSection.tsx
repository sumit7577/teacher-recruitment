"use client";

import { useState } from "react";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import { cn } from "@/lib/cn";
import type { FaqResp } from "@/networking/types";

/**
 * Section 8's FAQs, grouped by who is asking.
 *
 * Both sides ask completely different questions — a teacher wants to know
 * whether registering costs anything, a principal wants to know how long a
 * shortlist takes — so one undifferentiated list makes each side read past half
 * of it. The tabs only appear when there is genuinely more than one audience to
 * choose between.
 *
 * Plain <details>/<summary> rather than a bespoke accordion: it is keyboard
 * accessible and findable by the browser's own in-page search without any of
 * that being written, and in-page search is how people actually use an FAQ.
 */
const LABELS: Record<string, string> = {
  all: "Everyone",
  teacher: "Teachers",
  institution: "Institutions",
  student: "Parents",
};

export default function FaqSection({ faqs }: { faqs: FaqResp[] }) {
  const published = faqs.filter((faq) => faq.is_published);
  const audiences = [...new Set(published.map((faq) => faq.audience))];
  const [tab, setTab] = useState<string>(audiences[0] ?? "all");

  if (!published.length) return null;

  // "Everyone" questions belong under whichever tab is open, not in a tab of
  // their own that nobody clicks.
  const shown = published.filter((faq) => faq.audience === tab || faq.audience === "all");

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6">
      <Column className="gap-5">
        <Column className="gap-1.5 text-center">
          <h2 className="font-display text-2xl font-extrabold text-ink-1 sm:text-3xl">
            Questions we are asked
          </h2>
          <p className="text-base text-ink-2">
            If yours is not here, the office will answer it on the phone.
          </p>
        </Column>

        {audiences.filter((a) => a !== "all").length > 1 ? (
          <Row className="flex-wrap justify-center gap-1.5 rounded-xl bg-surface-2 p-1">
            {audiences.filter((a) => a !== "all").map((audience) => (
              <button
                key={audience}
                type="button"
                onClick={() => setTab(audience)}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors",
                  tab === audience
                    ? "bg-surface text-ink-1 shadow-[var(--shadow-card)]"
                    : "text-ink-3",
                )}
              >
                {LABELS[audience] ?? audience}
              </button>
            ))}
          </Row>
        ) : null}

        <Column className="gap-2">
          {shown.map((faq) => (
            <details key={faq.id} className="card group p-4">
              <summary className="cursor-pointer list-none font-display text-base font-bold text-ink-1 marker:content-['']">
                <Row className="items-start justify-between gap-3">
                  <span className="min-w-0">{faq.question}</span>
                  <span
                    aria-hidden
                    className="shrink-0 text-ink-3 transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </Row>
              </summary>
              <p className="whitespace-pre-line pt-2.5 text-sm leading-relaxed text-ink-2">
                {faq.answer}
              </p>
            </details>
          ))}
        </Column>
      </Column>
    </section>
  );
}
