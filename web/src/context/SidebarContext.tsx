"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface SidebarValue {
  /** Collapsed to icons — the desktop state. */
  collapsed: boolean;
  toggleCollapsed: () => void;
  /** The drawer — the mobile state. Separate from `collapsed` because they are
   *  different things: a collapsed desktop sidebar is still visible. */
  open: boolean;
  setOpen: (open: boolean) => void;
}

const SidebarContext = createContext<SidebarValue | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);

  // Closing the drawer on resize matters: a drawer left open while the window
  // widens becomes an invisible overlay that swallows every click.
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 1024) setOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), []);
  const value = useMemo(
    () => ({ collapsed, toggleCollapsed, open, setOpen }),
    [collapsed, toggleCollapsed, open],
  );
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarValue {
  const value = useContext(SidebarContext);
  if (!value) throw new Error("useSidebar must be used inside <SidebarProvider>");
  return value;
}
