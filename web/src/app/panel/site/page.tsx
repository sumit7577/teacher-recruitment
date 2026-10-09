"use client";

import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Field from "@/components/common/Field";
import Row from "@/components/common/Row";
import QueryState from "@/components/workspace/QueryState";
import { cn } from "@/lib/cn";
import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";
import { queryClient } from "@/queryClient";
import type {
  ProcessStepResp,
  ServiceResp,
  SiteSettings,
  TeamMemberResp,
  TestimonialResp,
} from "@/networking/types";

/**
 * "This is the part that decides whether the site is still alive in six months.
 * Everything on the website and in the app is edited here, by your staff, without
 * calling a developer."
 *
 * So every word on the five public pages is a row, and this is where they are
 * edited — including the two brand colours, which the website reads at render time.
 */
const TABS = [
  { value: "brand", label: "Brand & contact" },
  { value: "services", label: "Services" },
  { value: "process", label: "How it works" },
  { value: "team", label: "Team" },
  { value: "testimonials", label: "Testimonials" },
] as const;

export default function PanelSite() {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("brand");

  return (
    <>
      <Row className="flex-wrap gap-1.5 rounded-xl bg-surface-2 p-1">
        {TABS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            onClick={() => setTab(entry.value)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors",
              tab === entry.value ? "bg-surface text-ink-1 shadow-[var(--shadow-card)]" : "text-ink-3",
            )}
          >
            {entry.label}
          </button>
        ))}
      </Row>

      {tab === "brand" ? <Brand /> : null}
      {tab === "services" ? <Services /> : null}
      {tab === "process" ? <Process /> : null}
      {tab === "team" ? <Team /> : null}
      {tab === "testimonials" ? <Testimonials /> : null}
    </>
  );
}

function fail(error: unknown) {
  if (error instanceof ClientError && error.errors) {
    toast.error(Object.values(error.errors)[0] ?? error.message);
    return;
  }
  toast.error(error instanceof Error ? error.message : "That did not save.");
}

/* ── the brand, the contact details, and the numbers ──────────────────────── */

