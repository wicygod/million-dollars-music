import { LEGACY_TRACK_ID_MAP, getInitialMetadataFeed, loadHomeFeed, type MetadataFeed, type Track } from "./metadataFeedService";
import Hls from "hls.js";
import {
  API_BASE_URL,
  clearAuthToken,
  fetchCurrentUser,
  getArtist as fetchArtist,
  getArtistTracks,
  getAuthToken,
  getStoredAuthUser,
  getTrack as fetchTrack,
  loginAccount,
  mapBackendTrack,
  recordTrackPlay,
  registerAccount,
  searchCatalog,
  submitBugReport,
  type AuthUser,
  updateAvatar,
  updateNickname,
  withAppToken,
} from "./api/musicApi";

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

type TrackId = Track["id"];

let metadataFeed: MetadataFeed = getInitialMetadataFeed();
let tracks: Track[] = [...metadataFeed.all];
let currentAuthUser: AuthUser | null = getStoredAuthUser();

type PlayerSettings = {
  theme: boolean;
  scale: string;
  normalize: boolean;
  crossfade: boolean;
};

const DEFAULT_SETTINGS: PlayerSettings = { theme: true, scale: "100", normalize: false, crossfade: false };
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

const playlists: PlaylistDef[] = [
  { id: "focus", name: "Focus Flow", description: "Глубокий эмбиент и лоу-фай для продуктивной работы", gradient: "from-emerald-600 to-teal-900", icon: "🎧", genreFilter: ["lofi", "classical"] },
  { id: "late", name: "Late Nights", description: "Джаз, R&B и лоу-фай для ночных размышлений", gradient: "from-indigo-700 to-purple-900", icon: "🌙", genreFilter: ["jazz", "lofi"] },
  { id: "energy", name: "Energy Boost", description: "Мощный рок, электроника и хип-хоп для заряда", gradient: "from-red-600 to-orange-800", icon: "⚡", genreFilter: ["rock", "electronic", "hiphop"] },
  { id: "chill", name: "Chill Vibes", description: "Расслабляющие мелодии для отдыха", gradient: "from-cyan-600 to-blue-900", icon: "🧘", genreFilter: ["lofi", "jazz"] },
  { id: "indie", name: "Indie Mix", description: "Инди-поп и альтернатива", gradient: "from-pink-600 to-rose-900", icon: "🎵", genreFilter: ["pop"] },
  { id: "piano", name: "Piano", description: "Классические фортепианные произведения", gradient: "from-stone-600 to-zinc-900", icon: "🎹", genreFilter: ["classical"] },
];

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
  { id: "road", name: "В дорогу", gradient: "from-sky-500 to-indigo-700", desc: "Плейлисты для путешествий", mood: "adventure" },
  { id: "evening", name: "Вечерний лайф", gradient: "from-rose-500 to-fuchsia-700", desc: "R&B, соул, джаз", mood: "romantic" },
];

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

let player = {
  playing: false,
  buffering: false,
  currentTime: 0,
  currentTrackId: tracks[0]?.id ?? "",
  queue: [] as TrackId[],
  queueIndex: -1,
  interval: null as number | null,
  repeat: false,
  shuffle: false,
};
let keepPlayerEmptyUntilSelection = false;

const nowPlayingTitle = document.getElementById("nowPlayingTitle")!;
const nowPlayingArtist = document.getElementById("nowPlayingArtist")!;
const nowPlayingArt = document.getElementById("nowPlayingArt")!;
const playBtn = document.getElementById("playBtn")!;
const playIcon = document.getElementById("playIcon")!;
const prevBtn = document.getElementById("prevBtn")!;
const nextBtn = document.getElementById("nextBtn")!;
const likeBtn = document.getElementById("likeBtn")!;
const repeatBtn = document.getElementById("repeatBtn")!;
const shufflePlayBtn = document.getElementById("shufflePlayBtn")!;
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
let hlsPlayer: Hls | null = null;
let activeAudioTrackId: TrackId | null = null;
let playbackToken = 0;
let playbackWatchdog: number | null = null;
let currentStreamOffset = 0;

function getTrack(id: TrackId | null | undefined): Track | undefined {
  if (!id) return undefined;
  return tracks.find((t) => t.id === id);
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
  return Boolean(track && (track.audioSrc || track.sourceUrl));
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
  return ` style="--cover-url: url('${escapeHtml(getTrackCoverUrl(track))}')"`;
}

function renderCover(track: Track, className: string, iconClass = "", innerHtml = ""): string {
  const coverClass = "track-cover has-cover";
  return `<div class="${className} ${coverClass} bg-gradient-to-br ${track.gradient}"${coverStyle(track)}><span class="track-cover-icon ${iconClass}">${track.icon}</span>${innerHtml}</div>`;
}

function applyCoverToElement(el: HTMLElement, track: Track, className: string) {
  el.className = `${className} track-cover has-cover bg-gradient-to-br ${track.gradient}`;
  el.style.setProperty("--cover-url", `url("${getTrackCoverUrl(track)}")`);
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
  lastHistoryTrackId = null;
  lastHistoryRecordedAt = 0;

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
  }, 12000);
}

