"use client";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";

/**
 * The phone + code pair, shared by sign-in and sign-up.
 *
 * `inputMode="numeric"` and `autoComplete="one-time-code"` are not decoration:
 * together they give an Android user the OTP autofill prompt from the SMS, which is
 * the difference between two taps and switching apps to read a message.
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

export function OtpField({
  value, onChange, error, onResend, resendIn,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  onResend?: () => void;
  resendIn?: number;
}) {
  return (
    <Column className="gap-0">
      <label htmlFor="otp" className="label">The 6-digit code we sent you</label>
      <input
        id="otp"
        name="otp"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
        required
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="______"
        className="field text-center font-display text-lg tracking-[0.5em]"
      />
      {error ? <span className="pt-1 text-xs font-medium text-bad">{error}</span> : null}
      {onResend ? (
        <Row className="justify-between pt-2">
          <button
            type="button"
            onClick={onResend}
            disabled={Boolean(resendIn)}
            className="text-xs font-semibold text-accent disabled:text-ink-3"
          >
            {resendIn ? `Send again in ${resendIn}s` : "Send the code again"}
          </button>
        </Row>
      ) : null}
    </Column>
  );
}
