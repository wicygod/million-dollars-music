import type { HistorySummary } from "../api/musicApi";

export function formatListeningTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  const totalMinutes = Math.floor(safeSeconds / 60);
  return `${totalMinutes} ${pluralizeMinutes(totalMinutes)}`;
}

function pluralizeMinutes(count: number): string {
  const lastTwo = Math.abs(count) % 100;
  const last = lastTwo % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "минут";
  if (last === 1) return "минута";
  if (last >= 2 && last <= 4) return "минуты";
  return "минут";
}

export function pluralizeTracks(count: number): string {
  const lastTwo = Math.abs(count) % 100;
  const last = lastTwo % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "треков";
  if (last === 1) return "трек";
  if (last >= 2 && last <= 4) return "трека";
  return "треков";
}

export function applyHistorySummaryToProfile(summary: HistorySummary): void {
  const totalSeconds = Math.max(0, Number(summary.total_seconds) || 0);
  const value = document.querySelector("#profileListeningTimeValue");
  const detail = document.querySelector("#profileListeningTimeDetail");
  const stat = document.querySelector("#profileTotalMinutesStat");
  if (value) value.textContent = formatListeningTime(totalSeconds);
  if (detail) detail.textContent = `${summary.total_tracks} ${pluralizeTracks(summary.total_tracks)} в истории аккаунта`;
  if (stat) stat.textContent = String(Math.floor(totalSeconds / 60));
}
