"use client";

import { usePathname } from "next/navigation";

import AppLayout from "@/layout/AppLayout";
import { NAV } from "@/layout/nav";

/** The student/parent workspace shell. Same shape as the other three — the
 *  title comes from the nav so a page cannot disagree with the sidebar item
 *  highlighted beside it. */
export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const match = [...NAV.student]
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <AppLayout role="student" title={match?.label ?? "Dashboard"}>
      {children}
    </AppLayout>
  );
}
