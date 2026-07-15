import { describe, expect, it } from "vitest";

import { formatSubscriptionPrice, hasPremiumAccess } from "./subscription";


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
});
