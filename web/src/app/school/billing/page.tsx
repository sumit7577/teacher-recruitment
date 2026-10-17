"use client";

import BillingPage from "@/components/billing/BillingPage";

/** An institution's subscription. Same screen as the teacher's, different
 *  `audience` — see components/billing/BillingPage.tsx. */
export default function SchoolBilling() {
  return <BillingPage role="school" />;
}
