# Adapters: Universal Contract + Drivers

## Contract (TypeScript)
```ts
export type CatalogItem = {
  id: string;
  name: string;
  description?: string;
  domain: string;      // host or portal
  permalink?: string;
  resourceUrl?: string; // Row access base when obvious
  category?: string | null;
  tags?: string[];
  source: 'socrata' | 'ckan' | 'arcgis';
  layer?: number;      // ArcGIS FeatureServer layer index if needed
};

export type Query = {
  select?: string[];
  where?: string;      // native filter
  orderBy?: string;    // field ASC|DESC
  limit?: number;
  offset?: number;
};

export interface DataPortal {
  listCatalog(opts?: { limit?: number; offset?: number }): Promise<CatalogItem[]>;
  fetchRows(datasetIdOrUrl: string, q?: Query, extra?: Record<string, string | number>): Promise<any[]>;
}
```

## Drivers
- Socrata: Discovery API + SoQL mapping (`$select`, `$where`, `$order`, `$limit`, `$offset`, `X-App-Token`).
- CKAN: `package_search` + `datastore_search` (`X-CKAN-API-Key`, `limit`, `offset`, `sort`).
- ArcGIS: Hub search + FeatureServer query (`where`, `outFields`, `orderByFields`, `resultOffset`, `resultRecordCount`, token or API key).

## Factory
```ts
export type PortalConfig =
  | { kind:'socrata'; host:string; appToken?:string }
  | { kind:'ckan'; base:string; apiKey?:string }
  | { kind:'arcgis'; site:string; token?:string };
```

## Notes
- Keep `where` native; adapters map the rest.
- Unwrap ArcGIS `features[].attributes` to plain rows.
- Store whatever is necessary to fetch rows in `resourceUrl` (and `layer` for ArcGIS).
