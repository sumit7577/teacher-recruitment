"use client";

import { usePathname } from "next/navigation";

import AppLayout from "@/layout/AppLayout";
import { NAV } from "@/layout/nav";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const match = [...NAV.staff]
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <AppLayout role="staff" title={match?.label ?? "Dashboard"}>
      {children}
    </AppLayout>
  );
}
