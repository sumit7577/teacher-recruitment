"use client";

import Row from "@/components/common/Row";
import { cn } from "@/lib/cn";
import type { Role } from "@/Hooks/useSession";

/**
 * "One door, two sides of the same hire."
 *
 * Two visible options, not three. Staff is a real audience but it is three people
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
        ["teacher", "I am a teacher"],
        ["school", "I am hiring"],
      ] as [Role, string][]).map(([role, label]) => (
        <button
          key={role}
          type="button"
          role="tab"
          aria-selected={value === role}
          onClick={() => onChange(role)}
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
            value === role ? "bg-surface text-ink-1 shadow-[var(--shadow-card)]" : "text-ink-3 hover:text-ink-2",
          )}
        >
          {label}
        </button>
      ))}
    </Row>
  );
}
