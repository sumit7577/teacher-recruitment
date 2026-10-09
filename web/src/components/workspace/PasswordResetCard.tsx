"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";
import type { PasswordReset } from "@/networking/types";

/**
 * "I can't get into my account."
 *
 * The whole password-recovery path, because there is no SMS gateway and so no
 * self-service "forgot password" to send anyone to. A teacher rings, whoever
 * picks up confirms who they are the same way they already do for certificates,
 * and reads out what appears here.
 *
 * The password is shown once. It is hashed on the way in, so the office cannot
 * look it up afterwards — pressing the button again mints a different one. That
 * is stated on the card rather than left to be discovered.
 */
export default function PasswordResetCard() {
  const [phone, setPhone] = useState("");
  const [issued, setIssued] = useState<PasswordReset | null>(null);

  const reset = useMutation({
    mutationFn: () => ApiController.resetUserPassword(phone),
    onSuccess: (data) => setIssued(data),
    onError: (error: unknown) =>
      toast.error(
        error instanceof ClientError || error instanceof Error
          ? error.message
          : "That didn't work.",
      ),
  });

  return (
    <Column className="card gap-3 p-5">
      <Column className="gap-0.5">
        <h2 className="font-display text-base font-bold text-ink-1">Reset a password</h2>
        <p className="text-sm text-ink-3">
          For a teacher or institution locked out of their account. Check who you
          are speaking to before you read the new one out.
        </p>
      </Column>

      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setIssued(null);
          reset.mutate();
        }}
      >
        <Column className="min-w-0 flex-1 gap-0">
          <label htmlFor="reset-phone" className="label">Their mobile number</label>
          <input
            id="reset-phone"
            name="reset-phone"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value.replace(/\D/g, "").slice(0, 10));
              setIssued(null);
            }}
            inputMode="numeric"
            placeholder="10-digit mobile"
            className="field"
          />
        </Column>
        <button
          type="submit"
          className="btn btn-primary shrink-0"
          disabled={reset.isPending || phone.length !== 10}
        >
          {reset.isPending ? "Working…" : "Set a new password"}
        </button>
      </form>

      {issued ? (
        <Column className="gap-1.5 rounded-xl border border-accent bg-accent-soft p-4">
          <span className="text-sm font-semibold text-ink-1">
            {issued.name || issued.phone} — read this out now
          </span>
          <span className="font-display text-2xl font-extrabold tracking-[0.15em] text-accent">
            {issued.temporary_password}
          </span>
          <span className="text-xs leading-relaxed text-ink-2">
            It is not shown again and cannot be looked up — pressing the button
            again makes a different one. They were signed out everywhere, and
            they can change it from their own profile once they are back in.
          </span>
        </Column>
      ) : null}
    </Column>
  );
}
