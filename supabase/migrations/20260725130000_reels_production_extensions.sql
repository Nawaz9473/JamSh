-- 1. Media Worker Job Queue
create table if not exists public.media_jobs (
  id uuid default gen_random_uuid() primary key,
  video_id uuid, -- links to videos if pre-inserted
  user_id uuid references public.profiles(id) on delete cascade not null,
  raw_video_path text not null, -- path in reels-ingest bucket
  status text check (status in ('queued', 'processing', 'completed', 'failed')) default 'queued' not null,
  attempts integer default 0 not null,
  max_attempts integer default 3 not null,
  error_log text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Enable RLS
alter table public.media_jobs enable row level security;

-- RLS policies for Job Queue (authenticated users can only view their own jobs)
create policy "Allow owners to view own media jobs" on public.media_jobs
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- 2. Feed & Recommendation Cache Table
create table if not exists public.feed_cache (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  cached_video_ids uuid[] default '{}'::uuid[] not null,
  generated_at timestamp with time zone default now() not null
);

-- Enable RLS
alter table public.feed_cache enable row level security;

-- RLS policies for Feed Cache (users can only read their own feed cache)
create policy "Allow owners to read their own feed cache" on public.feed_cache
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- 3. Production Reels Performance & Analytics Log
create table if not exists public.reels_analytics (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  video_id uuid references public.videos(id) on delete cascade not null,
  event_type text check (event_type in (
    'video_start', 'video_complete', 'average_watch', 'replay',
    'click_through', 'buffering_delay', 'startup_time', 'latency_alert'
  )) not null,
  duration_millis integer default 0,
  extra_metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null
);

-- Enable RLS
alter table public.reels_analytics enable row level security;

-- RLS policies for Analytics (inserts allowed by authenticated users, no public reads)
create policy "Allow authenticated users to insert analytics logs" on public.reels_analytics
  for insert to authenticated
  with check ((select auth.uid()) = user_id or user_id is null);

create policy "Allow users to read their own analytics logs" on public.reels_analytics
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ----------------------------------------------------
-- PERFORMANCE OPTIMIZED INDEXES
-- ----------------------------------------------------
create index if not exists idx_media_jobs_status on public.media_jobs(status) where status = 'queued';
create index if not exists idx_reels_analytics_video_event on public.reels_analytics(video_id, event_type);
create index if not exists idx_feed_cache_generated_at on public.feed_cache(generated_at desc);

-- ----------------------------------------------------
-- JOB QUEUE CONCURRENCY PROCESSOR (RPC)
-- ----------------------------------------------------
create or replace function public.claim_next_media_job(p_worker_id text)
returns table (
  id uuid,
  video_id uuid,
  user_id uuid,
  raw_video_path text,
  status text,
  attempts integer,
  max_attempts integer,
  metadata jsonb
)
language plpgsql
security definer
as $$
declare
  target_job_id uuid;
begin
  select j.id into target_job_id
  from public.media_jobs j
  where j.status = 'queued' and j.attempts < j.max_attempts
  order by j.created_at asc
  limit 1
  for update skip locked;

  if target_job_id is not null then
    update public.media_jobs
    set status = 'processing',
        updated_at = now()
    where public.media_jobs.id = target_job_id;

    return query
    select 
      j.id,
      j.video_id,
      j.user_id,
      j.raw_video_path,
      j.status,
      j.attempts,
      j.max_attempts,
      j.metadata
    from public.media_jobs j
    where j.id = target_job_id;
  end if;
end;
$$;
