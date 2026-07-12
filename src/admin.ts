import { API_BASE_URL, adminHeaders, getAdminApiKey, setAdminSessionKey } from "./api/musicApi";

interface AdminTrack {
  id: number;
  title: string;
  artists?: Array<{ name: string }>;
}

interface TopTrack {
  track: AdminTrack;
  play_count: number;
}

interface AdminStats {
  host: string;
  uptime_seconds: number;
  cpu_percent: number;
  memory: { percent: number; used: number; total: number };
  top_tracks: TopTrack[];
  total_users: number;
  active_sessions_24h: number;
  total_plays: number;
  banned_users: number;
}

interface LogEvent {
  id: number;
  ts: string;
  kind: string;
  ip: string;
  path: string;
  message: string;
}

interface AdminUser {
  id: number;
  login: string;
  nickname: string;
  avatar_url?: string | null;
  subscription_status: string;
  created_at: string;
  is_banned?: boolean;
  metrics?: {
    history_count: number;
    favorites_count: number;
    playlists_count: number;
    playlist_tracks_count: number;
  };
}

interface UserDetail {
  user: AdminUser;
  history: Array<{ track: AdminTrack; played_at: string }>;
}

interface CatalogMetrics {
  tracks: number;
  artists: number;
  playable_tracks: number;
  needs_review: number;
  missing_covers: number;
  duration_seconds: number;
  sources: Array<{ name: string; tracks: number }>;
}

interface CommunityMetrics {
  users: number;
  new_users_7d: number;
  subscribed_users: number;
  favorites: number;
  playlists: number;
  playlist_tracks: number;
}

interface ActivityMetrics {
  window_seconds: number;
  total: number;
  streams: number;
  searches: number;
  admin_actions: number;
  alerts: number;
  recent_streams: LogEvent[];
  recent_alerts: LogEvent[];
}

interface AudioCacheMetrics {
  directory: string;
  files: number;
  building: number;
  bytes: number;
  max_bytes: number;
  usage_percent: number;
  disk_free_bytes: number;
  stale_files_24h: number;
  oldest_at: string | null;
  newest_at: string | null;
}

interface AdminOverview {
  catalog: CatalogMetrics;
  community: CommunityMetrics;
  activity: ActivityMetrics;
  audio_cache: AudioCacheMetrics;
}

const cpuValue = document.getElementById("cpuValue")!;
const ramValue = document.getElementById("ramValue")!;
const ramBytes = document.getElementById("ramBytes")!;
const cpuBar = document.getElementById("cpuBar")!;
const ramBar = document.getElementById("ramBar")!;
const cpuSpark = document.getElementById("cpuSpark")!;
const uptimeValue = document.getElementById("uptimeValue")!;
const hostName = document.getElementById("hostName")!;
const backendStatus = document.getElementById("backendStatus")!;
const usersValue = document.getElementById("usersValue")!;
const sessionsValue = document.getElementById("sessionsValue")!;
const playsValue = document.getElementById("playsValue")!;
const bannedValue = document.getElementById("bannedValue")!;
const statusDot = document.querySelector<HTMLElement>(".status-dot")!;
const logsList = document.getElementById("logsList")!;
const logCount = document.getElementById("logCount")!;
const topTracks = document.getElementById("topTracks")!;
const usersTable = document.getElementById("usersTable")!;
const userDetail = document.getElementById("userDetail")!;
const toast = document.getElementById("toast")!;
const adminAccessGate = document.getElementById("adminAccessGate")!;
const adminAccessForm = document.getElementById("adminAccessForm") as HTMLFormElement;
const adminAccessKey = document.getElementById("adminAccessKey") as HTMLInputElement;
const adminAccessError = document.getElementById("adminAccessError")!;
const lastSync = document.getElementById("lastSync")!;
const refreshAllButton = document.getElementById("refreshAll") as HTMLButtonElement;
const catalogHealth = document.getElementById("catalogHealth")!;
const catalogTracks = document.getElementById("catalogTracks")!;
const catalogPlayable = document.getElementById("catalogPlayable")!;
const catalogArtists = document.getElementById("catalogArtists")!;
const catalogReview = document.getElementById("catalogReview")!;
const catalogCovers = document.getElementById("catalogCovers")!;
const catalogHours = document.getElementById("catalogHours")!;
const sourceMix = document.getElementById("sourceMix")!;
const communityMetrics = document.getElementById("communityMetrics")!;
const cacheState = document.getElementById("cacheState")!;
const cacheRing = document.getElementById("cacheRing")!;
const cachePercent = document.getElementById("cachePercent")!;
const cacheBytes = document.getElementById("cacheBytes")!;
const cacheFiles = document.getElementById("cacheFiles")!;
const cacheBuilding = document.getElementById("cacheBuilding")!;
const cacheDiskFree = document.getElementById("cacheDiskFree")!;
const cacheOldest = document.getElementById("cacheOldest")!;
const cacheStale = document.getElementById("cacheStale")!;
const cacheMaxAge = document.getElementById("cacheMaxAge") as HTMLSelectElement;
const pruneCacheButton = document.getElementById("pruneCache") as HTMLButtonElement;
const activityTotal = document.getElementById("activityTotal")!;
const activityStreams = document.getElementById("activityStreams")!;
const activitySearches = document.getElementById("activitySearches")!;
const activityAdmin = document.getElementById("activityAdmin")!;
const activityAlerts = document.getElementById("activityAlerts")!;
const recentStreams = document.getElementById("recentStreams")!;
const recentAlerts = document.getElementById("recentAlerts")!;
const cpuHistory: number[] = [];

