"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import QueryState from "@/components/workspace/QueryState";
import { cn } from "@/lib/cn";
import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";
import { queryClient } from "@/queryClient";
import type { ThreadResp } from "@/networking/types";

/**
 * The inbox and one conversation, side by side on a laptop and one-at-a-time
 * on a phone.
 *
 * Polling, not websockets. The brief asks for "text messaging, chat history and
 * new-message notifications" — not live typing indicators — and a websocket
 * means an ASGI server, a channel layer and Redis, which is real infrastructure
 * to run and keep up for a feature that two people use a handful of times
 * before they swap numbers. A ten-second poll while the tab is open delivers
 * what was asked for; push notifications already cover the case where it is
 * not open.
 *
 * Opening a thread marks the other side's messages read server-side, so the
 * unread badge clears as a side effect of reading rather than a second call.
 */
export default function MessagesPage() {
  const params = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(params?.get("thread") ?? null);

  const threads = useQuery({
    queryKey: ["connect", "threads"],
    queryFn: ApiController.getThreads,
    refetchInterval: 15_000,
  });

  const rows = threads.data?.results ?? [];

  // Land on the newest conversation rather than an empty panel, but never
  // override a thread the person arrived with in the URL.
  useEffect(() => {
    if (!openId && rows.length) setOpenId(rows[0].id);
  }, [openId, rows]);

  return (
    <Row className="min-h-0 flex-1 items-stretch gap-4 lg:gap-5">
      <Column
        className={cn(
          "min-w-0 gap-2",
          // On a phone the list and the conversation are two screens, not two
          // columns — 390px cannot hold both and a squeezed thread is unusable.
          openId ? "hidden lg:flex lg:w-[320px] lg:shrink-0" : "flex-1 lg:w-[320px] lg:flex-none",
        )}
      >
        <QueryState
          isLoading={threads.isLoading}
          error={threads.error}
          isEmpty={rows.length === 0}
          emptyTitle="No conversations"
          emptyHint="A conversation opens when an interest request is accepted — by you, or by them."
        >
          <Column className="gap-2">
            {rows.map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                active={thread.id === openId}
                onOpen={() => setOpenId(thread.id)}
              />
            ))}
          </Column>
        </QueryState>
      </Column>

      {openId ? (
        <Conversation threadId={openId} onBack={() => setOpenId(null)} />
      ) : (
        <Column className="hidden flex-1 items-center justify-center lg:flex">
          <p className="text-sm text-ink-3">Pick a conversation.</p>
        </Column>
      )}
    </Row>
  );
}

function ThreadRow({
  thread, active, onOpen,
}: {
  thread: ThreadResp; active: boolean; onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "card w-full p-3 text-left transition-colors",
        active && "border-accent bg-accent-soft",
      )}
    >
      <Row className="items-center justify-between gap-2">
        <span className="min-w-0 truncate font-display text-sm font-bold text-ink-1">
          {thread.person.name}
        </span>
        {thread.unread > 0 ? (
          <span className="chip chip-accent shrink-0 text-xs">{thread.unread}</span>
        ) : null}
      </Row>
      {thread.last_message ? (
        <p className="truncate pt-0.5 text-xs text-ink-3">
          {thread.last_message.mine ? "You: " : ""}
          {thread.last_message.body}
        </p>
      ) : (
        <p className="pt-0.5 text-xs text-ink-3">No messages yet — say hello.</p>
      )}
    </button>
  );
}

function Conversation({ threadId, onBack }: { threadId: string; onBack: () => void }) {
  const [draft, setDraft] = useState("");
  const foot = useRef<HTMLDivElement>(null);

  const chat = useQuery({
    queryKey: ["connect", "messages", threadId],
    queryFn: () => ApiController.getMessages(threadId),
    refetchInterval: 10_000,
  });

  const send = useMutation({
    mutationFn: () => ApiController.sendMessage(threadId, draft),
    onSuccess: async () => {
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["connect", "messages", threadId] });
      await queryClient.invalidateQueries({ queryKey: ["connect", "threads"] });
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof ClientError || error instanceof Error
          ? error.message
          // The most likely cause is a block put up since the thread opened,
          // which the server re-checks on every send.
          : "That message did not send.",
      ),
  });

  const messages = chat.data?.messages ?? [];
  useEffect(() => {
    foot.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <Column className="card min-w-0 flex-1 gap-0 overflow-hidden p-0">
      <Row className="items-center gap-2 border-b border-line p-3">
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 text-sm font-semibold text-ink-3 hover:text-accent lg:hidden"
        >
          ←
        </button>
        <span className="min-w-0 truncate font-display text-sm font-bold text-ink-1">
          {chat.data?.person.name ?? "Conversation"}
        </span>
      </Row>

      <Column className="min-h-[320px] flex-1 gap-2 overflow-y-auto p-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
              message.mine
                ? "self-end bg-accent text-white"
                : "self-start bg-surface-2 text-ink-1",
            )}
          >
            {message.body}
            <span
              className={cn(
                "block pt-0.5 text-[10px]",
                message.mine ? "text-white/70" : "text-ink-3",
              )}
            >
              {new Date(message.created_at).toLocaleTimeString("en-IN", {
                hour: "numeric", minute: "2-digit",
              })}
            </span>
          </div>
        ))}
        <div ref={foot} />
      </Column>

      <form
        className="flex flex-row items-end gap-2 border-t border-line p-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim()) send.mutate();
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write a message"
          aria-label="Message"
          className="field min-w-0 flex-1"
        />
        <button
          type="submit"
          disabled={send.isPending || !draft.trim()}
          className="btn btn-accent shrink-0"
        >
          {send.isPending ? "…" : "Send"}
        </button>
      </form>
    </Column>
  );
}
