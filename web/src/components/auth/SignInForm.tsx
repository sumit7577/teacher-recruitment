"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import AuthPanel from "@/components/auth/AuthPanel";
import { OtpField, PhoneField } from "@/components/auth/PhoneOtpFields";
import RoleSwitch from "@/components/auth/RoleSwitch";
import { HOME_FOR, type Role } from "@/Hooks/useSession";
import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";
import { queryClient } from "@/queryClient";

type Step = "phone" | "code" | "password";

/**
 * Sign in. Three ways in, one landing.
 *
 * A one-time code is the default and the password tab is secondary, because most
 * teachers will never set a password — the proposal offers the code "for anyone
 * who would rather not remember one", and that is the majority here.
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
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resendIn, setResendIn] = useState(0);

  // The resend countdown. The backend re-sends the SAME code inside 60 seconds
  // rather than minting a new one, so a button that looks available but changes
  // nothing is worse than one that is visibly waiting.
  useEffect(() => {
    if (!resendIn) return;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  const land = useCallback(
    (needsProfile: boolean, signedInAs: Role) => {
      queryClient.clear();
      if (needsProfile) {
        router.replace(`/register?as=${signedInAs}&step=profile`);
        return;
      }
      const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
      router.replace(safe ?? HOME_FOR[signedInAs]);
    },
    [next, router],
  );

  function fail(error: unknown) {
    if (error instanceof ClientError && error.errors) {
      setErrors(error.errors);
      return;
    }
    toast.error(error instanceof Error ? error.message : "That didn't work. Try again.");
  }

  const requestCode = useMutation({
    mutationFn: () => ApiController.requestOtp(phone, role),
    onSuccess: () => {
      setErrors({});
      setStep("code");
      setResendIn(60);
    },
    onError: fail,
  });

  const verify = useMutation({
    mutationFn: () => ApiController.verifyOtp(phone, otp, role),
    onSuccess: (data) => land(data.needs_profile, data.role),
    onError: fail,
  });

  const withPassword = useMutation({
    mutationFn: () => ApiController.signInWithPassword(phone, password, role),
    onSuccess: (data) => land(data.needs_profile, data.role),
    onError: fail,
  });

  const busy = requestCode.isPending || verify.isPending || withPassword.isPending;

  return (
    <Row className="min-h-screen items-stretch bg-paper">
      <AuthPanel role={role} />

      <Column className="flex-1 items-center justify-center p-5 sm:p-10">
        <Column className="w-full max-w-sm gap-6">
          <Column className="gap-1.5">
            <Link href="/" className="w-fit text-sm font-semibold text-ink-3 hover:text-accent">
              ← Back to the website
            </Link>
            <h1 className="font-display text-2xl font-extrabold text-ink-1">
              {role === "staff" ? "Office sign-in" : "Sign in"}
            </h1>
            <p className="text-sm text-ink-2">
              {role === "staff"
                ? "Use the number the office registered for you."
                : "Your mobile number is your login. No password needed."}
            </p>
          </Column>

          {role !== "staff" ? (
            <RoleSwitch
              value={role}
              onChange={(next) => {
                setRole(next);
                setStep("phone");
                setErrors({});
              }}
            />
          ) : null}

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (step === "phone") requestCode.mutate();
              else if (step === "code") verify.mutate();
              else withPassword.mutate();
            }}
          >
            <PhoneField
              value={phone}
              onChange={(value) => { setPhone(value); setErrors({}); }}
              disabled={step === "code"}
              error={errors.phone}
            />

            {step === "code" ? (
              <OtpField
                value={otp}
                onChange={(value) => { setOtp(value); setErrors({}); }}
                error={errors.otp}
                onResend={() => requestCode.mutate()}
                resendIn={resendIn}
              />
            ) : null}

            {step === "password" ? (
              <Column className="gap-0">
                <label htmlFor="password" className="label">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoComplete="current-password"
                  className="field"
                />
              </Column>
            ) : null}

            <button type="submit" className="btn btn-accent" disabled={busy || phone.length !== 10}>
              {busy
                ? "Please wait…"
                : step === "phone"
                  ? "Send me a code"
                  : step === "code"
                    ? "Sign in"
                    : "Sign in with password"}
            </button>
          </form>

          <Column className="gap-2 border-t border-line pt-4">
            {step === "code" ? (
              <button
                type="button"
                onClick={() => { setStep("phone"); setOtp(""); setErrors({}); }}
                className="text-sm font-semibold text-ink-2 hover:text-accent"
              >
                Change the number
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setStep(step === "password" ? "phone" : "password"); setErrors({}); }}
                className="text-sm font-semibold text-ink-2 hover:text-accent"
              >
                {step === "password" ? "Use a one-time code instead" : "I have a password"}
              </button>
            )}
            {role !== "staff" ? (
              <p className="text-sm text-ink-3">
                New here?{" "}
                <Link href={`/register?as=${role}`} className="font-semibold text-accent hover:underline">
                  Create an account
                </Link>
              </p>
            ) : null}
          </Column>
        </Column>
      </Column>
    </Row>
  );
}
