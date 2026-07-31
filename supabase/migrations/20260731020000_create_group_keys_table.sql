-- Create group_keys table for Group Chat E2EE key distribution
create table if not exists public.group_keys (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  encrypted_group_key text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint group_keys_group_user_unique unique (group_id, user_id)
);

-- Enable Row Level Security
alter table public.group_keys enable row level security;

-- Row Level Security Policies
create policy "Allow users to read their own group keys" on public.group_keys
  for select using (auth.uid() = user_id);

create policy "Allow inserting group keys" on public.group_keys
  for insert with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

create policy "Allow updating group keys" on public.group_keys
  for update using (auth.uid() = user_id or auth.role() = 'service_role');

create policy "Allow deleting group keys by admins or service role" on public.group_keys
  for delete using (auth.uid() = user_id or auth.role() = 'service_role');
