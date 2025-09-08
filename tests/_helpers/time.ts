import { vi } from 'vitest';

export function freezeTime(epochMs: number = Date.UTC(2025, 0, 1, 0, 0, 0)) {
  vi.useFakeTimers({ toFake: ['setTimeout','setInterval','Date'], shouldAdvanceTime: false });
  vi.setSystemTime(new Date(epochMs));
}

export async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

export function restoreTime() {
  vi.useRealTimers();
  vi.clearAllTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.resetModules();
}
