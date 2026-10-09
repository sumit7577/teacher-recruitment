"use client";

import Column from "@/components/common/Column";
import PageLoader from "@/components/common/PageLoader";
import { useSidebar } from "@/context/SidebarContext";
import { useRequireRole, type Role } from "@/Hooks/useSession";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import { cn } from "@/lib/cn";

/**
 * The shell all three workspaces share: sidebar, header, scrolling content.
 *
 * It holds the role guard, so no individual screen has to. A screen inside this
 * can assume the session exists and matches — and because the guard renders a
 * loader rather than the children while the answer is unknown, no screen ever
 * mounts with the wrong audience's token and fires a request that 403s.
 */
export default function AppLayout({
  role, title, brand = "Jeewan Sir", children,
}: {
  role: Role;
  title: string;
  brand?: string;
  children: React.ReactNode;
}) {
  const guard = useRequireRole(role);
  const { collapsed } = useSidebar();

  if (guard !== "allowed") {
    return <PageLoader label={guard === "checking" ? "Loading" : "Taking you to the right place"} />;
  }

  return (
    <div className="min-h-screen bg-paper">
      <AppSidebar role={role} brand={brand} />
      <Backdrop />
      <div className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-[72px]" : "lg:pl-64")}>
        <AppHeader title={title} role={role} />
        <Column as="main" className="mx-auto w-full max-w-6xl gap-6 p-4 sm:p-6">
          {children}
        </Column>
      </div>
    </div>
  );
}
