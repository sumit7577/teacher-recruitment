import React from "react";

interface RowProps {
  children?: React.ReactNode;
  className?: string;
  as?: React.ElementType;
  [key: string]: unknown;
}

function hasGridDisplay(className: string): boolean {
  return className.split(/\s+/).some(
    (t) => t === "grid" || t === "inline-grid" || /^[a-z]+:grid$/.test(t) || /^[a-z]+:inline-grid$/.test(t),
  );
}

/** A horizontal flex container. See Column for why the grid check exists. */
const Row: React.FC<RowProps> = ({ children, className = "", as: Tag = "div", ...props }) => {
  const base = hasGridDisplay(className) ? "" : "flex flex-row";
  return (
    <Tag className={`${base} ${className}`.trim()} {...props}>
      {children}
    </Tag>
  );
};

export default Row;
