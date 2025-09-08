// Reusable discovery pruning helpers for catalog payloads
// Input shape aligns with scripts/build-datasf-index.mjs normalized output

export type DatasetRecord = {
  id: string;
  name: string | null;
  type: string | null;
  domain: string;
  permalink: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  tags: string[];
  categories: string[];
  owner: string | null;
  license: string | null;
  retention?: { normalizedSince: string; normalizedUntil: string; filter: string };
};

export type CatalogPayload = {
  schemaVersion?: number;
  source?: string;
  domain?: string;
  generatedAt?: string;
  retention?: { since: string; until: string };
  totalCount?: number;
  datasets: DatasetRecord[];
};

export type DropEntry = { id: string; name: string; reason: string };

export type KeepMeta = {
  reasonsKept: string[];
  priorityScore: number;
  components: Record<string, number>;
  categories: string[];
  retention: string;
};

export type KeptRecord = DatasetRecord & { _prune: KeepMeta };

export type PruneResult = {
  kept: KeptRecord[];
  dropped: DropEntry[];
};

export type PruneOptions = {
  // Category retention overrides (months); use 'current+previous' semantics for boundary-like categories via boundaryKeepTwo = true
  retentionMonths?: Partial<Record<'safety'|'housing'|'finance'|'transit'|'governance'|'boundaries'|'infrastructure', number>>;
  boundaryKeepTwo?: boolean;
  minScore?: number; // default 60
  trustedOwners?: RegExp[];
  domainHint?: string; // e.g., data.sfgov.org
};

function parseISODate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthsBetween(a: Date, b: Date): number {
  const years = b.getFullYear() - a.getFullYear();
  const months = years * 12 + (b.getMonth() - a.getMonth());
  return months + (b.getDate() - a.getDate()) / 30;
}

const CAT_KEYWORDS: Record<string, RegExp[]> = {
  governance: [/ethic/i, /lobby/i, /campaign/i, /election/i, /contract/i, /procure/i, /budget/i, /finance/i, /compliance/i],
  housing: [/permit/i, /housing/i, /rent/i, /evict/i, /parcel/i, /apn/i, /land\s*use/i, /zoning/i, /planning/i],
  safety: [/311/i, /incident/i, /crime/i, /police/i, /fire/i, /emergency/i, /calls?/i],
  infrastructure: [/street/i, /public works/i, /utility/i, /sewer/i, /water/i, /paving/i, /tree/i, /sidewalk/i],
  finance: [/budget/i, /spend/i, /payroll/i, /vendor/i, /checkbook/i, /revenue/i, /tax/i],
  transit: [/transit/i, /muni/i, /sfmta|mta/i, /bart/i, /sfo\b/i, /airport/i, /bus/i, /rail/i, /bike/i],
  boundaries: [/boundary/i, /zoning/i, /district/i, /tract/i, /block/i, /neighborhood/i, /supervisor/i]
};

const DEFAULT_TRUSTED_OWNERS = [/DataSF/i, /City and County/i, /Planning/i, /Ethics/i, /Controller/i, /Police/i, /SFMTA|MTA/i, /Airport/i];

function classifyRelevance(name?: string | null, categories: string[] = [], tags: string[] = []) {
  const text = [name || '', ...categories, ...tags].join(' ');
  const hits = Object.entries(CAT_KEYWORDS).filter(([_, res]) => res.some((r) => r.test(text)));
  const cats = hits.map(([k]) => k);
  if (cats.length === 0) return { cats: [] as string[], relevance: 0 };
  const relevance = Math.min(100, 40 + cats.length * 20);
  return { cats, relevance };
}

function isArchivedLike(name?: string | null, tags: string[] = []) {
  const text = [name || '', ...tags].join(' ');
  return /archive|archiv|deprecated|retired|superseded/i.test(text);
}

function isGlobalIrrelevant(name?: string | null, categories: string[] = [], tags: string[] = []) {
  const text = [name || '', ...categories, ...tags].join(' ');
  const globalish = /\b(usa|united states|global|world|california)\b/i.test(text);
  const sfHint = /(san\s*francisco|\bsf\b|sfgov|city and county)/i.test(text);
  return globalish && !sfHint;
}

function ownerTrustScore(owner?: string | null, trusted: RegExp[] = DEFAULT_TRUSTED_OWNERS) {
  if (!owner) return 20;
  if (trusted.some((re) => re.test(owner))) return 100;
  if (owner.trim().length > 0) return 70;
  return 20;
}

