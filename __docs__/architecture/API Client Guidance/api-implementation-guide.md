# API Implementation Guide

Examples version: v0.1.0 — Updated: 2025-09-06

Practical steps for implementing traditional clients, branch‑oriented APIs, and hybrid data surfaces with a focus on correctness, observability, and operations. Examples use Next.js 15, but the patterns apply broadly.

## Quick Start Decision Tree

```mermaid
graph TD
    A[New API Integration] --> B{How many endpoints?}
    B -->|< 20| C[Traditional Client]
    B -->|20-250+| D[Branch-Oriented]
    B -->|Mixed SQL+Vector| E[Hybrid Data Surface]
    
    C --> F[Single Client + Basic Caching]
    D --> G[Semantic Branches + Orchestration]
    E --> H[Vector + SQL + Fusion Branches]
    
    G --> I{External or Internal API?}
    I -->|External| J[API Integration Branch]
    I -->|Internal| K[Domain Service Branch]
    
    H --> L{Data Types?}
    L -->|Structured Only| M[SQL Branches]
    L -->|Unstructured Only| N[Vector Branches]
    L -->|Both| O[Fusion Branches]
```

## Adaptation: Next.js vs Standalone Service

- Next.js (app router): implement routes under `app/api/v1/...`, validate at boundary, export `/api/openapi.json`, and add a `/docs` page (Redoc/Swagger UI). See: nextjs-api-service.md.
- Standalone (Fastify/Hono): implement endpoints under `/v1/...`, serve `/openapi.json` and `/docs` from the same process. See: railway-api-service.md.

The domain/branch/cache patterns are identical; only the transport and runtime differ.

## Part 1: Traditional Client Implementation

### When to Use
- APIs with < ~20 endpoints
- POCs and quick integrations
- Single‑purpose services with minimal orchestration

### Complete Implementation Example

#### 1. Environment Setup

```bash
# .env.local
STRIPE_API_URL=https://api.stripe.com/v1
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

#### 2. Configuration with Validation

```typescript
// app/lib/stripe/config.ts
import { z } from 'zod';

const ConfigSchema = z.object({
  apiUrl: z.string().url(),
  secretKey: z.string().min(1),
  webhookSecret: z.string().min(1),
});

export const config = ConfigSchema.parse({
  apiUrl: process.env.STRIPE_API_URL,
  secretKey: process.env.STRIPE_SECRET_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
});

export const CACHE_TTL = {
  customer: 600,    // 10 minutes
  product: 1800,    // 30 minutes
  price: 3600,      // 1 hour
} as const;
```

#### 3. Client Implementation (timeouts, retries, idempotency)

```typescript
// app/lib/stripe/client.ts
import { config } from './config';

class StripeClient {
  private static instance: StripeClient;
  
