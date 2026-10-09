"use client";

import { useState } from "react";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import { cn } from "@/lib/cn";
import type { Choice } from "@/networking/types";

/** A fixed list, picked as chips. For qualifications, where the set is closed and
 *  short enough that a multi-select dropdown would be worse than showing them. */
export function ChipPicker({
  options, value, onChange, max,
}: {
  options: Choice[];
  value: string[];
  onChange: (value: string[]) => void;
  max?: number;
}) {
  return (
    <Row className="flex-wrap gap-2">
      {options.map((option) => {
        const on = value.includes(option.value);
        const full = Boolean(max && value.length >= max && !on);
        return (
          <button
            key={option.value}
            type="button"
            disabled={full}
            onClick={() => onChange(on ? value.filter((v) => v !== option.value) : [...value, option.value])}
            className={cn(
              "chip transition-colors",
              on ? "chip-accent" : "hover:border-accent hover:text-accent",
              full && "cursor-not-allowed opacity-40",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </Row>
  );
}

/**
 * Free text, collected as tags. For subjects, where the list cannot be closed —
 * a school writes "Physics", "Physical Science" and "Science (Physics)" for the
 * same post, and a fixed list means staff either mangle the vacancy or wait for a
 * new row.
 */
export function TagInput({
  value, onChange, placeholder, max = 6,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const cleaned = draft.trim();
    if (!cleaned) return;
    // Case-insensitive, so "physics" does not become a second subject beside
    // "Physics" and halve the teacher's matches.
    if (!value.some((item) => item.toLowerCase() === cleaned.toLowerCase()) && value.length < max) {
      onChange([...value, cleaned]);
    }
    setDraft("");
  }

  return (
    <Column className="gap-2">
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // Enter must not submit the form — it is adding a tag here, and a
          // half-filled signup being posted because someone typed one subject and
          // pressed Enter is the bug this prevents.
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={value.length >= max ? `${max} is the maximum` : placeholder}
        disabled={value.length >= max}
        className="field"
      />
      {value.length ? (
        <Row className="flex-wrap gap-2">
          {value.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onChange(value.filter((v) => v !== item))}
              className="chip chip-accent"
            >
              {item} ×
            </button>
          ))}
        </Row>
      ) : null}
    </Column>
  );
}
