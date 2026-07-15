import { describe, expect, it } from "vitest";

import {
  artistSelectionShortfall,
  beginArtistPageLoad,
  canContinueArtistOnboarding,
  createArtistOnboardingState,
  failArtistPageLoad,
  isArtistSelected,
  mergeArtistPage,
  normalizeArtistSearch,
  selectedArtistIds,
  setArtistSearch,
  toggleArtistSelection,
} from "./artistOnboarding";

interface TestArtist {
  id: number;
  name: string;
  selected?: boolean;
  genre?: string;
}

describe("artist onboarding state", () => {
  it("tracks the configurable minimum without mutating earlier state", () => {
    const initial = createArtistOnboardingState<TestArtist>({ minimumSelection: 3 });
    const first = toggleArtistSelection(initial, 1);
    const second = toggleArtistSelection(first, 2);
    const ready = toggleArtistSelection(second, 3);

    expect(initial.selectedIds.size).toBe(0);
    expect(artistSelectionShortfall(second)).toBe(1);
    expect(canContinueArtistOnboarding(second)).toBe(false);
    expect(canContinueArtistOnboarding(ready)).toBe(true);
    expect(selectedArtistIds(ready)).toEqual(["1", "2", "3"]);
  });

  it("hydrates selected artists and allows unselecting them", () => {
    const state = createArtistOnboardingState<TestArtist>({
      items: [{ id: 7, name: "Selected", selected: true }],
      selectedIds: [8, 8],
      minimumSelection: 0,
    });

    expect(isArtistSelected(state, 7)).toBe(true);
    expect(state.selectedIds.size).toBe(2);
    expect(isArtistSelected(toggleArtistSelection(state, 7), 7)).toBe(false);
  });

  it("merges pages by id, preserves order and refreshes artist details", () => {
    const first = mergeArtistPage(createArtistOnboardingState<TestArtist>(), {
      items: [{ id: 1, name: "One" }, { id: 2, name: "Old name" }],
      page: 1,
      total: 3,
      hasMore: true,
    });
    const second = mergeArtistPage(first, {
      items: [{ id: 2, name: "New name", genre: "pop" }, { id: 3, name: "Three" }],
      page: 2,
      total: 3,
      hasMore: false,
    });

    expect(second.items.map((artist) => artist.id)).toEqual([1, 2, 3]);
    expect(second.items[1]).toMatchObject({ name: "New name", genre: "pop" });
    expect(second.total).toBe(3);
    expect(second.hasMore).toBe(false);
  });

  it("resets pagination for normalized search and ignores stale responses", () => {
    const loaded = mergeArtistPage(createArtistOnboardingState<TestArtist>(), {
      items: [{ id: 1, name: "One" }],
      page: 1,
      hasMore: false,
    });
    const searching = beginArtistPageLoad(setArtistSearch(loaded, "  Billie   Eilish "));
    const stale = mergeArtistPage(searching, {
      items: [{ id: 2, name: "Stale" }],
      page: 1,
      hasMore: false,
    }, "old query");

    expect(normalizeArtistSearch("  Billie   Eilish ")).toBe("Billie Eilish");
    expect(searching.items).toEqual([]);
    expect(searching.loading).toBe(true);
    expect(stale).toBe(searching);
  });

  it("stores a recoverable loading error", () => {
    const loading = beginArtistPageLoad(createArtistOnboardingState<TestArtist>());
    const failed = failArtistPageLoad(loading, "Сервер недоступен");

    expect(failed.loading).toBe(false);
    expect(failed.error).toBe("Сервер недоступен");
  });
});
