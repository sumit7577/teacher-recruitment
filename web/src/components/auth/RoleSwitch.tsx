"use client";

import Row from "@/components/common/Row";
import { cn } from "@/lib/cn";
import type { Role } from "@/Hooks/useSession";

/**
 * "One door, two sides of the same hire."
 *
 * Three visible options, not four. Staff is a real audience but it is three people
 * in an office, and putting an "Office" tab beside Teacher and Institution tells
 * every visitor that an admin panel exists and roughly where. The office reaches
 * their sign-in by URL (`/login?as=staff`), which they are given once.
 */
export default function RoleSwitch({
  value, onChange,
}: {
  value: Role;
  onChange: (role: Role) => void;
}) {
  if (value === "staff") return null;

  return (
    <Row className="rounded-xl bg-surface-2 p-1" role="tablist">
      {([
        ["teacher", "I teach"],
        ["school", "I am hiring"],
        ["student", "I need a tutor"],
      ] as [Role, string][]).map(([role, label]) => (
        <button
          key={role}
          type="button"
          role="tab"
          aria-selected={value === role}
          onClick={() => onChange(role)}
          className={cn(
            // `text-xs` at the small end: three labels in a 320px-wide card
            // wrap to two lines each at `text-sm` and the switch doubles in
            // height.
            "flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-colors sm:px-3 sm:text-sm",
            value === role ? "bg-surface text-ink-1 shadow-[var(--shadow-card)]" : "text-ink-3 hover:text-ink-2",
          )}
        >
          {label}
        </button>
      ))}
    </Row>
  );
}
