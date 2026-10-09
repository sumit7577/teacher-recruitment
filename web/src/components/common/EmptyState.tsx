import Column from "./Column";

/**
 * What a list shows when it has nothing.
 *
 * `hint` is required, not optional: "No applications" tells someone nothing,
 * and an empty screen with no next step is the single most common reason a tool
 * gets abandoned in week two.
 */
export default function EmptyState({
  title, hint, children,
}: {
  title: string;
  hint: string;
  children?: React.ReactNode;
}) {
  return (
    <Column className="card items-center gap-2 px-6 py-12 text-center">
      <p className="font-display text-lg font-bold text-ink-1">{title}</p>
      <p className="max-w-sm text-sm text-ink-2">{hint}</p>
      {children ? <div className="pt-3">{children}</div> : null}
    </Column>
  );
}
