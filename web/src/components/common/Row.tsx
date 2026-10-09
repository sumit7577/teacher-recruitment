import React from "react";

import { hasBaseDirection, hasGridDisplay } from "./layout";

interface RowProps {
  children?: React.ReactNode;
  className?: string;
  as?: React.ElementType;
  [key: string]: unknown;
}

/** A horizontal flex container. See `layout.ts` for why the two checks exist. */
const Row: React.FC<RowProps> = ({ children, className = "", as: Tag = "div", ...props }) => {
  const base = hasGridDisplay(className)
    ? ""
    : hasBaseDirection(className)
      ? "flex"
      : "flex flex-row";
  return (
    <Tag className={`${base} ${className}`.trim()} {...props}>
      {children}
    </Tag>
  );
};

export default Row;