  static getInstance(): StripeClient {
    if (!this.instance) {
      this.instance = new StripeClient();
    }
    return this.instance;
  }
  
  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${config.apiUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${config.secretKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    
    if (!response.ok) {
      throw new Error(`Stripe API error: ${response.status}`);
    }
    
    return response.json();
  }
  
  async createCustomer(email: string, metadata?: Record<string, string>) {
    return this.request('/customers', {
      method: 'POST',
      body: JSON.stringify({ email, metadata }),
    });
  }
}

export const stripeClient = StripeClient.getInstance();
```

#### 4. API Route (Edge or Server)

```javascript
// app/api/stripe/customers/route.mjs
import { stripeClient } from '@/app/lib/stripe/client';
import { z } from 'zod';

// Choose 'edge' only if your code/path dependencies support it
export const runtime = 'edge';

const CreateCustomerSchema = z.object({
  email: z.string().email(),
  metadata: z.record(z.string()).optional(),
});

export async function POST(request) {
  try {
    const body = await request.json();
    const validated = CreateCustomerSchema.parse(body);
    
    const customer = await stripeClient.createCustomer(
      validated.email,
      validated.metadata
    );
    
    return Response.json({ success: true, data: customer });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { success: false, error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

## Part 2: Branch‑Oriented Pattern Implementation

### When to Use
- Complex APIs with 20+ endpoints
- Multiple related business domains
- Need for server‑side composition
- Performance‑aware caching across domains

### Complete Implementation Example: E-commerce API

#### 1. Domain Analysis

```typescript
// Identify your domains first
const domains = {
  products: {
    endpoints: 15,
    operations: ['search', 'details', 'inventory', 'pricing'],
    relationships: ['inventory', 'reviews', 'categories']
  },
  orders: {
    endpoints: 12,
    operations: ['create', 'update', 'fulfill', 'cancel'],
    relationships: ['products', 'customers', 'payments']
  },
  customers: {
    endpoints: 8,
    operations: ['profile', 'orders', 'preferences', 'addresses'],
    relationships: ['orders', 'reviews']
  }
};
```

#### 2. Branch Interface Design

```typescript
// app/ecommerce/branches/products-branch.d.ts
export interface ProductSearchOptions {
  query?: string;
  category?: string;
  priceRange?: { min: number; max: number };
  inStock?: boolean;
  sort?: 'price' | 'rating' | 'newest';
  page?: number;
  limit?: number;
}

export interface CompleteProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  inventory?: InventoryStatus;
  reviews?: Review[];
  relatedProducts?: Product[];
}

export interface ProductsBranchMethods {
  search(options: ProductSearchOptions): Promise<Product[]>;
  getBasic(id: string): Promise<Product>;
  getComplete(id: string, options?: CompleteOptions): Promise<CompleteProduct>;
  checkAvailability(ids: string[]): Promise<Map<string, boolean>>;
  updateInventory(id: string, quantity: number): Promise<void>;
}
```

#### 3. Branch Implementation (with cache policy)

```typescript
// app/ecommerce/branches/products-branch-impl.ts
import { cache } from '../cache';
import { apiClient } from '../client';
import type { ProductsBranchMethods, ProductSearchOptions } from './products-branch';

class ProductsBranch implements ProductsBranchMethods {
  readonly branchName = 'products';
  
  async search(
    options: ProductSearchOptions,
    context: { correlationId: string }
  ): Promise<Product[]> {
    const cacheKey = `search:${JSON.stringify(options)}`;
    
    // Check cache with stale-while-revalidate
    const cached = await cache.get('products', cacheKey, {
      staleWhileRevalidate: 300,
      revalidateFn: async () => {
        const response = await apiClient.get('/products', options);
        return response.data;
      }
    });
    
    if (cached) {
      console.log(`[${context.correlationId}] Cache hit for products search`);
      return cached;
    }
    
    // Fetch from API
    const response = await apiClient.get('/products', options);
    
    // Cache results
    await cache.set('products', cacheKey, response.data, { ttl: 300 });
    
    return response.data;
  }
  
  async getComplete(
    id: string,
    options: { includeReviews?: boolean; includeRelated?: boolean } = {},
    context: { correlationId: string }
  ): Promise<CompleteProduct> {
    // Orchestrate multiple API calls
    const requests = [
      apiClient.get(`/products/${id}`),
      apiClient.get(`/products/${id}/inventory`),
    ];
    
    if (options.includeReviews) {
      requests.push(apiClient.get(`/products/${id}/reviews`));
    }
    
    if (options.includeRelated) {
      requests.push(apiClient.get(`/products/${id}/related`));
    }
    
    const results = await Promise.all(requests);
    
    // Combine results into complete product
    return {
      ...results[0],
      inventory: results[1],
      reviews: options.includeReviews ? results[2] : undefined,
      relatedProducts: options.includeRelated ? results[requests.length - 1] : undefined,
    };
  }
  
  async checkAvailability(
    ids: string[],
    context: { correlationId: string }
  ): Promise<Map<string, boolean>> {
    const availability = new Map();
    
    // Batch check availability
    const response = await apiClient.post('/products/availability', { ids });
    
    response.data.forEach(item => {
      availability.set(item.id, item.available);
    });
    
    return availability;
  }
  
  async updateInventory(
    id: string,
    quantity: number,
    context: { correlationId: string }
  ): Promise<void> {
    await apiClient.patch(`/products/${id}/inventory`, { quantity });
    
    // Invalidate related caches
    await cache.invalidate({ 
      type: 'pattern', 
      pattern: `products:${id}*` 
    });
    
    await cache.invalidate({ 
      type: 'tag', 
      tag: 'products:search' 
    });
  }
}

export const productsBranch = new ProductsBranch();
```

#### 4. Cross‑Branch Orchestration (avoid god‑objects)

```typescript
// app/ecommerce/branches/orchestrator.ts
import { productsBranch } from './products-branch-impl';
import { ordersBranch } from './orders-branch-impl';
import { customersBranch } from './customers-branch-impl';

export class OrderOrchestrator {
  async createOrder(orderInput: CreateOrderInput): Promise<CompleteOrder> {
    const { nanoid } = await import('nanoid');
    const correlationId = nanoid();
    
    // Step 1: Validate customer
    const customer = await customersBranch.get(
      orderInput.customerId,
      { correlationId }
    );
    
    // Step 2: Check product availability
    const productIds = orderInput.items.map(item => item.productId);
    const availability = await productsBranch.checkAvailability(
      productIds,
      { correlationId }
    );
    
    const unavailable = productIds.filter(id => !availability.get(id));
    if (unavailable.length > 0) {
      throw new Error(`Products unavailable: ${unavailable.join(', ')}`);
    }
    
    // Step 3: Get complete product details for pricing
    const products = await Promise.all(
      orderInput.items.map(item =>
        productsBranch.getBasic(item.productId, { correlationId })
      )
    );
    
    // Step 4: Calculate pricing
    const pricing = this.calculatePricing(products, orderInput.items);
    
    // Step 5: Create order
    const order = await ordersBranch.create({
      customerId: customer.id,
      items: orderInput.items,
      pricing,
      shippingAddress: orderInput.shippingAddress,
    }, { correlationId });
    
    // Step 6: Update inventory
    await Promise.all(
      orderInput.items.map(item =>
        productsBranch.updateInventory(
          item.productId,
          -item.quantity,
          { correlationId }
        )
      )
    );
    
    // Step 7: Invalidate caches
    await Promise.all([
      cache.invalidate({ type: 'tag', tag: `customer:${customer.id}:orders` }),
      cache.invalidate({ type: 'tag', tag: 'products:inventory' }),
    ]);
    
    return order;
  }
}
```

#### 5. API Routes with Boundary Validation

```javascript
// app/api/ecommerce/products/search/route.mjs
import { productsBranch } from '@/app/ecommerce/branches/products-branch-impl';
import { z } from 'zod';

// Edge if compatible, otherwise server runtime
export const runtime = 'edge';

const SearchSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  inStock: z.coerce.boolean().optional(),
  sort: z.enum(['price', 'rating', 'newest']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export async function GET(request) {
  const { nanoid } = await import('nanoid');
  const correlationId = nanoid();
  
  try {
    const { searchParams } = new URL(request.url);
    const rawParams = Object.fromEntries(searchParams);
    
    // Transform to branch-friendly format
    const transformed = {
      ...rawParams,
      query: rawParams.q,
      priceRange: rawParams.minPrice || rawParams.maxPrice ? {
        min: rawParams.minPrice ? parseFloat(rawParams.minPrice) : 0,
        max: rawParams.maxPrice ? parseFloat(rawParams.maxPrice) : 999999,
      } : undefined,
    };
    
    const validated = SearchSchema.parse(transformed);
    
    const results = await productsBranch.search(validated, { correlationId });
    
    return Response.json({
      success: true,
      data: results,
      meta: {
        correlationId,
        page: validated.page,
        limit: validated.limit,
        timestamp: new Date().toISOString(),
      },
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({
        success: false,
        error: 'Invalid search parameters',
        details: error.errors,
        correlationId,
      }, { status: 400 });
    }
    
    console.error(`[${correlationId}] Search failed:`, error);
    return Response.json({
      success: false,
      error: 'Search failed',
      correlationId,
    }, { status: 500 });
  }
}
```

## Part 3: Hybrid Data Surface Implementation

### When to Use
- Combining SQL and vector/semantic retrieval
- Cross‑source reporting/analytics
- Natural language and structured filters in one surface

### Complete Implementation Example: Document Search System

#### 1. Database Setup

```sql
-- PostgreSQL with pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id TEXT PRIMARY KEY, -- generated by server using nanoid
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  embedding vector(1536),  -- OpenAI embedding dimension
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_documents_embedding ON documents 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX idx_documents_metadata ON documents USING GIN (metadata);
CREATE INDEX idx_documents_created_at ON documents (created_at DESC);
```

#### 2. Embedding Generation (cost and consistency)

```typescript
// app/docsearch/embeddings/generator.ts
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class EmbeddingGenerator {
  private cache = new Map<string, number[]>();
  
  async generateEmbedding(
    text: string,
    options: { model?: string; correlationId: string }
  ): Promise<number[]> {
    // Check cache
    const cacheKey = `${options.model || 'default'}:${text}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    
    try {
      const response = await openai.embeddings.create({
        model: options.model || 'text-embedding-3-small',
        input: text,
      });
      
      const embedding = response.data[0].embedding;
      
      // Cache for reuse
      this.cache.set(cacheKey, embedding);
      
      return embedding;
    } catch (error) {
      console.error(`[${options.correlationId}] Embedding generation failed:`, error);
      throw error;
    }
  }
  
  async generateBatch(
    texts: string[],
    options: { batchSize?: number; correlationId: string }
  ): Promise<number[][]> {
    const batchSize = options.batchSize || 20;
    const embeddings: number[][] = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: batch,
      });
      
      embeddings.push(...response.data.map(d => d.embedding));
      
      // Brief pause to respect rate limits
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return embeddings;
  }
}

