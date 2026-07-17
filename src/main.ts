import { LEGACY_TRACK_ID_MAP, getInitialMetadataFeed, loadHomeFeed, type MetadataFeed, type Track } from "./metadataFeedService";
import { EqualizerEngine, DEFAULT_EQUALIZER, EQUALIZER_STATE_VERSION, EQ_FREQUENCIES, EQ_PRESETS, calculateEqualizerMetrics, equalizerCurvePoints, equalizerDisplayGains, formatEqFrequency, formatEqGain, restoreEqualizerState, type EqualizerPreset, type EqualizerPresetId, type EqualizerState } from "./features/equalizer";
import { invalidateHomeFeedCache } from "./metadataFeedService";
import { applyHistorySummaryToProfile, pluralizeTracks } from "./features/profile";
import {
  filterLocalSearchTracks,
  highlightMatch,
  isExactArtistSearch,
  normalizeSearchText,
  prepareSearchTracks,
  sanitizeSearchQuery,
  searchResultsSignature,
} from "./features/search";
import { ACCENT_COLORS, DEFAULT_SETTINGS, settingSwitch, type PlayerSettings } from "./features/settings";
import { PlaybackCycleGate } from "./features/playbackHistory";
import {
  beginArtistPageLoad,
  canContinueArtistOnboarding,
  createArtistOnboardingState,
  failArtistPageLoad,
  isArtistSelected,
  mergeArtistPage,
  selectedArtistIds,
  setArtistSearch,
  toggleArtistSelection,
  type ArtistOnboardingState,
} from "./features/artistOnboarding";
import { PlaybackSessionTracker, type PlaybackEndReason, type PlaybackSessionEvent } from "./features/playbackSession";
import { selectPopularTracks } from "./features/popularChart";
import { formatSubscriptionPrice, hasPremiumAccess, isTrustedCheckoutUrl } from "./features/subscription";
import { openUrl } from "@tauri-apps/plugin-opener";
import { loadHlsConstructor, type HlsPlayer } from "./player/hlsLoader";
import { disableNativeContextMenu } from "./contextMenu";
import {
  addListeningTime,
  API_BASE_URL,
  clearAuthToken,
  createMockCheckout,
  createStreamTicket,
  fetchCurrentUser,
  getArtist as fetchArtist,
  getArtistTracks,
  getArtistAlbums,
  getAuthToken,
  getHistorySummary,
  getMusicPreferences,
  getMySubscription,
  getOnboardingArtists,
  getSubscriptionPlans,
  getUserFavorites,
  getStoredAuthUser,
  getTrack as fetchTrack,
  loginAccount,
  mapBackendTrack,
  prepareTrackPlayback,
  postFeedEvent,
  postMusicSignal,
  recordTrackPlay,
  registerAccount,
  resolveBackendImageUrl,
  saveMusicPreferences,
  searchCatalog,
  searchCatalogOverview,
  submitBugReport,
  submitPlaybackEvent,
  setUserFavorite,
  setStoredAuthUser,
  type AuthResponse,
  type AuthUser,
  type BackendAlbum,
  type OnboardingArtist,
  type MockCheckout,
  type SubscriptionPlan,
  updateAvatar,
  updateNickname,
  withAppToken,
} from "./api/musicApi";
import { authFailureMessage } from "./features/authFeedback";

disableNativeContextMenu();

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

type TrackId = Track["id"];

let metadataFeed: MetadataFeed = getInitialMetadataFeed();
let tracks: Track[] = [...metadataFeed.all];
let currentAuthUser: AuthUser | null = getStoredAuthUser();
let subscriptionPlansCache: SubscriptionPlan[] | null = null;
let artistOnboardingState: ArtistOnboardingState<OnboardingArtist> = createArtistOnboardingState<OnboardingArtist>();
let artistOnboardingMode: "onboarding" | "settings" = "onboarding";
let artistOnboardingRequest = 0;
let artistOnboardingTouched = false;
let artistSearchTimer: number | null = null;
let artistOnboardingReturnFocus: HTMLElement | null = null;
const recommendationImpressions = new Set<string>();
let recommendationImpressionObserver: IntersectionObserver | null = null;
const recordedArtistViews = new Set<string>();

const PRIORITY_ARTISTS = ["lil peep", "9 mice", "kai angel", "viperr", "pharaoh", "темный принц", "тёмный принц", "fortuna812", "face", "cupsize", "madkid", "снялцепи"];
const POPULAR_INITIAL_RENDER = 24;
const POPULAR_RENDER_STEP = 24;
let popularVisibleCount = POPULAR_INITIAL_RENDER;

// Playlists, genres, stations
interface PlaylistDef {
  id: string;
  name: string;
  description: string;
  gradient: string;
  icon: string;
  genreFilter: string[];
  userCreated?: boolean;
}

// Only user-created, per-account playlists live here. Editorial discovery is
// handled by radio/mixes and must not leak into the user's personal library.
const playlists: PlaylistDef[] = [];
const LEGACY_EDITORIAL_PLAYLIST_IDS = new Set(["focus", "late", "energy", "chill", "indie", "piano"]);
const LEGACY_EDITORIAL_PLAYLIST_NAMES = new Set(["focus flow", "late nights", "energy boost", "chill vibes", "indie mix", "piano"]);

const genres = [
  { id: "rock", name: "Рок", gradient: "from-red-600 to-orange-700", description: "Драйв, гитары, энергия" },
  { id: "hiphop", name: "Хип-хоп", gradient: "from-purple-600 to-pink-700", description: "Биты, рифмы, культура" },
  { id: "pop", name: "Поп", gradient: "from-pink-500 to-rose-600", description: "Запоминающиеся мелодии" },
  { id: "lofi", name: "Лоу-фай", gradient: "from-amber-500 to-yellow-700", description: "Тёплый звук, расслабление" },
  { id: "electronic", name: "Электроника", gradient: "from-cyan-500 to-blue-700", description: "Синтезаторы, ритмы" },
  { id: "jazz", name: "Джаз", gradient: "from-green-600 to-teal-700", description: "Импровизация, стиль" },
  { id: "classical", name: "Классика", gradient: "from-blue-500 to-indigo-700", description: "Вечные шедевры" },
];

const radioStations = [
  { id: "study", name: "Для учёбы / Кодинга", gradient: "from-indigo-600 to-blue-800", desc: "Лоу-фай биты, инструменталы", mood: "focus" },
  { id: "chillout", name: "Чилаут", gradient: "from-teal-500 to-green-700", desc: "Эмбиент, даунтемпо, релакс", mood: "relax" },
  { id: "energy", name: "Энергия", gradient: "from-orange-500 to-red-600", desc: "Рок, EDM, мотивирующие треки", mood: "active" },
  { id: "morning", name: "Утренний микс", gradient: "from-purple-600 to-pink-700", desc: "Поп, инди, позитивные треки", mood: "happy" },
  { id: "road", name: "В дорогу", gradient: "from-sky-500 to-indigo-700", desc: "Музыка для путешествий", mood: "adventure" },
  { id: "evening", name: "Вечерний лайф", gradient: "from-rose-500 to-fuchsia-700", desc: "R&B, соул, джаз", mood: "romantic" },
];

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

let player = {
  playing: false,
  buffering: false,
  currentTime: 0,
  currentTrackId: "" as TrackId,
  queue: [] as TrackId[],
  queueIndex: -1,
  interval: null as number | null,
  repeat: false,
  shuffle: false,
};
let keepPlayerEmptyUntilSelection = true;

const nowPlayingTitle = document.getElementById("nowPlayingTitle")!;
const nowPlayingArtist = document.getElementById("nowPlayingArtist")!;
const nowPlayingArt = document.getElementById("nowPlayingArt")!;
const playBtn = document.getElementById("playBtn")!;
const playIcon = document.getElementById("playIcon")!;
const prevBtn = document.getElementById("prevBtn")!;
const nextBtn = document.getElementById("nextBtn")!;
const likeBtn = document.getElementById("likeBtn")!;
const repeatBtn = document.getElementById("repeatBtn")!;
const volumeBtn = document.getElementById("volumeBtn")!;
const timelineContainer = document.getElementById("timelineContainer")!;
const timelineFill = document.getElementById("timelineFill")!;
const timelineThumb = document.getElementById("timelineThumb")!;
const currentTimeEl = document.getElementById("currentTime")!;
const totalTimeEl = document.getElementById("totalTime")!;
const volumeContainer = document.getElementById("volumeContainer")!;
const volFill = document.getElementById("volFill")!;
const volThumb = document.getElementById("volThumb")!;
const searchInput = document.getElementById("searchInput")! as HTMLInputElement;
const clearSearchBtn = document.getElementById("clearSearch")!;
const searchSubmitBtn = document.getElementById("searchSubmit")!;
const focusOverlay = document.getElementById("focusOverlay")!;
const focusBack = document.getElementById("focusBack")!;
const focusArt = document.getElementById("focusArt")!;
const focusTitle = document.getElementById("focusTitle")!;
const focusArtist = document.getElementById("focusArtist")!;
const focusCurrentTime = document.getElementById("focusCurrentTime")!;
const focusTotalTime = document.getElementById("focusTotalTime")!;
const focusTimeline = document.getElementById("focusTimeline")!;
const focusTimelineFill = document.getElementById("focusTimelineFill")!;
const focusTimelineThumb = document.getElementById("focusTimelineThumb")!;
const focusLikeBtn = document.getElementById("focusLikeBtn")!;
const nowPlayingFocus = document.getElementById("nowPlayingFocus")! as HTMLButtonElement;
const focusPlayBtn = document.getElementById("focusPlayBtn")! as HTMLButtonElement;
const focusPlayIcon = document.getElementById("focusPlayIcon")!;
const focusPrevBtn = document.getElementById("focusPrevBtn")! as HTMLButtonElement;
const focusNextBtn = document.getElementById("focusNextBtn")! as HTMLButtonElement;
const focusRepeatBtn = document.getElementById("focusRepeatBtn")! as HTMLButtonElement;
const focusShuffleBtn = document.getElementById("focusShuffleBtn")! as HTMLButtonElement;
const focusQueueBtn = document.getElementById("focusQueueBtn")! as HTMLButtonElement;
const queueBtn = document.getElementById("queueBtn")! as HTMLButtonElement;
const appLiveRegion = document.getElementById("appLiveRegion")!;

let trackNoticeTimer: number | null = null;
let focusReturnTarget: HTMLElement | null = null;

function getOrCreateAudioElement(): HTMLAudioElement {
  const existing = document.getElementById("soundcloudAudio");
  if (existing instanceof HTMLAudioElement) return existing;

  const audio = document.createElement("audio");
  audio.id = "soundcloudAudio";
  audio.preload = "metadata";
  audio.style.display = "none";
  audio.setAttribute("playsinline", "true");
  document.body.appendChild(audio);
  return audio;
}

const audioEl = getOrCreateAudioElement();
audioEl.crossOrigin = "anonymous";
let hlsPlayer: HlsPlayer | null = null;
let activeAudioTrackId: TrackId | null = null;
let playbackToken = 0;
let playbackWatchdog: number | null = null;
let currentStreamOffset = 0;
let pendingSeekCleanup: (() => void) | null = null;
let equalizerState: EqualizerState = { ...DEFAULT_EQUALIZER, gains: [...DEFAULT_EQUALIZER.gains] };
const equalizerEngine = new EqualizerEngine(audioEl);

function applyEqualizerGains() {
  if (!hasPremiumAccess(currentAuthUser || getStoredAuthUser()) && equalizerState.enabled) {
    equalizerState = { ...equalizerState, enabled: false };
  }
  equalizerEngine.apply(equalizerState);
}

function syncPremiumControls(): void {
  const premium = hasPremiumAccess(currentAuthUser || getStoredAuthUser());
  const button = document.getElementById("hdrEqualizer");
  button?.classList.toggle("is-premium-locked", !premium);
  button?.setAttribute("aria-label", premium ? "Открыть эквалайзер" : "Эквалайзер — функция Premium");
}

function enforcePremiumAudioAccess(): void {
  if (!hasPremiumAccess(currentAuthUser || getStoredAuthUser()) && equalizerState.enabled) {
    equalizerState = { ...equalizerState, enabled: false };
  }
  applyEqualizerGains();
  syncPremiumControls();
}

async function ensureAudioGraph(): Promise<boolean> {
  return equalizerEngine.ensure(equalizerState);
}

function getTrack(id: TrackId | null | undefined): Track | undefined {
  if (!id) return undefined;
  return tracks.find((t) => t.id === id);
}

function metadataTrackCollections(): Track[][] {
  return [
    metadataFeed.recent,
    metadataFeed.random,
    metadataFeed.trending,
    metadataFeed.top,
    metadataFeed.mood,
    metadataFeed.ru,
    metadataFeed.global,
    metadataFeed.all,
    metadataFeed.personalized || [],
    metadataFeed.selectedArtists || [],
    metadataFeed.similarArtists || [],
    metadataFeed.genreRecommendations || [],
    metadataFeed.popularForYou || [],
    metadataFeed.exploration || [],
    ...(metadataFeed.sections || []).map((section) => section.tracks),
  ];
}

function setTrackLikedState(trackId: TrackId, liked: boolean): void {
  tracks.forEach((track) => {
    if (track.id === trackId) track.liked = liked;
  });
  metadataTrackCollections().forEach((collection) => collection.forEach((track) => {
    if (track.id === trackId) track.liked = liked;
  }));
}

function updateRenderedLikeButtons(trackId: TrackId, liked: boolean): void {
  document.querySelectorAll<HTMLButtonElement>(`[data-track-id="${CSS.escape(String(trackId))}"][aria-pressed]`).forEach((button) => {
    button.setAttribute("aria-pressed", String(liked));
    button.setAttribute("aria-label", liked ? "Убрать из избранного" : "Добавить в избранное");
    button.classList.toggle("text-red-400", liked);
    button.classList.toggle("text-white/30", !liked);
    button.querySelector("svg")?.setAttribute("fill", liked ? "currentColor" : "none");
  });
}

function mergeTracks(nextTracks: Track[]): Track[] {
  const likedIds = new Set(tracks.filter((track) => track.liked).map((track) => track.id));
  const byId = new Map(tracks.map((track) => [track.id, track]));
  nextTracks.forEach((track) => {
    byId.set(track.id, { ...byId.get(track.id), ...track, liked: likedIds.has(track.id) || !!byId.get(track.id)?.liked || track.liked });
  });
  tracks = [...byId.values()];
  return nextTracks.map((track) => getTrack(track.id) || track);
}

function canPlayTrack(track: Track | undefined): track is Track {
  return Boolean(track?.isPlayable && (track.audioSrc || track.sourceUrl));
}

function normalizeTrackId(value: unknown): TrackId | null {
  if (value === null || value === undefined) return null;
  const raw = String(value);
  return LEGACY_TRACK_ID_MAP[raw] || raw;
}

function getElementTrackId(el: Element, attr = "data-id"): TrackId | null {
  return normalizeTrackId(el.getAttribute(attr));
}

function coverStyle(track: Track): string {
  return ` style="--cover-url: url('${escapeHtml(getTrackCoverUrl(track))}'); --cover-fallback-url: url('${escapeHtml(createFallbackCover(track))}')"`;
}

function renderCover(track: Track, className: string, iconClass = "", innerHtml = ""): string {
  const coverClass = "track-cover has-cover";
  return `<div class="${className} ${coverClass} bg-gradient-to-br ${track.gradient}"${coverStyle(track)}><span class="track-cover-icon ${iconClass}">${track.icon}</span>${innerHtml}</div>`;
}

function applyCoverToElement(el: HTMLElement, track: Track, className: string) {
  el.className = `${className} track-cover has-cover bg-gradient-to-br ${track.gradient}`;
  el.style.setProperty("--cover-url", `url("${getTrackCoverUrl(track)}")`);
  el.style.setProperty("--cover-fallback-url", `url("${createFallbackCover(track)}")`);
  el.innerHTML = `<span class="now-playing-glow absolute inset-0 rounded-xl"></span><span class="track-cover-icon">${track.icon}</span>`;
}

function getTrackCoverUrl(track: Track): string {
  return track.coverUrl || createFallbackCover(track);
}

function createFallbackCover(track: Track): string {
  const text = `${track.artist} ${track.title}`.trim() || "MD";
  const letters = (text.toUpperCase().match(/[A-ZА-ЯЁ0-9]/g) || ["M", "D"]).slice(0, 2).join("");
  const palettes = [
    ["101010", "2a2a2a", "f5f5f5"],
    ["0d0d0f", "312a25", "ffb86b"],
    ["08090c", "24352f", "8df5b5"],
    ["0b0b0e", "26233a", "b7a7ff"],
    ["090909", "3a2424", "ff7a7a"],
  ];
  const seed = [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const [start, end, ink] = palettes[seed % palettes.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#${start}"/><stop offset="1" stop-color="#${end}"/></linearGradient></defs><rect width="512" height="512" rx="68" fill="url(#g)"/><circle cx="398" cy="92" r="76" fill="#fff" opacity=".035"/><circle cx="108" cy="404" r="104" fill="#fff" opacity=".028"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="132" font-weight="800" fill="#${ink}">${escapeHtml(letters)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function announce(message: string) {
  appLiveRegion.textContent = "";
  window.setTimeout(() => { appLiveRegion.textContent = message; }, 20);
}

function syncAmbientForTrack(track: Track) {
  const seed = `${track.gradient}|${track.artist}|${track.title}`;
  const hash = [...seed].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 17);
  const hue = hash % 360;
  const secondaryHue = (hue + 58 + (hash % 43)) % 360;
  document.documentElement.style.setProperty("--ambient-primary", `hsla(${hue}, 82%, 64%, 0.19)`);
  document.documentElement.style.setProperty("--ambient-secondary", `hsla(${secondaryHue}, 88%, 62%, 0.11)`);
}

function syncNowPlayingUi(track: Track) {
  keepPlayerEmptyUntilSelection = false;
  nowPlayingTitle.textContent = track.title;
  nowPlayingArtist.textContent = track.artist;
  applyCoverToElement(nowPlayingArt, track, "w-12 h-12 rounded-xl shrink-0 flex items-center justify-center text-sm border border-white/10 relative overflow-hidden");
  applyCoverToElement(focusArt, track, "w-72 h-72 rounded-2xl shrink-0 border border-white/10 shadow-2xl flex items-center justify-center text-6xl relative overflow-hidden");
  focusTitle.textContent = track.title;
  focusArtist.textContent = track.artist;
  totalTimeEl.textContent = track.durationLabel;
  focusTotalTime.textContent = track.durationLabel;
  syncAmbientForTrack(track);
  nowPlayingFocus.setAttribute("aria-label", `Открыть полноэкранный плеер: ${track.title} — ${track.artist}`);
  [nowPlayingFocus, playBtn, prevBtn, nextBtn, likeBtn, queueBtn, focusPlayBtn, focusPrevBtn, focusNextBtn, focusQueueBtn, focusLikeBtn]
    .forEach((button) => button.toggleAttribute("disabled", false));
  updateLikeButton();
}

function resetPlayerForNewAccount() {
  stopAudio();
  keepPlayerEmptyUntilSelection = true;
  player.playing = false;
  player.buffering = false;
  player.currentTime = 0;
  player.currentTrackId = "";
  player.queue = [];
  player.queueIndex = -1;
  playbackHistoryGate.reset();
  playbackSessionTracker.reset();

  document.querySelector<HTMLButtonElement>(".queue-close")?.click();
  if (focusOverlay.classList.contains("active")) closeFocusPlayer();

  nowPlayingTitle.textContent = "Выберите трек";
  nowPlayingArtist.textContent = "Музыка появится здесь";
  nowPlayingArt.className = "w-12 h-12 rounded-xl shrink-0 flex items-center justify-center text-lg border border-white/10 relative overflow-hidden player-empty-art";
  nowPlayingArt.style.removeProperty("--cover-url");
  nowPlayingArt.innerHTML = "<span aria-hidden=\"true\">♪</span>";
  focusTitle.textContent = "Выберите трек";
  focusArtist.textContent = "Музыка появится здесь";
  focusArt.className = "w-72 h-72 rounded-2xl shrink-0 border border-white/10 shadow-2xl flex items-center justify-center text-6xl relative overflow-hidden player-empty-art";
  focusArt.style.removeProperty("--cover-url");
  focusArt.innerHTML = "<span aria-hidden=\"true\">♪</span>";
  nowPlayingFocus.setAttribute("aria-label", "Плеер пуст — выберите трек");

  currentTimeEl.textContent = "0:00";
  totalTimeEl.textContent = "0:00";
  focusCurrentTime.textContent = "0:00";
  focusTotalTime.textContent = "0:00";
  updatePlayIcon();
  updateAllTimelines();
  updateActiveTrackHighlight();
  [nowPlayingFocus, playBtn, prevBtn, nextBtn, likeBtn, queueBtn, focusPlayBtn, focusPrevBtn, focusNextBtn, focusQueueBtn, focusLikeBtn]
    .forEach((button) => button.toggleAttribute("disabled", true));
}

function showTrackNotice(message = "Аудио пока недоступно") {
  let notice = document.querySelector<HTMLElement>(".track-toast");
  if (!notice) {
    notice = document.createElement("div");
    notice.className = "track-toast";
    document.body.appendChild(notice);
  }
  notice.textContent = message;
  notice.setAttribute("role", "status");
  notice.classList.add("is-visible");
  announce(message);
  if (trackNoticeTimer !== null) window.clearTimeout(trackNoticeTimer);
  trackNoticeTimer = window.setTimeout(() => notice?.classList.remove("is-visible"), 2200);
}

function activateTrack(trackList: Track[], id: TrackId) {
  setQueueFromTracks(trackList, id);
  loadTrackById(id, false);
  const track = getTrack(id);
  if (canPlayTrack(track)) {
    playPause();
    return;
  }
  showTrackNotice("Аудио пока недоступно");
  switchPage("track", id);
}

function playTrackInline(trackList: Track[], id: TrackId) {
  setQueueFromTracks(trackList, id);
  loadTrackById(id, false);
  const track = getTrack(id);
  if (canPlayTrack(track)) {
    playPause();
    return;
  }
  showTrackNotice("Аудио пока недоступно");
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function updatePlayIcon() {
  const icon = player.buffering
    ? `<circle class="player-loading-ring" cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="28 16"/>`
    : player.playing
      ? `<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>`
      : `<path d="M8 5v14l11-7z" fill="currentColor"/>`;
  playIcon.innerHTML = icon;
  focusPlayIcon.innerHTML = icon;
  const label = player.buffering ? "Отменить загрузку" : player.playing ? "Пауза" : "Воспроизвести";
  playBtn.setAttribute("aria-label", label);
  focusPlayBtn.setAttribute("aria-label", label);
  playBtn.setAttribute("aria-busy", String(player.buffering));
  focusPlayBtn.setAttribute("aria-busy", String(player.buffering));
}

function clearPlaybackBuffering() {
  if (playbackWatchdog !== null) {
    window.clearTimeout(playbackWatchdog);
    playbackWatchdog = null;
  }
  player.buffering = false;
}

function beginPlaybackBuffering(token: number) {
  clearPlaybackBuffering();
  player.buffering = true;
  updatePlayIcon();
  playbackWatchdog = window.setTimeout(() => {
    if (token !== playbackToken || !player.buffering) return;
    stopAudio();
    player.playing = false;
    updatePlayIcon();
    showTrackNotice("Сервер не ответил. Попробуйте ещё раз");
  }, 75000);
}

const streamTicketCache = new Map<TrackId, { ticket: string; expiresAt: number }>();

async function getTrackPlaybackUrl(track: Track): Promise<string | null> {
  if (track.audioSrc) return track.audioSrc;
  if (!track.sourceUrl) return null;
  const trackStreamMatch = track.sourceUrl.match(/\/api\/stream\/track\/(\d+)/);
  if (trackStreamMatch && getAuthToken()) {
    const trackId = trackStreamMatch[1];
    const cached = streamTicketCache.get(track.id);
    let ticket = cached?.ticket;
    if (!ticket || !cached || cached.expiresAt <= Date.now() + 10_000) {
      const issued = await createStreamTicket(trackId);
      ticket = issued.ticket;
      streamTicketCache.set(track.id, { ticket, expiresAt: Date.now() + issued.expires_in * 1000 });
    }
    const url = track.sourceUrl.startsWith("/") ? `${API_BASE_URL}${track.sourceUrl}` : track.sourceUrl;
    const parsed = new URL(url);
    parsed.searchParams.set("stream_ticket", ticket);
    return parsed.toString();
  }
  let url: string;
  if (track.sourceUrl.startsWith(API_BASE_URL) || track.sourceUrl.startsWith("/api/")) {
    url = track.sourceUrl.startsWith("/") ? `${API_BASE_URL}${track.sourceUrl}` : track.sourceUrl;
  } else {
    url = `${API_BASE_URL}/api/stream?url=${encodeURIComponent(track.sourceUrl)}`;
  }
  return withAppToken(url);
}

function getCurrentDuration(track: Track): number {
  const mediaDuration = activeAudioTrackId === track.id ? audioEl.duration : Number.NaN;
  return Number.isFinite(mediaDuration) && mediaDuration > 0 ? mediaDuration : track.duration;
}

const playbackHistoryGate = new PlaybackCycleGate();
const playbackSessionTracker = new PlaybackSessionTracker();
let recommendationRefreshTimer: number | null = null;
let recommendationFeedStale = false;
let listeningClockStartedAt: number | null = null;
let pendingListeningMilliseconds = 0;
let listeningSyncInFlight = false;
const preparedTrackIds = new Set<TrackId>();
let activePreparationTrackId: TrackId | null = null;
let queuedPreparationTrackId: TrackId | null = null;
const warmupPreparationTrackIds: TrackId[] = [];

function runQueuedTrackPreparation() {
  if (activePreparationTrackId) return;
  const trackId = queuedPreparationTrackId || warmupPreparationTrackIds.shift() || null;
  if (!trackId) return;
  queuedPreparationTrackId = null;
  if (preparedTrackIds.has(trackId) || trackId === activeAudioTrackId) {
    runQueuedTrackPreparation();
    return;
  }
  activePreparationTrackId = trackId;
  prepareTrackPlayback(trackId)
    .then(() => preparedTrackIds.add(trackId))
    .catch(() => undefined)
    .finally(() => {
      activePreparationTrackId = null;
      runQueuedTrackPreparation();
    });
}

function schedulePopularTrackWarmup(items: Track[]) {
  if (!getPlayerSettings().prefetch || !getAuthToken()) return;
  // A single low-priority candidate is enough on the 1 vCPU test server.
  // Preparing six full MP3 files on page load starved the track the user
  // actually selected.
  items.slice(0, 1).forEach((track) => {
    if (!/^\d+$/.test(String(track.id)) || preparedTrackIds.has(track.id)) return;
    if (activePreparationTrackId === track.id || warmupPreparationTrackIds.includes(track.id)) return;
    warmupPreparationTrackIds.push(track.id);
  });
  runQueuedTrackPreparation();
}

function prepareTrackInBackground(trackId: TrackId | null | undefined) {
  if (!trackId || !getPlayerSettings().prefetch || !getAuthToken() || !/^\d+$/.test(String(trackId))) return;
  if (preparedTrackIds.has(trackId) || activePreparationTrackId === trackId || trackId === activeAudioTrackId) return;
  // Keep only the latest intent. Moving over a long list must not launch a
  // separate FFmpeg process for every row the pointer crossed.
  queuedPreparationTrackId = trackId;
  runQueuedTrackPreparation();
}

function prepareNextQueuedTrack() {
  if (!getPlayerSettings().prefetch || player.shuffle || player.queue.length === 0) return;
  const currentIndex = Math.max(0, player.queueIndex);
  prepareTrackInBackground(player.queue[currentIndex + 1]);
}

function pushRecentTrack(track: Track) {
  metadataFeed = {
    ...metadataFeed,
    recent: [track, ...metadataFeed.recent.filter((item) => item.id !== track.id)].slice(0, 36),
    all: metadataFeed.all.some((item) => item.id === track.id) ? metadataFeed.all : [track, ...metadataFeed.all],
  };
  if (currentPage === "home") switchPage("home", null, true);
}

function queueRecommendationRefresh() {
  if (recommendationRefreshTimer !== null) window.clearTimeout(recommendationRefreshTimer);
  recommendationRefreshTimer = window.setTimeout(() => {
    recommendationRefreshTimer = null;
    recommendationFeedStale = true;
    invalidateHomeFeedCache(currentAuthUser?.id);
    if (currentPage === "home") {
      recommendationFeedStale = false;
      refreshMetadataFeed(1, metadataFeedGeneration);
    }
  }, 1800);
}

function submitFinalizedPlayback(event: PlaybackSessionEvent | null, keepalive = false) {
  if (!event || !getAuthToken() || !/^\d+$/.test(String(event.trackId))) return;
  const safeEvent: PlaybackSessionEvent = {
    ...event,
    artistId: event.artistId && /^\d+$/.test(String(event.artistId)) ? event.artistId : null,
  };
  try {
    void submitPlaybackEvent(safeEvent, { keepalive })
      .then(() => { if (!keepalive) queueRecommendationRefresh(); })
      .catch(() => undefined);
  } catch {
    /* non-catalog fallback tracks are intentionally not sent */
  }
}

function finalizePlaybackSession(reason: PlaybackEndReason) {
  submitFinalizedPlayback(playbackSessionTracker.finalize(reason), reason === "pagehide");
}

function beginPlaybackSession(track: Track) {
  submitFinalizedPlayback(playbackSessionTracker.begin({
    trackId: track.id,
    artistId: track.artistId || track.artists?.[0]?.id || null,
    trackDuration: getCurrentDuration(track),
    context: currentPage || "unknown",
    recommendationType: track.recommendationType || null,
    recommendationReason: track.recommendationReason || null,
    algorithmVersion: track.algorithmVersion || metadataFeed.algorithmVersion || null,
    playing: true,
  }));
}

function recordActiveTrackPlay() {
  const trackId = activeAudioTrackId;
  if (!trackId) return;
  const playbackCycle = playbackHistoryGate.claim();
  if (playbackCycle === null) return;

  const localTrack = getTrack(trackId);
  if (localTrack) {
    pushRecentTrack(localTrack);
    beginPlaybackSession(localTrack);
  }

  recordTrackPlay(trackId)
    .then((backendTrack) => {
      const [updatedTrack] = mergeTracks([mapBackendTrack(backendTrack)]);
      if (updatedTrack) pushRecentTrack(updatedTrack);
    })
    .catch(() => {
      playbackHistoryGate.release(playbackCycle);
    });
}

function startListeningClock() {
  if (listeningClockStartedAt === null) listeningClockStartedAt = Date.now();
}

function captureListeningElapsed() {
  if (listeningClockStartedAt === null) return;
  const now = Date.now();
  pendingListeningMilliseconds += Math.max(0, now - listeningClockStartedAt);
  listeningClockStartedAt = now;
}

function pauseListeningClock() {
  captureListeningElapsed();
  listeningClockStartedAt = null;
  void flushListeningProgress();
}

async function flushListeningProgress() {
  if (listeningClockStartedAt !== null) captureListeningElapsed();
  if (listeningSyncInFlight || !getAuthToken()) return;
  const seconds = Math.min(300, Math.floor(pendingListeningMilliseconds / 1000));
  if (seconds < 1) return;
  pendingListeningMilliseconds -= seconds * 1000;
  listeningSyncInFlight = true;
  try {
    const summary = await addListeningTime(seconds);
    applyHistorySummaryToProfile(summary);
  } catch {
    pendingListeningMilliseconds += seconds * 1000;
  } finally {
    listeningSyncInFlight = false;
  }
}

window.setInterval(() => {
  if (!audioEl.paused && activeAudioTrackId) void flushListeningProgress();
}, 10_000);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) void flushListeningProgress();
});
window.addEventListener("pagehide", () => {
  finalizePlaybackSession("pagehide");
  void flushListeningProgress();
});

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

