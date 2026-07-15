import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_EQUALIZER,
  EQUALIZER_STATE_VERSION,
  EQ_FREQUENCIES,
  EQ_PRESETS,
  EqualizerEngine,
  calculateEqualizerMetrics,
  equalizerCurvePoints,
  equalizerFrequencyResponse,
  restoreEqualizerState,
  type EqualizerState,
} from "./equalizer";

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
  connections: FakeNode[] = [];
  connect(node: FakeNode): FakeNode { this.connections.push(node); return node; }
}

class FakeAudioContext {
  static failNext = false;
  static failResume = false;
  currentTime = 0;
  sampleRate = 48000;
  state = "running";
  destination = new FakeNode();
  gains: FakeNode[] = [];
  biquads: FakeNode[] = [];
  compressors: FakeNode[] = [];
  sourceCreations = 0;
  createMediaElementSource(): FakeNode {
    this.sourceCreations += 1;
    if (FakeAudioContext.failNext) {
      FakeAudioContext.failNext = false;
      throw new Error("graph failed");
    }
    return new FakeNode();
  }
  createGain(): FakeNode { const node = new FakeNode(); this.gains.push(node); return node; }
  createDynamicsCompressor(): FakeNode { const node = new FakeNode(); this.compressors.push(node); return node; }
  createBiquadFilter(): FakeNode { const node = new FakeNode(); this.biquads.push(node); return node; }
  async resume(): Promise<void> { if (FakeAudioContext.failResume) throw new Error("resume failed"); }
  async close(): Promise<void> {}
}

afterEach(() => {
  FakeAudioContext.failNext = false;
  FakeAudioContext.failResume = false;
  vi.unstubAllGlobals();
});

function stateForPreset(presetId: keyof typeof EQ_PRESETS): EqualizerState {
  const preset = EQ_PRESETS[presetId];
  return {
    enabled: true,
    preset: presetId,
    preamp: preset.preamp,
    bassBoost: preset.bassBoost,
    clarity: preset.clarity,
    autoGain: true,
    gains: [...preset.gains],
  };
}

describe("equalizer presets and safety", () => {
  it("keeps every preset aligned with the ten-band audio graph", () => {
    Object.values(EQ_PRESETS).forEach((preset) => {
      expect(preset.gains).toHaveLength(EQ_FREQUENCIES.length);
      expect(preset.gains.every((gain) => gain >= -12 && gain <= 12)).toBe(true);
      expect(preset.preamp).toBeGreaterThanOrEqual(-12);
      expect(preset.preamp).toBeLessThanOrEqual(0);
      expect(preset.bassBoost).toBeGreaterThanOrEqual(0);
      expect(preset.bassBoost).toBeLessThanOrEqual(100);
      expect(preset.clarity).toBeGreaterThanOrEqual(0);
      expect(preset.clarity).toBeLessThanOrEqual(100);
    });
  });

  it("makes bass profiles meaningfully stronger than the midrange without boosting mud", () => {
    for (const presetId of ["bass", "subbass"] as const) {
      const state = stateForPreset(presetId);
      const [low, mud, mid] = equalizerFrequencyResponse(state, [70, 285, 1000]);
      expect(low - mid).toBeGreaterThan(6);
      expect(mud).toBeLessThan(low - 4);
    }
  });

  it("calculates auto headroom from the summed response rather than the tallest slider", () => {
    [...Object.keys(EQ_PRESETS), "all-max"].forEach((id) => {
      const state = id === "all-max"
        ? { ...DEFAULT_EQUALIZER, enabled: true, preset: "custom" as const, autoGain: true, gains: EQ_FREQUENCIES.map(() => 12), bassBoost: 100, clarity: 100 }
        : stateForPreset(id as keyof typeof EQ_PRESETS);
      const metrics = calculateEqualizerMetrics(state);
      expect(metrics.peakBoostDb + metrics.effectivePreampDb).toBeLessThanOrEqual(1.501);
      expect(Number.isFinite(metrics.effectivePreampDb)).toBe(true);
    });
  });

  it("can disable automatic attenuation while retaining the safety limiter", () => {
    const metrics = calculateEqualizerMetrics({ ...stateForPreset("bass"), autoGain: false });
    expect(metrics.automaticHeadroomDb).toBe(0);
    expect(metrics.effectivePreampDb).toBe(EQ_PRESETS.bass.preamp);
  });

  it("produces finite responses at common sample rates", () => {
    for (const sampleRate of [44100, 48000]) {
      const response = equalizerFrequencyResponse(stateForPreset("clean"), [20, 62, 1000, 8000, 18000], sampleRate);
      expect(response.every(Number.isFinite)).toBe(true);
    }
  });

  it("renders one curve point per frequency without leaving the graph", () => {
    const response = equalizerFrequencyResponse(stateForPreset("electronic"), EQ_FREQUENCIES);
    const points = equalizerCurvePoints(response).split(" ");
    expect(points).toHaveLength(EQ_FREQUENCIES.length);
    points.forEach((point) => {
      const [x, y] = point.split(",").map(Number);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(12);
      expect(y).toBeLessThanOrEqual(88);
    });
  });

  it("migrates named presets to the new canonical sound but preserves custom controls", () => {
    const named = restoreEqualizerState({ version: 1, enabled: true, preset: "bass", gains: EQ_FREQUENCIES.map(() => 12), preamp: -12 });
    expect(named.migrated).toBe(true);
    expect(named.state.gains).toEqual(EQ_PRESETS.bass.gains);
    expect(named.state.bassBoost).toBe(EQ_PRESETS.bass.bassBoost);
    expect(named.state.autoGain).toBe(true);

    const custom = restoreEqualizerState({ version: EQUALIZER_STATE_VERSION, enabled: true, preset: "custom", gains: [99, -99, 1, 2, 3, 4, 5, 6, 7, 8], preamp: 4, bassBoost: 130, clarity: -5, autoGain: false });
    expect(custom.migrated).toBe(false);
    expect(custom.state.gains[0]).toBe(12);
    expect(custom.state.gains[1]).toBe(-12);
    expect(custom.state.preamp).toBe(0);
    expect(custom.state.bassBoost).toBe(100);
    expect(custom.state.clarity).toBe(0);
    expect(custom.state.autoGain).toBe(false);
  });
});

