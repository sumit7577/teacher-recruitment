import {
  ArrowPathIcon,
  DocumentCheckIcon,
  PresentationChartBarIcon,
  ShieldCheckIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import type { Metadata } from "next";
import Link from "next/link";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import { serverGetData } from "@/networking/server";
import type { PublicSiteResp } from "@/networking/types";

export const metadata: Metadata = {
  title: "For institutions",
  description:
    "Shortlists with documents already verified, demo classes coordinated, police verification on request, and a replacement within the same session.",
};

/** The icon names in `Service.icon` are Heroicons names the panel can set, so the
 *  client can add a fifth service without a deploy. Resolved here rather than
 *  rendered from a string, because a lookup that cannot fail beats an import that
 *  can. */
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  UserGroupIcon,
  DocumentCheckIcon,
  PresentationChartBarIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
};

export default async function InstitutionsPage() {
  const site = await serverGetData<PublicSiteResp>("/v1/public/site/", { revalidate: 300 });
  const services = site?.services ?? [];
  const steps = (site?.process ?? []).filter((step) => step.audience === "institution");
  const testimonial = (site?.testimonials ?? []).find((entry) => entry.side === "institution");

  return (
    <>
      <section className="bg-deep text-deep-ink">
        <Column className="mx-auto w-full max-w-6xl gap-4 px-4 py-14 sm:px-6 sm:py-18">
          <h1 className="max-w-3xl font-display text-2xl font-extrabold leading-tight sm:text-4xl">
            Tell us the post. We bring you teachers whose documents are already checked.
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-white/75 sm:text-lg">
            Pre-primary to principal, across CBSE, ICSE, state boards and the colleges. February to
            April is when the phone rings — the whole process is built around having someone in the
            classroom before the session starts.
          </p>
          <Row className="flex-col gap-2.5 pt-2 sm:flex-row">
            <Link href="/contact?as=institution" className="btn btn-accent">Tell us about a vacancy</Link>
            <Link href="/register?as=school" className="btn btn-outline bg-transparent text-deep-ink">
              Register your institution
            </Link>
          </Row>
        </Column>
      </section>

      {services.length ? (
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <Column className="gap-7">
            <h2 className="font-display text-2xl font-extrabold text-ink-1 sm:text-3xl">What we do</h2>
            <Row className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              {services.map((service) => {
                const Icon = ICONS[service.icon] ?? UserGroupIcon;
                return (
                  <Column key={service.id} className="card gap-3 p-5">
                    <span aria-hidden className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft">
                      <Icon className="h-5 w-5 text-accent" />
                    </span>
                    <h3 className="font-display text-base font-bold text-ink-1">{service.title}</h3>
                    <p className="text-sm leading-relaxed text-ink-2">{service.description}</p>
                  </Column>
                );
              })}
            </Row>
          </Column>
        </section>
      ) : null}

      {steps.length ? (
        <section className="border-y border-line bg-surface">
          <Column className="mx-auto w-full max-w-4xl gap-7 px-4 py-14 sm:px-6">
            <Column className="gap-2">
              <h2 className="font-display text-2xl font-extrabold text-ink-1 sm:text-3xl">
                From the brief to the joining
              </h2>
              <p className="text-[15px] text-ink-2">
                Five steps. You are involved in two of them.
              </p>
            </Column>
            <Column className="gap-0">
              {steps.map((step, index) => (
                <Row key={step.id} className="items-start gap-4 border-l border-line pb-7 pl-5 last:border-transparent last:pb-0">
                  <span
                    aria-hidden
                    className="-ml-[2.1rem] grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-ink"
                  >
                    {index + 1}
                  </span>
                  <Column className="gap-1 pt-0.5">
                    <Row className="flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-bold text-ink-1">{step.title}</h3>
                      {step.timing ? <span className="chip">{step.timing}</span> : null}
                    </Row>
                    <p className="text-sm leading-relaxed text-ink-2">{step.description}</p>
                  </Column>
                </Row>
              ))}
            </Column>
          </Column>
        </section>
      ) : null}

      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <Row className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          {[
            {
              title: "Verified before you meet anyone",
              body: "Degrees, B.Ed, CTET and experience letters checked against the originals by our office. The panel tracks which are still outstanding.",
            },
            {
              title: "Police verification on request",
              body: "They will be around children. We arrange it where you ask for it, and the result is on the record.",
            },
            {
              title: "Replacement within the session",
              body: "If a placement does not work out, we replace them in the same academic session at no extra fee.",
            },
          ].map((item) => (
            <Column key={item.title} className="card gap-2 p-5">
              <h3 className="font-display text-base font-bold text-ink-1">{item.title}</h3>
              <p className="text-sm leading-relaxed text-ink-2">{item.body}</p>
            </Column>
          ))}
        </Row>
      </section>

      {testimonial ? (
        <section className="mx-auto w-full max-w-3xl px-4 pb-20 sm:px-6">
          <Column className="gap-4 text-center">
            <blockquote className="font-display text-xl font-bold leading-snug text-ink-1 sm:text-2xl">
              “{testimonial.quote}”
            </blockquote>
            <span className="text-sm text-ink-3">
              {[testimonial.author, testimonial.author_role, testimonial.institution].filter(Boolean).join(" · ")}
            </span>
          </Column>
        </section>
      ) : null}
    </>
  );
}
