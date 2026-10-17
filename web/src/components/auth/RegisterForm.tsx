"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-toastify";

import AuthPanel from "@/components/auth/AuthPanel";
import { ChipPicker, TagInput } from "@/components/auth/ChipMultiSelect";
import { PasswordField, PhoneField } from "@/components/auth/PhoneFields";
import RoleSwitch from "@/components/auth/RoleSwitch";
import Column from "@/components/common/Column";
import Field from "@/components/common/Field";
import Row from "@/components/common/Row";
import { HOME_FOR, useMounted, useSession, type Role } from "@/Hooks/useSession";
import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";
import { queryClient } from "@/queryClient";
import type { Choice, VacancyFacets } from "@/networking/types";

type Step = "account" | "profile";

/**
 * Create an account. Phone first, then the questions that decide what they see.
 *
 * "Creating an account asks a teacher for post, subject, qualification and city —
 * the four things that decide which vacancies they will ever see. A school is asked
 * for its name, type, board and contact person instead."
 *
 * The account step comes first for a structural reason: there has to be a user row
 * before there is anything to attach a profile to. Which is also why someone who
 * signs in but has no profile lands straight on the profile step — `?step=profile`.
 */
export default function RegisterForm({
  initialRole, initialStep, facets,
}: {
  initialRole: Role;
  initialStep: Step;
  facets: VacancyFacets | null;
}) {
  const router = useRouter();
  const session = useSession();
  const [role, setRole] = useState<Role>(initialRole);
  const [rawStep, setStep] = useState<Step>(initialStep);
  const mounted = useMounted();

  /**
   * Derived, not an effect.
   *
   * `?step=profile` is a link we send someone whose number is verified but who has
   * no profile yet. Reaching it with no session means a stale link or cleared
   * storage — there is nothing to attach a profile to, so the phone step is the
   * only place to start.
   *
   * It has to wait for `mounted`: `sessionSnapshot()` is null on the server AND
   * for a signed-out visitor, so acting on the first render would bounce a
   * legitimately signed-in teacher back to the phone step for one frame.
   */
  const step: Step = rawStep === "profile" && mounted && !session ? "account" : rawStep;
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function fail(error: unknown) {
    if (error instanceof ClientError && error.errors) {
      setErrors(error.errors);
      return;
    }
    toast.error(error instanceof Error ? error.message : "That didn't work. Try again.");
  }

  const createAccount = useMutation({
    mutationFn: () => ApiController.signUp(phone, password, role),
    onSuccess: (data) => {
      setErrors({});
      queryClient.clear();
      // A fresh account has no profile, so this is all but unreachable — it is
      // here because `needs_profile` is the server's answer and the client
      // guessing instead is how the two drift apart.
      if (!data.needs_profile) {
        router.replace(HOME_FOR[data.role]);
        return;
      }
      // There are two profile steps in this wizard — what a teacher teaches,
      // and what a school is. A parent's profile is four fields and lives on
      // their own workspace, so send them there rather than growing a third
      // step that duplicates it.
      if (data.role === "student") {
        router.replace("/student/profile");
        return;
      }
      setStep("profile");
    },
    onError: fail,
  });

  if (step === "profile") {
    return (
      <Row className="min-h-screen items-stretch bg-paper">
        <AuthPanel role={role} />
        <Column className="flex-1 items-center justify-center p-5 sm:p-10">
          <div className="w-full max-w-lg">
            {role === "school" ? (
              <SchoolProfileStep facets={facets} onFail={fail} errors={errors} />
            ) : (
              <TeacherProfileStep facets={facets} onFail={fail} errors={errors} />
            )}
          </div>
        </Column>
      </Row>
    );
  }

  return (
    <Row className="min-h-screen items-stretch bg-paper">
      <AuthPanel role={role} />
      <Column className="flex-1 items-center justify-center p-5 sm:p-10">
        <Column className="w-full max-w-sm gap-6">
          <Column className="gap-1.5">
            <Link href="/" className="w-fit text-sm font-semibold text-ink-3 hover:text-accent">
              ← Back to the website
            </Link>
            <h1 className="font-display text-2xl font-extrabold text-ink-1">Create an account</h1>
            <p className="text-sm text-ink-2">
              {role === "school"
                ? "Register your institution. We verify it before your vacancies go live."
                : "Takes about two minutes. Your mobile number is your login."}
            </p>
          </Column>

          <RoleSwitch
            value={role}
            onChange={(next) => { setRole(next); setStep("account"); setErrors({}); }}
          />

          <form
            className="card flex flex-col gap-4 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              createAccount.mutate();
            }}
          >
            <PhoneField
              value={phone}
              onChange={(value) => { setPhone(value); setErrors({}); }}
              error={errors.phone}
            />
            <PasswordField
              value={password}
              onChange={(value) => { setPassword(value); setErrors({}); }}
              error={errors.password}
              label="Choose a password"
              autoComplete="new-password"
              hint="At least 8 characters. You will need it every time you sign in."
            />
            <button
              type="submit"
              className="btn btn-accent"
              disabled={createAccount.isPending || phone.length !== 10 || password.length < 8}
            >
              {createAccount.isPending ? "Creating your account…" : "Create account"}
            </button>
          </form>

          <p className="border-t border-line pt-4 text-sm text-ink-3">
            Already registered?{" "}
            <Link href={`/login?as=${role}`} className="font-semibold text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </Column>
      </Column>
    </Row>
  );
}

