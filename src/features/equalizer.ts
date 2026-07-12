export type EqualizerPresetId = "flat" | "bass" | "subbass" | "punch" | "hiphop" | "vocal" | "electronic" | "rock" | "acoustic" | "cinema" | "night" | "custom";
export type EqualizerPreset = { label: string; description: string; icon: string; preamp: number; gains: number[] };
export type EqualizerState = { enabled: boolean; preset: EqualizerPresetId; preamp: number; gains: number[] };

export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const EQ_PRESETS: Record<EqualizerPresetId, EqualizerPreset> = {
  flat: { label: "Ровный", description: "Без окрашивания", icon: "—", preamp: 0, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  bass: { label: "Больше баса", description: "Мощный низ без гула", icon: "B", preamp: -4, gains: [9, 12, 10, 6, 2, 0, -1, -2, -2, -1] },
  subbass: { label: "Саб-бас", description: "Глубина ниже 100 Гц", icon: "S", preamp: -5, gains: [12, 11, 7, 3, 0, -1, -2, -3, -3, -3] },
  punch: { label: "Панч", description: "Удар бочки и атака", icon: "P", preamp: -3, gains: [3, 7, 9, 5, 0, -1, 1, 3, 2, 1] },
  hiphop: { label: "Хип-хоп", description: "Плотный бит и вокал", icon: "H", preamp: -4, gains: [8, 10, 8, 3, -1, 0, 2, 3, 4, 3] },
  vocal: { label: "Вокал", description: "Голос ближе и чище", icon: "V", preamp: -3, gains: [-4, -3, -2, 0, 2, 5, 6, 3, 1, 0] },
  electronic: { label: "Электроника", description: "V-образный клубный звук", icon: "E", preamp: -4, gains: [7, 7, 4, 0, -2, -1, 2, 5, 7, 6] },
  rock: { label: "Рок", description: "Гитары и живые барабаны", icon: "R", preamp: -3, gains: [5, 4, 2, 0, -1, 2, 4, 5, 4, 3] },
  acoustic: { label: "Акустика", description: "Естественные инструменты", icon: "A", preamp: -2, gains: [-2, -1, 0, 2, 4, 4, 3, 2, 1, 2] },
  cinema: { label: "Кино", description: "Масштаб и разборчивость", icon: "C", preamp: -4, gains: [8, 7, 4, 1, -1, 1, 4, 6, 5, 3] },
  night: { label: "Ночной", description: "Мягко на тихой громкости", icon: "N", preamp: -3, gains: [6, 5, 3, 1, 0, -1, -3, -4, -5, -6] },
  custom: { label: "Свой профиль", description: "Ручная настройка", icon: "✦", preamp: 0, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
};

export const DEFAULT_EQUALIZER: EqualizerState = { enabled: false, preset: "flat", preamp: 0, gains: [...EQ_PRESETS.flat.gains] };

export function formatEqFrequency(frequency: number): string {
  return frequency >= 1000 ? `${frequency / 1000}k` : String(frequency);
}

export function formatEqGain(gain: number): string {
  const rounded = Number.isInteger(gain) ? String(gain) : gain.toFixed(1);
  return `${gain > 0 ? "+" : ""}${rounded} dB`;
}

export function equalizerCurvePoints(gains: number[]): string {
  return gains.map((gain, index) => {
    const x = (index / Math.max(1, gains.length - 1)) * 100;
    const y = 50 - (Math.max(-12, Math.min(12, gain)) / 12) * 38;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

export class EqualizerEngine {
  private context: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private preamp: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;

  constructor(private readonly audio: HTMLAudioElement) {}

  apply(state: EqualizerState): void {
    const now = this.context?.currentTime || 0;
    if (this.preamp) this.preamp.gain.setTargetAtTime(Math.pow(10, (state.enabled ? state.preamp : 0) / 20), now, 0.025);
    this.filters.forEach((filter, index) => filter.gain.setTargetAtTime(state.enabled ? Number(state.gains[index] || 0) : 0, now, 0.015));
  }

  async ensure(state: EqualizerState): Promise<boolean> {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.source = this.context.createMediaElementSource(this.audio);
        this.preamp = this.context.createGain();
        this.limiter = this.context.createDynamicsCompressor();
        this.limiter.threshold.value = -1.5;
        this.limiter.knee.value = 4;
        this.limiter.ratio.value = 12;
        this.limiter.attack.value = 0.003;
        this.limiter.release.value = 0.24;
        this.filters = EQ_FREQUENCIES.map((frequency, index) => {
          const filter = this.context!.createBiquadFilter();
          filter.type = index === 0 ? "lowshelf" : index === EQ_FREQUENCIES.length - 1 ? "highshelf" : "peaking";
          filter.frequency.value = frequency;
          filter.Q.value = index === 0 || index === EQ_FREQUENCIES.length - 1 ? 0.72 : 1.15;
          return filter;
        });
        this.source.connect(this.preamp);
        let previous: AudioNode = this.preamp;
        this.filters.forEach((filter) => { previous.connect(filter); previous = filter; });
        previous.connect(this.limiter);
        this.limiter.connect(this.context.destination);
      }
      if (this.context.state === "suspended") await this.context.resume();
      this.apply(state);
      return true;
    } catch {
      return false;
    }
  }
}
