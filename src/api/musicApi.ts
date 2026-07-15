import type { MetadataFeed, MetadataProviderState, Track } from "../metadataFeedService";
import type { PlaybackSessionEvent } from "../features/playbackSession";

export const API_BASE_URL = import.meta.env.VITE_MUSIC_API_BASE_URL?.trim() || "http://5.181.21.13:8000";
export const APP_AUTH_TOKEN = import.meta.env.VITE_MUSIC_APP_TOKEN?.trim() || "";
const DEVICE_ID_STORAGE_KEY = "mm_device_id";
const AUTH_TOKEN_STORAGE_KEY = "mm_auth_token";
const AUTH_USER_STORAGE_KEY = "mm_auth_user";
const ADMIN_SESSION_KEY = "mm_admin_session_key";
const API_REQUEST_TIMEOUT_MS = 12000;

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: unknown = null,
  ) {
    super(`API request failed: ${status}`);
    this.name = "ApiRequestError";
  }
}

async function responseError(response: Response): Promise<ApiRequestError> {
  let detail: unknown = null;
  try {
    const payload = await response.json() as { detail?: unknown };
    detail = payload?.detail ?? null;
  } catch {
    // Some upstream failures return an empty or non-JSON response.
  }
  return new ApiRequestError(response.status, detail);
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = API_REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export interface AuthUser {
  id: number;
  login: string;
  nickname: string;
  avatar_url?: string | null;
  subscription_status: string;
  is_premium?: boolean;
  music_preferences_completed_at?: string | null;
  created_at: string;
  is_banned?: boolean;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  billingPeriod: "month";
  features: string[];
  purchaseAvailable: boolean;
  checkoutMode: "preview";
}

export interface SubscriptionStatus {
  status: string;
  isPremium: boolean;
  entitlements: string[];
  planId: string | null;
  purchaseAvailable: boolean;
}

export interface CheckoutPreview {
  id: string;
  status: "preview";
  plan: SubscriptionPlan;
  activationPerformed: boolean;
  message: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface BackendArtistSummary {
  id: number | string;
  name: string;
  avatar_url?: string | null;
  region?: string | null;
}

export interface BackendArtist extends BackendArtistSummary {
  genres?: string[];
  track_count?: number;
}

export interface OnboardingArtist {
  id: number;
  name: string;
  avatarUrl: string | null;
  genres: string[];
  popularityScore: number;
  trackCount: number;
  selected: boolean;
}

export interface OnboardingArtistsQuery {
  search?: string;
  page?: number;
  cursor?: string;
  limit?: number;
  genre?: string;
}

export interface OnboardingArtistsPage {
  items: OnboardingArtist[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextCursor?: string | null;
  minimumRequired?: number;
}

export type MusicPreferenceSource = "onboarding" | "settings";

export interface UserArtistPreference {
  artistId: number;
  source: string;
  explicitSelected: boolean;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MusicPreferences {
  completedAt: string | null;
  selectedArtistIds: number[];
  items: UserArtistPreference[];
}

export interface BackendTrack {
  id: number | string;
  title?: string | null;
  artist?: string | null;
  artists?: BackendArtistSummary[];
  album?: string | null;
  album_name?: string | null;
  duration_seconds?: number | null;
  cover_url?: string | null;
  genre?: string | null;
  tags?: string[];
  region?: string | null;
  popularity_score?: number | null;
  quality_score?: number | null;
  needs_review?: boolean | null;
  is_playable?: boolean | null;
  audio_src?: string | null;
  source_url?: string | null;
  recommendation_type?: string | null;
  recommendationType?: string | null;
  recommendation_reason?: string | null;
  recommendationReason?: string | null;
  reason?: string | null;
  algorithm_version?: string | null;
  algorithmVersion?: string | null;
  position?: number | null;
}

export interface BackendFeedSection {
  id: string;
  title: string;
  subtitle?: string | null;
  tracks?: BackendTrack[];
  items?: BackendTrack[];
  recommendation_type?: string | null;
  recommendationType?: string | null;
}

export interface BackendRecommendationTrack {
  track: BackendTrack;
  recommendation_type?: string | null;
  recommendationType?: string | null;
  reason?: string | null;
  algorithm_version?: string | null;
  algorithmVersion?: string | null;
  position?: number | null;
}

export interface BackendHomeFeed {
  recent?: BackendTrack[];
  random?: BackendTrack[];
  trending?: BackendTrack[];
  ru?: BackendTrack[];
  global?: BackendTrack[];
  top?: BackendTrack[];
  mood?: BackendTrack[];
  personalized?: Array<BackendTrack | BackendRecommendationTrack>;
  recommendations?: Array<BackendTrack | BackendRecommendationTrack>;
  selected_artists?: BackendTrack[];
  selectedArtists?: BackendTrack[];
  similar_artists?: BackendTrack[];
  similarArtists?: BackendTrack[];
  genre_recommendations?: BackendTrack[];
  genreRecommendations?: BackendTrack[];
  popular_for_you?: BackendTrack[];
  popularForYou?: BackendTrack[];
  exploration?: BackendTrack[];
  sections?: BackendFeedSection[];
  algorithm_version?: string | null;
  algorithmVersion?: string | null;
  personalization_active?: boolean;
  personalizationActive?: boolean;
}

export interface HistorySummary {
  total_seconds: number;
  total_tracks: number;
}

export interface BackendFavorite {
  user_id: string;
  track: BackendTrack;
  created_at: string;
}

export interface ListeningEventResponse {
  id: number;
  eventId: string;
  trackId: number;
  artistId: number | null;
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
}

export type MusicSignalType =
  | "like"
  | "unlike"
  | "playlist"
  | "playlist_remove"
  | "follow"
  | "artist_view"
  | "hide"
  | "unhide";

export interface MusicSignalInput {
  eventId?: string;
  signal: MusicSignalType;
  trackId: string | number;
  artistId?: string | number | null;
  context?: string;
  occurredAt?: string;
}

export interface MusicSignalResponse {
  eventId: string;
  signal: MusicSignalType;
  created: boolean;
}

export type RecommendationEventType =
  | "recommendation_impression"
  | "recommendation_played"
  | "recommendation_skipped"
  | "recommendation_liked";

export interface FeedEventInput {
  eventId?: string;
  trackId: string | number;
  eventType: RecommendationEventType;
  position?: number | null;
  recommendationType?: string;
  reason?: string | null;
  algorithmVersion?: string;
  context?: string;
}

export interface FeedEventResponse extends Required<Omit<FeedEventInput, "position" | "reason">> {
  id: number;
  position: number | null;
  reason: string | null;
  createdAt: string;
}

function fallbackUuid(): string {
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function clientEventId(prefix: string): string {
  const uuid = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${uuid}`;
}

function positiveInteger(value: string | number, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new TypeError(`${field} must be a positive integer`);
  return parsed;
}

function optionalPositiveInteger(value: string | number | null | undefined, field: string): number | null {
  return value === null || value === undefined ? null : positiveInteger(value, field);
}

export function getDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;
  const generated = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : fallbackUuid();
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
  return generated;
}

function apiHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Device-Id": getDeviceId(),
    "X-App-Token": APP_AUTH_TOKEN,
  };
  const authToken = getAuthToken();
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  return headers;
}

export function withAppToken(url: string): string {
  const base = typeof window === "undefined" ? API_BASE_URL : window.location.href;
  const parsed = new URL(url, base);
  parsed.searchParams.set("app_token", APP_AUTH_TOKEN);
  return parsed.toString();
}

export function adminHeaders(): HeadersInit {
  const adminKey = getAdminApiKey();
  if (!adminKey) {
    throw new Error("Admin API key is required for the admin panel");
  }
  return {
    Accept: "application/json",
    "X-App-Token": APP_AUTH_TOKEN,
    "X-Admin-Key": adminKey,
  };
}

export function getAdminApiKey(): string {
  return sessionStorage.getItem(ADMIN_SESSION_KEY)?.trim() || "";
}

export function setAdminSessionKey(value: string): void {
  const clean = value.trim();
  if (clean) sessionStorage.setItem(ADMIN_SESSION_KEY, clean);
  else sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    headers: apiHeaders(),
  });
  if (!response.ok) {
    handleUnauthorizedResponse(response.status);
    throw new Error(`Backend request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function apiSend<T>(
  path: string,
  body: unknown,
  method: "POST" | "PATCH" = "POST",
  options: { keepalive?: boolean } = {},
): Promise<T> {
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    method,
    headers: { ...apiHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: options.keepalive,
  });
  if (!response.ok) {
    handleUnauthorizedResponse(response.status);
    throw new Error(`Backend request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function authHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-App-Token": APP_AUTH_TOKEN,
    ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
  };
}

function persistAuth(payload: AuthResponse): AuthResponse {
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, payload.token);
  localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(payload.user));
  return payload;
}

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function getStoredAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) as AuthUser : null;
  } catch {
    return null;
  }
}

export function setStoredAuthUser(user: AuthUser): void {
  localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
}

export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("auth:required"));
}

function handleUnauthorizedResponse(status: number): void {
  if (status === 401 || status === 403) clearAuthToken();
}

export async function registerAccount(login: string, nickname: string, password: string): Promise<AuthResponse> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ login, nickname, password }),
  });
  if (!response.ok) throw await responseError(response);
  return persistAuth(await response.json() as AuthResponse);
}

export async function loginAccount(login: string, password: string): Promise<AuthResponse> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ login, password }),
  });
  if (!response.ok) throw await responseError(response);
  return persistAuth(await response.json() as AuthResponse);
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/me`, { headers: authHeaders() });
  if (!response.ok) {
    handleUnauthorizedResponse(response.status);
    throw new Error(`Auth failed: ${response.status}`);
  }
  const user = await response.json() as AuthUser;
  setStoredAuthUser(user);
  return user;
}

type WireSubscriptionPlan = {
  id: string;
  name: string;
  description: string;
  price_minor: number;
  currency: string;
  billing_period: "month";
  features: string[];
  purchase_available: boolean;
  checkout_mode: "preview";
};

function mapSubscriptionPlan(plan: WireSubscriptionPlan): SubscriptionPlan {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    priceMinor: plan.price_minor,
    currency: plan.currency,
    billingPeriod: plan.billing_period,
    features: [...plan.features],
    purchaseAvailable: plan.purchase_available,
    checkoutMode: plan.checkout_mode,
  };
}

export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const plans = await apiFetch<WireSubscriptionPlan[]>("/api/subscriptions/plans");
  return plans.map(mapSubscriptionPlan);
}

export async function getMySubscription(): Promise<SubscriptionStatus> {
  const status = await apiFetch<{
    status: string;
    is_premium: boolean;
    entitlements: string[];
    plan_id: string | null;
    purchase_available: boolean;
  }>("/api/subscriptions/me");
  return {
    status: status.status,
    isPremium: status.is_premium,
    entitlements: [...status.entitlements],
    planId: status.plan_id,
    purchaseAvailable: status.purchase_available,
  };
}

export async function createCheckoutPreview(planId: string): Promise<CheckoutPreview> {
  const preview = await apiSend<{
    id: string;
    status: "preview";
    plan: WireSubscriptionPlan;
    activation_performed: boolean;
    message: string;
  }>("/api/subscriptions/checkout-preview", { plan_id: planId });
  return {
    id: preview.id,
    status: preview.status,
    plan: mapSubscriptionPlan(preview.plan),
    activationPerformed: preview.activation_performed,
    message: preview.message,
  };
}

export async function updateNickname(nickname: string): Promise<AuthUser> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/me`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ nickname }),
  });
  if (!response.ok) {
    handleUnauthorizedResponse(response.status);
    throw new Error(`Profile update failed: ${response.status}`);
  }
  const user = await response.json() as AuthUser;
  setStoredAuthUser(user);
  return user;
}

export async function updateAvatar(avatarDataUrl: string): Promise<AuthUser> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/me/avatar`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ avatar_data_url: avatarDataUrl }),
  });
  if (!response.ok) {
    handleUnauthorizedResponse(response.status);
    throw new Error(`Avatar update failed: ${response.status}`);
  }
  const user = await response.json() as AuthUser;
  setStoredAuthUser(user);
  return user;
}