function joinabilityScore(name?: string | null, tags: string[] = []) {
  const text = [name || '', ...tags].join(' ');
  const joinKeys = [/\b(apn|parcel|block|lot|block\s*lot|case|permit|incident|neighborhood|tract|district)\b/i];
  return joinKeys.some((r) => r.test(text)) ? 100 : 60;
}

function cadenceScore(name?: string | null, categories: string[] = [], tags: string[] = []) {
  const text = [name || '', ...categories, ...tags].join(' ');
  if (/(311|crime|incident|calls?|service request)/i.test(text)) return 100;
  if (/(permit|inspection|transit|muni|sfo|airport)/i.test(text)) return 85;
  if (/(budget|finance|ethics|lobby)/i.test(text)) return 70;
  return 50;
}

function sizeSanityScore(name?: string | null) {
  const text = (name || '');
  if (/summary|aggregate|rollup/i.test(text)) return 100;
  if (/all time|all records/i.test(text)) return 40;
  return 70;
}

function freshnessScore(updatedAt?: string | null) {
  if (!updatedAt) return 30;
  const now = new Date();
  const d = parseISODate(updatedAt);
  if (!d) return 30;
  const m = monthsBetween(d, now);
  if (m <= 6) return 100;
  if (m <= 12) return 85;
  if (m <= 36) return 70;
  if (m <= 60) return 55;
  if (m <= 120) return 40;
  return 20;
}

function relevanceAllowed(cats: string[]) {
  const allowed = new Set(['governance', 'housing', 'safety', 'infrastructure', 'finance', 'transit', 'boundaries']);
  return cats.some((c) => allowed.has(c));
}

function categoryRetention(cats: string[]) {
  if (cats.includes('safety') || (cats.includes('governance') && /311/i.test(cats.join(',')))) return '36m';
  if (cats.includes('housing')) return '10y';
  if (cats.includes('finance') || cats.includes('governance')) return '12y';
  if (cats.includes('transit')) return '10y';
  if (cats.includes('boundaries')) return 'current+previous';
  if (cats.includes('infrastructure')) return '5y';
  return 'unspecified';
}

function computeScore(
  { relevance, updatedAt, owner, name, tags, categories }: { relevance: number; updatedAt?: string | null; owner?: string | null; name?: string | null; tags?: string[]; categories?: string[] },
  trusted: RegExp[]
) {
  const freshness = freshnessScore(updatedAt);
  const ownerTrust = ownerTrustScore(owner, trusted);
  const joinability = joinabilityScore(name, tags || []);
  const cadence = cadenceScore(name, categories || [], tags || []);
  const sizeSanity = sizeSanityScore(name);
  const weighted = Math.round(relevance * 3 + freshness * 2 + ownerTrust * 1.5 + joinability * 1.5 + cadence * 1 + sizeSanity * 1);
  const denom = 10; // sum of weights
  const score = Math.round(weighted / denom);
  return { score, components: { relevance, freshness, ownerTrust, joinability, cadence, sizeSanity } };
}

function shouldDropBasic(item: DatasetRecord, domainHint?: string) {
  const reasons: string[] = [];
  const type = (item.type || '').toLowerCase();
  if (type === 'href') reasons.push('type:href');
  if (isArchivedLike(item.name, item.tags)) reasons.push('archived/deprecated');
  if (isGlobalIrrelevant(item.name, item.categories, item.tags)) reasons.push('global/irrelevant');
  // If domainHint is provided, ensure alignment
  if (domainHint && item.domain && item.domain !== domainHint) {
    // keep cross-domain if trusted owner; drop otherwise is too strict for generic usage — so skip dropping here
  }
  return reasons;
}

function dropArcGisConnectorDupes(items: DatasetRecord[], trusted: RegExp[]) {
  const keyFor = (s?: string | null) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const byKey = new Map<string, DatasetRecord[]>();
  for (const it of items) {
    const k = keyFor(it.name);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(it);
  }
  const dropIds = new Set<string>();
  for (const group of byKey.values()) {
    if (group.length <= 1) continue;
    const hasCurated = group.some((g) => /(datasf|data\.sfgov\.org|open ?data)/i.test(g.domain || '') || trusted.some((re) => re.test(g.owner || '')));
    if (!hasCurated) continue;
    const arcgisLike = group.filter((g) => /arcgis\.com/i.test(g.permalink || ''));
    for (const g of arcgisLike) dropIds.add(g.id);
  }
  return dropIds;
}

