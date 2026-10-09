import Axios, { type InternalAxiosRequestConfig } from "axios";

import {
  AuthenticationError,
  ClientError,
  NetworkError,
  ServerError,
  extractErrorMessage,
} from "./error-type";

/**
 * The browser's axios client. Mirrors
 * allcoaching-educator/src/networking/interceptor.ts.
 *
 * Browser only — it reads the session from localStorage. Server components fetch
 * through `./server.ts` instead, which takes no token and is cached by Next.
 * Importing this module in a server component would not crash, but every request
 * would go out unauthenticated, which is the kind of bug that looks like a
 * permissions problem.
 */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000").replace(/\/$/, "");

/** One signed-in session per browser, under one key.
 *
 * A person who is both a teacher and a school's contact can only be in one
 * workspace at a time, which is also how the sign-in switch presents it. Keyed
 * per role instead, a stale teacher token in another tab would keep answering
 * after they signed into the panel — harder to reason about than simply
 * replacing it. */
const SESSION_KEY = "session";

export interface Session {
  key: string;
  role: "teacher" | "school" | "staff";
  /** A cached copy of the signed-in user, so the header can draw a name before
   *  `getMe` resolves. `email` is nullable because most teachers have none —
   *  matching `UserResp` rather than narrowing it, or assigning a response to
   *  this would not typecheck. */
  user?: { id: string; name: string; phone: string; email?: string | null; image?: string };
  needs_profile?: boolean;
}

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    // A corrupt value must not take the app down on boot — clear and carry on
    // as a signed-out visitor.
    try { window.localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    return null;
  }
}

export function writeSession(session: Session | null): void {
  if (typeof window === "undefined") return;
  try {
    if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch { /* private browsing — the session lasts the tab, which is survivable */ }
  // Same-tab listeners. The `storage` event only fires in OTHER tabs, so without
  // this the header does not notice its own sign-in.
  try { window.dispatchEvent(new Event("session")); } catch { /* ignore */ }
}

/**
 * Subscribe to session changes, for `useSyncExternalStore`.
 *
 * `session` is our own event, dispatched by `writeSession` — the browser's
 * `storage` event only fires in OTHER tabs, so without it the header would miss
 * its own sign-in. Both are listened to, so two open tabs never disagree about
 * who is signed in.
 */
export function subscribeSession(onChange: () => void): () => void {
  window.addEventListener("session", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("session", onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * A stable snapshot for `useSyncExternalStore`.
 *
 * It caches by the raw JSON string, which it has to: `readSession` parses a new
 * object every call, and a snapshot that is never reference-equal makes the hook
 * re-render without end.
 */
let snapshotRaw: string | null = null;
let snapshot: Session | null = null;

export function sessionSnapshot(): Session | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(SESSION_KEY); } catch { raw = null; }
  if (raw !== snapshotRaw) {
    snapshotRaw = raw;
    snapshot = readSession();
  }
  return snapshot;
}

/** The server knows nobody. Every signed-in surface renders its own shell on the
 *  client, so this never shows a visitor the wrong name. */
export function serverSessionSnapshot(): Session | null {
  return null;
}

const client = Axios.create({ headers: { "Content-Type": "application/json" } });

client.interceptors.request.use((request: InternalAxiosRequestConfig) => {
  const session = readSession();
  if (session?.key) request.headers.Authorization = `Token ${session.key}`;
  // Let axios set the multipart boundary itself. Declaring JSON here and then
  // sending FormData produces a body Django cannot parse, and the error it
  // returns ("no file was submitted") points at the wrong thing entirely.
  if (request.data instanceof FormData) delete request.headers["Content-Type"];
  return request;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.message === "Network Error" || !error.response) {
      return Promise.reject(new NetworkError("Please check your connection and try again."));
    }
    const status = error.response.status;
    const data = error.response.data;

    if (status === 401) {
      /**
       * A 401 from a SIGN-IN endpoint is the answer to the question, not a dead
       * session. `POST v1/auth/password` returns 401 for a wrong password by
       * design — one generic message, so it cannot be used to ask which numbers
       * hold accounts. Treating that as an expiry is a bug allcoaching shipped:
       * it cleared storage and reloaded, so a user who mistyped their password
       * was thrown back to the start without ever seeing the error.
       *
       * Two tests, because each catches what the other misses. The URL test
       * covers a signed-in person trying a password; the token test covers any
       * future unauthenticated endpoint without anyone having to remember to add
       * it to a list.
       */
      const url = String(error.config?.url ?? "");
      const isSignIn = /\/v1\/auth\/(otp|password|google)/.test(url);
      const hadSession = Boolean(error.config?.headers?.Authorization);
      if (isSignIn || !hadSession) {
        return Promise.reject(
          new ClientError(extractErrorMessage(data, "That didn't work — please check and try again."), status, data),
        );
      }
      writeSession(null);
      // A hard navigation, not router.push — there is no router inside an axios
      // interceptor, and a full load is what we want anyway: it discards every
      // React Query cache, so no stale panel data survives an expired session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (typeof window !== "undefined") window.location.href = "/login";
      return Promise.reject(new AuthenticationError("Your session has ended. Please sign in again."));
    }

    if (status >= 500) {
      return Promise.reject(
        new ServerError(extractErrorMessage(data, "The server had a problem. Try again in a moment."), status),
      );
    }

    // 400/403/404/409/422 — handed to the caller with the body intact, so a form
    // can bind `errors` to its fields and a modal can key off `code`, without
    // this interceptor making policy decisions.
    return Promise.reject(new ClientError(extractErrorMessage(data, "Request failed."), status, data));
  },
);

export { client };
