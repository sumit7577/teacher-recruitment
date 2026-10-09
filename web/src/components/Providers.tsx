"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ToastContainer } from "react-toastify";

import { SidebarProvider } from "@/context/SidebarContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { queryClient } from "@/queryClient";

/**
 * The client-side providers, in one component.
 *
 * Here rather than in `app/layout.tsx` so the root layout stays a server
 * component — it is what produces the `<meta>` tags, and a `"use client"` layout
 * would send the whole page tree to the browser and lose the server-rendered HTML
 * the public pages exist for.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SidebarProvider>
          {children}
          <ToastContainer
            position="top-center"
            autoClose={4000}
            hideProgressBar
            newestOnTop
            closeOnClick
            theme="colored"
          />
        </SidebarProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