type WireOnboardingArtist = {
  id: number;
  name: string;
  avatarUrl?: string | null;
  avatar_url?: string | null;
  genres?: string[];
  popularityScore?: number;
  popularity_score?: number;
  trackCount?: number;
  track_count?: number;
  selected?: boolean;
};

function normalizeOnboardingArtist(artist: WireOnboardingArtist): OnboardingArtist {
  return {
    id: positiveInteger(artist.id, "artistId"),
    name: String(artist.name || "Неизвестный артист"),
    avatarUrl: resolveBackendImageUrl(artist.avatarUrl ?? artist.avatar_url),
    genres: Array.isArray(artist.genres) ? [...new Set(artist.genres.map(String).map((genre) => genre.trim()).filter(Boolean))] : [],
    popularityScore: Number(artist.popularityScore ?? artist.popularity_score ?? 0) || 0,
    trackCount: Math.max(0, Math.floor(Number(artist.trackCount ?? artist.track_count ?? 0) || 0)),
    selected: Boolean(artist.selected),
  };
}

export async function getOnboardingArtists(query: OnboardingArtistsQuery = {}): Promise<OnboardingArtistsPage> {
  const params = new URLSearchParams();
  const search = query.search?.trim();
  const genre = query.genre?.trim();
  const cursor = query.cursor?.trim();
  if (search) params.set("search", search);
  if (genre) params.set("genre", genre);
  if (cursor) params.set("cursor", cursor);
  if (query.page !== undefined) params.set("page", String(Math.max(1, Math.floor(query.page))));
  if (query.limit !== undefined) params.set("limit", String(Math.max(1, Math.min(100, Math.floor(query.limit)))));
  const suffix = params.size ? `?${params.toString()}` : "";
  const payload = await apiFetch<{
    items?: WireOnboardingArtist[];
    total?: number;
    page?: number;
    limit?: number;
    hasMore?: boolean;
    has_more?: boolean;
    nextCursor?: string | null;
    next_cursor?: string | null;
    minimumRequired?: number;
    minimum_required?: number;
  }>(`/api/artists/onboarding${suffix}`);
  return {
    items: (payload.items || []).map(normalizeOnboardingArtist),
    total: Math.max(0, Math.floor(Number(payload.total ?? 0) || 0)),
    page: Math.max(1, Math.floor(Number(payload.page ?? query.page ?? 1) || 1)),
    limit: Math.max(1, Math.floor(Number(payload.limit ?? query.limit ?? 24) || 24)),
    hasMore: Boolean(payload.hasMore ?? payload.has_more),
    nextCursor: payload.nextCursor ?? payload.next_cursor ?? null,
    minimumRequired: Math.max(0, Math.floor(Number(payload.minimumRequired ?? payload.minimum_required ?? 3) || 0)),
  };
}

