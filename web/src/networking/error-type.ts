/**
 * Typed errors, so a caller can tell "your session ended" from "that phone
 * number is already registered" from "the server is down" without string
 * matching on a message.
 *
 * Mirrors allcoaching-educator/src/networking/error-type.ts.
 */

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class ServerError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ServerError";
    this.status = status;
  }
}

export class ClientError extends Error {
  status: number;
  code?: string;
  /** DRF field errors, as `{field: message}` — what a form binds to. */
  errors?: Record<string, string>;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ClientError";
    this.status = status;
    const body = (data ?? {}) as Record<string, unknown>;
    this.code = typeof body.code === "string" ? body.code : undefined;
    this.errors = (body.errors as Record<string, string>) ?? undefined;
  }
}

/**
 * Pull a human sentence out of whatever the backend sent.
 *
 * The API answers in one envelope, but DRF's own errors and Django's 500 page do
 * not, and a user should never see "[object Object]". The order below is the
 * order of specificity: our own message first, then a field error, then the
 * caller's fallback.
 */
export function extractErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const body = data as Record<string, unknown>;

  if (typeof body.message === "string" && body.message) return body.message;
  if (typeof body.detail === "string" && body.detail) return body.detail;

  const errors = body.errors as Record<string, unknown> | undefined;
  if (errors && typeof errors === "object") {
    const first = Object.values(errors)[0];
    if (typeof first === "string" && first) return first;
    if (Array.isArray(first) && typeof first[0] === "string") return first[0];
  }

  if (typeof body.error === "string" && body.error) return body.error;
  return fallback;
}

/** The message to show a user, for any thrown value. */
export function messageOf(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
