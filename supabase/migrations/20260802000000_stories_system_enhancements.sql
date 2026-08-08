-- Migration: Stories System Enhancements for Instagram-style 24-hour Stories
-- Date: 2026-08-02

-- 1. Enhance Stories table columns if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'caption') THEN
    ALTER TABLE public.stories ADD COLUMN caption text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'thumbnail_url') THEN
    ALTER TABLE public.stories ADD COLUMN thumbnail_url text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'stickers') THEN
    ALTER TABLE public.stories ADD COLUMN stickers jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'text_overlays') THEN
    ALTER TABLE public.stories ADD COLUMN text_overlays jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'location') THEN
    ALTER TABLE public.stories ADD COLUMN location text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'music_track') THEN
    ALTER TABLE public.stories ADD COLUMN music_track jsonb;
  END IF;
END $$;

-- 2. Indexes for high-performance querying
CREATE INDEX IF NOT EXISTS idx_stories_expires_user ON public.stories (expires_at DESC, user_id);
CREATE INDEX IF NOT EXISTS idx_story_views_story_user ON public.story_views (story_id, user_id);
CREATE INDEX IF NOT EXISTS idx_story_views_user_story ON public.story_views (user_id, story_id);
CREATE INDEX IF NOT EXISTS idx_story_reactions_story_user ON public.story_reactions (story_id, user_id);

-- 3. Row Level Security Policies for Story Views and Story Reactions

-- Enable RLS
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;

-- Story Views Policies
DROP POLICY IF EXISTS "Select story views for story owners or viewers" ON public.story_views;
CREATE POLICY "Select story views for story owners or viewers" ON public.story_views
  FOR SELECT USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_views.story_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Insert story view for self" ON public.story_views;
CREATE POLICY "Insert story view for self" ON public.story_views
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
  );

-- Story Reactions Policies
DROP POLICY IF EXISTS "Select story reactions for self or story owner" ON public.story_reactions;
CREATE POLICY "Select story reactions for self or story owner" ON public.story_reactions
  FOR SELECT USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_reactions.story_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Insert story reaction for self" ON public.story_reactions;
CREATE POLICY "Insert story reaction for self" ON public.story_reactions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Delete story reaction for self" ON public.story_reactions;
CREATE POLICY "Delete story reaction for self" ON public.story_reactions
  FOR DELETE USING (
    auth.uid() = user_id
  );

-- Story Delete Policy
DROP POLICY IF EXISTS "Delete stories if owner" ON public.stories;
CREATE POLICY "Delete stories if owner" ON public.stories
  FOR DELETE USING (
    auth.uid() = user_id
  );

-- Enable Supabase Realtime for stories, story_views, story_reactions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.story_views;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.story_reactions;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Handle duplicate table additions gracefully
  NULL;
END $$;

-- 4. PostgreSQL RPC Function to fetch story tray efficiently
CREATE OR REPLACE FUNCTION public.fetch_story_tray(p_viewer_id UUID)
RETURNS TABLE (
  author_id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  stories_count INT,
  unseen_count INT,
  latest_story_created_at TIMESTAMPTZ,
  is_own_story BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH active_stories AS (
    SELECT 
      s.id AS story_id,
      s.user_id AS author_id,
      s.created_at,
      s.expires_at,
      p.username,
      p.display_name,
      p.avatar_url,
      CASE WHEN v.id IS NOT NULL THEN 1 ELSE 0 END AS is_viewed
    FROM public.stories s
    JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN public.story_views v ON v.story_id = s.id AND v.user_id = p_viewer_id
    WHERE s.expires_at > NOW()
      AND (
        s.user_id = p_viewer_id
        OR EXISTS (
          SELECT 1 FROM public.followers f 
          WHERE f.follower_id = p_viewer_id 
            AND f.following_id = s.user_id 
            AND f.status = 'accepted'
        )
      )
  ),
  grouped AS (
    SELECT 
      a.author_id,
      a.username,
      a.display_name,
      a.avatar_url,
      COUNT(a.story_id)::INT AS stories_count,
      COUNT(CASE WHEN a.is_viewed = 0 THEN 1 END)::INT AS unseen_count,
      MAX(a.created_at) AS latest_story_created_at,
      (a.author_id = p_viewer_id) AS is_own_story
    FROM active_stories a
    GROUP BY a.author_id, a.username, a.display_name, a.avatar_url
  )
  SELECT 
    g.author_id,
    g.username,
    g.display_name,
    g.avatar_url,
    g.stories_count,
    g.unseen_count,
    g.latest_story_created_at,
    g.is_own_story
  FROM grouped g
  ORDER BY 
    g.is_own_story DESC,
    (g.unseen_count > 0) DESC,
    g.latest_story_created_at DESC;
END;
$$;