function loadTrackById(id: TrackId, autoplay = player.playing) {
  keepPlayerEmptyUntilSelection = false;
  stopAudio("track_change");
  const track = getTrack(id);
  if (!track) return;
  const canPlay = canPlayTrack(track);
  player.playing = autoplay && canPlay;
  player.currentTrackId = id;
  syncNowPlayingUi(track);
  player.currentTime = 0;
  updatePlayIcon();
  updateAllTimelines();
  if (player.playing) startAudio(track);
  else if (autoplay && !canPlay) showTrackNotice();
  updateActiveTrackHighlight();
}

function playPause() {
  const track = getTrack(player.currentTrackId);
  if (!track) return;
  if (player.buffering) {
    stopAudio();
    player.playing = false;
    updatePlayIcon();
    announce("Загрузка отменена");
    return;
  }
  if (!canPlayTrack(track)) {
    player.playing = false;
    stopAudio();
    updatePlayIcon();
    showTrackNotice();
    return;
  }
  player.playing = !player.playing;
  updatePlayIcon();
  if (player.playing) {
    startAudio(track);
  } else {
    audioEl.pause();
  }
}

function updateAllTimelines() {
  const track = getTrack(player.currentTrackId);
  if (!track) {
    timelineFill.style.width = "0%";
    timelineThumb.style.left = "0%";
    currentTimeEl.textContent = "0:00";
    focusTimelineFill.style.width = "0%";
    focusTimelineThumb.style.left = "0%";
    focusCurrentTime.textContent = "0:00";
    timelineContainer.setAttribute("aria-valuenow", "0");
    timelineContainer.setAttribute("aria-valuetext", "0:00 из 0:00");
    focusTimeline.setAttribute("aria-valuenow", "0");
    focusTimeline.setAttribute("aria-valuetext", "0:00 из 0:00");
    return;
  }
  const duration = getCurrentDuration(track);
  const pct = duration > 0 ? Math.max(0, Math.min(1, player.currentTime / duration)) : 0;
  const ct = formatTime(player.currentTime);
  timelineFill.style.width = `${pct * 100}%`;
  timelineThumb.style.left = `${pct * 100}%`;
  currentTimeEl.textContent = ct;
  focusTimelineFill.style.width = `${pct * 100}%`;
  focusTimelineThumb.style.left = `${pct * 100}%`;
  focusCurrentTime.textContent = ct;
  const ariaPct = String(Math.round(pct * 100));
  const ariaText = `${ct} из ${formatTime(duration)}`;
  timelineContainer.setAttribute("aria-valuenow", ariaPct);
  timelineContainer.setAttribute("aria-valuetext", ariaText);
  focusTimeline.setAttribute("aria-valuenow", ariaPct);
  focusTimeline.setAttribute("aria-valuetext", ariaText);
}

function updateActiveTrackHighlight() {
  document.querySelectorAll<HTMLElement>("[data-id]").forEach((el) => {
    const active = el.getAttribute("data-id") === String(player.currentTrackId);
    el.classList.toggle("is-playing", active);
    if (active) el.setAttribute("aria-current", "true");
    else el.removeAttribute("aria-current");
  });
}

function playNext(autoplay = player.playing) {
  if (player.queue.length === 0) setQueueFromTracks(tracks, player.currentTrackId);
  if (player.queue.length > 0) {
    let idx = player.shuffle ? Math.floor(Math.random() * player.queue.length) : player.queueIndex + 1;
    if (player.shuffle && player.queue.length > 1 && player.queue[idx] === player.currentTrackId) idx = (idx + 1) % player.queue.length;
    if (idx >= player.queue.length) idx = player.repeat ? 0 : idx;
    if (idx < player.queue.length) {
      player.queueIndex = idx;
      loadTrackById(player.queue[idx], autoplay);
      return;
    }
  }
}

function playPrev(autoplay = player.playing) {
  if (player.queue.length === 0) setQueueFromTracks(tracks, player.currentTrackId);
  if (player.currentTime > 3) {
    seekActiveTrack(0);
    return;
  }
  if (player.queue.length > 0 && player.queueIndex > 0) {
    player.queueIndex--;
    loadTrackById(player.queue[player.queueIndex], autoplay);
    return;
  }
  if (player.repeat && player.queue.length > 0) {
    player.queueIndex = player.queue.length - 1;
    loadTrackById(player.queue[player.queueIndex], autoplay);
  }
}

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

function updateLikeButton() {
  const track = getTrack(player.currentTrackId);
  if (!track) return;
  const liked = track.liked;
  likeBtn.classList.toggle("text-red-400", liked);
  likeBtn.classList.toggle("text-white/30", !liked);
  focusLikeBtn.classList.toggle("text-red-400", liked);
  focusLikeBtn.classList.toggle("text-white/30", !liked);
  likeBtn.setAttribute("aria-pressed", String(liked));
  focusLikeBtn.setAttribute("aria-pressed", String(liked));
  likeBtn.querySelector("svg")?.setAttribute("fill", liked ? "currentColor" : "none");
  focusLikeBtn.querySelector("svg")?.setAttribute("fill", liked ? "currentColor" : "none");
  const label = liked ? "Убрать текущий трек из избранного" : "Добавить текущий трек в избранное";
  likeBtn.setAttribute("aria-label", label);
  focusLikeBtn.setAttribute("aria-label", label);
}

function toggleLike() {
  const track = getTrack(player.currentTrackId);
  if (!track) return;
  toggleTrackLike(track.id);
}

function toggleTrackLike(trackId: TrackId) {
  const track = getTrack(trackId);
  if (!track) return;
  setTrackLikedState(trackId, !track.liked);
  updateRenderedLikeButtons(trackId, track.liked);
  if (trackId === player.currentTrackId) updateLikeButton();
  if (currentPage === "favorites") renderFavorites();
  saveLikedTracks();
  if (/^\d+$/.test(String(trackId)) && getAuthToken()) {
    void setUserFavorite(trackId, track.liked)
      .then(() => queueRecommendationRefresh())
      .catch(() => undefined);
  }
}

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

let currentPage = "home";
let currentPageParam: string | null = null;
let currentPlaylistId: string | null = null;
let searchRequestToken = 0;
let activeSearchController: AbortController | null = null;
let activeSearchFallbackTimer: number | null = null;
let activeSearchPollTimer: number | null = null;
let metadataFeedGeneration = 0;
let recentScrollbarCleanup: (() => void) | null = null;

function cancelActiveSearchRequests() {
  activeSearchController?.abort();
  activeSearchController = null;
  if (activeSearchFallbackTimer !== null) window.clearTimeout(activeSearchFallbackTimer);
  if (activeSearchPollTimer !== null) window.clearTimeout(activeSearchPollTimer);
  activeSearchFallbackTimer = null;
  activeSearchPollTimer = null;
  searchSubmitBtn.setAttribute("aria-busy", "false");
}

function switchPage(pageId: string, extraParam: string | null = null, preserveScroll = false) {
  const content = document.getElementById("appContent")!;
  if (currentPage === "search" && (pageId !== "search" || extraParam !== currentPageParam)) {
    cancelActiveSearchRequests();
  }
  recentScrollbarCleanup?.();
  recentScrollbarCleanup = null;
  recommendationImpressionObserver?.disconnect();
  recommendationImpressionObserver = null;
  const previousScrollTop = content.scrollTop;
  currentPage = pageId;
  currentPageParam = extraParam;
  currentPlaylistId = pageId === "playlist" ? extraParam : null;
  document.body.dataset.page = pageId;
  content.setAttribute("aria-busy", "true");
  content.innerHTML = "";
  content.classList.remove("hidden");
  clearSearchBtn.classList.toggle("hidden", !searchInput.value.trim());
  highlightHeaderButton(pageId);

  switch (pageId) {
    case "home": renderHome(content); break;
    case "explore": renderExplore(content); break;
    case "favorites": renderFavoritesPage(content); break;
    case "notifications": renderNotifications(content); break;
    case "radio": renderRadio(content); break;
    case "profile": renderProfile(content); break;
    case "settings": renderSettings(content); break;
    case "playlist": renderPlaylistPage(content, extraParam); break;
    case "genre": renderGenrePage(content, extraParam); break;
    case "station": renderStationPage(content, extraParam); break;
    case "quick": renderQuickAccessPage(content, extraParam || "new"); break;
    case "artist": renderArtistPage(content, extraParam || ""); break;
    case "track": renderTrackDetailPage(content, extraParam || ""); break;
    case "search": renderSearchResults(content, extraParam || ""); break;
    default: renderHome(content);
  }
  enhanceDynamicAccessibility(content);
  updateSidebarActiveState();
  updateActiveTrackHighlight();
  content.scrollTop = preserveScroll ? previousScrollTop : 0;
  if (pageId !== "search") {
    window.requestAnimationFrame(() => content.setAttribute("aria-busy", "false"));
  }
  const pageLabels: Record<string, string> = {
    home: "Главная", explore: "Обзор", favorites: "Избранное", notifications: "Уведомления",
    radio: "Радио и миксы", profile: "Профиль", settings: "Настройки", playlist: "Плейлист",
    genre: "Жанр", station: "Радиостанция", quick: "Подборка", artist: "Исполнитель",
    track: "Трек", search: "Результаты поиска",
  };
  if (!preserveScroll) announce(`Открыта страница: ${pageLabels[pageId] || "Главная"}`);
  if (pageId === "home" && recommendationFeedStale) {
    recommendationFeedStale = false;
    refreshMetadataFeed(1, metadataFeedGeneration);
  }
}

function applyMetadataFeed(feed: MetadataFeed) {
  const currentId = player.currentTrackId;
  const previousCurrentTrack = getTrack(currentId);
  const likedIds = new Set(tracks.filter((track) => track.liked).map((track) => track.id));
  metadataFeed = { ...feed, errorMessage: feed.errorMessage || undefined };
  tracks = feed.all.map((track) => ({ ...track, liked: likedIds.has(track.id) }));
  if (previousCurrentTrack && !tracks.some((track) => track.id === previousCurrentTrack.id)) {
    tracks = [{ ...previousCurrentTrack, liked: likedIds.has(previousCurrentTrack.id) || previousCurrentTrack.liked }, ...tracks];
  }
  loadLikedTracks();
  const currentTrack = getTrack(currentId);
  const nextCurrent = currentTrack?.id || tracks[0]?.id;
  if (keepPlayerEmptyUntilSelection) {
    player.currentTrackId = "";
    player.queue = [];
    player.queueIndex = -1;
  } else if (nextCurrent && currentTrack) {
    player.currentTrackId = nextCurrent;
    setQueueFromTracks(tracks, nextCurrent);
    syncNowPlayingUi(currentTrack);
    updatePlayIcon();
    updateAllTimelines();
  } else if (nextCurrent) {
    player.currentTrackId = nextCurrent;
    setQueueFromTracks(tracks, nextCurrent);
    loadTrackById(nextCurrent, false);
  }
  switchPage(currentPage, currentPageParam, true);
}

function refreshMetadataFeed(attempt = 1, generation = metadataFeedGeneration) {
  loadHomeFeed()
    .then((feed) => {
      if (generation !== metadataFeedGeneration) return;
      const signature = (items: Track[]) => items.map((track) => [
        track.id,
        track.title,
        track.artist,
        track.recommendationType || "",
        track.recommendationReason || "",
        track.algorithmVersion || "",
        track.recommendationPosition ?? "",
      ].join(":")).join("|");
      const currentSignature = [
        signature(tracks),
        signature(metadataFeed.recent),
        signature(metadataFeed.personalized || []),
        signature(metadataFeed.top),
        signature(metadataFeed.trending),
        signature(metadataFeed.ru),
        signature(metadataFeed.global),
      ].join("::");
      const nextSignature = [
        signature(feed.all),
        signature(feed.recent),
        signature(feed.personalized || []),
        signature(feed.top),
        signature(feed.trending),
        signature(feed.ru),
        signature(feed.global),
      ].join("::");
      if (feed.source !== metadataFeed.source || feed.errorMessage !== metadataFeed.errorMessage || feed.personalizationActive !== metadataFeed.personalizationActive || feed.algorithmVersion !== metadataFeed.algorithmVersion || currentSignature !== nextSignature) {
        applyMetadataFeed(feed);
      }
      const nextPopular = selectPopularTracks(feed);
      schedulePopularTrackWarmup(nextPopular.length ? nextPopular : feed.all);
      if (feed.errorMessage && attempt < 8) {
        window.setTimeout(() => refreshMetadataFeed(attempt + 1, generation), 1500 * attempt);
      }
    })
    .catch(() => {
      if (generation === metadataFeedGeneration && attempt < 8) {
        window.setTimeout(() => refreshMetadataFeed(attempt + 1, generation), 1500 * attempt);
      }
    });
}

function authInitials(user: AuthUser | null): string {
  const seed = user?.nickname || user?.login || "M";
  return seed.trim().slice(0, 2).toUpperCase() || "M";
}

function setAuthFormMode(mode: "login" | "register") {
  const overlay = document.getElementById("authOverlay");
  if (!overlay) return;
  overlay.setAttribute("data-mode", mode);
  overlay.querySelectorAll<HTMLElement>(".auth-mode-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.mode === mode);
  });
  overlay.querySelector<HTMLElement>("#authNicknameWrap")?.classList.toggle("hidden", mode !== "register");
  const submit = overlay.querySelector<HTMLButtonElement>("#authSubmitBtn");
  if (submit) submit.textContent = mode === "register" ? "Создать аккаунт" : "Войти";
  const password = overlay.querySelector<HTMLInputElement>("#authPassword");
  if (password) password.autocomplete = mode === "register" ? "new-password" : "current-password";
}

function setAuthError(message = "") {
  const error = document.getElementById("authError");
  if (!error) return;
  error.textContent = message;
  error.classList.toggle("hidden", !message);
}

