-- Run this in the Supabase SQL editor (Project > SQL Editor > New query).
-- Safe to re-run: every statement uses "if not exists".

create table if not exists strava_tokens (
  id bigint primary key generated always as identity,
  athlete_id bigint unique not null,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table strava_tokens enable row level security;

-- Stores your full synced Strava activity history.
-- id is Strava's own activity id, so re-syncing just updates existing rows.
create table if not exists activities (
  id bigint primary key,
  athlete_id bigint not null references strava_tokens (athlete_id) on delete cascade,
  name text,
  type text,
  distance real,
  moving_time integer,
  elapsed_time integer,
  total_elevation_gain real,
  start_date timestamptz,
  average_heartrate real,
  max_heartrate real,
  average_speed real,
  synced_at timestamptz default now()
);

create index if not exists activities_athlete_date_idx
  on activities (athlete_id, start_date desc);

alter table activities enable row level security;

-- Both tables use RLS with no policies defined. That's intentional: the
-- backend functions authenticate with the service_role key, which bypasses
-- RLS entirely. Never expose either table via the anon/public key.
