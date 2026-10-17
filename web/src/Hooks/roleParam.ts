import type { Role } from "@/Hooks/useSession";

/**
 * Reading `?as=` from a URL, in one place.
 *
 * Both the sign-in and the register page used a ternary chain ending in
 * `: "teacher"`, which meant any role not spelled out in the chain silently
 * became a teacher. `?as=student` signed a parent in as a teacher and dropped
 * them on the teacher registration wizard — and it failed quietly, because
 * falling back to a valid role looks like working code.
 *
 * A set cannot have that bug: a new audience is one entry, and anything
 * unrecognised falls back deliberately rather than by omission.
 */
const ROLES = new Set<Role>(["teacher", "school", "student", "staff"]);

export function roleFromParam(value: string | undefined, fallback: Role = "teacher"): Role {
  return ROLES.has(value as Role) ? (value as Role) : fallback;
}

/** The roles a person may sign themselves up as. Staff accounts are created by
 *  the office, never by a signup form. */
const SELF_SIGNUP = new Set<Role>(["teacher", "school", "student"]);

export function signupRoleFromParam(value: string | undefined): Role {
  return SELF_SIGNUP.has(value as Role) ? (value as Role) : "teacher";
}
