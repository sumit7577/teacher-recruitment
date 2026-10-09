import Column from "./Column";

/** The placeholder under a Suspense boundary. Deliberately quiet — a spinner that
 *  fills the screen reads as an error on a slow connection. */
export default function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <Column className="min-h-[40vh] items-center justify-center gap-3">
      <span
        aria-hidden
        className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"
      />
      <span className="text-sm text-ink-3">{label}…</span>
    </Column>
  );
}
