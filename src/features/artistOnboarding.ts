export const DEFAULT_ONBOARDING_MINIMUM_ARTISTS = 3;

export type ArtistChoiceId = string | number;

export interface ArtistChoice {
  id: ArtistChoiceId;
  name: string;
  selected?: boolean;
}

export interface ArtistPage<TArtist extends ArtistChoice> {
  items: TArtist[];
  page: number;
  hasMore: boolean;
  total?: number;
  nextCursor?: string | null;
}

export interface ArtistOnboardingState<TArtist extends ArtistChoice = ArtistChoice> {
  search: string;
  items: TArtist[];
  selectedIds: ReadonlySet<string>;
  minimumSelection: number;
  page: number;
  hasMore: boolean;
  total: number | null;
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
}

export interface CreateArtistOnboardingStateOptions<TArtist extends ArtistChoice> {
  items?: TArtist[];
  selectedIds?: Iterable<ArtistChoiceId>;
  minimumSelection?: number;
  search?: string;
}

export function normalizeArtistChoiceId(id: ArtistChoiceId): string {
  const normalized = String(id).trim();
  if (!normalized) throw new TypeError("Artist id cannot be empty");
  return normalized;
}

export function normalizeArtistSearch(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function validMinimum(value: number | undefined): number {
  if (value === undefined) return DEFAULT_ONBOARDING_MINIMUM_ARTISTS;
  if (!Number.isInteger(value) || value < 0) throw new RangeError("Minimum artist selection must be a non-negative integer");
  return value;
}

function deduplicateArtists<TArtist extends ArtistChoice>(items: TArtist[]): TArtist[] {
  const result: TArtist[] = [];
  const indexById = new Map<string, number>();
  items.forEach((artist) => {
    const id = normalizeArtistChoiceId(artist.id);
    const index = indexById.get(id);
    if (index === undefined) {
      indexById.set(id, result.length);
      result.push(artist);
      return;
    }
    result[index] = { ...result[index], ...artist };
  });
  return result;
}

export function createArtistOnboardingState<TArtist extends ArtistChoice = ArtistChoice>(
  options: CreateArtistOnboardingStateOptions<TArtist> = {},
): ArtistOnboardingState<TArtist> {
  const items = deduplicateArtists(options.items || []);
  const selectedIds = new Set<string>();
  if (options.selectedIds) {
    for (const id of options.selectedIds) selectedIds.add(normalizeArtistChoiceId(id));
  }
  items.forEach((artist) => {
    if (artist.selected) selectedIds.add(normalizeArtistChoiceId(artist.id));
  });
  return {
    search: normalizeArtistSearch(options.search || ""),
    items,
    selectedIds,
    minimumSelection: validMinimum(options.minimumSelection),
    page: 0,
    hasMore: true,
    total: null,
    nextCursor: null,
    loading: false,
    error: null,
  };
}

export function setArtistSearch<TArtist extends ArtistChoice>(
  state: ArtistOnboardingState<TArtist>,
  search: string,
): ArtistOnboardingState<TArtist> {
  const normalized = normalizeArtistSearch(search);
  if (normalized === state.search) return state;
  return {
    ...state,
    search: normalized,
    items: [],
    page: 0,
    hasMore: true,
    total: null,
    nextCursor: null,
    loading: false,
    error: null,
  };
}

export function beginArtistPageLoad<TArtist extends ArtistChoice>(
  state: ArtistOnboardingState<TArtist>,
): ArtistOnboardingState<TArtist> {
  if (state.loading) return state;
  return { ...state, loading: true, error: null };
}

export function failArtistPageLoad<TArtist extends ArtistChoice>(
  state: ArtistOnboardingState<TArtist>,
  error: string,
): ArtistOnboardingState<TArtist> {
  return { ...state, loading: false, error: error.trim() || "Не удалось загрузить артистов" };
}

export function mergeArtistPage<TArtist extends ArtistChoice>(
  state: ArtistOnboardingState<TArtist>,
  page: ArtistPage<TArtist>,
  requestedSearch = state.search,
): ArtistOnboardingState<TArtist> {
  if (normalizeArtistSearch(requestedSearch) !== state.search) return state;
  const incoming = deduplicateArtists(page.items);
  const replace = page.page <= 1 || state.page === 0;
  const merged = replace ? incoming : deduplicateArtists([...state.items, ...incoming]);
  const selectedIds = new Set(state.selectedIds);
  incoming.forEach((artist) => {
    if (artist.selected) selectedIds.add(normalizeArtistChoiceId(artist.id));
  });
  return {
    ...state,
    items: merged,
    selectedIds,
    page: Math.max(0, Math.floor(page.page)),
    hasMore: page.hasMore,
    total: typeof page.total === "number" && Number.isFinite(page.total) ? Math.max(0, Math.floor(page.total)) : state.total,
    nextCursor: page.nextCursor?.trim() || null,
    loading: false,
    error: null,
  };
}

export function toggleArtistSelection<TArtist extends ArtistChoice>(
  state: ArtistOnboardingState<TArtist>,
  artistId: ArtistChoiceId,
): ArtistOnboardingState<TArtist> {
  const id = normalizeArtistChoiceId(artistId);
  const selectedIds = new Set(state.selectedIds);
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  return { ...state, selectedIds };
}

export function replaceArtistSelection<TArtist extends ArtistChoice>(
  state: ArtistOnboardingState<TArtist>,
  artistIds: Iterable<ArtistChoiceId>,
): ArtistOnboardingState<TArtist> {
  const selectedIds = new Set<string>();
  for (const id of artistIds) selectedIds.add(normalizeArtistChoiceId(id));
  return { ...state, selectedIds };
}

export function isArtistSelected<TArtist extends ArtistChoice>(
  state: ArtistOnboardingState<TArtist>,
  artistId: ArtistChoiceId,
): boolean {
  return state.selectedIds.has(normalizeArtistChoiceId(artistId));
}

export function selectedArtistIds<TArtist extends ArtistChoice>(state: ArtistOnboardingState<TArtist>): string[] {
  return [...state.selectedIds];
}

export function artistSelectionShortfall<TArtist extends ArtistChoice>(state: ArtistOnboardingState<TArtist>): number {
  return Math.max(0, state.minimumSelection - state.selectedIds.size);
}

export function canContinueArtistOnboarding<TArtist extends ArtistChoice>(state: ArtistOnboardingState<TArtist>): boolean {
  return artistSelectionShortfall(state) === 0;
}
