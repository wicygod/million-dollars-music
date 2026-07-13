import { describe, expect, it } from "vitest";

import { PlaybackCycleGate } from "./playbackHistory";

describe("playback history cycles", () => {
  it("records only once while the same playback cycle is resumed", () => {
    const gate = new PlaybackCycleGate();
    gate.begin();
    expect(gate.claim()).toBe(1);
    expect(gate.claim()).toBeNull();
  });

  it("counts every repeat as a new play, including short tracks", () => {
    const gate = new PlaybackCycleGate();
    gate.begin();
    expect(gate.claim()).toBe(1);
    gate.begin();
    expect(gate.claim()).toBe(2);
  });

  it("allows a failed history request to retry its playback cycle", () => {
    const gate = new PlaybackCycleGate();
    gate.begin();
    const cycle = gate.claim();
    expect(cycle).toBe(1);
    gate.release(cycle!);
    expect(gate.claim()).toBe(1);
  });
});
