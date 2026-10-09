"use client";

import { useState } from "react";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";

/**
 * The phone + password pair, shared by sign-in and sign-up.
 *
 * `autoComplete` is not decoration here. `tel-national` lets a phone fill the
 * number from the keyboard's own suggestion, and the right `current-password` /
 * `new-password` value is what makes a password manager offer to save it rather
 * than silently do nothing.
 */
export function PhoneField({
  value, onChange, disabled, error,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <Column className="gap-0">
      <label htmlFor="phone" className="label">Mobile number</label>
      <Row className="items-stretch gap-2">
        <span className="grid shrink-0 place-items-center rounded-[10px] border border-line bg-surface-2 px-3 text-sm font-semibold text-ink-2">
          +91
        </span>
        <input
          id="phone"
          name="phone"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 10))}
          disabled={disabled}
          required
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="10-digit mobile"
          className="field"
        />
      </Row>
      {error ? <span className="pt-1 text-xs font-medium text-bad">{error}</span> : null}
    </Column>
  );
}

export function PasswordField({
  value, onChange, error, label = "Password", autoComplete = "current-password", hint,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  label?: string;
  autoComplete?: "current-password" | "new-password";
  hint?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <Column className="gap-0">
      <label htmlFor="password" className="label">{label}</label>
      <Row className="items-stretch gap-2">
        <input
          id="password"
          name="password"
          type={shown ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          autoComplete={autoComplete}
          // A new password has a minimum the server also enforces; stating it
          // here means the browser says so before the round trip does.
          minLength={autoComplete === "new-password" ? 8 : undefined}
          placeholder={autoComplete === "new-password" ? "At least 8 characters" : "Your password"}
          className="field"
        />
        {/* Typing a password you cannot see, on a phone, is where most failed
            sign-ins actually come from. */}
        <button
          type="button"
          onClick={() => setShown((on) => !on)}
          aria-pressed={shown}
          className="shrink-0 rounded-[10px] border border-line bg-surface-2 px-3 text-xs font-semibold text-ink-2 hover:text-ink-1"
        >
          {shown ? "Hide" : "Show"}
        </button>
      </Row>
      {error ? <span className="pt-1 text-xs font-medium text-bad">{error}</span> : null}
      {hint && !error ? <span className="pt-1 text-xs text-ink-3">{hint}</span> : null}
    </Column>
  );
}