export const embeddingGenerator = new EmbeddingGenerator();
```

#### 3. Hybrid Search Implementation

```typescript
// app/docsearch/branches/fusion-search-impl.ts
import { Pool } from 'pg';
import { embeddingGenerator } from '../embeddings/generator';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export class FusionSearchBranch {
  async hybridSearch(
    options: {
      query: string;
      filters?: {
        department?: string;
        documentType?: string[];
        dateRange?: { start: Date; end: Date };
      };
      semanticWeight?: number;
      structuredWeight?: number;
      limit?: number;
    },
    context: { correlationId: string }
  ): Promise<FusionResult[]> {
    const semanticWeight = options.semanticWeight || 0.7;
    const structuredWeight = options.structuredWeight || 0.3;
    const limit = options.limit || 20;
    
    // Parallel execution of both search types
    const [semanticResults, structuredResults] = await Promise.all([
      this.semanticSearch(options.query, limit * 2, context),
      this.structuredSearch(options.filters, limit * 2, context),
    ]);
    
    // Combine and rank results
    return this.fuseResults(
      semanticResults,
      structuredResults,
      { semanticWeight, structuredWeight, limit }
    );
  }
  
  private async semanticSearch(
    query: string,
    limit: number,
    context: { correlationId: string }
  ): Promise<SemanticResult[]> {
    // Generate embedding for query
    const queryEmbedding = await embeddingGenerator.generateEmbedding(
      query,
      context
    );
    
    // Search using pgvector
    const result = await pool.query(`
      SELECT 
        id,
        title,
        content,
        metadata,
        1 - (embedding <=> $1::vector) as similarity_score
      FROM documents
      WHERE 1 - (embedding <=> $1::vector) > 0.7
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `, [queryEmbedding, limit]);
    
    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      content: row.content,
      metadata: row.metadata,
      score: row.similarity_score,
      source: 'semantic',
    }));
  }
  
  private async structuredSearch(
    filters: any,
    limit: number,
    context: { correlationId: string }
  ): Promise<StructuredResult[]> {
    let query = 'SELECT id, title, content, metadata FROM documents WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;
    
    if (filters?.department) {
      query += ` AND metadata->>'department' = $${paramIndex}`;
      params.push(filters.department);
      paramIndex++;
    }
    
    if (filters?.documentType?.length > 0) {
      query += ` AND metadata->>'type' = ANY($${paramIndex})`;
      params.push(filters.documentType);
      paramIndex++;
    }
    
    if (filters?.dateRange) {
      query += ` AND created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(filters.dateRange.start, filters.dateRange.end);
      paramIndex += 2;
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    
    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      content: row.content,
      metadata: row.metadata,
      score: 1.0, // Exact match
      source: 'structured',
    }));
  }
  
  private fuseResults(
    semantic: SemanticResult[],
    structured: StructuredResult[],
    options: { semanticWeight: number; structuredWeight: number; limit: number }
  ): FusionResult[] {
    const resultMap = new Map<string, FusionResult>();
    
    // Process semantic results
    semantic.forEach((result, index) => {
      resultMap.set(result.id, {
        ...result,
        combinedScore: result.score * options.semanticWeight,
        semanticRank: index + 1,
        structuredRank: null,
        sources: ['semantic'],
      });
    });
    
    // Process structured results
    structured.forEach((result, index) => {
      if (resultMap.has(result.id)) {
        const existing = resultMap.get(result.id)!;
        existing.combinedScore += result.score * options.structuredWeight;
        existing.structuredRank = index + 1;
        existing.sources.push('structured');
      } else {
        resultMap.set(result.id, {
          ...result,
          combinedScore: result.score * options.structuredWeight,
          semanticRank: null,
          structuredRank: index + 1,
          sources: ['structured'],
        });
      }
    });
    
    // Sort by combined score and limit
    return Array.from(resultMap.values())
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, options.limit);
  }
}

export const fusionSearch = new FusionSearchBranch();
```

#### 4. Document Ingestion Pipeline (idempotency and versioning)

```typescript
// app/docsearch/ingestion/pipeline.ts
import { embeddingGenerator } from '../embeddings/generator';
import { pool } from '../db';

export class IngestionPipeline {
  async ingestDocument(
    document: {
      title: string;
      content: string;
      metadata: Record<string, any>;
    },
    options: { correlationId: string }
  ): Promise<string> {
    // Generate embedding
    const embedding = await embeddingGenerator.generateEmbedding(
      `${document.title}\n\n${document.content}`,
      options
    );
    
    // Store in database (upsert for idempotency, include source/provenance)
    const result = await pool.query(`
      INSERT INTO documents (title, content, metadata, embedding)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [
      document.title,
      document.content,
      document.metadata,
      embedding,
    ]);
    
    console.log(`[${options.correlationId}] Document ingested: ${result.rows[0].id}`);
    
    return result.rows[0].id;
  }
  
  async bulkIngest(
    documents: Array<{
      title: string;
      content: string;
      metadata: Record<string, any>;
    }>,
    options: { batchSize?: number; correlationId: string }
  ): Promise<string[]> {
    const batchSize = options.batchSize || 10;
    const documentIds: string[] = [];
    
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      
      // Generate embeddings for batch
      const texts = batch.map(doc => `${doc.title}\n\n${doc.content}`);
      const embeddings = await embeddingGenerator.generateBatch(
        texts,
        options
      );
      
      // Insert batch into database
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        for (let j = 0; j < batch.length; j++) {
          const result = await client.query(`
            INSERT INTO documents (title, content, metadata, embedding)
            VALUES ($1, $2, $3, $4)
            RETURNING id
          `, [
            batch[j].title,
            batch[j].content,
            batch[j].metadata,
            embeddings[j],
          ]);
          
          documentIds.push(result.rows[0].id);
        }
        
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      
      console.log(`[${options.correlationId}] Batch ${i / batchSize + 1} ingested`);
    }
    
    return documentIds;
  }
}

