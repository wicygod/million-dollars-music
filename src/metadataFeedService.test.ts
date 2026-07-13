import { afterEach, describe, expect, it, vi } from "vitest";

import { getInitialMetadataFeed, type MetadataFeed, type Track } from "./metadataFeedService";

const cachedTrack: Track = {
  id: "42",
  title: "Cached server track",
  artist: "Server artist",
  album: "Catalog",
  duration: 180,
  durationLabel: "3:00",
  coverUrl: null,
  genre: "catalog",
  tags: [],
  sourceUrl: "http://5.181.21.13:8000/api/stream/track/42",
  isPlayable: true,
  audioSrc: null,
  sourceType: "metadata",
  providerState: "backend",
  gradient: "from-slate-600 to-zinc-950",
  icon: "♪",
  liked: false,
};

function installCachedFeed(track: Track): void {
  const feed: MetadataFeed = {
    recent: [],
    random: [track],
    trending: [track],
    top: [track],
    mood: [track],
    ru: [],
    global: [track],
    all: [track],
    source: "backend",
    loadedAt: Date.now(),
  };
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => key === "mm_metadata_feed_cache_v3" ? JSON.stringify(feed) : null,
    setItem: vi.fn(),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("cached metadata playback", () => {
  it("keeps ticketed backend tracks playable without a direct audioSrc", () => {
    installCachedFeed(cachedTrack);

    const feed = getInitialMetadataFeed();

    expect(feed.all[0].isPlayable).toBe(true);
    expect(feed.all[0].sourceUrl).toContain("/api/stream/track/42");
    expect(feed.trending[0]).toBe(feed.all[0]);
  });

  it("does not promote a deliberately unavailable cached track", () => {
    installCachedFeed({ ...cachedTrack, isPlayable: false });

    expect(getInitialMetadataFeed().all[0].isPlayable).toBe(false);
  });
});
