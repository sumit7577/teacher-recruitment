import EmptyState from "@/components/common/EmptyState";
import PageLoader from "@/components/common/PageLoader";
import { messageOf } from "@/networking/error-type";

/**
 * The three things a query can be, so no screen writes the triple by hand.
 *
 * The error branch prints the backend's own message. Our messages are written to be
 * read by the person who hit them ("Add your CV first — schools will not see an
 * application without one"), and replacing them with a generic "Something went
 * wrong" throws that away.
 */
export default function QueryState({
  isLoading, error, isEmpty, emptyTitle, emptyHint, loadingLabel, children, action,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  loadingLabel?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  if (isLoading) return <PageLoader label={loadingLabel} />;
  if (error) {
    return (
      <EmptyState
        title="That did not load"
        hint={messageOf(error, "Check your connection and try again.")}
      />
    );
  }
  if (isEmpty) {
    return (
      <EmptyState title={emptyTitle ?? "Nothing here yet"} hint={emptyHint ?? "This will fill up as things happen."}>
        {action}
      </EmptyState>
    );
  }
  return <>{children}</>;
}