function Brand() {
  const settings = useQuery({
    queryKey: ["panel", "site", "settings"],
    queryFn: ApiController.panelSiteSettings,
  });
  const [form, setForm] = useState<Partial<SiteSettings> | null>(null);
  const [loaded, setLoaded] = useState(false);

  if (settings.data && !loaded) {
    setForm(settings.data);
    setLoaded(true);
  }

  const save = useMutation({
    mutationFn: () => ApiController.panelUpdateSiteSettings(form as Record<string, unknown>),
    onSuccess: () => {
      toast.success("Saved. The website picks it up within five minutes.");
      queryClient.invalidateQueries({ queryKey: ["panel", "site"] });
    },
    onError: fail,
  });

  const upload = useMutation({
    mutationFn: (args: { field: string; file: File }) => {
      const body = new FormData();
      body.set(args.field, args.file);
      return ApiController.panelUpdateSiteSettings(body);
    },
    onSuccess: () => {
      toast.success("Uploaded.");
      queryClient.invalidateQueries({ queryKey: ["panel", "site"] });
    },
    onError: fail,
  });

  const set = (patch: Partial<SiteSettings>) => setForm({ ...(form ?? {}), ...patch });

  return (
    <QueryState isLoading={settings.isLoading} error={settings.error} loadingLabel="Loading">
      {form ? (
        <>
          <Column className="card gap-4 p-4 sm:p-5">
            <h2 className="font-display text-base font-bold text-ink-1">The brand</h2>

            <Row className="flex-col gap-4 sm:flex-row">
              <Field label="Name" className="flex-1">
                <input
                  value={form.brand_name ?? ""}
                  onChange={(event) => set({ brand_name: event.target.value })}
                  className="field"
                />
              </Field>
              <Field label="Established" className="sm:w-32">
                <input
                  value={String(form.established_year ?? "")}
                  onChange={(event) =>
                    set({ established_year: Number(event.target.value.replace(/\D/g, "")) || null })
                  }
                  inputMode="numeric"
                  className="field"
                />
              </Field>
            </Row>

            <Field label="Tagline" hint="Under the name in the footer, and on Home when no heading is set.">
              <input
                value={form.tagline ?? ""}
                onChange={(event) => set({ tagline: event.target.value })}
                className="field"
              />
            </Field>

            {/*
              The two colours. These are written straight into the site's CSS custom
              properties, so changing them here re-skins the whole website, the app's
              web views and this panel — which is the "one block of settings, not a
              rebuild" the proposal promises.
            */}
            <Row className="flex-col gap-4 sm:flex-row">
              <Field label="Accent colour" hint="Buttons, links, the salary on a vacancy." className="flex-1" group>
                <Row className="items-center gap-2">
                  <input
                    type="color"
                    value={form.accent_colour ?? "#f0682b"}
                    onChange={(event) => set({ accent_colour: event.target.value })}
                    aria-label="Accent colour"
                    className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface"
                  />
                  <input
                    value={form.accent_colour ?? ""}
                    onChange={(event) => set({ accent_colour: event.target.value })}
                    aria-label="Accent colour, as a hex value"
                    className="field"
                  />
                </Row>
              </Field>
              <Field label="Deep colour" hint="The hero band and the footer." className="flex-1" group>
                <Row className="items-center gap-2">
                  <input
                    type="color"
                    value={form.deep_colour ?? "#14283f"}
                    onChange={(event) => set({ deep_colour: event.target.value })}
                    aria-label="Deep colour"
                    className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface"
                  />
                  <input
                    value={form.deep_colour ?? ""}
                    onChange={(event) => set({ deep_colour: event.target.value })}
                    aria-label="Deep colour, as a hex value"
                    className="field"
                  />
                </Row>
              </Field>
            </Row>

            <Row className="flex-wrap gap-4">
              {([
                ["logo", "Logo"],
                ["logo_dark", "Logo for dark backgrounds"],
                ["favicon", "Favicon"],
                ["og_image", "Share image"],
              ] as const).map(([field, label]) => (
                <Column key={field} className="gap-1.5">
                  <span className="label">{label}</span>
                  {form[field] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form[field] as string}
                      alt=""
                      className="h-12 w-auto max-w-[8rem] rounded-lg border border-line object-contain"
                    />
                  ) : (
                    <span className="text-xs text-ink-3">Not set</span>
                  )}
                  <label className="btn btn-outline cursor-pointer text-sm">
                    {form[field] ? "Replace" : "Upload"}
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.svg"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) upload.mutate({ field, file });
                        event.target.value = "";
                      }}
                    />
                  </label>
                </Column>
              ))}
            </Row>
          </Column>

          <Column className="card gap-4 p-4 sm:p-5">
            <h2 className="font-display text-base font-bold text-ink-1">Contact details</h2>
            <Row className="flex-col gap-4 sm:flex-row">
              <Field label="Phone" className="flex-1">
                <input
                  value={form.phone ?? ""}
                  onChange={(event) => set({ phone: event.target.value })}
                  className="field"
                />
              </Field>
              <Field label="WhatsApp" className="flex-1">
                <input
                  value={form.whatsapp ?? ""}
                  onChange={(event) => set({ whatsapp: event.target.value })}
                  className="field"
                />
              </Field>
              <Field label="Email" className="flex-1">
                <input
                  value={form.email ?? ""}
                  onChange={(event) => set({ email: event.target.value })}
                  type="email"
                  className="field"
                />
              </Field>
            </Row>
            <Field label="Office address">
              <textarea
                value={form.address ?? ""}
                onChange={(event) => set({ address: event.target.value })}
                rows={2}
                className="field resize-y"
              />
            </Field>
            <Field label="Office hours">
              <input
                value={form.office_hours ?? ""}
                onChange={(event) => set({ office_hours: event.target.value })}
                placeholder="Monday to Saturday, 10am – 6pm"
                className="field"
              />
            </Field>
          </Column>

          <Column className="card gap-4 p-4 sm:p-5">
            <h2 className="font-display text-base font-bold text-ink-1">About, and the numbers</h2>
            <Field label="Heading" hint="The big line on Home and at the top of About.">
              <input
                value={form.about_heading ?? ""}
                onChange={(event) => set({ about_heading: event.target.value })}
                className="field"
              />
            </Field>
            <Field label="About the firm">
              <textarea
                value={form.about_body ?? ""}
                onChange={(event) => set({ about_body: event.target.value })}
                rows={5}
                className="field resize-y"
              />
            </Field>

            <Field label="The numbers" hint="Shown on Home and About. Leave a label blank to drop it." group>
              <Column className="gap-2">
                {(form.stats ?? []).map((stat, index) => (
                  <Row key={index} className="flex-wrap items-center gap-2">
                    <input
                      value={stat.label}
                      onChange={(event) => {
                        const stats = [...(form.stats ?? [])];
                        stats[index] = { ...stat, label: event.target.value };
                        set({ stats });
                      }}
                      placeholder="Teachers placed"
                      aria-label={`Label ${index + 1}`}
                      className="field flex-1"
                    />
                    <input
                      value={stat.value}
                      onChange={(event) => {
                        const stats = [...(form.stats ?? [])];
                        stats[index] = { ...stat, value: event.target.value };
                        set({ stats });
                      }}
                      placeholder="1,200+"
                      aria-label={`Value ${index + 1}`}
                      className="field w-28"
                    />
                    <input
                      value={stat.note ?? ""}
                      onChange={(event) => {
                        const stats = [...(form.stats ?? [])];
                        stats[index] = { ...stat, note: event.target.value };
                        set({ stats });
                      }}
                      placeholder="since 2016"
                      aria-label={`Note ${index + 1}`}
                      className="field w-36"
                    />
                    <button
                      type="button"
                      onClick={() => set({ stats: (form.stats ?? []).filter((_, i) => i !== index) })}
                      aria-label={`Remove ${stat.label || `number ${index + 1}`}`}
                      className="btn btn-ghost p-2"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </Row>
                ))}
                <button
                  type="button"
                  onClick={() => set({ stats: [...(form.stats ?? []), { label: "", value: "", note: "" }] })}
                  className="btn btn-outline w-fit text-sm"
                >
                  <PlusIcon aria-hidden className="h-4 w-4" />
                  Add a number
                </button>
              </Column>
            </Field>
          </Column>

          <Column className="card gap-4 p-4 sm:p-5">
            <h2 className="font-display text-base font-bold text-ink-1">Google</h2>
            <Field label="Page title" hint="What Google shows as the headline.">
              <input
                value={form.seo_title ?? ""}
                onChange={(event) => set({ seo_title: event.target.value })}
                maxLength={200}
                className="field"
              />
            </Field>
            <Field label="Description" hint="The two lines under it. Around 155 characters.">
              <textarea
                value={form.seo_description ?? ""}
                onChange={(event) => set({ seo_description: event.target.value })}
                rows={2}
                maxLength={320}
                className="field resize-y"
              />
            </Field>
            <Field
              label="Search Console verification"
              hint="The content of the google-site-verification meta tag."
            >
              <input
                value={form.google_verification ?? ""}
                onChange={(event) => set({ google_verification: event.target.value })}
                className="field"
              />
            </Field>
          </Column>

          <Row className="sticky bottom-0 justify-end border-t border-line bg-paper/95 py-3 backdrop-blur">
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="btn btn-accent"
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </Row>
        </>
      ) : null}
    </QueryState>
  );
}