function getTrackPlaybackUrl(track: Track): string | null {
  if (track.audioSrc) return track.audioSrc;
  if (!track.sourceUrl) return null;
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

let lastHistoryTrackId: TrackId | null = null;
let lastHistoryRecordedAt = 0;

function pushRecentTrack(track: Track) {
  metadataFeed = {
    ...metadataFeed,
    recent: [track, ...metadataFeed.recent.filter((item) => item.id !== track.id)].slice(0, 36),
    all: metadataFeed.all.some((item) => item.id === track.id) ? metadataFeed.all : [track, ...metadataFeed.all],
  };
  if (currentPage === "home") switchPage("home", null, true);
}

function recordActiveTrackPlay() {
  const trackId = activeAudioTrackId;
  if (!trackId) return;
  const now = Date.now();
  if (lastHistoryTrackId === trackId && now - lastHistoryRecordedAt < 30_000) return;
  lastHistoryTrackId = trackId;
  lastHistoryRecordedAt = now;

  const localTrack = getTrack(trackId);
  if (localTrack) pushRecentTrack(localTrack);

  recordTrackPlay(trackId)
    .then((backendTrack) => {
      const [updatedTrack] = mergeTracks([mapBackendTrack(backendTrack)]);
      if (updatedTrack) pushRecentTrack(updatedTrack);
    })
    .catch(() => {
      lastHistoryTrackId = null;
    });
}

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

function loadTrackById(id: TrackId, autoplay = player.playing) {
  keepPlayerEmptyUntilSelection = false;
  stopAudio();
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
    el.classList.toggle("is-playing", el.getAttribute("data-id") === String(player.currentTrackId));
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
  const label = liked ? "Убрать текущий трек из избранного" : "Добавить текущий трек в избранное";
  likeBtn.setAttribute("aria-label", label);
  focusLikeBtn.setAttribute("aria-label", label);
}

function toggleLike() {
  const track = getTrack(player.currentTrackId);
  if (!track) return;
  track.liked = !track.liked;
  updateLikeButton();
  if (currentPage === "favorites") renderFavorites();
  saveLikedTracks();
}

function toggleTrackLike(trackId: TrackId) {
  const track = getTrack(trackId);
  if (!track) return;
  track.liked = !track.liked;
  if (trackId === player.currentTrackId) updateLikeButton();
  if (currentPage === "favorites") renderFavorites();
  saveLikedTracks();
}

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

let currentPage = "home";
let currentPageParam: string | null = null;
let currentPlaylistId: string | null = null;
let searchRequestToken = 0;

function switchPage(pageId: string, extraParam: string | null = null, preserveScroll = false) {
  const content = document.getElementById("appContent")!;
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
  window.requestAnimationFrame(() => content.setAttribute("aria-busy", "false"));
  const pageLabels: Record<string, string> = {
    home: "Главная", explore: "Обзор", favorites: "Избранное", notifications: "Уведомления",
    radio: "Радио и миксы", profile: "Профиль", settings: "Настройки", playlist: "Плейлист",
    genre: "Жанр", station: "Радиостанция", quick: "Подборка", artist: "Исполнитель",
    track: "Трек", search: "Результаты поиска",
  };
  if (!preserveScroll) announce(`Открыта страница: ${pageLabels[pageId] || "Главная"}`);
}

function applyMetadataFeed(feed: MetadataFeed) {
  const currentId = player.currentTrackId;
  const previousCurrentTrack = getTrack(currentId);
  const likedIds = new Set(tracks.filter((track) => track.liked).map((track) => track.id));
  popularVisibleCount = POPULAR_INITIAL_RENDER;
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

function refreshMetadataFeed(attempt = 1) {
  loadHomeFeed()
    .then((feed) => {
      const signature = (items: Track[]) => items.map((track) => `${track.id}:${track.title}:${track.artist}`).join("|");
      const currentSignature = [
        signature(tracks),
        signature(metadataFeed.recent),
        signature(metadataFeed.trending),
        signature(metadataFeed.ru),
        signature(metadataFeed.global),
      ].join("::");
      const nextSignature = [
        signature(feed.all),
        signature(feed.recent),
        signature(feed.trending),
        signature(feed.ru),
        signature(feed.global),
      ].join("::");
      if (feed.source !== metadataFeed.source || feed.errorMessage !== metadataFeed.errorMessage || currentSignature !== nextSignature) {
        applyMetadataFeed(feed);
      }
      if (feed.errorMessage && attempt < 8) {
        window.setTimeout(() => refreshMetadataFeed(attempt + 1), 1500 * attempt);
      }
    })
    .catch(() => {
      if (attempt < 8) window.setTimeout(() => refreshMetadataFeed(attempt + 1), 1500 * attempt);
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
          <input id="authLogin" autocomplete="username" minlength="3" maxlength="64" required />
        </label>
        <label id="authNicknameWrap" class="hidden">
          <span>Имя в приложении</span>
          <input id="authNickname" autocomplete="nickname" maxlength="96" />
        </label>
        <label>
          <span>Пароль</span>
          <input id="authPassword" type="password" autocomplete="current-password" minlength="6" required />
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
    try {
      const payload = mode === "register"
        ? await registerAccount(login, nickname || login, password)
        : await loginAccount(login, password);
      currentAuthUser = payload.user;
      if (mode === "register") resetPlayerForNewAccount();
      hideAuthScreen();
      bootstrapAuthenticatedApp();
    } catch {
      setAuthError(mode === "register" ? "Не удалось создать аккаунт. Проверьте введённые данные." : "Не удалось войти. Проверьте логин и пароль.");
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
  const overlay = ensureAuthOverlay();
  setAuthFormMode("login");
  overlay.classList.add("is-visible");
  document.body.classList.add("auth-locked");
  document.querySelectorAll<HTMLElement>("header, aside, footer, #appContent, .mobile-nav").forEach((element) => {
    element.inert = true;
    element.setAttribute("aria-hidden", "true");
  });
  setAuthError(message);
  window.setTimeout(() => overlay.querySelector<HTMLInputElement>("#authLogin")?.focus(), 50);
}

function hideAuthScreen() {
  document.getElementById("authOverlay")?.classList.remove("is-visible");
  document.body.classList.remove("auth-locked");
  document.querySelectorAll<HTMLElement>("header, aside, footer, #appContent, .mobile-nav").forEach((element) => {
    element.inert = false;
    element.removeAttribute("aria-hidden");
  });
}

function logoutAccount() {
  stopAudio();
  currentAuthUser = null;
  clearAuthToken();
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
    hideAuthScreen();
    switchPage(currentPage || "home", currentPageParam);
    refreshMetadataFeed();
  }
  fetchCurrentUser()
    .then((user) => {
      currentAuthUser = user;
      hideAuthScreen();
      if (!restoredFromCache) {
        switchPage(currentPage || "home", currentPageParam);
        refreshMetadataFeed();
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
        <p class="text-sm font-medium truncate">${escapeHtml(t.title)}</p>
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

function renderHomeTrackRail(title: string, items: Track[]): string {
  if (!items.length) return "";
  return `
    <section class="home-rail-section">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-base font-semibold tracking-wide">${title}</h2>
        <span class="text-xs text-white/35">${items.length}</span>
      </div>
      <div class="home-compact-rail">
        ${items.map((t) => `
          <div class="home-compact-card group cursor-pointer" data-id="${t.id}">
            ${renderCover(t, "w-12 h-12 rounded-lg shrink-0 flex items-center justify-center text-sm")}
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">${escapeHtml(t.title)}</p>
              <p class="text-xs text-white/40 truncate">${escapeHtml(t.artist)}</p>
            </div>
            <span class="text-xs text-white/30 tabular-nums">${t.durationLabel}</span>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderHome(container: HTMLElement) {
  const recent = metadataFeed.recent.slice(0, 32);
  const ru = metadataFeed.ru.slice(0, 12);
  const global = metadataFeed.global.slice(0, 12);
  const popular = metadataFeed.trending;
  popularVisibleCount = Math.max(POPULAR_INITIAL_RENDER, Math.min(popularVisibleCount, popular.length || POPULAR_INITIAL_RENDER));
  const visiblePopular = popular.slice(0, popularVisibleCount);
  const status = metadataFeed.errorMessage ? `<div class="backend-status mb-5">${escapeHtml(metadataFeed.errorMessage)}</div>` : "";
  const heroTrack = popular[0] || recent[0] || tracks[0];
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
                  <p class="text-sm font-medium truncate">${escapeHtml(t.title)}</p>
                  <p class="text-xs text-white/40 truncate">${escapeHtml(t.artist)}</p>
                </div>
                <button class="card-add-btn playlist-row-btn opacity-0 group-hover:opacity-100" data-track-id="${t.id}" type="button" title="Добавить в плейлист">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                </button>
              </div>
            </div>
          `).join("")}
        </div>
        <div class="recent-scrollbar mt-2"><div class="recent-scrollbar-thumb" style="width:20%"></div></div>
      </div>
    </section>
    <section class="mb-8">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-semibold tracking-wide">Популярные треки</h2>
        <span class="text-xs text-white/35">${visiblePopular.length} / ${popular.length}</span>
      </div>
      <div class="random-grid" aria-label="${popular.length} popular tracks">
        ${visiblePopular.map((t, index) => `
          <div class="random-card group cursor-pointer border border-white/10 active:scale-[0.98]" data-id="${t.id}" data-track-queue="popular">
            ${renderCover(t, "w-14 h-14 rounded-xl shrink-0 flex items-center justify-center text-2xl")}
            <span class="popular-rank${index < 3 ? " is-top" : ""}" aria-hidden="true">${index + 1}</span>
            <div class="min-w-0 flex-1"><p class="text-sm font-medium truncate">${escapeHtml(t.title)}</p><p class="text-xs text-white/40 truncate">${escapeHtml(t.artist)}</p></div>
            <button class="card-add-btn playlist-row-btn opacity-0 group-hover:opacity-100" data-track-id="${t.id}" type="button" title="Добавить в плейлист">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            </button>
            <span class="text-xs text-white/30 tabular-nums">${t.durationLabel}</span>
          </div>
        `).join("")}
        ${visiblePopular.length < popular.length ? `
          <button class="popular-load-more" type="button" data-popular-load-more>
            <span>Показать ещё</span>
            <small>${Math.min(POPULAR_RENDER_STEP, popular.length - visiblePopular.length)} треков</small>
          </button>
        ` : ""}
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
      if (id) activateTrack(el.dataset.trackQueue === "popular" ? popular : tracks, id);
    });
  });
  container.querySelectorAll<HTMLElement>(".card-add-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const trackId = getElementTrackId(btn, "data-track-id");
      if (trackId) showPlaylistPopup(btn, trackId);
    });
  });
  container.querySelectorAll<HTMLElement>(".card-play-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const trackId = getElementTrackId(btn, "data-track-id");
      if (trackId) playTrackInline(recent, trackId);
    });
  });

  container.querySelector(".seeAllHome")?.addEventListener("click", () => switchPage("explore"));
  container.querySelector("#homeHeroPlay")?.addEventListener("click", () => {
    if (heroTrack) activateTrack(popular.length ? popular : tracks, heroTrack.id);
  });
  container.querySelector("#homeHeroExplore")?.addEventListener("click", () => switchPage("explore"));
  setupPopularLoadMore(container, popular.length);

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
        <p class="section-kicker">Умные плейлисты дня</p>
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
              <p class="text-sm font-medium truncate">${escapeHtml(t.title)}</p>
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
                <p class="text-sm font-medium truncate">${escapeHtml(t.title)}</p>
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
  const sections: Record<string, { title: string; description: string; tracks: Track[]; playlists: PlaylistDef[] }> = {
    podcasts: {
      title: "Подкасты",
      description: "Разговорные выпуски пока представлены подборкой спокойных треков для фона.",
      tracks: (metadataFeed.mood.length ? metadataFeed.mood : tracks.filter((t) => ["lofi", "jazz"].includes(t.genre))).slice(0, 8),
      playlists: playlists.filter((p) => p.genreFilter.some((g) => ["lofi", "jazz"].includes(g))),
    },
    soundtracks: {
      title: "Саундтреки",
      description: "Кинематографичные и инструментальные треки из текущей библиотеки.",
      tracks: tracks.filter((t) => ["classical", "electronic"].includes(t.genre) || t.tags.includes("cinematic") || t.tags.includes("soundtrack")).slice(0, 8),
      playlists: playlists.filter((p) => p.genreFilter.some((g) => ["classical", "electronic"].includes(g))),
    },
    new: {
      title: "Новинки",
      description: "Свежая полка из последних добавленных треков.",
      tracks: (metadataFeed.recent.length ? metadataFeed.recent : tracks).slice(0, 10),
      playlists: playlists.filter((p) => p.userCreated).slice(-4),
    },
    charts: {
      title: "Чарты",
      description: "Самые заметные треки по длительности и энергии подборок.",
      tracks: (metadataFeed.top.length ? metadataFeed.top : [...tracks].sort((a, b) => b.duration - a.duration)).slice(0, 10),
      playlists: playlists.slice(0, 4),
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
    ${section.playlists.length > 0 ? `
      <h3 class="text-sm font-semibold tracking-wide mb-3">Плейлисты</h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        ${section.playlists.map((pl) => `
          <div class="quick-card rounded-xl bg-white/5 border border-white/10 p-4 cursor-pointer hover:bg-white/10 transition-all duration-300 active:scale-[0.98]" data-playlist-card="${pl.id}">
            <div class="quick-icon w-10 h-10 rounded-lg bg-gradient-to-br ${pl.gradient} flex items-center justify-center text-lg mb-2">${pl.icon}</div>
            <p class="text-sm font-medium truncate">${escapeHtml(pl.name)}</p>
            <p class="text-xs text-white/40 truncate">${getPlaylistTracks(pl).length} треков</p>
          </div>
        `).join("")}
      </div>
    ` : ""}
    <h3 class="text-sm font-semibold tracking-wide mb-3">Треки</h3>
    ${section.tracks.length === 0 ? `
      <div class="playlist-empty py-16 flex flex-col items-center justify-center text-center">
        <div class="text-4xl mb-3">♪</div>
        <h3 class="text-base font-semibold text-white/85 mb-1">Пока ничего нет</h3>
        <p class="text-sm text-white/40">В этом разделе ещё нет подходящих треков</p>
      </div>
    ` : `<div class="space-y-1">${section.tracks.map((t, i) => renderTrackRow(t, i, "quick-track")).join("")}</div>`}
  `;
  container.querySelectorAll<HTMLElement>("[data-playlist-card]").forEach((el) => {
    el.addEventListener("click", () => switchPage("playlist", el.getAttribute("data-playlist-card")));
  });
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
        <p class="text-sm font-medium truncate">${escapeHtml(t.title)}</p>
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
    { icon: "🎵", color: "bg-indigo-500/20", title: 'Добавлен новый плейлист <span class="text-white font-medium">Late Nights</span>', time: "2 часа назад" },
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
  container.innerHTML = `
    <h2 class="text-base font-semibold tracking-wide mb-4">Радио по настроению</h2>
    <div class="grid grid-cols-2 gap-3">
      ${radioStations.map((s) => `
        <div class="station-card rounded-xl bg-gradient-to-br ${s.gradient} p-5 h-32 flex flex-col justify-end cursor-pointer hover:scale-[1.02] transition-all duration-300 active:scale-[0.98] relative overflow-hidden group" data-station="${s.id}">
          <div class="absolute right-3 top-3 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
            <svg class="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <p class="text-white font-bold">${s.name}</p>
          <p class="text-xs text-white/60">${s.desc}</p>
        </div>
      `).join("")}
    </div>
  `;
  container.querySelectorAll<HTMLElement>(".station-card").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-station");
      if (id) switchPage("station", id);
    });
  });
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
      ${stationTracks.map((t, i) => `
        <div class="station-track group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-all duration-300 cursor-pointer active:scale-[0.99]" data-id="${t.id}">
          <span class="text-xs text-white/30 w-6 text-center">${i + 1}</span>
          ${renderCover(t, "w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-xs")}
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">${escapeHtml(t.title)}</p>
            <p class="text-xs text-white/40 truncate">${escapeHtml(t.artist)}</p>
          </div>
          <button class="list-add-btn playlist-row-btn opacity-0 group-hover:opacity-100" data-track-id="${t.id}" type="button" title="Добавить в плейлист">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          </button>
          <span class="text-xs text-white/30 tabular-nums">${t.durationLabel}</span>
        </div>
      `).join("")}
    </div>
  `;

  container.querySelectorAll<HTMLElement>(".station-track").forEach((el) => {
    el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const id = el.getAttribute("data-id");
      if (id) {
        activateTrack(stationTracks, id);
      }
    });
  });
  const stationPlayBtn = container.querySelector<HTMLButtonElement>("#stationPlayBtn");
  if (stationPlayBtn) {
    stationPlayBtn.disabled = stationTracks.length === 0;
    if (stationTracks.length === 0) stationPlayBtn.textContent = "Пока нет треков";
    stationPlayBtn.addEventListener("click", () => {
      const first = stationTracks[0];
      if (first) activateTrack(stationTracks, first.id);
    });
  }
  container.querySelectorAll<HTMLElement>(".list-add-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const trackId = getElementTrackId(btn, "data-track-id");
      if (trackId) showPlaylistPopup(btn, trackId);
    });
  });
}

// ----------------------------------------------------------------
// 👤  ПРОФИЛЬ
// ----------------------------------------------------------------

function renderProfile(container: HTMLElement) {
  const user = currentAuthUser || getStoredAuthUser();
  const likedCount = tracks.filter((t) => t.liked).length;
  const listenedTracks = metadataFeed.recent;
  const topArtists = [...new Set(listenedTracks.map((t) => t.artist))].slice(0, 4);
  const topTracks = listenedTracks.slice(0, 5);
  const hasRealStats = listenedTracks.length > 0;
  const avatarHtml = user?.avatar_url
    ? `<img class="profile-avatar-img" src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.nickname)}" />`
    : `<span>${escapeHtml(authInitials(user))}</span>`;

  container.innerHTML = `
    <div class="flex flex-col items-center py-6">
      <div class="profile-avatar w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-rose-500 flex items-center justify-center text-2xl mb-4 border-2 border-white/10 overflow-hidden">${avatarHtml}</div>
      <h2 class="text-lg font-semibold">${escapeHtml(user?.nickname || "Пользователь")}</h2>
      <p class="text-xs text-white/40 mt-0.5">@${escapeHtml(user?.login || "login")}</p>
    </div>
    <div class="grid grid-cols-3 gap-3 mb-6">
      <div class="profile-stat rounded-xl bg-white/[0.03] border border-white/5 p-4 text-center">
        <p class="text-xl font-bold text-white">${listenedTracks.length}</p>
        <p class="text-xs text-white/40 mt-1">Прослушано</p>
      </div>
      <div class="profile-stat rounded-xl bg-white/[0.03] border border-white/5 p-4 text-center">
        <p class="text-xl font-bold text-white">${likedCount}</p>
        <p class="text-xs text-white/40 mt-1">В избранном</p>
      </div>
      <div class="profile-stat rounded-xl bg-white/[0.03] border border-white/5 p-4 text-center">
        <p class="text-xl font-bold text-white">${playlists.filter((playlist) => playlist.userCreated).length}</p>
        <p class="text-xs text-white/40 mt-1">Плейлисты</p>
      </div>
    </div>
    <div class="profile-account-panel mb-6">
      <form id="profileNicknameForm" class="profile-inline-form">
        <label>
          <span>Имя в приложении</span>
          <input id="profileNicknameInput" value="${escapeHtml(user?.nickname || "")}" maxlength="96" autocomplete="nickname" />
        </label>
        <button type="submit">Сохранить</button>
      </form>
      <label class="profile-upload-btn">
        <input id="profileAvatarInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
        <span>Изменить аватар</span>
      </label>
    </div>
    <h3 class="text-sm font-semibold tracking-wide mb-3">Любимые исполнители</h3>
    ${hasRealStats ? `
      <div class="artist-grid grid grid-cols-4 gap-3 mb-6">
        ${topArtists.map((a) => {
          const primary = listenedTracks.find((t) => t.artist === a);
          return `<div class="artist-card text-center cursor-pointer transition-all duration-300 active:scale-95" role="button" tabindex="0" aria-label="Открыть исполнителя ${escapeHtml(a)}">${primary ? renderCover(primary, "artist-avatar mx-auto flex items-center justify-center", "text-sm") : ""}<p class="text-xs font-medium truncate">${escapeHtml(a)}</p><p class="text-[11px] text-white/30 truncate">Исполнитель</p></div>`;
        }).join("")}
      </div>
    ` : `<div class="profile-empty-state mb-6">Здесь будет ваша статистика. Слушайте больше треков!</div>`}
    <h3 class="text-sm font-semibold tracking-wide mb-3">Топ треков за месяц</h3>
    ${hasRealStats ? `
      <div class="space-y-1">
        ${topTracks.map((t, i) => `
          <div class="profile-track flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-all duration-300 cursor-pointer active:scale-[0.99] group" data-id="${t.id}" role="button" tabindex="0" aria-label="Воспроизвести ${escapeHtml(t.title)} — ${escapeHtml(t.artist)}">
            <span class="text-xs text-white/30 w-6 text-center font-bold">${i + 1}</span>
            ${renderCover(t, "w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-sm")}
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">${escapeHtml(t.title)}</p>
              <p class="text-xs text-white/40 truncate">${escapeHtml(t.artist)}</p>
            </div>
            <button class="focus-btn text-white/20 hover:text-indigo-400 transition-all duration-300 opacity-0 group-hover:opacity-100 cursor-pointer" type="button" title="Добавить в избранное" aria-label="Добавить в избранное">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </button>
          </div>
        `).join("")}
      </div>
    ` : `<div class="profile-empty-state">Здесь будет ваша статистика. Слушайте больше треков!</div>`}
    <div class="profile-logout-wrap">
      <button id="profileLogoutBtn" type="button" class="profile-logout-btn">Выйти</button>
    </div>
  `;

  container.querySelector<HTMLFormElement>("#profileNicknameForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = container.querySelector<HTMLInputElement>("#profileNicknameInput");
    const nickname = (input?.value || "").trim();
    if (!nickname) return;
    try {
      currentAuthUser = await updateNickname(nickname);
      renderProfile(container);
      showTrackNotice("Профиль обновлён");
    } catch {
      showTrackNotice("Не удалось обновить профиль");
    }
  });

  container.querySelector<HTMLInputElement>("#profileAvatarInput")?.addEventListener("change", (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", async () => {
      try {
        currentAuthUser = await updateAvatar(String(reader.result || ""));
        renderProfile(container);
        showTrackNotice("Аватар обновлён");
      } catch {
        showTrackNotice("Не удалось обновить аватар");
      }
    });
    reader.readAsDataURL(file);
  });

  container.querySelector<HTMLButtonElement>("#profileLogoutBtn")?.addEventListener("click", logoutAccount);

  container.querySelectorAll<HTMLElement>(".artist-card").forEach((el, index) => {
    const artist = topArtists[index];
    if (!artist) return;
    el.setAttribute("data-artist", artist);
    el.addEventListener("click", () => switchPage("artist", artist));
    el.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      switchPage("artist", artist);
    });
  });

  container.querySelectorAll<HTMLElement>(".profile-track").forEach((el) => {
    const trackId = getElementTrackId(el);
    if (!trackId) return;
    const track = getTrack(trackId);
    if (!track) return;
    const focusBtn = el.querySelector(".focus-btn");
    if (focusBtn) {
      focusBtn.innerHTML = `<svg class="w-4 h-4" fill="${track.liked ? "currentColor" : "none"}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>`;
      focusBtn.className = `profile-like-btn playlist-row-btn ${track.liked ? "text-red-400 opacity-100" : "opacity-0 group-hover:opacity-100"}`;
      focusBtn.setAttribute("data-track-id", String(trackId));
      focusBtn.setAttribute("title", track.liked ? "Убрать из избранного" : "Добавить в избранное");
      focusBtn.setAttribute("aria-label", track.liked ? "Убрать из избранного" : "Добавить в избранное");
      focusBtn.setAttribute("aria-pressed", String(track.liked));
    }
    const addBtn = document.createElement("button");
    addBtn.className = "profile-add-btn playlist-row-btn opacity-0 group-hover:opacity-100";
    addBtn.setAttribute("data-track-id", String(trackId));
    addBtn.setAttribute("type", "button");
    addBtn.setAttribute("title", "Добавить в плейлист");
    addBtn.setAttribute("aria-label", "Добавить в плейлист");
    addBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>`;
    focusBtn?.after(addBtn);
  });

  container.querySelectorAll<HTMLElement>(".profile-track").forEach((el) => {
    el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const id = getElementTrackId(el);
      if (id) activateTrack(tracks, id);
    });
    el.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if ((event.target as HTMLElement).closest("button")) return;
      event.preventDefault();
      const id = getElementTrackId(el);
      if (id) activateTrack(tracks, id);
    });
  });
  container.querySelectorAll<HTMLElement>(".profile-like-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const trackId = getElementTrackId(btn, "data-track-id");
      if (trackId) toggleTrackLike(trackId);
      renderProfile(container);
    });
  });
  container.querySelectorAll<HTMLElement>(".profile-add-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const trackId = getElementTrackId(btn, "data-track-id");
      if (trackId) showPlaylistPopup(btn, trackId);
    });
  });
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
          <h2 class="track-detail-title">${escapeHtml(track.title)}</h2>
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
            <button class="detail-add-btn" type="button">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              <span>В плейлист</span>
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
    container.querySelector(".detail-add-btn")?.addEventListener("click", (e) => showPlaylistPopup(e.currentTarget as HTMLElement, track.id));
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
    container.innerHTML = `
      <div class="search-loading">
        <div class="track-skeleton"></div>
        <div>
          <h2 class="text-base font-semibold mb-1">Открываем артиста</h2>
          <p class="text-sm text-white/40">Загрузка каталога</p>
        </div>
      </div>
    `;
    Promise.all([fetchArtist(artistName), getArtistTracks(artistName)])
      .then(([artist, backendTracks]) => {
        const artistTracks = mergeTracks(backendTracks.map((track) => mapBackendTrack(track)));
        const primary = artistTracks[0];
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
        wireTrackRows(container, ".artist-track", artistTracks, () => renderArtistPage(container, artistName));
      })
      .catch(() => {
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
  document.querySelectorAll<HTMLElement>("header, aside, footer, #appContent, .mobile-nav").forEach((element) => {
    element.inert = value;
    if (value) element.setAttribute("aria-hidden", "true");
    else if (!document.body.classList.contains("auth-locked")) element.removeAttribute("aria-hidden");
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
focusShuffleBtn.addEventListener("click", () => shufflePlayBtn.click());
focusQueueBtn.addEventListener("click", () => {
  focusReturnTarget = nowPlayingFocus;
  closeFocusPlayer();
  window.setTimeout(showQueueSheet, 80);
});

makeDraggable(focusTimeline, focusTimelineFill, focusTimelineThumb, (pct) => {
  const track = getTrack(player.currentTrackId);
  if (!track) return;
  seekActiveTrack(pct * getCurrentDuration(track));
});

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

function renderSettings(container: HTMLElement) {
  const s = getPlayerSettings();
  container.innerHTML = `
    <h2 class="text-base font-semibold tracking-wide mb-4">Настройки</h2>
    <div class="rounded-xl bg-white/[0.03] border border-white/5 p-4 mb-3">
      <h3 class="text-sm font-medium mb-3">Внешний вид</h3>
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm text-white/70">Тёмная тема</span>
        <label class="relative inline-flex items-center cursor-pointer">
          <input id="themeToggle" type="checkbox" ${s.theme ? "checked" : ""} class="sr-only peer">
          <div class="w-9 h-5 bg-white/10 rounded-full peer peer-checked:bg-indigo-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all after:duration-300 peer-checked:after:translate-x-4"></div>
        </label>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-sm text-white/70">Масштаб интерфейса</span>
        <div class="flex items-center gap-2">
          <span class="text-xs text-white/30">80%</span>
          <input id="scaleSlider" type="range" min="80" max="120" value="${s.scale}" class="w-24 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500" />
          <span class="text-xs text-white/30">120%</span>
        </div>
      </div>
    </div>
    <div class="rounded-xl bg-white/[0.03] border border-white/5 p-4 mb-3">
      <h3 class="text-sm font-medium mb-3">Звук</h3>
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm text-white/70">Аудиоустройство</span>
        <select class="bg-white/5 border border-white/10 rounded-lg text-sm text-white/70 px-3 py-1.5 outline-none cursor-pointer">
          <option>Системное (по умолчанию)</option>
          <option>Динамики (Realtek)</option>
          <option>Наушники (USB Audio)</option>
        </select>
      </div>
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm text-white/70">Нормализация громкости</span>
        <label class="relative inline-flex items-center cursor-pointer">
          <input id="normalizeToggle" type="checkbox" ${s.normalize ? "checked" : ""} class="sr-only peer">
          <div class="w-9 h-5 bg-white/10 rounded-full peer peer-checked:bg-indigo-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all after:duration-300 peer-checked:after:translate-x-4"></div>
        </label>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-sm text-white/70">Плавный переход (Crossfade)</span>
        <label class="relative inline-flex items-center cursor-pointer">
          <input id="crossfadeToggle" type="checkbox" ${s.crossfade ? "checked" : ""} class="sr-only peer">
          <div class="w-9 h-5 bg-white/10 rounded-full peer peer-checked:bg-indigo-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all after:duration-300 peer-checked:after:translate-x-4"></div>
        </label>
      </div>
    </div>
    <div class="rounded-xl bg-white/[0.03] border border-white/5 p-4">
      <h3 class="text-sm font-medium mb-3">О приложении</h3>
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold shrink-0">♪</div>
        <div><p class="text-sm font-medium">Музыкальный плеер</p><p class="text-xs text-white/40">Версия 1.0.0</p></div>
      </div>
      <div class="flex items-center gap-2 text-xs text-green-400"><span class="w-2 h-2 rounded-full bg-green-400"></span>Приложение запущено локально</div>
    </div>
    <div class="rounded-xl bg-white/[0.03] border border-white/5 p-4 mt-3">
      <h3 class="text-sm font-medium mb-3">Обратная связь</h3>
      <button id="bugReportBtn" class="bug-report-entry" type="button">
        <span class="bug-report-entry-icon">!</span>
        <span>
          <span class="bug-report-entry-title">Сообщить о баге</span>
          <span class="bug-report-entry-subtitle">Отправить короткое описание проблемы</span>
        </span>
      </button>
    </div>
  `;

  document.getElementById("themeToggle")?.addEventListener("change", function () { saveSettings(); applySettingsEffects(); });
  document.getElementById("scaleSlider")?.addEventListener("input", function (this: HTMLInputElement) {
    saveSettings();
    applySettingsEffects();
  });
  document.getElementById("normalizeToggle")?.addEventListener("change", function () { saveSettings(); applySettingsEffects(); });
  document.getElementById("crossfadeToggle")?.addEventListener("change", function () { saveSettings(); applySettingsEffects(); });
  document.getElementById("bugReportBtn")?.addEventListener("click", showBugReportModal);
}

function getPlayerSettings(): PlayerSettings {
  return { ...DEFAULT_SETTINGS, ...(savedSettings || {}) };
}

function applySettingsEffects() {
  const settings = getPlayerSettings();
  const scale = Math.max(80, Math.min(120, parseFloat(settings.scale || "100")));
  document.documentElement.style.fontSize = `${(scale / 100) * 15}px`;
  document.documentElement.dataset.theme = settings.theme ? "dark" : "dim";
  document.body.classList.toggle("audio-normalized", settings.normalize);
  document.body.classList.toggle("crossfade-enabled", settings.crossfade);
  applyVolume();
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
            <p class="text-sm font-medium truncate">${escapeHtml(t.title)}</p>
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
      ${genreTracks.map((t, i) => `
        <div class="genre-track group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-all duration-300 cursor-pointer active:scale-[0.99]" data-id="${t.id}">
          <span class="text-xs text-white/30 w-6 text-center">${i + 1}</span>
          ${renderCover(t, "w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-sm")}
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">${escapeHtml(t.title)}</p>
            <p class="text-xs text-white/40 truncate">${escapeHtml(t.artist)} · ${escapeHtml(t.album)}</p>
          </div>
          <span class="text-xs text-white/30 tabular-nums">${t.durationLabel}</span>
        </div>
      `).join("")}
    </div>
  `;

  container.querySelectorAll<HTMLElement>(".genre-track").forEach((el) => {
    el.addEventListener("click", () => {
      const id = getElementTrackId(el);
      if (id) activateTrack(genreTracks, id);
    });
  });
  container.querySelector(".playGenreBtn")?.addEventListener("click", () => {
    if (genreTracks.length > 0) {
      activateTrack(genreTracks, genreTracks[0].id);
    }
  });
}

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

function renderSearchResults(container: HTMLElement, query: string) {
  const q = query.toLowerCase().trim();
  const searchToken = ++searchRequestToken;
  const searchTargetLimit = 150;
  const isCurrentSearch = () => currentPage === "search" && currentPageParam === query && searchToken === searchRequestToken;
  const localResults = () => tracks.filter((t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album.toLowerCase().includes(q) || t.genre.includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q)));
  const renderBackendResults = (items: Track[], message = "") => {
    if (!isCurrentSearch()) return;
    if (items.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16">
          <div class="text-5xl mb-4">🔍</div>
          <h2 class="text-lg font-semibold mb-2">Ничего не найдено</h2>
          <p class="text-sm text-white/40">По запросу «${escapeHtml(query)}» ничего не найдено.</p>
          ${message ? `<p class="backend-status mt-5">${escapeHtml(message)}</p>` : ""}
        </div>
      `;
      return;
    }
    container.innerHTML = `
      ${message ? `<div class="backend-status mb-4">${escapeHtml(message)}</div>` : ""}
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-semibold tracking-wide">Результаты поиска</h2>
        <span class="text-xs text-white/40">${items.length} треков</span>
      </div>
      <div class="space-y-1">
        ${items.map((t, i) => `
          <div class="search-track group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-all duration-300 cursor-pointer active:scale-[0.99]" data-id="${t.id}">
            <span class="text-xs text-white/30 w-6 text-center">${i + 1}</span>
            ${renderCover(t, "w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-sm")}
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">${highlightMatch(t.title, q)}</p>
              <p class="text-xs text-white/40 truncate">${highlightMatch(t.artist, q)}</p>
            </div>
            <button class="search-like-btn playlist-row-btn ${t.liked ? "text-red-400 opacity-100" : "opacity-0 group-hover:opacity-100"}" data-track-id="${t.id}" type="button" title="Лайк" aria-label="${t.liked ? "Убрать из избранного" : "Добавить в избранное"}: ${escapeHtml(t.title)}" aria-pressed="${String(t.liked)}">
              <svg class="w-4 h-4" fill="${t.liked ? "currentColor" : "none"}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
            </button>
            <button class="search-add-btn playlist-row-btn opacity-0 group-hover:opacity-100" data-track-id="${t.id}" type="button" title="Добавить в плейлист" aria-label="Добавить в плейлист: ${escapeHtml(t.title)}">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            </button>
            <span class="text-xs text-white/30 tabular-nums">${t.durationLabel}</span>
          </div>
        `).join("")}
      </div>
    `;
    container.querySelectorAll<HTMLElement>(".search-track").forEach((el) => {
      el.addEventListener("click", () => {
        const id = getElementTrackId(el);
        if (id) activateTrack(items, id);
      });
    });
    container.querySelectorAll<HTMLElement>(".search-like-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const trackId = getElementTrackId(btn, "data-track-id");
        if (trackId) toggleTrackLike(trackId);
        renderBackendResults(items, message);
      });
    });
    container.querySelectorAll<HTMLElement>(".search-add-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const trackId = getElementTrackId(btn, "data-track-id");
        if (trackId) showPlaylistPopup(btn, trackId);
      });
    });
    enhanceDynamicAccessibility(container);
    updateActiveTrackHighlight();
  };
  const mapSearchResults = (backendTracks: Awaited<ReturnType<typeof searchCatalog>>) =>
    mergeTracks(backendTracks.map((track) => mapBackendTrack(track)));
  const pollHydratedResults = (attempt: number, previousCount: number, stableCount = 0) => {
    if (attempt > 16 || previousCount >= searchTargetLimit || stableCount >= 5) return;
    window.setTimeout(() => {
      if (!isCurrentSearch()) return;
      searchCatalog(query, searchTargetLimit)
        .then((backendTracks) => {
          if (!isCurrentSearch()) return;
          const items = mapSearchResults(backendTracks);
          const nextCount = items.length;
          if (nextCount > previousCount) renderBackendResults(items);
          const nextStableCount = nextCount > previousCount ? 0 : stableCount + 1;
          if (nextCount < searchTargetLimit) {
            pollHydratedResults(attempt + 1, Math.max(previousCount, nextCount), nextStableCount);
          }
        })
        .catch(() => {});
    }, attempt < 5 ? 2000 : 4000);
  };

  container.innerHTML = `
    <div class="search-loading">
      <div class="track-skeleton"></div>
      <div>
        <h2 class="text-base font-semibold mb-1">Ищем в каталоге</h2>
        <p class="text-sm text-white/40">Запрос «${escapeHtml(query)}»</p>
      </div>
    </div>
  `;
  const showSavedSearchResults = () => {
    if (!isCurrentSearch()) return;
    renderBackendResults(localResults(), "Каталог временно недоступен. Показаны сохранённые результаты.");
  };
  const searchFallbackTimer = window.setTimeout(showSavedSearchResults, 8000);
  searchCatalog(query, searchTargetLimit)
    .then((backendTracks) => {
      window.clearTimeout(searchFallbackTimer);
      if (!isCurrentSearch()) return;
      const items = mapSearchResults(backendTracks);
      renderBackendResults(items);
      pollHydratedResults(1, items.length);
    })
    .catch(() => {
      window.clearTimeout(searchFallbackTimer);
      showSavedSearchResults();
    });
  return;
  const results = tracks.filter((t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album.toLowerCase().includes(q) || t.genre.includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q)));

  if (results.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-16">
        <div class="text-5xl mb-4">🔍</div>
        <h2 class="text-lg font-semibold mb-2">Ничего не найдено</h2>
        <p class="text-sm text-white/40">По запросу «${query}» ничего не найдено. Попробуйте другой поиск.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-base font-semibold tracking-wide">Результаты поиска</h2>
      <span class="text-xs text-white/40">${results.length} треков</span>
    </div>
    <div class="space-y-1">
      ${results.map((t, i) => `
        <div class="search-track group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-all duration-300 cursor-pointer active:scale-[0.99]" data-id="${t.id}">
          <span class="text-xs text-white/30 w-6 text-center">${i + 1}</span>
          ${renderCover(t, "w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-sm")}
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">${highlightMatch(t.title, q)}</p>
            <p class="text-xs text-white/40 truncate">${highlightMatch(t.artist, q)}</p>
          </div>
          <button class="search-like-btn text-white/20 hover:text-red-400 transition-all duration-300 opacity-0 group-hover:opacity-100 cursor-pointer ml-1 shrink-0 ${t.liked ? "text-red-400 opacity-100" : ""}" data-track-id="${t.id}" title="Лайк">
            <svg class="w-4 h-4" fill="${t.liked ? "currentColor" : "none"}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
          </button>
          <button class="search-add-btn text-white/20 hover:text-indigo-400 transition-all duration-300 opacity-0 group-hover:opacity-100 cursor-pointer ml-1 shrink-0" data-track-id="${t.id}" title="Добавить в плейлист">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          </button>
          <span class="text-xs text-white/30 tabular-nums">${t.durationLabel}</span>
        </div>
      `).join("")}
    </div>
  `;

  container.querySelectorAll<HTMLElement>(".search-track").forEach((el) => {
    el.addEventListener("click", () => {
      const id = getElementTrackId(el);
      if (id) activateTrack(results, id);
    });
  });
  container.querySelectorAll<HTMLElement>(".search-like-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const trackId = getElementTrackId(btn, "data-track-id");
      if (trackId) toggleTrackLike(trackId);
      renderSearchResults(container, query);
    });
  });
  container.querySelectorAll<HTMLElement>(".search-add-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const trackId = getElementTrackId(btn, "data-track-id");
      if (trackId) showPlaylistPopup(btn, trackId);
    });
  });
}

