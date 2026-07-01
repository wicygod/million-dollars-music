import { API_BASE_URL, adminHeaders } from "./api/musicApi";

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
  return `${Math.round(value / 1024 / 1024)} MB`;
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

void refreshStats();
void refreshLogs();
void refreshUsers();
window.setInterval(() => void refreshStats(), 2000);
window.setInterval(() => void refreshLogs(), 1500);
window.setInterval(() => void refreshUsers(), 7000);
