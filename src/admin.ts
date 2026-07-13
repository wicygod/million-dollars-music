import { API_BASE_URL, adminHeaders, getAdminApiKey, setAdminSessionKey } from "./api/musicApi";
import { disableNativeContextMenu } from "./contextMenu";

disableNativeContextMenu();

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
const cacheMaxAge = document.getElementById("cacheMaxAge")!;
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

type AdminSelectHandler = (value: string) => void | Promise<void>;

function closeAdminSelects(except?: HTMLElement): void {
  document.querySelectorAll<HTMLElement>(".admin-select.is-open").forEach((select) => {
    if (select === except) return;
    select.classList.remove("is-open");
    select.querySelector<HTMLButtonElement>(".admin-select-trigger")?.setAttribute("aria-expanded", "false");
  });
}

function bindAdminSelect(select: HTMLElement, onSelect?: AdminSelectHandler): void {
  if (select.dataset.bound === "true") return;
  select.dataset.bound = "true";
  const trigger = select.querySelector<HTMLButtonElement>(".admin-select-trigger");
  const label = trigger?.querySelector<HTMLElement>("span:first-child");
  if (!trigger || !label) return;

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const willOpen = !select.classList.contains("is-open");
    closeAdminSelects(select);
    select.classList.toggle("is-open", willOpen);
    trigger.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) select.querySelector<HTMLButtonElement>(".admin-select-menu .is-selected, .admin-select-menu [data-value]")?.focus();
  });

  const options = [...select.querySelectorAll<HTMLButtonElement>(".admin-select-menu [data-value]")];
  options.forEach((option) => {
    option.setAttribute("aria-selected", String(option.classList.contains("is-selected")));
    option.addEventListener("click", (event) => {
      event.stopPropagation();
      const value = option.dataset.value || "";
      select.dataset.value = value;
      label.textContent = option.textContent?.trim() || value;
      options.forEach((item) => {
        item.classList.remove("is-selected");
        item.setAttribute("aria-selected", "false");
      });
      option.classList.add("is-selected");
      option.setAttribute("aria-selected", "true");
      select.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
      if (onSelect) void onSelect(value);
    });
    option.addEventListener("keydown", (event) => {
      const index = options.indexOf(option);
      if (event.key === "Escape") {
        event.preventDefault();
        select.classList.remove("is-open");
        trigger.setAttribute("aria-expanded", "false");
        trigger.focus();
        return;
      }
      const nextIndex = event.key === "ArrowDown" ? Math.min(options.length - 1, index + 1)
        : event.key === "ArrowUp" ? Math.max(0, index - 1)
          : event.key === "Home" ? 0
            : event.key === "End" ? options.length - 1
              : -1;
      if (nextIndex >= 0) {
        event.preventDefault();
        options[nextIndex]?.focus();
      }
    });
  });
  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    closeAdminSelects(select);
    select.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    const target = event.key === "ArrowUp" ? options[options.length - 1] : options.find((option) => option.classList.contains("is-selected")) || options[0];
    target?.focus();
  });
}

document.addEventListener("click", () => closeAdminSelects());
bindAdminSelect(cacheMaxAge);

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / (1024 ** unitIndex);
  return `${amount >= 10 || unitIndex < 2 ? Math.round(amount) : amount.toFixed(1)} ${units[unitIndex]}`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("ru-RU", { notation: value >= 10_000 ? "compact" : "standard" }).format(value || 0);
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatUptime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes} мин`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function localizeLogMessage(message: string): string {
  const exact: Record<string, string> = {
    "Stream endpoint hit": "Вызван endpoint воспроизведения",
  };
  if (exact[message]) return exact[message];
  const rules: Array<[RegExp, string]> = [
    [/^Search request: /, "Поисковый запрос: "],
    [/^Track stream started: /, "Запущено воспроизведение трека: "],
    [/^Rate limit blocked /, "Лимит запросов заблокировал: "],
    [/^Admin pruned /, "Администратор очистил: "],
    [/^Admin banned /, "Администратор заблокировал "],
    [/^Admin unbanned /, "Администратор разблокировал "],
    [/^Admin updated /, "Администратор обновил "],
    [/^Admin generated temporary password for /, "Администратор создал временный пароль для "],
    [/^Admin cleared data for /, "Администратор очистил данные "],
  ];
  for (const [pattern, replacement] of rules) {
    if (pattern.test(message)) return message.replace(pattern, replacement);
  }
  return message;
}

async function adminFetch<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  const response = await fetch(`${API_BASE_URL}${path}`, { headers: adminHeaders(), signal: controller.signal })
    .finally(() => window.clearTimeout(timeout));
  if (response.status === 401 || response.status === 403) showAdminAccessGate();
  if (!response.ok) throw new Error(`Admin API failed: ${response.status}`);
  return response.json() as Promise<T>;
}

async function adminSend<T>(path: string, method: "POST" | "PATCH", body: unknown = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).finally(() => window.clearTimeout(timeout));
  if (response.status === 401 || response.status === 403) showAdminAccessGate();
  if (!response.ok) throw new Error(`Admin API failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function showAdminAccessGate(): void {
  setAdminSessionKey("");
  adminAccessGate.hidden = false;
  adminAccessError.textContent = "Сессия администратора завершена. Введите ключ снова.";
  window.setTimeout(() => adminAccessKey.focus(), 40);
}

