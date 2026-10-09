import Link from "next/link";
import React from "react";

import { cn } from "@/lib/cn";

type Variant = "accent" | "deep" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

interface Props {
  children: React.ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
}

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "",
  lg: "px-6 py-3 text-base",
};

/**
 * One button. The variants map to the `.btn-*` classes in globals.css rather than
 * carrying their own colours, so the client changing their accent in the panel
 * changes every button on the site.
 *
 * `href` renders a `next/link` instead of a `<button>` — a navigation that looks
 * like a button should still be a link, so it opens in a new tab on
 * middle-click and is read as a link by a screen reader.
 */
export const Button: React.FC<Props> = ({
  children, variant = "accent", size = "md", className = "",
  href, onClick, type = "button", disabled, loading, full,
}) => {
  const classes = cn("btn", `btn-${variant}`, SIZES[size], full && "w-full", className);

  if (href && !disabled && !loading) {
    return (
      <Link href={href} className={classes} onClick={onClick}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} className={classes}>
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
};

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

export default Button;