/* ── the four reorderable collections ─────────────────────────────────────── */

/**
 * One editor for four tables.
 *
 * They are the same shape — a list of short rows with an order, a published flag and
 * two or three text fields — so they share this rather than being written four
 * times. `fields` describes what differs, which keeps the difference in one place
 * where it can be compared.
 */
type FieldSpec = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "select" | "image";
  hint?: string;
  options?: { value: string; label: string }[];
};

function Collection<T extends { id: string; order: number; is_published: boolean }>({
  collection, title, blurb, fields, titleOf, blank,
}: {
  collection: "services" | "process" | "team" | "testimonials";
  title: string;
  blurb: string;
  fields: FieldSpec[];
  titleOf: (row: T) => string;
  blank: Record<string, unknown>;
}) {
  const rows = useQuery({
    queryKey: ["panel", "site", collection],
    queryFn: () => ApiController.panelContent<T>(collection),
  });
  const [adding, setAdding] = useState(false);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown> | FormData) =>
      ApiController.panelCreateContent<T>(collection, body),
    onSuccess: () => {
      setAdding(false);
      toast.success("Added.");
      queryClient.invalidateQueries({ queryKey: ["panel", "site", collection] });
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (id: string) => ApiController.panelDeleteContent(collection, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["panel", "site", collection] }),
    onError: fail,
  });

  return (
    <>
      <Row className="flex-wrap items-start justify-between gap-3">
        <Column className="gap-1">
          <h2 className="font-display text-base font-bold text-ink-1">{title}</h2>
          <p className="text-sm text-ink-2">{blurb}</p>
        </Column>
        <button type="button" onClick={() => setAdding((open) => !open)} className="btn btn-outline">
          {adding ? "Cancel" : "Add one"}
        </button>
      </Row>

      {adding ? (
        <RowEditor
          fields={fields}
          initial={blank}
          saving={create.isPending}
          onSave={(body) => create.mutate(body)}
        />
      ) : null}

      <QueryState
        isLoading={rows.isLoading}
        error={rows.error}
        isEmpty={(rows.data ?? []).length === 0}
        emptyTitle="Nothing here yet"
        emptyHint="Add one and it appears on the website straight away."
      >
        <Column className="gap-3">
          {(rows.data ?? []).map((row) => (
            <ExistingRow
              key={row.id}
              collection={collection}
              row={row}
              fields={fields}
              label={titleOf(row)}
              onRemove={() => remove.mutate(row.id)}
            />
          ))}
        </Column>
      </QueryState>
    </>
  );
}

