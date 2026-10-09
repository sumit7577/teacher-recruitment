"use client";

import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "react-toastify";

import Column from "@/components/common/Column";
import Field from "@/components/common/Field";
import Row from "@/components/common/Row";
import QueryState from "@/components/workspace/QueryState";
import VerificationBanner from "@/components/workspace/VerificationBanner";
import ApiController from "@/networking";
import { ClientError } from "@/networking/error-type";
import { queryClient } from "@/queryClient";
import type { SchoolResp, VacancyFacets } from "@/networking/types";

export default function SchoolProfilePage() {
  const school = useQuery({ queryKey: ["school", "profile"], queryFn: ApiController.getSchool });
  const facets = useQuery({
    queryKey: ["public", "facets"],
    queryFn: ApiController.getVacancyFacets,
    staleTime: 10 * 60 * 1000,
  });

  return (
    <QueryState isLoading={school.isLoading} error={school.error} loadingLabel="Loading your profile">
      {school.data ? (
        <>
          <VerificationBanner school={school.data} />
          <Certificate school={school.data} />
          <Details school={school.data} facets={facets.data ?? null} />
        </>
      ) : null}
    </QueryState>
  );
}

/**
 * The affiliation certificate.
 *
 * Its own card, above the details form, because it is the one thing that decides
 * whether this institution's vacancies ever go live — and the banner above points
 * at it by name.
 */
