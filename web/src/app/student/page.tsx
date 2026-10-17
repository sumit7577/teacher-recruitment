"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import ApiController from "@/networking";

/** The family's first screen. Deliberately thin: the one thing that matters is
 *  whether consent is outstanding, because nothing works until it is given. */
export default function StudentDashboard() {
  const profile = useQuery({
    queryKey: ["student", "profile"],
    queryFn: ApiController.getStudentProfile,
    retry: false,
  });
  const requirements = useQuery({
    queryKey: ["student", "requirements"],
    queryFn: ApiController.getMyRequirements,
  });
  const interests = useQuery({
    queryKey: ["connect", "interests", "received"],
    queryFn: () => ApiController.getInterests("received"),
  });

  const needsConsent = profile.data?.needs_consent;
  const open = (requirements.data?.results ?? []).filter((r) => r.status === "open").length;
  const waiting = (interests.data?.results ?? []).filter((i) => i.status === "pending").length;

  return (
    <>
      {needsConsent ? (
        <Column className="card gap-2 border-accent bg-accent-soft p-4 sm:p-5">
          <span className="font-display text-base font-bold text-ink-1">
            A parent or guardian needs to agree
          </span>
          <p className="text-sm text-ink-2">
            Until then nothing is shown to any teacher and nobody can message you.
          </p>
          <Link href="/student/profile" className="btn btn-accent w-fit">
            Give consent
          </Link>
        </Column>
      ) : null}

      <Row className="flex-col gap-3 sm:flex-row">
        <Tile label="Posted" value={open} hint="open requirements" href="/student/requirements" />
        <Tile label="Waiting" value={waiting} hint="interest requests" href="/student/interests" />
      </Row>

      <Column className="card gap-2 p-4 sm:p-5">
        <h2 className="font-display text-base font-bold text-ink-1">How this works</h2>
        <ol className="flex flex-col gap-1.5 text-sm text-ink-2">
          <li>1. Post what you need — the class, the subjects, and roughly when.</li>
          <li>2. Teachers nearby who take home tuition can send an interest request.</li>
          <li>3. You accept the ones you like, and only then can either of you message.</li>
        </ol>
      </Column>
    </>
  );
}

function Tile({ label, value, hint, href }: {
  label: string; value: number; hint: string; href: string;
}) {
  return (
    <Link href={href} className="card flex-1 p-4 transition-colors hover:border-accent">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</span>
      <div className="font-display text-2xl font-extrabold text-ink-1">{value}</div>
      <span className="text-sm text-ink-3">{hint}</span>
    </Link>
  );
}
