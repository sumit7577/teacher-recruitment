"use client";

import { Suspense } from "react";

import MessagesPage from "@/components/connect/MessagesPage";

/** Suspense because MessagesPage reads `?thread=` with useSearchParams, which
 *  Next requires to be inside a boundary. */
export default function StudentMessages() {
  return (
    <Suspense fallback={null}>
      <MessagesPage />
    </Suspense>
  );
}
