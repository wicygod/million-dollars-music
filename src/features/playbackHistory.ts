export class PlaybackCycleGate {
  private cycle = 0;
  private recordedCycle = 0;

  begin(): number {
    this.cycle += 1;
    return this.cycle;
  }

  claim(): number | null {
    if (this.cycle === 0 || this.recordedCycle === this.cycle) return null;
    this.recordedCycle = this.cycle;
    return this.cycle;
  }

  release(cycle: number): void {
    if (this.recordedCycle === cycle) this.recordedCycle = -1;
  }

  reset(): void {
    this.cycle = 0;
    this.recordedCycle = 0;
  }
}
