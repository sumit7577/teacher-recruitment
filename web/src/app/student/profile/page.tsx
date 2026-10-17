"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";

import EmailCard from "@/components/account/EmailCard";
import Column from "@/components/common/Column";
import Field from "@/components/common/Field";
import Row from "@/components/common/Row";
import QueryState from "@/components/workspace/QueryState";
import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";
import { queryClient } from "@/queryClient";
import type { StudentProfileResp } from "@/networking/types";

const CLASSES = [
  ["nursery", "Nursery"], ["lkg", "LKG"], ["ukg", "UKG"],
  ...Array.from({ length: 12 }, (_, i) => [String(i + 1), `Class ${i + 1}`]),
] as const;

/** The family's own details, and the consent that makes them visible. */
export default function StudentProfilePage() {
  const profile = useQuery({
    queryKey: ["student", "profile"],
    queryFn: ApiController.getStudentProfile,
    retry: false,
  });

  return (
    <QueryState isLoading={profile.isLoading} error={null} loadingLabel="Loading your details">
      {profile.data ? (
        <>
          <ConsentCard profile={profile.data} />
          <EmailCard />
          <DetailsForm profile={profile.data} />
        </>
      ) : (
        <CreateForm />
      )}
    </QueryState>
  );
}

/**
 * The consent gate, at the top of the page because nothing else matters until
 * it is answered.
 *
 * A minor's profile is invisible to every teacher and cannot be contacted
 * through any route until a named guardian agrees. The wording says that
 * plainly rather than calling it "verification" — a parent should understand
 * exactly what they are agreeing to and what changes when they do.
 */
function ConsentCard({ profile }: { profile: StudentProfileResp }) {
  const [name, setName] = useState(profile.guardian_name || "");

  const consent = useMutation({
    mutationFn: () => ApiController.giveConsent(name),
    onSuccess: async () => {
      toast.success("Thank you. The profile is now visible to teachers.");
      await queryClient.invalidateQueries({ queryKey: ["student", "profile"] });
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof ClientError || error instanceof Error
          ? error.message : "That didn't work.",
      ),
  });

  if (!profile.is_minor) return null;

  if (!profile.needs_consent) {
    return (
      <Column className="card gap-1 p-4 sm:p-5">
        <Row className="flex-wrap items-center justify-between gap-2">
          <span className="font-display text-base font-bold text-ink-1">
            Guardian consent recorded
          </span>
          <span className="chip chip-ok">Given</span>
        </Row>
        <p className="text-sm text-ink-3">
          Agreed by {profile.guardian_consent_by || "a guardian"} on{" "}
          {profile.guardian_consent_at
            ? new Date(profile.guardian_consent_at).toLocaleDateString("en-IN", {
                day: "numeric", month: "long", year: "numeric",
              })
            : "—"}
          .
        </p>
      </Column>
    );
  }

  return (
    <Column className="card gap-3 border-accent bg-accent-soft p-4 sm:p-5">
      <Column className="gap-1">
        <Row className="flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold text-ink-1">
            A parent or guardian needs to agree
          </h2>
          <span className="chip chip-warn">Needed</span>
        </Row>
        <p className="text-sm leading-relaxed text-ink-2">
          {profile.student_name || "This student"} is under 18, so nothing is
          shown to any teacher until a parent or guardian agrees. Until then the
          profile and any tuition requirement stay private, and nobody can send
          a message.
        </p>
        <p className="text-sm leading-relaxed text-ink-2">
          Once you agree, teachers can see the class, the subjects and the
          general area — <b>never the home address, the date of birth or a phone
          number</b>. Contact only becomes possible after you accept an interest
          request.
        </p>
      </Column>

      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          consent.mutate();
        }}
      >
        <Column className="min-w-0 flex-1 gap-0">
          <label htmlFor="guardian" className="label">
            Parent or guardian&apos;s full name
          </label>
          <input
            id="guardian"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Type your name to agree"
            className="field"
          />
        </Column>
        <button
          type="submit"
          disabled={consent.isPending || name.trim().length < 3}
          className="btn btn-accent shrink-0"
        >
          {consent.isPending ? "Saving…" : "I agree"}
        </button>
      </form>
    </Column>
  );
}