export function getMusicPreferences(): Promise<MusicPreferences> {
  return apiFetch<MusicPreferences>("/api/user/music-preferences");
}

export async function saveMusicPreferences(
  artistIds: Iterable<string | number>,
  source: MusicPreferenceSource = "onboarding",
  skipped = false,
): Promise<MusicPreferences> {
  const normalizedIds = [...new Set([...artistIds].map((artistId) => positiveInteger(artistId, "artistId")))];
  const preferences = await apiSend<MusicPreferences>("/api/user/music-preferences", {
    artistIds: normalizedIds,
    source,
    ...(skipped ? { skipped: true } : {}),
  });
  const storedUser = getStoredAuthUser();
  if (storedUser && preferences.completedAt) {
    setStoredAuthUser({ ...storedUser, music_preferences_completed_at: preferences.completedAt });
  }
  return preferences;
}

export function getHomeFeed(): Promise<BackendHomeFeed> {
  return apiFetch<BackendHomeFeed>("/api/feed/home");
}

export function searchCatalog(query: string, limit = 150): Promise<BackendTrack[]> {
  return apiFetch<BackendTrack[]>(`/api/search?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(String(limit))}`);
}

export function getTrack(trackId: string | number): Promise<BackendTrack> {
  return apiFetch<BackendTrack>(`/api/tracks/${encodeURIComponent(String(trackId))}`);
}

