import type { Metadata } from "next";

import SignInForm from "@/components/auth/SignInForm";
import type { Role } from "@/Hooks/useSession";

export const metadata: Metadata = {
  title: "Sign in",
  // Behind a login, so there is nothing here for an index — and robots.ts
  // disallows it too. Both, because one of them is advisory.
  robots: { index: false, follow: false },
};

type Search = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const asParam = one(params.as);
  const role: Role = asParam === "school" ? "school" : asParam === "staff" ? "staff" : "teacher";
  return <SignInForm initialRole={role} next={one(params.next) || undefined} />;
}