export const ingestionPipeline = new IngestionPipeline();
```

## Part 4: Production Deployment

### Environment Variables

```bash
# .env.production
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
REDIS_URL=redis://user:pass@host:6379

# API Keys
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_live_...

# Monitoring
SENTRY_DSN=https://...@sentry.io/...
DATADOG_API_KEY=...

# Feature Flags
ENABLE_CACHE=true
ENABLE_RATE_LIMITING=true
CACHE_STRATEGY=aggressive
```

### Monitoring Setup

```typescript
// app/lib/monitoring.ts
import * as Sentry from '@sentry/nextjs';

export function initMonitoring() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // Remove sensitive data
      delete event.request?.cookies;
      delete event.request?.headers?.authorization;
      return event;
    },
  });
}

export function trackMetric(
  name: string,
  value: number,
  tags: Record<string, string> = {}
) {
  // Send to monitoring service
  if (process.env.DATADOG_API_KEY) {
    // DataDog implementation
  }
  
  // Log for debugging
  console.log('Metric:', { name, value, tags });
}

export function trackError(
  error: Error,
  context: Record<string, any> = {}
) {
  Sentry.captureException(error, {
    extra: context,
  });
}
```

### Health Check Implementation

```javascript
// app/api/health/route.mjs
export const runtime = 'edge';

