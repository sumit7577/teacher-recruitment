import React from "react";

import { hasBaseDirection, hasGridDisplay } from "./layout";

interface ColumnProps {
  children?: React.ReactNode;
  className?: string;
  as?: React.ElementType;
  [key: string]: unknown;
}

/**
 * A vertical flex container. Carried over from allcoaching-educator so the
 * layout vocabulary is the same in both codebases.
 *
 * See `layout.ts` for why it inspects the caller's className.
 */
const Column: React.FC<ColumnProps> = ({ children, className = "", as: Tag = "div", ...props }) => {
  const base = hasGridDisplay(className)
    ? ""
    : hasBaseDirection(className)
      ? "flex"
      : "flex flex-col";
  return (
    <Tag className={`${base} ${className}`.trim()} {...props}>
      {children}
    </Tag>
  );
};

export default Column;
