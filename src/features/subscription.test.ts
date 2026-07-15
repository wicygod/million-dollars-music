import { describe, expect, it } from "vitest";

import { formatSubscriptionPrice, hasPremiumAccess, isTrustedCheckoutUrl } from "./subscription";


describe("subscription entitlements", () => {
  it("grants the equalizer to premium-compatible statuses", () => {
    expect(hasPremiumAccess({ subscription_status: "premium" })).toBe(true);
    expect(hasPremiumAccess({ subscription_status: "trial" })).toBe(true);
    expect(hasPremiumAccess({ subscription_status: "support" })).toBe(true);
  });

  it("prefers the server-computed entitlement", () => {
    expect(hasPremiumAccess({ subscription_status: "premium", is_premium: false })).toBe(false);
    expect(hasPremiumAccess({ subscription_status: "inactive", is_premium: true })).toBe(true);
  });

  it("keeps free and anonymous users locked", () => {
    expect(hasPremiumAccess(null)).toBe(false);
    expect(hasPremiumAccess({ subscription_status: "inactive" })).toBe(false);
  });

  it("formats prices stored in minor currency units", () => {
    expect(formatSubscriptionPrice(19_900, "RUB")).toContain("199");
  });

  it("only accepts the signed checkout path on the configured API origin", () => {
    const base = "http://5.181.21.13:8000";
    expect(isTrustedCheckoutUrl(`${base}/api/subscriptions/mock-payment?checkout_token=signed`, base)).toBe(true);
    expect(isTrustedCheckoutUrl("https://evil.example/api/subscriptions/mock-payment?checkout_token=signed", base)).toBe(false);
    expect(isTrustedCheckoutUrl(`${base}/api/subscriptions/mock-payment?checkout_token=signed&next=https://evil.example`, base)).toBe(false);
  });
});
