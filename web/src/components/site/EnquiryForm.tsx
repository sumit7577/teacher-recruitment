"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Field from "@/components/common/Field";
import Row from "@/components/common/Row";
import { cn } from "@/lib/cn";
import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";
import type { Choice } from "@/networking/types";

type Side = "teacher" | "institution";

/**
 * "One form for both sides — teacher or institution."
 *
 * The switch at the top changes which questions get asked, exactly as the demo
 * does, because the four things that matter about a teacher and the four that
 * matter about a school have nothing in common.
 *
 * Multipart, not JSON: a teacher can attach their CV here, and the backend's
 * enquiry endpoint takes a file.
 *
 * `initialSide` is a prop, not `useSearchParams()`. Reading the query string with
 * that hook opts the component out of prerendering, so the entire form was
 * missing from the served HTML and arrived only after hydration — a blank panel
 * on a slow phone, and nothing for a crawler. The page is a server component and
 * already has `searchParams`, so it passes the answer down and this stays
 * server-rendered.
 */
export default function EnquiryForm({
  posts, experience, institutions, initialSide = "teacher",
}: {
  posts: Choice[];
  experience: Choice[];
  institutions: Choice[];
  initialSide?: Side;
}) {
  const [side, setSide] = useState<Side>(initialSide);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const send = useMutation({
    mutationFn: (form: FormData) => ApiController.sendEnquiry(form),
    onSuccess: () => {
      setErrors({});
      setDone(true);
    },
    onError: (error: unknown) => {
      if (error instanceof ClientError && error.errors) {
        setErrors(error.errors);
        // A field error is already shown beside its field; a toast as well is
        // noise. Anything without field errors has no other way to be seen.
        return;
      }
      toast.error(error instanceof Error ? error.message : "That did not send. Please try again.");
    },
  });

  if (done) {
    return (
      <Column className="card items-start gap-3 p-6">
        <span className="chip chip-ok">Sent</span>
        <h3 className="font-display text-lg font-bold text-ink-1">Thanks — we have your message.</h3>
        <p className="text-[15px] text-ink-2">
          Someone from the office will call you back. If it is urgent, ring the number above.
        </p>
      </Column>
    );
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("side", side);
    form.set("source_path", window.location.pathname + window.location.search);
    send.mutate(form);
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-5 p-5 sm:p-6">
      <Row className="rounded-xl bg-surface-2 p-1">
        {(["teacher", "institution"] as Side[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => { setSide(option); setErrors({}); }}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              side === option ? "bg-surface text-ink-1 shadow-[var(--shadow-card)]" : "text-ink-3",
            )}
          >
            {option === "teacher" ? "I am a teacher" : "I am hiring"}
          </button>
        ))}
      </Row>

      <Field label="Your name" error={errors.name}>
        <input name="name" required className="field" autoComplete="name" />
      </Field>

      <Row className="flex-col gap-4 sm:flex-row">
        <Field label="Mobile number" error={errors.phone} className="flex-1">
          <input
            name="phone"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="10-digit mobile"
            className="field"
          />
        </Field>
        <Field label="Email (optional)" error={errors.email} className="flex-1">
          <input name="email" type="email" autoComplete="email" className="field" />
        </Field>
      </Row>

      <Field label="City" error={errors.city}>
        <input name="city" className="field" autoComplete="address-level2" />
      </Field>

      {side === "teacher" ? (
        <>
          <Row className="flex-col gap-4 sm:flex-row">
            <Field label="Post you are looking for" error={errors.post} className="flex-1">
              <select name="post" className="field" defaultValue="">
                <option value="">Choose a post</option>
                {posts.map((post) => (
                  <option key={post.value} value={post.value}>{post.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Subject" error={errors.subject} className="flex-1">
              <input name="subject" className="field" placeholder="Physics, Mathematics…" />
            </Field>
          </Row>
          <Row className="flex-col gap-4 sm:flex-row">
            <Field label="Qualification" error={errors.qualification} className="flex-1">
              <input name="qualification" className="field" placeholder="M.Sc + B.Ed, CTET cleared" />
            </Field>
            <Field label="Experience" error={errors.experience_band} className="flex-1">
              <select name="experience_band" className="field" defaultValue="">
                <option value="">Choose</option>
                {experience.map((band) => (
                  <option key={band.value} value={band.value}>{band.label}</option>
                ))}
              </select>
            </Field>
          </Row>
          <Field label="Your CV (PDF or a photo)" error={errors.cv}>
            <input
              name="cv"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="field file:mr-3 file:rounded-md file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-accent"
            />
          </Field>
        </>
      ) : (
        <>
          <Row className="flex-col gap-4 sm:flex-row">
            <Field label="Institution name" error={errors.institution_name} className="flex-1">
              <input name="institution_name" required className="field" />
            </Field>
            <Field label="Type" error={errors.institution_type} className="flex-1">
              <select name="institution_type" className="field" defaultValue="">
                <option value="">Choose</option>
                {institutions.map((entry) => (
                  <option key={entry.value} value={entry.value}>{entry.label}</option>
                ))}
              </select>
            </Field>
          </Row>
          <Field label="How many vacancies?" error={errors.vacancies_count}>
            <input name="vacancies_count" type="number" min={1} className="field sm:w-40" />
          </Field>
        </>
      )}

      <Field label={side === "teacher" ? "Anything else" : "Which posts, and by when?"} error={errors.message}>
        <textarea name="message" rows={4} className="field resize-y" />
      </Field>

      {/* The honeypot. Hidden from people, invisible to assistive tech, and
          irresistible to a form bot — anything that fills it is rejected. */}
      <input
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="pointer-events-none absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      <button type="submit" className="btn btn-accent" disabled={send.isPending}>
        {send.isPending ? "Sending…" : side === "teacher" ? "Register my interest" : "Tell us about the vacancy"}
      </button>
      <p className="text-xs text-ink-3">
        We use your number to call you about {side === "teacher" ? "vacancies" : "your vacancies"} and
        nothing else.
      </p>
    </form>
  );
}
