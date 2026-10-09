"use client";

import { usePathname } from "next/navigation";

import AppLayout from "@/layout/AppLayout";
import { NAV } from "@/layout/nav";

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const match = [...NAV.school]
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <AppLayout role="school" title={match?.label ?? "Dashboard"}>
      {children}
    </AppLayout>
  );
}
