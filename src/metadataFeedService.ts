import { getHomeFeed as getBackendHomeFeed, mapBackendFeed } from "./api/musicApi";

export type MetadataSourceType = "metadata";
export type MetadataProviderState = "backend" | "provider" | "cache" | "fallback";

export interface ArtistSummary {
  id: number | string;
  name: string;
  avatar_url?: string | null;
  region?: string | null;
  is_canonical?: boolean;
  source_verified?: boolean;
  source_followers_count?: number;
  needs_review?: boolean;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  durationLabel: string;
  coverUrl: string | null;
  genre: string;
  tags: string[];
  sourceUrl?: string;
  isPlayable: boolean;
  audioSrc: string | null;
  sourceType: MetadataSourceType;
  providerState: MetadataProviderState;
  gradient: string;
  icon: string;
  liked: boolean;
  artists?: ArtistSummary[];
  artistId?: string;
  qualityScore?: number;
  popularityScore?: number;
  artistAuthorityScore?: number;
  needsReview?: boolean;
  region?: string;
  recommendationType?: string;
  recommendationReason?: string;
  algorithmVersion?: string;
  recommendationPosition?: number;
}

export interface MetadataFeedSection {
  id: string;
  title: string;
  subtitle?: string;
  recommendationType?: string;
  tracks: Track[];
}

export interface MetadataFeed {
  recent: Track[];
  random: Track[];
  trending: Track[];
  top: Track[];
  mood: Track[];
  ru: Track[];
  global: Track[];
  all: Track[];
  personalized?: Track[];
  selectedArtists?: Track[];
  similarArtists?: Track[];
  genreRecommendations?: Track[];
  popularForYou?: Track[];
  exploration?: Track[];
  sections?: MetadataFeedSection[];
  algorithmVersion?: string;
  personalizationActive?: boolean;
  source: MetadataProviderState;
  loadedAt: number;
  errorMessage?: string;
}

interface TrackSeed {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverUrl: string;
  genre: string;
  tags: string[];
  sourceUrl: string;
  gradient: string;
  icon: string;
}

export type FeedCacheScope = string | number | null;

export const HOME_FEED_CACHE_PREFIX = "mm_metadata_feed_cache_v6";
export const HOME_FEED_CACHE_TTL_MS = 5 * 60 * 1000;
const AUTH_USER_STORAGE_KEY = "mm_auth_user";

function inferredFeedCacheScope(): FeedCacheScope {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return null;
    const id = (JSON.parse(raw) as { id?: string | number } | null)?.id;
    return id === undefined || id === null ? null : id;
  } catch {
    return null;
  }
}

function normalizedFeedCacheScope(scope: FeedCacheScope | undefined): string {
  const resolved = scope === undefined ? inferredFeedCacheScope() : scope;
  const value = String(resolved ?? "guest").trim() || "guest";
  return value === "guest" ? "guest" : `user:${encodeURIComponent(value)}`;
}

export function getHomeFeedCacheKey(scope?: FeedCacheScope): string {
  return `${HOME_FEED_CACHE_PREFIX}:${normalizedFeedCacheScope(scope)}`;
}

export function invalidateHomeFeedCache(scope?: FeedCacheScope): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(getHomeFeedCacheKey(scope));
  } catch {
    /* cache invalidation is best effort */
  }
}

export const LEGACY_TRACK_ID_MAP: Record<string, string> = {
  "6": "forss-flickermood",
  "7": "skrillex-purple-lamborghini",
  "12": "marconi-union-weightless",
  "14": "rl-grime-core",
  "16": "the-weeknd-blinding-lights",
  "21": "post-malone-white-iverson",
  "22": "chillhop-idealism-snowfall",
  "23": "m83-midnight-city",
  "24": "nils-frahm-says",
  "25": "kamasi-washington-truth",
  "26": "kendrick-lamar-humble",
  "30": "flying-lotus-zodiac-shit",
};

