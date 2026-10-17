/**
 * Loading Razorpay's checkout widget, once, and only where it is needed.
 *
 * The script is NOT in the root layout. It is a third-party file on a
 * third-party domain, and the public job board — which is the part of this site
 * that has to be fast and is the part Google measures — has no payment on it.
 * Loading it from the two pages that actually take money keeps it off the other
 * thirty.
 *
 * `loadRazorpay()` is idempotent: concurrent callers share one promise and one
 * `<script>` tag, so a user mashing the pay button does not attach five.
 */

/** The slice of Razorpay's widget we actually use. Hand-written rather than
 *  pulled from a types package: the package lags the API, and this is five
 *  fields we control the shape of. */
export interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (payload: unknown) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const SRC = "https://checkout.razorpay.com/v1/checkout.js";

let pending: Promise<void> | null = null;

export function loadRazorpay(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Checkout can only be opened in a browser."));
  }
  if (window.Razorpay) return Promise.resolve();
  if (pending) return pending;

  pending = new Promise<void>((resolve, reject) => {
    // A tag may already exist from an earlier mount whose load never finished.
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.src = SRC;
    script.async = true;

    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => {
        // Clear the cached promise so a retry can attach a fresh tag — a
        // network blip on first load should not disable payment for the
        // lifetime of the page.
        pending = null;
        script.remove();
        reject(new Error("Could not reach the payment provider. Check your connection."));
      },
      { once: true },
    );

    if (!existing) document.body.appendChild(script);
  });

  return pending;
}
