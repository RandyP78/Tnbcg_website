-- TEKNIK Compliance Platform — Postgres schema (Netlify DB / Neon; portable to Azure Database for PostgreSQL)
-- Apply with:  psql "$NETLIFY_DATABASE_URL" -f db/schema.sql

create extension if not exists pgcrypto;

-- Client organizations. Auto-created on first agent check-in (keyed by normalized client name).
create table if not exists orgs (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,            -- normalized client name, e.g. "hart-mechanical"
  name          text not null,                   -- display name from the agent's $ClientName
  contact_email text not null,                   -- from the agent's $ClientEmail; used for portal invite
  industry      text,                            -- healthcare | legal | professional | aerospace | trucking | other
  frameworks    text[] not null default '{hipaa,pci}',  -- which frameworks are in scope for this client
  prepared_for  text,                            -- "Prepared for" line override on the report
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Portal users are Netlify Identity users. We keep a mapping so a user can belong to an org.
-- app_metadata.roles: ['admin'] for TEKNIK staff; ['client'] for client users. org_id in app_metadata.org_id.
create table if not exists org_users (
  identity_sub  text primary key,                -- Netlify Identity user id (sub)
  email         text not null,
  org_id        uuid references orgs(id) on delete cascade,
  role          text not null check (role in ('admin','client')),
  invited_at    timestamptz default now(),
  last_login    timestamptz
);

create table if not exists devices (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  hostname      text not null,
  machine_guid  text not null,                   -- HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid
  os_name       text, os_version text, os_build text,
  manufacturer  text, model text, serial text,
  domain_join   text,                            -- workgroup | domain | entra | hybrid
  last_user     text,
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  unique (org_id, machine_guid)
);

create table if not exists scans (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  device_id     uuid not null references devices(id) on delete cascade,
  agent_version text not null,
  catalog_version text not null,
  started_at    timestamptz not null,
  finished_at   timestamptz not null,
  received_at   timestamptz not null default now(),
  ran_as_admin  boolean not null default false,
  summary       jsonb not null default '{}',      -- {pass, fail, warn, error, notApplicable, score}
  raw           jsonb not null                    -- full agent payload (findings + inventory); no PHI content by design
);
create index if not exists scans_device_idx on scans(device_id, received_at desc);
create index if not exists scans_org_idx on scans(org_id, received_at desc);

-- One row per control per scan. status: pass | fail | warn | error | na
create table if not exists findings (
  id            bigserial primary key,
  scan_id       uuid not null references scans(id) on delete cascade,
  device_id     uuid not null references devices(id) on delete cascade,
  org_id        uuid not null references orgs(id) on delete cascade,
  control_id    text not null,
  status        text not null check (status in ('pass','fail','warn','error','na')),
  observed      text,                             -- human-readable observed value
  expected      text,
  detail        jsonb,                            -- structured evidence (lists, values). Redacted at the agent.
  created_at    timestamptz not null default now()
);
create index if not exists findings_scan_idx on findings(scan_id);
create index if not exists findings_org_ctrl_idx on findings(org_id, control_id);

-- Manual questionnaire answers (org-level). One current answer per control; history kept via superseded_at.
create table if not exists answers (
  id            bigserial primary key,
  org_id        uuid not null references orgs(id) on delete cascade,
  control_id    text not null,
  answer        text not null check (answer in ('yes','partial','no','na')),
  notes         text,
  answered_by   text not null,                    -- identity sub or email
  answered_at   timestamptz not null default now(),
  superseded_at timestamptz
);
create index if not exists answers_current_idx on answers(org_id, control_id) where superseded_at is null;

-- N/A & manual overrides. Scope: org-wide or a single device. Applies to automated and manual controls.
-- Client users may set 'na' with justification (flagged pending); admins may set 'na' | 'pass' | 'fail' and approve.
create table if not exists overrides (
  id            bigserial primary key,
  org_id        uuid not null references orgs(id) on delete cascade,
  device_id     uuid references devices(id) on delete cascade,   -- null = org-wide
  control_id    text not null,
  status        text not null check (status in ('na','pass','fail')),
  justification text not null,
  set_by        text not null,
  set_by_role   text not null check (set_by_role in ('admin','client')),
  approved      boolean not null default false,   -- client-set overrides need admin approval to count
  approved_by   text,
  expires_at    timestamptz,                      -- optional re-review date
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);
create index if not exists overrides_active_idx on overrides(org_id, control_id) where revoked_at is null;

-- Evidence files live in Netlify Blobs (store "evidence", key = org_id/<uuid>). This is the index.
create table if not exists evidence (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  device_id     uuid references devices(id) on delete set null,
  scan_id       uuid references scans(id) on delete set null,
  control_id    text not null,
  source        text not null check (source in ('agent','client','admin')),
  filename      text not null,
  content_type  text not null,
  size_bytes    bigint not null,
  sha256        text not null,
  blob_key      text not null,
  description   text,
  uploaded_by   text not null,
  uploaded_at   timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists evidence_org_ctrl_idx on evidence(org_id, control_id) where deleted_at is null;

-- Generated reports (snapshot of computed score + narrative so the PDF/HTML is reproducible).
create table if not exists reports (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  generated_by  text not null,
  generated_at  timestamptz not null default now(),
  catalog_version text not null,
  score         jsonb not null,                   -- output of lib/scoring.js
  narrative     text,                             -- optional Claude-generated executive summary
  narrative_model text,
  narrative_tokens jsonb                          -- {input, output} for cost tracking
);

-- Immutable audit trail of portal actions (who changed what). Required for 'government grade' defensibility.
create table if not exists audit_log (
  id            bigserial primary key,
  at            timestamptz not null default now(),
  actor         text not null,
  actor_role    text,
  org_id        uuid,
  action        text not null,                    -- e.g. override.create, answer.set, evidence.upload, report.generate
  target        text,
  detail        jsonb,
  ip            text
);
create index if not exists audit_org_idx on audit_log(org_id, at desc);

-- Convenience view: latest scan per device
create or replace view latest_scans as
select distinct on (device_id) * from scans order by device_id, received_at desc;
