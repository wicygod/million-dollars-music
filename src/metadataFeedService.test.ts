import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getHomeFeedCacheKey,
  getInitialMetadataFeed,
  invalidateHomeFeedCache,
  type MetadataFeed,
  type Track,
} from "./metadataFeedService";

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

function cachedFeed(track: Track): MetadataFeed {
  return {
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
}

function installCachedFeed(track: Track, accountId: string | number | null = null): Map<string, string> {
  const values = new Map<string, string>();
  values.set(getHomeFeedCacheKey(accountId), JSON.stringify(cachedFeed(track)));
  if (accountId !== null) values.set("mm_auth_user", JSON.stringify({ id: accountId }));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  return values;
}

function installAccountFeeds(entries: Array<[string | number, MetadataFeed]>, activeAccount: string | number): Map<string, string> {
  const values = new Map<string, string>();
  entries.forEach(([accountId, feed]) => values.set(getHomeFeedCacheKey(accountId), JSON.stringify(feed)));
  values.set("mm_auth_user", JSON.stringify({ id: activeAccount }));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  return values;
}

/* The cache fixture intentionally mirrors the public feed shape. */
function legacyInstallCachedFeed(track: Track): void {
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
    getItem: (key: string) => key === getHomeFeedCacheKey(null) ? JSON.stringify(feed) : null,
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("cached metadata playback", () => {
  it("keeps ticketed backend tracks playable without a direct audioSrc", () => {
    legacyInstallCachedFeed(cachedTrack);

    const feed = getInitialMetadataFeed();

    expect(feed.all[0].isPlayable).toBe(true);
    expect(feed.all[0].sourceUrl).toContain("/api/stream/track/42");
    expect(feed.trending[0]).toBe(feed.all[0]);
  });

  it("does not promote a deliberately unavailable cached track", () => {
    legacyInstallCachedFeed({ ...cachedTrack, isPlayable: false });

    expect(getInitialMetadataFeed().all[0].isPlayable).toBe(false);
  });

  it("isolates personalized feed caches by the active account", () => {
    const firstTrack = { ...cachedTrack, id: "user-1", title: "First account" };
    const secondTrack = { ...cachedTrack, id: "user-2", title: "Second account" };
    const values = installAccountFeeds([
      [1, cachedFeed(firstTrack)],
      [2, cachedFeed(secondTrack)],
    ], 1);

    expect(getInitialMetadataFeed().all[0].id).toBe("user-1");
    values.set("mm_auth_user", JSON.stringify({ id: 2 }));
    expect(getInitialMetadataFeed().all[0].id).toBe("user-2");
    expect(getHomeFeedCacheKey(1)).not.toBe(getHomeFeedCacheKey(2));
  });

  it("keeps optional personalized collections linked to normalized cached tracks", () => {
    const feed = cachedFeed(cachedTrack);
    feed.personalized = [{ ...cachedTrack, recommendationType: "selected_artist" }];
    const values = installCachedFeed(cachedTrack, 42);
    values.set(getHomeFeedCacheKey(42), JSON.stringify(feed));

    const restored = getInitialMetadataFeed();

    expect(restored.personalized?.[0]).toBe(restored.all[0]);
    expect(restored.personalized?.[0].providerState).toBe("cache");
  });

  it("invalidates only the requested account cache", () => {
    const values = installAccountFeeds([
      [1, cachedFeed(cachedTrack)],
      [2, cachedFeed({ ...cachedTrack, id: "other" })],
    ], 1);

    invalidateHomeFeedCache(1);

    expect(values.has(getHomeFeedCacheKey(1))).toBe(false);
    expect(values.has(getHomeFeedCacheKey(2))).toBe(true);
  });
});