function ensureAuthOverlay(): HTMLElement {
  let overlay = document.getElementById("authOverlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "authOverlay";
  overlay.className = "auth-overlay";
  overlay.innerHTML = `
    <div class="auth-panel" role="dialog" aria-modal="true" aria-labelledby="authTitle">
      <div class="auth-brand">
        <div class="auth-logo">M</div>
        <div>
          <p class="auth-kicker">Million Music</p>
          <h1 id="authTitle">Доступ к музыке</h1>
        </div>
      </div>
      <p class="auth-copy">История, избранное и персональные рекомендации связаны с вашим аккаунтом.</p>
      <div class="auth-tabs">
        <button class="auth-mode-btn is-active" data-mode="login" type="button">Войти</button>
        <button class="auth-mode-btn" data-mode="register" type="button">Регистрация</button>
      </div>
      <form id="authForm" class="auth-form">
        <label>
          <span>Логин</span>
          <input id="authLogin" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="64" pattern="[A-Za-z0-9_.-]{3,64}" title="Только латинские буквы, цифры, точка, дефис и подчёркивание" required />
          <small>Латинские буквы, цифры, точка, дефис или подчёркивание</small>
        </label>
        <label id="authNicknameWrap" class="hidden">
          <span>Имя в приложении</span>
          <input id="authNickname" autocomplete="nickname" minlength="2" maxlength="96" />
        </label>
        <label>
          <span>Пароль</span>
          <input id="authPassword" type="password" autocomplete="current-password" minlength="6" maxlength="128" required />
        </label>
        <p id="authError" class="auth-error hidden" role="alert"></p>
        <button id="authSubmitBtn" type="submit">Войти</button>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelectorAll<HTMLButtonElement>(".auth-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => setAuthFormMode((btn.dataset.mode as "login" | "register") || "login"));
  });
  overlay.querySelector<HTMLFormElement>("#authForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mode = (overlay?.getAttribute("data-mode") as "login" | "register") || "login";
    const login = (overlay?.querySelector<HTMLInputElement>("#authLogin")?.value || "").trim();
    const nickname = (overlay?.querySelector<HTMLInputElement>("#authNickname")?.value || "").trim();
    const password = overlay?.querySelector<HTMLInputElement>("#authPassword")?.value || "";
    const submit = overlay?.querySelector<HTMLButtonElement>("#authSubmitBtn");
    setAuthError();
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Подключаемся…";
    }
    let payload: AuthResponse;
    try {
      payload = mode === "register"
        ? await registerAccount(login, nickname || login, password)
        : await loginAccount(login, password);
    } catch (error) {
      setAuthError(authFailureMessage(error, mode));
      if (submit) {
        submit.disabled = false;
        submit.textContent = mode === "register" ? "Создать аккаунт" : "Войти";
      }
      return;
    }

    // The server has already created/authenticated the account at this point.
    // A local player or cache initialization issue must never be presented as
    // a failed registration, otherwise users retry with an already-used login.
    currentAuthUser = payload.user;
    hideAuthScreen();
    if (mode === "register") {
      try {
        resetPlayerForNewAccount();
      } catch (error) {
        console.error("Failed to reset the player for a new account", error);
      }
    }
    try {
      bootstrapAuthenticatedApp();
    } catch (error) {
      console.error("Failed to initialize the authenticated app", error);
      hideAuthScreen();
      if (mode === "register" && payload.user.music_preferences_completed_at === null) {
        void showArtistOnboarding("onboarding");
      } else {
        showTrackNotice("Аккаунт готов. Перезапустите приложение, если данные не появились сразу");
      }
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = mode === "register" ? "Создать аккаунт" : "Войти";
      }
    }
  });
  setAuthFormMode("login");
  return overlay;
}

function showAuthScreen(message = "") {
  // A cached account can expire while the mandatory artist picker is open.
  // Always dismiss that dialog first so the sign-in form cannot be trapped
  // underneath an inert onboarding layer.
  hideArtistOnboarding();
  const overlay = ensureAuthOverlay();
  setAuthFormMode("login");
  overlay.classList.add("is-visible");
  document.body.classList.add("auth-locked");
  getAppShellRegions().forEach((element) => {
    element.inert = true;
    element.setAttribute("aria-hidden", "true");
  });
  setAuthError(message);
  window.setTimeout(() => overlay.querySelector<HTMLInputElement>("#authLogin")?.focus(), 50);
}

function hideAuthScreen() {
  document.getElementById("authOverlay")?.classList.remove("is-visible");
  document.body.classList.remove("auth-locked");
  const onboardingLocked = document.body.classList.contains("artist-onboarding-locked");
  getAppShellRegions().forEach((element) => {
    element.inert = onboardingLocked;
    if (onboardingLocked) element.setAttribute("aria-hidden", "true");
    else element.removeAttribute("aria-hidden");
  });
}

function getAppShellRegions(): HTMLElement[] {
  // Keep modal content out of the inert target set. Artist onboarding contains
  // its own semantic <header>/<footer>, so a global tag selector would make
  // the visible dialog actions impossible to click or reach by keyboard.
  return Array.from(document.querySelectorAll<HTMLElement>(
    "#appRoot > header, #appRoot > div > aside, #appContent, #appRoot > footer.player-bar, #appRoot > .mobile-nav",
  ));
}

function setArtistOnboardingLocked(locked: boolean) {
  document.body.classList.toggle("artist-onboarding-locked", locked);
  const shellLocked = locked || document.body.classList.contains("auth-locked");
  getAppShellRegions().forEach((element) => {
    element.inert = shellLocked;
    if (shellLocked) element.setAttribute("aria-hidden", "true");
    else element.removeAttribute("aria-hidden");
  });
}

function ensureArtistOnboardingOverlay(): HTMLElement {
  let overlay = document.getElementById("artistOnboardingOverlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "artistOnboardingOverlay";
  overlay.className = "artist-onboarding-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <section class="artist-onboarding-panel" role="dialog" aria-modal="true" aria-labelledby="artistOnboardingTitle">
      <header class="artist-onboarding-head">
        <div>
          <p class="artist-onboarding-kicker">Настроим вашу волну</p>
          <h1 id="artistOnboardingTitle">Кого вы любите слушать?</h1>
          <p>Выберите артистов — главная сразу станет персональной, а затем будет меняться вместе с вашей историей.</p>
        </div>
        <button id="artistOnboardingClose" class="artist-onboarding-close" type="button" aria-label="Закрыть">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </header>
      <div class="artist-onboarding-toolbar">
        <label class="artist-onboarding-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
          <span class="sr-only">Поиск артистов</span>
          <input id="artistOnboardingSearch" type="search" autocomplete="off" maxlength="128" placeholder="Найти артиста" />
        </label>
        <span id="artistOnboardingCounter" class="artist-onboarding-counter" aria-live="polite"></span>
      </div>
      <div id="artistOnboardingStatus" class="artist-onboarding-status" role="status"></div>
      <div id="artistOnboardingGrid" class="artist-onboarding-grid"></div>
      <button id="artistOnboardingMore" class="artist-onboarding-more" type="button">Показать ещё</button>
      <footer class="artist-onboarding-footer">
        <button id="artistOnboardingSkip" class="artist-onboarding-skip" type="button">Пропустить</button>
        <div class="artist-onboarding-footer-copy">
          <strong id="artistOnboardingHint"></strong>
          <span>Вы сможете изменить выбор в профиле</span>
        </div>
        <button id="artistOnboardingContinue" class="artist-onboarding-continue" type="button">Продолжить</button>
      </footer>
    </section>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector<HTMLInputElement>("#artistOnboardingSearch")?.addEventListener("input", (event) => {
    artistOnboardingState = setArtistSearch(artistOnboardingState, (event.currentTarget as HTMLInputElement).value);
    renderArtistOnboarding();
    if (artistSearchTimer !== null) window.clearTimeout(artistSearchTimer);
    artistSearchTimer = window.setTimeout(() => void loadArtistOnboardingPage(true), 320);
  });
  overlay.querySelector("#artistOnboardingMore")?.addEventListener("click", () => void loadArtistOnboardingPage(false));
  overlay.querySelector("#artistOnboardingContinue")?.addEventListener("click", () => void completeArtistOnboarding(false));
  overlay.querySelector("#artistOnboardingSkip")?.addEventListener("click", () => void completeArtistOnboarding(true));
  overlay.querySelector("#artistOnboardingClose")?.addEventListener("click", closeArtistOnboardingSettings);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay && artistOnboardingMode === "settings") closeArtistOnboardingSettings();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && artistOnboardingMode === "settings") {
      event.preventDefault();
      closeArtistOnboardingSettings();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...overlay!.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])")]
      .filter((element) => !element.hidden && !element.classList.contains("hidden"));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  return overlay;
}

function artistInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "♪";
}

function renderArtistOnboarding() {
  const overlay = ensureArtistOnboardingOverlay();
  const grid = overlay.querySelector<HTMLElement>("#artistOnboardingGrid");
  const status = overlay.querySelector<HTMLElement>("#artistOnboardingStatus");
  const counter = overlay.querySelector<HTMLElement>("#artistOnboardingCounter");
  const hint = overlay.querySelector<HTMLElement>("#artistOnboardingHint");
  const more = overlay.querySelector<HTMLButtonElement>("#artistOnboardingMore");
  const next = overlay.querySelector<HTMLButtonElement>("#artistOnboardingContinue");
  const skip = overlay.querySelector<HTMLButtonElement>("#artistOnboardingSkip");
  const close = overlay.querySelector<HTMLButtonElement>("#artistOnboardingClose");
  const selectedCount = artistOnboardingState.selectedIds.size;
  const shortfall = Math.max(0, artistOnboardingState.minimumSelection - selectedCount);

  if (counter) counter.textContent = `Выбрано: ${selectedCount}`;
  if (hint) hint.textContent = shortfall ? `Выберите ещё ${shortfall}` : selectedCount ? "Отличный выбор" : "Можно изменить позже";
  if (next) next.disabled = artistOnboardingMode === "onboarding" && !canContinueArtistOnboarding(artistOnboardingState);
  if (skip) skip.classList.toggle("hidden", artistOnboardingMode !== "onboarding");
  if (close) close.classList.toggle("hidden", artistOnboardingMode === "onboarding");
  if (more) {
    more.classList.toggle("hidden", !artistOnboardingState.hasMore || artistOnboardingState.items.length === 0);
    more.disabled = artistOnboardingState.loading;
    more.textContent = artistOnboardingState.loading ? "Загружаем…" : "Показать ещё";
  }
  if (status) {
    status.innerHTML = artistOnboardingState.error
      ? `<div class="artist-onboarding-error"><span>${escapeHtml(artistOnboardingState.error)}</span><button id="artistOnboardingRetry" type="button">Повторить</button></div>`
      : artistOnboardingState.loading && artistOnboardingState.items.length === 0
        ? `<div class="artist-onboarding-loading"><i></i><span>Собираем артистов разных жанров…</span></div>`
        : !artistOnboardingState.loading && artistOnboardingState.items.length === 0
          ? `<div class="artist-onboarding-empty"><strong>Ничего не найдено</strong><span>Попробуйте изменить запрос</span></div>`
          : "";
    status.querySelector("#artistOnboardingRetry")?.addEventListener("click", () => void loadArtistOnboardingPage(artistOnboardingState.page === 0));
  }
  if (!grid) return;
  grid.innerHTML = artistOnboardingState.items.map((artist) => {
    const selected = isArtistSelected(artistOnboardingState, artist.id);
    const imageUrl = resolveBackendImageUrl(artist.avatarUrl);
    return `
      <button class="artist-choice-card${selected ? " is-selected" : ""}" data-artist-choice="${artist.id}" type="button" aria-pressed="${String(selected)}" aria-label="${selected ? "Убрать" : "Выбрать"}: ${escapeHtml(artist.name)}">
        <span class="artist-choice-image">
          ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" decoding="async" />` : ""}
          <span>${escapeHtml(artistInitials(artist.name))}</span>
          <i aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6.5 12.5 3.5 3.5 7.5-8"/></svg></i>
        </span>
        <strong>${escapeHtml(artist.name)}</strong>
        <small>${artist.genres.slice(0, 2).map(escapeHtml).join(" · ") || `${artist.trackCount} треков`}</small>
      </button>
    `;
  }).join("");
  grid.querySelectorAll<HTMLButtonElement>("[data-artist-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const artistId = button.dataset.artistChoice;
      if (!artistId) return;
      artistOnboardingTouched = true;
      artistOnboardingState = toggleArtistSelection(artistOnboardingState, artistId);
      renderArtistOnboarding();
      window.requestAnimationFrame(() => {
        [...grid.querySelectorAll<HTMLButtonElement>("[data-artist-choice]")]
          .find((candidate) => candidate.dataset.artistChoice === artistId)
          ?.focus();
      });
    });
    button.querySelector<HTMLImageElement>("img")?.addEventListener("error", (event) => {
      (event.currentTarget as HTMLImageElement).hidden = true;
    }, { once: true });
  });
}

async function loadArtistOnboardingPage(reset: boolean) {
  if (artistOnboardingState.loading && !reset) return;
  const requestId = ++artistOnboardingRequest;
  const requestedSearch = artistOnboardingState.search;
  const page = reset ? 1 : Math.max(1, artistOnboardingState.page + 1);
  artistOnboardingState = beginArtistPageLoad(artistOnboardingState);
  renderArtistOnboarding();
  try {
    const response = await getOnboardingArtists({
      search: requestedSearch,
      page,
      limit: requestedSearch ? 1 : 24,
    });
    if (requestId !== artistOnboardingRequest) return;
    const localPage = artistOnboardingTouched
      ? { ...response, items: response.items.map((artist) => ({ ...artist, selected: artistOnboardingState.selectedIds.has(String(artist.id)) })) }
      : response;
    artistOnboardingState = mergeArtistPage(artistOnboardingState, localPage, requestedSearch);
    if (artistOnboardingMode === "onboarding" && typeof response.minimumRequired === "number") {
      artistOnboardingState = { ...artistOnboardingState, minimumSelection: response.minimumRequired };
    }
  } catch {
    if (requestId !== artistOnboardingRequest) return;
    artistOnboardingState = failArtistPageLoad(artistOnboardingState, "Не удалось загрузить артистов. Проверьте подключение.");
  }
  renderArtistOnboarding();
}

async function showArtistOnboarding(mode: "onboarding" | "settings") {
  const overlay = ensureArtistOnboardingOverlay();
  artistOnboardingReturnFocus = mode === "settings" && document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  artistOnboardingMode = mode;
  artistOnboardingTouched = false;
  const openingToken = ++artistOnboardingRequest;
  artistOnboardingState = createArtistOnboardingState<OnboardingArtist>({ minimumSelection: mode === "onboarding" ? 3 : 0 });
  overlay.classList.add("is-visible");
  overlay.setAttribute("aria-hidden", "false");
  setArtistOnboardingLocked(true);
  const input = overlay.querySelector<HTMLInputElement>("#artistOnboardingSearch");
  if (input) input.value = "";
  renderArtistOnboarding();
  window.setTimeout(() => input?.focus(), 50);
  if (mode === "settings") {
    try {
      const preferences = await getMusicPreferences();
      artistOnboardingState = {
        ...artistOnboardingState,
        selectedIds: new Set(preferences.selectedArtistIds.map(String)),
      };
    } catch {
      hideArtistOnboarding(true);
      showTrackNotice("Не удалось загрузить сохранённые предпочтения");
      return;
    }
  }
  if (openingToken !== artistOnboardingRequest || !overlay.classList.contains("is-visible")) return;
  await loadArtistOnboardingPage(true);
}

function hideArtistOnboarding(restoreFocus = false) {
  if (artistSearchTimer !== null) {
    window.clearTimeout(artistSearchTimer);
    artistSearchTimer = null;
  }
  artistOnboardingRequest++;
  const overlay = document.getElementById("artistOnboardingOverlay");
  overlay?.classList.remove("is-visible");
  overlay?.setAttribute("aria-hidden", "true");
  setArtistOnboardingLocked(false);
  const returnFocus = artistOnboardingReturnFocus;
  artistOnboardingReturnFocus = null;
  if (restoreFocus && returnFocus?.isConnected) {
    window.setTimeout(() => returnFocus.focus(), 0);
  }
}

function closeArtistOnboardingSettings() {
  if (artistOnboardingMode !== "settings") return;
  hideArtistOnboarding(true);
}

async function completeArtistOnboarding(skipped: boolean) {
  if (artistOnboardingMode !== "onboarding" && skipped) return;
  if (!skipped && artistOnboardingMode === "onboarding" && !canContinueArtistOnboarding(artistOnboardingState)) return;
  const overlay = ensureArtistOnboardingOverlay();
  const buttons = overlay.querySelectorAll<HTMLButtonElement>("button");
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const ids = skipped ? [] : selectedArtistIds(artistOnboardingState).map(Number).filter(Number.isInteger);
    const preferences = await saveMusicPreferences(ids, artistOnboardingMode, skipped);
    if (currentAuthUser && preferences.completedAt) {
      currentAuthUser = { ...currentAuthUser, music_preferences_completed_at: preferences.completedAt };
    }
    hideArtistOnboarding();
    invalidateHomeFeedCache(currentAuthUser?.id);
    metadataFeedGeneration++;
    switchPage(artistOnboardingMode === "settings" ? currentPage : "home", currentPageParam);
    refreshMetadataFeed(1, metadataFeedGeneration);
    void syncFavoritesWithBackend();
    showTrackNotice(skipped ? "Настроим рекомендации по вашей истории" : "Музыкальные предпочтения сохранены");
  } catch {
    showTrackNotice("Не удалось сохранить предпочтения");
    renderArtistOnboarding();
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
    renderArtistOnboarding();
  }
}

function logoutAccount() {
  stopAudio("track_change");
  currentAuthUser = null;
  clearAuthToken();
  hydrateAccountState(true);
  resetPlayerForNewAccount();
  showAuthScreen();
}

function bootstrapAuthenticatedApp() {
  if (!getAuthToken()) {
    showAuthScreen();
    return;
  }
  const cachedUser = getStoredAuthUser();
  const restoredFromCache = Boolean(cachedUser);
  if (cachedUser) {
    currentAuthUser = cachedUser;
    hydrateAccountState();
    hideAuthScreen();
    if (cachedUser.music_preferences_completed_at === null) {
      void showArtistOnboarding("onboarding");
    } else {
      switchPage(currentPage || "home", currentPageParam);
      refreshMetadataFeed();
      void syncFavoritesWithBackend();
    }
  }
  fetchCurrentUser()
    .then((user) => {
      const previousUserId = currentAuthUser?.id;
      currentAuthUser = user;
      if (previousUserId !== user.id) hydrateAccountState(true);
      else enforcePremiumAudioAccess();
      hideAuthScreen();
      if (user.music_preferences_completed_at === null) {
        if (!document.getElementById("artistOnboardingOverlay")?.classList.contains("is-visible")) {
          void showArtistOnboarding("onboarding");
        } else {
          setArtistOnboardingLocked(true);
        }
        return;
      }
      if (!restoredFromCache) {
        switchPage(currentPage || "home", currentPageParam);
        refreshMetadataFeed();
        void syncFavoritesWithBackend();
      } else if (currentPage === "profile") {
        switchPage("profile");
      }
    })
    .catch(() => {
      if (!getAuthToken()) {
        currentAuthUser = null;
        showAuthScreen("Сессия завершилась. Войдите снова.");
        return;
      }
      if (cachedUser) {
        currentAuthUser = cachedUser;
        hideAuthScreen();
        showTrackNotice("Сервер временно недоступен. Используем сохранённые данные");
        return;
      }
      showAuthScreen("Не удалось подключиться к серверу. Попробуйте снова.");
    });
}

function highlightHeaderButton(pageId: string) {
  const map: Record<string, string> = { home: "hdrHome", explore: "hdrExplore", favorites: "hdrFav", notifications: "hdrNotifications", radio: "hdrRadio", station: "hdrRadio", profile: "hdrProfile", settings: "hdrSettings" };
  const btnId = map[pageId];
  document.querySelectorAll<HTMLElement>(".hdr-btn").forEach((b) => {
    b.classList.remove("bg-white/10", "text-white");
    b.classList.add("bg-white/5", "text-white/70");
    b.removeAttribute("aria-current");
  });
  if (btnId) {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.classList.remove("bg-white/5", "text-white/70");
      btn.classList.add("bg-white/10", "text-white");
      btn.setAttribute("aria-current", "page");
    }
  }
  const mobileMap: Record<string, string> = { home: "mobileHome", explore: "mobileExplore", search: "mobileSearch", favorites: "mobileFavorites", profile: "mobileProfile" };
  document.querySelectorAll<HTMLElement>(".mobile-nav button").forEach((button) => {
    const active = button.id === mobileMap[pageId];
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

function renderTrackRow(t: Track, index: number, rowClass: string): string {
  return `
    <div class="${rowClass} group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-all duration-300 cursor-pointer active:scale-[0.99]" data-id="${t.id}" role="button" tabindex="0" aria-label="Воспроизвести: ${escapeHtml(t.title)} — ${escapeHtml(t.artist)}">
      <span class="text-xs text-white/30 w-6 text-center">${index + 1}</span>
      ${renderCover(t, "w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-sm")}
      <div class="flex-1 min-w-0">
        <p class="track-title-selectable text-sm font-medium truncate">${escapeHtml(t.title)}</p>
        <p class="text-xs text-white/40 truncate">${escapeHtml(t.artist)} · ${escapeHtml(t.album)}</p>
      </div>
      <button class="row-like-btn playlist-row-btn ${t.liked ? "text-red-400 opacity-100" : "opacity-0 group-hover:opacity-100"}" data-track-id="${t.id}" type="button" title="Лайк" aria-label="${t.liked ? "Убрать из избранного" : "Добавить в избранное"}: ${escapeHtml(t.title)}" aria-pressed="${String(t.liked)}">
        <svg class="w-4 h-4" fill="${t.liked ? "currentColor" : "none"}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
      </button>
      <button class="row-add-btn playlist-row-btn opacity-0 group-hover:opacity-100" data-track-id="${t.id}" type="button" title="Добавить в плейлист" aria-label="Добавить в плейлист: ${escapeHtml(t.title)}">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
      </button>
      <span class="text-xs text-white/30 tabular-nums w-12 text-right">${t.durationLabel}</span>
    </div>
  `;
}

function wireTrackRows(container: HTMLElement, selector: string, trackList: Track[], rerender?: () => void) {
  container.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const id = getElementTrackId(el);
      if (id) activateTrack(trackList, id);
    });
    el.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if ((event.target as HTMLElement).closest("button")) return;
      event.preventDefault();
      const id = getElementTrackId(el);
      if (id) activateTrack(trackList, id);
    });
  });
  container.querySelectorAll<HTMLElement>(".row-like-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const trackId = getElementTrackId(btn, "data-track-id");
      if (trackId) toggleTrackLike(trackId);
      rerender?.();
    });
  });
  container.querySelectorAll<HTMLElement>(".row-add-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const trackId = getElementTrackId(btn, "data-track-id");
      if (trackId) showPlaylistPopup(btn, trackId);
    });
  });
  updateActiveTrackHighlight();
}

function enhanceDynamicAccessibility(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>("[data-id]").forEach((element) => {
    if (element.matches("button, [role]")) return;
    const track = getTrack(getElementTrackId(element));
    element.setAttribute("role", "button");
    element.tabIndex = 0;
    element.setAttribute("aria-label", track ? `Воспроизвести: ${track.title} — ${track.artist}` : "Открыть трек");
    if (element.dataset.keyboardReady === "true") return;
    element.dataset.keyboardReady = "true";
    element.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if ((event.target as HTMLElement).closest("button")) return;
      event.preventDefault();
      element.click();
    });
  });

  container.querySelectorAll<HTMLElement>(".station-card, .quick-card, [data-playlist-card]").forEach((element) => {
    if (element.matches("button, [role]")) return;
    element.setAttribute("role", "button");
    element.tabIndex = 0;
    if (element.dataset.keyboardReady === "true") return;
    element.dataset.keyboardReady = "true";
    element.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      element.click();
    });
  });
}

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

function renderCardTrackActions(track: Track): string {
  return `
    <div class="track-card-actions">
      <button class="card-like-btn playlist-row-btn" data-track-id="${track.id}" type="button" title="${track.liked ? "Убрать из избранного" : "Добавить в избранное"}" aria-label="${track.liked ? "Убрать из избранного" : "Добавить в избранное"}: ${escapeHtml(track.title)}" aria-pressed="${String(track.liked)}">
        <svg class="w-4 h-4" fill="${track.liked ? "currentColor" : "none"}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
      </button>
      <button class="card-add-btn playlist-row-btn" data-track-id="${track.id}" type="button" title="Добавить в плейлист" aria-label="Добавить в плейлист: ${escapeHtml(track.title)}">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
      </button>
    </div>
  `;
}

function wireCardTrackActions(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>(".card-add-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const trackId = getElementTrackId(button, "data-track-id");
      if (trackId) showPlaylistPopup(button, trackId);
    });
  });
  container.querySelectorAll<HTMLElement>(".card-like-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const trackId = getElementTrackId(button, "data-track-id");
      if (trackId) toggleTrackLike(trackId);
    });
  });
}

function renderHomeTrackRail(title: string, items: Track[], showRecommendationReason = false): string {
  if (!items.length) return "";
  return `
    <section class="home-rail-section">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-base font-semibold tracking-wide">${title}</h2>
        <span class="text-xs text-white/35">${items.length}</span>
      </div>
      <div class="home-compact-rail">
        ${items.map((t, index) => {
          const secondaryText = showRecommendationReason && t.recommendationReason
            ? t.recommendationReason
            : t.artist;
          return `
            <div class="home-compact-card group cursor-pointer" data-id="${t.id}"${showRecommendationReason ? ` data-track-queue="personalized" data-recommendation-position="${index}"` : ""} aria-label="${escapeHtml(`${t.title}. ${secondaryText}`)}">
              ${renderCover(t, "w-12 h-12 rounded-lg shrink-0 flex items-center justify-center text-sm")}
              <div class="min-w-0 flex-1">
                <p class="track-title-selectable text-sm font-medium truncate">${escapeHtml(t.title)}</p>
                <p class="text-xs text-white/40 truncate" title="${escapeHtml(secondaryText)}">${escapeHtml(secondaryText)}</p>
              </div>
              ${renderCardTrackActions(t)}
              <span class="text-xs text-white/30 tabular-nums">${t.durationLabel}</span>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function recordRecommendationImpression(track: Track, position: number) {
  if (!/^\d+$/.test(String(track.id)) || !track.recommendationType) return;
  const impressionKey = `${metadataFeed.loadedAt}:${track.id}:${position}`;
  if (recommendationImpressions.has(impressionKey)) return;
  recommendationImpressions.add(impressionKey);
  void postFeedEvent({
    eventId: `impression-${metadataFeed.loadedAt}-${track.id}-${position}`,
    trackId: track.id,
    eventType: "recommendation_impression",
    position,
    recommendationType: track.recommendationType,
    reason: track.recommendationReason || null,
    algorithmVersion: track.algorithmVersion || metadataFeed.algorithmVersion || "personalized-v2",
    context: "home",
  }).catch(() => undefined);
}

function observeRecommendationImpressions(container: HTMLElement, personalized: Track[]) {
  const elements = [...container.querySelectorAll<HTMLElement>("[data-recommendation-position]")];
  if (!elements.length) return;
  if (!("IntersectionObserver" in window)) {
    elements.slice(0, 4).forEach((element) => {
      const position = Number(element.dataset.recommendationPosition);
      const track = personalized[position];
      if (track) recordRecommendationImpression(track, position);
    });
    return;
  }
  recommendationImpressionObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || entry.intersectionRatio < 0.55) return;
      const element = entry.target as HTMLElement;
      const position = Number(element.dataset.recommendationPosition);
      const track = personalized[position];
      if (track && String(track.id) === String(element.dataset.id)) {
        recordRecommendationImpression(track, position);
      }
      observer.unobserve(element);
    });
  }, { root: container, threshold: 0.55 });
  elements.forEach((element) => recommendationImpressionObserver?.observe(element));
}

function renderHome(container: HTMLElement) {
  recommendationImpressionObserver?.disconnect();
  recommendationImpressionObserver = null;
  const recent = metadataFeed.recent.slice(0, 32);
  const personalized = (metadataFeed.personalized || []).slice(0, 24);
  const ru = metadataFeed.ru.slice(0, 12);
  const global = metadataFeed.global.slice(0, 12);
  const popular = selectPopularTracks(metadataFeed);
  popularVisibleCount = Math.max(POPULAR_INITIAL_RENDER, Math.min(popularVisibleCount, popular.length || POPULAR_INITIAL_RENDER));
  const visiblePopular = popular.slice(0, popularVisibleCount);
  const status = metadataFeed.errorMessage ? `<div class="backend-status mb-5">${escapeHtml(metadataFeed.errorMessage)}</div>` : "";
  const heroTrack = personalized[0] || popular[0] || recent[0] || tracks[0];
  const hero = heroTrack ? `
    <section class="home-hero-prism">
      <div class="home-hero-copy">
        <p class="home-hero-kicker">Твоя волна · прямо сейчас</p>
        <h1>Музыка, которая остаётся с тобой</h1>
        <p>Живые рекомендации, быстрый поиск и твоя библиотека — в одном личном пространстве без визуального шума.</p>
        <div class="home-hero-actions">
          <button id="homeHeroPlay" type="button">Слушать волну</button>
          <button id="homeHeroExplore" type="button">Открыть подборки</button>
        </div>
      </div>
      ${renderCover(heroTrack, "home-hero-art flex items-center justify-center text-6xl")}
    </section>
  ` : "";

  container.innerHTML = `
    ${hero}
    ${status}
    ${renderHomeTrackRail(metadataFeed.personalizationActive ? "Для тебя" : "Начните отсюда", personalized, true)}
    <section class="mb-8">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-semibold tracking-wide">Недавнее</h2>
        <button class="seeAllHome text-sm text-white/40 hover:text-white/60 transition-all duration-300 cursor-pointer active:scale-95">Все</button>
      </div>
      <div class="recent-scroll-wrapper">
        <div class="recent-track-list" id="recentTrackList">
          ${recent.map((t) => `
            <div class="track-card-lg group cursor-pointer border border-white/10" data-id="${t.id}">
              ${renderCover(t, "aspect-square rounded-xl mb-3 relative overflow-hidden", "", `
                <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center">
                  <button class="card-play-btn w-12 h-12 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-lg cursor-pointer hover:scale-110" data-track-id="${t.id}" type="button" title="Play" aria-label="Play">
                    <svg class="w-5 h-5 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                </div>
              `)}
              <div class="flex items-start gap-2">
                <div class="min-w-0 flex-1">
                  <p class="track-title-selectable text-sm font-medium truncate">${escapeHtml(t.title)}</p>
                  <p class="text-xs text-white/40 truncate">${escapeHtml(t.artist)}</p>
                </div>
                ${renderCardTrackActions(t)}
              </div>
            </div>
          `).join("")}
        </div>
        <div class="recent-scrollbar mt-2"><div class="recent-scrollbar-thumb" style="width:20%"></div></div>
      </div>
    </section>
    <section class="mb-8" aria-labelledby="popularTracksTitle" aria-describedby="popularTracksDescription">
      <div class="flex items-end justify-between gap-4 mb-4">
        <div class="min-w-0">
          <h2 id="popularTracksTitle" class="text-base font-semibold tracking-wide">Популярные треки</h2>
          <p id="popularTracksDescription" class="mt-1 text-xs text-white/45">Чарт на основе популярности артистов и реальных прослушиваний</p>
        </div>
        <span class="shrink-0 text-xs text-white/45 tabular-nums" aria-label="Показано ${visiblePopular.length} из ${popular.length} треков">${visiblePopular.length} / ${popular.length}</span>
      </div>
      <div class="random-grid" aria-label="Рейтинг популярных треков: ${popular.length}">
        ${visiblePopular.map((t, index) => `
          <div class="random-card group cursor-pointer border border-white/10 active:scale-[0.98]" data-id="${t.id}" data-track-queue="popular" aria-label="${escapeHtml(`${index + 1} место. ${t.title}, ${t.artist}`)}">
            ${renderCover(t, "w-14 h-14 rounded-xl shrink-0 flex items-center justify-center text-2xl")}
            <span class="popular-rank${index < 3 ? " is-top" : ""}" aria-hidden="true">${index + 1}</span>
            <div class="min-w-0 flex-1"><p class="track-title-selectable text-sm font-medium truncate">${escapeHtml(t.title)}</p><p class="text-xs text-white/40 truncate">${escapeHtml(t.artist)}</p></div>
            ${renderCardTrackActions(t)}
            <span class="text-xs text-white/30 tabular-nums">${t.durationLabel}</span>
          </div>
        `).join("")}
        ${visiblePopular.length < popular.length ? `
          <button class="popular-load-more" type="button" data-popular-load-more>
            <span>Показать ещё</span>
            <small>${Math.min(POPULAR_RENDER_STEP, popular.length - visiblePopular.length)} треков</small>
          </button>
        ` : popular.length ? "" : `<p class="col-span-full rounded-xl border border-white/10 px-4 py-5 text-sm text-white/55" role="status">Популярные треки пока недоступны. Обновим чарт автоматически.</p>`}
      </div>
    </section>
    <div class="home-extra-sections">
      ${renderHomeTrackRail("RU волна", ru)}
      ${renderHomeTrackRail("EU / Global", global)}
    </div>
  `;

  container.querySelectorAll<HTMLElement>("[data-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const id = getElementTrackId(el);
      if (!id) return;
      const queue = el.dataset.trackQueue === "popular"
        ? popular
        : el.dataset.trackQueue === "personalized"
          ? personalized
          : tracks;
      activateTrack(queue, id);
    });
  });
  wireCardTrackActions(container);
  if (recommendationImpressions.size > 1200) recommendationImpressions.clear();
  observeRecommendationImpressions(container, personalized);
  container.querySelectorAll<HTMLElement>(".card-play-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const trackId = getElementTrackId(btn, "data-track-id");
      if (trackId) playTrackInline(recent, trackId);
    });
  });

  container.querySelector(".seeAllHome")?.addEventListener("click", () => switchPage("explore"));
  container.querySelector("#homeHeroPlay")?.addEventListener("click", () => {
    if (!heroTrack) return;
    const heroQueue = personalized.some((track) => track.id === heroTrack.id)
      ? personalized
      : popular.length
        ? popular
        : tracks;
    activateTrack(heroQueue, heroTrack.id);
  });
  container.querySelector("#homeHeroExplore")?.addEventListener("click", () => switchPage("explore"));
  setupPopularLoadMore(container, popular.length);
  enhanceDynamicAccessibility(container);

  setTimeout(initScrollbar, 50);
}

function setupPopularLoadMore(container: HTMLElement, totalPopular: number) {
  const loadMore = container.querySelector<HTMLButtonElement>("[data-popular-load-more]");
  if (!loadMore) return;
  const revealMore = () => {
    if (popularVisibleCount >= totalPopular) return;
    popularVisibleCount = Math.min(totalPopular, popularVisibleCount + POPULAR_RENDER_STEP);
    renderHome(container);
  };
  loadMore.addEventListener("click", revealMore);
}

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

function renderExplore(container: HTMLElement) {
  const recentGenres = new Set(metadataFeed.recent.map((track) => track.genre).filter(Boolean));
  const priorityNew = tracks
    .filter((track) => PRIORITY_ARTISTS.some((artist) => track.artist.toLowerCase().includes(artist)))
    .slice(0, 18);
  const likedBased = tracks
    .filter((track) => recentGenres.size === 0 ? priorityNew.some((item) => item.id === track.id) : recentGenres.has(track.genre))
    .filter((track) => !priorityNew.some((item) => item.id === track.id))
    .slice(0, 18);
  const dailyMixes = [
    { id: "night", title: "Поздний город", subtitle: "Темная мелодика, emo rap, ночной темп", tracks: tracks.filter((track) => /lil peep|kai angel|pharaoh|viperr/i.test(track.artist)).slice(0, 10) },
    { id: "drive", title: "Драйв без шума", subtitle: "Быстрые треки без блогерского мусора", tracks: tracks.filter((track) => ["hiphop", "rock", "electronic"].includes(track.genre)).slice(0, 10) },
    { id: "soft", title: "Мягкий фокус", subtitle: "Спокойные треки для фона и работы", tracks: tracks.filter((track) => ["lofi", "jazz", "pop"].includes(track.genre)).slice(0, 10) },
  ];
  const recommended = (metadataFeed.recent.length ? likedBased : priorityNew).slice(0, 12);

  container.innerHTML = `
    <section class="smart-hero">
      <div>
        <p class="section-kicker">Персональные миксы дня</p>
        <h2>Живая подборка без случайного мусора</h2>
        <p>Миксы собираются из чистой музыкальной базы, приоритетных артистов и вашей реальной истории прослушиваний.</p>
      </div>
      <button id="generateDailyMixBtn" type="button">Сгенерировать микс дня</button>
    </section>

    <section class="smart-mix-grid">
      ${dailyMixes.map((mix) => `
        <button class="smart-mix-card" type="button" data-mix="${mix.id}">
          <span>${mix.title}</span>
          <small>${mix.subtitle}</small>
          <strong>${mix.tracks.length} tracks</strong>
        </button>
      `).join("")}
    </section>

    <section class="home-rail-section">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-base font-semibold tracking-wide">Новое от приоритетных артистов</h2>
        <span class="text-xs text-white/35">${priorityNew.length}</span>
      </div>
      <div class="home-compact-rail">
        ${priorityNew.slice(0, 12).map((t) => `
          <div class="home-compact-card group cursor-pointer" data-id="${t.id}">
            ${renderCover(t, "w-12 h-12 rounded-lg shrink-0 flex items-center justify-center text-sm")}
            <div class="min-w-0 flex-1">
              <p class="track-title-selectable text-sm font-medium truncate">${escapeHtml(t.title)}</p>
              <p class="text-xs text-white/40 truncate">${escapeHtml(t.artist)}</p>
            </div>
            <span class="text-xs text-white/30 tabular-nums">${t.durationLabel}</span>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="home-rail-section">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-base font-semibold tracking-wide">Вам может понравиться</h2>
        <span class="text-xs text-white/35">${metadataFeed.recent.length ? "по истории" : "стартовая подборка"}</span>
      </div>
      ${recommended.length ? `
        <div class="home-compact-rail">
          ${recommended.map((t) => `
            <div class="home-compact-card group cursor-pointer" data-id="${t.id}">
              ${renderCover(t, "w-12 h-12 rounded-lg shrink-0 flex items-center justify-center text-sm")}
              <div class="min-w-0 flex-1">
                <p class="track-title-selectable text-sm font-medium truncate">${escapeHtml(t.title)}</p>
                <p class="text-xs text-white/40 truncate">${escapeHtml(t.artist)}</p>
              </div>
              <span class="text-xs text-white/30 tabular-nums">${t.durationLabel}</span>
            </div>
          `).join("")}
        </div>
      ` : `<div class="profile-empty-state">Здесь будет персональная подборка. Послушайте несколько треков, и она станет точнее.</div>`}
    </section>
  `;

  container.querySelectorAll<HTMLElement>(".smart-mix-card").forEach((el) => {
    el.addEventListener("click", () => {
      const mix = dailyMixes.find((item) => item.id === el.dataset.mix);
      if (mix?.tracks[0]) activateTrack(mix.tracks, mix.tracks[0].id);
      else showTrackNotice("Для этого микса пока мало треков");
    });
  });
  container.querySelectorAll<HTMLElement>("[data-id]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = getElementTrackId(el);
      if (id) activateTrack(tracks, id);
    });
  });
  document.getElementById("generateDailyMixBtn")?.addEventListener("click", () => {
    const pool = [...priorityNew, ...recommended].filter(Boolean);
    const shuffled = [...new Map(pool.map((track) => [track.id, track])).values()].sort(() => Math.random() - 0.5).slice(0, 18);
    if (!shuffled.length) {
      showTrackNotice("Микс появится после загрузки ленты");
      return;
    }
    showTrackNotice("Микс дня готов");
    activateTrack(shuffled, shuffled[0].id);
  });
}

function getQuickSection(id: string) {
  const sections: Record<string, { title: string; description: string; tracks: Track[] }> = {
    podcasts: {
      title: "Подкасты",
      description: "Разговорные выпуски пока представлены подборкой спокойных треков для фона.",
      tracks: (metadataFeed.mood.length ? metadataFeed.mood : tracks.filter((t) => ["lofi", "jazz"].includes(t.genre))).slice(0, 8),
    },
    soundtracks: {
      title: "Саундтреки",
      description: "Кинематографичные и инструментальные треки из текущей библиотеки.",
      tracks: tracks.filter((t) => ["classical", "electronic"].includes(t.genre) || t.tags.includes("cinematic") || t.tags.includes("soundtrack")).slice(0, 8),
    },
    new: {
      title: "Новинки",
      description: "Свежая полка из последних добавленных треков.",
      tracks: (metadataFeed.recent.length ? metadataFeed.recent : tracks).slice(0, 10),
    },
    charts: {
      title: "Чарты",
      description: "Самые заметные треки по длительности и энергии подборок.",
      tracks: (metadataFeed.top.length ? metadataFeed.top : [...tracks].sort((a, b) => b.duration - a.duration)).slice(0, 10),
    },
  };
  return sections[id] || sections.new;
}

function renderQuickAccessPage(container: HTMLElement, sectionId: string) {
  const section = getQuickSection(sectionId);
  container.innerHTML = `
    <div class="mb-6">
      <p class="text-xs uppercase tracking-widest text-white/40 mb-2">Быстрый доступ</p>
      <h2 class="text-2xl font-bold mb-2">${escapeHtml(section.title)}</h2>
      <p class="text-sm text-white/50 max-w-2xl">${escapeHtml(section.description)}</p>
    </div>
    <h3 class="text-sm font-semibold tracking-wide mb-3">Треки</h3>
    ${section.tracks.length === 0 ? `
      <div class="playlist-empty py-16 flex flex-col items-center justify-center text-center">
        <div class="text-4xl mb-3">♪</div>
        <h3 class="text-base font-semibold text-white/85 mb-1">Пока ничего нет</h3>
        <p class="text-sm text-white/40">В этом разделе ещё нет подходящих треков</p>
      </div>
    ` : `<div class="space-y-1">${section.tracks.map((t, i) => renderTrackRow(t, i, "quick-track")).join("")}</div>`}
  `;
  wireTrackRows(container, ".quick-track", section.tracks, () => renderQuickAccessPage(container, sectionId));
}

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

function renderFavorites() {
  const list = document.getElementById("favTrackList");
  const empty = document.getElementById("favEmpty");
  const count = document.getElementById("favCount");
  if (!list) return;
  const liked = tracks.filter((t) => t.liked);
  if (count) count.textContent = `${liked.length} треков`;
  if (empty) empty.classList.toggle("hidden", liked.length > 0);
  list.innerHTML = liked.map((t, i) => `
    <div class="fav-track-row group flex items-center gap-4 px-3 py-2 rounded-lg hover:bg-white/5 transition-all duration-300 cursor-pointer active:scale-[0.99]" data-id="${t.id}">
      <span class="text-xs text-white/30 w-6 text-center">${i + 1}</span>
      ${renderCover(t, "w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-xs")}
      <div class="flex-1 min-w-0">
        <p class="track-title-selectable text-sm font-medium truncate">${escapeHtml(t.title)}</p>
        <p class="text-xs text-white/40 truncate">${escapeHtml(t.artist)}</p>
      </div>
      <span class="text-xs text-white/30 w-20 hidden sm:block truncate">${escapeHtml(t.album)}</span>
      <button class="list-add-btn playlist-row-btn opacity-0 group-hover:opacity-100" data-track-id="${t.id}" type="button" title="Добавить в плейлист">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
      </button>
      <span class="text-xs text-white/30 w-10 text-right tabular-nums">${t.durationLabel}</span>
    </div>
  `).join("");
  list.querySelectorAll<HTMLElement>(".fav-track-row").forEach((el) => {
    const trackId = getElementTrackId(el);
    if (!trackId) return;
    const like = document.createElement("button");
    like.className = "fav-like-btn playlist-row-btn text-red-400 opacity-100";
    like.setAttribute("data-track-id", String(trackId));
    like.setAttribute("type", "button");
    like.setAttribute("title", "Убрать из избранного");
    like.innerHTML = `<svg class="w-4 h-4" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>`;
    el.querySelector(".list-add-btn")?.before(like);
  });
  list.querySelectorAll<HTMLElement>(".fav-track-row").forEach((el) => {
    el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const id = getElementTrackId(el);
      if (id) activateTrack(tracks, id);
    });
  });
  list.querySelectorAll<HTMLElement>(".list-add-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const trackId = getElementTrackId(btn, "data-track-id");
      if (trackId) showPlaylistPopup(btn, trackId);
    });
  });
  list.querySelectorAll<HTMLElement>(".fav-like-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const trackId = getElementTrackId(btn, "data-track-id");
      if (trackId) toggleTrackLike(trackId);
      renderFavorites();
    });
  });
  enhanceDynamicAccessibility(list);
  updateActiveTrackHighlight();
}