const TRACK_SEEDS: TrackSeed[] = [
  {
    id: "mariah-carey-obsessed",
    title: "Obsessed",
    artist: "Mariah Carey",
    album: "Memoirs of an Imperfect Angel",
    duration: 242,
    coverUrl: "https://i1.sndcdn.com/artworks-gniFU7Cdi4s0-0-t500x500.jpg",
    genre: "pop",
    tags: ["pop", "rnb", "vocals"],
    sourceUrl: "https://soundcloud.com/mariahcarey/obsessed",
    gradient: "from-pink-500 to-rose-700",
    icon: "♪",
  },
  {
    id: "kendrick-lamar-humble",
    title: "HUMBLE.",
    artist: "Kendrick Lamar",
    album: "DAMN.",
    duration: 177,
    coverUrl: "https://i1.sndcdn.com/artworks-imydlR45niQp-0-t500x500.jpg",
    genre: "hiphop",
    tags: ["hiphop", "rap", "charts"],
    sourceUrl: "https://soundcloud.com/kendrick-lamar-music/humble",
    gradient: "from-red-700 to-zinc-950",
    icon: "♪",
  },
  {
    id: "the-weeknd-blinding-lights",
    title: "Blinding Lights",
    artist: "The Weeknd",
    album: "After Hours",
    duration: 200,
    coverUrl: "https://i1.sndcdn.com/artworks-Hn0nnX7zSwbE-0-t500x500.jpg",
    genre: "pop",
    tags: ["pop", "synthpop", "night"],
    sourceUrl: "https://soundcloud.com/theweeknd/blinding-lights",
    gradient: "from-red-500 to-purple-800",
    icon: "♪",
  },
  {
    id: "disclosure-latch",
    title: "Latch (feat. Sam Smith)",
    artist: "Disclosure",
    album: "Settle",
    duration: 256,
    coverUrl: "https://i1.sndcdn.com/artworks-ykAFwj9gDPMs-0-t500x500.jpg",
    genre: "electronic",
    tags: ["garage", "electronic", "vocals"],
    sourceUrl: "https://soundcloud.com/disclosuremusic/latch-1",
    gradient: "from-cyan-500 to-blue-800",
    icon: "♪",
  },
  {
    id: "flume-never-be-like-you",
    title: "Never Be Like You feat. Kai",
    artist: "Flume",
    album: "Skin",
    duration: 233,
    coverUrl: "https://i1.sndcdn.com/artworks-000143264206-mtz96c-t500x500.jpg",
    genre: "electronic",
    tags: ["future bass", "electronic", "vocals"],
    sourceUrl: "https://soundcloud.com/flume/never-be-like-you-feat-kai",
    gradient: "from-sky-400 to-indigo-700",
    icon: "♪",
  },
  {
    id: "skrillex-purple-lamborghini",
    title: "Skrillex & Rick Ross - Purple Lamborghini",
    artist: "Skrillex",
    album: "Suicide Squad: The Album",
    duration: 215,
    coverUrl: "https://i1.sndcdn.com/artworks-000172682845-o5voci-t500x500.jpg",
    genre: "electronic",
    tags: ["electronic", "trap", "soundtrack"],
    sourceUrl: "https://soundcloud.com/skrillex/skrillex-rick-ross-purple-lamborghini",
    gradient: "from-violet-500 to-fuchsia-800",
    icon: "♪",
  },
  {
    id: "chance-the-rapper-juice",
    title: "Juice",
    artist: "Chance The Rapper",
    album: "Acid Rap",
    duration: 215,
    coverUrl: "https://i1.sndcdn.com/artworks-000046904102-0iwr24-t500x500.jpg",
    genre: "hiphop",
    tags: ["hiphop", "rap", "independent"],
    sourceUrl: "https://soundcloud.com/chancetherapper/juice",
    gradient: "from-amber-400 to-orange-700",
    icon: "♪",
  },
  {
    id: "m83-midnight-city",
    title: "Midnight City",
    artist: "M83",
    album: "Hurry Up, We're Dreaming",
    duration: 244,
    coverUrl: "https://i1.sndcdn.com/artworks-000012560643-t526va-t500x500.jpg",
    genre: "electronic",
    tags: ["synthpop", "electronic", "night"],
    sourceUrl: "https://soundcloud.com/m83/midnight-city",
    gradient: "from-blue-500 to-indigo-900",
    icon: "♪",
  },
  {
    id: "billie-eilish-ocean-eyes",
    title: "Ocean Eyes",
    artist: "Billie Eilish",
    album: "dont smile at me",
    duration: 200,
    coverUrl: "https://i1.sndcdn.com/artworks-000194211850-6zfpyg-t500x500.jpg",
    genre: "pop",
    tags: ["pop", "alt pop", "dreamy"],
    sourceUrl: "https://soundcloud.com/billieeilish/ocean-eyes",
    gradient: "from-cyan-300 to-blue-700",
    icon: "♪",
  },
  {
    id: "post-malone-white-iverson",
    title: "White Iverson",
    artist: "Post Malone",
    album: "Stoney",
    duration: 256,
    coverUrl: "https://i1.sndcdn.com/artworks-QUbhd3LlkH2P-0-t500x500.jpg",
    genre: "hiphop",
    tags: ["hiphop", "melodic rap", "cloud rap"],
    sourceUrl: "https://soundcloud.com/postmalone/white-iverson",
    gradient: "from-yellow-400 to-amber-700",
    icon: "♪",
  },
  {
    id: "major-lazer-lean-on-remix",
    title: "Major Lazer & DJ Snake - Lean On (feat. MO)(Ephwurd X ETC!ETC! Remix)",
    artist: "Major Lazer",
    album: "Lean On Remixes",
    duration: 198,
    coverUrl: "https://i1.sndcdn.com/artworks-000122784736-cwxxfb-t500x500.jpg",
    genre: "electronic",
    tags: ["dance", "remix", "electronic"],
    sourceUrl: "https://soundcloud.com/majorlazer/lean-on-ephwurd-x-etc-etc",
    gradient: "from-emerald-400 to-teal-800",
    icon: "♪",
  },
  {
    id: "odesza-a-moment-apart",
    title: "A Moment Apart",
    artist: "ODESZA",
    album: "A Moment Apart",
    duration: 234,
    coverUrl: "https://i1.sndcdn.com/artworks-nU2mhziz3vmX-0-t500x500.jpg",
    genre: "electronic",
    tags: ["electronic", "cinematic", "instrumental"],
    sourceUrl: "https://soundcloud.com/odesza/a-moment-apart",
    gradient: "from-orange-500 to-indigo-900",
    icon: "♪",
  },
  {
    id: "bonobo-kerala",
    title: "Kerala",
    artist: "Bonobo",
    album: "Migration",
    duration: 242,
    coverUrl: "https://i1.sndcdn.com/artworks-ANAPs4hg9ZLh-0-t500x500.jpg",
    genre: "lofi",
    tags: ["downtempo", "beats", "focus"],
    sourceUrl: "https://soundcloud.com/bonobo/kerala",
    gradient: "from-stone-500 to-teal-800",
    icon: "♪",
  },
  {
    id: "tycho-awake",
    title: "Awake",
    artist: "Tycho",
    album: "Awake",
    duration: 283,
    coverUrl: "https://i1.sndcdn.com/artworks-VEsr8icpGzsm-0-t500x500.jpg",
    genre: "lofi",
    tags: ["ambient", "instrumental", "focus"],
    sourceUrl: "https://soundcloud.com/tycho/awake",
    gradient: "from-sky-500 to-cyan-900",
    icon: "♪",
  },
  {
    id: "rl-grime-core",
    title: "Core",
    artist: "RL Grime",
    album: "Void",
    duration: 265,
    coverUrl: "https://i1.sndcdn.com/artworks-000085264421-bvceqx-t500x500.jpg",
    genre: "electronic",
    tags: ["trap", "electronic", "energy"],
    sourceUrl: "https://soundcloud.com/rlgrime/core",
    gradient: "from-purple-600 to-slate-950",
    icon: "♪",
  },
  {
    id: "kaytranada-lite-spots",
    title: "LITE SPOTS",
    artist: "KAYTRANADA",
    album: "99.9%",
    duration: 239,
    coverUrl: "https://i1.sndcdn.com/artworks-Fv343Mb1ksKE-0-t500x500.jpg",
    genre: "electronic",
    tags: ["house", "funk", "dance"],
    sourceUrl: "https://soundcloud.com/kaytranada/lite-spots",
    gradient: "from-lime-400 to-green-800",
    icon: "♪",
  },
  {
    id: "porter-robinson-shelter",
    title: "Shelter",
    artist: "Porter Robinson",
    album: "Shelter",
    duration: 219,
    coverUrl: "https://i1.sndcdn.com/artworks-mBVYWJ7524KA-0-t500x500.jpg",
    genre: "electronic",
    tags: ["electronic", "melodic", "vocal"],
    sourceUrl: "https://soundcloud.com/porter-robinson/shelter",
    gradient: "from-rose-400 to-violet-800",
    icon: "♪",
  },
  {
    id: "lil-uzi-vert-xo-tour-llif3",
    title: "XO Tour Llif3",
    artist: "Lil Uzi Vert",
    album: "Luv Is Rage 2",
    duration: 183,
    coverUrl: "https://i1.sndcdn.com/artworks-nlz3duewVhnF-0-t500x500.jpg",
    genre: "hiphop",
    tags: ["hiphop", "trap", "emo rap"],
    sourceUrl: "https://soundcloud.com/liluzivert/xo-tour-llif3",
    gradient: "from-pink-500 to-zinc-900",
    icon: "♪",
  },
  {
    id: "childish-gambino-redbone",
    title: "Redbone",
    artist: "Childish Gambino",
    album: "Awaken, My Love!",
    duration: 326,
    coverUrl: "https://i1.sndcdn.com/artworks-ppjaSQW71nry-0-t500x500.jpg",
    genre: "pop",
    tags: ["soul", "funk", "vocals"],
    sourceUrl: "https://soundcloud.com/childish-gambino/redbone",
    gradient: "from-orange-500 to-red-900",
    icon: "♪",
  },
  {
    id: "baauer-harlem-shake",
    title: "Baauer - Harlem Shake",
    artist: "Baauer",
    album: "Harlem Shake",
    duration: 197,
    coverUrl: "https://i1.sndcdn.com/artworks-000063987097-ip8ig1-t500x500.jpg",
    genre: "electronic",
    tags: ["trap", "dance", "charts"],
    sourceUrl: "https://soundcloud.com/baauer/harlem-shake",
    gradient: "from-yellow-500 to-orange-900",
    icon: "♪",
  },
  {
    id: "odesza-sun-models",
    title: "Sun Models (feat. Madelyn Grant)",
    artist: "ODESZA",
    album: "In Return",
    duration: 160,
    coverUrl: "https://i1.sndcdn.com/artworks-YgT3YnnK08Wp-0-t500x500.jpg",
    genre: "electronic",
    tags: ["electronic", "summer", "vocal"],
    sourceUrl: "https://soundcloud.com/odesza/sun-models-feat-madelyn-grant",
    gradient: "from-amber-300 to-sky-700",
    icon: "♪",
  },
  {
    id: "odesza-line-of-sight",
    title: "Line Of Sight (feat. WYNNE & Mansionair)",
    artist: "ODESZA",
    album: "A Moment Apart",
    duration: 237,
    coverUrl: "https://i1.sndcdn.com/artworks-TfZFt5fZdHtv-0-t500x500.jpg",
    genre: "electronic",
    tags: ["electronic", "vocal", "cinematic"],
    sourceUrl: "https://soundcloud.com/odesza/line-of-sight-feat-wynne-mansionair",
    gradient: "from-indigo-400 to-blue-950",
    icon: "♪",
  },
  {
    id: "what-so-not-high-you-are",
    title: "What So Not & Branchez - High You Are",
    artist: "What So Not",
    album: "High You Are",
    duration: 265,
    coverUrl: "https://i1.sndcdn.com/artworks-WIsVWoiJY1Dt-0-t500x500.jpg",
    genre: "electronic",
    tags: ["future bass", "remix", "electronic"],
    sourceUrl: "https://soundcloud.com/whatsonot/high-you-are-branchez-remix",
    gradient: "from-fuchsia-500 to-slate-950",
    icon: "♪",
  },
  {
    id: "alunageorge-you-know-you-like-it",
    title: "You Know You Like It",
    artist: "AlunaGeorge",
    album: "Body Music",
    duration: 202,
    coverUrl: "https://i1.sndcdn.com/artworks-KD8Asd75TPDT-0-t500x500.jpg",
    genre: "pop",
    tags: ["pop", "electronic", "vocals"],
    sourceUrl: "https://soundcloud.com/alunageorge/you-know-you-like-it",
    gradient: "from-rose-500 to-blue-900",
    icon: "♪",
  },
  {
    id: "marconi-union-weightless",
    title: "Weightless",
    artist: "Marconi Union",
    album: "Weightless",
    duration: 486,
    coverUrl: "https://i1.sndcdn.com/artworks-CfXBpWaRhkzG-0-t500x500.jpg",
    genre: "lofi",
    tags: ["ambient", "focus", "calm"],
    sourceUrl: "https://soundcloud.com/marconiunion/weightless",
    gradient: "from-emerald-500 to-teal-900",
    icon: "♪",
  },
  {
    id: "nils-frahm-says",
    title: "Says",
    artist: "Nils Frahm",
    album: "Spaces",
    duration: 504,
    coverUrl: "https://i1.sndcdn.com/artworks-nYc2Z0SjrVYg-0-t500x500.jpg",
    genre: "classical",
    tags: ["modern classical", "piano", "ambient"],
    sourceUrl: "https://soundcloud.com/nils_frahm/says",
    gradient: "from-blue-500 to-slate-900",
    icon: "♪",
  },
  {
    id: "max-richter-nature-of-daylight",
    title: "Richter: On the Nature of Daylight (Entropy)",
    artist: "Max Richter",
    album: "The Blue Notebooks",
    duration: 384,
    coverUrl: "https://i1.sndcdn.com/artworks-ZYE7B5OJdv21-0-t500x500.jpg",
    genre: "classical",
    tags: ["modern classical", "strings", "cinematic"],
    sourceUrl: "https://soundcloud.com/max-richter/on-the-nature-of-daylight",
    gradient: "from-stone-400 to-blue-900",
    icon: "♪",
  },
  {
    id: "kamasi-washington-truth",
    title: "Truth",
    artist: "Kamasi Washington",
    album: "Harmony of Difference",
    duration: 815,
    coverUrl: "https://i1.sndcdn.com/artworks-CyMorfBvF1zj-0-t500x500.jpg",
    genre: "jazz",
    tags: ["jazz", "saxophone", "spiritual jazz"],
    sourceUrl: "https://soundcloud.com/kamasiwashington/truth",
    gradient: "from-amber-500 to-brown-900",
    icon: "♪",
  },
  {
    id: "flying-lotus-zodiac-shit",
    title: "Zodiac Shit",
    artist: "Flying Lotus",
    album: "Cosmogramma",
    duration: 164,
    coverUrl: "https://i1.sndcdn.com/artworks-5IbC83E3knYv-0-t500x500.jpg",
    genre: "jazz",
    tags: ["jazz", "beats", "experimental"],
    sourceUrl: "https://soundcloud.com/flyinglotus/zodiac-shit",
    gradient: "from-purple-500 to-orange-900",
    icon: "♪",
  },
  {
    id: "chillhop-idealism-snowfall",
    title: "idealism - snowfall",
    artist: "Chillhop Music",
    album: "Chillhop Essentials",
    duration: 156,
    coverUrl: "https://i1.sndcdn.com/artworks-000199151193-rayngq-t500x500.jpg",
    genre: "lofi",
    tags: ["lofi", "beats", "study"],
    sourceUrl: "https://soundcloud.com/chillhopdotcom/idealism-snowfall",
    gradient: "from-cyan-500 to-slate-900",
    icon: "♪",
  },
  {
    id: "lakey-inspired-better-days",
    title: "Better Days",
    artist: "LAKEY INSPIRED",
    album: "Better Days",
    duration: 206,
    coverUrl: "https://i1.sndcdn.com/artworks-000222487806-ucylzp-t500x500.jpg",
    genre: "lofi",
    tags: ["lofi", "chill", "beats"],
    sourceUrl: "https://soundcloud.com/lakeyinspired/better-days",
    gradient: "from-teal-500 to-emerald-900",
    icon: "♪",
  },
];

