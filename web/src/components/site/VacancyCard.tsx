import Link from "next/link";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import type { VacancyCard as Vacancy } from "@/networking/types";

/**
 * One row on the board.
 *
 * Qualification sits ABOVE salary, deliberately — "it is the first thing on every
 * vacancy card, because it is the first thing that disqualifies someone". Every
 * reordering of this card has to keep that.
 *
 * A server component: the board is server-rendered for Google, so the card must
 * not need the browser.
 */
export default function VacancyCard({ vacancy, href }: { vacancy: Vacancy; href?: string }) {
  const link = href ?? `/jobs/${vacancy.id}`;

  return (
    <Link
      href={link}
      className="card group block p-4 transition-shadow hover:shadow-[var(--shadow-pop)] sm:p-5"
    >
      <Row className="items-start gap-3.5">
        {vacancy.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vacancy.logo}
            alt=""
            className="h-11 w-11 shrink-0 rounded-xl border border-line object-contain"
          />
        ) : (
          <span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-deep text-[13px] font-bold tracking-wide text-deep-ink"
          >
            {vacancy.initials}
          </span>
        )}

        <Column className="min-w-0 flex-1 gap-1.5">
          <Row className="flex-wrap items-center gap-2">
            <h3 className="font-display text-[15px] font-bold text-ink-1 group-hover:text-accent sm:text-base">
              {vacancy.title}
            </h3>
            {vacancy.is_new ? <span className="chip chip-accent">New</span> : null}
            {vacancy.is_urgent ? <span className="chip chip-bad">Urgent</span> : null}
          </Row>

          <p className="truncate text-sm text-ink-2">
            {vacancy.institution}
            <span className="text-ink-3"> · {vacancy.city}</span>
            {vacancy.board_label ? <span className="text-ink-3"> · {vacancy.board_label}</span> : null}
          </p>

          {/* Qualification first. */}
          {vacancy.qualification ? (
            <p className="text-sm font-semibold text-ink-1">{vacancy.qualification}</p>
          ) : null}

          <Row className="flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5">
            <span className="text-sm font-bold text-accent">{vacancy.salary}</span>
            {vacancy.salary_note ? (
              <span className="text-xs text-ink-3">{vacancy.salary_note}</span>
            ) : null}
          </Row>

          <Row className="flex-wrap gap-1.5 pt-1.5">
            <span className="chip">{vacancy.post_label}</span>
            <span className="chip">{vacancy.experience_label}</span>
            {vacancy.subject ? <span className="chip">{vacancy.subject}</span> : null}
            {vacancy.grades ? <span className="chip">{vacancy.grades}</span> : null}
            {vacancy.openings > 1 ? <span className="chip">{vacancy.openings} openings</span> : null}
          </Row>
        </Column>
      </Row>
    </Link>
  );
}
