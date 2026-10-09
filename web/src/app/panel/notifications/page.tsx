"use client";

import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Field from "@/components/common/Field";
import Row from "@/components/common/Row";
import QueryState from "@/components/workspace/QueryState";
import ApiController from "@/networking";
import { queryClient } from "@/queryClient";

/**
 * "A push notification sender for new posts and walk-in days."
 *
 * Two steps on purpose. This button reaches every teacher the firm has, so the
 * preview — which answers with the headcount and sends nothing — comes first, and an
 * accidental double-click costs a draft rather than four hundred notifications.
 */
const AUDIENCES = [
  { value: "all", label: "Every teacher" },
  { value: "post", label: "One post type" },
  { value: "subject", label: "One subject" },
  { value: "city", label: "One city" },
  { value: "schools", label: "Every institution" },
];

export default function PanelNotifications() {
  const [form, setForm] = useState({ title: "", body: "", audience: "all", post: "", subject: "", city: "" });
  const [recipients, setRecipients] = useState<number | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);

  const campaigns = useQuery({
    queryKey: ["panel", "campaigns"],
    queryFn: () => ApiController.panelCampaigns(),
  });
  const facets = useQuery({
    queryKey: ["public", "facets"],
    queryFn: ApiController.getVacancyFacets,
    staleTime: 10 * 60 * 1000,
  });

  const filters = () => {
    if (form.audience === "post") return { post: form.post };
    if (form.audience === "subject") return { subject: form.subject };
    if (form.audience === "city") return { city: form.city };
    return {};
  };

  const saveDraft = useMutation({
    mutationFn: () =>
      ApiController.panelCreateCampaign(
        { title: form.title, body: form.body, audience: form.audience, filters: filters() },
        false,
      ),
    onSuccess: (campaign) => {
      setDraftId(campaign.id);
      queryClient.invalidateQueries({ queryKey: ["panel", "campaigns"] });
      toast.success("Draft saved. Check who it will reach, then send it.");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "That did not save."),
  });

  const preview = useMutation({
    mutationFn: async () => {
      // Needs a saved row, because the audience is resolved server-side from the
      // campaign's own filter — the same resolution the real send will do.
      const id = draftId ?? (await saveDraft.mutateAsync()).id;
      setDraftId(id);
      return ApiController.panelSendCampaign(id, true);
    },
    onSuccess: (answer) => {
      const data = answer.data as { recipients?: number };
      setRecipients(data?.recipients ?? 0);
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "That did not work."),
  });

  const send = useMutation({
    mutationFn: async () => {
      const id = draftId ?? (await saveDraft.mutateAsync()).id;
      return ApiController.panelSendCampaign(id, false);
    },
    onSuccess: (answer) => {
      toast.success(answer.message || "Sent.");
      setForm({ title: "", body: "", audience: "all", post: "", subject: "", city: "" });
      setRecipients(null);
      setDraftId(null);
      queryClient.invalidateQueries({ queryKey: ["panel", "campaigns"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "That did not send."),
  });

  const ready = Boolean(form.title.trim());
  const busy = saveDraft.isPending || preview.isPending || send.isPending;

  // Editing after a preview invalidates the count — showing the old number beside
  // changed filters is the one way this screen could mislead.
  const change = (patch: Partial<typeof form>) => {
    setForm({ ...form, ...patch });
    setRecipients(null);
    setDraftId(null);
  };

  return (
    <>
      <Column className="card gap-4 p-4 sm:p-5">
        <Column className="gap-1">
          <h2 className="font-display text-base font-bold text-ink-1">Send a notification</h2>
          <p className="text-sm text-ink-2">
            Goes to the app. Check who it will reach before you send it — the count is
            worked out the same way the send is.
          </p>
        </Column>

        <Field label="Title" hint="Short. It is what shows on the lock screen.">
          <input
            value={form.title}
            onChange={(event) => change({ title: event.target.value })}
            maxLength={160}
            className="field"
          />
        </Field>

        <Field label="Message">
          <textarea
            value={form.body}
            onChange={(event) => change({ body: event.target.value })}
            rows={3}
            className="field resize-y"
          />
        </Field>

        <Row className="flex-col gap-4 sm:flex-row">
          <Field label="Who gets it" className="flex-1">
            <select
              value={form.audience}
              onChange={(event) => change({ audience: event.target.value })}
              className="field"
            >
              {AUDIENCES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>

          {form.audience === "post" ? (
            <Field label="Which post" className="flex-1">
              <select value={form.post} onChange={(event) => change({ post: event.target.value })} className="field">
                <option value="">Choose</option>
                {(facets.data?.taxonomy.posts ?? []).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
          ) : null}
          {form.audience === "subject" ? (
            <Field label="Which subject" className="flex-1">
              <input
                value={form.subject}
                onChange={(event) => change({ subject: event.target.value })}
                placeholder="Physics"
                className="field"
              />
            </Field>
          ) : null}
          {form.audience === "city" ? (
            <Field label="Which city" className="flex-1">
              <select value={form.city} onChange={(event) => change({ city: event.target.value })} className="field">
                <option value="">Choose</option>
                {(facets.data?.city ?? []).map((entry) => (
                  <option key={entry.value} value={entry.value}>{entry.value}</option>
                ))}
              </select>
            </Field>
          ) : null}
        </Row>

        {recipients !== null ? (
          <p
            className={
              recipients === 0
                ? "rounded-xl bg-warn-soft p-3 text-sm text-ink-2"
                : "rounded-xl bg-accent-soft p-3 text-sm text-ink-1"
            }
          >
            {recipients === 0
              ? "Nobody matches that — nothing would be sent."
              : `This will go to ${recipients} ${recipients === 1 ? "person" : "people"}.`}
          </p>
        ) : null}

        <Row className="flex-wrap justify-end gap-2.5">
          <button
            type="button"
            onClick={() => saveDraft.mutate()}
            disabled={!ready || busy}
            className="btn btn-ghost"
          >
            Save as a draft
          </button>
          <button
            type="button"
            onClick={() => preview.mutate()}
            disabled={!ready || busy}
            className="btn btn-outline"
          >
            {preview.isPending ? "Checking…" : "Who will get it?"}
          </button>
          <button
            type="button"
            onClick={() => send.mutate()}
            disabled={!ready || busy || recipients === null || recipients === 0}
            title={recipients === null ? "Check who it will reach first" : undefined}
            className="btn btn-accent"
          >
            <PaperAirplaneIcon aria-hidden className="h-4 w-4" />
            {send.isPending ? "Sending…" : "Send it"}
          </button>
        </Row>
        {recipients === null ? (
          <p className="text-right text-xs text-ink-3">
            Check who it will reach before Send becomes available.
          </p>
        ) : null}
      </Column>

      <Column className="gap-3">
        <h2 className="font-display text-lg font-bold text-ink-1">What has been sent</h2>
        <QueryState
          isLoading={campaigns.isLoading}
          error={campaigns.error}
          isEmpty={(campaigns.data?.results ?? []).length === 0}
          emptyTitle="Nothing sent yet"
          emptyHint="New vacancies notify matching teachers automatically when they are published — this is for everything else."
        >
          <Column className="gap-2.5">
            {(campaigns.data?.results ?? []).map((campaign) => (
              <Column key={campaign.id} className="card gap-1 p-4">
                <Row className="flex-wrap items-start justify-between gap-2">
                  <span className="font-semibold text-ink-1">{campaign.title}</span>
                  <Row className="items-center gap-2">
                    <span className="chip">{campaign.audience_label}</span>
                    <span className={campaign.status === "sent" ? "chip chip-ok" : "chip chip-warn"}>
                      {campaign.status_label}
                    </span>
                  </Row>
                </Row>
                {campaign.body ? <p className="text-sm text-ink-2">{campaign.body}</p> : null}
                <span className="text-xs text-ink-3">
                  {campaign.status === "sent"
                    ? `${campaign.recipients} people · ${campaign.delivered} delivered${
                        campaign.failed ? `, ${campaign.failed} failed` : ""
                      }`
                    : "Not sent"}
                  {campaign.sent_by_name ? ` · ${campaign.sent_by_name}` : ""}
                  {campaign.sent_at
                    ? ` · ${new Date(campaign.sent_at).toLocaleString("en-IN", {
                        day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
                      })}`
                    : ""}
                </span>
                {campaign.error ? <span className="text-xs text-bad">{campaign.error}</span> : null}
              </Column>
            ))}
          </Column>
        </QueryState>
      </Column>
    </>
  );
}
