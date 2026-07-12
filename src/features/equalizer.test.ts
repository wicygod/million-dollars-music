import { describe, expect, it } from "vitest";

import { EQ_FREQUENCIES, EQ_PRESETS, equalizerCurvePoints } from "./equalizer";


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
});