function Certificate({ school }: { school: SchoolResp }) {
  const fileInput = useRef<HTMLInputElement | null>(null);

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.set("affiliation_certificate", file);
      return ApiController.updateSchool(form);
    },
    onSuccess: () => {
      toast.success("Uploaded. Our office will confirm it, usually within a day.");
      queryClient.invalidateQueries({ queryKey: ["school"] });
    },
    onError: (error: unknown) => {
      if (error instanceof ClientError && error.errors) {
        toast.error(Object.values(error.errors)[0] ?? error.message);
        return;
      }
      toast.error(error instanceof Error ? error.message : "That did not upload.");
    },
  });

  return (
    <Column className="card gap-3 p-4 sm:p-5">
      <Column className="gap-1">
        <h2 className="font-display text-base font-bold text-ink-1">Affiliation certificate</h2>
        <p className="text-sm text-ink-2">
          We check this before your vacancies go on the board. It is also what teachers
          are told we have checked, which is why we ask for it rather than taking your
          word.
        </p>
      </Column>

      <Row className="flex-wrap items-center gap-3">
        {school.affiliation_certificate ? (
          <>
            <span className="chip chip-ok">Uploaded</span>
            <a
              href={school.affiliation_certificate}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-accent hover:underline"
            >
              View it
            </a>
          </>
        ) : (
          <span className="chip chip-warn">Not uploaded</span>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload.mutate(file);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={upload.isPending}
          className="btn btn-outline ml-auto"
        >
          <ArrowUpTrayIcon aria-hidden className="h-4 w-4" />
          {upload.isPending ? "Uploading…" : school.affiliation_certificate ? "Replace it" : "Upload it"}
        </button>
      </Row>
    </Column>
  );
}

function Details({ school, facets }: { school: SchoolResp; facets: VacancyFacets | null }) {
  const [form, setForm] = useState({
    name: school.name,
    institution_type: school.institution_type,
    board: school.board,
    city: school.city,
    state: school.state,
    locality: school.locality,
    address: school.address,
    pincode: school.pincode,
    contact_person: school.contact_person,
    designation: school.designation,
    office_phone: school.office_phone,
    office_email: school.office_email,
    website: school.website,
    about: school.about,
    established_year: school.established_year ?? "",
    student_count: school.student_count ?? "",
    staff_count: school.staff_count ?? "",
  });

  const save = useMutation({
    mutationFn: () =>
      ApiController.updateSchool({
        ...form,
        // Django rejects "" for an integer; null is how "not recorded" is stored.
        established_year: form.established_year === "" ? null : form.established_year,
        student_count: form.student_count === "" ? null : form.student_count,
        staff_count: form.staff_count === "" ? null : form.staff_count,
      }),
    onSuccess: () => {
      toast.success("Saved.");
      queryClient.invalidateQueries({ queryKey: ["school"] });
    },
    onError: (error: unknown) => {
      if (error instanceof ClientError && error.errors) {
        toast.error(Object.values(error.errors)[0] ?? error.message);
        return;
      }
      toast.error(error instanceof Error ? error.message : "That did not save.");
    },
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm({ ...form, [key]: value });

  return (
    <Column className="card gap-4 p-4 sm:p-5">
      <h2 className="font-display text-base font-bold text-ink-1">Your institution</h2>

      <Field label="Name">
        <input value={form.name} onChange={(e) => set("name", e.target.value)} className="field" />
      </Field>

      <Row className="flex-col gap-4 sm:flex-row">
        <Field label="Type" className="flex-1">
          <select
            value={form.institution_type}
            onChange={(e) => set("institution_type", e.target.value)}
            className="field"
          >
            {(facets?.taxonomy.institutions ?? []).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Board or affiliation" className="flex-1">
          <select value={form.board} onChange={(e) => set("board", e.target.value)} className="field">
            <option value="">Not specified</option>
            {(facets?.taxonomy.boards ?? []).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
      </Row>

      <Row className="flex-col gap-4 sm:flex-row">
        <Field label="City" className="flex-1">
          <input value={form.city} onChange={(e) => set("city", e.target.value)} className="field" />
        </Field>
        <Field label="State" className="flex-1">
          <input value={form.state} onChange={(e) => set("state", e.target.value)} className="field" />
        </Field>
        <Field label="Pincode" className="sm:w-32">
          <input value={form.pincode} onChange={(e) => set("pincode", e.target.value)} className="field" />
        </Field>
      </Row>

      <Field label="Address">
        <textarea
          value={form.address}
          onChange={(e) => set("address", e.target.value)}
          rows={2}
          className="field resize-y"
        />
      </Field>

      <Row className="flex-col gap-4 sm:flex-row">
        <Field label="Contact person" className="flex-1">
          <input
            value={form.contact_person}
            onChange={(e) => set("contact_person", e.target.value)}
            className="field"
          />
        </Field>
        <Field label="Their designation" className="flex-1">
          <input
            value={form.designation}
            onChange={(e) => set("designation", e.target.value)}
            className="field"
          />
        </Field>
      </Row>

      <Row className="flex-col gap-4 sm:flex-row">
        <Field label="Office phone" hint="Printed on your vacancies." className="flex-1">
          <input
            value={form.office_phone}
            onChange={(e) => set("office_phone", e.target.value)}
            inputMode="tel"
            className="field"
          />
        </Field>
        <Field label="Office email" className="flex-1">
          <input
            value={form.office_email}
            onChange={(e) => set("office_email", e.target.value)}
            type="email"
            className="field"
          />
        </Field>
      </Row>

      <Field label="Website (optional)">
        <input value={form.website} onChange={(e) => set("website", e.target.value)} className="field" />
      </Field>

      <Row className="flex-col gap-4 sm:flex-row">
        <Field label="Established" className="flex-1">
          <input
            value={String(form.established_year)}
            onChange={(e) => set("established_year", e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            className="field"
          />
        </Field>
        <Field label="Students" className="flex-1">
          <input
            value={String(form.student_count)}
            onChange={(e) => set("student_count", e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            className="field"
          />
        </Field>
        <Field label="Teaching staff" className="flex-1">
          <input
            value={String(form.staff_count)}
            onChange={(e) => set("staff_count", e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            className="field"
          />
        </Field>
      </Row>

      <Field label="About the institution" hint="Teachers read this on your vacancies.">
        <textarea
          value={form.about}
          onChange={(e) => set("about", e.target.value)}
          rows={4}
          className="field resize-y"
        />
      </Field>

      <Row className="justify-end">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="btn btn-accent"
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </Row>
    </Column>
  );
}