export function getArtist(artistId: string | number): Promise<BackendArtist> {
  return apiFetch<BackendArtist>(`/api/artists/${encodeURIComponent(String(artistId))}`);
}

export function getArtistTracks(artistId: string | number): Promise<BackendTrack[]> {
  return apiFetch<BackendTrack[]>(`/api/artists/${encodeURIComponent(String(artistId))}/tracks`);
}

export async function recordTrackPlay(trackId: string | number): Promise<BackendTrack> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/history/listen/${encodeURIComponent(String(trackId))}`, {
    method: "POST",
    headers: apiHeaders(),
  });
  if (!response.ok) {
    handleUnauthorizedResponse(response.status);
    throw new Error(`Backend request failed: ${response.status}`);
  }
  return response.json() as Promise<BackendTrack>;
}

export function getHistorySummary(): Promise<HistorySummary> {
  return apiFetch<HistorySummary>("/api/history/summary");
}

export function getUserFavorites(): Promise<BackendFavorite[]> {
  return apiFetch<BackendFavorite[]>("/api/user/favorites");
}

export async function setUserFavorite(trackId: string | number, liked: boolean): Promise<void> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/user/favorites/${encodeURIComponent(String(trackId))}`,
    { method: liked ? "POST" : "DELETE", headers: apiHeaders() },
  );
  if (!response.ok) {
    handleUnauthorizedResponse(response.status);
    throw new Error(`Favorite update failed: ${response.status}`);
  }
}

