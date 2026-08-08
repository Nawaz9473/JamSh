-- Migration: Post Module Notifications Single Source of Truth & Unlike Cleanup Triggers

-- 1. UNLIKE NOTIFICATION CLEANUP TRIGGER
create or replace function public.handle_thunder_reaction_delete()
returns trigger as $$
declare
  target_entity_id text;
begin
  target_entity_id := coalesce(old.comment_id::text, old.post_id::text);
  
  if (target_entity_id is not null) then
    delete from public.notifications
    where sender_id = old.user_id
      and type = 'THUNDER'
      and metadata->>'entityId' = target_entity_id;
  end if;
  
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists on_thunder_reaction_delete on public.thunder_reactions;
create trigger on_thunder_reaction_delete
  after delete on public.thunder_reactions
  for each row execute procedure public.handle_thunder_reaction_delete();


-- 2. COMMENT DELETION NOTIFICATION CLEANUP TRIGGER
create or replace function public.handle_comment_delete_cleanup()
returns trigger as $$
begin
  delete from public.notifications
  where group_key like 'COMMENT_' || old.id || '_%'
     or group_key like 'REPLY_' || old.id || '_%';
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists on_comment_delete_cleanup on public.comments;
create trigger on_comment_delete_cleanup
  after delete on public.comments
  for each row execute procedure public.handle_comment_delete_cleanup();


-- 3. POST SHARES COUNT TRIGGER (With NULL safety)
create or replace function public.handle_share_count_update()
returns trigger as $$
begin
  update public.posts
  set shares_count = coalesce(shares_count, 0) + 1
  where id = new.post_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_share_count_update on public.shares;
create trigger on_share_count_update
  after insert on public.shares
  for each row execute procedure public.handle_share_count_update();
