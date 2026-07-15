import { describe, expect, it } from "vitest";
import type { MetadataFeed, Track } from "../metadataFeedService";
import {
  formatChartPercent,
  selectAdminChartTracks,
  selectPopularTracks,
  type AdminChartTrack,
} from "./popularChart";

function track(id: string, overrides: Partial<Track> = {}): Track {
  return {
    id,
    title: `Track ${id}`,
    artist: "Artist",
    album: "",
    duration: 180,
    durationLabel: "3:00",
    coverUrl: null,
    genre: "",
    tags: [],
    isPlayable: true,
    audioSrc: null,
    sourceType: "metadata",
    providerState: "backend",
    gradient: "",
    icon: "",
    liked: false,
    ...overrides,
  };
}

function feed(top: Track[], trending: Track[]): Pick<MetadataFeed, "top" | "trending"> {
  return { top, trending };
}

function adminTrack(id: number): AdminChartTrack {
  return { track: { id, title: `Track ${id}` }, play_count: id };
}

describe("popular chart presentation", () => {
  it("uses the server top order and removes unsafe entries without sorting", () => {
    const result = selectPopularTracks(feed([
      track("second"),
      track("blocked", { needsReview: true }),
      track("first"),
      track("offline", { isPlayable: false }),
    ], [track("legacy")]));

    expect(result.map((item) => item.id)).toEqual(["second", "first"]);
  });

  it("falls back to filtered trending tracks when top has no playable entries", () => {
    const result = selectPopularTracks(feed(
      [track("review", { needsReview: true })],
      [track("offline", { isPlayable: false }), track("legacy")],
    ));

    expect(result.map((item) => item.id)).toEqual(["legacy"]);
  });

  it("prefers explainable admin rankings and keeps legacy compatibility", () => {
    const chart = [adminTrack(2)];
    const legacy = [adminTrack(1)];

    expect(selectAdminChartTracks(chart, legacy)).toBe(chart);
    expect(selectAdminChartTracks([], legacy)).toBe(legacy);
  });

  it("formats bounded completion and skip ratios", () => {
    expect(formatChartPercent(0.734)).toBe("73%");
    expect(formatChartPercent(2)).toBe("100%");
    expect(formatChartPercent(-1)).toBe("0%");
    expect(formatChartPercent(null)).toBeNull();
  });
});