describe("EqualizerEngine", () => {
  it("uses a true dry path while the equalizer is disabled", async () => {
    const context = new FakeAudioContext();
    vi.stubGlobal("AudioContext", class { constructor() { return context; } });
    const engine = new EqualizerEngine({} as HTMLAudioElement);

    expect(await engine.ensure(DEFAULT_EQUALIZER)).toBe(true);
    expect(context.gains[0].gain.targets[context.gains[0].gain.targets.length - 1]).toBe(1);
    expect(context.gains[1].gain.targets[context.gains[1].gain.targets.length - 1]).toBe(0);
  });

  it("builds rumble removal, ten graphic bands, bass and clarity stages, then a transparent limiter", async () => {
    const context = new FakeAudioContext();
    vi.stubGlobal("AudioContext", class { constructor() { return context; } });
    const engine = new EqualizerEngine({} as HTMLAudioElement);

    expect(await engine.ensure(stateForPreset("bass"))).toBe(true);
    expect(context.biquads).toHaveLength(16);
    expect(context.biquads[0].type).toBe("highpass");
    expect(context.biquads[0].frequency.value).toBe(18);
    expect(context.biquads[11].type).toBe("lowshelf");
    expect(context.biquads[11].frequency.value).toBe(88);
    expect(context.biquads[11].gain.targets[context.biquads[11].gain.targets.length - 1]).toBeGreaterThan(4.5);
    expect(context.biquads[13].gain.targets[context.biquads[13].gain.targets.length - 1]).toBeLessThan(0);
    expect(context.compressors[0].threshold.value).toBe(-0.5);
    expect(context.compressors[0].ratio.value).toBe(20);
    expect(context.compressors[0].release.value).toBe(0.12);
  });

  it("deduplicates concurrent audio graph initialization", async () => {
    const context = new FakeAudioContext();
    vi.stubGlobal("AudioContext", class { constructor() { return context; } });
    const engine = new EqualizerEngine({} as HTMLAudioElement);

    expect(await Promise.all([engine.ensure(DEFAULT_EQUALIZER), engine.ensure(DEFAULT_EQUALIZER)])).toEqual([true, true]);
    expect(context.sourceCreations).toBe(1);
  });

  it("can retry after an audio graph initialization failure", async () => {
    FakeAudioContext.failNext = true;
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const engine = new EqualizerEngine({} as HTMLAudioElement);

    expect(await engine.ensure(DEFAULT_EQUALIZER)).toBe(false);
    expect(await engine.ensure(DEFAULT_EQUALIZER)).toBe(true);
  });

  it("reports a suspended context that cannot resume instead of pretending sound is active", async () => {
    const context = new FakeAudioContext();
    context.state = "suspended";
    FakeAudioContext.failResume = true;
    vi.stubGlobal("AudioContext", class { constructor() { return context; } });
    const engine = new EqualizerEngine({} as HTMLAudioElement);

    expect(await engine.ensure(DEFAULT_EQUALIZER)).toBe(false);
  });
});