let currentUsers: AdminUser[] = [];

document.querySelectorAll<HTMLButtonElement>(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    const target = button.dataset.target;
    if (target) {
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / (1024 ** unitIndex);
  return `${amount >= 10 || unitIndex < 2 ? Math.round(amount) : amount.toFixed(1)} ${units[unitIndex]}`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en", { notation: value >= 10_000 ? "compact" : "standard" }).format(value || 0);
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatUptime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function adminFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { headers: adminHeaders() });
  if (!response.ok) throw new Error(`Admin API failed: ${response.status}`);
  return response.json() as Promise<T>;
}

async function adminSend<T>(path: string, method: "POST" | "PATCH", body: unknown = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Admin API failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function setBackendStatus(ok: boolean): void {
  statusDot.classList.toggle("ok", ok);
  backendStatus.textContent = ok ? "Online" : "Offline";
}

function renderSparkline(): void {
  const values = cpuHistory.slice(-32);
  if (!values.length) return;
  const width = 220;
  const height = 48;
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? width : (index / (values.length - 1)) * width;
      const y = height - (Math.max(0, Math.min(100, value)) / 100) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  cpuSpark.innerHTML = `<polyline points="${points}"></polyline>`;
}

function renderStats(stats: AdminStats): void {
  setBackendStatus(true);
  hostName.textContent = stats.host || "hiplet";
  cpuValue.textContent = `${stats.cpu_percent.toFixed(1)}%`;
  ramValue.textContent = `${stats.memory.percent.toFixed(1)}%`;
  ramBytes.textContent = `${formatBytes(stats.memory.used)} / ${formatBytes(stats.memory.total)}`;
  uptimeValue.textContent = formatUptime(stats.uptime_seconds);
  usersValue.textContent = String(stats.total_users ?? 0);
  sessionsValue.textContent = String(stats.active_sessions_24h ?? 0);
  playsValue.textContent = String(stats.total_plays ?? 0);
  bannedValue.textContent = String(stats.banned_users ?? 0);
  cpuBar.style.width = `${Math.max(0, Math.min(100, stats.cpu_percent))}%`;
  ramBar.style.width = `${Math.max(0, Math.min(100, stats.memory.percent))}%`;
  cpuHistory.push(stats.cpu_percent);
  while (cpuHistory.length > 32) cpuHistory.shift();
  renderSparkline();
  renderTopTracks(stats.top_tracks || []);
  lastSync.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function renderActivityFeed(target: HTMLElement, events: LogEvent[], emptyMessage: string): void {
  target.innerHTML = events.length ? events.map((event) => `
    <div class="activity-row ${escapeHtml(event.kind)}">
      <span class="activity-dot"></span>
      <div>
        <strong>${escapeHtml(event.message)}</strong>
        <p>${escapeHtml(event.ts)} · ${escapeHtml(event.ip || "unknown")}</p>
      </div>
    </div>
  `).join("") : `<p class="empty-state">${escapeHtml(emptyMessage)}</p>`;
}

function renderOverview(payload: AdminOverview): void {
  const { catalog, community, activity, audio_cache: cache } = payload;
  const playablePercent = catalog.tracks > 0 ? (catalog.playable_tracks / catalog.tracks) * 100 : 0;
  catalogTracks.textContent = formatCount(catalog.tracks);
  catalogPlayable.textContent = `${playablePercent.toFixed(1)}%`;
  catalogArtists.textContent = formatCount(catalog.artists);
  catalogReview.textContent = formatCount(catalog.needs_review);
  catalogCovers.textContent = formatCount(catalog.missing_covers);
  catalogHours.textContent = `${Math.round((catalog.duration_seconds || 0) / 3600)}h`;
  const healthOk = catalog.tracks > 0 && playablePercent >= 90 && catalog.needs_review <= Math.max(5, catalog.tracks * 0.05);
  catalogHealth.textContent = healthOk ? "Healthy" : catalog.tracks > 0 ? "Attention" : "Empty";
  catalogHealth.classList.toggle("ok", healthOk);

  const largestSource = Math.max(1, ...catalog.sources.map((source) => source.tracks));
  sourceMix.innerHTML = catalog.sources.length ? catalog.sources.map((source) => `
    <div class="source-row">
      <span>${escapeHtml(source.name)}</span>
      <div><i style="width:${Math.max(4, (source.tracks / largestSource) * 100).toFixed(1)}%"></i></div>
      <strong>${formatCount(source.tracks)}</strong>
    </div>
  `).join("") : `<span class="muted">No source data</span>`;

  communityMetrics.innerHTML = [
    ["Total users", community.users],
    ["New / 7d", community.new_users_7d],
    ["Subscribed", community.subscribed_users],
    ["Favorites", community.favorites],
  ].map(([label, value]) => `<span><strong>${formatCount(Number(value))}</strong>${label}</span>`).join("");

  const cacheUsage = Math.max(0, Math.min(100, cache.usage_percent || 0));
  cacheRing.style.setProperty("--cache-progress", `${cacheUsage * 3.6}deg`);
  cachePercent.textContent = `${cacheUsage.toFixed(0)}%`;
  cacheBytes.textContent = `${formatBytes(cache.bytes)} / ${formatBytes(cache.max_bytes)}`;
  cacheFiles.textContent = formatCount(cache.files);
  cacheBuilding.textContent = formatCount(cache.building);
  cacheDiskFree.textContent = formatBytes(cache.disk_free_bytes);
  cacheOldest.textContent = formatDate(cache.oldest_at);
  cacheStale.textContent = formatCount(cache.stale_files_24h);
  cacheState.textContent = cache.building > 0 ? "Building" : cacheUsage >= 90 ? "Near limit" : "Ready";
  cacheState.classList.toggle("ok", cache.building === 0 && cacheUsage < 90);

  activityTotal.textContent = `${formatCount(activity.total)} events`;
  activityStreams.textContent = formatCount(activity.streams);
  activitySearches.textContent = formatCount(activity.searches);
  activityAdmin.textContent = formatCount(activity.admin_actions);
  activityAlerts.textContent = formatCount(activity.alerts);
  renderActivityFeed(recentStreams, activity.recent_streams || [], "No stream starts in this window.");
  renderActivityFeed(recentAlerts, activity.recent_alerts || [], "No alerts in this window.");
}

function renderTopTracks(items: TopTrack[]): void {
  const rows = items.slice(0, 10).map((item) => {
    const artist = item.track.artists?.map((entry) => entry.name).filter(Boolean).join(", ") || "Unknown Artist";
    return `
      <button class="track-row" type="button" data-track="${item.track.id}">
        <div>
          <div class="track-title">${escapeHtml(item.track.title || "Untitled")}</div>
          <div class="track-artist">${escapeHtml(artist)}</div>
        </div>
        <div class="play-count">${item.play_count}</div>
      </button>
    `;
  });
  topTracks.innerHTML = rows.length ? rows.join("") : `<p class="muted">No plays yet.</p>`;
}

function renderLogs(events: LogEvent[]): void {
  logCount.textContent = `${events.length} events`;
  logsList.innerHTML = events.slice().reverse().map((event) => `
    <div class="log-row ${escapeHtml(event.kind)}">
      <div class="log-meta">${escapeHtml(event.ts)} | ${escapeHtml(event.ip)} | ${escapeHtml(event.path)}</div>
      <div>${escapeHtml(event.message)}</div>
    </div>
  `).join("");
}

function userSubtitle(user: AdminUser): string {
  const metrics = user.metrics;
  if (!metrics) return `@${user.login}`;
  return `@${user.login} | ${metrics.history_count} plays | ${metrics.playlists_count} playlists`;
}

function renderUsers(users: AdminUser[]): void {
  currentUsers = users;
  if (!users.length) {
    usersTable.innerHTML = `<p class="muted">No registered users yet. New users will appear here after registration.</p>`;
    userDetail.textContent = "Helpdesk is ready. There are no accounts after the last account cleanup.";
    return;
  }
  usersTable.innerHTML = users.map((user) => `
    <div class="user-row" data-user="${user.id}">
      <div>
        <div class="user-name">${escapeHtml(user.nickname || user.login)}</div>
        <div class="user-meta">ID ${user.id} | ${escapeHtml(userSubtitle(user))}</div>
      </div>
      <select class="status-select" data-action="subscription" data-user="${user.id}">
        ${["inactive", "premium", "trial", "support"].map((status) => `
          <option value="${status}" ${status === user.subscription_status ? "selected" : ""}>${status}</option>
        `).join("")}
      </select>
      <div class="user-actions">
        <button type="button" data-action="inspect" data-user="${user.id}">Inspect</button>
        <button type="button" data-action="password" data-user="${user.id}">Temp pass</button>
        <button type="button" data-action="${user.is_banned ? "unban" : "ban"}" data-user="${user.id}" class="${user.is_banned ? "" : "danger"}">${user.is_banned ? "Unban" : "Ban"}</button>
      </div>
    </div>
  `).join("");
}

function renderUserDetail(payload: UserDetail): void {
  const user = payload.user;
  const metrics = user.metrics;
  const history = payload.history || [];
  userDetail.innerHTML = `
    <div class="detail-head">
      <div>
        <h3>${escapeHtml(user.nickname || user.login)}</h3>
        <p>@${escapeHtml(user.login)} | ${escapeHtml(user.subscription_status || "inactive")}${user.is_banned ? " | banned" : ""}</p>
      </div>
      <button type="button" class="danger" data-action="clear" data-user="${user.id}">Clear user data</button>
    </div>
    <div class="detail-metrics">
      <span>${metrics?.history_count ?? 0} plays</span>
      <span>${metrics?.favorites_count ?? 0} liked</span>
      <span>${metrics?.playlists_count ?? 0} playlists</span>
    </div>
    <form class="detail-form" data-user="${user.id}">
      <label>Nickname<input name="nickname" value="${escapeHtml(user.nickname || "")}" maxlength="96" /></label>
      <label>Avatar URL<input name="avatar_url" value="${escapeHtml(user.avatar_url || "")}" /></label>
      <button type="submit">Save profile</button>
    </form>
    <div class="detail-history">
      <strong>Recent listens</strong>
      ${history.length ? history.map((item) => `<p>${escapeHtml(item.track.title)} <span>${escapeHtml(item.played_at)}</span></p>`).join("") : `<p class="muted">No listening history.</p>`}
    </div>
  `;

  userDetail.querySelector<HTMLFormElement>(".detail-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement | null;
    if (!form) return;
    const userId = Number(form.dataset.user || 0);
    const data = new FormData(form);
    try {
      await adminSend(`/api/admin/users/${userId}`, "PATCH", {
        nickname: String(data.get("nickname") || ""),
        avatar_url: String(data.get("avatar_url") || ""),
      });
      showToast("Profile saved");
      await refreshUsers();
      await inspectUser(userId);
    } catch {
      showToast("Could not save profile");
    }
  });

  userDetail.querySelector<HTMLButtonElement>('[data-action="clear"]')?.addEventListener("click", async (event) => {
    const userId = Number((event.currentTarget as HTMLButtonElement).dataset.user || 0);
    if (!userId) return;
    try {
      await adminSend(`/api/admin/users/${userId}/clear-data`, "POST");
      showToast("User data cleared");
      await refreshUsers();
      await inspectUser(userId);
    } catch {
      showToast("Could not clear user data");
    }
  });
}

async function inspectUser(userId: number): Promise<void> {
  try {
    renderUserDetail(await adminFetch<UserDetail>(`/api/admin/users/${userId}`));
  } catch {
    userDetail.textContent = "Could not load user details.";
  }
}

function bindUserActions(): void {
  usersTable.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const userId = Number(button.dataset.user || 0);
      const action = button.dataset.action || "";
      if (!userId) return;
      button.disabled = true;
      try {
        if (action === "inspect") await inspectUser(userId);
        if (action === "password") {
          const payload = await adminSend<{ temporary_password: string }>(`/api/admin/users/${userId}/reset-password`, "POST");
          await navigator.clipboard?.writeText(payload.temporary_password).catch(() => undefined);
          showToast(`Temporary password: ${payload.temporary_password}`);
        }
        if (action === "ban") {
          await adminSend(`/api/admin/users/${userId}/ban`, "POST", { reason: "manual admin ban" });
          showToast("User banned");
        }
        if (action === "unban") {
          await adminSend(`/api/admin/users/${userId}/unban`, "POST");
          showToast("User unbanned");
        }
        if (action !== "inspect") await refreshUsers();
      } catch {
        showToast("Admin action failed");
      } finally {
        button.disabled = false;
      }
    });
  });

  usersTable.querySelectorAll<HTMLSelectElement>(".status-select").forEach((select) => {
    select.addEventListener("change", async () => {
      const userId = Number(select.dataset.user || 0);
      const user = currentUsers.find((item) => item.id === userId);
      if (!userId || !user) return;
      try {
        await adminSend(`/api/admin/users/${userId}`, "PATCH", {
          nickname: user.nickname,
          avatar_url: user.avatar_url || "",
          subscription_status: select.value,
        });
        showToast("Subscription updated");
        await refreshUsers();
      } catch {
        showToast("Could not update subscription");
      }
    });
  });
}