export async function addListeningTime(seconds: number): Promise<HistorySummary> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/history/progress`, {
    method: "POST",
    headers: { ...apiHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ seconds: Math.max(1, Math.min(300, Math.floor(seconds))) }),
  });
  if (!response.ok) {
    handleUnauthorizedResponse(response.status);
    throw new Error(`Listening progress update failed: ${response.status}`);
  }
  return response.json() as Promise<HistorySummary>;
}

export function submitPlaybackEvent(
  event: PlaybackSessionEvent,
  options: { keepalive?: boolean } = {},
): Promise<ListeningEventResponse> {
  const completionRatio = event.completionRatio === null
    ? null
    : Math.max(0, Math.min(1, Number(event.completionRatio) || 0));
  return apiSend<ListeningEventResponse>("/api/history/events", {
    eventId: event.eventId,
    trackId: positiveInteger(event.trackId, "trackId"),
    artistId: optionalPositiveInteger(event.artistId, "artistId"),
    startedAt: event.startedAt,
    listenedDuration: Math.max(0, Math.min(86_400, Math.round(event.listenedDuration))),
    trackDuration: event.trackDuration === null ? null : Math.max(0, Math.min(86_400, Math.round(event.trackDuration))),
    completionRatio,
    completed: event.completed,
    skipped: event.skipped,
    context: event.context.trim() || "unknown",
    recommendationType: event.recommendationType?.trim() || null,
    recommendationReason: event.recommendationReason?.trim() || null,
    algorithmVersion: event.algorithmVersion?.trim() || null,
  }, "POST", options);
}

export function postMusicSignal(input: MusicSignalInput): Promise<MusicSignalResponse> {
  return apiSend<MusicSignalResponse>("/api/user/music-signals", {
    eventId: input.eventId?.trim() || clientEventId("signal"),
    signal: input.signal,
    trackId: positiveInteger(input.trackId, "trackId"),
    artistId: optionalPositiveInteger(input.artistId, "artistId"),
    context: input.context?.trim() || "unknown",
    occurredAt: input.occurredAt || new Date().toISOString(),
  });
}

export function postFeedEvent(input: FeedEventInput): Promise<FeedEventResponse> {
  return apiSend<FeedEventResponse>("/api/feed/events", {
    eventId: input.eventId?.trim() || clientEventId("feed"),
    trackId: positiveInteger(input.trackId, "trackId"),
    eventType: input.eventType,
    position: input.position === null || input.position === undefined ? null : Math.max(0, Math.floor(input.position)),
    recommendationType: input.recommendationType?.trim() || "unknown",
    reason: input.reason?.trim() || null,
    algorithmVersion: input.algorithmVersion?.trim() || "v1",
    context: input.context?.trim() || "home",
  });
}

export interface PreparedTrack {
  track_id: number;
  status: "ready";
  cache_hit: boolean;
  size_bytes: number;
}

export interface StreamTicket {
  ticket: string;
  expires_in: number;
}

export async function createStreamTicket(trackId: string | number): Promise<StreamTicket> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/stream/track/${encodeURIComponent(String(trackId))}/ticket`,
    { method: "POST", headers: apiHeaders() },
  );
  if (!response.ok) {
    handleUnauthorizedResponse(response.status);
    throw new Error(`Stream ticket request failed: ${response.status}`);
  }
  return response.json() as Promise<StreamTicket>;
}

export async function prepareTrackPlayback(trackId: string | number): Promise<PreparedTrack> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/stream/track/${encodeURIComponent(String(trackId))}/prepare`,
    { method: "POST", headers: apiHeaders() },
    90_000,
  );
  if (!response.ok) {
    handleUnauthorizedResponse(response.status);
    throw new Error(`Track preparation failed: ${response.status}`);
  }
  return response.json() as Promise<PreparedTrack>;
}

export async function submitBugReport(text: string): Promise<{ ok: boolean; message: string }> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/bugreport`, {
    method: "POST",
    headers: {
      ...apiHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    handleUnauthorizedResponse(response.status);
    throw new Error(`Bug report failed: ${response.status}`);
  }
  return response.json() as Promise<{ ok: boolean; message: string }>;
}