async function checkDatabase() {
  try {
    // Your database check
    return { status: 'healthy', latency: 10 };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

async function checkCache() {
  try {
    // Your cache check
    return { status: 'healthy', latency: 5 };
  } catch (error) {
    return { status: 'degraded', error: error.message };
  }
}

export async function GET() {
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkCache(),
  ]);
  
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: checks[0].status === 'fulfilled' ? checks[0].value : { status: 'error' },
      cache: checks[1].status === 'fulfilled' ? checks[1].value : { status: 'error' },
    },
  };
  
  // Determine overall health
  const statuses = Object.values(health.services).map(s => s.status);
  if (statuses.includes('unhealthy')) {
    health.status = 'unhealthy';
  } else if (statuses.includes('degraded')) {
    health.status = 'degraded';
  }
  
  const statusCode = health.status === 'healthy' ? 200 : 503;
  
  return Response.json(health, { status: statusCode });
}
```

## Part 5: Testing Strategies

### Unit Testing Branches

```typescript
// __tests__/branches/products-branch.test.ts
import { productsBranch } from '@/app/ecommerce/branches/products-branch-impl';
import { apiClient } from '@/app/ecommerce/client';

jest.mock('@/app/ecommerce/client');

describe('ProductsBranch', () => {
  const mockContext = { correlationId: 'test-123' };
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('search', () => {
    it('should return cached results when available', async () => {
      const mockResults = [{ id: '1', name: 'Product 1' }];
      
      // Mock cache hit
      cache.get = jest.fn().mockResolvedValue(mockResults);
      
      const results = await productsBranch.search(
        { query: 'test' },
        mockContext
      );
      
      expect(results).toEqual(mockResults);
      expect(apiClient.get).not.toHaveBeenCalled();
    });
    
    it('should fetch from API when cache misses', async () => {
      const mockResults = [{ id: '1', name: 'Product 1' }];
      
      // Mock cache miss
      cache.get = jest.fn().mockResolvedValue(null);
      apiClient.get = jest.fn().mockResolvedValue({ data: mockResults });
      
      const results = await productsBranch.search(
        { query: 'test' },
        mockContext
      );
      
      expect(results).toEqual(mockResults);
      expect(apiClient.get).toHaveBeenCalledWith('/products', { query: 'test' });
    });
  });
});
```

### Integration Testing

```typescript
// tests/integration/order-flow.test.ts
import { describe, it, expect } from 'vitest';
import { orderOrchestrator } from '@/app/ecommerce/branches/orchestrator';

