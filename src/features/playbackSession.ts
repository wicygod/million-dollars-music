export type PlaybackEndReason = "ended" | "repeat" | "track_change" | "skip" | "stop" | "pagehide" | "error";

export interface PlaybackClassificationConfig {
  quickSkipSeconds: number;
  completedRatio: number;
  almostCompleteRemainingSeconds: number;
}

export const DEFAULT_PLAYBACK_CLASSIFICATION: Readonly<PlaybackClassificationConfig> = Object.freeze({
  quickSkipSeconds: 10,
  completedRatio: 0.9,
  almostCompleteRemainingSeconds: 5,
});

export interface PlaybackSessionStart {
  trackId: string | number;
  artistId?: string | number | null;
  trackDuration?: number | null;
  context?: string;
  recommendationType?: string | null;
  recommendationReason?: string | null;
  algorithmVersion?: string | null;
  playing?: boolean;
}

export interface PlaybackSessionSnapshot {
  eventId: string;
  trackId: string | number;
  artistId: string | number | null;
  startedAt: string;
  listenedSeconds: number;
  trackDuration: number | null;
  context: string;
  recommendationType: string | null;
  recommendationReason: string | null;
  algorithmVersion: string | null;
  playing: boolean;
}

export interface PlaybackSessionEvent {
  eventId: string;
  trackId: string | number;
  artistId: string | number | null;
  startedAt: string;
  listenedDuration: number;
  trackDuration: number | null;
  completionRatio: number | null;
  completed: boolean;
  skipped: boolean;
  context: string;
  recommendationType: string | null;
  recommendationReason: string | null;
  algorithmVersion: string | null;
  createdAt: string;
  endedReason: PlaybackEndReason;
}

export interface PlaybackClassification {
  completionRatio: number | null;
  completed: boolean;
  skipped: boolean;
}

export interface PlaybackSessionTrackerOptions {
  now?: () => number;
  createEventId?: () => string;
  classification?: Partial<PlaybackClassificationConfig>;
}

interface ActivePlaybackSession extends PlaybackSessionStart {
  eventId: string;
  startedAtMs: number;
  playedMilliseconds: number;
  playingSinceMs: number | null;
  artistId: string | number | null;
  trackDuration: number | null;
  context: string;
}

function createPlaybackEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `play-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function finiteNonNegative(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function validateClassification(config: PlaybackClassificationConfig): PlaybackClassificationConfig {
  if (!Number.isFinite(config.quickSkipSeconds) || config.quickSkipSeconds < 0) throw new RangeError("quickSkipSeconds must be non-negative");
  if (!Number.isFinite(config.completedRatio) || config.completedRatio < 0 || config.completedRatio > 1) throw new RangeError("completedRatio must be between 0 and 1");
  if (!Number.isFinite(config.almostCompleteRemainingSeconds) || config.almostCompleteRemainingSeconds < 0) throw new RangeError("almostCompleteRemainingSeconds must be non-negative");
  return config;
}

export function classifyPlayback(
  listenedSeconds: number,
  trackDuration: number | null,
  reason: PlaybackEndReason,
  config: PlaybackClassificationConfig = DEFAULT_PLAYBACK_CLASSIFICATION,
): PlaybackClassification {
  const listened = Math.max(0, Number.isFinite(listenedSeconds) ? listenedSeconds : 0);
  const duration = finiteNonNegative(trackDuration);
  const completionRatio = duration && duration > 0 ? Math.max(0, Math.min(1, listened / duration)) : null;
  const naturallyEnded = reason === "ended" || reason === "repeat";
  const almostComplete = duration !== null && duration > 0 && duration - listened <= config.almostCompleteRemainingSeconds;
  // `ended` also fires after seeking to the final seconds. For known-duration
  // tracks, only wall-clock listening time may produce a completion signal.
  // With unknown duration, a natural end is accepted only after a meaningful
  // amount of real playback rather than a one-second seek-to-end.
  const unknownDurationNaturalEnd = naturallyEnded
    && duration === null
    && listened >= Math.max(config.quickSkipSeconds, 30);
  const completed = unknownDurationNaturalEnd
    || almostComplete
    || (completionRatio !== null && completionRatio >= config.completedRatio);
  const skipIntent = reason === "skip" || reason === "track_change";
  const skipped = !completed && skipIntent && listened < config.quickSkipSeconds;
  return { completionRatio, completed, skipped };
}

export class PlaybackSessionTracker {
  private readonly now: () => number;
  private readonly createEventId: () => string;
  private readonly classification: PlaybackClassificationConfig;
  private active: ActivePlaybackSession | null = null;

  constructor(options: PlaybackSessionTrackerOptions = {}) {
    this.now = options.now || Date.now;
    this.createEventId = options.createEventId || createPlaybackEventId;
    this.classification = validateClassification({
      ...DEFAULT_PLAYBACK_CLASSIFICATION,
      ...options.classification,
    });
  }

  begin(input: PlaybackSessionStart): PlaybackSessionEvent | null {
    const previous = this.finalize("track_change");
    const now = this.now();
    this.active = {
      ...input,
      eventId: this.createEventId(),
      startedAtMs: now,
      playedMilliseconds: 0,
      playingSinceMs: input.playing === false ? null : now,
      artistId: input.artistId ?? null,
      trackDuration: finiteNonNegative(input.trackDuration),
      context: input.context?.trim() || "unknown",
      recommendationType: input.recommendationType?.trim() || null,
      recommendationReason: input.recommendationReason?.trim() || null,
      algorithmVersion: input.algorithmVersion?.trim() || null,
    };
    return previous;
  }

  pause(): PlaybackSessionSnapshot | null {
    this.captureElapsed();
    if (this.active) this.active.playingSinceMs = null;
    return this.snapshot();
  }

  resume(): PlaybackSessionSnapshot | null {
    if (this.active && this.active.playingSinceMs === null) this.active.playingSinceMs = this.now();
    return this.snapshot();
  }

  setTrackDuration(duration: number | null): void {
    if (this.active) this.active.trackDuration = finiteNonNegative(duration);
  }

  snapshot(): PlaybackSessionSnapshot | null {
    if (!this.active) return null;
    const playedMilliseconds = this.active.playedMilliseconds + (
      this.active.playingSinceMs === null ? 0 : Math.max(0, this.now() - this.active.playingSinceMs)
    );
    return {
      eventId: this.active.eventId,
      trackId: this.active.trackId,
      artistId: this.active.artistId,
      startedAt: new Date(this.active.startedAtMs).toISOString(),
      listenedSeconds: playedMilliseconds / 1000,
      trackDuration: this.active.trackDuration,
      context: this.active.context,
      recommendationType: this.active.recommendationType || null,
      recommendationReason: this.active.recommendationReason || null,
      algorithmVersion: this.active.algorithmVersion || null,
      playing: this.active.playingSinceMs !== null,
    };
  }

  finalize(reason: PlaybackEndReason): PlaybackSessionEvent | null {
    if (!this.active) return null;
    this.captureElapsed();
    const finished = this.active;
    this.active = null;
    const listenedSeconds = finished.playedMilliseconds / 1000;
    const classification = classifyPlayback(listenedSeconds, finished.trackDuration, reason, this.classification);
    return {
      eventId: finished.eventId,
      trackId: finished.trackId,
      artistId: finished.artistId,
      startedAt: new Date(finished.startedAtMs).toISOString(),
      listenedDuration: Math.max(0, Math.round(listenedSeconds)),
      trackDuration: finished.trackDuration === null ? null : Math.max(0, Math.round(finished.trackDuration)),
      completionRatio: classification.completionRatio === null ? null : Number(classification.completionRatio.toFixed(4)),
      completed: classification.completed,
      skipped: classification.skipped,
      context: finished.context,
      recommendationType: finished.recommendationType || null,
      recommendationReason: finished.recommendationReason || null,
      algorithmVersion: finished.algorithmVersion || null,
      createdAt: new Date(this.now()).toISOString(),
      endedReason: reason,
    };
  }

  restartForRepeat(): PlaybackSessionEvent | null {
    if (!this.active) return null;
    const next: PlaybackSessionStart = {
      trackId: this.active.trackId,
      artistId: this.active.artistId,
      trackDuration: this.active.trackDuration,
      context: this.active.context,
      recommendationType: this.active.recommendationType,
      recommendationReason: this.active.recommendationReason,
      algorithmVersion: this.active.algorithmVersion,
      playing: true,
    };
    const completed = this.finalize("repeat");
    this.begin(next);
    return completed;
  }

  reset(): void {
    this.active = null;
  }

  private captureElapsed(): void {
    if (!this.active || this.active.playingSinceMs === null) return;
    const now = this.now();
    this.active.playedMilliseconds += Math.max(0, now - this.active.playingSinceMs);
    this.active.playingSinceMs = now;
  }
}
