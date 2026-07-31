-- ----------------------------------------------------
-- JAMSH Database Schema Initializer
-- ----------------------------------------------------

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Profiles Table (Linked to Supabase Auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  display_name text,
  avatar_url text,
  cover_url text,
  bio text,
  website text,
  followers_count integer default 0 not null,
  following_count integer default 0 not null,
  is_private boolean default false not null,
  is_verified boolean default false not null,
  birthday date,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Enable RLS on Profiles
alter table public.profiles enable row level security;

-- 2. Posts Table
create table public.posts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text,
  type text check (type in ('text', 'image', 'video', 'multiple')) not null,
  visibility text check (visibility in ('public', 'private')) default 'public' not null,
  status text check (status in ('draft', 'scheduled', 'published')) default 'published' not null,
  scheduled_for timestamp with time zone,
  thunders_count integer default 0 not null,
  comments_count integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Enable RLS on Posts
alter table public.posts enable row level security;

-- 3. Post Media Table
create table public.post_media (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  media_url text not null,
  media_type text check (media_type in ('image', 'video')) not null,
  position integer default 0 not null,
  created_at timestamp with time zone default now() not null
);

-- Enable RLS on Post Media
alter table public.post_media enable row level security;

-- 4. Comments Table
create table public.comments (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  parent_id uuid references public.comments(id) on delete cascade,
  thunders_count integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Enable RLS on Comments
alter table public.comments enable row level security;

-- 5. Thunder Reactions Table (Replaces Heart/Like System)
create table public.thunder_reactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  created_at timestamp with time zone default now() not null,
  constraint thunder_post_or_comment check (
    (post_id is not null and comment_id is null) or 
    (comment_id is not null and post_id is null)
  ),
  constraint unique_user_post_thunder unique (user_id, post_id),
  constraint unique_user_comment_thunder unique (user_id, comment_id)
);

-- Enable RLS on Thunder Reactions
alter table public.thunder_reactions enable row level security;

-- 6. Followers Table
create table public.followers (
  id uuid default gen_random_uuid() primary key,
  follower_id uuid references public.profiles(id) on delete cascade not null,
  following_id uuid references public.profiles(id) on delete cascade not null,
  status text check (status in ('pending', 'accepted')) default 'accepted' not null,
  created_at timestamp with time zone default now() not null,
  constraint unique_follower_following unique (follower_id, following_id),
  constraint no_self_follow check (follower_id <> following_id)
);

-- Enable RLS on Followers
alter table public.followers enable row level security;

-- 7. Stories Table
create table public.stories (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  media_url text not null,
  media_type text check (media_type in ('image', 'video')) not null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default now() not null
);

-- Enable RLS on Stories
alter table public.stories enable row level security;

-- 8. Story Views Table
create table public.story_views (
  id uuid default gen_random_uuid() primary key,
  story_id uuid references public.stories(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default now() not null,
  constraint unique_story_viewer unique (story_id, user_id)
);

-- Enable RLS on Story Views
alter table public.story_views enable row level security;

-- 9. Story Reactions Table
create table public.story_reactions (
  id uuid default gen_random_uuid() primary key,
  story_id uuid references public.stories(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  reaction_type text not null,
  created_at timestamp with time zone default now() not null
);

-- Enable RLS on Story Reactions
alter table public.story_reactions enable row level security;

-- 10. Chat Rooms Table
create table public.chat_rooms (
  id uuid default gen_random_uuid() primary key,
  name text,
  type text check (type in ('direct', 'group')) not null,
  created_at timestamp with time zone default now() not null
);

-- Enable RLS on Chat Rooms
alter table public.chat_rooms enable row level security;

-- 11. Chat Members Table
create table public.chat_members (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.chat_rooms(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text check (role in ('admin', 'member')) default 'member' not null,
  joined_at timestamp with time zone default now() not null,
  constraint unique_room_member unique (room_id, user_id)
);

-- Enable RLS on Chat Members
alter table public.chat_members enable row level security;

-- 12. Messages Table (Encrypted local payloads)
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.chat_rooms(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  content text not null, -- Stores Base64 ciphertext
  nonce text, -- IV/Nonce for AES-256-GCM decryption
  type text check (type in ('text', 'image', 'video', 'voice', 'document')) default 'text' not null,
  is_encrypted boolean default true not null,
  created_at timestamp with time zone default now() not null
);

-- Enable RLS on Messages
alter table public.messages enable row level security;

-- 13. Message Attachments Table (Encrypted file urls)
create table public.message_attachments (
  id uuid default gen_random_uuid() primary key,
  message_id uuid references public.messages(id) on delete cascade not null,
  file_url text not null,
  file_type text not null,
  file_name text not null,
  file_size integer not null,
  created_at timestamp with time zone default now() not null
);

-- Enable RLS on Message Attachments
alter table public.message_attachments enable row level security;

-- 14. Device Keys Table (Used for End-to-End Encryption key exchanges)
create table public.device_keys (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  device_id text not null,
  identity_key text not null, -- X25519 Public Key
  signed_prekey text not null,
  prekey_signature text not null,
  created_at timestamp with time zone default now() not null,
  constraint unique_device_key unique (user_id, device_id)
);

-- Enable RLS on Device Keys
alter table public.device_keys enable row level security;

-- 15. Live Streams Table
create table public.live_streams (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  stream_key text unique not null,
  status text check (status in ('live', 'ended')) default 'live' not null,
  viewer_count integer default 0 not null,
  started_at timestamp with time zone default now() not null,
  ended_at timestamp with time zone
);

-- Enable RLS on Live Streams
alter table public.live_streams enable row level security;

-- 16. Live Comments Table
create table public.live_comments (
  id uuid default gen_random_uuid() primary key,
  stream_id uuid references public.live_streams(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamp with time zone default now() not null
);

-- Enable RLS on Live Comments
alter table public.live_comments enable row level security;

-- 17. Reports Table (Moderation)
create table public.reports (
  id uuid default gen_random_uuid() primary key,
  reporter_id uuid references public.profiles(id) on delete cascade not null,
  reported_user_id uuid references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  reason text not null,
  status text check (status in ('pending', 'reviewed', 'resolved')) default 'pending' not null,
  created_at timestamp with time zone default now() not null,
  constraint report_target check (
    reported_user_id is not null or 
    post_id is not null or 
    comment_id is not null
  )
);

-- Enable RLS on Reports
alter table public.reports enable row level security;

-- 18. Notifications Table
create table public.notifications (
  id uuid default gen_random_uuid() primary key,
  recipient_id uuid references public.profiles(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  type text check (type in ('thunder', 'comment', 'reply', 'mention', 'follow_request', 'follow_accept', 'story', 'message')) not null,
  data jsonb default '{}'::jsonb not null,
  read_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

-- Enable RLS on Notifications
alter table public.notifications enable row level security;

-- ----------------------------------------------------
-- TRIGGERS & FUNCTIONS
-- ----------------------------------------------------

-- Auto Profile Sync function on signup
create or replace function public.handle_new_user()
returns trigger as $$
declare
  raw_username text;
begin
  -- Generate username from email or default to user_ + shorthand uuid
  raw_username := coalesce(
    new.raw_user_meta_data->>'username',
    split_part(new.email, '@', 1),
    'user_' || substr(new.id::text, 1, 8)
  );
  
  -- Prevent duplicates
  if exists (select 1 from public.profiles where username = raw_username) then
    raw_username := raw_username || substr(new.id::text, 1, 4);
  end if;

  insert into public.profiles (id, username, display_name, avatar_url, birthday)
  values (
    new.id,
    raw_username,
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'avatar_url',
    cast(new.raw_user_meta_data->>'birthday' as date)
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to execute on signup
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper function to sync thunder reaction counts
create or replace function public.handle_thunder_change()
returns trigger as $$
begin
  if (TG_OP = 'INSERT') then
    if (new.post_id is not null) then
      update public.posts set thunders_count = thunders_count + 1 where id = new.post_id;
    elsif (new.comment_id is not null) then
      update public.comments set thunders_count = thunders_count + 1 where id = new.comment_id;
    end if;
  elsif (TG_OP = 'DELETE') then
    if (old.post_id is not null) then
      update public.posts set thunders_count = greatest(0, thunders_count - 1) where id = old.post_id;
    elsif (old.comment_id is not null) then
      update public.comments set thunders_count = greatest(0, thunders_count - 1) where id = old.comment_id;
    end if;
  end if;
  return null;
end;
$$ language plpgsql security definer;

create or replace trigger on_thunder_changed
  after insert or delete on public.thunder_reactions
  for each row execute procedure public.handle_thunder_change();

-- Sync comments count
create or replace function public.handle_comment_change()
returns trigger as $$
begin
  if (TG_OP = 'INSERT') then
    update public.posts set comments_count = comments_count + 1 where id = new.post_id;
  elsif (TG_OP = 'DELETE') then
    update public.posts set comments_count = greatest(0, comments_count - 1) where id = old.post_id;
  end if;
  return null;
end;
$$ language plpgsql security definer;

create or replace trigger on_comment_changed
  after insert or delete on public.comments
  for each row execute procedure public.handle_comment_change();

-- Sync followers and following count
create or replace function public.handle_follower_change()
returns trigger as $$
begin
  if (TG_OP = 'INSERT' and new.status = 'accepted') then
    update public.profiles set followers_count = followers_count + 1 where id = new.following_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
  elsif (TG_OP = 'UPDATE' and new.status = 'accepted' and old.status = 'pending') then
    update public.profiles set followers_count = followers_count + 1 where id = new.following_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
  elsif (TG_OP = 'DELETE' and old.status = 'accepted') then
    update public.profiles set followers_count = greatest(0, followers_count - 1) where id = old.following_id;
    update public.profiles set following_count = greatest(0, following_count - 1) where id = old.follower_id;
  end if;
  return null;
end;
$$ language plpgsql security definer;

create or replace trigger on_follower_changed
  after insert or update or delete on public.followers
  for each row execute procedure public.handle_follower_change();

-- ----------------------------------------------------
-- ROW-LEVEL SECURITY POLICIES (RLS)
-- ----------------------------------------------------

-- Profile Policies
create policy "Allow public profiles read access" on public.profiles
  for select using (true);

create policy "Allow owners profile updates" on public.profiles
  for update using (auth.uid() = id);

-- Post Policies
create policy "Read public posts or owner posts" on public.posts
  for select using (
    visibility = 'public' or 
    auth.uid() = user_id or
    exists (
      select 1 from public.followers 
      where follower_id = auth.uid() and following_id = posts.user_id and status = 'accepted'
    )
  );

create policy "Allow authenticated post inserts" on public.posts
  for insert with check (auth.uid() = user_id);

create policy "Allow owner post updates" on public.posts
  for update using (auth.uid() = user_id);

create policy "Allow owner post deletions" on public.posts
  for delete using (auth.uid() = user_id);

-- Post Media Policies
create policy "Read media if post readable" on public.post_media
  for select using (
    exists (
      select 1 from public.posts 
      where posts.id = post_media.post_id
    )
  );

create policy "Write media if post owner" on public.post_media
  for insert with check (
    exists (
      select 1 from public.posts 
      where posts.id = post_media.post_id and posts.user_id = auth.uid()
    )
  );

-- Comments Policies
create policy "Read comments if post readable" on public.comments
  for select using (
    exists (
      select 1 from public.posts 
      where posts.id = comments.post_id
    )
  );

create policy "Insert comments if authenticated" on public.comments
  for insert with check (auth.uid() = user_id);

create policy "Update comments if owner" on public.comments
  for update using (auth.uid() = user_id);

create policy "Delete comments if owner" on public.comments
  for delete using (auth.uid() = user_id);

-- Thunder Reactions Policies
create policy "Read thunder reactions if target readable" on public.thunder_reactions
  for select using (true);

create policy "Create thunder reactions if authenticated" on public.thunder_reactions
  for insert with check (auth.uid() = user_id);

create policy "Delete thunder reactions if owner" on public.thunder_reactions
  for delete using (auth.uid() = user_id);

-- Followers Policies
create policy "Allow users to see followers/following relations" on public.followers
  for select using (true);

create policy "Allow user follow inserts" on public.followers
  for insert with check (auth.uid() = follower_id);

create policy "Allow status updates by recipient" on public.followers
  for update using (auth.uid() = following_id);

create policy "Allow follow deletions by owner or recipient" on public.followers
  for delete using (auth.uid() = follower_id or auth.uid() = following_id);

-- Story Policies
create policy "Read stories if follow status matches" on public.stories
  for select using (
    expires_at > now() and (
      auth.uid() = user_id or
      exists (
        select 1 from public.followers 
        where follower_id = auth.uid() and following_id = stories.user_id and status = 'accepted'
      )
    )
  );

create policy "Create stories if owner" on public.stories
  for insert with check (auth.uid() = user_id);

-- Messaging Policies (Access restrict to room members)
create policy "Read rooms where member" on public.chat_rooms
  for select using (
    exists (
      select 1 from public.chat_members 
      where chat_members.room_id = chat_rooms.id and chat_members.user_id = auth.uid()
    )
  );

create policy "Insert room members if room admin" on public.chat_members
  for insert with check (
    auth.uid() = user_id or
    exists (
      select 1 from public.chat_members 
      where chat_members.room_id = chat_members.room_id and chat_members.user_id = auth.uid() and chat_members.role = 'admin'
    )
  );

create policy "Allow room inserts" on public.chat_rooms
  for insert with check (true);

create policy "Allow select on chat_members" on public.chat_members
  for select using (true);

create policy "Allow insert on chat_members" on public.chat_members
  for insert with check (true);


create policy "Read messages in rooms where member" on public.messages
  for select using (
    exists (
      select 1 from public.chat_members 
      where chat_members.room_id = messages.room_id and chat_members.user_id = auth.uid()
    )
  );

create policy "Send message if member of room" on public.messages
  for insert with check (
    auth.uid() = sender_id and
    exists (
      select 1 from public.chat_members 
      where chat_members.room_id = messages.room_id and chat_members.user_id = auth.uid()
    )
  );

-- Device Keys Policies (Read all, write owned)
create policy "Read all device keys" on public.device_keys
  for select using (true);

create policy "Write own device keys" on public.device_keys
  for insert with check (auth.uid() = user_id);

create policy "Update own device keys" on public.device_keys
  for update using (auth.uid() = user_id);

-- Live Streams Policies
create policy "Read active streams" on public.live_streams
  for select using (true);

create policy "Start live stream if authenticated" on public.live_streams
  for insert with check (auth.uid() = user_id);

create policy "Manage owned stream" on public.live_streams
  for update using (auth.uid() = user_id);

-- Live Comments Policies
create policy "Read live comments" on public.live_comments
  for select using (true);

create policy "Insert comment if authenticated" on public.live_comments
  for insert with check (auth.uid() = user_id);

-- Reports Policies
create policy "Admins can view reports" on public.reports
  for select using (
    exists (
      select 1 from public.profiles 
      where profiles.id = auth.uid() and profiles.is_verified = true -- For demo/moderators
    )
  );

create policy "Anyone can submit a report" on public.reports
  for insert with check (auth.uid() = reporter_id);

-- Notifications Policies
create policy "Read own notifications" on public.notifications
  for select using (auth.uid() = recipient_id);

create policy "Update own notifications" on public.notifications
  for update using (auth.uid() = recipient_id);

-- ----------------------------------------------------
-- INDEXES FOR PERFORMANCE
-- ----------------------------------------------------
create index if not exists idx_posts_user_id on public.posts(user_id);
create index if not exists idx_posts_created_at on public.posts(created_at desc);
create index if not exists idx_comments_post_id on public.comments(post_id);
create index if not exists idx_comments_parent_id on public.comments(parent_id);
create index if not exists idx_followers_follower_id on public.followers(follower_id);
create index if not exists idx_followers_following_id on public.followers(following_id);
create index if not exists idx_messages_room_id on public.messages(room_id);
create index if not exists idx_messages_created_at on public.messages(created_at desc);
create index if not exists idx_notifications_recipient_id on public.notifications(recipient_id);
create index if not exists idx_notifications_read_at on public.notifications(read_at) where read_at is null;