function ExistingRow<T extends { id: string; order: number; is_published: boolean }>({
  collection, row, fields, label, onRemove,
}: {
  collection: "services" | "process" | "team" | "testimonials";
  row: T;
  fields: FieldSpec[];
  label: string;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  const update = useMutation({
    mutationFn: (body: Record<string, unknown> | FormData) =>
      ApiController.panelUpdateContent<T>(collection, row.id, body),
    onSuccess: () => {
      toast.success("Saved.");
      queryClient.invalidateQueries({ queryKey: ["panel", "site", collection] });
    },
    onError: fail,
  });

  return (
    <Column className="card gap-3 p-4">
      <Row className="flex-wrap items-center justify-between gap-3">
        <Column className="min-w-0 gap-0.5">
          <span className="truncate font-semibold text-ink-1">{label || "Untitled"}</span>
          <span className="text-xs text-ink-3">Position {row.order}</span>
        </Column>
        <Row className="items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={row.is_published}
              onChange={(event) => update.mutate({ is_published: event.target.checked })}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            On the site
          </label>
          <button type="button" onClick={() => setOpen((value) => !value)} className="btn btn-ghost text-sm">
            {open ? "Close" : "Edit"}
          </button>
          <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="btn btn-ghost p-2">
            <TrashIcon className="h-4 w-4" />
          </button>
        </Row>
      </Row>

      {open ? (
        <RowEditor
          fields={fields}
          initial={row as unknown as Record<string, unknown>}
          saving={update.isPending}
          onSave={(body) => update.mutate(body)}
        />
      ) : null}
    </Column>
  );
}

function RowEditor({
  fields, initial, saving, onSave,
}: {
  fields: FieldSpec[];
  initial: Record<string, unknown>;
  saving: boolean;
  onSave: (body: Record<string, unknown> | FormData) => void;
}) {
  const [form, setForm] = useState<Record<string, unknown>>(() => {
    const seed: Record<string, unknown> = {};
    for (const field of fields) seed[field.key] = initial[field.key] ?? "";
    seed.order = initial.order ?? 0;
    return seed;
  });
  const [file, setFile] = useState<File | null>(null);

  function submit() {
    if (file) {
      // Multipart when there is a photograph, JSON otherwise — the backend takes
      // both, and FormData for every save would send the text fields as strings
      // where a number is expected.
      const body = new FormData();
      for (const [key, value] of Object.entries(form)) body.set(key, String(value ?? ""));
      const imageField = fields.find((field) => field.type === "image");
      if (imageField) body.set(imageField.key, file);
      onSave(body);
      return;
    }
    onSave(form);
  }

  return (
    <Column className="gap-3 rounded-xl bg-surface-2 p-3.5">
      {fields.map((field) => (
        <Field key={field.key} label={field.label} hint={field.hint}>
          {field.type === "textarea" ? (
            <textarea
              value={String(form[field.key] ?? "")}
              onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
              rows={3}
              className="field resize-y"
            />
          ) : field.type === "select" ? (
            <select
              value={String(form[field.key] ?? "")}
              onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
              className="field"
            >
              {(field.options ?? []).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : field.type === "image" ? (
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="field file:mr-3 file:rounded-md file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-accent"
            />
          ) : (
            <input
              value={String(form[field.key] ?? "")}
              onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
              className="field"
            />
          )}
        </Field>
      ))}
      <Field label="Position" hint="Lower numbers come first.">
        <input
          value={String(form.order ?? 0)}
          onChange={(event) => setForm({ ...form, order: Number(event.target.value.replace(/\D/g, "")) || 0 })}
          inputMode="numeric"
          className="field w-24"
        />
      </Field>
      <Row className="justify-end">
        <button type="button" onClick={submit} disabled={saving} className="btn btn-accent text-sm">
          {saving ? "Saving…" : "Save"}
        </button>
      </Row>
    </Column>
  );
}

/* ── the four instances ───────────────────────────────────────────────────── */

const ICON_OPTIONS = [
  { value: "UserGroupIcon", label: "People" },
  { value: "DocumentCheckIcon", label: "Document with a tick" },
  { value: "PresentationChartBarIcon", label: "Presentation" },
  { value: "ArrowPathIcon", label: "Replacement / cycle" },
  { value: "ShieldCheckIcon", label: "Shield" },
];

function Services() {
  return (
    <Collection<ServiceResp>
      collection="services"
      title="Services"
      blurb="The cards on For Institutions."
      titleOf={(row) => row.title}
      blank={{ title: "", description: "", icon: "UserGroupIcon", order: 0 }}
      fields={[
        { key: "title", label: "Title" },
        { key: "description", label: "Description", type: "textarea" },
        { key: "icon", label: "Icon", type: "select", options: ICON_OPTIONS },
      ]}
    />
  );
}

function Process() {
  return (
    <Collection<ProcessStepResp>
      collection="process"
      title="How it works"
      blurb="The numbered steps. Institutions and teachers have their own list."
      titleOf={(row) => `${row.title} — ${row.audience === "teacher" ? "for teachers" : "for institutions"}`}
      blank={{ title: "", description: "", timing: "", audience: "institution", order: 0 }}
      fields={[
        { key: "title", label: "Title" },
        { key: "description", label: "Description", type: "textarea" },
        { key: "timing", label: "Timing", hint: "“Day 1”, “Days 2–5”. Shown as a chip beside the step." },
        {
          key: "audience",
          label: "Whose list",
          type: "select",
          options: [
            { value: "institution", label: "For institutions" },
            { value: "teacher", label: "For teachers" },
          ],
        },
      ]}
    />
  );
}

function Team() {
  return (
    <Collection<TeamMemberResp>
      collection="team"
      title="The team"
      blurb="The consultants a principal will be dealing with. A named person with no number is a brochure, so the phone shows on the About page."
      titleOf={(row) => `${row.name}${row.role ? ` — ${row.role}` : ""}`}
      blank={{ name: "", role: "", bio: "", phone: "", email: "", order: 0 }}
      fields={[
        { key: "name", label: "Name" },
        { key: "role", label: "Role" },
        { key: "bio", label: "A line or two", type: "textarea" },
        { key: "phone", label: "Phone" },
        { key: "email", label: "Email" },
        { key: "photo", label: "Photograph", type: "image" },
      ]}
    />
  );
}

function Testimonials() {
  return (
    <Collection<TestimonialResp>
      collection="testimonials"
      title="Testimonials"
      blurb="One shows on Home and one on For Institutions — whichever is first in each list."
      titleOf={(row) => `${row.author}${row.institution ? ` — ${row.institution}` : ""}`}
      blank={{ quote: "", author: "", author_role: "", institution: "", side: "institution", order: 0 }}
      fields={[
        { key: "quote", label: "What they said", type: "textarea" },
        { key: "author", label: "Who said it" },
        { key: "author_role", label: "Their role" },
        { key: "institution", label: "Their institution" },
        {
          key: "side",
          label: "Which page",
          type: "select",
          options: [
            { value: "institution", label: "An institution — For Institutions" },
            { value: "teacher", label: "A teacher — Home" },
          ],
        },
        { key: "photo", label: "Photograph", type: "image" },
      ]}
    />
  );
}