function setBackendStatus(ok: boolean): void {
  statusDot.classList.toggle("ok", ok);
  backendStatus.textContent = ok ? "Онлайн" : "Нет связи";
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
  lastSync.textContent = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function renderActivityFeed(target: HTMLElement, events: LogEvent[], emptyMessage: string): void {
  target.innerHTML = events.length ? events.map((event) => `
    <div class="activity-row ${escapeHtml(event.kind)}">
      <span class="activity-dot"></span>
      <div>
        <strong>${escapeHtml(localizeLogMessage(event.message))}</strong>
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
  catalogHours.textContent = `${Math.round((catalog.duration_seconds || 0) / 3600)} ч`;
  const healthOk = catalog.tracks > 0 && playablePercent >= 90 && catalog.needs_review <= Math.max(5, catalog.tracks * 0.05);
  catalogHealth.textContent = healthOk ? "В норме" : catalog.tracks > 0 ? "Требует внимания" : "Пусто";
  catalogHealth.classList.toggle("ok", healthOk);

  const largestSource = Math.max(1, ...catalog.sources.map((source) => source.tracks));
  sourceMix.innerHTML = catalog.sources.length ? catalog.sources.map((source) => `
    <div class="source-row">
      <span>${escapeHtml(source.name)}</span>
      <div><i style="width:${Math.max(4, (source.tracks / largestSource) * 100).toFixed(1)}%"></i></div>
      <strong>${formatCount(source.tracks)}</strong>
    </div>
  `).join("") : `<span class="muted">Нет данных об источниках</span>`;

  communityMetrics.innerHTML = [
    ["Всего пользователей", community.users],
    ["Новых за 7 дней", community.new_users_7d],
    ["С подпиской", community.subscribed_users],
    ["В избранном", community.favorites],
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
  cacheState.textContent = cache.building > 0 ? "Создаётся" : cacheUsage >= 90 ? "Почти заполнен" : "Готов";
  cacheState.classList.toggle("ok", cache.building === 0 && cacheUsage < 90);

  activityTotal.textContent = `${formatCount(activity.total)} событий`;
  activityStreams.textContent = formatCount(activity.streams);
  activitySearches.textContent = formatCount(activity.searches);
  activityAdmin.textContent = formatCount(activity.admin_actions);
  activityAlerts.textContent = formatCount(activity.alerts);
  renderActivityFeed(recentStreams, activity.recent_streams || [], "За этот период запусков треков не было.");
  renderActivityFeed(recentAlerts, activity.recent_alerts || [], "За этот период предупреждений не было.");
}

function renderTopTracks(items: TopTrack[]): void {
  const rows = items.slice(0, 10).map((item) => {
    const artist = item.track.artists?.map((entry) => entry.name).filter(Boolean).join(", ") || "Неизвестный артист";
    return `
      <button class="track-row" type="button" data-track="${item.track.id}">
        <div>
          <div class="track-title">${escapeHtml(item.track.title || "Без названия")}</div>
          <div class="track-artist">${escapeHtml(artist)}</div>
        </div>
        <div class="play-count">${item.play_count}</div>
      </button>
    `;
  });
  topTracks.innerHTML = rows.length ? rows.join("") : `<p class="muted">Прослушиваний пока нет.</p>`;
}

function renderLogs(events: LogEvent[]): void {
  logCount.textContent = `${events.length} событий`;
  logsList.innerHTML = events.slice().reverse().map((event) => `
    <div class="log-row ${escapeHtml(event.kind)}">
      <div class="log-meta">${escapeHtml(event.ts)} | ${escapeHtml(event.ip)} | ${escapeHtml(event.path)}</div>
      <div>${escapeHtml(localizeLogMessage(event.message))}</div>
    </div>
  `).join("");
}

function userSubtitle(user: AdminUser): string {
  const metrics = user.metrics;
  if (!metrics) return `@${user.login}`;
  return `@${user.login} | ${metrics.history_count} прослушиваний | ${metrics.playlists_count} плейлистов`;
}

function subscriptionLabel(status: string): string {
  const labels: Record<string, string> = {
    inactive: "Без подписки",
    premium: "Премиум",
    trial: "Пробный период",
    support: "Поддержка",
  };
  return labels[status] || status;
}

function renderUsers(users: AdminUser[]): void {
  currentUsers = users;
  if (!users.length) {
    usersTable.innerHTML = `<p class="muted">Зарегистрированных пользователей пока нет. Новые аккаунты появятся здесь после регистрации.</p>`;
    userDetail.textContent = "Пользователей пока нет.";
    return;
  }
  usersTable.innerHTML = users.map((user) => `
    <div class="user-row" data-user="${user.id}">
      <div>
        <div class="user-name">${escapeHtml(user.nickname || user.login)}</div>
        <div class="user-meta">ID ${user.id} | ${escapeHtml(userSubtitle(user))}</div>
      </div>
      <div class="admin-select status-select" data-user="${user.id}" data-value="${escapeHtml(user.subscription_status)}">
        <button class="admin-select-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
          <span>${escapeHtml(subscriptionLabel(user.subscription_status))}</span><span class="admin-select-chevron">⌄</span>
        </button>
        <div class="admin-select-menu" role="listbox">
        ${["inactive", "premium", "trial", "support"].map((status) => `
          <button type="button" role="option" data-value="${status}" class="${status === user.subscription_status ? "is-selected" : ""}">${subscriptionLabel(status)}</button>
        `).join("")}
        </div>
      </div>
      <div class="user-actions">
        <button type="button" data-action="inspect" data-user="${user.id}">Открыть</button>
        <button type="button" data-action="password" data-user="${user.id}">Временный пароль</button>
        <button type="button" data-action="${user.is_banned ? "unban" : "ban"}" data-user="${user.id}" class="${user.is_banned ? "" : "danger"}">${user.is_banned ? "Разблокировать" : "Заблокировать"}</button>
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
        <p>@${escapeHtml(user.login)} | ${escapeHtml(subscriptionLabel(user.subscription_status || "inactive"))}${user.is_banned ? " | заблокирован" : ""}</p>
      </div>
      <button type="button" class="danger" data-action="clear" data-user="${user.id}">Очистить данные</button>
    </div>
    <div class="detail-metrics">
      <span>${metrics?.history_count ?? 0} прослушиваний</span>
      <span>${metrics?.favorites_count ?? 0} в избранном</span>
      <span>${metrics?.playlists_count ?? 0} плейлистов</span>
    </div>
    <form class="detail-form" data-user="${user.id}">
      <label>Отображаемое имя<input name="nickname" value="${escapeHtml(user.nickname || "")}" maxlength="96" /></label>
      <label>Ссылка на аватар<input name="avatar_url" value="${escapeHtml(user.avatar_url || "")}" /></label>
      <button type="submit">Сохранить профиль</button>
    </form>
    <div class="detail-history">
      <strong>Последние прослушивания</strong>
      ${history.length ? history.map((item) => `<p>${escapeHtml(item.track.title)} <span>${escapeHtml(item.played_at)}</span></p>`).join("") : `<p class="muted">История прослушиваний пуста.</p>`}
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
      showToast("Профиль сохранён");
      await refreshUsers();
      await inspectUser(userId);
    } catch {
      showToast("Не удалось сохранить профиль");
    }
  });

  userDetail.querySelector<HTMLButtonElement>('[data-action="clear"]')?.addEventListener("click", async (event) => {
    const userId = Number((event.currentTarget as HTMLButtonElement).dataset.user || 0);
    if (!userId) return;
    if (!window.confirm("Очистить историю, избранное и плейлисты пользователя? Это действие нельзя отменить.")) return;
    try {
      await adminSend(`/api/admin/users/${userId}/clear-data`, "POST");
      showToast("Данные пользователя очищены");
      await refreshUsers();
      await inspectUser(userId);
    } catch {
      showToast("Не удалось очистить данные");
    }
  });
}

