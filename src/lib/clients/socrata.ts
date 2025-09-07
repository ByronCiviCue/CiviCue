import { socrataFetch, buildSocrataUrl, ensureOk } from '../http/socrata.js';

export type GetRowsOptions = {
  limit?: number;
  select?: string;
  where?: string;
  order?: string;
  offset?: number;
};

export async function healthPing(host: string): Promise<boolean> {
  try {
    const url = buildSocrataUrl(host, '/api/catalog/v1', { limit: 1 });
    const response = await socrataFetch(url.toString());
    if (response.status === 404) {
      return false;
    }
    await ensureOk(response);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      return false;
    }
    throw error;
  }
}

export async function getRows<T = unknown>(
  host: string,
  datasetId: string,
  opts?: GetRowsOptions
): Promise<T[]> {
  const queryParams: Record<string, string | number | undefined> = {};
  
  if (opts?.limit !== undefined) {
    queryParams['$limit'] = opts.limit;
  }
  if (opts?.select !== undefined) {
    queryParams['$select'] = opts.select;
  }
  if (opts?.where !== undefined) {
    queryParams['$where'] = opts.where;
  }
  if (opts?.order !== undefined) {
    queryParams['$order'] = opts.order;
  }
  if (opts?.offset !== undefined) {
    queryParams['$offset'] = opts.offset;
  }

  const url = buildSocrataUrl(host, `/resource/${datasetId}.json`, queryParams);
  const response = await socrataFetch(url.toString());
  const validatedResponse = await ensureOk(response);
  return validatedResponse.json() as Promise<T[]>;
}