function renderFavoritesPage(container: HTMLElement) {
  const liked = tracks.filter((t) => t.liked);
  container.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-base font-semibold tracking-wide">Избранное</h2>
      <span id="favCount" class="text-xs text-white/40">${liked.length} треков</span>
    </div>
    <div class="flex items-center gap-4 px-3 py-2 text-xs text-white/30 border-b border-white/5 mb-2">
      <span class="w-6 text-center">#</span>
      <span class="w-10 shrink-0"></span>
      <span class="flex-1">Название</span>
      <span class="w-20 hidden sm:block">Альбом</span>
      <span class="w-10 text-right">Длит.</span>
    </div>
    <div id="favTrackList" class="space-y-0.5"></div>
    ${liked.length === 0 ? `
      <div id="favEmpty" class="mt-8 text-center text-sm text-white/30">
        <div class="text-4xl mb-3">🤍</div>
        <p>Добавьте треки в избранное</p>
        <p class="text-xs text-white/20 mt-1">Нажмите ♡ рядом с треком в плеере</p>
      </div>
    ` : ""}
  `;
  renderFavorites();
}

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

function renderNotifications(container: HTMLElement) {
  const items = [
    { icon: "🎵", color: "bg-indigo-500/20", title: 'Обновилась персональная волна <span class="text-white font-medium">Ночной эфир</span>', time: "2 часа назад" },
    { icon: "✓", color: "bg-green-500/20", title: "Система Tauri успешно обновлена до версии 2.11.3", time: "1 день назад" },
    { icon: "⭐", color: "bg-amber-500/20", title: 'Доступна новая функция: <span class="text-white font-medium">Радио / Миксы</span>', time: "3 дня назад" },
    { icon: "🎧", color: "bg-blue-500/20", title: "Вы прослушали 100+ треков на этой неделе!", time: "5 дней назад" },
    { icon: "🔥", color: "bg-red-500/20", title: 'Трек <span class="text-white font-medium">Blinding Lights</span> в топе недели', time: "6 дней назад" },
    { icon: "💿", color: "bg-purple-500/20", title: "Добавлено 15 новых треков в жанре Электроника", time: "1 неделя назад" },
  ];
  container.innerHTML = `
    <h2 class="text-base font-semibold tracking-wide mb-4">Уведомления</h2>
    <div class="space-y-2">
      ${items.map((item) => `
        <div class="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-all duration-300">
          <div class="w-8 h-8 rounded-full ${item.color} flex items-center justify-center text-sm shrink-0">${item.icon}</div>
          <div>
            <p class="text-sm text-white/80">${item.title}</p>
            <p class="text-xs text-white/30 mt-0.5">${item.time}</p>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

function renderRadio(container: HTMLElement) {
  const unique = (items: Track[]) => [...new Map(items.map((track) => [track.id, track])).values()];
  const recentArtists = new Set(metadataFeed.recent.map((track) => track.artist.toLowerCase()));
  const heroTracks = unique([...metadataFeed.recent, ...metadataFeed.top, ...metadataFeed.random, ...tracks]).slice(0, 24);
  const heroTrack = heroTracks[0];
  const mixes = [
    { id: "personal", title: "Ваша волна", subtitle: "Знакомое и новое в одном потоке", tracks: unique([...metadataFeed.recent, ...metadataFeed.top, ...metadataFeed.random]).slice(0, 18) },
    { id: "discovery", title: "Открытия дня", subtitle: "Исполнители за пределами привычного", tracks: unique([...metadataFeed.random, ...metadataFeed.global]).filter((track) => !recentArtists.has(track.artist.toLowerCase())).slice(0, 18) },
    { id: "local", title: "Новая сцена", subtitle: "Актуальный русскоязычный звук", tracks: unique([...metadataFeed.ru, ...metadataFeed.trending]).slice(0, 18) },
    { id: "global", title: "Мировой пульс", subtitle: "Треки, которые звучат прямо сейчас", tracks: unique([...metadataFeed.global, ...metadataFeed.top]).slice(0, 18) },
  ].map((mix) => ({ ...mix, tracks: mix.tracks.length ? mix.tracks : heroTracks.slice(0, 18) }));
  const discoveries = unique([...metadataFeed.random, ...metadataFeed.global, ...tracks]).filter((track) => track.id !== heroTrack?.id).slice(0, 8);
  const stationIcons: Record<string, string> = { study: "⌘", chillout: "☁", energy: "ϟ", morning: "☀", road: "↗", evening: "◐" };
  container.innerHTML = `
    <div class="radio-dashboard">
      <section class="radio-hero">
        <div class="radio-hero-copy">
          <div class="radio-kicker">Персональная радиоволна</div>
          <h2>Музыка без конца и повторов</h2>
          <p>Собираем непрерывный поток из вашей истории, свежих релизов и артистов, которых вы ещё не слушали.</p>
          <div class="radio-hero-actions"><button id="radioStartWave" class="radio-primary-btn" type="button">Запустить волну</button><button id="radioBrowseMixes" class="radio-secondary-btn" type="button">Посмотреть миксы</button></div>
        </div>
        <div class="radio-hero-art" aria-hidden="true"><div class="radio-orbit"></div>${heroTrack ? renderCover(heroTrack, "radio-hero-cover flex items-center justify-center text-2xl") : ""}</div>
      </section>
      <section id="radioMixesSection">
        <div class="radio-section-head"><div><h3>Миксы для вас</h3><p>Обновляются из реального каталога и вашей истории</p></div></div>
        <div class="radio-mix-grid">
          ${mixes.map((mix) => `<button class="radio-mix-card" type="button" data-radio-mix="${mix.id}"><span class="radio-mix-covers">${mix.tracks.slice(0, 2).map((track) => renderCover(track, "flex items-center justify-center text-xs")).join("")}</span><strong>${mix.title}</strong><span>${mix.subtitle} · ${mix.tracks.length} треков</span></button>`).join("")}
        </div>
      </section>
      <section>
        <div class="radio-section-head"><div><h3>Станции по настроению</h3><p>Один клик — и очередь уже собрана</p></div></div>
        <div class="radio-station-list">
          ${radioStations.map((station) => `<button class="radio-station-card" type="button" data-station="${station.id}"><span class="radio-station-icon bg-gradient-to-br ${station.gradient}">${stationIcons[station.id] || "♪"}</span><span><strong>${station.name}</strong><small>${station.desc}</small></span><span class="radio-live">ГОТОВО</span></button>`).join("")}
        </div>
      </section>
      <section>
        <div class="radio-section-head"><div><h3>Новые открытия</h3><p>Никаких одинаковых карточек подряд</p></div></div>
        ${discoveries.length ? `<div class="home-compact-rail">${discoveries.map((track) => `<div class="home-compact-card group text-left" role="button" tabindex="0" data-radio-track="${track.id}" aria-label="Воспроизвести: ${escapeHtml(track.title)} — ${escapeHtml(track.artist)}">${renderCover(track, "w-12 h-12 rounded-lg shrink-0 flex items-center justify-center text-sm")}<span class="min-w-0 flex-1"><strong class="track-title-selectable text-sm font-medium truncate block">${escapeHtml(track.title)}</strong><small class="text-xs text-white/40 truncate block">${escapeHtml(track.artist)}</small></span>${renderCardTrackActions(track)}<span class="text-xs text-white/30">${track.durationLabel}</span></div>`).join("")}</div>` : `<div class="profile-empty-state">Открытия появятся после обновления каталога.</div>`}
      </section>
    </div>
  `;
  container.querySelector("#radioStartWave")?.addEventListener("click", () => {
    if (heroTracks[0]) activateTrack(heroTracks, heroTracks[0].id);
    else showTrackNotice("Радиоволна появится после загрузки каталога");
  });
  container.querySelector("#radioBrowseMixes")?.addEventListener("click", () => container.querySelector("#radioMixesSection")?.scrollIntoView({ behavior: getPlayerSettings().reduceMotion ? "auto" : "smooth" }));
  container.querySelectorAll<HTMLElement>("[data-radio-mix]").forEach((element) => {
    element.addEventListener("click", () => {
      const mix = mixes.find((item) => item.id === element.dataset.radioMix);
      if (mix?.tracks[0]) activateTrack(mix.tracks, mix.tracks[0].id);
    });
  });
  container.querySelectorAll<HTMLElement>(".station-card").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-station");
      if (id) switchPage("station", id);
    });
  });
  container.querySelectorAll<HTMLElement>(".radio-station-card").forEach((element) => {
    element.addEventListener("click", () => { const id = element.dataset.station; if (id) switchPage("station", id); });
  });
  container.querySelectorAll<HTMLElement>("[data-radio-track]").forEach((element) => {
    const activate = () => { const id = normalizeTrackId(element.dataset.radioTrack); if (id) activateTrack(discoveries, id); };
    element.addEventListener("click", (event) => { if (!(event.target as HTMLElement).closest("button")) activate(); });
    element.addEventListener("keydown", (event) => { if ((event.key === "Enter" || event.key === " ") && !(event.target as HTMLElement).closest("button")) { event.preventDefault(); activate(); } });
  });
  wireCardTrackActions(container);
}

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

function renderStationPage(container: HTMLElement, stationId: string | null) {
  const station = radioStations.find((s) => s.id === stationId);
  if (!station) { renderRadio(container); return; }
  const listeners = Math.floor(200 + Math.random() * 800);
  const stationTracks = tracks.filter((t) => {
    if (station.mood === "focus") return t.genre === "lofi" || t.genre === "classical";
    if (station.mood === "relax") return t.genre === "jazz" || t.genre === "lofi";
    if (station.mood === "active") return t.genre === "rock" || t.genre === "electronic";
    if (station.mood === "happy") return t.genre === "pop";
    if (station.mood === "adventure") return t.genre === "rock" || t.genre === "pop";
    if (station.mood === "romantic") return t.genre === "jazz" || t.genre === "pop";
    return true;
  }).slice(0, 8);

  container.innerHTML = `
    <div class="flex flex-col items-center py-6">
      <div class="w-40 h-40 rounded-full bg-gradient-to-br ${station.gradient} flex items-center justify-center text-5xl radio-spin mb-5 border-2 border-white/10 shadow-2xl">📻</div>
      <div class="flex items-center gap-2 mb-1">
        <span class="w-2 h-2 rounded-full bg-green-400 live-badge"></span>
        <span class="text-xs text-green-400 font-semibold tracking-wider">В ЭФИРЕ</span>
      </div>
      <h2 class="text-xl font-bold">${station.name}</h2>
      <p class="text-sm text-white/50 mb-2">${station.desc}</p>
      <p class="text-xs text-white/30 mb-6">👥 ${listeners} слушателей</p>
      <button id="stationPlayBtn" class="px-8 py-3 bg-white text-black rounded-full text-sm font-semibold hover:scale-105 transition-all duration-300 active:scale-95 cursor-pointer shadow-lg">Открыть подборку</button>
    </div>
    <h3 class="text-sm font-semibold tracking-wide mb-3 mt-2">В этом потоке</h3>
    <div class="space-y-1">
      ${stationTracks.map((track, index) => renderTrackRow(track, index, "station-track")).join("")}
    </div>
  `;

  wireTrackRows(container, ".station-track", stationTracks, () => renderStationPage(container, stationId));
  const stationPlayBtn = container.querySelector<HTMLButtonElement>("#stationPlayBtn");
  if (stationPlayBtn) {
    stationPlayBtn.disabled = stationTracks.length === 0;
    if (stationTracks.length === 0) stationPlayBtn.textContent = "Пока нет треков";
    stationPlayBtn.addEventListener("click", () => {
      const first = stationTracks[0];
      if (first) activateTrack(stationTracks, first.id);
    });
  }
}

// ----------------------------------------------------------------
// 👤  ПРОФИЛЬ
// ----------------------------------------------------------------

function renderProfile(container: HTMLElement) {
  const user = currentAuthUser || getStoredAuthUser();
  const renderedAccountId = user?.id ?? null;
  const isCurrentProfile = () => currentPage === "profile" && (currentAuthUser || getStoredAuthUser())?.id === renderedAccountId;
  const likedCount = tracks.filter((t) => t.liked).length;
  const listenedTracks = metadataFeed.recent;
  const topArtists = [...new Set(listenedTracks.map((t) => t.artist))].slice(0, 4);
  const topTracks = listenedTracks.slice(0, 6);
  const hasRealStats = listenedTracks.length > 0;
  const genreCounts = listenedTracks.reduce<Record<string, number>>((counts, track) => {
    counts[track.genre] = (counts[track.genre] || 0) + 1;
    return counts;
  }, {});
  const favoriteGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  const joinedAt = user?.created_at ? new Date(user.created_at).toLocaleDateString("ru-RU", { month: "long", year: "numeric" }) : "недавно";
  const isPremium = hasPremiumAccess(user);
  const subscription = isPremium ? "Premium" : "Free";
  const avatarHtml = user?.avatar_url
    ? `<img class="profile-avatar-img" src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.nickname)}" />`
    : `<span>${escapeHtml(authInitials(user))}</span>`;

  container.innerHTML = `
    <section class="profile-hero-v2">
      <div class="profile-avatar w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-rose-500 flex items-center justify-center text-2xl border-2 border-white/10 overflow-hidden">${avatarHtml}</div>
      <div class="profile-identity">
        <h2>${escapeHtml(user?.nickname || "Пользователь")}</h2>
        <p>@${escapeHtml(user?.login || "login")} · с нами с ${escapeHtml(joinedAt)}</p>
        <span class="profile-badge ${isPremium ? "is-premium" : ""}">${subscription}</span>
      </div>
      <div class="profile-hero-actions">
        <button id="profileFavoritesBtn" class="profile-action-btn" type="button">Избранное</button>
        <button id="profileMusicTasteBtn" class="profile-action-btn" type="button">Музыкальный вкус</button>
        <button id="profileEqualizerBtn" class="profile-action-btn ${isPremium ? "" : "is-premium-locked"}" type="button">${isPremium ? "Эквалайзер" : "Эквалайзер · Premium"}</button>
        <button id="profilePremiumBtn" class="profile-action-btn profile-premium-btn ${isPremium ? "is-active" : ""}" type="button">${isPremium ? "Premium активен" : "Получить Premium"}</button>
        <button id="profileSettingsBtn" class="profile-action-btn" type="button">Настройки</button>
      </div>
    </section>
    <div class="profile-stats-v2">
      <div class="profile-stat-v2"><strong>${listenedTracks.length}</strong><span>Недавних треков</span></div>
      <div class="profile-stat-v2"><strong>${likedCount}</strong><span>В избранном</span></div>
      <div class="profile-stat-v2"><strong id="profileTotalMinutesStat">0</strong><span>Минут прослушано</span></div>
      <div class="profile-stat-v2"><strong>${escapeHtml(favoriteGenre)}</strong><span>Частый жанр</span></div>
    </div>
    <div class="profile-grid-v2">
      <section class="profile-card-v2 profile-listening-card">
        <div class="settings-section-head"><h3>Общее время в музыке</h3><span>История аккаунта</span></div>
        <div class="profile-listening-total">
          <div class="profile-listening-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3.2 2"/></svg>
          </div>
          <div><strong id="profileListeningTimeValue">0 минут</strong><span>суммарная длительность прослушанных треков</span></div>
        </div>
        <div class="profile-listening-wave" aria-hidden="true">${[26, 46, 72, 38, 84, 58, 92, 44, 68, 32, 76, 52, 88, 42, 64, 30, 70, 48].map((height) => `<i style="height:${height}%"></i>`).join("")}</div>
        <p id="profileListeningTimeDetail" class="profile-listening-detail">${listenedTracks.length} ${pluralizeTracks(listenedTracks.length)} в истории аккаунта</p>
      </section>
      <section class="profile-card-v2">
        <div class="settings-section-head"><h3>Аккаунт</h3><span>ID ${user?.id ?? "—"}</span></div>
        <form id="profileNicknameForm" class="profile-inline-form">
          <label><span>Имя в приложении</span><input id="profileNicknameInput" value="${escapeHtml(user?.nickname || "")}" maxlength="96" autocomplete="nickname" /></label>
          <button type="submit">Сохранить</button>
        </form>
        <label class="profile-upload-btn"><input id="profileAvatarInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /><span>Изменить аватар</span></label>
        <div class="profile-account-note">Статус: ${subscription} · профиль защищён авторизацией</div>
      </section>
    </div>
    <section class="profile-card-v2 mt-3">
      <div class="settings-section-head"><h3>Часто слушаете</h3><span>${topArtists.length} исполнителя</span></div>
      ${hasRealStats ? `<div class="artist-grid grid grid-cols-4 gap-3">${topArtists.map((artist) => {
        const primary = listenedTracks.find((track) => track.artist === artist);
        return `<div class="artist-card text-center cursor-pointer" role="button" tabindex="0" data-artist="${escapeHtml(artist)}">${primary ? renderCover(primary, "artist-avatar mx-auto flex items-center justify-center", "text-sm") : ""}<p class="text-xs font-medium truncate">${escapeHtml(artist)}</p><p class="text-[11px] text-white/30">Исполнитель</p></div>`;
      }).join("")}</div>` : `<div class="profile-empty-state">Послушайте несколько треков — здесь появятся ваши исполнители.</div>`}
    </section>
    <section class="profile-card-v2 mt-3">
      <div class="settings-section-head"><h3>Недавние треки</h3><span>${topTracks.length} последних</span></div>
      ${hasRealStats ? `<div class="space-y-1">${topTracks.map((track, index) => renderTrackRow(track, index, "profile-track")).join("")}</div>` : `<div class="profile-empty-state">Недавние треки появятся после первого прослушивания.</div>`}
    </section>
    <div class="profile-logout-wrap"><button id="profileLogoutBtn" type="button" class="profile-logout-btn">Выйти из аккаунта</button></div>
  `;

  container.querySelector("#profileFavoritesBtn")?.addEventListener("click", () => switchPage("favorites"));
  container.querySelector("#profileMusicTasteBtn")?.addEventListener("click", () => void showArtistOnboarding("settings"));
  container.querySelector("#profileSettingsBtn")?.addEventListener("click", () => switchPage("settings"));
  container.querySelector("#profileEqualizerBtn")?.addEventListener("click", showEqualizerModal);
  container.querySelector("#profilePremiumBtn")?.addEventListener("click", () => showPremiumSubscriptionModal("profile"));

  void flushListeningProgress().then(() => getHistorySummary()).then((summary) => {
    if (!isCurrentProfile()) return;
    applyHistorySummaryToProfile(summary);
  }).catch(() => { /* keep the locally available fallback */ });

  container.querySelector<HTMLFormElement>("#profileNicknameForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nickname = (container.querySelector<HTMLInputElement>("#profileNicknameInput")?.value || "").trim();
    if (!nickname) return;
    try { currentAuthUser = await updateNickname(nickname); if (isCurrentProfile()) renderProfile(container); showTrackNotice("Профиль обновлён"); }
    catch { showTrackNotice("Не удалось обновить профиль"); }
  });
  container.querySelector<HTMLInputElement>("#profileAvatarInput")?.addEventListener("change", (event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", async () => {
      try { currentAuthUser = await updateAvatar(String(reader.result || "")); if (isCurrentProfile()) renderProfile(container); showTrackNotice("Аватар обновлён"); }
      catch { showTrackNotice("Не удалось обновить аватар"); }
    });
    reader.readAsDataURL(file);
  });
  container.querySelector("#profileLogoutBtn")?.addEventListener("click", logoutAccount);
  container.querySelectorAll<HTMLElement>(".artist-card").forEach((element) => {
    const artist = element.dataset.artist;
    if (!artist) return;
    const open = () => switchPage("artist", artist);
    element.addEventListener("click", open);
    element.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
  });
  wireTrackRows(container, ".profile-track", topTracks, () => renderProfile(container));
  updateActiveTrackHighlight();
}
function renderTrackDetailPage(container: HTMLElement, trackId: string) {
  const existing = getTrack(trackId);
  const renderDetail = (track: Track | undefined, loading = false, message = "") => {
    if (!track) {
      container.innerHTML = `
        <div class="playlist-empty py-16 flex flex-col items-center justify-center text-center">
          <div class="text-4xl mb-3">♪</div>
          <h2 class="text-base font-semibold text-white/85 mb-1">Трек не найден</h2>
          <p class="text-sm text-white/40">Не удалось открыть карточку трека</p>
        </div>
      `;
      return;
    }
    const status = canPlayTrack(track) ? "Доступно для воспроизведения" : "Аудио пока недоступно";
    container.innerHTML = `
      ${message ? `<div class="backend-status mb-4">${escapeHtml(message)}</div>` : ""}
      <section class="track-detail-view">
        ${renderCover(track, "track-detail-cover flex items-center justify-center text-5xl")}
        <div class="track-detail-copy">
          <p class="text-xs uppercase tracking-widest text-white/45 mb-2">Трек</p>
          <h2 class="track-detail-title track-title-selectable">${escapeHtml(track.title)}</h2>
          <button class="track-detail-artist" type="button">${escapeHtml(track.artist)}</button>
          <div class="track-detail-meta">
            <span>${track.durationLabel}</span>
            <span>${escapeHtml(track.genre)}</span>
            ${track.region ? `<span>${escapeHtml(track.region.toUpperCase())}</span>` : ""}
          </div>
          <div class="metadata-pill ${canPlayTrack(track) ? "is-playable" : ""}">${status}</div>
          ${loading ? `<div class="text-xs text-white/35 mt-3">Обновляем данные из каталога...</div>` : ""}
          <div class="track-detail-actions">
            <button class="detail-like-btn ${track.liked ? "is-liked" : ""}" type="button">
              <svg class="w-4 h-4" fill="${track.liked ? "currentColor" : "none"}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
              <span>В избранное</span>
            </button>
            <button class="detail-play-btn" type="button">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              <span>${canPlayTrack(track) ? "Слушать" : "Детали"}</span>
            </button>
          </div>
        </div>
      </section>
    `;
    container.querySelector(".track-detail-artist")?.addEventListener("click", () => switchPage("artist", track.artistId || track.artist));
    container.querySelector(".detail-like-btn")?.addEventListener("click", () => {
      toggleTrackLike(track.id);
      renderTrackDetailPage(container, track.id);
    });
    container.querySelector(".detail-play-btn")?.addEventListener("click", () => {
      if (canPlayTrack(track)) activateTrack([track], track.id);
      else showTrackNotice("Аудио пока недоступно");
    });
  };

  renderDetail(existing, true);
  fetchTrack(trackId)
    .then((backendTrack) => {
      const [fresh] = mergeTracks([mapBackendTrack(backendTrack)]);
      if (currentPage === "track" && currentPageParam === trackId) renderDetail(fresh);
    })
    .catch(() => {
      if (currentPage === "track" && currentPageParam === trackId) renderDetail(existing, false, existing ? "" : "Не удалось загрузить данные трека. Попробуйте ещё раз позже.");
    });
}

function renderArtistPage(container: HTMLElement, artistName: string) {
  if (/^\d+$/.test(artistName)) {
    const isCurrentArtist = () => currentPage === "artist" && currentPageParam === artistName;
    container.innerHTML = `
      <div class="search-loading">
        <div class="track-skeleton"></div>
        <div>
          <h2 class="text-base font-semibold mb-1">Открываем артиста</h2>
          <p class="text-sm text-white/40">Загрузка каталога</p>
        </div>
      </div>
    `;
    Promise.all([fetchArtist(artistName), getArtistTracks(artistName), getArtistAlbums(artistName).catch(() => [])])
      .then(([artist, backendTracks, artistAlbums]) => {
        if (!isCurrentArtist()) return;
        const artistTracks = mergeTracks(backendTracks.map((track) => mapBackendTrack(track)));
        const albumTrackQueues = new Map(
          artistAlbums.map((album) => [String(album.id), mergeTracks(album.tracks.map((track) => mapBackendTrack(track)))]),
        );
        const primary = artistTracks[0];
        if (primary && /^\d+$/.test(String(primary.id)) && !recordedArtistViews.has(artistName)) {
          recordedArtistViews.add(artistName);
          void postMusicSignal({
            signal: "artist_view",
            trackId: primary.id,
            artistId: artistName,
            context: "artist",
          })
            .then(() => queueRecommendationRefresh())
            .catch(() => recordedArtistViews.delete(artistName));
        }
        container.innerHTML = `
          <div class="relative rounded-2xl overflow-hidden mb-6 p-6 artist-hero">
            <div class="absolute inset-0 bg-gradient-to-br ${primary?.gradient || "from-slate-700 to-zinc-950"} opacity-70"></div>
            <div class="absolute inset-0 backdrop-blur-2xl"></div>
            <div class="relative z-10 flex items-center gap-5">
              ${primary ? renderCover(primary, "artist-page-avatar w-24 h-24 rounded-full border border-white/10 flex items-center justify-center text-4xl") : `<div class="artist-page-avatar w-24 h-24 rounded-full border border-white/10 flex items-center justify-center text-4xl">♪</div>`}
              <div class="min-w-0">
                <p class="text-xs uppercase tracking-widest text-white/60 mb-1">Артист</p>
                <h2 class="text-2xl font-bold truncate">${escapeHtml(artist.name)}</h2>
                <p class="text-sm text-white/60 mt-1">${artistTracks.length || artist.track_count || 0} треков в каталоге</p>
                ${artist.genres?.length ? `<p class="text-xs text-white/40 mt-1 truncate">${artist.genres.map(escapeHtml).join(" · ")}</p>` : ""}
                <button class="playArtistBtn mt-4 px-5 py-2 bg-white text-black rounded-full text-sm font-semibold hover:scale-105 transition-all duration-300 active:scale-95 cursor-pointer">Открыть популярное</button>
              </div>
            </div>
          </div>
          ${artistAlbums.length ? `
            <section class="artist-albums-section" aria-labelledby="artistAlbumsTitle">
              <div class="artist-section-heading">
                <div><span>Дискография</span><h3 id="artistAlbumsTitle">Альбомы и релизы</h3></div>
                <span>${artistAlbums.length}</span>
              </div>
              <div class="artist-albums-grid">
                ${artistAlbums.map((album) => {
                  const coverUrl = resolveBackendImageUrl(album.cover_url);
                  const year = album.release_date ? new Date(album.release_date).getFullYear() : null;
                  return `
                    <button class="artist-album-card" data-artist-album-id="${escapeHtml(String(album.id))}" type="button" aria-label="Воспроизвести релиз ${escapeHtml(album.title)}">
                      <span class="artist-album-art">
                        <span>${escapeHtml(artistInitials(album.title))}</span>
                        ${coverUrl ? `<img src="${escapeHtml(coverUrl)}" alt="" loading="lazy" decoding="async" />` : ""}
                      </span>
                      <strong>${escapeHtml(album.title)}</strong>
                      <span>${year || "Релиз"} · ${album.track_count || album.tracks.length} треков</span>
                    </button>
                  `;
                }).join("")}
              </div>
            </section>
          ` : ""}
          <h3 class="text-sm font-semibold tracking-wide mb-3">Треки</h3>
          ${artistTracks.length ? `<div class="space-y-1">${artistTracks.map((t, i) => renderTrackRow(t, i, "artist-track")).join("")}</div>` : `
            <div class="playlist-empty py-16 flex flex-col items-center justify-center text-center">
              <div class="text-4xl mb-3">♪</div>
              <h2 class="text-base font-semibold text-white/85 mb-1">Треков пока нет</h2>
            </div>
          `}
        `;
        container.querySelector(".playArtistBtn")?.addEventListener("click", () => {
          if (artistTracks[0]) activateTrack(artistTracks, artistTracks[0].id);
        });
        container.querySelectorAll<HTMLImageElement>(".artist-album-art img").forEach((image) => {
          image.addEventListener("error", () => image.remove(), { once: true });
        });
        container.querySelectorAll<HTMLButtonElement>(".artist-album-card").forEach((button) => {
          button.addEventListener("click", () => {
            const albumTracks = albumTrackQueues.get(button.dataset.artistAlbumId || "") || [];
            if (albumTracks[0]) activateTrack(albumTracks, albumTracks[0].id);
          });
        });
        wireTrackRows(container, ".artist-track", artistTracks, () => renderArtistPage(container, artistName));
      })
      .catch(() => {
        if (!isCurrentArtist()) return;
        container.innerHTML = `
          <div class="playlist-empty py-16 flex flex-col items-center justify-center text-center">
            <div class="text-4xl mb-3">♪</div>
            <h2 class="text-base font-semibold text-white/85 mb-1">Артист не найден</h2>
            <p class="text-sm text-white/40">Не удалось загрузить данные исполнителя. Попробуйте ещё раз позже.</p>
          </div>
        `;
      });
    return;
  }
  const artistTracks = tracks.filter((t) => t.artist === artistName);
  if (!artistName || artistTracks.length === 0) {
    container.innerHTML = `
      <div class="playlist-empty py-16 flex flex-col items-center justify-center text-center">
        <div class="text-4xl mb-3">♪</div>
        <h2 class="text-base font-semibold text-white/85 mb-1">Артист не найден</h2>
        <p class="text-sm text-white/40">В библиотеке пока нет треков этого артиста</p>
      </div>
    `;
    return;
  }
  const primary = artistTracks[0];
  const artistSignalId = primary.artistId || primary.artists?.[0]?.id;
  if (artistSignalId && /^\d+$/.test(String(primary.id)) && /^\d+$/.test(String(artistSignalId)) && !recordedArtistViews.has(String(artistSignalId))) {
    recordedArtistViews.add(String(artistSignalId));
    void postMusicSignal({
      signal: "artist_view",
      trackId: primary.id,
      artistId: artistSignalId,
      context: "artist",
    })
      .then(() => queueRecommendationRefresh())
      .catch(() => recordedArtistViews.delete(String(artistSignalId)));
  }
  container.innerHTML = `
    <div class="relative rounded-2xl overflow-hidden mb-6 p-6 artist-hero">
      <div class="absolute inset-0 bg-gradient-to-br ${primary.gradient} opacity-70"></div>
      <div class="absolute inset-0 backdrop-blur-2xl"></div>
      <div class="relative z-10 flex items-center gap-5">
        ${renderCover(primary, "artist-page-avatar w-24 h-24 rounded-full border border-white/10 flex items-center justify-center text-4xl")}
        <div class="min-w-0">
          <p class="text-xs uppercase tracking-widest text-white/60 mb-1">Артист</p>
          <h2 class="text-2xl font-bold truncate">${escapeHtml(artistName)}</h2>
          <p class="text-sm text-white/60 mt-1">${artistTracks.length} треков в приложении</p>
          <button class="playArtistBtn mt-4 px-5 py-2 bg-white text-black rounded-full text-sm font-semibold hover:scale-105 transition-all duration-300 active:scale-95 cursor-pointer">Открыть популярное</button>
        </div>
      </div>
    </div>
    <h3 class="text-sm font-semibold tracking-wide mb-3">Треки</h3>
    <div class="space-y-1">
      ${artistTracks.map((t, i) => renderTrackRow(t, i, "artist-track")).join("")}
    </div>
  `;
  container.querySelector(".playArtistBtn")?.addEventListener("click", () => {
    activateTrack(artistTracks, artistTracks[0].id);
  });
  wireTrackRows(container, ".artist-track", artistTracks, () => renderArtistPage(container, artistName));
}

function setFocusBackgroundInert(value: boolean) {
  const shellLocked = value
    || document.body.classList.contains("auth-locked")
    || document.body.classList.contains("artist-onboarding-locked");
  getAppShellRegions().forEach((element) => {
    element.inert = shellLocked;
    if (shellLocked) element.setAttribute("aria-hidden", "true");
    else element.removeAttribute("aria-hidden");
  });
}

function closeFocusPlayer() {
  focusOverlay.classList.remove("active");
  focusOverlay.style.display = "none";
  focusOverlay.setAttribute("aria-hidden", "true");
  setFocusBackgroundInert(false);
  focusReturnTarget?.focus();
  focusReturnTarget = null;
}

function openFocusPlayer() {
  focusReturnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : nowPlayingFocus;
  focusOverlay.style.display = "flex";
  focusOverlay.setAttribute("aria-hidden", "false");
  setFocusBackgroundInert(true);
  window.requestAnimationFrame(() => focusOverlay.classList.add("active"));
  window.setTimeout(() => focusBack.focus(), 40);
}

nowPlayingFocus.addEventListener("click", openFocusPlayer);
focusBack.addEventListener("click", closeFocusPlayer);
focusOverlay.addEventListener("click", (event) => {
  if (event.target === focusOverlay) closeFocusPlayer();
});
focusOverlay.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const focusable = [...focusOverlay.querySelectorAll<HTMLElement>("button, [role='slider'][tabindex='0']")];
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

focusLikeBtn.addEventListener("click", toggleLike);
focusPlayBtn.addEventListener("click", playPause);
focusPrevBtn.addEventListener("click", () => playPrev());
focusNextBtn.addEventListener("click", () => playNext());
focusRepeatBtn.addEventListener("click", () => repeatBtn.click());
focusShuffleBtn.addEventListener("click", toggleShuffle);
focusQueueBtn.addEventListener("click", () => {
  focusReturnTarget = nowPlayingFocus;
  closeFocusPlayer();
  window.setTimeout(showQueueSheet, 80);
});

makeDraggable(focusTimeline, focusTimelineFill, focusTimelineThumb, (pct) => {
  previewActiveTrackPosition(pct);
}, (pct) => {
  const track = getTrack(player.currentTrackId);
  if (!track) return;
  seekActiveTrack(pct * getCurrentDuration(track));
});

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

type SubscriptionModalSource = "equalizer" | "profile" | "settings";

