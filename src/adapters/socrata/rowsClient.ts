import type { RowClientOptions, PageResult } from './types.js';
import { fetchWithRetry, buildSocrataUrl, sleep } from './http.js';

export class SocrataRowClient {
  private readonly domain: string;
  private readonly datasetId: string;
  private readonly limit: number;
  private readonly maxRows?: number;
  private readonly throttleMs: number;
  private readonly retries: number;
  private readonly retryBaseMs: number;
  private readonly where?: string;
  private readonly order?: string;
  private readonly select?: string;
  private readonly extra?: Record<string, string | number | boolean>;

  constructor(opts: RowClientOptions) {
    this.domain = opts.domain;
    this.datasetId = opts.datasetId;
    this.limit = Math.max(1, Math.min(opts.limit ?? 1000, 1000));
    this.maxRows = opts.maxRows;
    this.throttleMs = opts.throttleMs ?? 0;
    this.retries = opts.retries ?? 3;
    this.retryBaseMs = opts.retryBaseMs ?? 250;
    this.where = opts.where;
    this.order = opts.order;
    this.select = opts.select;
    this.extra = opts.extra;
  }

  async fetchPage(offset = 0): Promise<PageResult> {
    if (!Number.isFinite(this.limit) || this.limit <= 0) throw new Error('Invalid limit');

    const queryParams = new URLSearchParams();
    queryParams.set('$limit', String(this.limit));
    queryParams.set('$offset', String(offset));
    if (this.where !== undefined) queryParams.set('$where', this.where);
    if (this.order !== undefined) queryParams.set('$order', this.order);
    if (this.select !== undefined) queryParams.set('$select', this.select);
    if (this.extra) {
      for (const [k, v] of Object.entries(this.extra)) {
        if (v !== undefined) queryParams.set(k, String(v));
      }
    }

    const url = buildSocrataUrl(this.domain, `/resource/${this.datasetId}.json`, Object.fromEntries(queryParams.entries()));
    const response = await fetchWithRetry({ url: url.toString(), init: {}, retries: this.retries, retryBaseMs: this.retryBaseMs });
    const rows = await response.json() as unknown[];
    const totalFetched = offset + rows.length;
    const hasMore = rows.length === this.limit;
    const nextOffset = hasMore ? offset + this.limit : undefined;
    return { rows, nextOffset, totalFetched };
  }

  async fetchAll(): Promise<unknown[]> {
    const allRows: unknown[] = [];
    let offset = 0;
    let totalFetched = 0;
    while (true) {
      if (this.maxRows !== undefined && totalFetched >= this.maxRows) break;
      const page = await this.fetchPage(offset);
      allRows.push(...page.rows);
      totalFetched = page.totalFetched ?? totalFetched;
      if (page.nextOffset === undefined) break;
      if (this.maxRows !== undefined && allRows.length >= this.maxRows) {
        allRows.splice(this.maxRows);
        break;
      }
      offset = page.nextOffset;
      if (this.throttleMs > 0) await sleep(this.throttleMs);
    }
    return allRows;
  }
}