function CreateForm() {
  const [form, setForm] = useState({
    account_holder: "parent", student_name: "", klass: "", date_of_birth: "",
    guardian_name: "", guardian_relation: "mother", guardian_phone: "", city: "",
  });
  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const create = useMutation({
    mutationFn: () =>
      ApiController.createStudentProfile({
        ...form,
        date_of_birth: form.date_of_birth || null,
      }),
    onSuccess: async () => {
      toast.success("Saved.");
      await queryClient.invalidateQueries({ queryKey: ["student", "profile"] });
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof ClientError || error instanceof Error
          ? error.message : "That didn't work.",
      ),
  });

  return (
    <Column className="card gap-4 p-4 sm:p-5">
      <Column className="gap-1">
        <h2 className="font-display text-base font-bold text-ink-1">Tell us who this is for</h2>
        <p className="text-sm text-ink-3">
          Only the class and the general area are ever shown to a teacher.
        </p>
      </Column>

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <Row className="flex-col gap-3 sm:flex-row">
          <Field label="Who is registering?" className="flex-1">
            <select
              value={form.account_holder}
              onChange={(e) => set("account_holder", e.target.value)}
              className="field"
            >
              <option value="parent">A parent or guardian</option>
              <option value="student">The student</option>
            </select>
          </Field>
          <Field label="Student's name" className="flex-1">
            <input
              value={form.student_name}
              onChange={(e) => set("student_name", e.target.value)}
              required
              className="field"
            />
          </Field>
        </Row>

        <Row className="flex-col gap-3 sm:flex-row">
          <Field label="Class" className="flex-1">
            <select value={form.klass} onChange={(e) => set("klass", e.target.value)} className="field">
              <option value="">Select</option>
              {CLASSES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="Date of birth" className="flex-1" hint="Decides whether a guardian must agree.">
            <input
              type="date"
              value={form.date_of_birth}
              onChange={(e) => set("date_of_birth", e.target.value)}
              className="field"
            />
          </Field>
        </Row>

        <Row className="flex-col gap-3 sm:flex-row">
          <Field label="Parent or guardian" className="flex-1">
            <input
              value={form.guardian_name}
              onChange={(e) => set("guardian_name", e.target.value)}
              className="field"
            />
          </Field>
          <Field label="Their mobile" className="flex-1">
            <input
              value={form.guardian_phone}
              onChange={(e) => set("guardian_phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
              inputMode="numeric"
              className="field"
            />
          </Field>
          <Field label="City" className="flex-1">
            <input value={form.city} onChange={(e) => set("city", e.target.value)} className="field" />
          </Field>
        </Row>

        <button
          type="submit"
          disabled={create.isPending || !form.student_name.trim()}
          className="btn btn-accent w-fit"
        >
          {create.isPending ? "Saving…" : "Save"}
        </button>
      </form>
    </Column>
  );
}

function DetailsForm({ profile }: { profile: StudentProfileResp }) {
  const [form, setForm] = useState({
    student_name: profile.student_name, klass: profile.klass,
    school_name: profile.school_name, board: profile.board, medium: profile.medium,
    guardian_name: profile.guardian_name, guardian_phone: profile.guardian_phone,
    address: profile.address, village: profile.village, city: profile.city,
    pincode: profile.pincode, is_hidden: profile.is_hidden,
  });
  const set = (key: string, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: () => ApiController.updateStudentProfile(form),
    onSuccess: async () => {
      toast.success("Saved.");
      await queryClient.invalidateQueries({ queryKey: ["student", "profile"] });
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof ClientError || error instanceof Error
          ? error.message : "That didn't save.",
      ),
  });

  return (
    <Column className="card gap-4 p-4 sm:p-5">
      <h2 className="font-display text-base font-bold text-ink-1">Your details</h2>

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <Row className="flex-col gap-3 sm:flex-row">
          <Field label="Student's name" className="flex-1">
            <input value={form.student_name} onChange={(e) => set("student_name", e.target.value)} className="field" />
          </Field>
          <Field label="Class" className="flex-1">
            <select value={form.klass} onChange={(e) => set("klass", e.target.value)} className="field">
              <option value="">Select</option>
              {CLASSES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
        </Row>

        <Row className="flex-col gap-3 sm:flex-row">
          <Field label="School" className="flex-1">
            <input value={form.school_name} onChange={(e) => set("school_name", e.target.value)} className="field" />
          </Field>
          <Field label="Medium" className="flex-1">
            <select value={form.medium} onChange={(e) => set("medium", e.target.value)} className="field">
              <option value="">Any</option>
              <option value="english">English</option>
              <option value="hindi">Hindi</option>
              <option value="both">Both</option>
              <option value="regional">Regional</option>
            </select>
          </Field>
        </Row>

        <Row className="flex-col gap-3 sm:flex-row">
          <Field label="Address" className="flex-1" hint="Never shown to a teacher.">
            <input value={form.address} onChange={(e) => set("address", e.target.value)} className="field" />
          </Field>
          <Field label="City" className="flex-1">
            <input value={form.city} onChange={(e) => set("city", e.target.value)} className="field" />
          </Field>
          <Field label="PIN code" className="flex-1">
            <input
              value={form.pincode}
              onChange={(e) => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              className="field"
            />
          </Field>
        </Row>

        <label className="flex flex-row items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={form.is_hidden}
            onChange={(e) => set("is_hidden", e.target.checked)}
          />
          Hide us from teachers for now
        </label>

        <button type="submit" disabled={save.isPending} className="btn btn-accent w-fit">
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </Column>
  );
}