function showPremiumSubscriptionModal(source: SubscriptionModalSource = "equalizer"): void {
  document.querySelector(".subscription-overlay")?.remove();
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = document.createElement("div");
  overlay.className = "subscription-overlay";
  overlay.innerHTML = `
    <section class="subscription-modal" role="dialog" aria-modal="true" aria-labelledby="subscriptionTitle" aria-describedby="subscriptionDescription">
      <div class="subscription-modal-content" aria-live="polite"></div>
    </section>
  `;
  document.body.appendChild(overlay);
  const content = overlay.querySelector<HTMLElement>(".subscription-modal-content")!;
  let checkoutPollGeneration = 0;
  const sourceCopy = source === "equalizer"
    ? "Эквалайзер входит в Premium"
    : source === "settings"
      ? "Расширьте возможности звука"
      : "Подписка Million Music";

  const close = () => {
    checkoutPollGeneration += 1;
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
    returnFocus?.focus();
  };
  const focusFirst = () => window.setTimeout(() => overlay.querySelector<HTMLElement>("button")?.focus(), 20);
  const bindClose = () => overlay.querySelectorAll<HTMLButtonElement>("[data-subscription-close]").forEach((button) => button.addEventListener("click", close));
  const closeIcon = `
    <button class="subscription-close" data-subscription-close type="button" aria-label="Закрыть">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
  `;
  const premiumMark = `
    <div class="subscription-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 17l-1-9 5 4 4-7 4 7 5-4-1 9H4Z"/><path d="M5 20h14"/></svg>
    </div>
  `;
  const featureIcon = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
  `;

  const renderLoading = () => {
    content.innerHTML = `
      ${closeIcon}
      <div class="subscription-loading"><span class="subscription-spinner" aria-hidden="true"></span><strong>Загружаем Premium</strong><small>Проверяем подписку и актуальный тариф</small></div>
    `;
    bindClose();
  };

  const renderError = () => {
    content.innerHTML = `
      ${closeIcon}
      <div class="subscription-state-icon is-error" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 8v5M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg></div>
      <p class="subscription-kicker">PREMIUM</p>
      <h2 id="subscriptionTitle">Не удалось загрузить тариф</h2>
      <p id="subscriptionDescription" class="subscription-copy">Проверьте подключение к серверу. Статус аккаунта не изменён.</p>
      <div class="subscription-actions"><button class="subscription-secondary" data-subscription-close type="button">Закрыть</button><button class="subscription-primary" data-subscription-retry type="button">Повторить</button></div>
    `;
    bindClose();
    overlay.querySelector("[data-subscription-retry]")?.addEventListener("click", () => void loadSubscription());
    focusFirst();
  };

  const renderActive = (plan: SubscriptionPlan) => {
    content.innerHTML = `
      ${closeIcon}
      <div class="subscription-active-head">${premiumMark}<div><p class="subscription-kicker">PREMIUM АКТИВЕН</p><h2 id="subscriptionTitle">Ваш звук — без ограничений</h2></div></div>
      <p id="subscriptionDescription" class="subscription-copy">Эквалайзер и все его профили доступны этому аккаунту.</p>
      <div class="subscription-feature-list">${plan.features.map((feature) => `<div>${featureIcon}<span>${escapeHtml(feature)}</span></div>`).join("")}</div>
      <div class="subscription-actions"><button class="subscription-secondary" data-subscription-close type="button">Закрыть</button><button class="subscription-primary" data-open-premium-equalizer type="button">Открыть эквалайзер</button></div>
    `;
    bindClose();
    overlay.querySelector("[data-open-premium-equalizer]")?.addEventListener("click", () => {
      close();
      showEqualizerModal();
    });
    focusFirst();
  };

  const applyPremiumStatus = async (): Promise<boolean> => {
    const status = await getMySubscription();
    if (currentAuthUser) {
      currentAuthUser = { ...currentAuthUser, subscription_status: status.status, is_premium: status.isPremium };
      setStoredAuthUser(currentAuthUser);
    }
    enforcePremiumAudioAccess();
    return status.isPremium;
  };

  const renderPaymentSuccess = (plan: SubscriptionPlan) => {
    checkoutPollGeneration += 1;
    content.innerHTML = `
      ${closeIcon}
      <div class="subscription-state-icon is-success" aria-hidden="true">${featureIcon}</div>
      <p class="subscription-kicker">ОПЛАТА ПОДТВЕРЖДЕНА</p>
      <h2 id="subscriptionTitle">Премиум подписка оформлена</h2>
      <p id="subscriptionDescription" class="subscription-copy">Подписка сохранена в аккаунте. Все текущие и будущие Premium-возможности уже доступны.</p>
      <div class="subscription-preview-summary"><span>${escapeHtml(plan.name)}</span><strong>${escapeHtml(formatSubscriptionPrice(plan.priceMinor, plan.currency))} / месяц</strong></div>
      <button class="subscription-primary is-wide" data-subscription-continue type="button">Продолжить</button>
    `;
    bindClose();
    overlay.querySelector("[data-subscription-continue]")?.addEventListener("click", close);
    if (currentPage === "profile" || currentPage === "settings") switchPage(currentPage, currentPageParam);
    showTrackNotice("Премиум подписка оформлена");
    focusFirst();
  };

  const renderWaitingForPayment = (plan: SubscriptionPlan, checkout: MockCheckout) => {
    content.innerHTML = `
      ${closeIcon}
      <div class="subscription-loading subscription-payment-waiting">
        <span class="subscription-spinner" aria-hidden="true"></span>
        <p class="subscription-kicker">ОЖИДАЕМ ПОДТВЕРЖДЕНИЕ</p>
        <h2 id="subscriptionTitle">Завершите оплату в браузере</h2>
        <p id="subscriptionDescription" class="subscription-copy" data-checkout-status>Страница оплаты уже открыта. После её загрузки Premium появится здесь автоматически.</p>
        <div class="subscription-actions is-compact"><button class="subscription-secondary" data-checkout-reopen type="button">Открыть сайт ещё раз</button><button class="subscription-primary" data-checkout-check type="button">Проверить подписку</button></div>
      </div>
    `;
    bindClose();
    overlay.querySelector<HTMLButtonElement>("[data-checkout-reopen]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      try { await openCheckoutPage(checkout.checkoutUrl); }
      catch { showTrackNotice("Не удалось открыть страницу оплаты"); }
      finally { button.disabled = false; }
    });
    overlay.querySelector<HTMLButtonElement>("[data-checkout-check]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      button.textContent = "Проверяем…";
      try {
        if (await applyPremiumStatus()) renderPaymentSuccess(plan);
        else {
          button.disabled = false;
          button.textContent = "Проверить подписку";
          showTrackNotice("Платёж пока не подтверждён");
        }
      } catch {
        button.disabled = false;
        button.textContent = "Повторить проверку";
      }
    });
    focusFirst();
  };

  const openCheckoutPage = async (checkoutUrl: string): Promise<void> => {
    if (!isTrustedCheckoutUrl(checkoutUrl, API_BASE_URL)) throw new Error("Untrusted checkout URL");
    await openUrl(checkoutUrl);
  };

  const pollForPayment = async (plan: SubscriptionPlan, checkout: MockCheckout): Promise<void> => {
    const generation = ++checkoutPollGeneration;
    const attempts = Math.min(60, Math.max(10, Math.floor(checkout.expiresInSeconds / 2)));
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 700 : 1200));
      if (generation !== checkoutPollGeneration || !overlay.isConnected) return;
      try {
        if (await applyPremiumStatus()) {
          renderPaymentSuccess(plan);
          return;
        }
      } catch { /* transient network errors are retried until the checkout expires */ }
    }
    const statusText = overlay.querySelector<HTMLElement>("[data-checkout-status]");
    if (statusText) statusText.textContent = "Автоматическая проверка завершилась. Откройте страницу ещё раз или нажмите «Проверить подписку».";
  };

  const renderCheckout = (plan: SubscriptionPlan) => {
    content.innerHTML = `
      ${closeIcon}
      <div class="subscription-checkout-head"><button class="subscription-back" data-subscription-back type="button" aria-label="Вернуться к тарифу"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button><div><p class="subscription-kicker">ТЕСТОВАЯ ОПЛАТА</p><h2 id="subscriptionTitle">Оформление Premium</h2></div></div>
      <p id="subscriptionDescription" class="subscription-copy">Приложение откроет отдельную страницу оплаты и автоматически проверит результат.</p>
      <div class="subscription-order-row"><div><span>${escapeHtml(plan.name)}</span><small>Ежемесячная подписка</small></div><strong>${escapeHtml(formatSubscriptionPrice(plan.priceMinor, plan.currency))}</strong></div>
      <div class="subscription-payment-placeholder"><div class="subscription-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/></svg></div><div><strong>Тестовая банковская карта</strong><small>Настоящие реквизиты не требуются</small></div><span>Демо</span></div>
      <div class="subscription-demo-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M12 8v4M12 16h.01"/><circle cx="12" cy="12" r="9"/></svg><span>Это тестовый сценарий: денег не списывается, но Premium действительно сохранится в вашем аккаунте.</span></div>
      <button class="subscription-primary is-wide" data-subscription-confirm type="button">Перейти к оплате</button>
    `;
    bindClose();
    overlay.querySelector("[data-subscription-back]")?.addEventListener("click", () => renderOffer(plan));
    overlay.querySelector<HTMLButtonElement>("[data-subscription-confirm]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      button.textContent = "Открываем оплату…";
      try {
        const checkout = await createMockCheckout(plan.id);
        await openCheckoutPage(checkout.checkoutUrl);
        renderWaitingForPayment(checkout.plan, checkout);
        void pollForPayment(checkout.plan, checkout);
      } catch {
        button.disabled = false;
        button.textContent = "Повторить открытие оплаты";
        showTrackNotice("Не удалось открыть страницу оплаты");
      }
    });
    focusFirst();
  };

  const renderOffer = (plan: SubscriptionPlan) => {
    content.innerHTML = `
      ${closeIcon}
      <div class="subscription-hero">
        <div>${premiumMark}<p class="subscription-kicker">${escapeHtml(sourceCopy.toUpperCase())}</p><h2 id="subscriptionTitle">Настройте музыку под себя</h2><p id="subscriptionDescription" class="subscription-copy">Premium открывает профессиональный эквалайзер и точный контроль звучания.</p></div>
        <div class="subscription-price"><strong>${escapeHtml(formatSubscriptionPrice(plan.priceMinor, plan.currency))}</strong><span>в месяц</span><small>Тестовый тариф</small></div>
      </div>
      <div class="subscription-feature-list">${plan.features.map((feature) => `<div>${featureIcon}<span>${escapeHtml(feature)}</span></div>`).join("")}</div>
      <div class="subscription-plan-note"><span>Premium</span><small>Тестовая оплата выдаст подписку аккаунту сразу после открытия страницы.</small></div>
      <button class="subscription-primary is-wide" data-subscription-checkout type="button">Оформить Premium</button>
      <p class="subscription-legal">Тестовый режим · реального списания денег нет.</p>
    `;
    bindClose();
    overlay.querySelector("[data-subscription-checkout]")?.addEventListener("click", () => renderCheckout(plan));
    focusFirst();
  };

  async function loadSubscription(): Promise<void> {
    renderLoading();
    try {
      const [plans, status] = await Promise.all([
        subscriptionPlansCache ? Promise.resolve(subscriptionPlansCache) : getSubscriptionPlans(),
        getMySubscription(),
      ]);
      subscriptionPlansCache = plans;
      const plan = plans[0];
      if (!plan) throw new Error("No subscription plan configured");
      if (currentAuthUser) {
        currentAuthUser = { ...currentAuthUser, subscription_status: status.status, is_premium: status.isPremium };
        setStoredAuthUser(currentAuthUser);
      }
      enforcePremiumAudioAccess();
      if (status.isPremium) renderActive(plan);
      else renderOffer(plan);
    } catch {
      renderError();
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...overlay.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex='-1'])")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  document.addEventListener("keydown", onKeyDown);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  void loadSubscription();
}

function showEqualizerModal() {
  if (!hasPremiumAccess(currentAuthUser || getStoredAuthUser())) {
    enforcePremiumAudioAccess();
    showPremiumSubscriptionModal("equalizer");
    return;
  }
  document.querySelector(".equalizer-overlay")?.remove();
  const trigger = document.getElementById("hdrEqualizer") as HTMLButtonElement | null;
  const overlay = document.createElement("div");
  overlay.className = "equalizer-overlay";
  const presetEntries = (Object.entries(EQ_PRESETS) as [EqualizerPresetId, EqualizerPreset][]).filter(([id]) => id !== "custom");
  const activePreset = EQ_PRESETS[equalizerState.preset];
  overlay.innerHTML = `
    <section class="equalizer-modal" role="dialog" aria-modal="true" aria-labelledby="equalizerTitle" aria-describedby="equalizerDescription">
      <div class="equalizer-head">
        <div><div class="equalizer-kicker">MILLION AUDIO ENGINE V2</div><div id="equalizerTitle" class="equalizer-title">Эквалайзер</div><div id="equalizerDescription" class="equalizer-subtitle">Чистая 10-полосная коррекция, усиление низких и защита от перегрузки</div></div>
        <button class="equalizer-close" type="button" aria-label="Закрыть">×</button>
      </div>

      <div class="equalizer-visual">
        <div class="equalizer-current-preset"><span data-eq-current-icon aria-hidden="true">${activePreset.icon}</span><div><small>Сейчас звучит</small><strong data-eq-current-title>${activePreset.label}</strong><span data-eq-current-description>${activePreset.description}</span></div></div>
        <div class="equalizer-curve-wrap" aria-hidden="true">
          <svg class="equalizer-curve" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs><linearGradient id="eqCurveGradient" x1="0" x2="1"><stop stop-color="#8b5cf6"/><stop offset=".52" stop-color="#a78bfa"/><stop offset="1" stop-color="#ec4899"/></linearGradient></defs>
            <path class="equalizer-curve-grid" d="M0 12H100 M0 50H100 M0 88H100"/>
            <polyline data-eq-curve points="${equalizerCurvePoints(equalizerDisplayGains(equalizerState))}"/>
          </svg>
          <span class="equalizer-curve-high">+12</span><span class="equalizer-curve-zero">0</span><span class="equalizer-curve-low">−12</span>
        </div>
      </div>

      <div class="equalizer-toolbar">
        <div class="equalizer-status"><button class="equalizer-power ${equalizerState.enabled ? "is-on" : ""}" type="button" role="switch" aria-label="Включить или выключить эквалайзер" aria-checked="${equalizerState.enabled}"><span aria-hidden="true"></span></button><div><strong>${equalizerState.enabled ? "Эквалайзер включён" : "Эквалайзер выключен"}</strong><small>Нажмите для мгновенного A/B сравнения</small></div></div>
        <label class="equalizer-preamp"><span>Входной уровень <output data-eq-preamp-output>${formatEqGain(equalizerState.preamp)}</output></span><input data-eq-preamp type="range" min="-12" max="0" step="0.5" value="${equalizerState.preamp}" aria-label="Входной уровень эквалайзера"/><small data-eq-effective-level>Автозапас рассчитывается по пиковому усилению</small></label>
        <button class="equalizer-reset" type="button">Сбросить</button>
      </div>

      <div class="equalizer-section-label"><span>Характер звука</span><small>Макроконтролы работают поверх десяти полос</small></div>
      <div class="equalizer-enhancers">
        <label class="equalizer-enhancer equalizer-enhancer-bass"><span><strong>Сила баса</strong><small>Глубина и физический удар без лишнего гула</small></span><output data-eq-bass-output>0%</output><input data-eq-bass type="range" min="0" max="100" step="1" value="${equalizerState.bassBoost}" aria-label="Сила баса"/></label>
        <label class="equalizer-enhancer equalizer-enhancer-clarity"><span><strong>Чистота</strong><small>Убирает муть и подчёркивает детали</small></span><output data-eq-clarity-output>0%</output><input data-eq-clarity type="range" min="0" max="100" step="1" value="${equalizerState.clarity}" aria-label="Чистота звука"/></label>
        <div class="equalizer-headroom"><button class="equalizer-headroom-switch ${equalizerState.autoGain ? "is-on" : ""}" data-eq-auto-gain type="button" role="switch" aria-label="Автоматический запас громкости" aria-checked="${equalizerState.autoGain}"><span aria-hidden="true"></span></button><div><strong>Автозапас</strong><small>Сохраняет панч и не даёт усиленным частотам клипповать</small></div><output data-eq-headroom-output>0 дБ</output></div>
      </div>

      <div class="equalizer-section-label"><span>Готовые профили</span><small>Выберите характер звучания</small></div>
      <div class="equalizer-presets">${presetEntries.map(([id, preset]) => `<button class="equalizer-preset ${equalizerState.preset === id ? "is-active" : ""}" type="button" data-eq-preset="${id}" aria-pressed="${equalizerState.preset === id}"><span aria-hidden="true">${preset.icon}</span><div><strong>${preset.label}</strong><small>${preset.description}</small></div><i aria-hidden="true">✓</i></button>`).join("")}</div>

      <div class="equalizer-section-label equalizer-bands-label"><span>Точная настройка</span><small>Двойной щелчок или клавиша 0 возвращает полосу в 0 дБ</small></div>
      <div class="equalizer-bands-shell">
        <div class="equalizer-db-scale"><span>+12</span><span>0</span><span>−12</span></div>
        <div class="equalizer-bands">
          ${EQ_FREQUENCIES.map((frequency, index) => {
            const gain = equalizerState.gains[index];
            return `<label class="equalizer-band" style="--eq-positive:${Math.max(0, gain) / 12 * 50}%;--eq-negative:${Math.max(0, -gain) / 12 * 50}%"><output data-eq-output="${index}">${formatEqGain(gain)}</output><span class="equalizer-band-control"><span class="equalizer-band-fill is-positive" aria-hidden="true"></span><span class="equalizer-band-fill is-negative" aria-hidden="true"></span><input type="range" min="-12" max="12" step="0.5" value="${gain}" data-eq-band="${index}" aria-label="Полоса ${formatEqFrequency(frequency)}" aria-orientation="vertical" aria-valuetext="${formatEqGain(gain)}"></span><strong>${formatEqFrequency(frequency)}</strong></label>`;
          }).join("")}
        </div>
      </div>
      <div class="equalizer-footnote" aria-live="polite"><span data-eq-safety-status><i></i> Защита от перегрузки активна</span><span>Изменения применяются и сохраняются автоматически · 32-bit Web Audio</span></div>
    </section>`;
  document.body.appendChild(overlay);
  trigger?.setAttribute("aria-expanded", "true");

  const modal = overlay.querySelector<HTMLElement>(".equalizer-modal")!;
  const closeButton = overlay.querySelector<HTMLButtonElement>(".equalizer-close")!;
  const power = overlay.querySelector<HTMLButtonElement>(".equalizer-power")!;
  const statusTitle = overlay.querySelector<HTMLElement>(".equalizer-status strong")!;
  const currentIcon = overlay.querySelector<HTMLElement>("[data-eq-current-icon]")!;
  const currentTitle = overlay.querySelector<HTMLElement>("[data-eq-current-title]")!;
  const currentDescription = overlay.querySelector<HTMLElement>("[data-eq-current-description]")!;
  const preamp = overlay.querySelector<HTMLInputElement>("[data-eq-preamp]")!;
  const preampOutput = overlay.querySelector<HTMLOutputElement>("[data-eq-preamp-output]")!;
  const effectiveLevel = overlay.querySelector<HTMLElement>("[data-eq-effective-level]")!;
  const bass = overlay.querySelector<HTMLInputElement>("[data-eq-bass]")!;
  const bassOutput = overlay.querySelector<HTMLOutputElement>("[data-eq-bass-output]")!;
  const clarity = overlay.querySelector<HTMLInputElement>("[data-eq-clarity]")!;
  const clarityOutput = overlay.querySelector<HTMLOutputElement>("[data-eq-clarity-output]")!;
  const autoGain = overlay.querySelector<HTMLButtonElement>("[data-eq-auto-gain]")!;
  const headroomOutput = overlay.querySelector<HTMLOutputElement>("[data-eq-headroom-output]")!;
  const safetyStatus = overlay.querySelector<HTMLElement>("[data-eq-safety-status]")!;
  const curve = overlay.querySelector<SVGPolylineElement>("[data-eq-curve]")!;
  let saveTimer: number | null = null;
  let syncFrame: number | null = null;
  const persistEqualizer = () => {
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = null;
    saveEqualizerState();
  };
  const close = () => {
    persistEqualizer();
    if (syncFrame !== null) window.cancelAnimationFrame(syncFrame);
    overlay.remove();
    trigger?.setAttribute("aria-expanded", "false");
    trigger?.focus();
  };
  const syncControls = () => {
    const preset = EQ_PRESETS[equalizerState.preset];
    const metrics = calculateEqualizerMetrics(equalizerState);
    power.classList.toggle("is-on", equalizerState.enabled);
    power.setAttribute("aria-checked", String(equalizerState.enabled));
    statusTitle.textContent = equalizerState.enabled ? "Эквалайзер включён" : "Эквалайзер выключен";
    currentIcon.textContent = preset.icon;
    currentTitle.textContent = preset.label;
    currentDescription.textContent = preset.description;
    preamp.value = String(equalizerState.preamp);
    preampOutput.value = formatEqGain(equalizerState.preamp);
    preamp.setAttribute("aria-valuetext", formatEqGain(equalizerState.preamp));
    effectiveLevel.textContent = equalizerState.autoGain && metrics.automaticHeadroomDb < -0.05
      ? `Фактический уровень ${formatEqGain(metrics.effectivePreampDb)} с учётом автозапаса`
      : "Ручной уровень без дополнительного ослабления";
    bass.value = String(equalizerState.bassBoost);
    bassOutput.value = `${Math.round(equalizerState.bassBoost)}% · ${formatEqGain(metrics.bassDb)}`;
    bass.setAttribute("aria-valuetext", bassOutput.value);
    clarity.value = String(equalizerState.clarity);
    clarityOutput.value = `${Math.round(equalizerState.clarity)}%`;
    clarity.setAttribute("aria-valuetext", `${Math.round(equalizerState.clarity)} процентов`);
    autoGain.classList.toggle("is-on", equalizerState.autoGain);
    autoGain.setAttribute("aria-checked", String(equalizerState.autoGain));
    headroomOutput.value = equalizerState.autoGain ? formatEqGain(metrics.automaticHeadroomDb) : "Выкл.";
    curve.setAttribute("points", equalizerCurvePoints(equalizerDisplayGains(equalizerState)));
    safetyStatus.classList.toggle("is-off", !equalizerState.enabled);
    safetyStatus.classList.remove("is-error");
    safetyStatus.innerHTML = equalizerState.enabled
      ? `<i></i>${equalizerState.autoGain ? ` Автозапас ${formatEqGain(metrics.automaticHeadroomDb)} · лимитер только страхует пики` : " Лимитер защищает выход · автозапас выключен"}`
      : "<i></i> Обработка выключена — играет исходный сигнал";
    overlay.querySelectorAll<HTMLButtonElement>("[data-eq-preset]").forEach((button) => {
      const active = button.dataset.eqPreset === equalizerState.preset;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    equalizerState.gains.forEach((gain, index) => {
      const slider = overlay.querySelector<HTMLInputElement>(`[data-eq-band="${index}"]`);
      const output = overlay.querySelector<HTMLOutputElement>(`[data-eq-output="${index}"]`);
      if (slider) {
        slider.value = String(gain);
        slider.setAttribute("aria-valuetext", formatEqGain(gain));
        const band = slider.closest<HTMLElement>(".equalizer-band");
        band?.style.setProperty("--eq-positive", `${Math.max(0, gain) / 12 * 50}%`);
        band?.style.setProperty("--eq-negative", `${Math.max(0, -gain) / 12 * 50}%`);
      }
      if (output) output.value = formatEqGain(gain);
    });
  };
  const scheduleSync = () => {
    if (syncFrame !== null) return;
    syncFrame = window.requestAnimationFrame(() => {
      syncFrame = null;
      if (overlay.isConnected) syncControls();
    });
  };
  const commitEqualizer = (persistImmediately = false) => {
    applyEqualizerGains();
    scheduleSync();
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    if (persistImmediately) persistEqualizer();
    else saveTimer = window.setTimeout(persistEqualizer, 180);
  };
  const ensureEqualizerAvailable = async () => {
    if (!hasPremiumAccess(currentAuthUser || getStoredAuthUser())) {
      close();
      enforcePremiumAudioAccess();
      showPremiumSubscriptionModal("equalizer");
      return false;
    }
    if (await ensureAudioGraph()) return true;
    statusTitle.textContent = "Обработка недоступна";
    safetyStatus.classList.add("is-error");
    safetyStatus.innerHTML = "<i></i> Не удалось подключить аудиодвижок — выберите другой трек и повторите";
    showTrackNotice("Эквалайзер недоступен для этого аудиопотока");
    return false;
  };

  power.addEventListener("click", async () => {
    if (equalizerState.enabled) {
      equalizerState.enabled = false;
      commitEqualizer(true);
      return;
    }
    if (!await ensureEqualizerAvailable()) return;
    equalizerState.enabled = true;
    commitEqualizer(true);
  });
  overlay.querySelectorAll<HTMLButtonElement>("[data-eq-preset]").forEach((button) => {
    button.addEventListener("click", async () => {
      const presetId = button.dataset.eqPreset as EqualizerPresetId;
      const preset = EQ_PRESETS[presetId];
      if (!preset || !await ensureEqualizerAvailable()) return;
      equalizerState = { enabled: true, preset: presetId, preamp: preset.preamp, bassBoost: preset.bassBoost, clarity: preset.clarity, autoGain: equalizerState.autoGain, gains: [...preset.gains] };
      commitEqualizer(true);
    });
  });
  preamp.addEventListener("input", async () => {
    if (!await ensureEqualizerAvailable()) return;
    equalizerState.preamp = Number(preamp.value);
    equalizerState.preset = "custom";
    equalizerState.enabled = true;
    commitEqualizer();
  });
  bass.addEventListener("input", async () => {
    if (!await ensureEqualizerAvailable()) return;
    equalizerState.bassBoost = Number(bass.value);
    equalizerState.preset = "custom";
    equalizerState.enabled = true;
    commitEqualizer();
  });
  clarity.addEventListener("input", async () => {
    if (!await ensureEqualizerAvailable()) return;
    equalizerState.clarity = Number(clarity.value);
    equalizerState.preset = "custom";
    equalizerState.enabled = true;
    commitEqualizer();
  });
  autoGain.addEventListener("click", () => {
    equalizerState.autoGain = !equalizerState.autoGain;
    commitEqualizer(true);
  });
  overlay.querySelectorAll<HTMLInputElement>("[data-eq-band]").forEach((slider) => {
    const updateBand = async (value: number) => {
      if (!await ensureEqualizerAvailable()) return;
      equalizerState.gains[Number(slider.dataset.eqBand)] = value;
      equalizerState.preset = "custom";
      equalizerState.enabled = true;
      commitEqualizer();
    };
    slider.addEventListener("input", () => void updateBand(Number(slider.value)));
    slider.addEventListener("dblclick", (event) => { event.preventDefault(); slider.value = "0"; void updateBand(0); });
    slider.addEventListener("keydown", (event) => {
      if (event.key !== "0") return;
      event.preventDefault();
      slider.value = "0";
      void updateBand(0);
    });
  });
  overlay.querySelector(".equalizer-reset")?.addEventListener("click", () => {
    equalizerState = { ...DEFAULT_EQUALIZER, gains: [...DEFAULT_EQUALIZER.gains] };
    commitEqualizer(true);
  });
  closeButton.addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...modal.querySelectorAll<HTMLElement>("button, input")];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  syncControls();
  window.setTimeout(() => closeButton.focus(), 30);
}

function renderSettings(container: HTMLElement) {
  const s = getPlayerSettings();
  const isPremium = hasPremiumAccess(currentAuthUser || getStoredAuthUser());
  container.innerHTML = `
    <div class="radio-section-head">
      <div><h2 class="text-base font-semibold tracking-wide">Настройки</h2><p>Управляйте звуком, поведением и внешним видом приложения</p></div>
      <button id="resetSettingsBtn" class="settings-reset-btn" type="button">Сбросить настройки</button>
    </div>
    <section class="settings-premium-banner ${isPremium ? "is-active" : ""}">
      <div class="settings-premium-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 17l-1-9 5 4 4-7 4 7 5-4-1 9H4Z"/><path d="M5 20h14"/></svg></div>
      <div><strong>${isPremium ? "Premium активен" : "Откройте Premium-звук"}</strong><small>${isPremium ? "Эквалайзер и звуковые профили доступны вашему аккаунту" : "10-полосный эквалайзер, усиление баса и точная настройка звучания"}</small></div>
      <button id="openPremiumSettings" class="profile-action-btn profile-premium-btn ${isPremium ? "is-active" : ""}" type="button">${isPremium ? "Управление" : "Узнать больше"}</button>
    </section>
    <div class="settings-layout">
      <section class="settings-card-v2">
        <div class="settings-section-head"><h3>Внешний вид</h3><span>Интерфейс</span></div>
        <div class="setting-row"><div><strong>Тёмная тема</strong><small>Глубокий контраст для вечернего прослушивания</small></div>${settingSwitch("themeToggle", s.theme)}</div>
        <div class="setting-row"><div><strong>Компактный режим</strong><small>Больше музыки помещается на экране</small></div>${settingSwitch("compactToggle", s.compact)}</div>
        <div class="setting-row"><div><strong>Меньше анимаций</strong><small>Отключает вращения и плавные перемещения</small></div>${settingSwitch("reduceMotionToggle", s.reduceMotion)}</div>
        <div class="setting-row"><div><strong>Акцент интерфейса</strong><small>Цвет активных элементов и прогресса</small></div><select id="accentSelect" class="settings-select" aria-label="Акцент интерфейса">
          <option value="violet" ${s.accent === "violet" ? "selected" : ""}>Фиолетовый</option>
          <option value="rose" ${s.accent === "rose" ? "selected" : ""}>Розовый</option>
          <option value="cyan" ${s.accent === "cyan" ? "selected" : ""}>Бирюзовый</option>
          <option value="lime" ${s.accent === "lime" ? "selected" : ""}>Лаймовый</option>
        </select></div>
        <div class="setting-row"><div><strong>Масштаб</strong><small><span id="scaleValue">${s.scale}%</span> от стандартного размера</small></div><input id="scaleSlider" type="range" min="80" max="120" value="${s.scale}" class="w-28 accent-indigo-500" aria-label="Масштаб интерфейса" /></div>
      </section>

      <section class="settings-card-v2">
        <div class="settings-section-head"><h3>Воспроизведение</h3><span>Поток</span></div>
        <div class="setting-row"><div><strong>Автовоспроизведение</strong><small>Продолжать очередь после окончания трека</small></div>${settingSwitch("autoplayToggle", s.autoplay)}</div>
        <div class="setting-row"><div><strong>Быстрая загрузка следующего</strong><small>Подготавливать следующий трек в фоне</small></div>${settingSwitch("prefetchToggle", s.prefetch)}</div>
        <div class="setting-row"><div><strong>Компенсация тихой громкости</strong><small>Слегка поднимать уровень на низкой громкости</small></div>${settingSwitch("normalizeToggle", s.normalize)}</div>
        <div class="setting-row"><div><strong>Плавный переход</strong><small>Мягко проявлять звук при смене трека</small></div>${settingSwitch("crossfadeToggle", s.crossfade)}</div>
        <div class="setting-row"><div><strong>Аудиовыход</strong><small>Устройство, на которое направлен звук</small></div><select id="audioOutputSelect" class="settings-select" aria-label="Аудиовыход"><option value="">Системное устройство</option></select></div>
      </section>

      <section class="settings-card-v2 is-wide">
        <div class="settings-section-head"><h3>Персональный звук</h3><span>10 полос</span></div>
        <div class="setting-row"><div><strong>Музыкальные предпочтения</strong><small>Изменить любимых артистов и обновить персональную ленту</small></div><button id="openMusicPreferences" class="profile-action-btn" type="button">Выбрать артистов</button></div>
        <div class="setting-row ${isPremium ? "" : "is-premium-locked"}"><div><strong>Эквалайзер ${isPremium ? "" : "· Premium"}</strong><small>${isPremium ? (equalizerState.enabled ? `Активен профиль «${EQ_PRESETS[equalizerState.preset].label}»` : "Сейчас звук воспроизводится без коррекции") : "Доступен после активации Premium"}</small></div><button id="openEqualizerSettings" class="profile-action-btn" type="button">${isPremium ? "Настроить" : "Открыть Premium"}</button></div>
        <div class="setting-row"><div><strong>Million Music Desktop</strong><small>Версия 1.2 · защищённое подключение к музыкальному каталогу</small></div><span class="text-xs text-emerald-300">● Онлайн</span></div>
        <div class="setting-row"><div><strong>Помочь улучшить приложение</strong><small>Опишите проблему — отчёт попадёт в админ-панель</small></div><button id="bugReportBtn" class="profile-action-btn" type="button">Сообщить о баге</button></div>
      </section>
    </div>
  `;

  ["themeToggle", "compactToggle", "reduceMotionToggle", "autoplayToggle", "prefetchToggle", "normalizeToggle", "crossfadeToggle"].forEach((id) => {
    container.querySelector(`#${id}`)?.addEventListener("change", () => { saveSettings(); applySettingsEffects(); });
  });
  container.querySelector<HTMLInputElement>("#scaleSlider")?.addEventListener("input", (event) => {
    const value = (event.currentTarget as HTMLInputElement).value;
    const output = container.querySelector("#scaleValue");
    if (output) output.textContent = `${value}%`;
    saveSettings(); applySettingsEffects();
  });
  container.querySelector("#accentSelect")?.addEventListener("change", () => { saveSettings(); applySettingsEffects(); });
  container.querySelector("#openEqualizerSettings")?.addEventListener("click", showEqualizerModal);
  container.querySelector("#openPremiumSettings")?.addEventListener("click", () => showPremiumSubscriptionModal("settings"));
  container.querySelector("#openMusicPreferences")?.addEventListener("click", () => void showArtistOnboarding("settings"));
  container.querySelector("#bugReportBtn")?.addEventListener("click", showBugReportModal);
  container.querySelector("#resetSettingsBtn")?.addEventListener("click", () => {
    localStorage.removeItem(accountStorageKey(STORAGE_KEY_SETTINGS));
    savedSettings = { ...DEFAULT_SETTINGS };
    applySettingsEffects();
    renderSettings(container);
    showTrackNotice("Настройки сброшены");
  });

  const outputSelect = container.querySelector<HTMLSelectElement>("#audioOutputSelect");
  const sinkAudio = audioEl as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };
  if (outputSelect && !sinkAudio.setSinkId) {
    outputSelect.disabled = true;
    outputSelect.title = "Выбор аудиоустройства не поддерживается этой версией WebView";
  }
  navigator.mediaDevices?.enumerateDevices().then((devices) => {
    const outputs = devices.filter((device) => device.kind === "audiooutput");
    outputs.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Аудиовыход ${index + 1}`;
      outputSelect?.appendChild(option);
    });
  }).catch(() => undefined);
  outputSelect?.addEventListener("change", async () => {
    if (!sinkAudio.setSinkId) {
      showTrackNotice("Выбор аудиоустройства не поддерживается");
      return;
    }
    try {
      await sinkAudio.setSinkId(outputSelect.value);
      showTrackNotice("Аудиовыход изменён");
    } catch {
      showTrackNotice("Не удалось переключить аудиовыход");
    }
  });
}

function getPlayerSettings(): PlayerSettings {
  return { ...DEFAULT_SETTINGS, ...(savedSettings || {}) };
}

function applySettingsEffects() {
  const settings = getPlayerSettings();
  const scale = Math.max(80, Math.min(120, parseFloat(settings.scale || "100")));
  document.documentElement.style.fontSize = `${(scale / 100) * 16}px`;
  document.documentElement.dataset.theme = settings.theme ? "dark" : "dim";
  document.documentElement.style.setProperty("--accent", ACCENT_COLORS[settings.accent] || ACCENT_COLORS.violet);
  document.body.classList.toggle("audio-normalized", settings.normalize);
  document.body.classList.toggle("crossfade-enabled", settings.crossfade);
  document.body.classList.toggle("compact-ui", settings.compact);
  document.body.classList.toggle("reduce-motion", settings.reduceMotion);
  applyVolume();
  applyEqualizerGains();
}

function countBugReportWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function showBugReportModal() {
  document.querySelector(".bug-report-overlay")?.remove();
  const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = document.createElement("div");
  overlay.className = "bug-report-overlay";
  overlay.innerHTML = `
    <div class="bug-report-modal" role="dialog" aria-modal="true" aria-labelledby="bugReportTitle">
      <button class="bug-report-close" type="button" aria-label="Закрыть">×</button>
      <div class="bug-report-title" id="bugReportTitle">Сообщить о баге</div>
      <p class="bug-report-hint">Опиши, что случилось: где нажал, что ожидал увидеть и какая ошибка появилась.</p>
      <textarea class="bug-report-text" maxlength="5000" placeholder="Например: не отправляется баг-репорт из настроек..."></textarea>
      <div class="bug-report-footer">
        <span class="bug-report-count">0/130</span>
        <button class="bug-report-send" type="button" disabled>Отправить</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const modal = overlay.querySelector<HTMLElement>(".bug-report-modal")!;
  const closeBtn = overlay.querySelector<HTMLButtonElement>(".bug-report-close")!;
  const textarea = overlay.querySelector<HTMLTextAreaElement>(".bug-report-text")!;
  const sendBtn = overlay.querySelector<HTMLButtonElement>(".bug-report-send")!;
  const countEl = overlay.querySelector<HTMLElement>(".bug-report-count")!;

  const close = () => {
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
    previouslyFocused?.focus();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...modal.querySelectorAll<HTMLElement>("button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex='-1'])")];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const syncState = () => {
    const words = countBugReportWords(textarea.value);
    const valid = words > 0 && words <= 130;
    countEl.textContent = `${words}/130`;
    countEl.classList.toggle("is-invalid", words > 130);
    sendBtn.disabled = !valid;
  };

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  modal.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("keydown", onKeyDown);
  textarea.addEventListener("input", syncState);
  sendBtn.addEventListener("click", async () => {
    const text = textarea.value.trim();
    if (!text || countBugReportWords(text) > 130) return;
    sendBtn.disabled = true;
    sendBtn.textContent = "...";
    try {
      await submitBugReport(text);
      close();
      showTrackNotice("Баг-репорт отправлен");
    } catch {
      sendBtn.disabled = false;
      sendBtn.textContent = "Отправить";
      showTrackNotice("Не удалось отправить баг-репорт");
    }
  });
  window.setTimeout(() => textarea.focus(), 40);
}

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

function renderPlaylistPage(container: HTMLElement, playlistId: string | null) {
  const pl = playlists.find((p) => p.id === playlistId);
  if (!pl) { renderHome(container); return; }
  const plTracks = getPlaylistTracks(pl);
  const totalDuration = plTracks.reduce((acc, t) => acc + t.duration, 0);
  const isUserPlaylist = !!pl.userCreated;

  container.innerHTML = `
    <div class="relative rounded-2xl overflow-hidden mb-6 p-6" style="background: linear-gradient(135deg, var(--tw-gradient-stops));">
      <div class="absolute inset-0 bg-gradient-to-br ${pl.gradient}"></div>
      <div class="absolute inset-0 backdrop-blur-2xl"></div>
      <div class="relative z-10">
        <div class="flex items-center gap-4 mb-4">
          <div class="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center text-3xl border border-white/10">${pl.icon}</div>
          <div>
            <p class="text-xs uppercase tracking-widest text-white/50 mb-1">Плейлист</p>
            <h2 class="text-2xl font-bold">${escapeHtml(pl.name)}</h2>
            <p class="text-sm text-white/60 mt-1">${escapeHtml(pl.description)}</p>
            <p class="text-xs text-white/40 mt-1">${plTracks.length} треков · ${formatTime(totalDuration)}</p>
          </div>
        </div>
        <button class="playAllBtn px-6 py-2 bg-white text-black rounded-full text-sm font-semibold hover:scale-105 transition-all duration-300 active:scale-95 cursor-pointer">Слушать все</button>
      </div>
    </div>
    <div class="space-y-1">
      ${plTracks.map((t, i) => `
        <div class="pl-track group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-all duration-300 cursor-pointer active:scale-[0.99]" data-id="${t.id}">
          <span class="text-xs text-white/30 w-6 text-center">${i + 1}</span>
          ${renderCover(t, "w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-sm")}
          <div class="flex-1 min-w-0">
            <p class="track-title-selectable text-sm font-medium truncate">${escapeHtml(t.title)}</p>
            <p class="text-xs text-white/40 truncate">${escapeHtml(t.artist)} · ${escapeHtml(t.album)}</p>
          </div>
          <button class="add-pl-btn text-white/20 hover:text-indigo-400 transition-all duration-300 opacity-0 group-hover:opacity-100 cursor-pointer ml-1 shrink-0" data-track-id="${t.id}" title="Добавить в плейлист">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          </button>
          <span class="text-xs text-white/30 tabular-nums">${t.durationLabel}</span>
        </div>
      `).join("")}
    </div>
  `;

  const heroContent = container.querySelector(".relative.z-10") as HTMLElement | null;
  if (heroContent && isUserPlaylist) {
    const controls = document.createElement("div");
    controls.className = "playlist-owner-tools";
    controls.innerHTML = `
      <button class="renamePlaylistBtn playlist-action-btn" type="button" title="Переименовать">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="deletePlaylistBtn playlist-action-btn danger" type="button" title="Удалить">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-7 4v6m4-6v6m4-10l-1 13a2 2 0 01-2 2H8a2 2 0 01-2-2L5 7"/></svg>
      </button>
    `;
    heroContent.appendChild(controls);

    const renameForm = document.createElement("form");
    renameForm.className = "renamePlaylistForm hidden max-w-md mt-4";
    renameForm.innerHTML = `
      <div class="flex items-center gap-2">
        <input class="renamePlaylistInput flex-1 bg-black/25 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none" maxlength="40" value="${escapeHtml(pl.name)}" />
        <button class="renamePlaylistSave px-3 py-2 rounded-lg bg-white text-black text-xs font-semibold" type="submit">Сохранить</button>
        <button class="renamePlaylistCancel px-3 py-2 rounded-lg bg-white/10 text-white/70 text-xs" type="button">Отмена</button>
      </div>
      <p class="renamePlaylistError hidden text-[11px] text-red-200 mt-2"></p>
    `;
    heroContent.appendChild(renameForm);
  }

  if (plTracks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "playlist-empty py-16 flex flex-col items-center justify-center text-center";
    empty.innerHTML = `
      <div class="text-4xl mb-3">♪</div>
      <h3 class="text-base font-semibold text-white/85 mb-1">В плейлисте пока нет треков</h3>
      <p class="text-sm text-white/40">Добавьте треки через кнопку +</p>
    `;
    container.appendChild(empty);
    (container.querySelector(".playAllBtn") as HTMLButtonElement | null)?.setAttribute("disabled", "true");
  }

  container.querySelectorAll<HTMLElement>(".pl-track").forEach((el) => {
    const trackId = el.getAttribute("data-id");
    if (!trackId) return;
    const addBtn = el.querySelector(".add-pl-btn");
    addBtn?.classList.add("playlist-row-btn");
    const track = getTrack(trackId);
    if (!track) return;
    const likeBtn = document.createElement("button");
    likeBtn.className = `playlist-like-btn playlist-row-btn ${track.liked ? "text-red-400 opacity-100" : "opacity-0 group-hover:opacity-100"}`;
    likeBtn.setAttribute("data-track-id", trackId);
    likeBtn.setAttribute("title", "Лайк");
    likeBtn.setAttribute("type", "button");
    likeBtn.innerHTML = `<svg class="w-4 h-4" fill="${track.liked ? "currentColor" : "none"}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>`;
    addBtn?.before(likeBtn);
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-pl-track-btn playlist-row-btn danger";
    removeBtn.setAttribute("data-track-id", trackId);
    removeBtn.setAttribute("title", "Удалить из плейлиста");
    removeBtn.setAttribute("type", "button");
    removeBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 7h12M9 7v10m6-10v10"/></svg>`;
    addBtn?.after(removeBtn);
  });

  container.querySelectorAll<HTMLElement>(".pl-track").forEach((el) => {
    el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const id = getElementTrackId(el);
      if (id) activateTrack(plTracks, id);
    });
  });
  container.querySelector(".playAllBtn")?.addEventListener("click", () => {
    if (plTracks.length > 0) {
      activateTrack(plTracks, plTracks[0].id);
    }
  });

  container.querySelectorAll<HTMLElement>(".add-pl-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const trackId = getElementTrackId(btn, "data-track-id");
      if (trackId) showPlaylistPopup(btn, trackId);
    });
  });
  container.querySelectorAll<HTMLElement>(".playlist-like-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const trackId = getElementTrackId(btn, "data-track-id");
      if (trackId) toggleTrackLike(trackId);
      if (playlistId) renderPlaylistPage(container, playlistId);
    });
  });
  container.querySelectorAll<HTMLElement>(".remove-pl-track-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const trackId = getElementTrackId(btn, "data-track-id");
      if (!playlistId) return;
      if (trackId) removeTrackFromPlaylist(trackId, playlistId);
      renderPlaylistPage(container, playlistId);
    });
  });
  if (isUserPlaylist) {
    const renameBtn = container.querySelector(".renamePlaylistBtn") as HTMLButtonElement | null;
    const renameForm = container.querySelector(".renamePlaylistForm") as HTMLFormElement | null;
    const renameInput = container.querySelector(".renamePlaylistInput") as HTMLInputElement | null;
    const renameCancel = container.querySelector(".renamePlaylistCancel") as HTMLButtonElement | null;
    const renameError = container.querySelector(".renamePlaylistError") as HTMLElement | null;
    const deleteBtn = container.querySelector(".deletePlaylistBtn") as HTMLButtonElement | null;
    const setRenameError = (message = "") => {
      if (!renameError) return;
      renameError.textContent = message;
      renameError.classList.toggle("hidden", !message);
    };
    renameBtn?.addEventListener("click", () => {
      renameForm?.classList.toggle("hidden");
      setRenameError();
      renameInput?.focus();
      renameInput?.select();
    });
    renameCancel?.addEventListener("click", () => {
      renameForm?.classList.add("hidden");
      if (renameInput) renameInput.value = pl.name;
      setRenameError();
    });
    renameForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!renameInput || !playlistId) return;
      const error = renameUserPlaylist(playlistId, renameInput.value);
      if (error) { setRenameError(error); return; }
      renderPlaylistPage(container, playlistId);
    });
    deleteBtn?.addEventListener("click", () => {
      if (!playlistId) return;
      if (deleteUserPlaylist(playlistId)) switchPage("home");
    });
  }
  enhanceDynamicAccessibility(container);
  updateActiveTrackHighlight();
}

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

