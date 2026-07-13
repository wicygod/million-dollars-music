import type { MetadataFeed, MetadataProviderState, Track } from "../metadataFeedService";

export const API_BASE_URL = import.meta.env.VITE_MUSIC_API_BASE_URL?.trim() || "http://5.181.21.13:8000";
export const APP_AUTH_TOKEN = import.meta.env.VITE_MUSIC_APP_TOKEN?.trim() || "";
const DEVICE_ID_STORAGE_KEY = "mm_device_id";
const AUTH_TOKEN_STORAGE_KEY = "mm_auth_token";
const AUTH_USER_STORAGE_KEY = "mm_auth_user";
const ADMIN_SESSION_KEY = "mm_admin_session_key";
const API_REQUEST_TIMEOUT_MS = 12000;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = API_REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

export interface AuthUser {
  id: number;
  login: string;
  nickname: string;
  avatar_url?: string | null;
  subscription_status: string;
  created_at: string;
  is_banned?: boolean;
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
}

export interface BackendHomeFeed {
  recent?: BackendTrack[];
  random?: BackendTrack[];
  trending?: BackendTrack[];
  ru?: BackendTrack[];
  global?: BackendTrack[];
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

function fallbackUuid(): string {
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
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
  const parsed = new URL(url, window.location.href);
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
  if (!response.ok) throw new Error(`Auth failed: ${response.status}`);
  return persistAuth(await response.json() as AuthResponse);
}

export async function loginAccount(login: string, password: string): Promise<AuthResponse> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ login, password }),
  });
  if (!response.ok) throw new Error(`Auth failed: ${response.status}`);
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

function resolveBackendUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("/static/covers/demo-")) return null;
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  if (value.startsWith("/api/images/proxy")) return withAppToken(`${API_BASE_URL}${value}`);
  if (value.startsWith("/")) return `${API_BASE_URL}${value}`;
  return value;
}

function uniqueTracks(items: Track[]): Track[] {
  const seen = new Set<string>();
  return items.filter((track) => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
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
  const isPlayable = Boolean(track.is_playable && (track.audio_src || track.source_url));

  return {
    id: String(track.id),
    title: track.title || "Untitled Track",
    artist,
    album: track.album_name || track.album || genre,
    duration,
    durationLabel: formatDuration(duration),
    coverUrl: resolveBackendUrl(track.cover_url),
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
  };
}

export function mapBackendFeed(feed: BackendHomeFeed, providerState: MetadataProviderState = "backend"): MetadataFeed {
  const recent = (feed.recent || []).map((track) => mapBackendTrack(track, providerState));
  const random = (feed.random || []).map((track) => mapBackendTrack(track, providerState));
  const trending = uniqueTracks((feed.trending || []).map((track) => mapBackendTrack(track, providerState)));
  const ru = (feed.ru || []).map((track) => mapBackendTrack(track, providerState));
  const global = (feed.global || []).map((track) => mapBackendTrack(track, providerState));
  const all = uniqueTracks([...recent, ...random, ...trending, ...ru, ...global]);

  return {
    recent,
    random,
    trending,
    top: trending,
    mood: [...ru, ...global].slice(0, 24),
    ru,
    global,
    all,
    source: providerState,
    loadedAt: Date.now(),
  };
}
