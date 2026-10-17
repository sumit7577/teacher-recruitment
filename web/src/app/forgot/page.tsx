import type { Metadata } from "next";

import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import { type Role } from "@/Hooks/useSession";

export const metadata: Metadata = {
  title: "Forgotten password",
  // Nothing here should ever appear in a search result.
  robots: { index: false, follow: false },
};

const ROLES = new Set(["teacher", "school", "staff"]);

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const { as } = await searchParams;
  // `as` only decides which side panel and which sign-in link to show. It is
  // not trusted for anything — the reset itself is resolved from the code.
  const role = (ROLES.has(as ?? "") ? as : "teacher") as Role;
  return <ForgotPasswordForm role={role} />;
}
