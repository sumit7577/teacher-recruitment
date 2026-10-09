"use client";

import { Children, cloneElement, isValidElement, useId } from "react";

import Column from "@/components/common/Column";

/**
 * A labelled form field.
 *
 * It exists because the obvious version is broken in a way nothing visible tells
 * you about: `<label>Name</label><input/>` as siblings renders correctly and is
 * **not a label at all** — there is no `for`/`id` pair, so a screen reader
 * announces the input as unlabelled and clicking the text does not focus the
 * field. Every form in this app had that until a `getByLabel()` query in the
 * end-to-end test could not find a single input.
 *
 * So the id is generated here with `useId()` and cloned onto the child, which
 * means a caller cannot forget it. A child that already carries an `id` keeps it.
 *
 * `group` is for a set of inputs that is not one input — the qualification chips,
 * the subject tags. There is no element for `for` to point at, so the correct
 * markup is a fieldset with a legend, and an `aria-label` on a `<div>` would be
 * pretending.
 */
export default function Field({
  label, hint, error, group, className, children,
}: {
  label: string;
  hint?: string;
  error?: string;
  group?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  /**
   * A `<label for>` is only a label when it points at a form control. When the
   * child is a wrapper — a Row holding a colour swatch and a text box, say — the
   * id lands on a `<div>` and the label points at nothing, which is the exact bug
   * this component was written to prevent, reintroduced one level up.
   *
   * So the control is detected rather than assumed, and anything else falls back
   * to fieldset/legend. That makes a dangling `for` unreachable instead of
   * something to remember.
   */
  const single = Children.count(children) === 1 ? Children.toArray(children)[0] : null;
  const isControl =
    isValidElement(single) && typeof single.type === "string"
      ? ["input", "select", "textarea"].includes(single.type)
      : false;
  const asGroup = group || !isControl;

  const body = asGroup
    ? children
    : Children.map(children, (child) => {
        if (!isValidElement(child)) return child;
        const props = child.props as Record<string, unknown>;
        return cloneElement(child, {
          id: (props.id as string) ?? id,
          "aria-describedby": (props["aria-describedby"] as string) ?? describedBy,
          "aria-invalid": error ? true : undefined,
        } as Record<string, unknown>);
      });

  if (asGroup) {
    return (
      <fieldset className={className}>
        <legend className="label">{label}</legend>
        {hint ? <p id={hintId} className="-mt-1 pb-1.5 text-xs text-ink-3">{hint}</p> : null}
        {body}
        {error ? <p id={errorId} className="pt-1 text-xs font-medium text-bad">{error}</p> : null}
      </fieldset>
    );
  }

  return (
    <Column className={className}>
      <label htmlFor={id} className="label">{label}</label>
      {hint ? <span id={hintId} className="-mt-1 pb-1.5 text-xs text-ink-3">{hint}</span> : null}
      {body}
      {error ? <span id={errorId} className="pt-1 text-xs font-medium text-bad">{error}</span> : null}
    </Column>
  );
}