function formatDuration(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const rest = Math.floor(safeSeconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function normalizeGenre(value: string | null | undefined): string {
  const genre = (value || "catalog").trim().toLowerCase();
  if (!genre) return "catalog";
  if (genre.includes("hip") || genre.includes("rap")) return "hiphop";
  if (genre.includes("elect")) return "electronic";
  if (genre.includes("classic")) return "classical";
  return genre.replace(/\s+/g, "-");
}

function gradientForGenre(genre: string): string {
  const map: Record<string, string> = {
    pop: "from-rose-500 to-slate-900",
    hiphop: "from-violet-500 to-zinc-950",
    electronic: "from-cyan-500 to-slate-950",
    rock: "from-red-600 to-zinc-950",
    jazz: "from-emerald-500 to-zinc-950",
    classical: "from-blue-500 to-zinc-950",
    lofi: "from-amber-400 to-zinc-950",
  };
  return map[genre] || "from-slate-600 to-zinc-950";
}

export function resolveBackendImageUrl(value: string | null | undefined): string | null {
  const clean = value?.trim();
  if (!clean || clean.startsWith("/static/covers/demo-")) return null;
  if (/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,/i.test(clean)) return clean;
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith("/api/images/proxy")) return withAppToken(`${API_BASE_URL}${clean}`);
  if (clean.startsWith("/")) return `${API_BASE_URL}${clean}`;
  return null;
}

function resolveBackendUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("/static/covers/demo-")) return null;
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  if (value.startsWith("/api/images/proxy")) return withAppToken(`${API_BASE_URL}${value}`);
  if (value.startsWith("/")) return `${API_BASE_URL}${value}`;
  return value;
}

function uniqueTracks(items: Track[]): Track[] {
  const unique: Track[] = [];
  const positions = new Map<string, number>();
  items.forEach((track) => {
    const existingPosition = positions.get(track.id);
    if (existingPosition === undefined) {
      positions.set(track.id, unique.length);
      unique.push(track);
      return;
    }
    const existing = unique[existingPosition];
    // A track can be both recent and recommended. Preserve the richer
    // recommendation payload instead of letting the first collection erase it.
    unique[existingPosition] = {
      ...existing,
      ...track,
      liked: existing.liked || track.liked,
      recommendationType: track.recommendationType || existing.recommendationType,
      recommendationReason: track.recommendationReason || existing.recommendationReason,
      algorithmVersion: track.algorithmVersion || existing.algorithmVersion,
      recommendationPosition: track.recommendationPosition ?? existing.recommendationPosition,
    };
  });
  return unique;
}

export function mapBackendTrack(track: BackendTrack, providerState: MetadataProviderState = "backend"): Track {
  const artists = Array.isArray(track.artists) ? track.artists : [];
  const artistNames = artists.map((artist) => artist.name).filter(Boolean);
  const artist = artistNames.join(", ") || track.artist || "Unknown Artist";
  const duration = Number(track.duration_seconds || 0);
  const genre = normalizeGenre(track.genre);
  const region = track.region || undefined;
  const tags = [...new Set([...(track.tags || []), genre, region].filter(Boolean).map(String))];
  const audioSrc = resolveBackendUrl(track.audio_src);
  const hasPlaybackSource = Boolean(track.audio_src || track.source_url);
  const isPlayable = Boolean((track.is_playable ?? hasPlaybackSource) && hasPlaybackSource);

  return {
    id: String(track.id),
    title: track.title || "Untitled Track",
    artist,
    album: track.album_name || track.album || genre,
    duration,
    durationLabel: formatDuration(duration),
    coverUrl: resolveBackendImageUrl(track.cover_url),
    genre,
    tags,
    isPlayable,
    audioSrc,
    sourceUrl: isPlayable ? `${API_BASE_URL}/api/stream/track/${encodeURIComponent(String(track.id))}` : undefined,
    sourceType: "metadata",
    providerState,
    gradient: gradientForGenre(genre),
    icon: "♪",
    liked: false,
    artists,
    artistId: artists[0] ? String(artists[0].id) : undefined,
    qualityScore: typeof track.quality_score === "number" ? track.quality_score : undefined,
    needsReview: Boolean(track.needs_review),
    region,
    recommendationType: track.recommendationType || track.recommendation_type || undefined,
    recommendationReason: track.recommendationReason || track.recommendation_reason || track.reason || undefined,
    algorithmVersion: track.algorithmVersion || track.algorithm_version || undefined,
    recommendationPosition: typeof track.position === "number" && track.position >= 0 ? Math.floor(track.position) : undefined,
  };
}

