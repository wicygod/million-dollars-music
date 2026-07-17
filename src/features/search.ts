import type { Track } from "../metadataFeedService";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]!));
}

export const MAX_SEARCH_QUERY_LENGTH = 128;

export function sanitizeSearchQuery(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEARCH_QUERY_LENGTH)
    .trim();
}

export function normalizeSearchText(value: string): string {
  return sanitizeSearchQuery(value)
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactSearchText(value: string): string {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function editDistanceWithin(left: string, right: string, maximum: number): number {
  const leftChars = [...left];
  const rightChars = [...right];
  if (Math.abs(leftChars.length - rightChars.length) > maximum) return maximum + 1;
  let previousPrevious: number[] | null = null;
  let previous = rightChars.map((_, index) => index + 1);
  previous.unshift(0);
  for (let leftIndex = 1; leftIndex <= leftChars.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = leftIndex;
    for (let rightIndex = 1; rightIndex <= rightChars.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1] + (leftChars[leftIndex - 1] === rightChars[rightIndex - 1] ? 0 : 1);
      let value = Math.min(previous[rightIndex] + 1, current[rightIndex - 1] + 1, substitution);
      if (
        previousPrevious
        && leftIndex > 1
        && rightIndex > 1
        && leftChars[leftIndex - 1] === rightChars[rightIndex - 2]
        && leftChars[leftIndex - 2] === rightChars[rightIndex - 1]
      ) {
        value = Math.min(value, previousPrevious[rightIndex - 2] + 1);
      }
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > maximum) return maximum + 1;
    previousPrevious = previous;
    previous = current;
  }
  return previous[rightChars.length];
}

function fuzzyTokenMatch(queryToken: string, candidateToken: string): boolean {
  if (candidateToken.includes(queryToken) || queryToken.includes(candidateToken)) return true;
  const shortest = Math.min(queryToken.length, candidateToken.length);
  if (shortest < 4) return false;
  const maximum = shortest >= 8 ? 2 : 1;
  return editDistanceWithin(queryToken, candidateToken, maximum) <= maximum;
}

function includesAllTokens(text: string, tokens: string[]): boolean {
  return tokens.length > 0 && tokens.every((token) => text.includes(token));
}

function fuzzilyIncludesAllTokens(text: string, tokens: string[]): boolean {
  const candidateTokens = text.split(" ").filter(Boolean);
  return tokens.length > 0
    && tokens.every((token) => candidateTokens.some((candidate) => fuzzyTokenMatch(token, candidate)));
}

function searchTier(track: Track, query: string): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 99;
  const compactQuery = compactSearchText(query);
  const normalizedTitle = normalizeSearchText(track.title);
  const normalizedArtist = normalizeSearchText(track.artist);
  const normalizedAlbum = normalizeSearchText(track.album);
  const normalizedGenre = normalizeSearchText(track.genre);
  const titleWithoutArtist = normalizeSearchText(track.title.replace(/^.+?\s[-–—]\s/, ""));
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const combined = `${normalizedArtist} ${normalizedTitle} ${normalizedAlbum} ${normalizedGenre}`;

  const compactMatches = (value: string) => (
    compactQuery.length >= 3 && compactSearchText(value) === compactQuery
  );
  if (normalizedTitle === normalizedQuery || compactMatches(track.title)) return 0;
  if (
    titleWithoutArtist !== normalizedTitle
    && (titleWithoutArtist === normalizedQuery || compactMatches(titleWithoutArtist))
  ) return 0;
  if (normalizedArtist === normalizedQuery || compactMatches(track.artist)) return 2;
  if (normalizedAlbum === normalizedQuery || compactMatches(track.album)) return 3;
  if (normalizedTitle.startsWith(normalizedQuery)) return 4;
  if (normalizedArtist.startsWith(normalizedQuery)) return 5;
  if (normalizedAlbum.startsWith(normalizedQuery)) return 6;
  if (includesAllTokens(normalizedTitle, tokens)) return 7;
  if (includesAllTokens(normalizedArtist, tokens)) return 8;
  if (includesAllTokens(normalizedAlbum, tokens)) return 9;
  if (includesAllTokens(combined, tokens)) return 10;
  if (compactQuery.length >= 3 && compactSearchText(combined).includes(compactQuery)) return 10;
  if (fuzzilyIncludesAllTokens(normalizedTitle, tokens)) return 11;
  if (fuzzilyIncludesAllTokens(normalizedArtist, tokens)) return 12;
  if (fuzzilyIncludesAllTokens(normalizedAlbum, tokens)) return 13;
  if (fuzzilyIncludesAllTokens(combined, tokens)) return 14;
  return 99;
}

