import { QueryClient } from "@tanstack/react-query";

/**
 * The app's single QueryClient.
 *
 * In its own module rather than inside a provider component so the auth helpers
 * can clear it on a role change without importing a component — which would be a
 * circular import. Same reason as
 * allcoaching-educator/src/queryClient.ts.
 *
 * A module-level singleton is right for this app because every signed-in surface
 * is client-rendered. The public pages are server components and do not touch it,
 * so there is no request-scoped state here that could leak between visitors.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The panel is a working tool, not a dashboard on a wall: refetching the
      // moment a window regains focus is what makes "I just verified that" show
      // as verified when staff tab back.
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Never retry a 4xx. The answer will not change, and retrying a 409
        // "already applied" three times is three chances to confuse the user.
        const status = (error as { status?: number })?.status ?? 0;
        if (status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});
