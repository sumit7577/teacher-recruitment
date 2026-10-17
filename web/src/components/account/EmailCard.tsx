"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";
import { queryClient } from "@/queryClient";

/**
 * The email address on your account, and proving it is yours.
 *
 * This card is what makes `/forgot` usable at all. A password reset is only
 * ever sent to an address somebody has proved they can read — an unverified
 * one may be a typo for a stranger's mailbox, and mailing a reset code there
 * hands that stranger the account. So until an address is confirmed here,
 * forgotten passwords stay an office telephone call.
 *
 * Shown on both workspaces. A teacher's address and an institution's are the
 * same column on the same `User` row; `School.office_email` is a different
 * thing entirely (where applicants should write), and is edited on the
 * institution profile form.
 */
export default function EmailCard() {
  const me = useQuery({ queryKey: ["me"], queryFn: ApiController.getMe });

  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);

  const current = me.data?.email ?? "";
  const verified = Boolean(me.data?.email_verified_at);

  const say = (error: unknown, fallback: string) =>
    toast.error(
      error instanceof ClientError || error instanceof Error ? error.message : fallback,
    );

  const request = useMutation({
    mutationFn: () => ApiController.requestEmailCode(email),
    onSuccess: () => {
      setSent(true);
      toast.success(`Code sent to ${email}.`);
    },
    onError: (error) => say(error, "We could not send that code."),
  });

  const confirm = useMutation({
    mutationFn: () => ApiController.verifyEmail(email, code),
    onSuccess: async () => {
      toast.success("Email confirmed.");
      setEditing(false);
      setSent(false);
      setCode("");
      // The address and its verified stamp both live on `me`, and the header
      // reads the same query — invalidate rather than patching it by hand.
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error) => say(error, "That code did not work."),
  });

  const start = () => {
    setEmail(current);
    setCode("");
    setSent(false);
    setEditing(true);
  };

  return (
    <Column className="card gap-3 p-4 sm:p-5">
      <Row className="flex-wrap items-start justify-between gap-3">
        <Column className="gap-0.5">
          <h2 className="font-display text-base font-bold text-ink-1">Email address</h2>
          <p className="text-sm text-ink-3">
            {verified
              ? "Used for receipts, alerts, and resetting your password."
              : "Confirm it and you can reset your own password without calling the office."}
          </p>
        </Column>
        {current ? (
          <span className={verified ? "chip chip-ok" : "chip chip-warn"}>
            {verified ? "Confirmed" : "Not confirmed"}
          </span>
        ) : null}
      </Row>

      {!editing ? (
        <Row className="flex-wrap items-center justify-between gap-3">
          <span className="min-w-0 break-all text-sm font-semibold text-ink-1">
            {current || "No email address yet"}
          </span>
          <button type="button" onClick={start} className="btn btn-ghost shrink-0 px-3 py-2 text-sm">
            {current ? (verified ? "Change it" : "Confirm it") : "Add one"}
          </button>
        </Row>
      ) : (
        <Column className="gap-3">
          <Column className="gap-0">
            <label htmlFor="account-email" className="label">Email address</label>
            <input
              id="account-email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                // Changing the address invalidates a code sent to the old one.
                setSent(false);
                setCode("");
              }}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="field"
            />
          </Column>

          {sent ? (
            <Column className="gap-0">
              <label htmlFor="account-code" className="label">The six-digit code we sent</label>
              <input
                id="account-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                className="field text-center font-display text-lg font-bold tracking-[0.35em]"
              />
            </Column>
          ) : null}

          <Row className="flex-wrap gap-2">
            {!sent ? (
              <button
                type="button"
                onClick={() => request.mutate()}
                disabled={request.isPending || !email.includes("@")}
                className="btn btn-accent"
              >
                {request.isPending ? "Sending…" : "Send me a code"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => confirm.mutate()}
                  disabled={confirm.isPending || code.length !== 6}
                  className="btn btn-accent"
                >
                  {confirm.isPending ? "Checking…" : "Confirm this address"}
                </button>
                <button
                  type="button"
                  onClick={() => request.mutate()}
                  disabled={request.isPending}
                  className="btn btn-ghost px-3 py-2 text-sm"
                >
                  Send it again
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="btn btn-ghost px-3 py-2 text-sm"
            >
              Cancel
            </button>
          </Row>
        </Column>
      )}
    </Column>
  );
}
