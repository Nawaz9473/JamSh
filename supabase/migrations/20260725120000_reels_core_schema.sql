-- Enable pgvector extension
create extension if not exists vector;

-- 1. User Preferences & Location Metadata
create table if not exists public.user_preferences (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  interests text[] default '{}'::text[] not null,
  preferred_languages text[] default '{"en"}'::text[] not null,
  latitude double precision,
  longitude double precision,
  country_code text,
  updated_at timestamp with time zone default now() not null
);

-- Enable RLS on user_preferences
alter table public.user_preferences enable row level security;

-- 2. Videos & Metadata
create table if not exists public.videos (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  video_url text not null, -- URL to index.m3u8 HLS playlist
  thumbnail_url text not null,
  caption text,
  hashtags text[] default '{}'::text[] not null,
  interests text[] default '{}'::text[] not null,
  visibility text check (visibility in ('public', 'private')) default 'public' not null,
  duration numeric default 0.0 not null,
  embedding vector(1536), -- Vector representing content caption & tags
  width integer,
  height integer,
  view_count integer default 0 not null,
  like_count integer default 0 not null,
  comment_count integer default 0 not null,
  share_count integer default 0 not null,
  save_count integer default 0 not null,
  moderation_status text check (moderation_status in ('pending', 'approved', 'rejected')) default 'approved' not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Enable RLS on videos
alter table public.videos enable row level security;

-- 3. Social Interaction Maps
create table if not exists public.video_likes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  video_id uuid references public.videos(id) on delete cascade not null,
  created_at timestamp with time zone default now() not null,
  constraint unique_user_video_like unique (user_id, video_id)
);
alter table public.video_likes enable row level security;

