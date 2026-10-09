"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

interface ThemeValue {
  theme: Theme;
  toggle: () => void;
  set: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeValue | undefined>(undefined);

export const THEME_KEY = "theme";

/**
 * The stored choice IS the state — `useSyncExternalStore`, not `useState` plus an
 * effect.
 *
 * The obvious version (`useState("light")`, then read localStorage in an effect)
 * is wrong twice over: it sets state synchronously inside an effect, which React
 * now flags as a cascading render, and it renders one frame of light before
 * flipping. localStorage is an external store shared with the inline script in
 * the document head, so subscribing to it is what this hook is for.
 *
 * `getServerSnapshot` returns light because the public pages are light-only by
 * design — a visitor whose laptop is in dark mode must not get a half-dark
 * marketing page. The flash on a dark-mode workspace is prevented by the
 * pre-paint script in `app/layout.tsx`, not here; by the time React hydrates, the
 * class is already on `<html>`.
 */
function read(): Theme {
  try {
    return window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function subscribe(onChange: () => void): () => void {
  // `theme` is ours, for this tab. `storage` is the browser's, for the others —
  // so two open tabs do not disagree about dark mode.
  window.addEventListener("theme", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("theme", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);

  const set = useCallback((next: Theme) => {
    try { window.localStorage.setItem(THEME_KEY, next); } catch { /* private mode */ }
    window.dispatchEvent(new Event("theme"));
  }, []);

  const toggle = useCallback(() => set(read() === "dark" ? "light" : "dark"), [set]);

  // Pushing React's value out to the DOM — the one thing an effect is for.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const value = useMemo(() => ({ theme, toggle, set }), [theme, toggle, set]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
}