/** The four things that decide which vacancies a teacher will ever see. */
function TeacherProfileStep({
  facets, onFail, errors,
}: {
  facets: VacancyFacets | null;
  onFail: (error: unknown) => void;
  errors: Record<string, string>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [post, setPost] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [city, setCity] = useState("");
  const [years, setYears] = useState("0");
  const [relocate, setRelocate] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      ApiController.createTeacherProfile({
        name,
        post,
        subjects,
        qualifications,
        city,
        experience_years: years,
        willing_to_relocate: relocate,
      }),
    onSuccess: () => {
      queryClient.clear();
      router.replace("/teacher?welcome=1");
    },
    onError: onFail,
  });

  const posts: Choice[] = facets?.taxonomy.posts ?? [];
  const quals: Choice[] = facets?.taxonomy.qualifications ?? [];

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => { event.preventDefault(); save.mutate(); }}
    >
      <Column className="gap-1.5">
        <h1 className="font-display text-2xl font-extrabold text-ink-1">A little about your teaching</h1>
        <p className="text-sm text-ink-2">
          Four questions. They decide which vacancies you see — you can change any of
          them later.
        </p>
      </Column>

      <Field label="Your full name" error={errors.name}>
        <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" className="field" />
      </Field>

      <Field label="The post you are looking for" error={errors.post}>
        <select value={post} onChange={(e) => setPost(e.target.value)} required className="field">
          <option value="">Choose a post</option>
          {posts.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </Field>

      <Field
        label="Subjects you teach"
        hint="Type one and press Enter. Up to six."
        error={errors.subjects}
        group
      >
        <TagInput value={subjects} onChange={setSubjects} placeholder="Physics, Mathematics…" />
      </Field>

      <Field label="What you hold" hint="Everything that applies." error={errors.qualifications} group>
        <ChipPicker options={quals} value={qualifications} onChange={setQualifications} />
      </Field>

      <Row className="flex-col gap-4 sm:flex-row">
        <Field label="Your city" error={errors.city} className="flex-1">
          <input value={city} onChange={(e) => setCity(e.target.value)} required className="field" />
        </Field>
        <Field label="Years of experience" error={errors.experience_years} className="sm:w-40">
          <input
            value={years}
            onChange={(e) => setYears(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            className="field"
          />
        </Field>
      </Row>

      <label className="flex items-start gap-2.5 text-sm text-ink-2">
        <input
          type="checkbox"
          checked={relocate}
          onChange={(e) => setRelocate(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
        />
        I would move for the right post — show me vacancies in other cities too
      </label>

      <button
        type="submit"
        className="btn btn-accent"
        disabled={save.isPending || !post || !name || !city}
      >
        {save.isPending ? "Saving…" : "Finish"}
      </button>
      <p className="text-xs text-ink-3">
        Your CV and certificates come next — you can apply as soon as the CV is up.
      </p>
    </form>
  );
}

/** A school is asked for its name, type, board and contact person instead. */
function SchoolProfileStep({
  facets, onFail, errors,
}: {
  facets: VacancyFacets | null;
  onFail: (error: unknown) => void;
  errors: Record<string, string>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("school");
  const [board, setBoard] = useState("");
  const [city, setCity] = useState("");
  const [person, setPerson] = useState("");
  const [designation, setDesignation] = useState("");
  const [officePhone, setOfficePhone] = useState("");

  const save = useMutation({
    mutationFn: () =>
      ApiController.createSchool({
        name,
        institution_type: type,
        board,
        city,
        contact_person: person,
        designation,
        office_phone: officePhone,
      }),
    onSuccess: () => {
      queryClient.clear();
      router.replace("/school?welcome=1");
    },
    onError: onFail,
  });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => { event.preventDefault(); save.mutate(); }}
    >
      <Column className="gap-1.5">
        <h1 className="font-display text-2xl font-extrabold text-ink-1">About your institution</h1>
        <p className="text-sm text-ink-2">
          We verify every institution before its vacancies go live — usually within a
          day. You can post in the meantime.
        </p>
      </Column>

      <Field label="Institution name" error={errors.name}>
        <input value={name} onChange={(e) => setName(e.target.value)} required className="field" />
      </Field>

      <Row className="flex-col gap-4 sm:flex-row">
        <Field label="Type" error={errors.institution_type} className="flex-1">
          <select value={type} onChange={(e) => setType(e.target.value)} className="field">
            {(facets?.taxonomy.institutions ?? []).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Board or affiliation" error={errors.board} className="flex-1">
          <select value={board} onChange={(e) => setBoard(e.target.value)} className="field">
            <option value="">Choose</option>
            {(facets?.taxonomy.boards ?? []).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
      </Row>

      <Field label="City" error={errors.city}>
        <input value={city} onChange={(e) => setCity(e.target.value)} required className="field" />
      </Field>

      <Row className="flex-col gap-4 sm:flex-row">
        <Field label="Contact person" error={errors.contact_person} className="flex-1">
          <input value={person} onChange={(e) => setPerson(e.target.value)} required className="field" />
        </Field>
        <Field label="Their designation" error={errors.designation} className="flex-1">
          <input
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            placeholder="Principal, Director…"
            className="field"
          />
        </Field>
      </Row>

      <Field
        label="Office phone"
        hint="The switchboard — printed on your vacancies. Not your own number."
        error={errors.office_phone}
      >
        <input
          value={officePhone}
          onChange={(e) => setOfficePhone(e.target.value)}
          inputMode="tel"
          className="field"
        />
      </Field>

      <button
        type="submit"
        className="btn btn-accent"
        disabled={save.isPending || !name || !city || !person}
      >
        {save.isPending ? "Saving…" : "Register our institution"}
      </button>
    </form>
  );
}