function formatDuration(sec: number): string {
  const minutes = Math.floor(sec / 60);
  const seconds = Math.floor(sec % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function toTrack(seed: TrackSeed, providerState: MetadataProviderState, patch?: Partial<Pick<Track, "title" | "artist" | "coverUrl">>): Track {
  return {
    ...seed,
    title: patch?.title || seed.title,
    artist: patch?.artist || seed.artist,
    coverUrl: patch?.coverUrl || seed.coverUrl,
    durationLabel: formatDuration(seed.duration),
    sourceType: "metadata",
    providerState,
    isPlayable: false,
    audioSrc: null,
    liked: false,
  };
}

function buildFeed(all: Track[], source: MetadataProviderState, loadedAt = Date.now()): MetadataFeed {
  const trending = [...all].filter((track) => track.tags.includes("charts") || track.tags.includes("dance") || track.genre === "pop").slice(0, 10);
  const top = [...all].sort((a, b) => b.duration - a.duration).slice(0, 10);
  const mood = all.filter((track) => ["lofi", "jazz", "classical"].includes(track.genre)).slice(0, 10);
  const ru = all.filter((track) => track.region === "ru" || track.tags.includes("ru")).slice(0, 12);
  const global = all.filter((track) => track.region === "global").slice(0, 12);
  return {
    recent: [],
    random: all.filter((_, index) => index % 2 === 0).concat(all.filter((_, index) => index % 2 === 1)).slice(0, 12),
    trending,
    top,
    mood,
    ru,
    global,
    all,
    source,
    loadedAt,
  };
}

function fallbackFeed(source: MetadataProviderState = "fallback"): MetadataFeed {
  return buildFeed(TRACK_SEEDS.map((seed) => toTrack(seed, source)), source);
}

function isTrustedCachedTrack(track: Track): boolean {
  return Boolean(track?.id && track?.title && track?.artist);
}

function normalizeCachedTrack(track: Track, source: MetadataProviderState): Track {
  return {
    ...track,
    id: String(track.id),
    providerState: source,
    liked: false,
    isPlayable: Boolean(track.isPlayable && (track.audioSrc || track.sourceUrl)),
    audioSrc: track.audioSrc || null,
  };
}

function readCachedFeed(allowStale: boolean, scope?: FeedCacheScope): MetadataFeed | null {
  try {
    const raw = localStorage.getItem(getHomeFeedCacheKey(scope));
    if (!raw) return null;
    const cached = JSON.parse(raw) as MetadataFeed;
    if (!cached?.all?.length || typeof cached.loadedAt !== "number") return null;
    if (!cached.all.every(isTrustedCachedTrack)) return null;
    if (!allowStale && Date.now() - cached.loadedAt > HOME_FEED_CACHE_TTL_MS) return null;
    const source: MetadataProviderState = "cache";
    const normalized = cached.all.map((track) => normalizeCachedTrack(track, source));
    const normalizedById = new Map(normalized.map((track) => [track.id, track]));
    const normalizeCollection = (items: Track[] | undefined, fallback: Track[]): Track[] => (
      items?.length
        ? items.map((track) => {
          const normalizedTrack = normalizeCachedTrack(track, source);
          const shared = normalizedById.get(normalizedTrack.id);
          if (!shared) return normalizedTrack;
          Object.assign(shared, {
            ...normalizedTrack,
            liked: shared.liked || normalizedTrack.liked,
            recommendationType: normalizedTrack.recommendationType || shared.recommendationType,
            recommendationReason: normalizedTrack.recommendationReason || shared.recommendationReason,
            algorithmVersion: normalizedTrack.algorithmVersion || shared.algorithmVersion,
            recommendationPosition: normalizedTrack.recommendationPosition ?? shared.recommendationPosition,
          });
          return shared;
        })
        : fallback
    );
    return {
      recent: normalizeCollection(cached.recent, []),
      random: normalizeCollection(cached.random, normalized.slice(0, 24)),
      trending: normalizeCollection(cached.trending, normalized.slice(0, 12)),
      top: normalizeCollection(cached.top, normalized.slice(0, 12)),
      mood: normalizeCollection(cached.mood, normalized.slice(0, 12)),
      ru: normalizeCollection(cached.ru, normalized.filter((track) => track.region === "ru").slice(0, 12)),
      global: normalizeCollection(cached.global, normalized.filter((track) => track.region === "global").slice(0, 12)),
      all: normalized,
      personalized: normalizeCollection(cached.personalized, []),
      selectedArtists: normalizeCollection(cached.selectedArtists, []),
      similarArtists: normalizeCollection(cached.similarArtists, []),
      genreRecommendations: normalizeCollection(cached.genreRecommendations, []),
      popularForYou: normalizeCollection(cached.popularForYou, []),
      exploration: normalizeCollection(cached.exploration, []),
      sections: (cached.sections || []).map((section) => ({
        ...section,
        tracks: normalizeCollection(section.tracks, []),
      })),
      algorithmVersion: cached.algorithmVersion,
      personalizationActive: cached.personalizationActive,
      source,
      loadedAt: cached.loadedAt,
      // Connectivity notices are transient and should never be restored from an old cache entry.
      errorMessage: undefined,
    };
  } catch {
    return null;
  }
}

function writeCachedFeed(feed: MetadataFeed, scope?: FeedCacheScope) {
  try {
    localStorage.setItem(getHomeFeedCacheKey(scope), JSON.stringify({ ...feed, source: "cache" }));
  } catch {
    /* cache is optional */
  }
}

export function getInitialMetadataFeed(scope?: FeedCacheScope): MetadataFeed {
  return readCachedFeed(false, scope) || fallbackFeed();
}

export async function loadHomeFeed(scope?: FeedCacheScope): Promise<MetadataFeed> {
  try {
    const feed = mapBackendFeed(await getBackendHomeFeed(), "backend");
    if (feed.all.length > 0) {
      writeCachedFeed(feed, scope);
      return feed;
    }
  } catch {
    const cached = readCachedFeed(true, scope);
    if (cached) {
      return {
        ...cached,
        errorMessage: "Не удалось обновить каталог. Показываем сохранённую музыку.",
      };
    }
    return {
      ...fallbackFeed(),
      errorMessage: "Не удалось обновить каталог. Показываем сохранённую музыку.",
    };
  }

  return {
    ...fallbackFeed(),
    errorMessage: "Не удалось обновить каталог. Показываем сохранённую музыку.",
  };
}
