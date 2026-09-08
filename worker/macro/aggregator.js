export class ReleaseAggregator {
  constructor({ aggregationWindowMs = 350, lateUpdateWindowMs = 3000, onEvaluate, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.aggregationWindowMs = aggregationWindowMs; this.lateUpdateWindowMs = lateUpdateWindowMs; this.onEvaluate = onEvaluate;
    this.now = now; this.setTimer = setTimer; this.clearTimer = clearTimer; this.entries = new Map();
  }

  ingest(releaseKey, component) {
    const timestamp = this.now(); let entry = this.entries.get(releaseKey);
    if (!entry) {
      entry = { components: new Map(), openedAt: timestamp, finalAt: timestamp + this.lateUpdateWindowMs, timer: null };
      this.entries.set(releaseKey, entry);
    }
    entry.components.set(component.indicator, component);
    if (entry.timer) this.clearTimer(entry.timer);
    const firstEvaluationAt = entry.openedAt + this.aggregationWindowMs;
    const dueIn = Math.max(0, Math.min(firstEvaluationAt, entry.finalAt) - timestamp);
    entry.timer = this.setTimer(() => this.flush(releaseKey, this.now() >= entry.finalAt), dueIn);
  }

  async flush(releaseKey, final = false) {
    const entry = this.entries.get(releaseKey); if (!entry) return;
    if (entry.timer) this.clearTimer(entry.timer); entry.timer = null;
    await this.onEvaluate?.(releaseKey, [...entry.components.values()], { final, openedAt: entry.openedAt, finalAt: entry.finalAt });
    if (final || this.now() >= entry.finalAt) this.entries.delete(releaseKey);
    else entry.timer = this.setTimer(() => this.flush(releaseKey, true), Math.max(0, entry.finalAt - this.now()));
  }

  close() { for (const entry of this.entries.values()) if (entry.timer) this.clearTimer(entry.timer); this.entries.clear(); }
}
