"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import AuthPanel from "@/components/auth/AuthPanel";
import { PasswordField, PhoneField } from "@/components/auth/PhoneFields";
import RoleSwitch from "@/components/auth/RoleSwitch";
import { HOME_FOR, type Role } from "@/Hooks/useSession";
import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";
import { queryClient } from "@/queryClient";

/** What the form says it is for, which is not the same question for both sides. */
const SUB: Record<Role, string> = {
  teacher: "Sign in to see the vacancies matching your subject.",
  school: "Sign in to post a vacancy and read your applicants.",
  student: "Sign in to post what you need and answer interested teachers.",
  staff: "Use the number the office registered for you.",
};

/**
 * Sign in. A number and a password, and nothing else.
 *
 * There is no one-time code over SMS. It needed a DLT-registered sender the
 * client does not have, and a sign-in box that accepts nothing because a
 * gateway is unconfigured is worse than a password to remember.
 *
 * A forgotten password is now self-service, by a code emailed to a verified
 * address — see `/forgot`. The office can still reset one from the panel, and
 * that remains the only route for a teacher with no email address at all,
 * which here is a real and common case.
 *
 * `next` is honoured only when it is a local path. An open redirect on a sign-in
 * page is how a phishing link gets to look like it came from us.
 */
export default function SignInForm({
  initialRole, next,
}: {
  initialRole: Role;
  next?: string;
}) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(initialRole);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const land = useCallback(
    (needsProfile: boolean, signedInAs: Role) => {
      queryClient.clear();
      if (needsProfile) {
        // The register wizard asks a teacher what they teach and a school what
        // it is. It has no third form, and a parent does not need one — their
        // profile is four fields on their own workspace. Sending them into the
        // wizard is how `?as=student` ended up on the teacher questions.
        router.replace(
          signedInAs === "student"
            ? "/student/profile"
            : `/register?as=${signedInAs}&step=profile`,
        );
        return;
      }
      const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
      router.replace(safe ?? HOME_FOR[signedInAs]);
    },
    [next, router],
  );

  const signIn = useMutation({
    mutationFn: () => ApiController.signInWithPassword(phone, password, role),
    onSuccess: (data) => land(data.needs_profile, data.role),
    onError: (error: unknown) => {
      if (error instanceof ClientError && error.errors) {
        setErrors(error.errors);
        return;
      }
      toast.error(error instanceof Error ? error.message : "That didn't work. Try again.");
    },
  });

  return (
    <Row className="min-h-screen items-stretch bg-paper">
      <AuthPanel role={role} />

      <Column className="flex-1 items-center justify-center p-5 sm:p-10">
        <Column className="w-full max-w-sm gap-6">
          <Link href="/" className="w-fit text-sm font-semibold text-ink-3 hover:text-accent">
            ← Back to the website
          </Link>

          {/* The mark, as in the demo. It carries most of its weight on a phone,
              where AuthPanel is hidden and the page would otherwise open on a
              bare form with nothing saying whose it is. */}
          <Column className="items-center gap-3 text-center">
            <span
              aria-hidden
              className="grid h-12 w-12 place-items-center rounded-2xl bg-deep font-display text-lg font-extrabold text-deep-ink"
            >
              J
            </span>
            <Column className="gap-1">
              <h1 className="font-display text-2xl font-extrabold text-ink-1">
                {role === "staff" ? "Office sign-in" : "Welcome back"}
              </h1>
              <p className="text-sm text-ink-2">{SUB[role]}</p>
            </Column>
          </Column>

          {role !== "staff" ? (
            <RoleSwitch
              value={role}
              onChange={(nextRole) => {
                setRole(nextRole);
                setErrors({});
              }}
            />
          ) : null}

          <form
            className="card flex flex-col gap-4 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              signIn.mutate();
            }}
          >
            <PhoneField
              value={phone}
              onChange={(value) => { setPhone(value); setErrors({}); }}
              error={errors.phone}
            />
            <PasswordField
              value={password}
              onChange={(value) => { setPassword(value); setErrors({}); }}
              error={errors.password}
              autoComplete="current-password"
            />
            <button
              type="submit"
              className="btn btn-accent"
              disabled={signIn.isPending || phone.length !== 10 || !password}
            >
              {signIn.isPending ? "Signing you in…" : "Sign in"}
            </button>
            <p className="text-center text-xs leading-relaxed text-ink-3">
              <Link href={`/forgot?as=${role}`} className="font-semibold text-accent hover:underline">
                Forgotten your password?
              </Link>{" "}
              We will email you a code. No email on your account? Call the
              office and they will set a new one while you are on the phone.
            </p>
          </form>

          {role !== "staff" ? (
            <p className="text-center text-sm text-ink-3">
              New here?{" "}
              <Link href={`/register?as=${role}`} className="font-semibold text-accent hover:underline">
                Create an account
              </Link>
            </p>
          ) : null}
        </Column>
      </Column>
    </Row>
  );
}
