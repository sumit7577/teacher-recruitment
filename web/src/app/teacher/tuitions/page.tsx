"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import HeartButton from "@/components/connect/HeartButton";
import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import QueryState from "@/components/workspace/QueryState";
import ApiController from "@/networking";

/** Home-tuition requirements a teacher could take.
 *
 *  Everything shown here is deliberately coarse: a first name, a class and a
 *  district. The family's address, the student's date of birth and their
 *  coordinates are not in this payload at all, and an unconsented minor is not
 *  in it either — both decided server-side.
 */
export default function TuitionsPage() {
  const [klass, setKlass] = useState("");
  const [km, setKm] = useState("25");

  const list = useQuery({
    queryKey: ["teacher", "tuitions", { klass, km }],
    queryFn: () => ApiController.getOpenTuitions({
      ...(klass ? { klass } : {}), km: Number(km),
    }),
  });

  const rows = list.data?.results ?? [];

  return (
    <>
      <Row className="flex-wrap items-end gap-3">
        <Column className="gap-0">
          <label htmlFor="klass" className="label">Class</label>
          <select id="klass" value={klass} onChange={(e) => setKlass(e.target.value)} className="field w-auto">
            <option value="">Any</option>
            {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((c) => (
              <option key={c} value={c}>Class {c}</option>
            ))}
          </select>
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
        isLoading={list.isLoading}
        error={list.error}
        isEmpty={rows.length === 0}
        emptyTitle="Nothing nearby"
        emptyHint="No families are looking for a tutor in that area right now. Make sure 'home tuition' is ticked on your profile."
      >
        <Column className="gap-2.5">
          {rows.map((row) => (
            <Column key={row.id} className="card gap-2 p-4">
              <Row className="flex-wrap items-start justify-between gap-3">
                <Column className="min-w-0 flex-1 gap-0.5">
                  <span className="font-display text-sm font-bold text-ink-1">
                    {row.klass_label} · {row.subjects.join(", ")}
                  </span>
                  <span className="text-xs text-ink-3">
                    {row.student.first_name} · {row.student.area || row.city}
                    {row.distance_km !== null ? ` · ${row.distance_km} km away` : ""}
                  </span>
                  <span className="text-xs text-ink-2">
                    {row.mode_label}
                    {row.days_per_week ? ` · ${row.days_per_week} days a week` : ""}
                    {row.preferred_time ? ` · ${row.preferred_time}` : ""}
                  </span>
                  <span className="pt-0.5 text-sm font-semibold text-ink-1">{row.budget_label}</span>
                </Column>
                <HeartButton
                  toUser={row.student.user_id}
                  context="tuition"
                  contextId={row.id}
                  label="I can teach this"
                />
              </Row>
              {row.description ? <p className="text-sm text-ink-2">{row.description}</p> : null}
            </Column>
          ))}
        </Column>
      </QueryState>
    </>
  );
}
