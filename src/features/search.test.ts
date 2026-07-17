import { describe, expect, it } from "vitest";
import type { Track } from "../metadataFeedService";
import {
  compactSearchText,
  filterLocalSearchTracks,
  isExactArtistSearch,
  normalizeSearchText,
  prepareSearchTracks,
  rankSearchTracks,
  sanitizeSearchQuery,
  searchResultsSignature,
} from "./search";

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

  it("changes when hydrated duration or review metadata changes", () => {
    const a = [track("1", { duration: 0, durationLabel: "0:00", needsReview: true })];
    const b = [track("1", { duration: 180, durationLabel: "3:00", needsReview: false })];
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

  it("treats an exact title and an artist-prefixed exact title as the same relevance tier", () => {
    const fakeExact = track("fake", {
      title: "All I Need",
      artist: "Reupload account",
      duration: 0,
      needsReview: true,
    });
    const officialPrefixed = track("official", {
      title: "Clams Casino - All I Need",
      artist: "Clams Casino",
      duration: 244,
      qualityScore: 95,
    });

    expect(rankSearchTracks([fakeExact, officialPrefixed], "All I Need")[0]).toBe(officialPrefixed);
  });

  it("uses catalog authority and popularity to break equal textual matches", () => {
    const obscureReupload = track("fake", {
      title: "All I Need",
      artist: "Upload Account",
      duration: 204,
      popularityScore: 2,
      artistAuthorityScore: 0,
    });
    const original = track("official", {
      title: "Clams Casino - All I Need",
      artist: "Clams Casino",
      duration: 204,
      popularityScore: 120_000,
      artistAuthorityScore: 8,
    });

    expect(rankSearchTracks([obscureReupload, original], "All I Need")[0]).toBe(original);
  });

  it("prefers a complete original over a zero-duration title-shaped placeholder", () => {
    const placeholder = track("placeholder", {
      title: "Миллионер из трущоб",
      artist: "Миллионер из трущоб",
      duration: 0,
    });
    const original = track("original", {
      title: "Миллионер из трущоб",
      artist: "Tuborosho, wx",
      duration: 86,
      qualityScore: 100,
    });

    expect(rankSearchTracks([placeholder, original], "Миллионер из трущоб")[0]).toBe(original);
  });

  it("keeps a clean exact recording above an exact-title remix", () => {
    const remix = track("remix", {
      title: "Trinity",
      artist: "Remix account",
      duration: 180,
      tags: ["remix"],
    });
    const original = track("original", {
      title: "Trinity",
      artist: "Eartheater",
      duration: 180,
    });

    remix.title = "Trinity remix";
    expect(rankSearchTracks([remix, original], "Trinity")[0]).toBe(original);
  });

  it("ranks an exact album match above a loose metadata match", () => {
    const loose = track("loose", { title: "Album memories", album: "Other" });
    const album = track("album", { title: "Opening", album: "Album" });
    expect(rankSearchTracks([loose, album], "Album")[0]).toBe(album);
  });

  it("recognizes a small typo in a sufficiently long title token", () => {
    const result = track("typo", { title: "Millionaire", artist: "Artist" });
    expect(filterLocalSearchTracks([result], "Milionaire")).toEqual([result]);
  });

  it("recognizes an adjacent transposition in a saved result", () => {
    const result = track("transpose", { title: "Clams Casino", artist: "Artist" });
    expect(filterLocalSearchTracks([result], "Calms Casino")).toEqual([result]);
  });

  it("recognizes Cyrillic variant labels in the title when preferring an original recording", () => {
    const variant = track("variant", { title: "Тишина ремикс", qualityScore: 90 });
    const original = track("original", { title: "Тишина", qualityScore: 70 });
    expect(rankSearchTracks([variant, original], "Тишина")[0]).toBe(original);
  });
});

describe("search normalization and preparation", () => {
  it("normalizes whitespace, punctuation and ё consistently", () => {
    expect(sanitizeSearchQuery("  Ёлка   — песня  ")).toBe("Ёлка — песня");
    expect(normalizeSearchText("  Ёлка   — песня! ")).toBe("елка песня");
    expect(normalizeSearchText("---")).toBe("");
    expect(compactSearchText("M.I.A.")).toBe("mia");
  });

  it("keeps punctuation-insensitive backend matches on the client", () => {
    const mia = track("mia", { title: "Paper Planes", artist: "M.I.A." });
    const apostrophe = track("apostrophe", { title: "Don't", artist: "Example" });

    expect(prepareSearchTracks([mia], "MIA")).toEqual([mia]);
    expect(prepareSearchTracks([mia], "MIA Paper Planes")).toEqual([mia]);
    expect(prepareSearchTracks([apostrophe], "dont")).toEqual([apostrophe]);
    expect(isExactArtistSearch("M.I.A.", "MIA")).toBe(true);
  });

  it("finds saved results case-insensitively in genres", () => {
    const genre = track("genre", { genre: "Hip-Hop", tags: ["Русский Рэп"] });
    expect(filterLocalSearchTracks([genre], "HIP hop")).toEqual([genre]);
  });

  it("does not treat historically polluted provider tags as query relevance", () => {
    const polluted = track("polluted", { title: "Unrelated", artist: "Other", tags: ["All I Need"] });
    expect(filterLocalSearchTracks([polluted], "All I Need")).toEqual([]);
  });

  it("suppresses a zero-duration title-shaped placeholder when a credible original exists", () => {
    const placeholder = track("placeholder", {
      title: "Миллионер из трущоб",
      artist: "Миллионер из трущоб",
      duration: 0,
    });
    const original = track("original", {
      title: "Миллионер из трущоб",
      artist: "Tuborosho, wx",
      duration: 86,
    });
    expect(prepareSearchTracks([placeholder, original], "Миллионер из трущоб")).toEqual([original]);
  });

  it("suppresses a placeholder when the credible match uses an artist-prefixed title", () => {
    const placeholder = track("placeholder", {
      title: "All I Need",
      artist: "All I Need",
      duration: 0,
    });
    const official = track("official", {
      title: "Clams Casino - All I Need",
      artist: "Clams Casino",
      duration: 244,
    });
    expect(prepareSearchTracks([placeholder, official], "All I Need")).toEqual([official]);
  });

  it("deduplicates the same recording but keeps the same title by another artist", () => {
    const first = track("first", { title: "Home", artist: "Artist A", duration: 180 });
    const duplicate = track("duplicate", { title: "Home", artist: "Artist A", duration: 182 });
    const namesake = track("namesake", { title: "Home", artist: "Artist B", duration: 180 });

    expect(prepareSearchTracks([first, duplicate, namesake], "Home")).toEqual([first, namesake]);
  });

  it("keeps unmatched authoritative candidates when explicitly requested", () => {
    const serverCandidate = track("server", { title: "Provider result" });
    expect(prepareSearchTracks([serverCandidate], "Different query")).toEqual([]);
    expect(prepareSearchTracks([serverCandidate], "Different query", { includeUnmatched: true })).toEqual([serverCandidate]);
  });

  it("only accepts an exact normalized artist for the artist card", () => {
    expect(isExactArtistSearch("Kai Angel", "  kai   angel ")).toBe(true);
    expect(isExactArtistSearch("Kai Angel & 9mice", "Kai Angel")).toBe(false);
  });
});
