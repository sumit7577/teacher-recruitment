import type { Metadata } from "next";
import Link from "next/link";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import { serverGetData } from "@/networking/server";
import type { PublicSiteResp } from "@/networking/types";

export const metadata: Metadata = {
  title: "Home tuition — find a tutor, or take tuition work",
  description:
    "Parents post what they need and teachers nearby ask to take it. Every teacher's certificates are checked before anyone meets.",
};

export const revalidate = 300;

/**
 * The public face of section 6.
 *
 * Two audiences on one page, because the same page is the answer to both "I
 * need a tutor for my daughter" and "I would take tuition work in the
 * evenings", and splitting it would mean guessing which one a visitor is
 * before they have told us.
 *
 * No listings are shown here. A tuition requirement carries a child's class and
 * area, and that is behind a sign-in on purpose — a public page of them would
 * be a directory of children, which is precisely what the consent rule exists
 * to prevent.
 */
export default async function TuitionPage() {
  const site = await serverGetData<PublicSiteResp>("/v1/public/site/");

  return (
    <>
      <section className="bg-deep text-deep-ink">
        <Column className="mx-auto w-full max-w-4xl gap-4 px-4 py-16 text-center sm:px-6">
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">
            Home tuition, with the checking already done
          </h1>
          <p className="mx-auto max-w-2xl text-base text-deep-ink/80 sm:text-lg">
            Say what you need. Teachers near you ask to take it, and you choose
            who to speak to. Every teacher&apos;s degree and certificates are
            verified by our office before anyone meets.
          </p>
          <Row className="flex-col justify-center gap-3 pt-2 sm:flex-row">
            <Link href="/register?as=student" className="btn btn-accent">
              I need a tutor
            </Link>
            <Link href="/register?as=teacher" className="btn border border-white/30 bg-white/10 text-deep-ink hover:bg-white/20">
              I want tuition work
            </Link>
          </Row>
        </Column>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Column className="card gap-3 p-5">
            <h2 className="font-display text-lg font-bold text-ink-1">For parents</h2>
            <ol className="flex flex-col gap-2 text-sm leading-relaxed text-ink-2">
              <li><b className="text-ink-1">1.</b> Post the class, the subjects and roughly when.</li>
              <li><b className="text-ink-1">2.</b> Teachers nearby send an interest request.</li>
              <li><b className="text-ink-1">3.</b> You accept the ones you like — only then can anyone message you.</li>
            </ol>
            <p className="rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-ink-2">
              <b className="text-ink-1">What a teacher sees:</b> the class, the
              subjects and your general area. Never your address, never a phone
              number, never a date of birth. If the student is under 18, nothing
              is shown at all until a parent or guardian agrees.
            </p>
          </Column>

          <Column className="card gap-3 p-5">
            <h2 className="font-display text-lg font-bold text-ink-1">For teachers</h2>
            <ol className="flex flex-col gap-2 text-sm leading-relaxed text-ink-2">
              <li><b className="text-ink-1">1.</b> Tick &ldquo;home tuition&rdquo; on your profile.</li>
              <li><b className="text-ink-1">2.</b> See requirements near you, with the budget stated up front.</li>
              <li><b className="text-ink-1">3.</b> Ask to take the ones that suit your timetable.</li>
            </ol>
            <p className="rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-ink-2">
              Tuition work sits alongside a school post, not instead of it. The
              same profile and the same verified certificates do both.
            </p>
          </Column>
        </div>
      </section>

      {site?.live_vacancies ? (
        <section className="border-t border-line">
          <Column className="mx-auto w-full max-w-4xl gap-3 px-4 py-12 text-center sm:px-6">
            <h2 className="font-display text-xl font-bold text-ink-1">
              Looking for a full-time post instead?
            </h2>
            <p className="text-sm text-ink-2">
              {site.live_vacancies} school and coaching vacancies are open right now.
            </p>
            <Link href="/jobs" className="btn btn-accent mx-auto w-fit">
              See the vacancies
            </Link>
          </Column>
        </section>
      ) : null}
    </>
  );
}
