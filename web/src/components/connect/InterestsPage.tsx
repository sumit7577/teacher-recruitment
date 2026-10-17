"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import QueryState from "@/components/workspace/QueryState";
import { type Role } from "@/Hooks/useSession";
import { cn } from "@/lib/cn";
import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";
import { queryClient } from "@/queryClient";
import type { InterestResp } from "@/networking/types";

/**
 * Interest requests, both directions. One component, every workspace.
 *
 * A teacher, an institution and a parent all see the same two lists with the
 * two sides swapped, so this is one file rather than three that drift. `base`
 * is only used to build the link into the right workspace's message thread —
 * nothing else here varies by role, and nothing should.
 *
 * Accepting opens a conversation; that is the whole mechanic (section 9 feeds
 * section 12). The server is the one that decides whether a person may be
 * contacted at all, and it re-checks on accept, because a block may have gone
 * up or a guardian's consent may have lapsed since the heart was tapped.
 */
export default function InterestsPage({ base }: { base: string }) {
  const [box, setBox] = useState<"received" | "sent">("received");
  const router = useRouter();

  const interests = useQuery({
    queryKey: ["connect", "interests", box],
    queryFn: () => ApiController.getInterests(box),
  });

  // Clear the badge once the list has actually been looked at.
  useEffect(() => {
    if (box === "received" && interests.data) {
      ApiController.markInterestsSeen().catch(() => {});
    }
  }, [box, interests.data]);

  const respond = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "accept" | "reject" | "withdraw" }) =>
      ApiController.respondToInterest(id, action),
    onSuccess: async (_data, variables) => {
      toast.success(
        variables.action === "accept" ? "Accepted — you can message each other now."
          : variables.action === "reject" ? "Declined." : "Withdrawn.",
      );
      await queryClient.invalidateQueries({ queryKey: ["connect"] });
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof ClientError || error instanceof Error
          ? error.message : "That didn't work.",
      ),
  });

  const rows = interests.data?.results ?? [];

  return (
    <>
      <Row className="flex-wrap gap-1.5 rounded-xl bg-surface-2 p-1">
        {(["received", "sent"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setBox(value)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors",
              box === value ? "bg-surface text-ink-1 shadow-[var(--shadow-card)]" : "text-ink-3",
            )}
          >
            {value === "received" ? "Received" : "Sent"}
          </button>
        ))}
      </Row>

      <QueryState
        isLoading={interests.isLoading}
        error={interests.error}
        isEmpty={rows.length === 0}
        emptyTitle={box === "received" ? "No interest yet" : "You have not sent any"}
        emptyHint={
          box === "received"
            ? "When somebody taps the heart on your profile, it lands here and you decide."
            : "Tap the heart on a profile or a listing and it will show here until they answer."
        }
      >
        <Column className="gap-2.5">
          {rows.map((row) => (
            <InterestRow
              key={row.id}
              interest={row}
              busy={respond.isPending}
              onRespond={(action) => respond.mutate({ id: row.id, action })}
              onOpen={() => router.push(`${base}/messages?thread=${row.thread_id}`)}
            />
          ))}
        </Column>
      </QueryState>
    </>
  );
}

function InterestRow({
  interest, busy, onRespond, onOpen,
}: {
  interest: InterestResp;
  busy: boolean;
  onRespond: (action: "accept" | "reject" | "withdraw") => void;
  onOpen: () => void;
}) {
  const received = interest.direction === "received";
  const pending = interest.status === "pending";

  return (
    <Column className="card gap-3 p-4">
      <Row className="flex-wrap items-start justify-between gap-3">
        <Column className="min-w-0 flex-1 gap-0.5">
          <span className="font-display text-sm font-bold text-ink-1">{interest.person.name}</span>
          <span className="text-xs text-ink-3">
            {interest.context_label}
            {" · "}
            {new Date(interest.created_at).toLocaleDateString("en-IN", {
              day: "numeric", month: "short",
            })}
          </span>
          {interest.message ? (
            <p className="pt-1 text-sm text-ink-2">{interest.message}</p>
          ) : null}
        </Column>
        <span
          className={cn(
            "chip shrink-0",
            interest.status === "accepted" && "chip-ok",
            interest.status === "rejected" && "chip-bad",
            pending && "chip-warn",
          )}
        >
          {interest.status_label}
        </span>
      </Row>

      <Row className="flex-wrap gap-2">
        {received && pending ? (
          <>
            <button
              type="button"
              onClick={() => onRespond("accept")}
              disabled={busy}
              className="btn btn-accent"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => onRespond("reject")}
              disabled={busy}
              className="btn btn-ghost px-3 py-2 text-sm"
            >
              Decline
            </button>
          </>
        ) : null}

        {!received && pending ? (
          <button
            type="button"
            onClick={() => onRespond("withdraw")}
            disabled={busy}
            className="btn btn-ghost px-3 py-2 text-sm"
          >
            Withdraw
          </button>
        ) : null}

        {/* The thread id is present only once accepted, which is exactly what
            "there is no conversation yet" looks like on the wire. */}
        {interest.thread_id ? (
          <button type="button" onClick={onOpen} className="btn btn-accent">
            Open the conversation
          </button>
        ) : null}
      </Row>
    </Column>
  );
}