function showToast(message = "Done"): void {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
}

async function refreshStats(): Promise<void> {
  try {
    renderStats(await adminFetch<AdminStats>("/api/admin/stats"));
  } catch {
    setBackendStatus(false);
  }
}

async function refreshLogs(): Promise<void> {
  try {
    const payload = await adminFetch<{ events: LogEvent[] }>("/api/admin/logs?limit=120");
    renderLogs(payload.events || []);
  } catch {
    setBackendStatus(false);
  }
}

async function refreshUsers(): Promise<void> {
  try {
    const payload = await adminFetch<{ users: AdminUser[] }>("/api/admin/users");
    renderUsers(payload.users || []);
    bindUserActions();
  } catch {
    usersTable.innerHTML = `<p class="muted">Could not load users.</p>`;
    setBackendStatus(false);
  }
}

async function refreshOverview(): Promise<void> {
  try {
    renderOverview(await adminFetch<AdminOverview>("/api/admin/overview"));
  } catch {
    setBackendStatus(false);
  }
}

async function refreshEverything(): Promise<void> {
  refreshAllButton.disabled = true;
  refreshAllButton.classList.add("is-loading");
  try {
    await Promise.all([refreshStats(), refreshLogs(), refreshUsers(), refreshOverview()]);
  } finally {
    refreshAllButton.disabled = false;
    refreshAllButton.classList.remove("is-loading");
  }
}

