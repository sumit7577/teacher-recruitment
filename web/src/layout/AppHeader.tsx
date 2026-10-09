"use client";

import { ArrowRightStartOnRectangleIcon, Bars3Icon, MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import { useSidebar } from "@/context/SidebarContext";
import { useTheme } from "@/context/ThemeContext";
import { useSession, useSignOut, type Role } from "@/Hooks/useSession";
import { WORKSPACE_NAME } from "@/layout/nav";

export default function AppHeader({ title, role }: { title: string; role: Role }) {
  const { setOpen } = useSidebar();
  const { theme, toggle } = useTheme();
  const session = useSession();
  const signOut = useSignOut();
  const [busy, setBusy] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
      <Row className="h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <Row className="min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="btn btn-ghost p-2 lg:hidden"
          >
            <Bars3Icon className="h-5 w-5" />
          </button>
          <Column className="min-w-0 leading-tight">
            <h1 className="truncate font-display text-base font-bold text-ink-1 sm:text-lg">{title}</h1>
            <span className="hidden text-xs text-ink-3 sm:block">{WORKSPACE_NAME[role]} workspace</span>
          </Column>
        </Row>

        <Row className="items-center gap-1.5">
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="btn btn-ghost p-2"
          >
            {theme === "dark" ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
          </button>
          {session?.user ? (
            <Column className="hidden items-end leading-tight sm:flex">
              <span className="text-sm font-semibold text-ink-1">{session.user.name || "Signed in"}</span>
              <span className="text-xs text-ink-3">{session.user.phone}</span>
            </Column>
          ) : null}
          <button
            type="button"
            onClick={async () => {
              setBusy(true);
              try {
                await signOut();
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            aria-label="Sign out"
            title="Sign out"
            className="btn btn-ghost p-2"
          >
            <ArrowRightStartOnRectangleIcon className="h-5 w-5" />
          </button>
        </Row>
      </Row>
    </header>
  );
}