async function inspectUser(userId: number): Promise<void> {
  try {
    renderUserDetail(await adminFetch<UserDetail>(`/api/admin/users/${userId}`));
  } catch {
    userDetail.textContent = "Не удалось загрузить данные пользователя.";
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
          showToast(`Временный пароль: ${payload.temporary_password}`);
        }
        if (action === "ban") {
          if (!window.confirm("Заблокировать этого пользователя?")) return;
          await adminSend(`/api/admin/users/${userId}/ban`, "POST", { reason: "manual admin ban" });
          showToast("Пользователь заблокирован");
        }
        if (action === "unban") {
          await adminSend(`/api/admin/users/${userId}/unban`, "POST");
          showToast("Пользователь разблокирован");
        }
        if (action !== "inspect") await refreshUsers();
      } catch {
        showToast("Не удалось выполнить действие");
      } finally {
        button.disabled = false;
      }
    });
  });

  usersTable.querySelectorAll<HTMLElement>(".status-select").forEach((select) => {
    bindAdminSelect(select, async (value) => {
      const userId = Number(select.dataset.user || 0);
      const user = currentUsers.find((item) => item.id === userId);
      if (!userId || !user) return;
      try {
        await adminSend(`/api/admin/users/${userId}`, "PATCH", {
          nickname: user.nickname,
          avatar_url: user.avatar_url || "",
          subscription_status: value,
        });
        showToast("Статус подписки обновлён");
        await refreshUsers();
      } catch {
        showToast("Не удалось обновить статус подписки");
      }
    });
  });
}

