"use client";

import { useSidebar } from "@/context/SidebarContext";

/** The dimmed overlay behind the mobile drawer. Clicking it closes the drawer,
 *  which is the gesture everyone tries first. */
export default function Backdrop() {
  const { open, setOpen } = useSidebar();
  if (!open) return null;
  return (
    <button
      type="button"
      aria-label="Close menu"
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-30 bg-black/40 lg:hidden"
    />
  );
}