function renderGenrePage(container: HTMLElement, genreId: string | null) {
  const genre = genres.find((g) => g.id === genreId);
  if (!genre) { renderExplore(container); return; }
  const genreTracks = tracks.filter((t) => t.genre === genreId);

  const titles: Record<string, string> = { rock: "Рок-Драйв", hiphop: "Хип-хоп Битва", pop: "Поп-волна", lofi: "Лоу-фай Чилл", electronic: "Электронная Сцена", jazz: "Джазовый Вечер", classical: "Классическая симфония" };
  const descs: Record<string, string> = { rock: "Гитары, энергия и лучшие рок-хиты", hiphop: "Биты, рифмы и культура хип-хопа", pop: "Запоминающиеся поп-мелодии", lofi: "Тёплый лоу-фай для учёбы и отдыха", electronic: "Синтезаторы и электронные ритмы", jazz: "Импровизация и джазовая классика", classical: "Вечные шедевры классической музыки" };

  container.innerHTML = `
    <div class="w-full rounded-2xl bg-gradient-to-br ${genre.gradient} p-6 mb-6 relative overflow-hidden">
      <div class="relative z-10">
        <p class="text-xs uppercase tracking-widest text-white/60 mb-1">Жанр</p>
        <h2 class="text-2xl font-bold mb-2">${titles[genreId!] || genre.name}</h2>
        <p class="text-sm text-white/70 mb-4">${descs[genreId!] || genre.description}</p>
        <button class="playGenreBtn px-5 py-2 bg-white text-black rounded-full text-sm font-medium hover:scale-105 transition-all duration-300 active:scale-95 cursor-pointer">Слушать</button>
      </div>
      <div class="absolute -right-8 -top-8 w-44 h-44 bg-white/[0.06] rounded-full"></div>
      <div class="absolute -right-4 -bottom-8 w-32 h-32 bg-white/[0.04] rounded-full"></div>
    </div>
    <h3 class="text-sm font-semibold tracking-wide mb-3">Треки · ${genreTracks.length}</h3>
    <div class="space-y-1">
      ${genreTracks.map((track, index) => renderTrackRow(track, index, "genre-track")).join("")}
    </div>
  `;

  wireTrackRows(container, ".genre-track", genreTracks, () => renderGenrePage(container, genreId));
  container.querySelector(".playGenreBtn")?.addEventListener("click", () => {
    if (genreTracks.length > 0) {
      activateTrack(genreTracks, genreTracks[0].id);
    }
  });
}

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

function renderSearchResults(container: HTMLElement, rawQuery: string) {
  const query = sanitizeSearchQuery(rawQuery);
  const q = normalizeSearchText(query);
  cancelActiveSearchRequests();
  const controller = new AbortController();
  activeSearchController = controller;
  const searchToken = ++searchRequestToken;
  const searchTargetLimit = 150;
  const pollBackoff = [1800, 3600, 7200, 12000, 15000];
  let canonicalArtist: OnboardingArtist | null = null;
  let visibleItems: Track[] = [];
  let visibleAlbums: BackendAlbum[] = [];
  let visibleStatus: SearchRenderStatus | null = null;
  let hasRenderedResults = false;

  type SearchRenderStatus = {
    message: string;
    tone?: "info" | "error";
    retry?: boolean;
    pending?: boolean;
  };
  type SearchViewState = {
    scrollTop: number;
    focusKey: string | null;
    anchorKey: string | null;
    anchorOffset: number;
  };

  const isCurrentSearch = () => (
    currentPage === "search"
    && sanitizeSearchQuery(currentPageParam || "") === query
    && searchToken === searchRequestToken
    && !controller.signal.aborted
  );
  const setSearchPending = (pending: boolean) => {
    if (!isCurrentSearch()) return;
    container.setAttribute("aria-busy", String(pending));
    searchSubmitBtn.setAttribute("aria-busy", String(pending));
  };
  const captureViewState = (): SearchViewState | null => {
    if (!hasRenderedResults) return null;
    const active = document.activeElement instanceof HTMLElement && container.contains(document.activeElement)
      ? document.activeElement
      : null;
    const containerTop = container.getBoundingClientRect().top;
    const anchors = [...container.querySelectorAll<HTMLElement>("[data-search-anchor]")];
    const anchor = anchors.find((element) => element.getBoundingClientRect().bottom >= containerTop + 8) ?? null;
    return {
      scrollTop: container.scrollTop,
      focusKey: active?.dataset.searchFocusKey ?? null,
      anchorKey: anchor?.dataset.searchAnchor ?? null,
      anchorOffset: anchor ? anchor.getBoundingClientRect().top - containerTop : 0,
    };
  };
  const restoreViewState = (state: SearchViewState | null) => {
    if (!state) return;
    container.scrollTop = state.scrollTop;
    if (state.anchorKey) {
      const anchor = [...container.querySelectorAll<HTMLElement>("[data-search-anchor]")]
        .find((element) => element.dataset.searchAnchor === state.anchorKey);
      if (anchor) {
        const nextOffset = anchor.getBoundingClientRect().top - container.getBoundingClientRect().top;
        container.scrollTop += nextOffset - state.anchorOffset;
      }
    }
    if (state.focusKey) {
      const focusTarget = [...container.querySelectorAll<HTMLElement>("[data-search-focus-key]")]
        .find((element) => element.dataset.searchFocusKey === state.focusKey);
      focusTarget?.focus({ preventScroll: true });
    }
  };
  const localResults = () => filterLocalSearchTracks(tracks, query);
  const mapAlbumTracks = (album: BackendAlbum) => {
    const mapped = mergeTracks(album.tracks.map((track) => mapBackendTrack(track)));
    const matchedIndex = mapped.findIndex((track) => String(track.id) === String(album.matched_track_id));
    return matchedIndex > 0
      ? [mapped[matchedIndex], ...mapped.slice(0, matchedIndex), ...mapped.slice(matchedIndex + 1)]
      : mapped;
  };
  const albumResultsSignature = (albums: BackendAlbum[]) => JSON.stringify(albums.map((album) => ({
    id: album.id,
    title: album.title,
    cover: album.cover_url,
    available: album.is_available,
    matched: album.matched_track_id,
    tracks: album.tracks.map((track) => [
      track.id,
      track.title,
      track.artist,
      track.duration_seconds,
      track.cover_url,
      track.is_playable,
      track.source_url,
      track.quality_score,
      track.needs_review,
    ]),
  })));
  const renderSearchCover = (track: Track, className: string, iconClass = "") => `
    <span class="${className} track-cover has-cover bg-gradient-to-br ${track.gradient}"${coverStyle(track)}>
      <span class="track-cover-icon ${iconClass}">${track.icon}</span>
    </span>
  `;
  const wireRetry = () => {
    container.querySelector<HTMLButtonElement>("[data-search-retry]")?.addEventListener("click", () => {
      renderSearchResults(container, query);
    });
  };

  const renderBackendResults = (
    items: Track[],
    albums: BackendAlbum[] = visibleAlbums,
    status: SearchRenderStatus | null = null,
  ) => {
    if (!isCurrentSearch()) return;
    const viewState = captureViewState();
    visibleItems = items;
    visibleAlbums = albums;
    visibleStatus = status;
    const availableAlbums = albums.filter((album) => album.is_available !== false);
    const albumTrackQueues = new Map<string, Track[]>();
    availableAlbums.forEach((album) => albumTrackQueues.set(String(album.id), mapAlbumTracks(album)));
    hasRenderedResults = true;
    const failed = status?.tone === "error";
    if (items.length === 0 && availableAlbums.length === 0 && !canonicalArtist) {
      container.innerHTML = `
        <div class="search-empty-state" role="${failed ? "alert" : "status"}" aria-live="${failed ? "assertive" : "polite"}">
          <div class="search-empty-icon ${failed ? "is-error" : ""}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/></svg></div>
          <h2>${failed ? "Не удалось загрузить каталог" : "Ничего не найдено"}</h2>
          <p>${failed
            ? "Проверьте подключение и повторите поиск. Сохранённых совпадений для этого запроса нет."
            : `По запросу «${escapeHtml(query)}» ничего не найдено. Попробуйте другое написание или имя артиста.`}</p>
          ${status?.retry ? `<button class="search-retry-button" data-search-retry type="button">Повторить поиск</button>` : ""}
        </div>
      `;
      wireRetry();
      restoreViewState(viewState);
      setSearchPending(Boolean(status?.pending));
      return;
    }

    const playableItems = items.filter(canPlayTrack);
    const bestTrack = items[0];
    const bestTrackPlayable = canPlayTrack(bestTrack);
    const artistImageUrl = canonicalArtist ? resolveBackendImageUrl(canonicalArtist.avatarUrl) : null;
    const artistMeta = canonicalArtist
      ? canonicalArtist.genres.slice(0, 2).join(" · ")
        || (canonicalArtist.popularityScore > 0
          ? `${new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(canonicalArtist.popularityScore)} подписчиков`
          : `${canonicalArtist.trackCount} треков`)
      : "";
    const statusMarkup = status ? `
      <div class="search-result-status is-${status.tone || "info"}" role="${failed ? "alert" : "status"}">
        <span>${escapeHtml(status.message)}</span>
        ${status.retry ? `<button data-search-retry type="button">Повторить</button>` : ""}
      </div>
    ` : "";
    const bestMatchMarkup = bestTrack ? `
      <section class="search-match-section" aria-labelledby="searchBestTitle" data-search-anchor="best:${escapeHtml(bestTrack.id)}">
        <h2 id="searchBestTitle">Лучшее совпадение</h2>
        <button class="search-best-match ${bestTrackPlayable ? "" : "is-unavailable"}" data-best-track-id="${escapeHtml(bestTrack.id)}" data-search-focus-key="best:${escapeHtml(bestTrack.id)}" type="button" aria-label="${bestTrackPlayable ? "Воспроизвести" : "Аудио недоступно"}: ${escapeHtml(bestTrack.title)}" ${bestTrackPlayable ? "" : "disabled"}>
          ${renderSearchCover(bestTrack, "search-best-cover flex items-center justify-center", "text-xl")}
          <span class="search-match-copy">
            <small>${bestTrackPlayable ? "Трек" : "Трек · аудио недоступно"}</small>
            <strong class="track-title-selectable">${highlightMatch(bestTrack.title, query)}</strong>
            <span>${highlightMatch(bestTrack.artist, query)}</span>
          </span>
          <span class="search-match-play" aria-hidden="true"><svg viewBox="0 0 24 24" fill="${bestTrackPlayable ? "currentColor" : "none"}" stroke="currentColor"><path d="${bestTrackPlayable ? "M8.5 6.8v10.4a1 1 0 0 0 1.53.85l7.7-5.2a1 1 0 0 0 0-1.7l-7.7-5.2a1 1 0 0 0-1.53.85Z" : "M7 7l10 10M17 7 7 17"}"/></svg></span>
        </button>
      </section>
    ` : "";
    const canonicalArtistId = canonicalArtist ? escapeHtml(String(canonicalArtist.id)) : "";
    const artistMatchMarkup = canonicalArtist ? `
      <section class="search-match-section" aria-labelledby="searchArtistTitle" data-search-anchor="artist:${canonicalArtistId}">
        <h2 id="searchArtistTitle">Исполнитель</h2>
        <button class="search-artist-match" data-search-artist-id="${canonicalArtistId}" data-search-focus-key="artist:${canonicalArtistId}" type="button" aria-label="Открыть исполнителя: ${escapeHtml(canonicalArtist.name)}">
          <span class="search-artist-avatar">
            <span>${escapeHtml(artistInitials(canonicalArtist.name))}</span>
            ${artistImageUrl ? `<img src="${escapeHtml(artistImageUrl)}" alt="" loading="lazy" decoding="async" />` : ""}
          </span>
          <span class="search-match-copy">
            <small>Точное совпадение · профиль каталога</small>
            <strong>${highlightMatch(canonicalArtist.name, query)}</strong>
            <span>${escapeHtml(artistMeta)}</span>
          </span>
          <span class="search-match-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m9 6 6 6-6 6"/></svg></span>
        </button>
      </section>
    ` : "";
    const albumsMarkup = availableAlbums.map((album, albumIndex) => {
      const albumId = escapeHtml(String(album.id));
      const albumTracks = albumTrackQueues.get(String(album.id)) || [];
      const playableAlbumTracks = albumTracks.filter(canPlayTrack);
      const coverUrl = resolveBackendImageUrl(album.cover_url);
      const releaseYear = album.release_date ? new Date(album.release_date).getFullYear() : null;
      const typeLabel = album.album_type === "ep" ? "EP" : album.album_type === "single" ? "Сингл" : album.album_type === "compilation" ? "Сборник" : "Альбом";
      return `
        <section class="search-album" data-album-id="${albumId}" data-search-anchor="album:${albumId}" aria-labelledby="searchAlbumTitle${albumIndex}">
          <div class="search-album-header">
            <div class="search-album-cover" aria-hidden="true">
              <span>${escapeHtml(artistInitials(album.title))}</span>
              ${coverUrl ? `<img src="${escapeHtml(coverUrl)}" alt="" loading="lazy" decoding="async" />` : ""}
            </div>
            <div class="search-album-copy">
              <span>${typeLabel}${releaseYear ? ` · ${releaseYear}` : ""}</span>
              <h2 id="searchAlbumTitle${albumIndex}">${highlightMatch(album.title, query)}</h2>
              <p>${escapeHtml(album.artist.name)} · ${album.track_count || albumTracks.length} треков</p>
            </div>
            ${playableAlbumTracks.length ? `
              <button class="search-album-play" data-play-album-id="${albumId}" data-search-focus-key="album-play:${albumId}" type="button" aria-label="Воспроизвести альбом ${escapeHtml(album.title)}">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.5 6.8v10.4a1 1 0 0 0 1.53.85l7.7-5.2a1 1 0 0 0 0-1.7l-7.7-5.2a1 1 0 0 0-1.53.85Z"/></svg>
              </button>
            ` : `<span class="search-album-unavailable">Аудио недоступно</span>`}
          </div>
          ${albumTracks.length ? `
            <div class="search-album-tracks">
              ${albumTracks.map((track, trackIndex) => {
                const trackId = escapeHtml(track.id);
                const playable = canPlayTrack(track);
                return `
                  <div class="search-album-track group ${playable ? "" : "is-unavailable"}" data-track-album-id="${albumId}">
                    <span class="search-album-position">${trackIndex + 1}</span>
                    <button class="search-album-track-play" data-album-track-id="${trackId}" data-track-album-id="${albumId}" data-id="${trackId}" data-search-focus-key="album-track:${albumId}:${trackId}" type="button" aria-label="${playable ? "Воспроизвести" : "Аудио недоступно"}: ${escapeHtml(track.title)} — ${escapeHtml(track.artist)}" ${playable ? "" : "disabled"}>
                      <span class="search-album-track-copy">
                        <strong class="track-title-selectable">${highlightMatch(track.title, query)}</strong>
                        <span>${escapeHtml(track.artist)}${String(track.id) === String(album.matched_track_id) ? " · Искомый трек" : ""}</span>
                      </span>
                    </button>
                    <button class="search-album-like-btn playlist-row-btn ${track.liked ? "text-red-400 opacity-100" : ""}" data-track-id="${trackId}" data-search-focus-key="album-like:${albumId}:${trackId}" type="button" aria-label="${track.liked ? "Убрать из избранного" : "Добавить в избранное"}: ${escapeHtml(track.title)}" aria-pressed="${String(track.liked)}">
                      <svg class="w-4 h-4" fill="${track.liked ? "currentColor" : "none"}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
                    </button>
                    <button class="search-album-add-btn playlist-row-btn" data-track-id="${trackId}" data-search-focus-key="album-add:${albumId}:${trackId}" type="button" aria-label="Добавить в плейлист: ${escapeHtml(track.title)}">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    </button>
                    <span class="search-album-duration">${playable ? track.durationLabel : "—"}</span>
                  </div>
                `;
              }).join("")}
            </div>
          ` : `<p class="search-album-empty">Треки релиза ещё загружаются</p>`}
        </section>
      `;
    }).join("");
    const trackRowsMarkup = items.map((track, index) => {
      const trackId = escapeHtml(track.id);
      const playable = canPlayTrack(track);
      return `
        <div class="search-track group ${playable ? "" : "is-unavailable"}" data-search-anchor="track:${trackId}">
          <button class="search-track-play" data-search-track-id="${trackId}" data-id="${trackId}" data-search-focus-key="track:${trackId}" type="button" aria-label="${playable ? "Воспроизвести" : "Аудио недоступно"}: ${escapeHtml(track.title)} — ${escapeHtml(track.artist)}" ${playable ? "" : "disabled"}>
            <span class="search-track-position">${index + 1}</span>
            ${renderSearchCover(track, "w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-sm")}
            <span class="search-track-copy">
              <strong class="track-title-selectable">${highlightMatch(track.title, query)}</strong>
              <span>${highlightMatch(track.artist, query)}</span>
            </span>
          </button>
          <button class="search-like-btn playlist-row-btn ${track.liked ? "text-red-400" : ""}" data-track-id="${trackId}" data-search-focus-key="like:${trackId}" type="button" title="Лайк" aria-label="${track.liked ? "Убрать из избранного" : "Добавить в избранное"}: ${escapeHtml(track.title)}" aria-pressed="${String(track.liked)}">
            <svg class="w-4 h-4" fill="${track.liked ? "currentColor" : "none"}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
          </button>
          <button class="search-add-btn playlist-row-btn" data-track-id="${trackId}" data-search-focus-key="add:${trackId}" type="button" title="Добавить в плейлист" aria-label="Добавить в плейлист: ${escapeHtml(track.title)}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          </button>
          <span class="search-track-duration">${playable ? track.durationLabel : "Недоступно"}</span>
        </div>
      `;
    }).join("");

    container.innerHTML = `
      ${statusMarkup}
      <div class="search-hybrid-grid">${bestMatchMarkup}${artistMatchMarkup}</div>
      ${albumsMarkup ? `<div class="search-albums-heading"><span>Релизы</span><h2>Релизы с найденным треком</h2></div>${albumsMarkup}` : ""}
      ${items.length ? `
        <div class="search-track-heading">
          <div><span>Каталог</span><h2>Треки</h2></div>
          <span>${items.length} треков</span>
        </div>
        <div class="space-y-1 search-track-list">${trackRowsMarkup}</div>
      ` : ""}
    `;

    wireRetry();
    container.querySelector<HTMLButtonElement>("[data-best-track-id]:not([disabled])")?.addEventListener("click", (event) => {
      const id = getElementTrackId(event.currentTarget as HTMLElement, "data-best-track-id");
      if (id) activateTrack(playableItems, id);
    });
    container.querySelector<HTMLButtonElement>("[data-search-artist-id]")?.addEventListener("click", (event) => {
      const artistId = (event.currentTarget as HTMLButtonElement).dataset.searchArtistId;
      if (artistId) switchPage("artist", artistId);
    });
    container.querySelector<HTMLImageElement>(".search-artist-avatar img")?.addEventListener("error", (event) => {
      (event.currentTarget as HTMLImageElement).remove();
    }, { once: true });
    container.querySelectorAll<HTMLImageElement>(".search-album-cover img").forEach((image) => {
      image.addEventListener("error", () => image.remove(), { once: true });
    });
    container.querySelectorAll<HTMLButtonElement>("[data-play-album-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const albumTracks = (albumTrackQueues.get(button.dataset.playAlbumId || "") || []).filter(canPlayTrack);
        if (albumTracks[0]) activateTrack(albumTracks, albumTracks[0].id);
      });
    });
    container.querySelectorAll<HTMLButtonElement>(".search-album-track-play:not([disabled])").forEach((button) => {
      button.addEventListener("click", () => {
        const albumTracks = (albumTrackQueues.get(button.dataset.trackAlbumId || "") || []).filter(canPlayTrack);
        const trackId = getElementTrackId(button, "data-album-track-id");
        if (trackId) activateTrack(albumTracks, trackId);
      });
    });
    container.querySelectorAll<HTMLButtonElement>(".search-track-play:not([disabled])").forEach((button) => {
      button.addEventListener("click", () => {
        const id = getElementTrackId(button, "data-search-track-id");
        if (id) activateTrack(playableItems, id);
      });
    });
    container.querySelectorAll<HTMLElement>(".search-like-btn, .search-album-like-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const trackId = getElementTrackId(button, "data-track-id");
        if (trackId) toggleTrackLike(trackId);
      });
    });
    container.querySelectorAll<HTMLElement>(".search-add-btn, .search-album-add-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const trackId = getElementTrackId(button, "data-track-id");
        if (trackId) showPlaylistPopup(button, trackId);
      });
    });
    enhanceDynamicAccessibility(container);
    updateActiveTrackHighlight();
    restoreViewState(viewState);
    setSearchPending(Boolean(status?.pending));
  };

  const mapSearchResults = (backendTracks: Awaited<ReturnType<typeof searchCatalogOverview>>["tracks"]) => {
    const mapped = mergeTracks(backendTracks.map((track) => mapBackendTrack(track)));
    return prepareSearchTracks(mapped, query, { limit: searchTargetLimit });
  };
  const overviewSignature = (items: Track[], albums: BackendAlbum[]) => (
    `${searchResultsSignature(items)}#${albumResultsSignature(albums)}`
  );
  const pollHydratedResults = (
    attempt: number,
    previousSignature: string,
    legacyMode = false,
  ) => {
    const attemptLimit = legacyMode ? 3 : pollBackoff.length;
    if (!isCurrentSearch() || attempt >= attemptLimit) {
      if (isCurrentSearch()) {
        renderBackendResults(visibleItems, visibleAlbums, {
          message: legacyMode
            ? "Показаны актуальные доступные совпадения. Релизы появятся после обновления сервера."
            : "Каталог продолжает обновляться. Новые релизы появятся при следующем поиске.",
          tone: "info",
          retry: !legacyMode,
        });
      }
      return;
    }
    activeSearchPollTimer = window.setTimeout(() => {
      activeSearchPollTimer = null;
      if (!isCurrentSearch()) return;
      const request = legacyMode
        ? searchCatalog(query, searchTargetLimit, controller.signal).then((resultTracks) => ({
            tracks: resultTracks,
            albums: [] as BackendAlbum[],
            refresh_pending: true,
            legacy_fallback: true,
          }))
        : searchCatalogOverview(query, searchTargetLimit, 3, controller.signal);
      request
        .then((result) => {
          if (!isCurrentSearch()) return;
          const items = mapSearchResults(result.tracks);
          const nextSignature = overviewSignature(items, result.albums);
          if (nextSignature !== previousSignature || !result.refresh_pending) {
            renderBackendResults(items, result.albums, result.refresh_pending ? {
              message: "Дополняем результаты релизами из каталога…",
              tone: "info",
              pending: true,
            } : null);
          }
          if (result.refresh_pending) {
            pollHydratedResults(
              attempt + 1,
              nextSignature,
              legacyMode || Boolean(result.legacy_fallback),
            );
          } else {
            setSearchPending(false);
          }
        })
        .catch((error: unknown) => {
          if (!isCurrentSearch() || (error instanceof DOMException && error.name === "AbortError")) return;
          renderBackendResults(visibleItems, visibleAlbums, {
            message: "Не удалось обновить результаты. Уже найденные треки можно продолжать слушать.",
            tone: "error",
            retry: true,
          });
        });
    }, pollBackoff[attempt]);
  };

  if (!q) {
    container.innerHTML = `
      <div class="search-empty-state" role="status">
        <div class="search-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/></svg></div>
        <h2>Введите название для поиска</h2>
        <p>Можно искать треки, точные профили артистов и альбомы.</p>
      </div>
    `;
    setSearchPending(false);
    return;
  }

  setSearchPending(true);
  container.innerHTML = `
    <div class="search-loading" role="status" aria-live="polite">
      <div class="track-skeleton"></div>
      <div>
        <h2 class="text-base font-semibold mb-1">Ищем в каталоге</h2>
        <p class="text-sm text-white/40">Запрос «${escapeHtml(query)}»</p>
      </div>
    </div>
  `;
  void getOnboardingArtists({ search: query, page: 1, limit: 5, signal: controller.signal })
    .then((response) => {
      if (!isCurrentSearch()) return;
      canonicalArtist = response.items.find((artist) => isExactArtistSearch(artist.name, query)) ?? null;
      if (hasRenderedResults) renderBackendResults(visibleItems, visibleAlbums, visibleStatus);
    })
    .catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        // Track and album search remains usable without an exact artist card.
      }
    });
  activeSearchFallbackTimer = window.setTimeout(() => {
    activeSearchFallbackTimer = null;
    if (!isCurrentSearch()) return;
    renderBackendResults(localResults(), [], {
      message: "Сервер отвечает медленно. Пока показаны сохранённые совпадения.",
      tone: "info",
      pending: true,
    });
  }, 2500);
  searchCatalogOverview(query, searchTargetLimit, 3, controller.signal)
    .then((result) => {
      if (activeSearchFallbackTimer !== null) window.clearTimeout(activeSearchFallbackTimer);
      activeSearchFallbackTimer = null;
      if (!isCurrentSearch()) return;
      const items = mapSearchResults(result.tracks);
      const status: SearchRenderStatus | null = result.refresh_pending
        ? {
            message: result.legacy_fallback
              ? "Обновляем каталог и проверяем новые совпадения…"
              : "Дополняем результаты релизами из каталога…",
            tone: "info",
            pending: true,
          }
        : null;
      renderBackendResults(items, result.albums, status);
      announce(`Найдено: ${items.length} треков${result.albums.length ? ` и ${result.albums.length} релизов` : ""}`);
      if (result.refresh_pending) {
        pollHydratedResults(
          0,
          overviewSignature(items, result.albums),
          Boolean(result.legacy_fallback),
        );
      } else {
        setSearchPending(false);
      }
    })
    .catch((error: unknown) => {
      if (activeSearchFallbackTimer !== null) window.clearTimeout(activeSearchFallbackTimer);
      activeSearchFallbackTimer = null;
      if (!isCurrentSearch() || (error instanceof DOMException && error.name === "AbortError")) return;
      renderBackendResults(localResults(), [], {
        message: "Каталог сейчас недоступен. Показаны сохранённые совпадения.",
        tone: "error",
        retry: true,
      });
      setSearchPending(false);
    });
}

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