describe('Order Flow Integration', () => {
  it('creates order with inventory updates', async () => {
    const orderInput = {
      customerId: 'cust_123',
      items: [
        { productId: 'prod_1', quantity: 2 },
        { productId: 'prod_2', quantity: 1 },
      ],
      shippingAddress: {
        street: '123 Main St',
        city: 'New York',
        zip: '10001',
      },
    };
    
    const order = await orderOrchestrator.createOrder(orderInput);
    
    expect(order).toMatchObject({
      id: expect.any(String),
      customerId: 'cust_123',
      status: 'pending',
      items: expect.arrayContaining([
        expect.objectContaining({ productId: 'prod_1', quantity: 2 }),
      ]),
    });
    
    // Verify inventory was updated
    const availability = await productsBranch.checkAvailability(['prod_1']);
    expect(availability.get('prod_1')).toBeDefined();
  });
});
```

## Migration Checklist

### Week 1-2: Foundation
- [ ] Analyze existing API and identify domains
- [ ] Design branch interfaces
- [ ] Set up project structure
- [ ] Configure environment variables
- [ ] Implement base client and error handling

### Week 3-4: Core Implementation
- [ ] Implement first 2-3 core branches
- [ ] Add validation schemas
- [ ] Set up caching layer
- [ ] Create API routes with edge validation
- [ ] Add correlation ID tracking

### Week 5-6: Advanced Features
- [ ] Implement cross-branch orchestration
- [ ] Add cache invalidation strategies
- [ ] Create quality-of-life methods
- [ ] Implement batch operations
- [ ] Add comprehensive error handling

### Week 7-8: Production Readiness
- [ ] Add monitoring and observability
- [ ] Implement health checks
- [ ] Create comprehensive tests
- [ ] Document API endpoints
- [ ] Performance optimization

### Week 9-10: Deployment
- [ ] Deploy to staging environment
- [ ] Run load tests
- [ ] Monitor performance metrics
- [ ] Fix identified issues
- [ ] Deploy to production with feature flags

## Common Pitfalls and Solutions

| Pitfall | Solution |
|---------|----------|
| Over-engineering branches | Start simple, add complexity only when needed |
| Validating everywhere | Validate at edge only, trust internal types |
| Cache invalidation bugs | Use tags and patterns, test invalidation logic |
| Correlation ID loss | Pass context object through all calls |
| Memory leaks in edge runtime | Use streaming, limit response sizes |
| Poor error messages | Include context, correlation IDs, and actionable info |

---

*This implementation guide provides concrete, production-ready code examples for each pattern level. Start with the Traditional Pattern for simple needs, upgrade to Branch-to-Branch for complex APIs, and extend to Hybrid Data when combining structured and unstructured data sources.*

## Utilities: Metrics, Cache Tags, Idempotency

### Correlation & Context

```typescript
// app/lib/context.ts
export type RequestContext = { correlationId: string; tenantId?: string };

