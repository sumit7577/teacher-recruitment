"use client";

import {
  BellIcon,
  BriefcaseIcon,
  BuildingOffice2Icon,
  ChevronLeftIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  HeartIcon,
  ChatBubbleLeftRightIcon,
  FlagIcon,
  HomeIcon,
  InboxIcon,
  UserCircleIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";

import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import { useSidebar } from "@/context/SidebarContext";
import type { Role } from "@/Hooks/useSession";
import { NAV, WORKSPACE_NAME } from "@/layout/nav";
import { cn } from "@/lib/cn";

/** A name → component lookup rather than dynamic imports: the set is fixed, and a
 *  lookup that cannot fail beats an import that can. */
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  home: HomeIcon,
  briefcase: BriefcaseIcon,
  clipboard: ClipboardDocumentListIcon,
  user: UserCircleIcon,
  users: UsersIcon,
  building: BuildingOffice2Icon,
  bell: BellIcon,
  inbox: InboxIcon,
  cog: Cog6ToothIcon,
  card: CreditCardIcon,
  heart: HeartIcon,
  chat: ChatBubbleLeftRightIcon,
  flag: FlagIcon,
};

export default function AppSidebar({ role, brand }: { role: Role; brand: string }) {
  const pathname = usePathname() ?? "";
  const { collapsed, toggleCollapsed, open, setOpen } = useSidebar();
  const items = NAV[role];

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-surface transition-[width,transform] duration-200",
        collapsed ? "w-[72px]" : "w-64",
        // Off-canvas on mobile, always present on desktop. `translate` rather than
        // `hidden` so the drawer slides instead of appearing.
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      )}
    >
      <Row className="h-16 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-deep text-sm font-bold text-deep-ink"
          >
            {brand.slice(0, 1)}
          </span>
          {!collapsed ? (
            <Column className="min-w-0 leading-tight">
              <span className="truncate font-display text-sm font-extrabold text-ink-1">{brand}</span>
              <span className="text-[11px] text-ink-3">{WORKSPACE_NAME[role]}</span>
            </Column>
          ) : null}
        </Link>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          className="btn btn-ghost hidden p-1.5 lg:inline-flex"
        >
          <ChevronLeftIcon className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </button>
      </Row>

      <Column as="nav" className="min-h-0 flex-1 gap-1 overflow-y-auto p-3">
        {items.map((item) => {
          const Icon = ICONS[item.icon] ?? HomeIcon;
          const active = item.nested
            ? pathname === item.href || pathname.startsWith(`${item.href}/`)
            : pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink-1",
                collapsed && "justify-center px-2",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed ? <span className="truncate">{item.label}</span> : null}
            </Link>
          );
        })}
      </Column>

      {!collapsed ? (
        <Column className="shrink-0 gap-2 border-t border-line p-3">
          <Link href="/" className="text-xs font-medium text-ink-3 hover:text-accent">
            ← Back to the website
          </Link>
        </Column>
      ) : null}
    </aside>
  );
}
