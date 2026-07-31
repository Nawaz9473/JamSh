-- Group Chat & E2EE Key Distribution Support

create table if not exists public.group_keys (
  group_id uuid references public.chat_rooms(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  encrypted_key text not null,
  nonce text not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  sender_public_key text not null,
  created_at timestamp with time zone default now() not null,
  primary key (group_id, user_id)
);

-- Enable RLS
alter table public.group_keys enable row level security;

-- Policies
create policy "Allow users to read their own group keys" on public.group_keys
  for select using (auth.uid() = user_id);

create policy "Allow inserting group keys" on public.group_keys
  for insert with check (true);

create policy "Allow deleting group keys by admins" on public.group_keys
  for delete using (
    exists (
      select 1 from public.chat_members
      where chat_members.room_id = group_keys.group_id
        and chat_members.user_id = auth.uid()
        and chat_members.role in ('primary_admin', 'admin')
    )
  );

-- Update chat_rooms metadata
alter table public.chat_rooms add column if not exists description text;
alter table public.chat_rooms add column if not exists avatar_url text;
alter table public.chat_rooms add column if not exists primary_admin_id uuid references public.profiles(id) on delete set null;

-- Update role constraint in chat_members
alter table public.chat_members drop constraint if exists chat_members_role_check;
alter table public.chat_members add constraint chat_members_role_check check (role in ('primary_admin', 'admin', 'member'));