export function pruneCatalog(payload: CatalogPayload, opts: PruneOptions = {}): PruneResult {
  const datasets = Array.isArray(payload.datasets) ? payload.datasets : [];
  const now = new Date();
  const minScore = typeof opts.minScore === 'number' ? opts.minScore : 60;
  const trustedOwners = opts.trustedOwners && opts.trustedOwners.length ? opts.trustedOwners : DEFAULT_TRUSTED_OWNERS;
  const arcgisDropIds = dropArcGisConnectorDupes(datasets, trustedOwners);

  const kept: KeptRecord[] = [];
  const dropped: DropEntry[] = [];
  const boundariesIndex = new Map<string, KeptRecord[]>();

  for (const item of datasets) {
    const basic = shouldDropBasic(item, opts.domainHint);
    if (arcgisDropIds.has(item.id)) basic.push('arcgis-connector-duplicate');

    const rel = classifyRelevance(item.name, item.categories, item.tags);
    if (!relevanceAllowed(rel.cats)) basic.push('not-in-target-categories');

    // Staleness threshold by category
    const monthsOld = (() => {
      const d = parseISODate(item.updatedAt);
      return d ? monthsBetween(d, now) : Infinity;
    })();
    const retain = { ...{ safety: 36, housing: 120, finance: 144, transit: 120, governance: 144, infrastructure: 60 }, ...(opts.retentionMonths || {}) };
    const isBoundary = rel.cats.includes('boundaries');
    if (!isBoundary) {
      let threshold = 60; // default 5y
      if (rel.cats.includes('safety')) threshold = Math.min(threshold, retain.safety ?? 36);
      if (rel.cats.includes('housing')) threshold = Math.max(threshold, retain.housing ?? 120);
      if (rel.cats.includes('finance') || rel.cats.includes('governance')) threshold = Math.max(threshold, retain.finance ?? 144);
      if (rel.cats.includes('transit')) threshold = Math.max(threshold, retain.transit ?? 120);
      if (rel.cats.includes('infrastructure')) threshold = Math.min(threshold, retain.infrastructure ?? 60);
      if (monthsOld > threshold) basic.push(`stale>${threshold}m`);
    }

    if (basic.length > 0) {
      dropped.push({ id: item.id, name: item.name || '', reason: basic.join('|') });
      continue;
    }

    const { score, components } = computeScore({
      relevance: rel.relevance,
      updatedAt: item.updatedAt,
      owner: item.owner || undefined,
      name: item.name || undefined,
      tags: item.tags || [],
      categories: item.categories || []
    }, trustedOwners);

    if (score < minScore) {
      dropped.push({ id: item.id, name: item.name || '', reason: `score<${minScore}(${score})` });
      continue;
    }

    const keptItem: KeptRecord = {
      ...item,
      _prune: {
        reasonsKept: ['passed-basic-filters', `score>=${minScore}`],
        priorityScore: score,
        components,
        categories: rel.cats,
        retention: categoryRetention(rel.cats)
      }
    };
    kept.push(keptItem);

    if (rel.cats.includes('boundaries')) {
      const key = (item.categories && item.categories[0]) || 'boundaries';
      if (!boundariesIndex.has(key)) boundariesIndex.set(key, []);
      boundariesIndex.get(key)!.push(keptItem);
    }
  }

  // boundaries: keep latest two per key when boundaryKeepTwo true (default true)
  const keepTwo = opts.boundaryKeepTwo !== false;
  if (keepTwo) {
    for (const [key, arr] of boundariesIndex.entries()) {
      arr.sort((a, b) => {
        const da = parseISODate(a.updatedAt) || new Date(0);
        const db = parseISODate(b.updatedAt) || new Date(0);
        return (db as any) - (da as any);
      });
      const allowed = new Set(arr.slice(0, 2).map((x) => x.id));
      for (const it of arr.slice(2)) {
        if (!allowed.has(it.id)) {
          const idx = kept.findIndex((k) => k.id === it.id);
          if (idx >= 0) {
            kept.splice(idx, 1);
            dropped.push({ id: it.id, name: it.name || '', reason: `boundaries:exceeds-current+previous in ${key}` });
          }
        }
      }
    }
  }

  return { kept, dropped };
}

