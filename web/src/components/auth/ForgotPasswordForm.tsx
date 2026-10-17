"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import AuthPanel from "@/components/auth/AuthPanel";
import { PasswordField } from "@/components/auth/PhoneFields";
import { type Role } from "@/Hooks/useSession";
import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";

/**
 * "I have forgotten my password."
 *
 * Two steps on one page, because the second one needs the first one's answer
 * and a route change would lose the address they typed.
 *
 *   1. An email address  →  a six-digit code is posted to it
 *   2. The code + a new password  →  signed out everywhere, sign in again
 *
 * ## The thing not to 'improve'
 *
 * Step one says the same sentence whether or not the address is on an account.
 * That is not vagueness to be tidied up later — any difference between the two
 * cases turns this form into a way to ask which addresses hold accounts, one
 * submission at a time, and the accounts here belong to people looking for
 * work. The server answers identically too; adding a branch on this side would
 * leak what the server is careful not to.
 *
 * The office can still reset a password from the panel. That remains the only
 * route for a teacher who has no email address at all, which is a real and
 * common case here — hence the line pointing at it.
 */
export default function ForgotPasswordForm({ role = "teacher" }: { role?: Role }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const message = (error: unknown, fallback: string) => {
    if (error instanceof ClientError && error.errors) {
      setErrors(error.errors);
      return;
    }
    toast.error(error instanceof Error ? error.message : fallback);
  };

  const ask = useMutation({
    mutationFn: () => ApiController.forgotPassword(email),
    // Always advances, because the server always succeeds. Stopping here on
    // "no such account" is exactly the leak the endpoint avoids.
    onSuccess: () => {
      setStep("code");
      setErrors({});
    },
    onError: (error: unknown) => message(error, "That didn't work. Try again."),
  });

  const reset = useMutation({
    mutationFn: () => ApiController.resetPasswordWithCode(email, code, password),
    onSuccess: () => {
      toast.success("Password changed. Sign in with the new one.");
      router.replace(`/login?as=${role}`);
    },
    onError: (error: unknown) => message(error, "That code did not work."),
  });

  return (
    <Row className="min-h-screen items-stretch bg-paper">
      <AuthPanel role={role} />

      <Column className="flex-1 items-center justify-center p-5 sm:p-10">
        <Column className="w-full max-w-sm gap-6">
          <Link href={`/login?as=${role}`} className="w-fit text-sm font-semibold text-ink-3 hover:text-accent">
            ← Back to sign in
          </Link>

          <Column className="items-center gap-3 text-center">
            <span
              aria-hidden
              className="grid h-12 w-12 place-items-center rounded-2xl bg-deep font-display text-lg font-extrabold text-deep-ink"
            >
              J
            </span>
            <Column className="gap-1">
              <h1 className="font-display text-2xl font-extrabold text-ink-1">
                {step === "email" ? "Forgotten password" : "Check your email"}
              </h1>
              <p className="text-sm text-ink-2">
                {step === "email"
                  ? "Tell us the email address on your account and we will send a code to it."
                  : `We have sent a six-digit code to ${email}. It works for ten minutes.`}
              </p>
            </Column>
          </Column>

          {step === "email" ? (
            <form
              className="card flex flex-col gap-4 p-5"
              onSubmit={(event) => {
                event.preventDefault();
                ask.mutate();
              }}
            >
              <Column className="gap-0">
                <label htmlFor="email" className="label">Email address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setErrors({});
                  }}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="field"
                />
                {errors.email ? (
                  <span className="pt-1 text-xs font-medium text-bad">{errors.email}</span>
                ) : null}
              </Column>
              <button
                type="submit"
                className="btn btn-accent"
                disabled={ask.isPending || !email.includes("@")}
              >
                {ask.isPending ? "Sending…" : "Send me a code"}
              </button>
            </form>
          ) : (
            <form
              className="card flex flex-col gap-4 p-5"
              onSubmit={(event) => {
                event.preventDefault();
                reset.mutate();
              }}
            >
              <Column className="gap-0">
                <label htmlFor="code" className="label">The six-digit code</label>
                <input
                  id="code"
                  name="code"
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                    setErrors({});
                  }}
                  required
                  inputMode="numeric"
                  // Lets iOS and Android offer the code straight from the
                  // notification instead of making them switch apps to read it.
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="field text-center font-display text-xl font-bold tracking-[0.4em]"
                />
                {errors.code ? (
                  <span className="pt-1 text-xs font-medium text-bad">{errors.code}</span>
                ) : null}
              </Column>

              <PasswordField
                value={password}
                onChange={(value) => {
                  setPassword(value);
                  setErrors({});
                }}
                error={errors.new_password}
                label="New password"
                autoComplete="new-password"
                hint="At least 8 characters."
              />

              <button
                type="submit"
                className="btn btn-accent"
                disabled={reset.isPending || code.length !== 6 || password.length < 8}
              >
                {reset.isPending ? "Saving…" : "Set my new password"}
              </button>

              <Row className="justify-between gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setCode("");
                    setErrors({});
                  }}
                  className="font-semibold text-ink-3 hover:text-accent"
                >
                  Wrong address?
                </button>
                <button
                  type="button"
                  onClick={() => ask.mutate()}
                  disabled={ask.isPending}
                  className="font-semibold text-ink-3 hover:text-accent disabled:opacity-50"
                >
                  {ask.isPending ? "Sending…" : "Send it again"}
                </button>
              </Row>
            </form>
          )}

          <p className="text-center text-xs leading-relaxed text-ink-3">
            No email address on your account? Call the office and they will set a
            new password for you while you are on the phone.
          </p>
        </Column>
      </Column>
    </Row>
  );
}
