export type PlayerSettings = {
  theme: boolean;
  scale: string;
  normalize: boolean;
  crossfade: boolean;
  autoplay: boolean;
  prefetch: boolean;
  compact: boolean;
  reduceMotion: boolean;
  accent: string;
};

export const DEFAULT_SETTINGS: PlayerSettings = {
  theme: true,
  scale: "100",
  normalize: false,
  crossfade: false,
  autoplay: true,
  prefetch: true,
  compact: false,
  reduceMotion: false,
  accent: "violet",
};

export const ACCENT_COLORS: Record<string, string> = {
  violet: "#8b5cf6",
  rose: "#ec4899",
  cyan: "#06b6d4",
  lime: "#84cc16",
};

export function settingSwitch(id: string, checked: boolean): string {
  return `<label class="relative inline-flex items-center cursor-pointer">
    <input id="${id}" type="checkbox" ${checked ? "checked" : ""} class="sr-only peer">
    <span class="w-9 h-5 bg-white/10 rounded-full peer peer-checked:bg-indigo-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all after:duration-300 peer-checked:after:translate-x-4"></span>
  </label>`;
}
