import React from "react";

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
 * Skips its own `flex flex-col` when the caller is using it as a grid: two
 * conflicting `display` rules on one element make width-stretching unreliable
 * across browsers.
 */
function hasGridDisplay(className: string): boolean {
  return className.split(/\s+/).some(
    (t) => t === "grid" || t === "inline-grid" || /^[a-z]+:grid$/.test(t) || /^[a-z]+:inline-grid$/.test(t),
  );
}

const Column: React.FC<ColumnProps> = ({ children, className = "", as: Tag = "div", ...props }) => {
  const base = hasGridDisplay(className) ? "" : "flex flex-col";
  return (
    <Tag className={`${base} ${className}`.trim()} {...props}>
      {children}
    </Tag>
  );
};

export default Column;
