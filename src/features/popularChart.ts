import type { MetadataFeed, Track } from "../metadataFeedService";

export interface AdminTrackReference {
  id: number;
  title: string;
  artists?: Array<{ name: string }>;
}

export interface AdminChartTrack {
  track: AdminTrackReference;
  position?: number;
  score?: number;
  algorithm_version?: string;
  provider_score?: number;
  provider_signal_reliable?: boolean;
  artist_followers?: number;
  artist_verified?: boolean;
  unique_listeners?: number;
  play_count: number;
  repeat_plays?: number;
  recent_plays?: number;
  completion_rate?: number | null;
  skip_rate?: number | null;
  favorite_count?: number;
  playlist_add_count?: number;
}

function eligiblePopularTracks(items: Track[] | undefined): Track[] {
  return (items || []).filter((track) => track.isPlayable && !track.needsReview);
}

/**
 * The backend owns chart order. The client only removes entries that cannot be
 * played safely and falls back to the legacy collection for older servers.
 */
export function selectPopularTracks(
  feed: Pick<MetadataFeed, "top" | "trending">,
): Track[] {
  const top = eligiblePopularTracks(feed.top);
  return top.length ? top : eligiblePopularTracks(feed.trending);
}

export function selectAdminChartTracks(
  chartTracks: AdminChartTrack[] | undefined,
  legacyTracks: AdminChartTrack[] | undefined,
): AdminChartTrack[] {
  return chartTracks?.length ? chartTracks : legacyTracks || [];
}

export function formatChartPercent(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const normalized = Math.max(0, Math.min(1, value));
  return `${Math.round(normalized * 100)}%`;
}
