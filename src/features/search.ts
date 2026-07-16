import type { Track } from "../metadataFeedService";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]!));
}

export function filterLocalSearchTracks(items: Track[], normalizedQuery: string): Track[] {
  const matches = items.filter((track) =>
    track.title.toLowerCase().includes(normalizedQuery)
    || track.artist.toLowerCase().includes(normalizedQuery)
    || track.album.toLowerCase().includes(normalizedQuery)
    || track.genre.includes(normalizedQuery)
    || track.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
  );
  return rankSearchTracks(matches, normalizedQuery);
}

function normalizeSearchText(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function searchTier(track: Track, query: string): number {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedTitle = normalizeSearchText(track.title);
  const normalizedArtist = normalizeSearchText(track.artist);
  const titleWithoutArtist = normalizeSearchText(track.title.replace(/^.+?\s[-–—]\s/, ""));
  const tokens = normalizedQuery.split(" ").filter((token) => token.length > 1);
  const includesAll = (text: string) => tokens.length > 0 && tokens.every((token) => text.includes(token));

  if (normalizedTitle === normalizedQuery) return 0;
  if (titleWithoutArtist !== normalizedTitle && titleWithoutArtist === normalizedQuery) return 1;
  if (normalizedArtist === normalizedQuery) return 2;
  if (includesAll(normalizedTitle)) return 3;
  if (includesAll(normalizedArtist)) return 4;
  if (includesAll(`${normalizedArtist} ${normalizedTitle}`)) return 5;
  return 6;
}

export function rankSearchTracks(items: Track[], query: string): Track[] {
  return [...items]
    .map((track, index) => ({ track, index, tier: searchTier(track, query) }))
    .sort((left, right) => left.tier - right.tier || left.index - right.index)
    .map(({ track }) => track);
}

export function highlightMatch(text: string, query: string): string {
  if (!query) return escapeHtml(text);
  const index = text.toLowerCase().indexOf(query);
  if (index === -1) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, index))}<span class="text-indigo-400">${escapeHtml(text.slice(index, index + query.length))}</span>${escapeHtml(text.slice(index + query.length))}`;
}

export function searchResultsSignature(items: Track[]): string {
  return items.map((t) => [
    t.id,
    t.title,
    t.artist,
    t.coverUrl ?? "",
    t.isPlayable ? "1" : "0",
    t.audioSrc ?? "",
    t.sourceUrl ?? "",
  ].join("\x00")).join("\n");
}
