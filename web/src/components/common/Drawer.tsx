"use client";

import { XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef } from "react";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";

/**
 * The side panel the workspaces open over a list.
 *
 * It exists because three screens had hand-rolled their own and all three were a
 * `<div>` with an overlay — which looks right and behaves wrong:
 *
 * * **No dialog semantics.** A screen reader announced it as more of the page, and
 *   Tab walked straight out of it into the list behind the overlay, where every
 *   control is visually hidden but still focusable.
 * * **No Escape.** The only way out was finding the close button.
 * * **Nothing to scope to.** A query for "the Verified button" matched the filter
 *   tab behind the overlay rather than the one in the panel — which is how this was
 *   found.
 *
 * `role="dialog"` + `aria-modal` + a label fixes the first, the key handler the
 * second, and both give tests something real to scope to.
 *
 * Focus is moved in on open and returned to whatever had it on close, because a
 * keyboard user who closes a panel and lands back at the top of the document has
 * lost their place in a list of fifty.
 */
export default function Drawer({
  title, subtitle, onClose, children, footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement | null>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    returnTo.current = document.activeElement;
    panel.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);

    // The page behind must not scroll while a modal is open — on a phone the panel
    // is full height and the list scrolling underneath it is disorienting.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40"
      />
      <Column
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto border-l border-line bg-surface shadow-[var(--shadow-pop)] outline-none"
      >
        <Row className="sticky top-0 items-start justify-between gap-3 border-b border-line bg-surface/95 p-5 backdrop-blur sm:px-6">
          <Column className="min-w-0 gap-0.5">
            <h2 className="font-display text-lg font-extrabold text-ink-1">{title}</h2>
            {subtitle}
          </Column>
          <button type="button" onClick={onClose} aria-label="Close" className="btn btn-ghost p-2">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </Row>

        <Column className="gap-5 p-5 sm:p-6">{children}</Column>

        {footer ? (
          <Column className="sticky bottom-0 gap-3 border-t border-line bg-surface/95 p-5 backdrop-blur sm:px-6">
            {footer}
          </Column>
        ) : null}
      </Column>
    </>
  );
}
