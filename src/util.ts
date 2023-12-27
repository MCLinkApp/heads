import { DefaultSkinType } from "./types";

export const uuidToDefaultSkinType = (uuid: string): DefaultSkinType =>
  parseInt(uuid[7], 16) ^ parseInt(uuid[15], 16) ^ parseInt(uuid[23], 16) ^ parseInt(uuid[31], 16);

export const colorSig = (array: number[], offset: number): number =>
  array[offset] * 2 ** (8 * 3) +
  array[offset + 1] * 2 ** (8 * 2) +
  array[offset + 2] * 2 ** 8 +
  array[offset + 3];

export class Timings {
  private timings: Record<string, number> = {};
  private pendingTimings: Record<string, number> = {};

  public start(name: string) {
    this.pendingTimings[name] = performance.now();
  }

  public stop(name: string, options: { log: boolean } = { log: true }): number {
    const end = performance.now();
    const start = this.pendingTimings[name];
    if (!start) throw new Error(`Timing ${name} not started`);

    delete this.pendingTimings[name];

    const duration = end - start;

    this.timings[name] = duration;

    if (options.log) console.log(`⏱️ ${name}: ${duration}ms`);

    return duration;
  }

  public toHeader(): string {
    return Object.entries(this.timings)
      .map(([key, value]) => `${key};dur=${value}`)
      .join(", ");
  }
}