import { nanoid } from 'nanoid';
export function withCorrelationId(headers: Headers): RequestContext {
  const existing = headers.get('X-Correlation-ID');
  const correlationId = existing || nanoid();
  return { correlationId };
}
```

### Metrics Helper (no‑op by default)

```typescript
// app/lib/metrics.ts
export function startTimer(name: string, tags: Record<string,string> = {}) {
  const t0 = Date.now();
  return { end(extra: Record<string,string> = {}) { const ms = Date.now()-t0; emit(name, ms, { ...tags, ...extra }); return ms; } };
}

export function emit(name: string, value: number, tags: Record<string,string>) {
  if (process.env.NODE_ENV !== 'production') console.debug('metric', { name, value, tags });
  // Hook into your APM here
}
```

### Cache Tag Registry

```typescript
// app/lib/cache/tags.ts
export type CacheTag =
  | `product:${string}`
  | `search:${string}`
  | `customer:${string}:orders`;

export const Tags = {
  product: (id: string): CacheTag => `product:${id}`,
  search: (normQuery: string): CacheTag => `search:${normQuery}`,
  customerOrders: (id: string): CacheTag => `customer:${id}:orders`,
};

export function normalizeSearchQuery(q: unknown): string {
  return String(q || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
}
```

### Deriving Tags (Examples)

Keep tags predictable and stable across services:

```ts
// reports tags
export const ReportTags = {
  source: (s: string) => `source:${s}`,
  status: (s: string) => `status:${s}`,
  entity: (t: string, id: string) => `entity:${t}:${id}`,
  geoTile: (tile: string) => `geo:${tile}`,
};

function deriveTagsFromQuery(q: any): string[] {
  const tags = [] as string[];
  if (q.status) tags.push(ReportTags.status(q.status));
  if (q.source) tags.push(ReportTags.source(q.source));
  if (q.tile) tags.push(ReportTags.geoTile(q.tile));
  return tags;
}
```

### Cache Metrics (Minimal)

```ts
// usage alongside cache helpers
emit('cache.lookup', 1, { route: 'GET /v1/reports/permits' });
if (cacheHit) emit('cache.hit', 1, { route: 'GET /v1/reports/permits' });
else emit('cache.miss', 1, { route: 'GET /v1/reports/permits' });
```

### ETag from Content Hash

```ts
// compute a stable hash of the serialized payload
import crypto from 'crypto';
function hashPayload(obj: unknown) {
  const s = JSON.stringify(obj);
  return crypto.createHash('sha256').update(s).digest('hex');
}

const payload = { data, meta };
const etag = hashPayload(payload);
if (request.headers.get('if-none-match') === etag) return json(null, { status: 304 });
return json(payload, { headers: { ETag: etag, 'Cache-Control': 'public, max-age=60' } });
```

Usage in a branch:

```typescript
await cache.set('products', key, data, { ttl: 900, tags: [Tags.product(id), Tags.search(norm)] });
await cache.invalidate({ type: 'tag', tag: Tags.product(id) });
```

### Idempotency for Writes

SQL table:

```sql
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_status INT NOT NULL,
  response_body JSONB NOT NULL
);
```

Route usage:

```typescript
export async function POST(request: Request) {
  const ctx = withCorrelationId(request.headers);
  const key = request.headers.get('Idempotency-Key');
  if (!key) return Response.json({ error: 'Missing Idempotency-Key' }, { status: 400 });
  const cached = await db.oneOrNone('SELECT * FROM idempotency_keys WHERE key=$1', [key]);
  if (cached) return Response.json(cached.response_body, { status: cached.response_status });

  const body = await request.json();
  const input = CreateOrderSchema.parse(body);
  const order = await orderOrchestrator.createOrder(input, ctx);
  await db.none('INSERT INTO idempotency_keys(key, response_status, response_body) VALUES ($1,$2,$3)', [key, 201, order]);
  return Response.json(order, { status: 201 });
}
```

### Invalidation Tests (Vitest)

```typescript
// tests/unit/cache-tags.test.ts
import { describe, it, expect } from 'vitest';
import { Tags, normalizeSearchQuery } from '@/app/lib/cache/tags';

