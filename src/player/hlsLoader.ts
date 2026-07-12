import type Hls from "hls.js";

let constructorPromise: Promise<typeof Hls> | null = null;

export type HlsPlayer = Hls;

export function loadHlsConstructor(): Promise<typeof Hls> {
  constructorPromise ??= import("hls.js").then((module) => module.default);
  return constructorPromise;
}
