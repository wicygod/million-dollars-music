import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_EQUALIZER, EQ_FREQUENCIES, EQ_PRESETS, EqualizerEngine, equalizerCurvePoints } from "./equalizer";

class FakeParam {
  value = 0;
  targets: number[] = [];
  setTargetAtTime(value: number): void { this.targets.push(value); }
}

class FakeNode {
  gain = new FakeParam();
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  type = "peaking";
  connect(): FakeNode { return this; }
}

class FakeAudioContext {
  static failNext = false;
  currentTime = 0;
  state = "running";
  destination = new FakeNode();
  gains: FakeNode[] = [];
  createMediaElementSource(): FakeNode {
    if (FakeAudioContext.failNext) {
      FakeAudioContext.failNext = false;
      throw new Error("graph failed");
    }
    return new FakeNode();
  }
  createGain(): FakeNode { const node = new FakeNode(); this.gains.push(node); return node; }
  createDynamicsCompressor(): FakeNode { return new FakeNode(); }
  createBiquadFilter(): FakeNode { return new FakeNode(); }
  async resume(): Promise<void> {}
  async close(): Promise<void> {}
}

afterEach(() => vi.unstubAllGlobals());


describe("equalizer presets", () => {
  it("keeps every preset aligned with the ten-band audio graph", () => {
    Object.values(EQ_PRESETS).forEach((preset) => {
      expect(preset.gains).toHaveLength(EQ_FREQUENCIES.length);
      expect(preset.gains.every((gain) => gain >= -12 && gain <= 12)).toBe(true);
      expect(preset.preamp).toBeGreaterThanOrEqual(-12);
      expect(preset.preamp).toBeLessThanOrEqual(0);
    });
  });

  it("gives bass profiles audible low-frequency lift with clipping headroom", () => {
    expect(EQ_PRESETS.bass.gains[0]).toBeGreaterThanOrEqual(8);
    expect(EQ_PRESETS.bass.gains[1]).toBeGreaterThanOrEqual(10);
    expect(EQ_PRESETS.bass.preamp).toBeLessThanOrEqual(-4);
    expect(EQ_PRESETS.subbass.gains[0]).toBe(12);
    expect(EQ_PRESETS.subbass.preamp).toBeLessThanOrEqual(-5);
  });

  it("renders one curve point per frequency without leaving the graph", () => {
    const points = equalizerCurvePoints(EQ_PRESETS.electronic.gains).split(" ");
    expect(points).toHaveLength(EQ_FREQUENCIES.length);
    points.forEach((point) => {
      const [x, y] = point.split(",").map(Number);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(12);
      expect(y).toBeLessThanOrEqual(88);
    });
  });

  it("uses a true dry path while the equalizer is disabled", async () => {
    const context = new FakeAudioContext();
    vi.stubGlobal("AudioContext", class { constructor() { return context; } });
    const engine = new EqualizerEngine({} as HTMLAudioElement);

    expect(await engine.ensure(DEFAULT_EQUALIZER)).toBe(true);
    expect(context.gains[0].gain.targets[context.gains[0].gain.targets.length - 1]).toBe(1);
    expect(context.gains[1].gain.targets[context.gains[1].gain.targets.length - 1]).toBe(0);
  });

  it("can retry after an audio graph initialization failure", async () => {
    FakeAudioContext.failNext = true;
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const engine = new EqualizerEngine({} as HTMLAudioElement);

    expect(await engine.ensure(DEFAULT_EQUALIZER)).toBe(false);
    expect(await engine.ensure(DEFAULT_EQUALIZER)).toBe(true);
  });
});
