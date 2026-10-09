import type { Metadata } from "next";

import RegisterForm from "@/components/auth/RegisterForm";
import type { Role } from "@/Hooks/useSession";
import { serverGetData } from "@/networking/server";
import type { VacancyFacets } from "@/networking/types";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false, follow: false },
};

type Search = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const asParam = one(params.as);
  const role: Role = asParam === "school" ? "school" : "teacher";
  // The taxonomy for the dropdowns, fetched on the server so the form has its
  // options in the first paint rather than after a round trip.
  const facets = await serverGetData<VacancyFacets>("/v1/public/vacancies/filters/", {
    revalidate: 600,
  });
  return (
    <RegisterForm
      initialRole={role}
      initialStep={one(params.step) === "profile" ? "profile" : "account"}
      facets={facets}
    />
  );
}
