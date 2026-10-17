"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";

import { StatusChip } from "@/components/billing/BillingPage";
import Column from "@/components/common/Column";
import Pager from "@/components/common/Pager";
import Row from "@/components/common/Row";
import QueryState from "@/components/workspace/QueryState";
import { cn } from "@/lib/cn";
import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";
import { queryClient } from "@/queryClient";
import type { OrderPanel } from "@/networking/types";

/**
 * The ledger. Every attempt to pay, successful or not.
 *
 * Failed and abandoned rows are shown on purpose and are not noise: when
 * someone telephones to say they paid and it is not showing, the row that
 * answers the question is almost always a `failed` one with the bank's own
 * wording in it. That wording is staff-only — the payer's screen never shows
 * it, which is why this page exists rather than reusing theirs.
 */
const TABS = [
  { value: "", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "created", label: "Awaiting" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
];

export default function PanelPayments() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const payments = useQuery({
    queryKey: ["panel", "payments", { status, q, page }],
    queryFn: () => ApiController.panelPayments({ ...(status ? { status } : {}), ...(q ? { q } : {}), page }),
  });

  const rows = payments.data?.results ?? [];
  const takenPaise = rows
    .filter((row) => row.status === "paid")
    .reduce((sum, row) => sum + row.amount_paise - row.refunded_paise, 0);

  return (
    <>
      <Row className="flex-wrap items-center justify-between gap-3">
        <Row className="flex-wrap gap-1.5 rounded-xl bg-surface-2 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              onClick={() => { setStatus(tab.value); setPage(1); }}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors",
                status === tab.value ? "bg-surface text-ink-1 shadow-[var(--shadow-card)]" : "text-ink-3",
              )}
            >
              {tab.label}
            </button>
          ))}
        </Row>
        <input
          value={q}
          onChange={(event) => { setQ(event.target.value); setPage(1); }}
          placeholder="Receipt number or mobile"
          aria-label="Search payments"
          className="field w-auto min-w-[200px] py-1.5 text-sm"
        />
      </Row>

      {/* Net of refunds, and only for the page on screen — this is a reading
          aid for whoever is looking at these rows, not an accounting total.
          The real figure comes out of Razorpay's own settlement report. */}
      {takenPaise > 0 ? (
        <p className="text-sm text-ink-3">
          <b className="text-ink-1">₹{(takenPaise / 100).toLocaleString("en-IN")}</b> on this page,
          after refunds.
        </p>
      ) : null}

      <QueryState
        isLoading={payments.isLoading}
        error={payments.error}
        isEmpty={rows.length === 0}
        emptyTitle="No payments"
        emptyHint="Nothing matches that. Payments appear here the moment someone opens a checkout, whether or not they finish it."
      >
        <Column className="gap-2.5">
          {rows.map((row) => (
            <PaymentRow key={row.id} order={row} />
          ))}
          <Pager page={page} count={payments.data?.count ?? 0} onChange={setPage} />
        </Column>
      </QueryState>
    </>
  );
}

function PaymentRow({ order }: { order: OrderPanel }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const left = order.amount_paise - order.refunded_paise;
  const refundable = order.status === "paid" && left > 0;

  const refund = useMutation({
    mutationFn: () => ApiController.panelRefund(order.id, { reason }),
    onSuccess: async () => {
      toast.success("Refunded.");
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["panel", "payments"] });
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof ClientError || error instanceof Error
          ? error.message
          : "That refund did not go through.",
      ),
  });

  return (
    <Column className="card gap-2.5 p-4">
      <Row className="flex-wrap items-start justify-between gap-3">
        <Column className="min-w-0 flex-1 gap-0.5">
          <span className="truncate font-display text-sm font-bold text-ink-1">
            {order.user_name || "Unnamed"} · {order.user_phone}
          </span>
          <span className="text-sm text-ink-2">{order.plan_name}</span>
          <span className="text-xs text-ink-3">
            {order.receipt_no || "No receipt"}
            {order.paid_at
              ? ` · ${new Date(order.paid_at).toLocaleString("en-IN", {
                  day: "numeric", month: "short", year: "numeric",
                  hour: "numeric", minute: "2-digit",
                })}`
              : ` · opened ${new Date(order.created_at).toLocaleDateString("en-IN", {
                  day: "numeric", month: "short",
                })}`}
            {order.method ? ` · ${order.method.toUpperCase()}` : ""}
          </span>
        </Column>
        <Column className="shrink-0 items-end gap-1.5">
          <span className="font-display text-lg font-extrabold text-ink-1">
            ₹{order.amount_rupees}
          </span>
          <StatusChip status={order.status} />
        </Column>
      </Row>

      {/* Razorpay's own words. Staff only — this is the line that answers
          "I definitely paid" on the telephone. */}
      {order.failure_reason ? (
        <p className="rounded-lg bg-bad-soft px-3 py-2 text-xs text-bad">
          {order.failure_reason}
        </p>
      ) : null}

      {order.refunded_paise > 0 ? (
        <p className="text-xs text-ink-3">
          ₹{(order.refunded_paise / 100).toLocaleString("en-IN")} refunded
          {order.refunded_by_name ? ` by ${order.refunded_by_name}` : ""}
          {order.refund_reason ? ` — ${order.refund_reason}` : ""}
        </p>
      ) : null}

      {refundable ? (
        open ? (
          <Column className="gap-2 rounded-xl border border-line p-3">
            <label htmlFor={`reason-${order.id}`} className="label">
              Why is this being refunded?
            </label>
            <input
              id={`reason-${order.id}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Recorded against your name"
              className="field"
            />
            <Row className="flex-wrap gap-2">
              <button
                type="button"
                onClick={() => refund.mutate()}
                disabled={refund.isPending}
                className="btn btn-accent"
              >
                {refund.isPending
                  ? "Refunding…"
                  : `Refund ₹${(left / 100).toLocaleString("en-IN")}`}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn btn-ghost px-3 py-2 text-sm"
              >
                Cancel
              </button>
            </Row>
          </Column>
        ) : (
          <Row>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="btn btn-ghost px-3 py-2 text-sm"
            >
              Refund this
            </button>
          </Row>
        )
      ) : null}
    </Column>
  );
}
