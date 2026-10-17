"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import QueryState from "@/components/workspace/QueryState";
import { loadRazorpay } from "@/components/billing/razorpay";
import { type Role } from "@/Hooks/useSession";
import { cn } from "@/lib/cn";
import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";
import { queryClient } from "@/queryClient";
import type { Order, Plan } from "@/networking/types";

/**
 * Paying, and what has been paid. One component, both workspaces.
 *
 * A teacher's plans and an institution's are the same screen against a
 * different `audience` — the backend decides which rows exist and this decides
 * nothing, which is why there is one file and not two that drift.
 *
 * ## What this screen is NOT allowed to believe
 *
 * Razorpay's widget calls `handler` with a signature and we post it to
 * `/v1/pay/verify`. That call is a *report*, not proof: the server re-asks
 * Razorpay what actually happened before it settles anything, and the webhook
 * settles it independently a moment later. So a failure here does not mean the
 * money did not move — it means we could not confirm it yet, and the wording
 * below says exactly that rather than telling someone their successful payment
 * failed.
 */
export default function BillingPage({ role }: { role: Role }) {
  const [busy, setBusy] = useState<string | null>(null);

  const plans = useQuery({
    queryKey: ["plans", role],
    queryFn: () => ApiController.getPlans(role),
    staleTime: 5 * 60 * 1000,
  });

  const orders = useQuery({
    queryKey: ["pay", "orders"],
    queryFn: ApiController.getMyOrders,
  });

  const verify = useMutation({
    mutationFn: ApiController.verifyPayment,
    onSuccess: async (order: Order) => {
      toast.success(`Payment received. Receipt ${order.receipt_no}.`);
      await queryClient.invalidateQueries({ queryKey: ["pay", "orders"] });
    },
    onError: (error: unknown) => {
      // Deliberately not "your payment failed". If the webhook has not landed
      // yet the money may well have moved, and the row will flip to paid on its
      // own within moments.
      toast.info(
        error instanceof ClientError || error instanceof Error
          ? error.message
          : "We could not confirm that payment yet. It will update shortly.",
      );
      queryClient.invalidateQueries({ queryKey: ["pay", "orders"] });
    },
  });

  const pay = async (plan: Plan) => {
    setBusy(plan.code);
    try {
      // Order first, script second. If the server refuses — payments switched
      // off, plan withdrawn — the user is told before a third-party widget
      // appears over the page.
      const intent = await ApiController.createOrder(plan.code);
      await loadRazorpay();

      const Razorpay = window.Razorpay;
      if (!Razorpay) throw new Error("Could not open the payment window.");

      new Razorpay({
        key: intent.key_id,
        amount: intent.amount_paise,
        currency: intent.currency,
        order_id: intent.razorpay_order_id,
        name: plan.name,
        description: plan.description || undefined,
        prefill: {
          name: intent.name || undefined,
          email: intent.email || undefined,
          contact: intent.phone || undefined,
        },
        theme: { color: "#F0682B" },
        handler: (response) => {
          setBusy(null);
          verify.mutate(response);
        },
        modal: {
          // Closing the widget is not an error and must not leave a button
          // spinning for ever. The order stays in `created`, which is the
          // honest record of someone who opened checkout and thought better.
          ondismiss: () => setBusy(null),
        },
      }).open();
    } catch (error) {
      setBusy(null);
      toast.error(
        error instanceof ClientError || error instanceof Error
          ? error.message
          : "Could not start that payment.",
      );
    }
  };

  const rows = orders.data?.results ?? [];

  return (
    <>
      <QueryState
        isLoading={plans.isLoading}
        error={plans.error}
        isEmpty={(plans.data ?? []).length === 0}
        emptyTitle="Nothing to pay for"
        emptyHint="There is nothing on your account to pay for at the moment. If you were expecting a fee here, call the office."
      >
        <Column className="gap-2.5">
          {(plans.data ?? []).map((plan) => (
            <Column key={plan.id} className="card gap-3 p-4 sm:p-5">
              <Row className="flex-wrap items-start justify-between gap-3">
                <Column className="min-w-0 flex-1 gap-0.5">
                  <h2 className="font-display text-base font-bold text-ink-1">{plan.name}</h2>
                  {plan.description ? (
                    <p className="text-sm text-ink-2">{plan.description}</p>
                  ) : null}
                  <Row className="flex-wrap gap-1.5 pt-1">
                    {plan.grants_days ? (
                      <span className="chip">{plan.grants_days} days</span>
                    ) : null}
                    {plan.grants_vacancies ? (
                      <span className="chip">{plan.grants_vacancies} vacancies</span>
                    ) : null}
                    {plan.interval !== "once" ? (
                      <span className="chip">
                        {plan.interval === "monthly" ? "Every month" : "Every year"}
                      </span>
                    ) : (
                      <span className="chip">One-time</span>
                    )}
                  </Row>
                </Column>
                <Column className="shrink-0 items-end gap-2">
                  <span className="font-display text-xl font-extrabold text-ink-1">
                    ₹{plan.amount_rupees}
                  </span>
                  <button
                    type="button"
                    onClick={() => pay(plan)}
                    disabled={busy !== null || verify.isPending}
                    className="btn btn-accent"
                  >
                    {busy === plan.code ? "Opening…" : "Pay now"}
                  </button>
                </Column>
              </Row>
            </Column>
          ))}
        </Column>
      </QueryState>

      <Column className="card gap-3 p-4 sm:p-5">
        <Column className="gap-0.5">
          <h2 className="font-display text-base font-bold text-ink-1">Your payments</h2>
          <p className="text-sm text-ink-3">
            Every attempt is listed, including ones that did not go through.
            Receipts are emailed as soon as a payment clears.
          </p>
        </Column>

        <QueryState
          isLoading={orders.isLoading}
          error={orders.error}
          isEmpty={rows.length === 0}
          emptyTitle="Nothing yet"
          emptyHint="Payments you make will be listed here with their receipt numbers."
        >
          <Column className="gap-2">
            {rows.map((order) => (
              <Row
                key={order.id}
                className="flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3"
              >
                <Column className="min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-sm font-semibold text-ink-1">
                    {order.plan_name}
                  </span>
                  <span className="text-xs text-ink-3">
                    {order.receipt_no || "No receipt — not paid"}
                    {order.paid_at
                      ? ` · ${new Date(order.paid_at).toLocaleDateString("en-IN", {
                          day: "numeric", month: "short", year: "numeric",
                        })}`
                      : ""}
                    {order.method ? ` · ${order.method.toUpperCase()}` : ""}
                  </span>
                </Column>
                <Row className="shrink-0 items-center gap-2">
                  <span className="text-sm font-semibold text-ink-1">₹{order.amount_rupees}</span>
                  <StatusChip status={order.status} />
                </Row>
              </Row>
            ))}
          </Column>
        </QueryState>
      </Column>
    </>
  );
}

/** One place that decides what each status looks like, so the payer's screen
 *  and the office's cannot disagree about what "refunded" is coloured. */
export function StatusChip({ status }: { status: Order["status"] }) {
  const LABEL: Record<Order["status"], string> = {
    created: "Awaiting payment",
    paid: "Paid",
    failed: "Did not go through",
    refunded: "Refunded",
  };
  return (
    <span
      className={cn(
        "chip",
        status === "paid" && "chip-ok",
        status === "failed" && "chip-bad",
        status === "created" && "chip-warn",
      )}
    >
      {LABEL[status]}
    </span>
  );
}
