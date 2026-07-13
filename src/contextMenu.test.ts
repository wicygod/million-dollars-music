import { describe, expect, it } from "vitest";

import { disableNativeContextMenu } from "./contextMenu";

describe("native context menu guard", () => {
  it("prevents the WebView context menu", () => {
    const target = new EventTarget();
    disableNativeContextMenu(target);
    const event = new Event("contextmenu", { cancelable: true });

    expect(target.dispatchEvent(event)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it("returns a cleanup function", () => {
    const target = new EventTarget();
    const cleanup = disableNativeContextMenu(target);
    cleanup();
    const event = new Event("contextmenu", { cancelable: true });

    expect(target.dispatchEvent(event)).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  });
});