function highlightMatch(text: string, query: string): string {
  if (!query) return escapeHtml(text);
  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, idx))}<span class="text-indigo-400">${escapeHtml(text.slice(idx, idx + query.length))}</span>${escapeHtml(text.slice(idx + query.length))}`;
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
            <span class="queue-item-copy"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></span>
            <span class="queue-item-time tabular-nums">${track.durationLabel}</span>
          </button>
        `).join("") : `<div class="playlist-empty"><strong>Очередь пуста</strong><span>Запустите трек из любой подборки</span></div>`}
      </div>
    </aside>
  `;
  document.body.appendChild(overlay);
  queueBtn.setAttribute("aria-expanded", "true");
  const sheet = overlay.querySelector<HTMLElement>(".queue-sheet")!;
  const closeButton = overlay.querySelector<HTMLButtonElement>(".queue-close")!;

  function closeQueue() {
    document.removeEventListener("keydown", onKeyDown, true);
    overlay.remove();
    queueBtn.setAttribute("aria-expanded", "false");
    previousFocus.focus();
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      closeQueue();
    }
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

let savedSettings: Record<string, any> | null = null;
let playlistTrackAssign: Record<string, TrackId[]> = {};
let playlistTrackRemoved: Record<string, TrackId[]> = {};
let playlistOrder: string[] = [];

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
  localStorage.setItem(STORAGE_KEY_LIKED, JSON.stringify(tracks.filter((t) => t.liked).map((t) => t.id)));
}

function loadLikedTracks() {
  try {
    const data = localStorage.getItem(STORAGE_KEY_LIKED);
    if (data) {
      const ids = new Set((JSON.parse(data) as unknown[]).map(normalizeTrackId).filter(Boolean) as TrackId[]);
      tracks.forEach((t) => { t.liked = ids.has(t.id); });
    }
  } catch { /* ignore */ }
}

function saveSettings() {
  const s: PlayerSettings = {
    theme: (document.getElementById("themeToggle") as HTMLInputElement)?.checked ?? true,
    scale: (document.getElementById("scaleSlider") as HTMLInputElement)?.value ?? "100",
    normalize: (document.getElementById("normalizeToggle") as HTMLInputElement)?.checked ?? false,
    crossfade: (document.getElementById("crossfadeToggle") as HTMLInputElement)?.checked ?? false,
  };
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(s));
  savedSettings = s;
}

function loadSettings() {
  try {
    const data = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (data) savedSettings = JSON.parse(data);
  } catch { /* ignore */ }
}

function savePlaylistTrackAssign() {
  localStorage.setItem(STORAGE_KEY_PLTRACKS, JSON.stringify(playlistTrackAssign));
}

function loadPlaylistTrackAssign() {
  try {
    const data = localStorage.getItem(STORAGE_KEY_PLTRACKS);
    if (data) playlistTrackAssign = normalizeStoredPlaylistTracks(JSON.parse(data));
  } catch { /* ignore */ }
}

function savePlaylistTrackRemoved() {
  localStorage.setItem(STORAGE_KEY_PLREMOVED, JSON.stringify(playlistTrackRemoved));
}

function loadPlaylistTrackRemoved() {
  try {
    const data = localStorage.getItem(STORAGE_KEY_PLREMOVED);
    if (data) playlistTrackRemoved = normalizeStoredPlaylistTracks(JSON.parse(data));
  } catch { /* ignore */ }
}

function savePlaylistOrder() {
  localStorage.setItem(STORAGE_KEY_PLORDER, JSON.stringify(playlistOrder));
}

function loadPlaylistOrder() {
  try {
    const data = localStorage.getItem(STORAGE_KEY_PLORDER);
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
  localStorage.setItem(STORAGE_KEY_USER_PLAYLISTS, JSON.stringify(userPlaylists));
}

function loadUserPlaylists() {
  try {
    const data = localStorage.getItem(STORAGE_KEY_USER_PLAYLISTS);
    if (!data) return;
    const userPlaylists: PlaylistDef[] = JSON.parse(data);
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
    item.addEventListener("click", () => {
      addTrackToPlaylist(trackId, pl.id);
      renderSidebarPlaylists();
      if (currentPage === "playlist") switchPage("playlist", currentPlaylistId);
      closePopup(false);
      onChange?.(pl.id);
    });
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

function playLoadedAudio(token: number) {
  if (token !== playbackToken) return;
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

function attachNativeAudio(sourceUrl: string, token: number, startSeconds = 0) {
  currentStreamOffset = Math.max(0, startSeconds);
  audioEl.src = withPlaybackStart(sourceUrl, currentStreamOffset);
  audioEl.load();
  playLoadedAudio(token);
}

function isHlsPlaybackUrl(sourceUrl: string) {
  return /\.m3u8(?:$|\?)/i.test(sourceUrl);
}

function startAudio(track: Track) {
  const sourceUrl = getTrackPlaybackUrl(track);
  if (!sourceUrl) return;

  if (activeAudioTrackId === track.id && (audioEl.src || hlsPlayer)) {
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
  window.setTimeout(() => {
    if (token === playbackToken && activeAudioTrackId === track.id && player.playing) recordActiveTrackPlay();
  }, 2000);

  if (Hls.isSupported() && isHlsPlaybackUrl(sourceUrl)) {
    hlsPlayer = new Hls();
    hlsPlayer.loadSource(sourceUrl);
    hlsPlayer.attachMedia(audioEl);
    hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => playLoadedAudio(token));
    hlsPlayer.on(Hls.Events.ERROR, (_event, data) => {
      if (token !== playbackToken || !data.fatal) return;
      hlsPlayer?.destroy();
      hlsPlayer = null;
      attachNativeAudio(sourceUrl, token, 0);
    });
    return;
  }

  attachNativeAudio(sourceUrl, token, 0);
}

function stopAudio() {
  playbackToken++;
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
  const sourceUrl = getTrackPlaybackUrl(track);
  if (!sourceUrl) return;

  if (hlsPlayer || isHlsPlaybackUrl(sourceUrl) || !sourceUrl.startsWith(API_BASE_URL)) {
    if (Number.isFinite(audioEl.duration)) audioEl.currentTime = target;
    return;
  }

  const shouldResume = player.playing;
  const token = ++playbackToken;
  currentStreamOffset = target;
  audioEl.pause();
  audioEl.src = withPlaybackStart(sourceUrl, target);
  audioEl.load();
  if (shouldResume) playLoadedAudio(token);
}

audioEl.addEventListener("play", () => {
  player.playing = true;
  updatePlayIcon();
  recordActiveTrackPlay();
});

audioEl.addEventListener("playing", recordActiveTrackPlay);

audioEl.addEventListener("playing", () => {
  clearPlaybackBuffering();
  player.playing = true;
  updatePlayIcon();
});

audioEl.addEventListener("waiting", () => {
  if (player.playing && activeAudioTrackId) beginPlaybackBuffering(playbackToken);
});

audioEl.addEventListener("stalled", () => {
  if (player.playing && activeAudioTrackId) beginPlaybackBuffering(playbackToken);
});

audioEl.addEventListener("pause", () => {
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
  totalTimeEl.textContent = formatTime(duration);
  focusTotalTime.textContent = formatTime(duration);
  updateAllTimelines();
});

audioEl.addEventListener("durationchange", () => {
  const track = getTrack(player.currentTrackId);
  if (!track) return;
  const duration = getCurrentDuration(track);
  totalTimeEl.textContent = formatTime(duration);
  focusTotalTime.textContent = formatTime(duration);
  updateAllTimelines();
});

audioEl.addEventListener("ended", () => {
  clearPlaybackBuffering();
  const track = getTrack(player.currentTrackId);
  if (player.repeat && track) {
    audioEl.currentTime = 0;
    startAudio(track);
    return;
  }
  if (player.queue.length > 0) {
    playNext(true);
    return;
  }
  player.playing = false;
  updatePlayIcon();
});

audioEl.addEventListener("error", () => {
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
}

const createPlaylistBtn = document.getElementById("createPlaylistBtn")!;
const createPlaylistForm = document.getElementById("createPlaylistForm")! as HTMLFormElement;
const newPlaylistName = document.getElementById("newPlaylistName")! as HTMLInputElement;
const cancelPlaylistBtn = document.getElementById("cancelPlaylistBtn")!;
const playlistFormError = document.getElementById("playlistFormError")!;

function setPlaylistFormError(message = "") {
  playlistFormError.textContent = message;
  playlistFormError.classList.toggle("hidden", !message);
}

createPlaylistBtn.addEventListener("click", () => {
  createPlaylistForm.classList.toggle("hidden");
  createPlaylistBtn.setAttribute("aria-expanded", String(!createPlaylistForm.classList.contains("hidden")));
  setPlaylistFormError();
  if (!createPlaylistForm.classList.contains("hidden")) newPlaylistName.focus();
});

cancelPlaylistBtn.addEventListener("click", () => {
  createPlaylistForm.classList.add("hidden");
  createPlaylistBtn.setAttribute("aria-expanded", "false");
  newPlaylistName.value = "";
  setPlaylistFormError();
});

createPlaylistForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const cleanName = newPlaylistName.value.trim().replace(/\s+/g, " ");
  if (!cleanName) { setPlaylistFormError("Введите название плейлиста"); return; }
  if (playlists.some((pl) => pl.name.toLowerCase() === cleanName.toLowerCase())) {
    setPlaylistFormError("Плейлист с таким названием уже есть");
    return;
  }
  const playlist = createUserPlaylist(cleanName);
  if (!playlist) { setPlaylistFormError("Не удалось создать плейлист"); return; }
  newPlaylistName.value = "";
  createPlaylistForm.classList.add("hidden");
  createPlaylistBtn.setAttribute("aria-expanded", "false");
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

const addToPlaylistBtn = document.getElementById("addToPlaylistBtn")!;
addToPlaylistBtn.addEventListener("click", (e) => {
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

shufflePlayBtn.addEventListener("click", function () {
  player.shuffle = !player.shuffle;
  this.classList.toggle("text-indigo-400", player.shuffle);
  this.classList.toggle("text-white/40", !player.shuffle);
  this.setAttribute("aria-pressed", String(player.shuffle));
  focusShuffleBtn.setAttribute("aria-pressed", String(player.shuffle));
  announce(player.shuffle ? "Перемешивание включено" : "Перемешивание выключено");
});

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

function makeDraggable(container: HTMLElement, fill: HTMLElement, thumb: HTMLElement, onDrag: (pct: number) => void) {
  const update = (clientX: number) => {
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0) return;
    let pct = (clientX - rect.left) / rect.width;
    pct = Math.max(0, Math.min(1, pct));
    fill.style.width = `${pct * 100}%`;
    thumb.style.left = `${pct * 100}%`;
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
  });
  container.addEventListener("pointercancel", (event) => {
    if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
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
  });
}

makeDraggable(timelineContainer, timelineFill, timelineThumb, (pct) => {
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
    const tw = Math.max(10, (wrapper.clientWidth / wrapper.scrollWidth) * 100);
    thumb.style.width = `${tw}%`;
    thumb.style.marginLeft = `${pct * (100 - tw)}%`;
  }
  wrapper.addEventListener("scroll", sync);
  window.addEventListener("resize", sync);
  setTimeout(sync, 50);

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
  const val = searchInput.value.trim();
  if (!val) return;
  searchInput.value = val;
  clearSearchBtn.classList.remove("hidden");
  switchPage("search", val);
}

searchInput.addEventListener("input", () => {
  const val = searchInput.value.trim();
  clearSearchBtn.classList.toggle("hidden", !val);
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    submitSearch();
  }
  if (e.key === "Escape") { searchInput.value = ""; clearSearchBtn.classList.add("hidden"); switchPage("home"); }
});

searchSubmitBtn.addEventListener("click", submitSearch);

clearSearchBtn.addEventListener("click", () => { searchInput.value = ""; clearSearchBtn.classList.add("hidden"); switchPage("home"); searchInput.focus(); });

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

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ----------------------------------------------------------------

loadLikedTracks();
loadSettings();
loadPlaylistTrackAssign();
loadPlaylistTrackRemoved();
loadUserPlaylists();
loadPlaylistOrder();

applySettingsEffects();

renderSidebarPlaylists();
setQueueFromTracks(tracks, tracks[0]?.id ?? "");
updateVolumeUi();
if (tracks[0]) loadTrackById(tracks[0].id, false);
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
