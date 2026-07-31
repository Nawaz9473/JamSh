-- Migration: Add Notification Triggers for Follows, Likes, and Comments
-- This SQL script sets up automatic notification generation and outbox queuing.

-- 1. FOLLOWER NOTIFICATIONS
create or replace function public.handle_follower_notification()
returns trigger as $$
declare
  sender_username text;
  notif_id uuid;
  g_key text;
begin
  if (new.status = 'accepted' and (old.status is null or old.status = 'pending')) then
    -- Don't notify oneself
    if (new.follower_id = new.following_id) then
      return new;
    end if;

    -- Fetch follower's username
    select username into sender_username from public.profiles where id = new.follower_id;
    
    g_key := 'FOLLOW_' || new.following_id || '_' || new.following_id;
    notif_id := gen_random_uuid();

    -- Insert notification row
    insert into public.notifications (
      id,
      receiver_id,
      sender_id,
      type,
      status,
      priority,
      delivery_status,
      group_key,
      metadata
    ) values (
      notif_id,
      new.following_id,
      new.follower_id,
      'FOLLOW'::public.notification_type,
      'UNREAD'::public.notification_status,
      'MEDIUM'::public.notification_priority,
      'PENDING'::public.notification_delivery_status,
      g_key,
      jsonb_build_object('actors', jsonb_build_array(coalesce(sender_username, 'someone')), 'count', 1)
    );

    -- Insert outbox row for backend push notification delivery
    insert into public.outbox (
      aggregate,
      aggregate_id,
      event,
      payload
    ) values (
      'Notification',
      notif_id::text,
      'NotificationCreated',
      jsonb_build_object(
        'notificationId', notif_id::text,
        'receiverId', new.following_id::text,
        'type', 'FOLLOW',
        'priority', 'MEDIUM',
        'metadata', jsonb_build_object('actors', jsonb_build_array(coalesce(sender_username, 'someone')), 'count', 1)
      )
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_follower_notification
  after insert or update on public.followers
  for each row execute procedure public.handle_follower_notification();


-- 2. THUNDER (LIKE) NOTIFICATIONS
create or replace function public.handle_thunder_notification()
returns trigger as $$
declare
  post_owner uuid;
  comment_owner uuid;
  target_owner uuid;
  sender_username text;
  notif_id uuid;
  g_key text;
  e_id uuid;
  n_type public.notification_type;
begin
  -- Fetch sender username
  select username into sender_username from public.profiles where id = new.user_id;

  -- Determine if it's comment or post reaction
  if (new.comment_id is not null) then
    select user_id into comment_owner from public.comments where id = new.comment_id;
    target_owner := comment_owner;
    e_id := new.comment_id;
    n_type := 'THUNDER'::public.notification_type;
    g_key := 'THUNDER_' || new.comment_id || '_' || target_owner;
  else
    select user_id into post_owner from public.posts where id = new.post_id;
    target_owner := post_owner;
    e_id := new.post_id;
    n_type := 'THUNDER'::public.notification_type;
    g_key := 'THUNDER_' || new.post_id || '_' || target_owner;
  end if;

  -- Don't notify oneself
  if (target_owner = new.user_id or target_owner is null) then
    return new;
  end if;

  notif_id := gen_random_uuid();

  -- Insert notification
  insert into public.notifications (
    id,
    receiver_id,
    sender_id,
    type,
    status,
    priority,
    delivery_status,
    group_key,
    metadata
  ) values (
    notif_id,
    target_owner,
    new.user_id,
    n_type,
    'UNREAD'::public.notification_status,
    'MEDIUM'::public.notification_priority,
    'PENDING'::public.notification_delivery_status,
    g_key,
    jsonb_build_object('actors', jsonb_build_array(coalesce(sender_username, 'someone')), 'count', 1, 'entityId', e_id::text)
  );

  -- Insert outbox row
  insert into public.outbox (
    aggregate,
    aggregate_id,
    event,
    payload
  ) values (
    'Notification',
    notif_id::text,
    'NotificationCreated',
    jsonb_build_object(
      'notificationId', notif_id::text,
      'receiverId', target_owner::text,
      'type', 'THUNDER',
      'priority', 'MEDIUM',
      'metadata', jsonb_build_object('actors', jsonb_build_array(coalesce(sender_username, 'someone')), 'count', 1, 'entityId', e_id::text)
    )
  );

  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_thunder_notification
  after insert on public.thunder_reactions
  for each row execute procedure public.handle_thunder_notification();


-- 3. COMMENT & REPLY NOTIFICATIONS
create or replace function public.handle_comment_notification()
returns trigger as $$
declare
  post_owner uuid;
  parent_comment_owner uuid;
  sender_username text;
  notif_id uuid;
  g_key text;
begin
  -- Fetch sender username
  select username into sender_username from public.profiles where id = new.user_id;

  -- 1. If it is a reply to another comment
  if (new.parent_id is not null) then
    select user_id into parent_comment_owner from public.comments where id = new.parent_id;
    
    -- Notify parent comment owner (if not oneself)
    if (parent_comment_owner is not null and parent_comment_owner != new.user_id) then
      notif_id := gen_random_uuid();
      g_key := 'REPLY_' || new.id || '_' || parent_comment_owner;
      
      insert into public.notifications (
        id,
        receiver_id,
        sender_id,
        type,
        status,
        priority,
        delivery_status,
        group_key,
        metadata
      ) values (
        notif_id,
        parent_comment_owner,
        new.user_id,
        'REPLY'::public.notification_type,
        'UNREAD'::public.notification_status,
        'MEDIUM'::public.notification_priority,
        'PENDING'::public.notification_delivery_status,
        g_key,
        jsonb_build_object('actors', jsonb_build_array(coalesce(sender_username, 'someone')), 'count', 1, 'preview', substring(new.content from 1 for 60))
      );

      insert into public.outbox (
        aggregate,
        aggregate_id,
        event,
        payload
      ) values (
        'Notification',
        notif_id::text,
        'NotificationCreated',
        jsonb_build_object(
          'notificationId', notif_id::text,
          'receiverId', parent_comment_owner::text,
          'type', 'REPLY',
          'priority', 'MEDIUM',
          'metadata', jsonb_build_object('actors', jsonb_build_array(coalesce(sender_username, 'someone')), 'count', 1, 'preview', substring(new.content from 1 for 60))
        )
      );
    end if;
  end if;

  -- 2. Notify post owner (if not oneself and not also the parent comment owner to avoid double notifications)
  select user_id into post_owner from public.posts where id = new.post_id;
  if (post_owner is not null and post_owner != new.user_id and (new.parent_id is null or post_owner != parent_comment_owner)) then
    notif_id := gen_random_uuid();
    g_key := 'COMMENT_' || new.id || '_' || post_owner;
    
    insert into public.notifications (
      id,
      receiver_id,
      sender_id,
      type,
      status,
      priority,
      delivery_status,
      group_key,
      metadata
    ) values (
      notif_id,
      post_owner,
      new.user_id,
      'COMMENT'::public.notification_type,
      'UNREAD'::public.notification_status,
      'MEDIUM'::public.notification_priority,
      'PENDING'::public.notification_delivery_status,
      g_key,
      jsonb_build_object('actors', jsonb_build_array(coalesce(sender_username, 'someone')), 'count', 1, 'preview', substring(new.content from 1 for 60))
    );

    insert into public.outbox (
      aggregate,
      aggregate_id,
      event,
      payload
    ) values (
      'Notification',
      notif_id::text,
      'NotificationCreated',
      jsonb_build_object(
        'notificationId', notif_id::text,
        'receiverId', post_owner::text,
        'type', 'COMMENT',
        'priority', 'MEDIUM',
        'metadata', jsonb_build_object('actors', jsonb_build_array(coalesce(sender_username, 'someone')), 'count', 1, 'preview', substring(new.content from 1 for 60))
      )
    );
  end if;

  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_comment_notification
  after insert on public.comments
  for each row execute procedure public.handle_comment_notification();
