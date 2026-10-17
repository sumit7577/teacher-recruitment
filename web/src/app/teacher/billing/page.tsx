"use client";

import BillingPage from "@/components/billing/BillingPage";

/** A teacher's fees. Which plans exist is the backend's answer to
 *  `audience=teacher`, not this file's. */
export default function TeacherBilling() {
  return <BillingPage role="teacher" />;
}
