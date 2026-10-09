"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import Column from "@/components/common/Column";
import Pager from "@/components/common/Pager";
import Row from "@/components/common/Row";
import QueryState from "@/components/workspace/QueryState";
import { cn } from "@/lib/cn";
import ApiController from "@/networking";
import { queryClient } from "@/queryClient";

/** The inbox. The same rows the Android app shows — written on the server when
 *  anything happens, whether or not the push itself got through. */
export default function TeacherNotifications() {
  const [page, setPage] = useState(1);
  const notifications = useQuery({
    queryKey: ["teacher", "notifications", { page }],
    queryFn: () => ApiController.getNotifications({ page }),
  });

  const markAll = useMutation({
    mutationFn: () => ApiController.markNotificationsSeen(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teacher", "notifications"] }),
  });

  const unread = notifications.data?.unread ?? 0;

  return (
    <>
      {unread > 0 ? (
        <Row className="items-center justify-between gap-3">
          <span className="text-sm text-ink-2">
            {unread} unread {unread === 1 ? "notification" : "notifications"}
          </span>
          <button
            type="button"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
            className="btn btn-outline text-sm"
          >
            Mark all as read
          </button>
        </Row>
      ) : null}

      <QueryState
        isLoading={notifications.isLoading}
        error={notifications.error}
        isEmpty={(notifications.data?.results ?? []).length === 0}
        emptyTitle="Nothing yet"
        emptyHint="You will hear from us when a vacancy in your subject opens, when a document is checked, and when a demo class is fixed."
      >
        <Column className="gap-2.5">
          {(notifications.data?.results ?? []).map((row) => (
            <Column
              key={row.id}
              className={cn("card gap-1 p-4", !row.is_read && "border-accent/40 bg-accent-soft")}
            >
              <Row className="flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-ink-1">{row.title}</span>
                <span className="text-xs text-ink-3">
                  {new Date(row.created_at).toLocaleString("en-IN", {
                    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
                  })}
                </span>
              </Row>
              {row.body ? <p className="text-sm text-ink-2">{row.body}</p> : null}
              <span className="text-xs text-ink-3">{row.kind_label}</span>
            </Column>
          ))}
          <Pager page={page} count={notifications.data?.count ?? 0} onChange={setPage} />
        </Column>
      </QueryState>
    </>
  );
}
