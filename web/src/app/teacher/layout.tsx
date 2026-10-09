"use client";

import { usePathname } from "next/navigation";

import AppLayout from "@/layout/AppLayout";
import { NAV } from "@/layout/nav";

/**
 * The teacher workspace shell.
 *
 * The title is derived from the nav rather than passed by each page, so a page
 * cannot disagree with the sidebar item that is highlighted next to it. Longest
 * match wins, so /teacher/vacancies/abc titles as "Vacancies" rather than
 * "Dashboard".
 */
export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const match = [...NAV.teacher]
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <AppLayout role="teacher" title={match?.label ?? "Dashboard"}>
      {children}
    </AppLayout>
  );
}
