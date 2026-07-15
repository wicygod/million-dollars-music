import { describe, expect, it } from "vitest";

import { PlaybackSessionTracker, classifyPlayback } from "./playbackSession";

describe("playback session tracker", () => {
  it("counts only wall-clock time spent playing across pause and resume", () => {
    let now = 0;
    const tracker = new PlaybackSessionTracker({ now: () => now, createEventId: () => "event-0001" });
    tracker.begin({ trackId: 1, artistId: 2, trackDuration: 100, context: "home" });
    now = 5_000;
    tracker.pause();
    now = 25_000;
    tracker.resume();
    now = 30_000;

    const event = tracker.finalize("stop");

    expect(event).toMatchObject({
      eventId: "event-0001",
      listenedDuration: 10,
      completionRatio: 0.1,
      completed: false,
      skipped: false,
      context: "home",
    });
  });

  it("classifies an early track change as a quick skip", () => {
    expect(classifyPlayback(4, 180, "track_change")).toEqual({
      completionRatio: 4 / 180,
      completed: false,
      skipped: true,
    });
  });

  it("classifies threshold and almost-complete plays as completed", () => {
    expect(classifyPlayback(91, 100, "stop").completed).toBe(true);
    expect(classifyPlayback(177, 180, "track_change").completed).toBe(true);
    expect(classifyPlayback(177, 180, "track_change").skipped).toBe(false);
  });

  it("treats a natural end with unknown duration as completed", () => {
    expect(classifyPlayback(35, null, "ended")).toEqual({
      completionRatio: null,
      completed: true,
      skipped: false,
    });
  });

  it("does not reward seeking straight to the end", () => {
    expect(classifyPlayback(2, 180, "ended")).toEqual({
      completionRatio: 2 / 180,
      completed: false,
      skipped: false,
    });
  });

  it("creates a fresh idempotency key for every repeat", () => {
    let now = 0;
    let id = 0;
    const tracker = new PlaybackSessionTracker({
      now: () => now,
      createEventId: () => `event-000${++id}`,
    });
    tracker.begin({ trackId: 7, trackDuration: 2, context: "playlist" });
    now = 2_000;
    const first = tracker.restartForRepeat();
    now = 3_000;
    const second = tracker.finalize("stop");

    expect(first).toMatchObject({ eventId: "event-0001", completed: true, endedReason: "repeat" });
    expect(second).toMatchObject({ eventId: "event-0002", listenedDuration: 1 });
  });

  it("finalizes a session only once", () => {
    const tracker = new PlaybackSessionTracker({ now: () => 0, createEventId: () => "event-once" });
    tracker.begin({ trackId: 1, playing: false });

    expect(tracker.finalize("pagehide")?.eventId).toBe("event-once");
    expect(tracker.finalize("pagehide")).toBeNull();
  });
});
