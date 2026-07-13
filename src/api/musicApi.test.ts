import { describe, expect, it } from "vitest";

import { mapBackendTrack } from "./musicApi";

describe("backend track playback compatibility", () => {
  it("accepts a valid source when an older backend omits is_playable", () => {
    const track = mapBackendTrack({
      id: 7,
      title: "Legacy payload",
      artist: "Catalog artist",
      source_url: "https://soundcloud.com/example/legacy-payload",
    });

    expect(track.isPlayable).toBe(true);
    expect(track.sourceUrl).toContain("/api/stream/track/7");
  });

  it("honors an explicit unavailable flag", () => {
    const track = mapBackendTrack({
      id: 8,
      title: "Unavailable",
      artist: "Catalog artist",
      source_url: "https://soundcloud.com/example/unavailable",
      is_playable: false,
    });

    expect(track.isPlayable).toBe(false);
    expect(track.sourceUrl).toBeUndefined();
  });
});
