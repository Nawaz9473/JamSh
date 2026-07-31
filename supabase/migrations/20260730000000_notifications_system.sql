-- Recreate Notifications System with Enums, Outbox Pattern, Preferences, and Analytics

-- Drop existing table if exists to update schema cleanly
drop table if exists public.notifications cascade;
drop type if exists public.notification_type;
drop type if exists public.notification_priority;
drop type if exists public.notification_status;
drop type if exists public.notification_delivery_status;

-- Create Custom Database Enums matching Prisma
create type public.notification_type as enum (
  'MESSAGE',
  'THUNDER',
  'LIKE',
  'COMMENT',
  'REPLY',
  'FOLLOW',
  'FOLLOW_REQUEST',
  'FOLLOW_ACCEPTED',
  'MENTION',
  'TAG',
  'SHARE',
  'BOOKMARK',
  'COMMUNITY',
  'EVENT',
  'SYSTEM',
  'SECURITY',
  'AI_RECOMMENDATION'
);

create type public.notification_priority as enum (
  'HIGH',
  'MEDIUM',
  'LOW'
);

create type public.notification_status as enum (
  'UNREAD',
  'READ',
  'ARCHIVED'
);

create type public.notification_delivery_status as enum (
  'PENDING',
  'DELIVERED',
  'FAILED',
  'RETRYING'
);

-- Recreate notifications table
create table public.notifications (
  id uuid default gen_random_uuid() primary key,
  receiver_id uuid references public.profiles(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  type public.notification_type not null,
  status public.notification_status default 'UNREAD'::public.notification_status not null,
  priority public.notification_priority default 'MEDIUM'::public.notification_priority not null,
  delivery_status public.notification_delivery_status default 'PENDING'::public.notification_delivery_status not null,
  group_key text,
  metadata jsonb default '{}'::jsonb,
  delivered_at timestamp with time zone,
  read_at timestamp with time zone,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Create outbox table for Outbox Pattern
create table public.outbox (
  id uuid default gen_random_uuid() primary key,
  aggregate text not null,
  aggregate_id text not null,
  event text not null,
  payload jsonb not null,
  processed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

-- Create notification_preferences table
create table public.notification_preferences (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  push_enabled boolean default true not null,
  email_enabled boolean default true not null,
  likes_enabled boolean default true not null,
  comments_enabled boolean default true not null,
  thunder_enabled boolean default true not null,
  message_enabled boolean default true not null,
  community_enabled boolean default true not null,
  recommendation_enabled boolean default true not null,
  marketing_enabled boolean default true not null,
  quiet_hours_start text,
  quiet_hours_end text
);

-- Create notification_analytics table
create table public.notification_analytics (
  id uuid default gen_random_uuid() primary key,
  notification_id uuid not null,
  status text not null, -- created, queued, delivered, opened, clicked, dismissed
  timestamp timestamp with time zone default now() not null,
  device_type text
);

-- Enable Row Level Security (RLS)
alter table public.notifications enable row level security;
alter table public.outbox enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_analytics enable row level security;

-- Define RLS Policies for Recipient Access
create policy "Users can read own notifications" on public.notifications
  for select using (auth.uid() = receiver_id);

create policy "Users can update own notifications" on public.notifications
  for update using (auth.uid() = receiver_id);

create policy "Users can read own preferences" on public.notification_preferences
  for select using (auth.uid() = user_id);

create policy "Users can update own preferences" on public.notification_preferences
  for update using (auth.uid() = user_id);

-- System bypass policies for inserting/deleting/processing
create policy "Allow system insert notifications" on public.notifications for insert with check (true);
create policy "Allow system delete notifications" on public.notifications for delete using (true);
create policy "Allow system outbox operations" on public.outbox for all using (true);
create policy "Allow system preferences insert" on public.notification_preferences for insert with check (true);
create policy "Allow system analytics operations" on public.notification_analytics for all using (true);

-- Highly Optimized Database Indexes
create index idx_notifications_receiver_status on public.notifications(receiver_id, status);
create index idx_notifications_receiver_created on public.notifications(receiver_id, created_at desc);
create index idx_notifications_group_key on public.notifications(group_key);
create index idx_notifications_type on public.notifications(type);
create index idx_notifications_priority on public.notifications(priority);
create index idx_notifications_deleted_at on public.notifications(deleted_at);
create index idx_outbox_processed_at on public.outbox(processed_at);
create index idx_notification_analytics_nid on public.notification_analytics(notification_id);
