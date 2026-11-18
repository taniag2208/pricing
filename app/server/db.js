// Conexión a PostgreSQL y migraciones idempotentes.
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.DATABASE_POOL || (process.env.VERCEL ? 3 : 10)),
  idleTimeoutMillis: 10000,
});

const SCHEMA = `
create table if not exists orgs (
  id text primary key,
  name text not null,
  published boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists users (
  id text primary key,
  email text unique not null,
  name text not null,
  pass text not null,
  role text not null check (role in ('tita_admin','client_admin','analyst','viewer')),
  org_id text references orgs(id) on delete cascade,
  must_change boolean not null default true,
  created_at timestamptz not null default now(),
  last_login timestamptz
);
create table if not exists docs (
  org_id text not null references orgs(id) on delete cascade,
  coll text not null,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (org_id, coll, id)
);
create index if not exists docs_org_updated on docs (org_id, updated_at);
create table if not exists jobs (
  id text primary key,
  org_id text not null references orgs(id) on delete cascade,
  type text not null,
  params jsonb not null default '{}',
  status text not null default 'queued',
  progress jsonb not null default '{}',
  error text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_org on jobs (org_id, created_at desc);
alter table jobs add column if not exists lease_until timestamptz;
create table if not exists audit (
  id bigserial primary key,
  org_id text,
  user_id text,
  action text not null,
  detail jsonb,
  at timestamptz not null default now()
);
create table if not exists ai_usage (
  id bigserial primary key,
  org_id text,
  user_id text,
  kind text,
  model text,
  input_tokens integer,
  output_tokens integer,
  at timestamptz not null default now()
);
alter table orgs add column if not exists kind text not null default 'client';
alter table orgs add column if not exists expires_at timestamptz;
alter table orgs add column if not exists meta jsonb not null default '{}';
create table if not exists quick_runs (
  id bigserial primary key,
  ip text,
  org_id text,
  at timestamptz not null default now()
);
create index if not exists quick_runs_at on quick_runs (at);
create index if not exists ai_usage_user_at on ai_usage (user_id, kind, at);
create table if not exists bench_runs (id bigserial primary key, at timestamptz not null default now(), summary jsonb, results jsonb);
`;

async function migrate() { await pool.query(SCHEMA); }
const q = (text, params) => pool.query(text, params);
module.exports = { pool, q, migrate };
