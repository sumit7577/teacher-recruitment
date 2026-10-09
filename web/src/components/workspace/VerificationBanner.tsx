import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import Link from "next/link";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import type { SchoolResp } from "@/networking/types";

/**
 * "The banner telling them their affiliation certificate is still outstanding."
 *
 * It names what is missing rather than saying "incomplete", because the firm's own
 * promise to teachers is that institutions are checked, and a school that cannot
 * tell what is holding it up simply rings the office.
 */
export default function VerificationBanner({ school }: { school: SchoolResp }) {
  if (school.is_verified && !school.outstanding.length) return null;

  const rejected = school.status === "rejected";

  return (
    <Row
      className={
        rejected
          ? "card flex-wrap items-start gap-3 border-bad/40 bg-bad-soft p-4"
          : "card flex-wrap items-start gap-3 border-warn/40 bg-warn-soft p-4"
      }
    >
      <ExclamationTriangleIcon
        aria-hidden
        className={rejected ? "h-5 w-5 shrink-0 text-bad" : "h-5 w-5 shrink-0 text-warn"}
      />
      <Column className="min-w-0 flex-1 gap-1">
        <span className="font-semibold text-ink-1">
          {rejected
            ? "We need something more from you"
            : school.is_verified
              ? "Your profile is missing a few things"
              : "Your institution is being verified"}
        </span>
        <p className="text-sm text-ink-2">
          {rejected && school.rejection_reason
            ? school.rejection_reason
            : school.outstanding.length
              ? `Still outstanding: ${school.outstanding.join(", ")}.`
              : "Our office is checking your details — usually within a day. You can post vacancies in the meantime; they go live once we confirm."}
        </p>
      </Column>
      <Link href="/school/profile" className="btn btn-outline">
        Open our profile
      </Link>
    </Row>
  );
}
