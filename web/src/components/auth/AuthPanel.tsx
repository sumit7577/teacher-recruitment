import {
  BellAlertIcon,
  CheckBadgeIcon,
  DocumentCheckIcon,
  PresentationChartBarIcon,
} from "@heroicons/react/24/outline";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import type { Role } from "@/Hooks/useSession";

/**
 * The promise beside the form, which changes with the role.
 *
 * "The panel on the left changes with the role, so the promise matches who is
 * reading it." A teacher and a principal want opposite things from this page, and
 * one shared set of bullets would be wrong for both.
 *
 * A server component — it is text and icons, so none of it needs to reach the
 * browser.
 */
const COPY: Record<Role, { heading: string; lead: string; points: { Icon: typeof CheckBadgeIcon; text: string }[] }> = {
  teacher: {
    heading: "Your next post, without the cold calling",
    lead: "One profile, and you only see vacancies you actually qualify for.",
    points: [
      { Icon: DocumentCheckIcon, text: "Upload your CV and certificates once — verified by our office and reused for every application." },
      { Icon: PresentationChartBarIcon, text: "Demo class topic and grade given in advance, the moment the date is fixed." },
      { Icon: BellAlertIcon, text: "A notification the moment a vacancy in your subject opens." },
    ],
  },
  student: {
    heading: "A tutor who actually comes, and keeps coming",
    lead: "Say what you need. Teachers near you ask to take it, and you choose.",
    points: [
      { Icon: DocumentCheckIcon, text: "Every teacher's certificates are checked by our office before you ever meet them." },
      { Icon: CheckBadgeIcon, text: "Your address and phone number are never shown — only the class and your area." },
      { Icon: BellAlertIcon, text: "You accept who you like. Nobody can message you until you do." },
    ],
  },
  school: {
    heading: "Screened teachers, not a stack of CVs",
    lead: "Post a vacancy and read applicants whose documents our office has already checked.",
    points: [
      { Icon: CheckBadgeIcon, text: "Degrees, B.Ed, CTET and experience letters verified before you meet anyone." },
      { Icon: PresentationChartBarIcon, text: "Book the demo class from your dashboard — the teacher sees the date immediately." },
      { Icon: DocumentCheckIcon, text: "Replacement within the same academic session if a placement does not work out." },
    ],
  },
  staff: {
    heading: "The office",
    lead: "Vacancies, applications, teachers and the website — all from here.",
    points: [
      { Icon: CheckBadgeIcon, text: "Sign in with the number the office registered." },
    ],
  },
};

export default function AuthPanel({ role }: { role: Role }) {
  const copy = COPY[role];
  return (
    <Column className="hidden min-h-full gap-7 bg-deep p-9 text-deep-ink lg:flex lg:w-[42%]">
      <Column className="gap-3">
        <h2 className="font-display text-2xl font-extrabold leading-tight">{copy.heading}</h2>
        <p className="text-[15px] leading-relaxed text-white/75">{copy.lead}</p>
      </Column>
      <Column className="gap-5">
        {copy.points.map(({ Icon, text }) => (
          <Row key={text} className="items-start gap-3">
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10">
              <Icon className="h-4.5 w-4.5" />
            </span>
            <p className="pt-1.5 text-sm leading-relaxed text-white/80">{text}</p>
          </Row>
        ))}
      </Column>
    </Column>
  );
}
