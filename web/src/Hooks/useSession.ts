"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import ApiController from "@/networking";
import {
  serverSessionSnapshot,
  sessionSnapshot,
  subscribeSession,
  type Session,
} from "@/networking/interceptor";
import { queryClient } from "@/queryClient";

/**
 * The signed-in session, and the guard every workspace layout uses.
 *
 * Mirrors allcoaching-educator/src/Hooks/useModal.ts in intent: one place that
 * owns "who is signed in", so no screen reads localStorage itself.
 */

export type Role = "teacher" | "school" | "student" | "staff";

/** Where each audience's workspace lives. */
export const HOME_FOR: Record<Role, string> = {
  teacher: "/teacher",
  school: "/school",
  student: "/student",
  staff: "/panel",
};

export function useSession(): Session | null {
  return useSyncExternalStore(subscribeSession, sessionSnapshot, serverSessionSnapshot);
}

/**
 * Sign out, and leave nothing behind.
 *
 * Clearing the QueryClient is not optional: it is a module-level singleton that
 * survives navigation, so without this the next person to sign in on the same
 * browser sees the previous one's cached dashboard for a few hundred milliseconds
 * before the refetch lands.
 */
export function useSignOut() {
  const router = useRouter();
  return useCallback(
    async (everywhere = false) => {
      await ApiController.signOut(everywhere);
      queryClient.clear();
      router.replace("/login");
    },
    [router],
  );
}

type GuardState = "checking" | "allowed" | "redirecting";

/**
 * Hold a workspace closed until the session is known to match.
 *
 * Three outcomes, and the three-state return is the point: rendering the screen
 * while the answer is unknown shows a flash of someone else's workspace, and
 * rendering nothing at all looks like a broken page.
 *
 * This is a CONVENIENCE, not the security boundary. The token lives in
 * localStorage, so there is no cookie for middleware to read and no server-side
 * check to make — every one of these endpoints is enforced by the Django
 * permission class, which re-checks the token's audience on every request. A
 * user who edits localStorage gets a workspace shell full of 403s.
 */
export function useRequireRole(role: Role): GuardState {
  const session = useSession();
  const router = useRouter();

  // `sessionSnapshot()` returns null on the server AND for a signed-out visitor,
  // so the two cannot be told apart on the first render. `mounted` is what
  // separates them: before mount, null means "not known yet".
  const mounted = useMounted();

  const ok = Boolean(session && session.role === role);

  useEffect(() => {
    if (!mounted || ok) return;
    const next = typeof window !== "undefined" ? window.location.pathname : "";
    if (!session) {
      router.replace(`/login?as=${role}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
      return;
    }
    // Signed in, wrong workspace — send them to their own rather than to the
    // sign-in page. Someone who followed a stale link should land somewhere they
    // can actually do something.
    router.replace(HOME_FOR[session.role as Role] ?? "/");
  }, [mounted, ok, session, role, router]);

  if (!mounted) return "checking";
  return ok ? "allowed" : "redirecting";
}

/**
 * True once the component has mounted in the browser.
 *
 * Exported because several screens need to tell "signed out" from "not known
 * yet": `sessionSnapshot()` is null for both, and acting on the first render's
 * null shows a signed-in person the signed-out screen for a frame.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

// No external store to subscribe to — the snapshot never changes after mount, so
// this returns a no-op unsubscribe. A module-level constant because a new function
// every render would make useSyncExternalStore resubscribe each time.
const emptySubscribe = () => () => {};