const SEARCH_VARIANT_PATTERN = /(?:^|\s)(?:slowed|reverb|sped\s*up|speed\s*up|nightcore|remix|edit|bootleg|mashup|bass\s*boost(?:ed)?|instrumental|karaoke|cover|version|ремикс|кавер|версия|инструментал|караоке|ускоренн\p{L}*|замедленн\p{L}*)(?:$|\s)/iu;

function searchOriginalityKey(track: Track, query: string): number[] {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedTitle = normalizeSearchText(track.title);
  const normalizedArtist = normalizeSearchText(track.artist);
  const variantText = normalizeSearchText(track.title);
  const suspiciousIdentity = normalizedTitle === normalizedQuery
    && normalizedArtist === normalizedQuery
    && track.duration < 30;
  const durationRank = track.duration >= 30 ? 0 : track.duration > 0 ? 1 : 2;
  return [
    suspiciousIdentity ? 1 : 0,
    SEARCH_VARIANT_PATTERN.test(variantText) ? 1 : 0,
    track.needsReview ? 1 : 0,
    track.isPlayable ? 0 : 1,
    durationRank,
    -(track.artistAuthorityScore || 0),
    -(track.popularityScore || 0),
    -(track.qualityScore || 0),
  ];
}

function compareNumberKeys(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export interface PrepareSearchTracksOptions {
  includeUnmatched?: boolean;
  limit?: number;
}

export function prepareSearchTracks(
  items: Track[],
  query: string,
  options: PrepareSearchTracksOptions = {},
): Track[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  const ranked = [...items]
    .map((track, index) => ({
      track,
      index,
      tier: searchTier(track, query),
      originality: searchOriginalityKey(track, query),
    }))
    .filter((entry) => options.includeUnmatched || entry.tier < 99)
    .sort((left, right) => (
      left.tier - right.tier
      || compareNumberKeys(left.originality, right.originality)
      || left.index - right.index
    ));

  const hasCrediblePrimaryMatch = ranked
    .some(({ track, tier }) => (
      tier <= 1
      && normalizeSearchText(track.artist) !== normalizedQuery
      && track.duration >= 30
      && !track.needsReview
    ));
  const seenIds = new Set<string>();
  const seenRecordings = new Set<string>();
  const prepared: Track[] = [];
  for (const { track } of ranked) {
    const normalizedTitle = normalizeSearchText(track.title);
    const normalizedArtist = normalizeSearchText(track.artist);
    const isPlaceholder = normalizedTitle === normalizedQuery
      && normalizedArtist === normalizedQuery
      && track.duration < 30
      && hasCrediblePrimaryMatch;
    if (isPlaceholder) continue;
    const id = String(track.id);
    const recordingKey = `${normalizedTitle}\x00${normalizedArtist}`;
    if (seenIds.has(id) || seenRecordings.has(recordingKey)) continue;
    seenIds.add(id);
    seenRecordings.add(recordingKey);
    prepared.push(track);
    if (options.limit && prepared.length >= options.limit) break;
  }
  return prepared;
}

export function filterLocalSearchTracks(items: Track[], query: string): Track[] {
  return prepareSearchTracks(items, query);
}

export function rankSearchTracks(items: Track[], query: string): Track[] {
  return prepareSearchTracks(items, query, { includeUnmatched: true });
}

export function isExactArtistSearch(artistName: string, query: string): boolean {
  const normalizedArtist = normalizeSearchText(artistName);
  const normalizedQuery = normalizeSearchText(query);
  const compactQuery = compactSearchText(query);
  return Boolean(
    normalizedQuery
    && (
      normalizedArtist === normalizedQuery
      || (compactQuery.length >= 3 && compactSearchText(artistName) === compactQuery)
    )
  );
}

export function highlightMatch(text: string, query: string): string {
  const cleanQuery = sanitizeSearchQuery(query);
  if (!cleanQuery) return escapeHtml(text);
  const index = text.toLocaleLowerCase("ru-RU").indexOf(cleanQuery.toLocaleLowerCase("ru-RU"));
  if (index === -1) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, index))}<span class="text-indigo-400">${escapeHtml(text.slice(index, index + cleanQuery.length))}</span>${escapeHtml(text.slice(index + cleanQuery.length))}`;
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
    t.album,
    String(t.duration),
    t.durationLabel,
    t.genre,
    t.tags.join(","),
    String(t.qualityScore ?? ""),
    String(t.popularityScore ?? ""),
    String(t.artistAuthorityScore ?? ""),
    t.needsReview ? "1" : "0",
  ].join("\x00")).join("\n");
}
