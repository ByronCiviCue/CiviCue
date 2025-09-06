-- Enable pgvector extension and define embeddings schema + table
CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS embeddings;

-- 311 embeddings table (contract)
CREATE TABLE IF NOT EXISTS embeddings.emb_311 (
  emb_id BIGSERIAL PRIMARY KEY,
  case_id TEXT NULL,             -- optional FK to core.fact_311(case_id) later
  text TEXT NOT NULL,            -- canonical text to embed/search
  embedding vector(768),         -- adjust dim later if needed
  meta JSONB,
  content_hash TEXT NOT NULL UNIQUE
);

-- Helpful indexes (created now where possible)
CREATE INDEX IF NOT EXISTS emb_311_case_id_idx ON embeddings.emb_311 (case_id);
-- Vector index uses ivfflat; to be created later after data load:
-- CREATE INDEX emb_311_embedding_idx ON embeddings.emb_311 USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Optional full-text GIN for hybrid search may be added later via a generated tsvector column.