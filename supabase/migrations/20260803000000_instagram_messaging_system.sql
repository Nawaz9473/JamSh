-- ----------------------------------------------------
-- JAMSH Database Migration: Instagram-Style Messaging System
-- ----------------------------------------------------

-- 1. Extend chat_rooms table
alter table public.chat_rooms
  add column if not exists status text check (status in ('pending', 'accepted', 'archived', 'blocked')) default 'accepted' not null,
  add column if not exists last_message_at timestamp with time zone default now() not null,
  add column if not exists last_message_preview text,
  add column if not exists last_message_sender_id uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamp with time zone default now() not null;

-- 2. Extend chat_members table
alter table public.chat_members
  add column if not exists last_read_at timestamp with time zone default now() not null,
  add column if not exists unread_count integer default 0 not null,
  add column if not exists is_muted boolean default false not null,
  add column if not exists is_archived boolean default false not null,
  add column if not exists is_blocked boolean default false not null;

-- 3. Extend messages table
alter table public.messages
  add column if not exists delivered_at timestamp with time zone,
  add column if not exists seen_at timestamp with time zone,
  add column if not exists edited_at timestamp with time zone,
  add column if not exists deleted_at timestamp with time zone,
  add column if not exists reaction text,
  add column if not exists reply_to_message_id uuid references public.messages(id) on delete set null;

-- 4. Create Performance Indexes
create index if not exists idx_messages_room_created on public.messages(room_id, created_at asc);
create index if not exists idx_messages_room_created_desc on public.messages(room_id, created_at desc);
create index if not exists idx_chat_rooms_last_message_at on public.chat_rooms(last_message_at desc);
create index if not exists idx_chat_members_user_room on public.chat_members(user_id, room_id);
create index if not exists idx_chat_rooms_status on public.chat_rooms(status);
create index if not exists idx_messages_unseen on public.messages(room_id, seen_at) where seen_at is null;

-- 5. Trigger Function to Update Chat Room & Unread Counters on Message Insert/Update
create or replace function public.handle_messaging_update()
returns trigger as $$
declare
  v_preview text;
begin
  if (TG_OP = 'INSERT') then
    -- Format preview string
    if (new.type = 'image') then
      v_preview := '📷 Photo';
    elsif (new.type = 'video') then
      v_preview := '🎥 Video';
    elsif (new.type = 'voice') then
      v_preview := '🎤 Voice Message';
    else
      v_preview := substring(new.content from 1 for 100);
    end if;

    -- Update chat room metadata
    update public.chat_rooms
    set 
      last_message_at = new.created_at,
      last_message_preview = v_preview,
      last_message_sender_id = new.sender_id,
      updated_at = now()
    where id = new.room_id;

    -- Increment unread counts for all members except sender
    update public.chat_members
    set unread_count = unread_count + 1
    where room_id = new.room_id and user_id <> new.sender_id;

  elsif (TG_OP = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null) then
    -- Message was recalled/deleted, update room preview if needed
    update public.chat_rooms
    set 
      last_message_preview = 'This message was deleted',
      updated_at = now()
    where id = new.room_id and last_message_at = old.created_at;
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- Attach trigger to messages table
drop trigger if exists on_messaging_update on public.messages;
create trigger on_messaging_update
  after insert or update on public.messages
  for each row execute procedure public.handle_messaging_update();

-- 6. Helper RPC Function to Mark Messages as Seen
create or replace function public.mark_messages_as_seen(
  p_room_id uuid,
  p_user_id uuid
)
returns void as $$
begin
  -- Mark all messages in room sent by others as seen
  update public.messages
  set 
    seen_at = coalesce(seen_at, now()),
    delivered_at = coalesce(delivered_at, now())
  where room_id = p_room_id 
    and sender_id <> p_user_id 
    and seen_at is null;

  -- Reset member unread count
  update public.chat_members
  set 
    unread_count = 0,
    last_read_at = now()
  where room_id = p_room_id 
    and user_id = p_user_id;
end;
$$ language plpgsql security definer;

-- 7. Helper RPC Function to Accept Message Request
create or replace function public.accept_message_request(
  p_room_id uuid
)
returns void as $$
begin
  update public.chat_rooms
  set 
    status = 'accepted',
    updated_at = now()
  where id = p_room_id;
end;
$$ language plpgsql security definer;
