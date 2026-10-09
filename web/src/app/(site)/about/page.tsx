import type { Metadata } from "next";
import Link from "next/link";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import { serverGetData } from "@/networking/server";
import type { PublicSiteResp } from "@/networking/types";

export const metadata: Metadata = {
  title: "About",
  description: "Who we are, and the consultants you will actually be dealing with.",
};

export default async function AboutPage() {
  const site = await serverGetData<PublicSiteResp>("/v1/public/site/", { revalidate: 300 });
  const settings = site?.settings;
  const team = site?.team ?? [];

  return (
    <Column className="mx-auto w-full max-w-5xl gap-12 px-4 py-9 sm:px-6 sm:py-12">
      <Column className="max-w-3xl gap-4">
        <h1 className="font-display text-2xl font-extrabold text-ink-1 sm:text-4xl">
          {settings?.about_heading || "About us"}
        </h1>
        {settings?.about_body ? (
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink-2 sm:text-lg">
            {settings.about_body}
          </p>
        ) : null}
      </Column>

      {settings?.stats?.length ? (
        <Row className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {settings.stats.map((stat) => (
            <Column key={stat.label} className="card gap-1 p-5">
              <span className="font-display text-2xl font-extrabold text-accent">{stat.value}</span>
              <span className="text-sm font-semibold text-ink-1">{stat.label}</span>
              {stat.note ? <span className="text-xs text-ink-3">{stat.note}</span> : null}
            </Column>
          ))}
        </Row>
      ) : null}

      {team.length ? (
        <Column className="gap-6">
          <Column className="gap-2">
            <h2 className="font-display text-xl font-extrabold text-ink-1 sm:text-2xl">
              The people you will be dealing with
            </h2>
            <p className="text-[15px] text-ink-2">
              A named consultant per account, not a shared inbox.
            </p>
          </Column>
          <Row className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {team.map((member) => (
              <Column key={member.id} className="card gap-3 p-5">
                {member.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={member.photo_url}
                    alt={member.name}
                    className="h-16 w-16 rounded-full border border-line object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="grid h-16 w-16 place-items-center rounded-full bg-accent-soft font-display text-lg font-bold text-accent"
                  >
                    {member.name.slice(0, 1)}
                  </span>
                )}
                <Column className="gap-0.5">
                  <span className="font-display text-base font-bold text-ink-1">{member.name}</span>
                  {member.role ? <span className="text-sm text-ink-3">{member.role}</span> : null}
                </Column>
                {member.bio ? <p className="text-sm leading-relaxed text-ink-2">{member.bio}</p> : null}
                <Column className="gap-1 pt-1">
                  {member.phone ? (
                    <a href={`tel:${member.phone}`} className="text-sm font-medium text-accent hover:underline">
                      {member.phone}
                    </a>
                  ) : null}
                  {member.email ? (
                    <a href={`mailto:${member.email}`} className="text-sm text-ink-2 hover:text-accent">
                      {member.email}
                    </a>
                  ) : null}
                </Column>
              </Column>
            ))}
          </Row>
        </Column>
      ) : null}

      <Row className="card flex-col items-start justify-between gap-5 p-6 sm:flex-row sm:items-center">
        <Column className="gap-1">
          <h2 className="font-display text-lg font-bold text-ink-1">Looking for a post, or filling one?</h2>
          <p className="text-sm text-ink-2">Either way, the office will call you back.</p>
        </Column>
        <Row className="gap-2.5">
          <Link href="/jobs" className="btn btn-outline">See vacancies</Link>
          <Link href="/contact" className="btn btn-accent">Contact us</Link>
        </Row>
      </Row>
    </Column>
  );
}