function mapBackendRecommendationTrack(
  item: BackendTrack | BackendRecommendationTrack,
  providerState: MetadataProviderState,
  position: number,
): Track {
  if (!("track" in item)) {
    return mapBackendTrack({ ...item, position: item.position ?? position }, providerState);
  }
  return mapBackendTrack({
    ...item.track,
    recommendationType: item.recommendationType || item.recommendation_type || item.track.recommendationType || item.track.recommendation_type,
    recommendationReason: item.reason || item.track.recommendationReason || item.track.recommendation_reason || item.track.reason,
    algorithmVersion: item.algorithmVersion || item.algorithm_version || item.track.algorithmVersion || item.track.algorithm_version,
    position: item.position ?? item.track.position ?? position,
  }, providerState);
}

export function mapBackendFeed(feed: BackendHomeFeed, providerState: MetadataProviderState = "backend"): MetadataFeed {
  const recent = (feed.recent || []).map((track) => mapBackendTrack(track, providerState));
  const random = (feed.random || []).map((track) => mapBackendTrack(track, providerState));
  const trending = uniqueTracks((feed.trending || []).map((track) => mapBackendTrack(track, providerState)));
  const ru = (feed.ru || []).map((track) => mapBackendTrack(track, providerState));
  const global = (feed.global || []).map((track) => mapBackendTrack(track, providerState));
  const top = uniqueTracks((feed.top || feed.trending || []).map((track) => mapBackendTrack(track, providerState)));
  const mood = uniqueTracks((feed.mood || []).map((track) => mapBackendTrack(track, providerState)));
  const personalized = uniqueTracks((feed.personalized || feed.recommendations || []).map((item, index) => mapBackendRecommendationTrack(item, providerState, index)));
  const selectedArtists = uniqueTracks((feed.selectedArtists || feed.selected_artists || []).map((track) => mapBackendTrack(track, providerState)));
  const similarArtists = uniqueTracks((feed.similarArtists || feed.similar_artists || []).map((track) => mapBackendTrack(track, providerState)));
  const genreRecommendations = uniqueTracks((feed.genreRecommendations || feed.genre_recommendations || []).map((track) => mapBackendTrack(track, providerState)));
  const popularForYou = uniqueTracks((feed.popularForYou || feed.popular_for_you || []).map((track) => mapBackendTrack(track, providerState)));
  const exploration = uniqueTracks((feed.exploration || []).map((track) => mapBackendTrack(track, providerState)));
  const sections = (feed.sections || []).map((section) => ({
    id: section.id,
    title: section.title,
    subtitle: section.subtitle || undefined,
    recommendationType: section.recommendationType || section.recommendation_type || undefined,
    tracks: uniqueTracks((section.tracks || section.items || []).map((track) => mapBackendTrack(track, providerState))),
  }));
  const sectionTracks = sections.flatMap((section) => section.tracks);
  const all = uniqueTracks([
    ...recent,
    ...personalized,
    ...selectedArtists,
    ...similarArtists,
    ...genreRecommendations,
    ...popularForYou,
    ...exploration,
    ...sectionTracks,
    ...random,
    ...trending,
    ...top,
    ...mood,
    ...ru,
    ...global,
  ]);

  return {
    recent,
    random,
    trending,
    top: top.length ? top : trending,
    mood: mood.length ? mood : [...ru, ...global].slice(0, 24),
    ru,
    global,
    all,
    personalized,
    selectedArtists,
    similarArtists,
    genreRecommendations,
    popularForYou,
    exploration,
    sections,
    algorithmVersion: feed.algorithmVersion || feed.algorithm_version || undefined,
    personalizationActive: Boolean(feed.personalizationActive ?? feed.personalization_active),
    source: providerState,
    loadedAt: Date.now(),
  };
}