function showToast(message = "Готово"): void {
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
    usersTable.innerHTML = `<p class="muted">Не удалось загрузить пользователей.</p>`;
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
  const maxAgeHours = Number(cacheMaxAge.dataset.value || 24);
  if (!window.confirm(`Удалить готовые аудиофайлы, которые не использовались более ${maxAgeHours} ч?`)) return;
  pruneCacheButton.disabled = true;
  try {
    const payload = await adminSend<{ removed_files: number; freed_bytes: number; audio_cache: AudioCacheMetrics }>(
      "/api/admin/cache/audio/prune",
      "POST",
      { max_age_hours: maxAgeHours },
    );
    showToast(`Удалено файлов: ${payload.removed_files} · освобождено: ${formatBytes(payload.freed_bytes)}`);
    await refreshOverview();
  } catch {
    showToast("Не удалось очистить аудиокеш");
  } finally {
    pruneCacheButton.disabled = false;
  }
});

let adminPollingStarted = false;
let adminPollInFlight = false;
let adminPollTick = 0;

function startAdminPolling(): void {
  if (adminPollingStarted) return;
  adminPollingStarted = true;
  void refreshEverything();
  window.setInterval(async () => {
    if (document.hidden || adminAccessGate.hidden === false || adminPollInFlight) return;
    adminPollInFlight = true;
    adminPollTick++;
    try {
      await Promise.all([refreshStats(), refreshLogs()]);
      if (adminPollTick % 3 === 0 && !document.querySelector(".admin-select.is-open")) {
        await Promise.all([refreshUsers(), refreshOverview()]);
      }
    } finally {
      adminPollInFlight = false;
    }
  }, 5_000);
}

adminAccessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const key = adminAccessKey.value.trim();
  if (!key) return;
  adminAccessError.textContent = "Проверяем доступ…";
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
    adminAccessError.textContent = "Доступ запрещён. Проверьте ключ администратора.";
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
