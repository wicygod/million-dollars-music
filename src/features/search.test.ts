import { describe, expect, it } from "vitest";
import type { Track } from "../metadataFeedService";
import { rankSearchTracks, searchResultsSignature } from "./search";

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

describe("searchResultsSignature", () => {
  it("returns identical signature for identical results", () => {
    const items = [track("1"), track("2")];
    expect(searchResultsSignature(items)).toBe(searchResultsSignature(items));
  });

  it("changes when a track ID differs at the same count", () => {
    const a = [track("1"), track("2")];
    const b = [track("1"), track("3")];
    expect(searchResultsSignature(a)).not.toBe(searchResultsSignature(b));
  });

  it("changes when track order is swapped", () => {
    const a = [track("1"), track("2")];
    const b = [track("2"), track("1")];
    expect(searchResultsSignature(a)).not.toBe(searchResultsSignature(b));
  });

  it("changes when title is updated", () => {
    const a = [track("1", { title: "Old Title" })];
    const b = [track("1", { title: "New Title" })];
    expect(searchResultsSignature(a)).not.toBe(searchResultsSignature(b));
  });

  it("changes when artist is updated", () => {
    const a = [track("1", { artist: "Old Artist" })];
    const b = [track("1", { artist: "New Artist" })];
    expect(searchResultsSignature(a)).not.toBe(searchResultsSignature(b));
  });

  it("changes when coverUrl is updated", () => {
    const a = [track("1", { coverUrl: null })];
    const b = [track("1", { coverUrl: "https://example.com/cover.jpg" })];
    expect(searchResultsSignature(a)).not.toBe(searchResultsSignature(b));
  });

  it("changes when a hydrated result becomes playable", () => {
    const a = [track("1", { isPlayable: false, sourceUrl: undefined })];
    const b = [track("1", { isPlayable: true, sourceUrl: "https://soundcloud.com/a/track" })];
    expect(searchResultsSignature(a)).not.toBe(searchResultsSignature(b));
  });
});

describe("rankSearchTracks", () => {
  it("puts an exact song title above tracks by an exactly named artist", () => {
    const artistMatch = track("artist", { title: "Unrelated", artist: "Trinity" });
    const titleMatch = track("title", { title: "Trinity", artist: "Small Artist" });

    expect(rankSearchTracks([artistMatch, titleMatch], "Trinity")).toEqual([titleMatch, artistMatch]);
  });

  it("recognizes an exact title after an artist prefix", () => {
    const partial = track("partial", { title: "All I Need Remix", artist: "Other" });
    const prefixed = track("exact", { title: "Clams Casino - All I Need", artist: "Clams Casino" });

    expect(rankSearchTracks([partial, prefixed], "All I Need")[0]).toBe(prefixed);
  });
});
