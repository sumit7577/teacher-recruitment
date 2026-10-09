import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge class names, with later Tailwind utilities winning over earlier ones.
 *  `clsx` alone would emit both `px-2` and `px-4` and leave the cascade to
 *  decide, which depends on the order Tailwind happened to generate them in. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
