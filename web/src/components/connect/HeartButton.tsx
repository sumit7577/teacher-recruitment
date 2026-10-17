"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";

import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";
import { cn } from "@/lib/cn";

/**
 * The heart from section 9, wherever a profile or a listing is shown.
 *
 * Deliberately NOT a toggle. A heart that un-sends looks like a like button,
 * and this is a request a person on the other end has already been notified
 * about and may be in the middle of answering — quietly retracting it from
 * under them is worse than leaving it. Withdrawing is possible, from the
 * interest list, where it is a deliberate act rather than a mis-tap.
 *
 * The server is idempotent on a second tap, so a double-tap is harmless and
 * reports success rather than an error that would read as a bug.
 */
export default function HeartButton({
  toUser, context = "profile", contextId = "", label = "I'm interested", className,
}: {
  toUser: string;
  context?: "profile" | "vacancy" | "tuition";
  contextId?: string;
  label?: string;
  className?: string;
}) {
  const [sent, setSent] = useState(false);

  const send = useMutation({
    mutationFn: () =>
      ApiController.sendInterest({ to_user: toUser, context, context_id: contextId }),
    onSuccess: () => {
      setSent(true);
      toast.success("Interest sent. You can message once they accept.");
    },
    onError: (error: unknown) =>
      // The server refuses for reasons it will not always explain — a block,
      // or a guardian who has not consented. Show its wording, not ours.
      toast.error(
        error instanceof ClientError || error instanceof Error
          ? error.message : "That didn't work.",
      ),
  });

  return (
    <button
      type="button"
      onClick={() => send.mutate()}
      disabled={send.isPending || sent}
      aria-label={label}
      className={cn("btn shrink-0", sent ? "btn-ghost" : "btn-accent", className)}
    >
      <span aria-hidden className="pr-1">{sent ? "♥" : "♡"}</span>
      {send.isPending ? "Sending…" : sent ? "Interest sent" : label}
    </button>
  );
}
