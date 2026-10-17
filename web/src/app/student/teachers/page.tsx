"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import HeartButton from "@/components/connect/HeartButton";
import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import QueryState from "@/components/workspace/QueryState";
import ApiController from "@/networking";

/** Teachers who take home tuition, nearest first.
 *
 *  The list carries no phone and no email — that is the product, not an
 *  oversight. Contact happens after an interest is accepted, through the
 *  conversation, which is also the only record of it.
 */
export default function FindTutorPage() {
  const [subject, setSubject] = useState("");
  const [km, setKm] = useState("25");

  const teachers = useQuery({
    queryKey: ["student", "teachers", { subject, km }],
    queryFn: () => ApiController.getNearbyTeachers({
      ...(subject ? { subject } : {}), km: Number(km),
    }),
  });

  const rows = teachers.data?.results ?? [];

  return (
    <>
      <Row className="flex-wrap items-end gap-3">
        <Column className="min-w-0 flex-1 gap-0">
          <label htmlFor="subject" className="label">Subject</label>
          <input
            id="subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Maths"
            className="field"
          />
        </Column>
        <Column className="gap-0">
          <label htmlFor="km" className="label">Within</label>
          <select id="km" value={km} onChange={(e) => setKm(e.target.value)} className="field w-auto">
            <option value="5">5 km</option>
            <option value="10">10 km</option>
            <option value="25">25 km</option>
            <option value="50">50 km</option>
          </select>
        </Column>
      </Row>

      <QueryState
        isLoading={teachers.isLoading}
        error={teachers.error}
        isEmpty={rows.length === 0}
        emptyTitle="No tutors yet"
        emptyHint="Nobody matching that is listed near you. Try a wider distance, or post what you need and let teachers come to you."
      >
        <Column className="gap-2.5">
          {rows.map((teacher) => (
            <Column key={teacher.id} className="card gap-2 p-4">
              <Row className="flex-wrap items-start justify-between gap-3">
                <Column className="min-w-0 flex-1 gap-0.5">
                  <span className="font-display text-sm font-bold text-ink-1">{teacher.name}</span>
                  <span className="text-xs text-ink-3">
                    {teacher.designation_label || teacher.post_label}
                    {teacher.city ? ` · ${teacher.city}` : ""}
                    {teacher.experience_label ? ` · ${teacher.experience_label}` : ""}
                  </span>
                  {teacher.subjects?.length ? (
                    <Row className="flex-wrap gap-1 pt-1">
                      {teacher.subjects.map((s: string) => (
                        <span key={s} className="chip">{s}</span>
                      ))}
                    </Row>
                  ) : null}
                </Column>
                <Column className="shrink-0 items-end gap-1.5">
                  {teacher.verification === "verified" ? (
                    <span className="chip chip-ok">Verified</span>
                  ) : null}
                  <HeartButton toUser={teacher.user_id} label="I'm interested" />
                </Column>
              </Row>
              {teacher.headline ? (
                <p className="text-sm text-ink-2">{teacher.headline}</p>
              ) : null}
            </Column>
          ))}
        </Column>
      </QueryState>
    </>
  );
}
