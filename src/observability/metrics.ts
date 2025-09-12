export interface MetricsCollector {
  increment(metric: string, value?: number, tags?: Record<string, string>): void;
  gauge(metric: string, value: number, tags?: Record<string, string>): void;
  timing(metric: string, duration: number, tags?: Record<string, string>): void;
}

class ConsoleMetricsCollector implements MetricsCollector {
  private enabled: boolean;
  
  constructor(enabled = true) {
    this.enabled = enabled;
  }
  
  increment(metric: string, value = 1, tags?: Record<string, string>): void {
    if (!this.enabled) return;
    const tagString = tags ? Object.entries(tags).map(([k, v]) => `${k}=${v}`).join(',') : '';
    // eslint-disable-next-line no-console
    console.log(`[METRIC] ${metric} +${value}${tagString ? ` {${tagString}}` : ''}`);
  }
  
  gauge(metric: string, value: number, tags?: Record<string, string>): void {
    if (!this.enabled) return;
    const tagString = tags ? Object.entries(tags).map(([k, v]) => `${k}=${v}`).join(',') : '';
    // eslint-disable-next-line no-console
    console.log(`[METRIC] ${metric} ${value}${tagString ? ` {${tagString}}` : ''}`);
  }
  
  timing(metric: string, duration: number, tags?: Record<string, string>): void {
    if (!this.enabled) return;
    const tagString = tags ? Object.entries(tags).map(([k, v]) => `${k}=${v}`).join(',') : '';
    // eslint-disable-next-line no-console
    console.log(`[METRIC] ${metric} ${duration}ms${tagString ? ` {${tagString}}` : ''}`);
  }
}

// Singleton instance management
let metricsInstance: MetricsCollector | null = null;

export function getMetrics(enabled = true): MetricsCollector {
  if (!metricsInstance) {
    metricsInstance = new ConsoleMetricsCollector(enabled);
  }
  return metricsInstance;
}

// Reset for testing
export function resetMetrics(): void {
  metricsInstance = null;
}

// Metric name constants
export const METRICS = {
  BATCHES_TOTAL: 'socrata.ingest.batches_total',
  ITEMS_TOTAL: 'socrata.ingest.items_total', 
  RESUME_RESTARTS_TOTAL: 'socrata.ingest.resume_restarts_total',
  DUPLICATES_SKIPPED_TOTAL: 'socrata.ingest.duplicates_skipped_total',
  BATCH_DURATION_MS: 'socrata.ingest.batch_duration_ms',
  PIPELINE_DURATION_MS: 'socrata.ingest.pipeline_duration_ms',
} as const;