function setQueueFromTracks(trackList: Track[], startId: TrackId) {
  player.queue = trackList.map((t) => t.id);
  player.queueIndex = trackList.findIndex((t) => t.id === startId);
}

function showQueueSheet() {
  const existing = document.querySelector<HTMLElement>(".queue-overlay");
  if (existing) {
    existing.querySelector<HTMLButtonElement>(".queue-close")?.click();
    return;
  }
  if (player.queue.length === 0) setQueueFromTracks(tracks, player.currentTrackId);
  const queuedTracks = player.queue.map((id) => getTrack(id)).filter((track): track is Track => Boolean(track));
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : queueBtn;
  const overlay = document.createElement("div");
  overlay.className = "queue-overlay";
  overlay.innerHTML = `
    <aside class="queue-sheet" role="dialog" aria-modal="true" aria-labelledby="queueTitle">
      <div class="queue-header">
        <div><p class="section-kicker">Далее прозвучит</p><h2 id="queueTitle">Очередь</h2></div>
        <button class="queue-close" type="button" aria-label="Закрыть очередь">×</button>
      </div>
      <div class="queue-list">
        ${queuedTracks.length ? queuedTracks.map((track) => `
          <button class="queue-item ${track.id === player.currentTrackId ? "is-current" : ""}" type="button" data-queue-id="${escapeHtml(String(track.id))}" ${track.id === player.currentTrackId ? 'aria-current="true"' : ""}>
            ${renderCover(track, "queue-item-cover w-10 h-10 rounded-xl flex items-center justify-center text-xs")}
            <span class="queue-item-copy"><strong class="track-title-selectable">${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></span>
            <span class="queue-item-time tabular-nums">${track.durationLabel}</span>
          </button>
        `).join("") : `<div class="playlist-empty"><strong>Очередь пуста</strong><span>Запустите трек из любой подборки</span></div>`}
      </div>
    </aside>
  `;
  document.body.appendChild(overlay);
  setFocusBackgroundInert(true);
  focusOverlay.inert = true;
  queueBtn.setAttribute("aria-expanded", "true");
  const sheet = overlay.querySelector<HTMLElement>(".queue-sheet")!;
  const closeButton = overlay.querySelector<HTMLButtonElement>(".queue-close")!;

  function closeQueue() {
    document.removeEventListener("keydown", onKeyDown, true);
    overlay.remove();
    focusOverlay.inert = false;
    if (!focusOverlay.classList.contains("active")) setFocusBackgroundInert(false);
    queueBtn.setAttribute("aria-expanded", "false");
    previousFocus.focus();
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      closeQueue();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...sheet.querySelectorAll<HTMLElement>("button:not([disabled])")];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  closeButton.addEventListener("click", closeQueue);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) closeQueue(); });
  sheet.addEventListener("click", (event) => event.stopPropagation());
  overlay.querySelectorAll<HTMLButtonElement>("[data-queue-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = normalizeTrackId(button.dataset.queueId);
      if (id) loadTrackById(id, true);
      closeQueue();
    });
  });
  document.addEventListener("keydown", onKeyDown, true);
  window.setTimeout(() => closeButton.focus(), 40);
}

queueBtn.addEventListener("click", showQueueSheet);

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

const STORAGE_KEY_LIKED = "mm_liked";
const STORAGE_KEY_SETTINGS = "mm_settings";
const STORAGE_KEY_PLTRACKS = "mm_pltracks";
const STORAGE_KEY_PLREMOVED = "mm_plremoved";
const STORAGE_KEY_PLORDER = "mm_plorder";
const STORAGE_KEY_USER_PLAYLISTS = "mm_user_playlists";
const STORAGE_KEY_EQUALIZER = "mm_equalizer";

let savedSettings: Record<string, any> | null = null;
let playlistTrackAssign: Record<string, TrackId[]> = {};
let playlistTrackRemoved: Record<string, TrackId[]> = {};
let playlistOrder: string[] = [];