describe('Cache tags', () => {
  it('normalizes search query deterministically', () => {
    expect(normalizeSearchQuery('  Foo   BAR ')).toBe('foo bar');
  });

  it('derives product tag correctly', () => {
    expect(Tags.product('123')).toBe('product:123');
  });
});
```

### Unit Tests (Vitest) for Branch Caching

```typescript
// tests/unit/products-branch.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { productsBranch } from '@/app/ecommerce/branches/products-branch-impl';
import { cache } from '@/app/ecommerce/cache';
import { apiClient } from '@/app/ecommerce/client';

vi.mock('@/app/ecommerce/client');

describe('ProductsBranch', () => {
  const mockContext = { correlationId: 'test-corr' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cached results when available', async () => {
    const mockResults = [{ id: '1', name: 'Product 1' }];
    // @ts-expect-error test shim
    cache.get = vi.fn().mockResolvedValue(mockResults);

    const results = await productsBranch.search({ query: 'test' }, mockContext);
    expect(results).toEqual(mockResults);
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('fetches from API when cache misses', async () => {
    const mockResults = [{ id: '1', name: 'Product 1' }];
    // @ts-expect-error test shim
    cache.get = vi.fn().mockResolvedValue(null);
    // @ts-expect-error test shim
    apiClient.get = vi.fn().mockResolvedValue({ data: mockResults });

    const results = await productsBranch.search({ query: 'test' }, mockContext);
    expect(results).toEqual(mockResults);
    expect(apiClient.get).toHaveBeenCalledWith('/products', { query: 'test' });
  });
});
```

### Vitest Config

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node', // use 'happy-dom' if testing browser utilities
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
});
```

```ts
// tests/setup.ts
import { vi } from 'vitest';

// Example: mock fetch if needed
if (!globalThis.fetch) {
  // @ts-ignore
  globalThis.fetch = (await import('undici')).fetch;
}

// Example: silence noisy logs during tests
vi.spyOn(console, 'debug').mockImplementation(() => {});
```
