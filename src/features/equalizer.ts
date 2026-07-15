export type EqualizerPresetId = "flat" | "clean" | "bass" | "subbass" | "punch" | "hiphop" | "vocal" | "electronic" | "rock" | "acoustic" | "cinema" | "night" | "custom";
export type EqualizerPreset = {
  label: string;
  description: string;
  icon: string;
  preamp: number;
  bassBoost: number;
  clarity: number;
  gains: number[];
};
export type EqualizerState = {
  enabled: boolean;
  preset: EqualizerPresetId;
  preamp: number;
  bassBoost: number;
  clarity: number;
  autoGain: boolean;
  gains: number[];
};
export type EqualizerMetrics = {
  bassDb: number;
  clarityDb: number;
  automaticHeadroomDb: number;
  effectivePreampDb: number;
  peakBoostDb: number;
};

export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export const EQ_PRESETS: Record<EqualizerPresetId, EqualizerPreset> = {
  flat: { label: "Ровный", description: "Без окрашивания", icon: "0", preamp: 0, bassBoost: 0, clarity: 0, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  clean: { label: "Чистый звук", description: "Меньше мути, больше деталей", icon: "C", preamp: 0, bassBoost: 12, clarity: 72, gains: [0, -0.5, -1, -1.5, -1, 0, 1.5, 2, 1.5, 1] },
  bass: { label: "Мощный бас", description: "Глубокий низ без гула", icon: "B", preamp: -0.5, bassBoost: 78, clarity: 36, gains: [2.5, 3.5, 3, 0, -1.5, -0.5, 0.5, 1, 1.5, 1] },
  subbass: { label: "Сабвуфер", description: "Максимальная глубина ниже 100 Гц", icon: "S", preamp: -1, bassBoost: 100, clarity: 20, gains: [4.5, 3.5, 1.5, -0.5, -2, -1, 0, 0.5, 0.5, 0] },
  punch: { label: "Панч", description: "Плотная бочка и быстрая атака", icon: "P", preamp: -0.5, bassBoost: 52, clarity: 48, gains: [1, 2.5, 3.5, 1, -1, -0.5, 1, 2, 1, 0] },
  hiphop: { label: "Хип-хоп", description: "Вес бита и разборчивый вокал", icon: "H", preamp: -0.5, bassBoost: 66, clarity: 56, gains: [2, 3, 2.5, -0.5, -1.5, 0, 1.5, 2, 2, 1] },
  vocal: { label: "Вокал", description: "Голос ближе и чище", icon: "V", preamp: -0.5, bassBoost: 0, clarity: 82, gains: [-3, -2, -1, 0, 1.5, 3, 4, 2, 1, 0] },
  electronic: { label: "Электроника", description: "Глубина, сцена и яркие детали", icon: "E", preamp: -0.5, bassBoost: 58, clarity: 58, gains: [2, 2, 1, -1, -2, -1, 1.5, 3, 4, 3] },
  rock: { label: "Рок", description: "Ударные, гитары и живой верх", icon: "R", preamp: -0.5, bassBoost: 30, clarity: 54, gains: [2.5, 2, 1, -0.5, -1, 1.5, 2.5, 3, 2, 1] },
  acoustic: { label: "Акустика", description: "Естественные инструменты и воздух", icon: "A", preamp: 0, bassBoost: 10, clarity: 62, gains: [-1, -0.5, 0, 1, 2, 2, 1.5, 1, 1, 1] },
  cinema: { label: "Кино", description: "Масштабный низ и ясные диалоги", icon: "M", preamp: -0.5, bassBoost: 56, clarity: 58, gains: [2, 1.5, 0.5, -1, -1, 0, 2, 3, 2, 1] },
  night: { label: "Ночной", description: "Полный звук на тихой громкости", icon: "N", preamp: -0.5, bassBoost: 34, clarity: 14, gains: [2, 2, 1, 0, 0, -1, -2, -3, -4, -5] },
  custom: { label: "Свой профиль", description: "Ручная настройка", icon: "C", preamp: 0, bassBoost: 0, clarity: 0, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
};

export const DEFAULT_EQUALIZER: EqualizerState = {
  enabled: false,
  preset: "flat",
  preamp: 0,
  bassBoost: EQ_PRESETS.flat.bassBoost,
  clarity: EQ_PRESETS.flat.clarity,
  autoGain: true,
  gains: [...EQ_PRESETS.flat.gains],
};

export const EQUALIZER_STATE_VERSION = 2;

export function restoreEqualizerState(value: unknown): { state: EqualizerState; migrated: boolean } {
  if (!value || typeof value !== "object") {
    return { state: { ...DEFAULT_EQUALIZER, gains: [...DEFAULT_EQUALIZER.gains] }, migrated: true };
  }
  const parsed = value as Partial<EqualizerState> & { version?: number };
  const presetId: EqualizerPresetId = typeof parsed.preset === "string" && parsed.preset in EQ_PRESETS
    ? parsed.preset as EqualizerPresetId
    : "flat";
  const preset = EQ_PRESETS[presetId];
  const isCustom = presetId === "custom";
  const gains = isCustom && Array.isArray(parsed.gains) && parsed.gains.length === EQ_FREQUENCIES.length
    ? parsed.gains.map((gain) => clamp(Number(gain) || 0, -12, 12))
    : [...preset.gains];
  return {
    state: {
      enabled: Boolean(parsed.enabled),
      preset: presetId,
      preamp: isCustom && Number.isFinite(Number(parsed.preamp)) ? clamp(Number(parsed.preamp), -12, 0) : preset.preamp,
      bassBoost: isCustom && Number.isFinite(Number(parsed.bassBoost)) ? clamp(Number(parsed.bassBoost), 0, 100) : preset.bassBoost,
      clarity: isCustom && Number.isFinite(Number(parsed.clarity)) ? clamp(Number(parsed.clarity), 0, 100) : preset.clarity,
      autoGain: parsed.version === EQUALIZER_STATE_VERSION ? parsed.autoGain !== false : true,
      gains,
    },
    migrated: parsed.version !== EQUALIZER_STATE_VERSION,
  };
}

type FilterKind = "highpass" | "peaking" | "lowshelf" | "highshelf";
type FilterSpec = { type: FilterKind; frequency: number; q: number; gain: number };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function bassBoostToDb(amount: number): number {
  return Math.pow(clamp(amount, 0, 100) / 100, 1.12) * 6.5;
}

export function clarityToDb(amount: number): number {
  return (clamp(amount, 0, 100) / 100) * 3.2;
}

function equalizerFilterSpecs(state: Pick<EqualizerState, "gains" | "bassBoost" | "clarity">): FilterSpec[] {
  const bassDb = bassBoostToDb(state.bassBoost);
  const clarityDb = clarityToDb(state.clarity);
  const graphicFilters = EQ_FREQUENCIES.map<FilterSpec>((frequency, index) => ({
    type: index === 0 ? "lowshelf" : index === EQ_FREQUENCIES.length - 1 ? "highshelf" : "peaking",
    frequency: index === 0 ? 42 : index === EQ_FREQUENCIES.length - 1 ? 14000 : frequency,
    q: index === 0 || index === EQ_FREQUENCIES.length - 1 ? 0.72 : 1,
    gain: clamp(Number(state.gains[index] || 0), -12, 12),
  }));
  return [
    { type: "highpass", frequency: 18, q: 0.72, gain: 0 },
    ...graphicFilters,
    { type: "lowshelf", frequency: 88, q: 0.72, gain: bassDb },
    { type: "peaking", frequency: 135, q: 0.86, gain: bassDb * 0.28 },
    { type: "peaking", frequency: 285, q: 0.9, gain: -Math.min(2.8, clarityDb * 0.52 + bassDb * 0.1) },
    { type: "peaking", frequency: 2800, q: 0.78, gain: clarityDb },
    { type: "highshelf", frequency: 9000, q: 0.72, gain: clarityDb * 0.52 },
  ];
}

function filterCoefficients(spec: FilterSpec, sampleRate: number): [number, number, number, number, number, number] {
  const frequency = clamp(spec.frequency, 1, sampleRate * 0.49);
  const omega = 2 * Math.PI * frequency / sampleRate;
  const cosine = Math.cos(omega);
  const sine = Math.sin(omega);
  const q = Math.max(0.05, spec.q);
  const alpha = sine / (2 * q);
  if (spec.type === "highpass") {
    return [(1 + cosine) / 2, -(1 + cosine), (1 + cosine) / 2, 1 + alpha, -2 * cosine, 1 - alpha];
  }

  const amplitude = Math.pow(10, spec.gain / 40);
  if (spec.type === "peaking") {
    return [1 + alpha * amplitude, -2 * cosine, 1 - alpha * amplitude, 1 + alpha / amplitude, -2 * cosine, 1 - alpha / amplitude];
  }

  const shelfAlpha = sine / 2 * Math.sqrt(2);
  const beta = 2 * Math.sqrt(amplitude) * shelfAlpha;
  if (spec.type === "lowshelf") {
    return [
      amplitude * ((amplitude + 1) - (amplitude - 1) * cosine + beta),
      2 * amplitude * ((amplitude - 1) - (amplitude + 1) * cosine),
      amplitude * ((amplitude + 1) - (amplitude - 1) * cosine - beta),
      (amplitude + 1) + (amplitude - 1) * cosine + beta,
      -2 * ((amplitude - 1) + (amplitude + 1) * cosine),
      (amplitude + 1) + (amplitude - 1) * cosine - beta,
    ];
  }
  return [
    amplitude * ((amplitude + 1) + (amplitude - 1) * cosine + beta),
    -2 * amplitude * ((amplitude - 1) + (amplitude + 1) * cosine),
    amplitude * ((amplitude + 1) + (amplitude - 1) * cosine - beta),
    (amplitude + 1) - (amplitude - 1) * cosine + beta,
    2 * ((amplitude - 1) - (amplitude + 1) * cosine),
    (amplitude + 1) - (amplitude - 1) * cosine - beta,
  ];
}

function filterResponseDb(spec: FilterSpec, frequency: number, sampleRate: number): number {
  const [b0, b1, b2, a0, a1, a2] = filterCoefficients(spec, sampleRate);
  const omega = 2 * Math.PI * clamp(frequency, 1, sampleRate * 0.49) / sampleRate;
  const cos1 = Math.cos(omega);
  const sin1 = Math.sin(omega);
  const cos2 = Math.cos(2 * omega);
  const sin2 = Math.sin(2 * omega);
  const numeratorReal = b0 + b1 * cos1 + b2 * cos2;
  const numeratorImaginary = -b1 * sin1 - b2 * sin2;
  const denominatorReal = a0 + a1 * cos1 + a2 * cos2;
  const denominatorImaginary = -a1 * sin1 - a2 * sin2;
  const numeratorPower = numeratorReal * numeratorReal + numeratorImaginary * numeratorImaginary;
  const denominatorPower = Math.max(1e-20, denominatorReal * denominatorReal + denominatorImaginary * denominatorImaginary);
  return 10 * Math.log10(Math.max(1e-20, numeratorPower / denominatorPower));
}

export function equalizerFrequencyResponse(
  state: Pick<EqualizerState, "gains" | "bassBoost" | "clarity">,
  frequencies: readonly number[],
  sampleRate = 48000,
): number[] {
  const safeSampleRate = clamp(sampleRate, 8000, 192000);
  const specs = equalizerFilterSpecs(state);
  return frequencies.map((frequency) => specs.reduce((response, spec) => response + filterResponseDb(spec, frequency, safeSampleRate), 0));
}

export function equalizerDisplayGains(state: Pick<EqualizerState, "gains" | "bassBoost" | "clarity">): number[] {
  return equalizerFrequencyResponse(state, EQ_FREQUENCIES).map((gain) => clamp(gain, -12, 12));
}

export function calculateEqualizerMetrics(state: EqualizerState, sampleRate = 48000): EqualizerMetrics {
  const bassDb = bassBoostToDb(state.bassBoost);
  const clarityDb = clarityToDb(state.clarity);
  const responseFrequencies = Array.from({ length: 128 }, (_, index) => 20 * Math.pow(1000, index / 127));
  const peakBoostDb = Math.max(0, ...equalizerFrequencyResponse(state, responseFrequencies, sampleRate));
  const manualPreampDb = clamp(state.preamp, -12, 0);
  const automaticHeadroomDb = state.autoGain
    ? -Math.max(0, peakBoostDb + manualPreampDb - 1.5)
    : 0;
  const effectivePreampDb = clamp(manualPreampDb + automaticHeadroomDb, -30, 0);
  return { bassDb, clarityDb, automaticHeadroomDb, effectivePreampDb, peakBoostDb };
}

export function formatEqFrequency(frequency: number): string {
  return frequency >= 1000 ? `${frequency / 1000} кГц` : `${frequency} Гц`;
}

export function formatEqGain(gain: number): string {
  const rounded = Number.isInteger(gain) ? String(gain) : gain.toFixed(1);
  return `${gain > 0 ? "+" : ""}${rounded} дБ`;
}

export function equalizerCurvePoints(gains: number[]): string {
  return gains.map((gain, index) => {
    const x = (index / Math.max(1, gains.length - 1)) * 100;
    const y = 50 - (clamp(gain, -12, 12) / 12) * 38;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

export class EqualizerEngine {
  private context: AudioContext | null = null;
  private filters: BiquadFilterNode[] = [];
  private preamp: GainNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private bassShelf: BiquadFilterNode | null = null;
  private bassPunch: BiquadFilterNode | null = null;
  private mudControl: BiquadFilterNode | null = null;
  private presence: BiquadFilterNode | null = null;
  private air: BiquadFilterNode | null = null;
  private initialization: Promise<boolean> | null = null;

  constructor(private readonly audio: HTMLAudioElement) {}

  apply(state: EqualizerState): void {
    const now = this.context?.currentTime || 0;
    const enabled = state.enabled;
    const metrics = calculateEqualizerMetrics(state, this.context?.sampleRate || 48000);
    this.dry?.gain.setTargetAtTime(enabled ? 0 : 1, now, 0.012);
    this.wet?.gain.setTargetAtTime(enabled ? 1 : 0, now, 0.012);
    this.preamp?.gain.setTargetAtTime(dbToGain(enabled ? metrics.effectivePreampDb : 0), now, 0.025);
    this.filters.forEach((filter, index) => filter.gain.setTargetAtTime(enabled ? clamp(Number(state.gains[index] || 0), -12, 12) : 0, now, 0.018));
    this.bassShelf?.gain.setTargetAtTime(enabled ? metrics.bassDb : 0, now, 0.025);
    this.bassPunch?.gain.setTargetAtTime(enabled ? metrics.bassDb * 0.28 : 0, now, 0.025);
    this.mudControl?.gain.setTargetAtTime(enabled ? -Math.min(2.8, metrics.clarityDb * 0.52 + metrics.bassDb * 0.1) : 0, now, 0.025);
    this.presence?.gain.setTargetAtTime(enabled ? metrics.clarityDb : 0, now, 0.025);
    this.air?.gain.setTargetAtTime(enabled ? metrics.clarityDb * 0.52 : 0, now, 0.025);
  }

  private async initialize(): Promise<boolean> {
    let pendingContext: AudioContext | null = null;
    try {
      pendingContext = new AudioContext({ latencyHint: "playback" });
      const source = pendingContext.createMediaElementSource(this.audio);
      const dry = pendingContext.createGain();
      const wet = pendingContext.createGain();
      const preamp = pendingContext.createGain();
      dry.gain.value = 1;
      wet.gain.value = 0;
      preamp.gain.value = 1;
      const rumbleCut = pendingContext.createBiquadFilter();
      rumbleCut.type = "highpass";
      rumbleCut.frequency.value = 18;
      rumbleCut.Q.value = 0.72;

      const filters = EQ_FREQUENCIES.map((frequency, index) => {
        const filter = pendingContext!.createBiquadFilter();
        filter.type = index === 0 ? "lowshelf" : index === EQ_FREQUENCIES.length - 1 ? "highshelf" : "peaking";
        filter.frequency.value = index === 0 ? 42 : index === EQ_FREQUENCIES.length - 1 ? 14000 : frequency;
        filter.Q.value = index === 0 || index === EQ_FREQUENCIES.length - 1 ? 0.72 : 1;
        return filter;
      });

      const bassShelf = pendingContext.createBiquadFilter();
      bassShelf.type = "lowshelf";
      bassShelf.frequency.value = 88;
      bassShelf.Q.value = 0.72;
      const bassPunch = pendingContext.createBiquadFilter();
      bassPunch.type = "peaking";
      bassPunch.frequency.value = 135;
      bassPunch.Q.value = 0.86;
      const mudControl = pendingContext.createBiquadFilter();
      mudControl.type = "peaking";
      mudControl.frequency.value = 285;
      mudControl.Q.value = 0.9;
      const presence = pendingContext.createBiquadFilter();
      presence.type = "peaking";
      presence.frequency.value = 2800;
      presence.Q.value = 0.78;
      const air = pendingContext.createBiquadFilter();
      air.type = "highshelf";
      air.frequency.value = 9000;
      air.Q.value = 0.72;

      const limiter = pendingContext.createDynamicsCompressor();
      limiter.threshold.value = -0.5;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;

      source.connect(dry);
      dry.connect(pendingContext.destination);
      source.connect(preamp);
      let previous: AudioNode = preamp;
      [rumbleCut, ...filters, bassShelf, bassPunch, mudControl, presence, air].forEach((node) => {
        previous.connect(node);
        previous = node;
      });
      previous.connect(limiter);
      limiter.connect(wet);
      wet.connect(pendingContext.destination);

      this.context = pendingContext;
      this.dry = dry;
      this.wet = wet;
      this.preamp = preamp;
      this.filters = filters;
      this.bassShelf = bassShelf;
      this.bassPunch = bassPunch;
      this.mudControl = mudControl;
      this.presence = presence;
      this.air = air;
      pendingContext = null;
      return true;
    } catch {
      if (pendingContext) void pendingContext.close().catch(() => undefined);
      return false;
    }
  }

  async ensure(state: EqualizerState): Promise<boolean> {
    if (!this.context) {
      if (!this.initialization) {
        this.initialization = this.initialize().finally(() => { this.initialization = null; });
      }
      if (!await this.initialization) return false;
    }
    try {
      if (this.context?.state === "suspended") await this.context.resume();
      if (!this.context || this.context.state === "closed") return false;
      this.apply(state);
      return true;
    } catch {
      return false;
    }
  }
}