create table if not exists public.video_comments (
  id uuid default gen_random_uuid() primary key,
  video_id uuid references public.videos(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  parent_id uuid references public.video_comments(id) on delete cascade,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
alter table public.video_comments enable row level security;

create table if not exists public.video_shares (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  video_id uuid references public.videos(id) on delete cascade not null,
  platform text default 'direct' not null,
  created_at timestamp with time zone default now() not null
);
alter table public.video_shares enable row level security;

create table if not exists public.video_saves (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  video_id uuid references public.videos(id) on delete cascade not null,
  created_at timestamp with time zone default now() not null,
  constraint unique_user_video_save unique (user_id, video_id)
);
alter table public.video_saves enable row level security;

-- 4. User Filtering & Block Lists
create table if not exists public.blocked_users (
  blocker_id uuid references public.profiles(id) on delete cascade not null,
  blocked_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default now() not null,
  primary key (blocker_id, blocked_id)
);
alter table public.blocked_users enable row level security;

create table if not exists public.hidden_videos (
  user_id uuid references public.profiles(id) on delete cascade not null,
  video_id uuid references public.videos(id) on delete cascade not null,
  created_at timestamp with time zone default now() not null,
  primary key (user_id, video_id)
);
alter table public.hidden_videos enable row level security;

create table if not exists public.muted_creators (
  user_id uuid references public.profiles(id) on delete cascade not null,
  creator_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default now() not null,
  primary key (user_id, creator_id)
);
alter table public.muted_creators enable row level security;

-- 5. Analytics & Views History
create table if not exists public.video_views (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  video_id uuid references public.videos(id) on delete cascade not null,
  duration_watched numeric default 0.0 not null,
  percentage_watched numeric default 0.0 not null,
  is_replay boolean default false not null,
  created_at timestamp with time zone default now() not null
);
alter table public.video_views enable row level security;

create table if not exists public.watch_history (
  user_id uuid references public.profiles(id) on delete cascade not null,
  video_id uuid references public.videos(id) on delete cascade not null,
  completed boolean default false not null,
  watch_count integer default 1 not null,
  last_watched_at timestamp with time zone default now() not null,
  primary key (user_id, video_id)
);
alter table public.watch_history enable row level security;

create table if not exists public.video_interactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  video_id uuid references public.videos(id) on delete cascade not null,
  interaction_type text check (interaction_type in ('watch', 'like', 'share', 'save', 'comment', 'skip', 'report', 'hide', 'not_interested')) not null,
  score_weight integer default 0 not null,
  created_at timestamp with time zone default now() not null
);
alter table public.video_interactions enable row level security;

-- Creator stats (Aggregates)
create table if not exists public.creator_stats (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  total_videos integer default 0 not null,
  total_views bigint default 0 not null,
  total_likes bigint default 0 not null,
  updated_at timestamp with time zone default now() not null
);
alter table public.creator_stats enable row level security;

-- Configurable feed weights configuration
create table if not exists public.feed_config (
  key text primary key,
  value jsonb not null
);

insert into public.feed_config (key, value) values
('interaction_weights', '{
  "watch_100": 20,
  "replay": 30,
  "like": 25,
  "share": 40,
  "save": 35,
  "skip": -30,
  "report": -100,
  "not_interested": -50
}'::jsonb)
on conflict (key) do update set value = excluded.value;

-- Add video_id to the core reports moderation table
alter table public.reports add column if not exists video_id uuid references public.videos(id) on delete cascade;

-- ----------------------------------------------------
-- TRIGGERS & denormalization updates
-- ----------------------------------------------------

-- Auto-initialize creator_stats and user_preferences on profile changes
create or replace function public.handle_new_creator_stats()
returns trigger as $$
begin
  insert into public.creator_stats (user_id) values (new.id)
  on conflict (user_id) do nothing;
  
  insert into public.user_preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;
  
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_profile_created_reels
  after insert on public.profiles
  for each row execute procedure public.handle_new_creator_stats();

-- Populate existing profiles in creator_stats / user_preferences
insert into public.creator_stats (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

insert into public.user_preferences (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

-- Aggregate increments for Video Likes/Unlikes
create or replace function public.handle_video_like_change()
returns trigger as $$
begin
  if (TG_OP = 'INSERT') then
    update public.videos set like_count = like_count + 1 where id = new.video_id;
    update public.creator_stats set total_likes = total_likes + 1 
      where user_id = (select user_id from public.videos where id = new.video_id);
  elsif (TG_OP = 'DELETE') then
    update public.videos set like_count = greatest(0, like_count - 1) where id = old.video_id;
    update public.creator_stats set total_likes = greatest(0, total_likes - 1) 
      where user_id = (select user_id from public.videos where id = old.video_id);
  end if;
  return null;
end;
$$ language plpgsql security definer;

create or replace trigger on_video_like_changed
  after insert or delete on public.video_likes
  for each row execute procedure public.handle_video_like_change();

-- Aggregate increments for Video Views
create or replace function public.handle_video_view_change()
returns trigger as $$
begin
  if (TG_OP = 'INSERT') then
    update public.videos set view_count = view_count + 1 where id = new.video_id;
    update public.creator_stats set total_views = total_views + 1 
      where user_id = (select user_id from public.videos where id = new.video_id);
  end if;
  return null;
end;
$$ language plpgsql security definer;

create or replace trigger on_video_view_inserted
  after insert on public.video_views
  for each row execute procedure public.handle_video_view_change();

-- ----------------------------------------------------
-- ROW-LEVEL SECURITY POLICIES (RLS)
-- ----------------------------------------------------

-- User Preferences: Owners read/write
create policy "Allow owners read/write preferences" on public.user_preferences
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Videos policies
create policy "Allow video views on public videos" on public.videos
  for select using (
    visibility = 'public' and moderation_status = 'approved'
  );

create policy "Allow owners full access to own videos" on public.videos
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Likes policies
create policy "Allow read on video likes" on public.video_likes
  for select using (true);

create policy "Allow authenticated user to insert likes" on public.video_likes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Allow authenticated user to delete likes" on public.video_likes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Comments policies
create policy "Allow read on video comments" on public.video_comments
  for select using (true);

create policy "Allow authenticated user to comment" on public.video_comments
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Allow owners to delete comments" on public.video_comments
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Block lists policies
create policy "Allow users to read their own blocks" on public.blocked_users
  for select to authenticated
  using ((select auth.uid()) = blocker_id);

create policy "Allow users to manage blocks" on public.blocked_users
  for all to authenticated
  using ((select auth.uid()) = blocker_id)
  with check ((select auth.uid()) = blocker_id);

-- Mute lists policies
create policy "Allow users to manage muted creators" on public.muted_creators
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Hide video lists policies
create policy "Allow users to manage hidden videos" on public.hidden_videos
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Views & interaction logging policies (authenticated inserts only, no reads from public)
create policy "Allow users to log interactions" on public.video_interactions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Allow users to read their own interactions" on public.video_interactions
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Allow users to insert views" on public.video_views
  for insert to authenticated
  with check ((select auth.uid()) = user_id or user_id is null);

create policy "Allow users to upsert watch history" on public.watch_history
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Creator stats: Public read, no inserts/updates directly
create policy "Allow public read on creator stats" on public.creator_stats
  for select using (true);

-- ----------------------------------------------------
-- PERFORMANCE OPTIMIZED INDEXES
-- ----------------------------------------------------
create index if not exists idx_videos_visibility_status on public.videos(visibility, moderation_status);
create index if not exists idx_videos_created_at on public.videos(created_at desc);
create index if not exists idx_video_likes_video_id on public.video_likes(video_id);
create index if not exists idx_video_likes_user_video on public.video_likes(user_id, video_id);
create index if not exists idx_video_views_user_video on public.video_views(user_id, video_id);
create index if not exists idx_watch_history_completed on public.watch_history(user_id) where completed = false;
create index if not exists idx_video_interactions_user_type on public.video_interactions(user_id, interaction_type);
create index if not exists idx_video_comments_video_id on public.video_comments(video_id);

-- ----------------------------------------------------
-- SCORING RECOMMENDATIONS STORED PROCEDURE (RPC)
-- ----------------------------------------------------
create or replace function public.generate_reels_feed_scored(
  p_user_id uuid,
  p_limit integer,
  p_cursor_timestamp timestamp with time zone,
  p_cursor_id uuid
)
returns table (
  video_record jsonb,
  final_score numeric
)
language plpgsql
security invoker
as $$
declare
  has_history boolean;
  user_lat double precision;
  user_lng double precision;
  user_langs text[];
  user_interests text[];
begin
  -- 1. Extract context preferences
  select latitude, longitude, preferred_languages, interests
  into user_lat, user_lng, user_langs, user_interests
  from public.user_preferences
  where user_id = p_user_id;

  -- 2. Detect cold start state
  select exists (
    select 1 from public.video_interactions where user_id = p_user_id limit 1
  ) into has_history;

  -- 3. Run Pipeline: Candidates -> Filter -> Rank -> Diversify
  return query
  with candidates as (
    -- SELECT potential videos that fit cursor pagination boundaries
    select 
      v.*,
      p.username as creator_username,
      p.display_name as creator_display_name,
      p.avatar_url as creator_avatar_url,
      p.is_verified as creator_is_verified
    from public.videos v
    join public.profiles p on p.id = v.user_id
    where v.visibility = 'public'
      and v.moderation_status = 'approved'
      and (p_cursor_timestamp is null or v.created_at < p_cursor_timestamp or (v.created_at = p_cursor_timestamp and v.id < p_cursor_id))
  ),
  filtered as (
    -- FILTER OUT: Blocked creators, muted channels, hidden videos, and reported contents
    select c.* from candidates c
    where not exists (
      select 1 from public.blocked_users bu 
      where (bu.blocker_id = p_user_id and bu.blocked_id = c.user_id)
         or (bu.blocker_id = c.user_id and bu.blocked_id = p_user_id)
    )
    and not exists (
      select 1 from public.hidden_videos hv where hv.user_id = p_user_id and hv.video_id = c.id
    )
    and not exists (
      select 1 from public.muted_creators mc where mc.user_id = p_user_id and mc.creator_id = c.user_id
    )
    and not exists (
      select 1 from public.reports r where r.reporter_id = p_user_id and r.video_id = c.id
    )
  ),
  scored as (
    -- RANK: Assign scoring calculations
    select 
      f.*,
      coalesce(
        case when has_history = false then
          -- COLD START BLEND: 40% Trending, 30% Local, 20% Interests, 10% Random
          (f.like_count * 0.4) + 
          (case when f.interests && user_interests then 30.0 else 0.0 end) +
          (random() * 10.0)
        else
          -- ENGAGED RECOMMENDATION ENGINE
          -- a) Interest match bonus
          (case when f.interests && user_interests then 50.0 else 0.0 end) +
          -- b) Creator followed bonus
          (case when exists (
            select 1 from public.followers fol 
            where fol.follower_id = p_user_id and fol.following_id = f.user_id and fol.status = 'accepted'
          ) then 30.0 else 0.0 end) +
          -- c) Friends activity boost (liked by people you follow)
          (select coalesce(count(*), 0) * 15.0 from public.video_likes vl
           join public.followers fol on fol.following_id = vl.user_id
           where vl.video_id = f.id and fol.follower_id = p_user_id and fol.status = 'accepted') +
          -- d) Trending Score: decay view counts over time
          (f.like_count * 5.0 + f.share_count * 10.0 - (extract(epoch from (now() - f.created_at)) / 86400.0) * 2.0)
        end,
        0.0
      ) as raw_score
    from filtered f
  ),
  diversified as (
    -- DIVERSITY LAYER: Deduplicate creators in active sequence by penalizing consecutive videos
    select 
      s.*,
      row_number() over (partition by s.user_id order by s.raw_score desc) as creator_seq
    from scored s
  )
  select 
    to_jsonb(d.*) - 'embedding' - 'raw_score' - 'creator_seq' as video_record,
    (d.raw_score - (d.creator_seq - 1) * 25.0)::numeric as final_score
  from diversified d
  order by final_score desc, d.created_at desc
  limit p_limit;
end;
$$;
