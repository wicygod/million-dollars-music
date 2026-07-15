import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getOnboardingArtists,
  mapBackendFeed,
  mapBackendTrack,
  resolveBackendImageUrl,
  saveMusicPreferences,
  submitPlaybackEvent,
} from "./musicApi";

function installStorage(): void {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

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

describe("personalization API contracts", () => {
  it("normalizes paged onboarding artists and keeps query bounded", async () => {
    installStorage();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      items: [{
        id: 9,
        name: "Artist",
        avatarUrl: "/static/artists/9.webp",
        genres: ["pop", "pop"],
        popularityScore: 12.5,
        trackCount: 4,
        selected: true,
      }],
      total: 30,
      page: 2,
      limit: 24,
      hasMore: true,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getOnboardingArtists({ search: " Artist ", page: 2, limit: 999 });

    expect(result.items[0]).toMatchObject({
      id: 9,
      avatarUrl: "http://5.181.21.13:8000/static/artists/9.webp",
      genres: ["pop"],
      selected: true,
    });
    expect(result.hasMore).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain("search=Artist&page=2&limit=100");
  });

  it("deduplicates artist ids and sends the documented artistIds alias", async () => {
    installStorage();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      completedAt: "2026-07-15T10:00:00Z",
      selectedArtistIds: [3, 7],
      items: [],
    }));
    vi.stubGlobal("fetch", fetchMock);

    await saveMusicPreferences([3, "3", 7]);

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({ artistIds: [3, 7], source: "onboarding" });
  });

  it("serializes a playback event using backend camelCase aliases", async () => {
    installStorage();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    await submitPlaybackEvent({
      eventId: "play-event-0001",
      trackId: "42",
      artistId: "7",
      startedAt: "2026-07-15T10:00:00.000Z",
      listenedDuration: 74.6,
      trackDuration: 100,
      completionRatio: 0.746,
      completed: false,
      skipped: false,
      context: "home",
      recommendationType: null,
      recommendationReason: null,
      algorithmVersion: null,
      createdAt: "2026-07-15T10:01:15.000Z",
      endedReason: "track_change",
    }, { keepalive: true });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      eventId: "play-event-0001",
      trackId: 42,
      artistId: 7,
      startedAt: "2026-07-15T10:00:00.000Z",
      listenedDuration: 75,
      trackDuration: 100,
      completionRatio: 0.746,
      completed: false,
      skipped: false,
      context: "home",
      recommendationType: null,
      recommendationReason: null,
      algorithmVersion: null,
    });
    expect(request.keepalive).toBe(true);
  });

  it("maps optional recommendation metadata without breaking legacy feed fields", () => {
    const feed = mapBackendFeed({
      personalized: [{
        track: {
          id: 5,
          title: "For you",
          artist: "Artist",
          source_url: "https://example.com/track",
        },
        recommendation_type: "similar_artist",
        reason: "Похож на выбранных артистов",
        algorithm_version: "personalized-v1",
      }],
      personalization_active: true,
    });

    expect(feed.personalized?.[0]).toMatchObject({
      id: "5",
      recommendationType: "similar_artist",
      algorithmVersion: "personalized-v1",
      recommendationPosition: 0,
    });
    expect(feed.all[0]).toBe(feed.personalized?.[0]);
    expect(feed.personalizationActive).toBe(true);
    expect(feed.trending).toEqual([]);
  });

  it("preserves recommendation metadata when the same track is also recent", () => {
    const baseTrack = {
      id: 9,
      title: "Shared track",
      artist: "Artist",
      source_url: "https://example.com/shared-track",
    };
    const feed = mapBackendFeed({
      recent: [baseTrack],
      personalized: [{
        track: baseTrack,
        recommendation_type: "similar",
        reason: "Evidence-based match",
        algorithm_version: "personalized-v2",
      }],
      personalization_active: true,
    });

    expect(feed.all[0]).toMatchObject({
      id: "9",
      recommendationType: "similar",
      recommendationReason: "Evidence-based match",
      algorithmVersion: "personalized-v2",
      recommendationPosition: 0,
    });
  });

  it("allows only safe account image URL forms", () => {
    expect(resolveBackendImageUrl("/static/avatar.webp")).toBe("http://5.181.21.13:8000/static/avatar.webp");
    expect(resolveBackendImageUrl("https://cdn.example/avatar.jpg")).toBe("https://cdn.example/avatar.jpg");
    expect(resolveBackendImageUrl("javascript:alert(1)")).toBeNull();
    expect(resolveBackendImageUrl("data:image/svg+xml,<svg onload=alert(1) />")).toBeNull();
  });
});