refreshAllButton.addEventListener("click", () => void refreshEverything());
pruneCacheButton.addEventListener("click", async () => {
  const maxAgeHours = Number(cacheMaxAge.value || 24);
  if (!window.confirm(`Remove completed audio files unused for more than ${maxAgeHours} hours?`)) return;
  pruneCacheButton.disabled = true;
  try {
    const payload = await adminSend<{ removed_files: number; freed_bytes: number; audio_cache: AudioCacheMetrics }>(
      "/api/admin/cache/audio/prune",
      "POST",
      { max_age_hours: maxAgeHours },
    );
    showToast(`Removed ${payload.removed_files} files · freed ${formatBytes(payload.freed_bytes)}`);
    await refreshOverview();
  } catch {
    showToast("Could not prune audio cache");
  } finally {
    pruneCacheButton.disabled = false;
  }
});

let adminPollingStarted = false;

function startAdminPolling(): void {
  if (adminPollingStarted) return;
  adminPollingStarted = true;
  void refreshEverything();
  window.setInterval(() => void refreshStats(), 2000);
  window.setInterval(() => void refreshLogs(), 1500);
  window.setInterval(() => void refreshUsers(), 7000);
  window.setInterval(() => void refreshOverview(), 8000);
}

adminAccessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const key = adminAccessKey.value.trim();
  if (!key) return;
  adminAccessError.textContent = "Checking access…";
  setAdminSessionKey(key);
  try {
    const overview = await adminFetch<AdminOverview>("/api/admin/overview");
    renderOverview(overview);
    adminAccessGate.hidden = true;
    adminAccessKey.value = "";
    adminAccessError.textContent = "";
    startAdminPolling();
  } catch {
    setAdminSessionKey("");
    adminAccessError.textContent = "Access denied. Check the admin key.";
    adminAccessKey.select();
  }
});

if (getAdminApiKey()) {
  adminAccessGate.hidden = true;
  startAdminPolling();
} else {
  adminAccessGate.hidden = false;
  window.setTimeout(() => adminAccessKey.focus(), 40);
}