function accountStorageKey(baseKey: string): string {
  const user = currentAuthUser || getStoredAuthUser();
  return `${baseKey}:user:${user?.id ?? "guest"}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]!));
}

function normalizeStoredPlaylistTracks(value: unknown): Record<string, TrackId[]> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([playlistId, rawIds]) => {
    const ids = Array.isArray(rawIds) ? rawIds.map(normalizeTrackId).filter(Boolean) as TrackId[] : [];
    return [playlistId, [...new Set(ids)]];
  }));
}

function saveLikedTracks() {
  localStorage.setItem(accountStorageKey(STORAGE_KEY_LIKED), JSON.stringify(tracks.filter((t) => t.liked).map((t) => t.id)));
}

function loadLikedTracks() {
  try {
    tracks.forEach((track) => { track.liked = false; });
    const data = localStorage.getItem(accountStorageKey(STORAGE_KEY_LIKED));
    if (data) {
      const ids = new Set((JSON.parse(data) as unknown[]).map(normalizeTrackId).filter(Boolean) as TrackId[]);
      tracks.forEach((t) => { t.liked = ids.has(t.id); });
    }
    const likedIds = new Set(tracks.filter((track) => track.liked).map((track) => track.id));
    metadataTrackCollections().forEach((collection) => collection.forEach((track) => {
      track.liked = likedIds.has(track.id);
    }));
  } catch { /* ignore */ }
}

async function syncFavoritesWithBackend(): Promise<void> {
  if (!getAuthToken()) return;
  const accountId = (currentAuthUser || getStoredAuthUser())?.id;
  if (!accountId) return;
  const generation = metadataFeedGeneration;
  try {
    const favorites = await getUserFavorites();
    if (generation !== metadataFeedGeneration || (currentAuthUser || getStoredAuthUser())?.id !== accountId) return;
    const backendTracks = mergeTracks(favorites.map((favorite) => mapBackendTrack(favorite.track)));
    const serverIds = new Set(backendTracks.map((track) => track.id));
    const localIds = new Set(tracks.filter((track) => track.liked).map((track) => track.id));
    const likedIds = new Set([...serverIds, ...localIds]);
    likedIds.forEach((trackId) => setTrackLikedState(trackId, true));
    saveLikedTracks();
    updateLikeButton();
    likedIds.forEach((trackId) => updateRenderedLikeButtons(trackId, true));

    // One-time migration for account-scoped likes created before server sync.
    await Promise.all([...localIds]
      .filter((trackId) => /^\d+$/.test(String(trackId)) && !serverIds.has(trackId))
      .map((trackId) => setUserFavorite(trackId, true).catch(() => undefined)));
  } catch {
    // Offline mode keeps the account-scoped local copy and retries next launch.
  }
}

function saveSettings() {
  const s: PlayerSettings = {
    theme: (document.getElementById("themeToggle") as HTMLInputElement)?.checked ?? true,
    scale: (document.getElementById("scaleSlider") as HTMLInputElement)?.value ?? "100",
    normalize: (document.getElementById("normalizeToggle") as HTMLInputElement)?.checked ?? false,
    crossfade: (document.getElementById("crossfadeToggle") as HTMLInputElement)?.checked ?? false,
    autoplay: (document.getElementById("autoplayToggle") as HTMLInputElement)?.checked ?? true,
    prefetch: (document.getElementById("prefetchToggle") as HTMLInputElement)?.checked ?? true,
    compact: (document.getElementById("compactToggle") as HTMLInputElement)?.checked ?? false,
    reduceMotion: (document.getElementById("reduceMotionToggle") as HTMLInputElement)?.checked ?? false,
    accent: (document.getElementById("accentSelect") as HTMLSelectElement)?.value ?? "violet",
  };
  localStorage.setItem(accountStorageKey(STORAGE_KEY_SETTINGS), JSON.stringify(s));
  savedSettings = s;
}

function loadSettings() {
  savedSettings = null;
  try {
    const data = localStorage.getItem(accountStorageKey(STORAGE_KEY_SETTINGS));
    if (data) savedSettings = JSON.parse(data);
  } catch { /* ignore */ }
}

function saveEqualizerState() {
  localStorage.setItem(accountStorageKey(STORAGE_KEY_EQUALIZER), JSON.stringify({ version: EQUALIZER_STATE_VERSION, ...equalizerState }));
}

function loadEqualizerState() {
  equalizerState = { ...DEFAULT_EQUALIZER, gains: [...DEFAULT_EQUALIZER.gains] };
  try {
    const raw = localStorage.getItem(accountStorageKey(STORAGE_KEY_EQUALIZER));
    if (raw) {
      const restored = restoreEqualizerState(JSON.parse(raw));
      equalizerState = restored.state;
      if (restored.migrated) saveEqualizerState();
    }
  } catch { /* ignore malformed local state */ }
  applyEqualizerGains();
}

function savePlaylistTrackAssign() {
  localStorage.setItem(accountStorageKey(STORAGE_KEY_PLTRACKS), JSON.stringify(playlistTrackAssign));
}

function loadPlaylistTrackAssign() {
  try {
    const data = localStorage.getItem(accountStorageKey(STORAGE_KEY_PLTRACKS));
    if (data) playlistTrackAssign = normalizeStoredPlaylistTracks(JSON.parse(data));
  } catch { /* ignore */ }
}

function savePlaylistTrackRemoved() {
  localStorage.setItem(accountStorageKey(STORAGE_KEY_PLREMOVED), JSON.stringify(playlistTrackRemoved));
}

function loadPlaylistTrackRemoved() {
  try {
    const data = localStorage.getItem(accountStorageKey(STORAGE_KEY_PLREMOVED));
    if (data) playlistTrackRemoved = normalizeStoredPlaylistTracks(JSON.parse(data));
  } catch { /* ignore */ }
}

function savePlaylistOrder() {
  localStorage.setItem(accountStorageKey(STORAGE_KEY_PLORDER), JSON.stringify(playlistOrder));
}

function loadPlaylistOrder() {
  try {
    const data = localStorage.getItem(accountStorageKey(STORAGE_KEY_PLORDER));
    if (data) {
      playlistOrder = JSON.parse(data);
      if (playlistOrder.length === playlists.length) {
        const ordered = playlistOrder.map((id) => playlists.find((p) => p.id === id)).filter(Boolean) as PlaylistDef[];
        if (ordered.length === playlists.length) { playlists.length = 0; playlists.push(...ordered); }
      }
    }
  } catch { /* ignore */ }
}

function saveUserPlaylists() {
  const userPlaylists = playlists.filter((p) => p.userCreated);
  localStorage.setItem(accountStorageKey(STORAGE_KEY_USER_PLAYLISTS), JSON.stringify(userPlaylists));
}

function loadUserPlaylists() {
  try {
    const data = localStorage.getItem(accountStorageKey(STORAGE_KEY_USER_PLAYLISTS));
    if (!data) return;
    const storedPlaylists: PlaylistDef[] = JSON.parse(data);
    const userPlaylists = storedPlaylists.filter((playlist) => (
      !LEGACY_EDITORIAL_PLAYLIST_IDS.has(playlist?.id)
      && !LEGACY_EDITORIAL_PLAYLIST_NAMES.has(String(playlist?.name || "").trim().toLowerCase())
    ));
    if (userPlaylists.length !== storedPlaylists.length) {
      localStorage.setItem(accountStorageKey(STORAGE_KEY_USER_PLAYLISTS), JSON.stringify(userPlaylists));
    }
    userPlaylists.forEach((pl) => {
      if (!pl?.id || !pl?.name || playlists.some((existing) => existing.id === pl.id)) return;
      playlists.push({
        id: pl.id,
        name: pl.name,
        description: pl.description || "Пользовательский плейлист",
        gradient: pl.gradient || "from-indigo-600 to-slate-900",
        icon: pl.icon || "🎵",
        genreFilter: [],
        userCreated: true,
      });
    });
  } catch { /* ignore */ }
}

let hydratedAccountId: number | string | null = null;

function hydrateAccountState(force = false) {
  const accountId = (currentAuthUser || getStoredAuthUser())?.id ?? "guest";
  if (!force && hydratedAccountId === accountId) return;
  const accountChanged = hydratedAccountId !== accountId;
  hydratedAccountId = accountId;
  metadataFeedGeneration++;
  if (accountChanged) {
    // Never render or report impressions from the previous account while the
    // next user's feed request is still in flight. The cache is account-scoped;
    // a new account without a cache receives the neutral fallback only.
    metadataFeed = getInitialMetadataFeed(accountId);
    tracks = [...metadataFeed.all];
    popularVisibleCount = POPULAR_INITIAL_RENDER;
    pendingListeningMilliseconds = 0;
    listeningClockStartedAt = null;
    streamTicketCache.clear();
    playbackSessionTracker.reset();
    recordedArtistViews.clear();
    recommendationImpressions.clear();
  }
  for (let index = playlists.length - 1; index >= 0; index--) {
    if (playlists[index].userCreated) playlists.splice(index, 1);
  }
  playlistTrackAssign = {};
  playlistTrackRemoved = {};
  playlistOrder = [];
  loadLikedTracks();
  loadSettings();
  loadEqualizerState();
  loadPlaylistTrackAssign();
  loadPlaylistTrackRemoved();
  loadUserPlaylists();
  loadPlaylistOrder();
  applySettingsEffects();
  syncPremiumControls();
  renderSidebarPlaylists();
}

function createUserPlaylist(name: string): PlaylistDef | null {
  const cleanName = name.trim().replace(/\s+/g, " ");
  if (!cleanName) return null;
  const duplicate = playlists.some((pl) => pl.name.toLowerCase() === cleanName.toLowerCase());
  if (duplicate) return null;
  const playlist: PlaylistDef = {
    id: `user-${Date.now()}`,
    name: cleanName,
    description: "Пользовательский плейлист",
    gradient: "from-indigo-600 to-slate-900",
    icon: "🎵",
    genreFilter: [],
    userCreated: true,
  };
  playlists.push(playlist);
  playlistTrackAssign[playlist.id] = [];
  playlistTrackRemoved[playlist.id] = [];
  playlistOrder = playlists.map((p) => p.id);
  saveUserPlaylists();
  savePlaylistTrackAssign();
  savePlaylistTrackRemoved();
  savePlaylistOrder();
  return playlist;
}

function renameUserPlaylist(playlistId: string, name: string): string | null {
  const playlist = playlists.find((pl) => pl.id === playlistId);
  const cleanName = name.trim().replace(/\s+/g, " ");
  if (!playlist?.userCreated) return "Этот плейлист нельзя переименовать";
  if (!cleanName) return "Введите название плейлиста";
  if (playlists.some((pl) => pl.id !== playlistId && pl.name.toLowerCase() === cleanName.toLowerCase())) {
    return "Плейлист с таким названием уже есть";
  }
  playlist.name = cleanName;
  playlist.description = "Пользовательский плейлист";
  saveUserPlaylists();
  renderSidebarPlaylists();
  return null;
}

function deleteUserPlaylist(playlistId: string): boolean {
  const index = playlists.findIndex((pl) => pl.id === playlistId && pl.userCreated);
  if (index === -1) return false;
  playlists.splice(index, 1);
  delete playlistTrackAssign[playlistId];
  delete playlistTrackRemoved[playlistId];
  playlistOrder = playlists.map((p) => p.id);
  saveUserPlaylists();
  savePlaylistTrackAssign();
  savePlaylistTrackRemoved();
  savePlaylistOrder();
  renderSidebarPlaylists();
  return true;
}

function isTrackInPlaylist(trackId: TrackId, playlistId: string): boolean {
  const playlist = playlists.find((pl) => pl.id === playlistId);
  if (!playlist) return false;
  return getPlaylistTracks(playlist).some((track) => track.id === trackId);
}

function addTrackToPlaylist(trackId: TrackId, playlistId: string): boolean {
  const playlist = playlists.find((pl) => pl.id === playlistId);
  if (!playlist) return false;
  if (!playlistTrackAssign[playlistId]) playlistTrackAssign[playlistId] = [];
  if (!playlistTrackRemoved[playlistId]) playlistTrackRemoved[playlistId] = [];
  const removed = playlistTrackRemoved[playlistId];
  const removedIdx = removed.indexOf(trackId);
  if (removedIdx !== -1) removed.splice(removedIdx, 1);
  if (isTrackInPlaylist(trackId, playlistId)) {
    savePlaylistTrackRemoved();
    return false;
  }
  const list = playlistTrackAssign[playlistId];
  if (!list.includes(trackId)) list.push(trackId);
  savePlaylistTrackAssign();
  savePlaylistTrackRemoved();
  if (getAuthToken() && /^\d+$/.test(String(trackId))) {
    void postMusicSignal({ signal: "playlist", trackId, context: "playlist" })
      .then(() => queueRecommendationRefresh())
      .catch(() => undefined);
  }
  return true;
}

function removeTrackFromPlaylist(trackId: TrackId, playlistId: string) {
  const playlist = playlists.find((pl) => pl.id === playlistId);
  if (!playlist) return;
  if (!playlistTrackAssign[playlistId]) playlistTrackAssign[playlistId] = [];
  if (!playlistTrackRemoved[playlistId]) playlistTrackRemoved[playlistId] = [];
  playlistTrackAssign[playlistId] = playlistTrackAssign[playlistId].filter((id) => id !== trackId);
  const track = getTrack(trackId);
  if (track && playlist.genreFilter.includes(track.genre) && !playlistTrackRemoved[playlistId].includes(trackId)) {
    playlistTrackRemoved[playlistId].push(trackId);
  }
  savePlaylistTrackAssign();
  savePlaylistTrackRemoved();
  if (getAuthToken() && /^\d+$/.test(String(trackId))) {
    void postMusicSignal({ signal: "playlist_remove", trackId, context: "playlist" })
      .then(() => queueRecommendationRefresh())
      .catch(() => undefined);
  }
}

function showPlaylistPopup(anchor: HTMLElement, trackId: TrackId, onChange?: (playlistId: string) => void) {
  const existing = document.querySelector(".pl-popup")!;
  if (existing) { existing.remove(); return; }

  const anchorButton = anchor.closest<HTMLElement>("button") || anchor;
  const rect = anchorButton.getBoundingClientRect();
  const popup = document.createElement("div");
  popup.className = "pl-popup";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", "Добавить в плейлист");
  popup.style.visibility = "hidden";
  popup.innerHTML = `
    <div class="pl-popup-title">Добавить в плейлист</div>
    <div class="pl-popup-list"></div>
    <button class="pl-popup-create" type="button">+ Создать плейлист</button>
    <form class="pl-popup-form hidden">
      <label class="sr-only" for="popupPlaylistName">Название плейлиста</label>
      <input id="popupPlaylistName" class="pl-popup-input" type="text" maxlength="40" autocomplete="off" placeholder="Название плейлиста" />
      <div class="pl-popup-form-actions">
        <button class="pl-popup-save" type="submit">Создать</button>
        <button class="pl-popup-cancel" type="button">Отмена</button>
      </div>
      <p class="pl-popup-error hidden" role="alert"></p>
    </form>
  `;
  function closePopup(restoreFocus = true) {
    document.removeEventListener("click", onDocumentClick);
    document.removeEventListener("keydown", onPopupKeyDown);
    popup.remove();
    if (restoreFocus) anchorButton.focus();
  }
  function onDocumentClick(event: MouseEvent) {
    if (!popup.contains(event.target as Node)) closePopup(false);
  }
  function onPopupKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePopup();
    }
  }
  const listEl = popup.querySelector(".pl-popup-list")!;
  playlists.forEach((pl) => {
    const assigned = isTrackInPlaylist(trackId, pl.id);
    const item = document.createElement("button");
    item.type = "button";
    item.className = `pl-popup-item ${assigned ? "is-assigned" : ""}`;
    item.setAttribute("aria-label", `${assigned ? "Уже добавлено: " : "Добавить в "}${pl.name}`);
    item.innerHTML = `<span class="pl-popup-icon">${pl.icon}</span><span class="pl-popup-name">${escapeHtml(pl.name)}</span><span class="pl-popup-state">${assigned ? "✓" : ""}</span>`;
    item.disabled = assigned;
    if (!assigned) {
      item.addEventListener("click", () => {
        addTrackToPlaylist(trackId, pl.id);
        renderSidebarPlaylists();
        if (currentPage === "playlist") switchPage("playlist", currentPlaylistId);
        closePopup(false);
        onChange?.(pl.id);
      });
    }
    listEl.appendChild(item);
  });
  const createBtn = popup.querySelector(".pl-popup-create")! as HTMLButtonElement;
  const form = popup.querySelector(".pl-popup-form")! as HTMLFormElement;
  const input = popup.querySelector(".pl-popup-input")! as HTMLInputElement;
  const cancelBtn = popup.querySelector(".pl-popup-cancel")! as HTMLButtonElement;
  const errorEl = popup.querySelector(".pl-popup-error")! as HTMLElement;

  function setPopupError(message = "") {
    errorEl.textContent = message;
    errorEl.classList.toggle("hidden", !message);
  }

  createBtn.addEventListener("click", () => {
    createBtn.classList.add("hidden");
    form.classList.remove("hidden");
    input.focus();
  });
  cancelBtn.addEventListener("click", () => {
    form.classList.add("hidden");
    createBtn.classList.remove("hidden");
    input.value = "";
    setPopupError();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = input.value.trim().replace(/\s+/g, " ");
    if (!name) { setPopupError("Введите название плейлиста"); return; }
    if (playlists.some((pl) => pl.name.toLowerCase() === name.toLowerCase())) {
      setPopupError("Плейлист с таким названием уже есть");
      return;
    }
    const playlist = createUserPlaylist(name);
    if (!playlist) { setPopupError("Не удалось создать плейлист"); return; }
    addTrackToPlaylist(trackId, playlist.id);
    renderSidebarPlaylists();
    closePopup(false);
    switchPage("playlist", playlist.id);
    onChange?.(playlist.id);
  });

  document.body.appendChild(popup);
  const gap = 8;
  const playerClearance = 14;
  const playerRect = document.querySelector(".player-bar")?.getBoundingClientRect();
  const bottomLimit = Math.max(gap + 140, Math.min(window.innerHeight - gap, (playerRect?.top ?? window.innerHeight) - playerClearance));
  const maxHeight = Math.max(160, Math.min(380, bottomLimit - gap));
  popup.style.maxHeight = `${maxHeight}px`;
  (listEl as HTMLElement).style.maxHeight = `${Math.max(92, maxHeight - 118)}px`;
  const popupRect = popup.getBoundingClientRect();
  const left = Math.min(Math.max(gap, rect.left), window.innerWidth - popupRect.width - gap);
  const topBelow = rect.bottom + gap;
  const topAbove = rect.top - Math.min(popupRect.height, maxHeight) - gap;
  const naturalTop = topBelow + popupRect.height <= bottomLimit ? topBelow : topAbove;
  const top = Math.max(gap, Math.min(naturalTop, bottomLimit - popupRect.height));
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  popup.style.visibility = "visible";
  document.addEventListener("keydown", onPopupKeyDown);

  const clampPopupPosition = () => {
    const settledRect = popup.getBoundingClientRect();
    if (settledRect.right > window.innerWidth - gap) {
      popup.style.left = `${Math.max(gap, window.innerWidth - settledRect.width - gap)}px`;
    }
    if (settledRect.left < gap) {
      popup.style.left = `${gap}px`;
    }
    if (settledRect.bottom > bottomLimit) {
      popup.style.top = `${Math.max(gap, bottomLimit - settledRect.height - 2)}px`;
    }
  };

  clampPopupPosition();
  requestAnimationFrame(clampPopupPosition);
  setTimeout(() => document.addEventListener("click", onDocumentClick), 10);
  window.setTimeout(() => (listEl.querySelector("button") as HTMLButtonElement | null)?.focus(), 20);
}

function getPlaylistTracks(pl: PlaylistDef): Track[] {
  const explicit = (playlistTrackAssign[pl.id] || []).map((id) => tracks.find((t) => t.id === id)).filter(Boolean) as Track[];
  const removed = new Set(playlistTrackRemoved[pl.id] || []);
  const filtered = tracks.filter((t) => pl.genreFilter.includes(t.genre) && !removed.has(t.id));
  const seen = new Set<TrackId>();
  return [...filtered, ...explicit].filter((t) => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
}

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

let currentVolume = 0.25;
let lastNonZeroVolume = 0.25;
let muted = false;
let playbackGain = 1;
let fadeTimer: number | null = null;
let crossfadeArmedFor: TrackId | null = null;

function applyVolume() {
  const settings = getPlayerSettings();
  const normalizedVolume = settings.normalize ? Math.min(1, Math.max(currentVolume, currentVolume * 0.86 + 0.08)) : currentVolume;
  audioEl.volume = Math.max(0, Math.min(1, normalizedVolume * playbackGain));
  audioEl.muted = muted;
}

function fadePlaybackGain(to: number, durationMs = 700) {
  if (fadeTimer !== null) window.clearInterval(fadeTimer);
  const from = playbackGain;
  const startedAt = performance.now();
  fadeTimer = window.setInterval(() => {
    const pct = Math.min(1, (performance.now() - startedAt) / durationMs);
    playbackGain = from + (to - from) * pct;
    applyVolume();
    if (pct >= 1 && fadeTimer !== null) {
      window.clearInterval(fadeTimer);
      fadeTimer = null;
    }
  }, 16);
}

function updateVolumeUi() {
  const visibleVolume = muted ? 0 : currentVolume;
  volFill.style.width = `${visibleVolume * 100}%`;
  volThumb.style.left = `${visibleVolume * 100}%`;
  volumeBtn.classList.toggle("text-white/80", muted);
  volumeBtn.classList.toggle("text-white/40", !muted);
  volumeBtn.setAttribute("aria-pressed", String(muted));
  volumeBtn.setAttribute("aria-label", muted ? "Включить звук" : "Отключить звук");
  const percent = Math.round(visibleVolume * 100);
  volumeContainer.setAttribute("aria-valuenow", String(percent));
  volumeContainer.setAttribute("aria-valuetext", `${percent} процентов`);
}

function playLoadedAudio(token: number, attempt = 0) {
  if (token !== playbackToken) return;
  if (audioEl.readyState < HTMLMediaElement.HAVE_METADATA && attempt === 0) {
    let resumed = false;
    const resumeWhenReady = () => {
      if (resumed) return;
      resumed = true;
      audioEl.removeEventListener("loadedmetadata", resumeWhenReady);
      audioEl.removeEventListener("canplay", resumeWhenReady);
      window.clearTimeout(readinessTimeout);
      if (token === playbackToken) playLoadedAudio(token, 1);
    };
    const readinessTimeout = window.setTimeout(resumeWhenReady, 5000);
    audioEl.addEventListener("loadedmetadata", resumeWhenReady, { once: true });
    audioEl.addEventListener("canplay", resumeWhenReady, { once: true });
    return;
  }
  applyVolume();
  audioEl.play()
    .then(() => {
      if (token !== playbackToken) return;
      clearPlaybackBuffering();
      player.playing = true;
      updatePlayIcon();
      if (token === playbackToken) recordActiveTrackPlay();
      if (token === playbackToken && getPlayerSettings().crossfade) fadePlaybackGain(1, 900);
    })
    .catch(() => {
      if (token !== playbackToken) return;
      if (attempt < 2 && !audioEl.error) {
        window.setTimeout(() => playLoadedAudio(token, attempt + 1), 350);
        return;
      }
      clearPlaybackBuffering();
      player.playing = false;
      updatePlayIcon();
      showTrackNotice("Не удалось запустить аудиопоток");
    });
}

function withPlaybackStart(sourceUrl: string, startSeconds: number): string {
  if (startSeconds <= 0) return sourceUrl;
  const url = new URL(sourceUrl, window.location.href);
  url.searchParams.set("start", startSeconds.toFixed(3));
  url.searchParams.set("_seek", String(Date.now()));
  return url.toString();
}

function attachNativeAudio(sourceUrl: string, token: number, startSeconds = 0, autoplay = true) {
  currentStreamOffset = Math.max(0, startSeconds);
  audioEl.src = withPlaybackStart(sourceUrl, currentStreamOffset);
  audioEl.load();
  if (autoplay) playLoadedAudio(token);
}

function isHlsPlaybackUrl(sourceUrl: string) {
  return /\.m3u8(?:$|\?)/i.test(sourceUrl);
}

function startAudio(track: Track, beginNewCycle = false) {
  if (equalizerState.enabled) void ensureAudioGraph();

  const hasActiveSource = activeAudioTrackId === track.id && Boolean(audioEl.src || hlsPlayer);
  if (!hasActiveSource || beginNewCycle) playbackHistoryGate.begin();

  if (hasActiveSource) {
    player.playing = true;
    beginPlaybackBuffering(playbackToken);
    playLoadedAudio(playbackToken);
    return;
  }

  stopAudio();
  const token = ++playbackToken;
  activeAudioTrackId = track.id;
  player.playing = true;
  beginPlaybackBuffering(token);
  crossfadeArmedFor = null;
  playbackGain = getPlayerSettings().crossfade ? 0 : 1;
  void getTrackPlaybackUrl(track).then(async (sourceUrl) => {
    if (!sourceUrl || token !== playbackToken || activeAudioTrackId !== track.id || !player.playing) return;
    if (isHlsPlaybackUrl(sourceUrl)) {
      const HlsConstructor = await loadHlsConstructor();
      if (token !== playbackToken || activeAudioTrackId !== track.id || !player.playing) return;
      if (HlsConstructor.isSupported()) {
        hlsPlayer = new HlsConstructor();
        hlsPlayer.loadSource(sourceUrl);
        hlsPlayer.attachMedia(audioEl);
        hlsPlayer.on(HlsConstructor.Events.MANIFEST_PARSED, () => playLoadedAudio(token));
        hlsPlayer.on(HlsConstructor.Events.ERROR, (_event, data) => {
          if (token !== playbackToken || !data.fatal) return;
          hlsPlayer?.destroy();
          hlsPlayer = null;
          attachNativeAudio(sourceUrl, token, 0);
        });
        return;
      }
    }
    attachNativeAudio(sourceUrl, token, 0);
  }).catch(() => {
    if (token !== playbackToken) return;
    clearPlaybackBuffering();
    player.playing = false;
    updatePlayIcon();
    showTrackNotice("Не удалось получить доступ к аудиопотоку");
  });
}

function stopAudio(reason: PlaybackEndReason = "stop") {
  finalizePlaybackSession(reason);
  playbackToken++;
  pendingSeekCleanup?.();
  pendingSeekCleanup = null;
  clearPlaybackBuffering();
  if (fadeTimer !== null) {
    window.clearInterval(fadeTimer);
    fadeTimer = null;
  }
  playbackGain = 1;
  if (hlsPlayer) {
    hlsPlayer.destroy();
    hlsPlayer = null;
  }
  audioEl.pause();
  audioEl.removeAttribute("src");
  audioEl.load();
  activeAudioTrackId = null;
  currentStreamOffset = 0;
}

function seekActiveTrack(seconds: number) {
  const track = getTrack(player.currentTrackId);
  if (!track) return;
  const duration = getCurrentDuration(track);
  const target = Math.max(0, Math.min(duration || seconds, seconds));
  player.currentTime = Math.round(target);
  updateAllTimelines();

  if (activeAudioTrackId !== track.id) return;
  const shouldResume = player.playing;
  pendingSeekCleanup?.();
  pendingSeekCleanup = null;

  const applyNativeSeek = () => {
    if (activeAudioTrackId !== track.id) return false;
    if (audioEl.readyState < HTMLMediaElement.HAVE_METADATA) return false;
    const nativeTarget = Math.max(0, target - currentStreamOffset);
    try {
      audioEl.currentTime = nativeTarget;
      player.playing = shouldResume;
      if (shouldResume) beginPlaybackBuffering(playbackToken);
      return true;
    } catch {
      return false;
    }
  };

  if (applyNativeSeek()) return;

  // A seek can happen immediately after Play, before WebView2 has parsed the
  // MP3 metadata. Keep the requested position and apply it to the original
  // stream as soon as it becomes seekable instead of replacing its src.
  const expectedToken = playbackToken;
  let settled = false;
  const cleanup = () => {
    if (settled) return;
    settled = true;
    audioEl.removeEventListener("canplay", applyWhenReady);
    audioEl.removeEventListener("playing", applyWhenReady);
    window.clearTimeout(timeout);
    if (pendingSeekCleanup === cleanup) pendingSeekCleanup = null;
  };
  const applyWhenReady = () => {
    if (expectedToken !== playbackToken || activeAudioTrackId !== track.id) {
      cleanup();
      return;
    }
    if (applyNativeSeek()) cleanup();
  };
  const timeout = window.setTimeout(() => {
    if (!settled && expectedToken === playbackToken) showTrackNotice("Трек ещё загружается — попробуйте перемотать снова");
    cleanup();
  }, 20_000);
  pendingSeekCleanup = cleanup;
  audioEl.addEventListener("canplay", applyWhenReady);
  audioEl.addEventListener("playing", applyWhenReady);

  // The event may have fired between the initial check and listener setup.
  applyWhenReady();
}

function previewActiveTrackPosition(pct: number) {
  const track = getTrack(player.currentTrackId);
  if (!track) return;
  const duration = getCurrentDuration(track);
  player.currentTime = Math.round(Math.max(0, Math.min(duration, pct * duration)));
  updateAllTimelines();
}

audioEl.addEventListener("play", () => {
  player.playing = true;
  updatePlayIcon();
});

audioEl.addEventListener("playing", recordActiveTrackPlay);

audioEl.addEventListener("playing", () => {
  playbackSessionTracker.resume();
  clearPlaybackBuffering();
  startListeningClock();
  player.playing = true;
  updatePlayIcon();
  window.setTimeout(prepareNextQueuedTrack, 450);
});

audioEl.addEventListener("waiting", () => {
  playbackSessionTracker.pause();
  pauseListeningClock();
  if (player.playing && activeAudioTrackId) beginPlaybackBuffering(playbackToken);
});

audioEl.addEventListener("stalled", () => {
  playbackSessionTracker.pause();
  pauseListeningClock();
  if (player.playing && activeAudioTrackId) beginPlaybackBuffering(playbackToken);
});

audioEl.addEventListener("seeking", () => {
  playbackSessionTracker.pause();
  pauseListeningClock();
});

audioEl.addEventListener("seeked", () => {
  clearPlaybackBuffering();
  playbackSessionTracker.resume();
  if (player.playing && !audioEl.paused) startListeningClock();
  updatePlayIcon();
});

audioEl.addEventListener("pause", () => {
  playbackSessionTracker.pause();
  pauseListeningClock();
  if (audioEl.ended) return;
  clearPlaybackBuffering();
  player.playing = false;
  updatePlayIcon();
});

audioEl.addEventListener("timeupdate", () => {
  if (activeAudioTrackId !== player.currentTrackId) return;
  player.currentTime = Math.floor(currentStreamOffset + (audioEl.currentTime || 0));
  const track = getTrack(player.currentTrackId);
  if (track && getPlayerSettings().crossfade && player.playing && !player.repeat) {
    const duration = getCurrentDuration(track);
    if (duration > 10 && duration - player.currentTime <= 4 && crossfadeArmedFor !== track.id) {
      crossfadeArmedFor = track.id;
      fadePlaybackGain(0, 850);
      window.setTimeout(() => {
        if (crossfadeArmedFor === track.id && player.playing) playNext(true);
      }, 760);
    }
  }
  updateAllTimelines();
});

audioEl.addEventListener("loadedmetadata", () => {
  const track = getTrack(player.currentTrackId);
  if (!track) return;
  const duration = getCurrentDuration(track);
  playbackSessionTracker.setTrackDuration(duration);
  totalTimeEl.textContent = formatTime(duration);
  focusTotalTime.textContent = formatTime(duration);
  updateAllTimelines();
});

audioEl.addEventListener("durationchange", () => {
  const track = getTrack(player.currentTrackId);
  if (!track) return;
  const duration = getCurrentDuration(track);
  playbackSessionTracker.setTrackDuration(duration);
  totalTimeEl.textContent = formatTime(duration);
  focusTotalTime.textContent = formatTime(duration);
  updateAllTimelines();
});

audioEl.addEventListener("ended", () => {
  pauseListeningClock();
  clearPlaybackBuffering();
  const track = getTrack(player.currentTrackId);
  if (player.repeat && track) {
    finalizePlaybackSession("repeat");
    audioEl.currentTime = 0;
    startAudio(track, true);
    return;
  }
  finalizePlaybackSession("ended");
  if (getPlayerSettings().autoplay && player.queue.length > 0) {
    playNext(true);
    return;
  }
  player.playing = false;
  updatePlayIcon();
});

audioEl.addEventListener("error", () => {
  finalizePlaybackSession("error");
  pauseListeningClock();
  clearPlaybackBuffering();
  if (!player.playing) return;
  player.playing = false;
  updatePlayIcon();
  showTrackNotice("Не удалось загрузить аудиопоток");
});

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

// Шапка
document.getElementById("hdrEqualizer")?.addEventListener("click", showEqualizerModal);
["hdrHome","hdrExplore","hdrFav","hdrNotifications","hdrRadio","hdrProfile","hdrSettings"].forEach((id) => {
  document.getElementById(id)?.addEventListener("click", () => {
    const map: Record<string, string> = { hdrHome:"home", hdrExplore:"explore", hdrFav:"favorites", hdrNotifications:"notifications", hdrRadio:"radio", hdrProfile:"profile", hdrSettings:"settings" };
    if (id === "hdrFav") renderFavorites();
    switchPage(map[id]);
  });
});

const mobileNavigation: Record<string, string> = {
  mobileHome: "home",
  mobileExplore: "explore",
  mobileFavorites: "favorites",
  mobileProfile: "profile",
};
Object.entries(mobileNavigation).forEach(([id, page]) => {
  document.getElementById(id)?.addEventListener("click", () => switchPage(page));
});
document.getElementById("mobileSearch")?.addEventListener("click", () => {
  searchInput.focus();
  searchInput.select();
});
document.querySelectorAll<HTMLButtonElement>("[data-sidebar-page]").forEach((button) => {
  button.addEventListener("click", () => switchPage(button.dataset.sidebarPage || "home"));
});

// ----------------------------------------------------------------
function renderSidebarPlaylists() {
  const container = document.getElementById("sidebarPlaylistContainer");
  if (!container) return;
  container.innerHTML = playlists.map((pl) => `
    <div class="playlist-item flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/5 cursor-pointer transition-all duration-300 ease-out hover:bg-white/10 active:scale-[0.97]" data-playlist="${pl.id}" role="button" tabindex="0" aria-label="Открыть плейлист ${escapeHtml(pl.name)}" title="${escapeHtml(pl.name)}">
      <span class="pl-icon">${pl.icon}</span><span class="truncate">${escapeHtml(pl.name)}</span>
    </div>
  `).join("");

  container.querySelectorAll<HTMLElement>(".playlist-item").forEach((el) => {
    el.addEventListener("click", () => {
      const plId = el.getAttribute("data-playlist");
      if (plId) switchPage("playlist", plId);
    });
    el.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      el.click();
    });
    el.draggable = true;
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData("text/plain", el.getAttribute("data-playlist") || "");
      el.classList.add("opacity-40");
    });
    el.addEventListener("dragend", () => el.classList.remove("opacity-40"));
    el.addEventListener("dragover", (e) => e.preventDefault());
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      const fromId = e.dataTransfer?.getData("text/plain");
      const toId = el.getAttribute("data-playlist");
      if (!fromId || !toId || fromId === toId) return;
      const fromIdx = playlists.findIndex((p) => p.id === fromId);
      const toIdx = playlists.findIndex((p) => p.id === toId);
      if (fromIdx === -1 || toIdx === -1) return;
      const [moved] = playlists.splice(fromIdx, 1);
      playlists.splice(toIdx, 0, moved);
      playlistOrder = playlists.map((p) => p.id);
      savePlaylistOrder();
      renderSidebarPlaylists();
    });
  });
  updateSidebarActiveState();
}

function updateSidebarActiveState() {
  document.querySelectorAll<HTMLElement>(".playlist-item").forEach((el) => {
    el.classList.toggle("is-active", currentPage === "playlist" && el.getAttribute("data-playlist") === currentPlaylistId);
  });
  document.getElementById("likedTracks")?.classList.toggle("is-active", currentPage === "favorites");
  document.querySelectorAll<HTMLElement>("[data-sidebar-page]").forEach((button) => {
    const page = button.dataset.sidebarPage;
    button.classList.toggle("is-active", page === currentPage || (page === "radio" && currentPage === "station"));
  });
}

const createPlaylistBtn = document.getElementById("createPlaylistBtn") as HTMLButtonElement | null;
const createPlaylistForm = document.getElementById("createPlaylistForm") as HTMLFormElement | null;
const newPlaylistName = document.getElementById("newPlaylistName") as HTMLInputElement | null;
const cancelPlaylistBtn = document.getElementById("cancelPlaylistBtn") as HTMLButtonElement | null;
const playlistFormError = document.getElementById("playlistFormError") as HTMLElement | null;

function setPlaylistFormError(message = "") {
  if (!playlistFormError) return;
  playlistFormError.textContent = message;
  playlistFormError.classList.toggle("hidden", !message);
}

createPlaylistBtn?.addEventListener("click", () => {
  createPlaylistForm?.classList.toggle("hidden");
  createPlaylistBtn?.setAttribute("aria-expanded", String(!createPlaylistForm?.classList.contains("hidden")));
  setPlaylistFormError();
  if (!createPlaylistForm?.classList.contains("hidden")) newPlaylistName?.focus();
});

cancelPlaylistBtn?.addEventListener("click", () => {
  createPlaylistForm?.classList.add("hidden");
  createPlaylistBtn?.setAttribute("aria-expanded", "false");
  if (newPlaylistName) newPlaylistName.value = "";
  setPlaylistFormError();
});

createPlaylistForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const cleanName = (newPlaylistName?.value || "").trim().replace(/\s+/g, " ");
  if (!cleanName) { setPlaylistFormError("Введите название плейлиста"); return; }
  if (playlists.some((pl) => pl.name.toLowerCase() === cleanName.toLowerCase())) {
    setPlaylistFormError("Плейлист с таким названием уже есть");
    return;
  }
  const playlist = createUserPlaylist(cleanName);
  if (!playlist) { setPlaylistFormError("Не удалось создать плейлист"); return; }
  if (newPlaylistName) newPlaylistName.value = "";
  createPlaylistForm?.classList.add("hidden");
  createPlaylistBtn?.setAttribute("aria-expanded", "false");
  setPlaylistFormError();
  renderSidebarPlaylists();
  switchPage("playlist", playlist.id);
});

// Сайдбар: Любимые треки
document.getElementById("likedTracks")?.addEventListener("click", () => {
  renderFavorites();
  switchPage("favorites");
});
document.getElementById("likedTracks")?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  (event.currentTarget as HTMLElement).click();
});

// Плеер
playBtn.addEventListener("click", playPause);
prevBtn.addEventListener("click", () => playPrev());
nextBtn.addEventListener("click", () => playNext());
likeBtn.addEventListener("click", toggleLike);

const addToPlaylistBtn = document.getElementById("addToPlaylistBtn");
addToPlaylistBtn?.addEventListener("click", (e) => {
  showPlaylistPopup(e.currentTarget as HTMLElement, player.currentTrackId);
});

repeatBtn.addEventListener("click", function () {
  player.repeat = !player.repeat;
  this.classList.toggle("text-indigo-400", player.repeat);
  this.classList.toggle("text-white/40", !player.repeat);
  this.setAttribute("aria-pressed", String(player.repeat));
  focusRepeatBtn.setAttribute("aria-pressed", String(player.repeat));
  announce(player.repeat ? "Повтор включён" : "Повтор выключен");
});

function toggleShuffle() {
  player.shuffle = !player.shuffle;
  focusShuffleBtn.setAttribute("aria-pressed", String(player.shuffle));
  announce(player.shuffle ? "Перемешивание включено" : "Перемешивание выключено");
}

volumeBtn.addEventListener("click", function () {
  if (!muted && currentVolume > 0) lastNonZeroVolume = currentVolume;
  muted = !muted;
  if (!muted && currentVolume === 0) currentVolume = lastNonZeroVolume || 0.75;
  applyVolume();
  updateVolumeUi();
});

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

function makeDraggable(
  container: HTMLElement,
  fill: HTMLElement,
  thumb: HTMLElement,
  onDrag: (pct: number) => void,
  onCommit?: (pct: number) => void,
) {
  let pendingPct: number | null = null;
  const update = (clientX: number) => {
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0) return;
    let pct = (clientX - rect.left) / rect.width;
    pct = Math.max(0, Math.min(1, pct));
    fill.style.width = `${pct * 100}%`;
    thumb.style.left = `${pct * 100}%`;
    pendingPct = pct;
    onDrag(pct);
  };
  container.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    container.focus();
    container.setPointerCapture(event.pointerId);
    update(event.clientX);
  });
  container.addEventListener("pointermove", (event) => {
    if (!container.hasPointerCapture(event.pointerId)) return;
    update(event.clientX);
  });
  container.addEventListener("pointerup", (event) => {
    if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
    if (pendingPct !== null) onCommit?.(pendingPct);
    pendingPct = null;
  });
  container.addEventListener("pointercancel", (event) => {
    if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
    pendingPct = null;
  });
  container.addEventListener("keydown", (event) => {
    const current = Math.max(0, Math.min(1, Number(container.getAttribute("aria-valuenow") || 0) / 100));
    let next = current;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next -= 0.02;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") next += 0.02;
    else if (event.key === "PageDown") next -= 0.1;
    else if (event.key === "PageUp") next += 0.1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 1;
    else return;
    event.preventDefault();
    next = Math.max(0, Math.min(1, next));
    fill.style.width = `${next * 100}%`;
    thumb.style.left = `${next * 100}%`;
    onDrag(next);
    onCommit?.(next);
  });
}

makeDraggable(timelineContainer, timelineFill, timelineThumb, (pct) => {
  previewActiveTrackPosition(pct);
}, (pct) => {
  const track = getTrack(player.currentTrackId);
  if (track) {
    seekActiveTrack(pct * getCurrentDuration(track));
  }
});

makeDraggable(volumeContainer, volFill, volThumb, (pct) => {
  currentVolume = pct;
  muted = pct === 0;
  if (pct > 0) lastNonZeroVolume = pct;
  applyVolume();
  updateVolumeUi();
});

// ----------------------------------------------------------------
function initScrollbar() {
  const wrapper = document.querySelector(".recent-track-list") as HTMLElement;
  const thumb = document.querySelector(".recent-scrollbar-thumb") as HTMLElement;
  const track = document.querySelector(".recent-scrollbar") as HTMLElement;
  if (!wrapper || !thumb || !track) return;

  function sync() {
    const max = wrapper.scrollWidth - wrapper.clientWidth;
    const pct = max > 0 ? wrapper.scrollLeft / max : 0;
    const tw = wrapper.scrollWidth > 0 ? Math.min(100, Math.max(10, (wrapper.clientWidth / wrapper.scrollWidth) * 100)) : 100;
    thumb.style.width = `${tw}%`;
    thumb.style.marginLeft = `${pct * (100 - tw)}%`;
  }
  wrapper.addEventListener("scroll", sync);
  const resizeObserver = new ResizeObserver(sync);
  resizeObserver.observe(wrapper);
  setTimeout(sync, 50);
  recentScrollbarCleanup = () => {
    wrapper.removeEventListener("scroll", sync);
    resizeObserver.disconnect();
  };

  let dragging = false;
  track.addEventListener("mousedown", (e) => {
    dragging = true;
    const rect = track.getBoundingClientRect();
    const tw = thumb.offsetWidth;
    const max = wrapper.scrollWidth - wrapper.clientWidth;
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left - tw / 2) / (rect.width - tw)));
    wrapper.scrollLeft = pct * max;
    const onMove = (ev: MouseEvent) => { if (!dragging) return; const r = track.getBoundingClientRect(); wrapper.scrollLeft = Math.max(0, Math.min(1, (ev.clientX - r.left - tw / 2) / (r.width - tw))) * max; };
    const onUp = () => { dragging = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

function submitSearch() {
  const val = sanitizeSearchQuery(searchInput.value);
  if (!normalizeSearchText(val)) {
    clearSearchBtn.classList.toggle("hidden", !searchInput.value.trim());
    announce("Введите название трека, артиста или альбома");
    searchInput.focus();
    return;
  }
  searchInput.value = val;
  clearSearchBtn.classList.remove("hidden");
  switchPage("search", val);
}

searchInput.addEventListener("input", () => {
  const hasText = Boolean(searchInput.value.trim());
  clearSearchBtn.classList.toggle("hidden", !hasText);
  if (!hasText && currentPage === "search") switchPage("home");
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) {
    e.preventDefault();
    e.stopPropagation();
    submitSearch();
  }
  if (e.key === "Escape") {
    searchInput.value = "";
    clearSearchBtn.classList.add("hidden");
    if (currentPage === "search") switchPage("home");
  }
});

searchSubmitBtn.addEventListener("click", submitSearch);

const clearSearch = () => {
  searchInput.value = "";
  clearSearchBtn.classList.add("hidden");
  if (currentPage === "search") switchPage("home");
  searchInput.focus();
};
clearSearchBtn.addEventListener("click", clearSearch);
searchInput.addEventListener("search", () => {
  if (!searchInput.value.trim()) clearSearch();
});

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
    return;
  }
  if (e.key === "Escape" && focusOverlay.classList.contains("active")) {
    e.preventDefault();
    closeFocusPlayer();
    return;
  }
  const target = e.target instanceof HTMLElement ? e.target : null;
  if (target?.closest("input, textarea, select, button, a, [contenteditable='true'], [role='slider'], [role='dialog'], [role='button']")) return;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (e.code === "Space") { e.preventDefault(); playPause(); }
  if (e.code === "ArrowRight") { e.preventDefault(); playNext(); }
  if (e.code === "ArrowLeft") { e.preventDefault(); playPrev(); }
});

// A drag over a copyable title must not also activate the containing track row
// when the pointer is released. A normal click still starts playback.
document.addEventListener("click", (event) => {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const selection = window.getSelection();
  if (!target?.closest(".track-title-selectable") || !selection || selection.isCollapsed) return;
  event.preventDefault();
  event.stopPropagation();
}, true);

let hoverPrepareTimer: number | null = null;
document.addEventListener("pointerover", (event) => {
  const row = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-id], [data-radio-track]") : null;
  if (row && event.relatedTarget instanceof Node && row.contains(event.relatedTarget)) return;
  const trackId = normalizeTrackId(row?.getAttribute("data-id") || row?.getAttribute("data-radio-track"));
  if (!trackId) return;
  if (hoverPrepareTimer !== null) window.clearTimeout(hoverPrepareTimer);
  hoverPrepareTimer = window.setTimeout(() => prepareTrackInBackground(trackId), 500);
});
document.addEventListener("pointerout", (event) => {
  if (!(event.target instanceof HTMLElement)) return;
  const row = event.target.closest<HTMLElement>("[data-id], [data-radio-track]");
  if (!row || (event.relatedTarget instanceof Node && row.contains(event.relatedTarget))) return;
  if (hoverPrepareTimer !== null) window.clearTimeout(hoverPrepareTimer);
  hoverPrepareTimer = null;
  const trackId = normalizeTrackId(row.getAttribute("data-id") || row.getAttribute("data-radio-track"));
  if (trackId && queuedPreparationTrackId === trackId) queuedPreparationTrackId = null;
});

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

hydrateAccountState(true);
resetPlayerForNewAccount();
updateVolumeUi();
window.addEventListener("auth:required", () => {
  currentAuthUser = null;
  showAuthScreen("Для продолжения войдите в аккаунт.");
});
if (getAuthToken()) {
  switchPage("home");
  bootstrapAuthenticatedApp();
} else {
  showAuthScreen();
}
