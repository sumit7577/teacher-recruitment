import { Inter, Plus_Jakarta_Sans } from "next/font/google";

/**
 * Self-hosted at build time by next/font, deliberately — NOT an
 * `@import url(fonts.googleapis.com)` in globals.css.
 *
 * An `@import` has to precede every rule in the stylesheet, and the production
 * CSS optimiser silently drops one that does not. That failure mode has cost a
 * day before: the build exits 0, nothing warns, and the site renders in the
 * fallback stack in production only. next/font also removes the third-party
 * round trip and the layout shift.
 *
 * Both expose a CSS variable rather than only a className, so `globals.css` can
 * use them in `@theme inline` and in `@layer base` — a className on `<html>`
 * cannot be reached from inside a stylesheet.
 */
export const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const fontVariables = `${jakarta.variable} ${inter.variable}`;
