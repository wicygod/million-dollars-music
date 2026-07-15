export const PREMIUM_SUBSCRIPTION_STATUSES = new Set(["premium", "trial", "support"]);

export interface SubscriptionIdentity {
  subscription_status?: string | null;
  is_premium?: boolean;
}

export function hasPremiumAccess(user: SubscriptionIdentity | null | undefined): boolean {
  if (!user) return false;
  if (typeof user.is_premium === "boolean") return user.is_premium;
  return PREMIUM_SUBSCRIPTION_STATUSES.has(String(user.subscription_status || "inactive").trim().toLowerCase());
}

export function formatSubscriptionPrice(priceMinor: number, currency: string): string {
  const safePrice = Number.isFinite(priceMinor) ? Math.max(0, priceMinor) : 0;
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(safePrice / 100);
  } catch {
    return `${Math.round(safePrice / 100)} ${currency}`;
  }
}

export function isTrustedCheckoutUrl(checkoutUrl: string, apiBaseUrl: string): boolean {
  try {
    const checkout = new URL(checkoutUrl);
    const apiBase = new URL(apiBaseUrl);
    const keys = [...checkout.searchParams.keys()];
    return (checkout.protocol === "http:" || checkout.protocol === "https:")
      && checkout.origin === apiBase.origin
      && checkout.pathname === "/api/subscriptions/mock-payment"
      && keys.length === 1
      && keys[0] === "checkout_token"
      && Boolean(checkout.searchParams.get("checkout_token"))
      && checkout.hash === "";
  } catch {
    return false;
  }
}
