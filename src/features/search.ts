import type { Track } from "../metadataFeedService";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]!));
}

export function filterLocalSearchTracks(items: Track[], normalizedQuery: string): Track[] {
  return items.filter((track) =>
    track.title.toLowerCase().includes(normalizedQuery)
    || track.artist.toLowerCase().includes(normalizedQuery)
    || track.album.toLowerCase().includes(normalizedQuery)
    || track.genre.includes(normalizedQuery)
    || track.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
  );
}

export function highlightMatch(text: string, query: string): string {
  if (!query) return escapeHtml(text);
  const index = text.toLowerCase().indexOf(query);
  if (index === -1) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, index))}<span class="text-indigo-400">${escapeHtml(text.slice(index, index + query.length))}</span>${escapeHtml(text.slice(index + query.length))}`;
}
