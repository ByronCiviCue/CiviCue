CREATE TABLE IF NOT EXISTS socrata_hosts(
  host text primary key,
  region text not null,
  last_seen timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS socrata_domains(
  domain text primary key,
  country text,
  region text not null,
  last_seen timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS socrata_agencies(
  host text not null,
  name text not null,
  type text,
  primary key(host, name)
);
