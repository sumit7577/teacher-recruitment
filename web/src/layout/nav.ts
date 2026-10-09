import type { Role } from "@/Hooks/useSession";

export interface NavItem {
  href: string;
  label: string;
  /** A Heroicons outline name, resolved by AppSidebar's own lookup. */
  icon: string;
  /** Match child routes too — /panel/vacancies/abc should light /panel/vacancies. */
  nested?: boolean;
}

/**
 * The three workspaces' navigation, in one file.
 *
 * Together rather than in each layout because they have to stay comparable: the
 * same concept should sit in the same place in all three, and a teacher's
 * "Applications" and a school's "Applicants" are the same screen seen from either
 * end. Keeping them side by side is what makes that visible.
 */
export const NAV: Record<Role, NavItem[]> = {
  teacher: [
    { href: "/teacher", label: "Dashboard", icon: "home" },
    { href: "/teacher/vacancies", label: "Vacancies", icon: "briefcase", nested: true },
    { href: "/teacher/applications", label: "My applications", icon: "clipboard", nested: true },
    { href: "/teacher/profile", label: "My profile", icon: "user", nested: true },
    { href: "/teacher/notifications", label: "Notifications", icon: "bell" },
  ],
  school: [
    { href: "/school", label: "Dashboard", icon: "home" },
    { href: "/school/vacancies", label: "Our vacancies", icon: "briefcase", nested: true },
    { href: "/school/applicants", label: "Applicants", icon: "users", nested: true },
    { href: "/school/profile", label: "Our institution", icon: "building" },
  ],
  staff: [
    { href: "/panel", label: "Dashboard", icon: "home" },
    { href: "/panel/vacancies", label: "Vacancies", icon: "briefcase", nested: true },
    { href: "/panel/applications", label: "Applications", icon: "clipboard", nested: true },
    { href: "/panel/teachers", label: "Teachers", icon: "user", nested: true },
    { href: "/panel/schools", label: "Institutions", icon: "building", nested: true },
    { href: "/panel/enquiries", label: "Enquiries", icon: "inbox" },
    { href: "/panel/notifications", label: "Push", icon: "bell" },
    { href: "/panel/site", label: "Website text", icon: "cog", nested: true },
  ],
};

export const WORKSPACE_NAME: Record<Role, string> = {
  teacher: "Teacher",
  school: "Institution",
  staff: "Office",
};
