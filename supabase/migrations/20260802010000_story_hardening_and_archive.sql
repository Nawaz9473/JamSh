-- Migration: Story Hardening, Archiving, Rate Limiting, and Maintenance
-- Date: 2026-08-02

-- 1. Create Story Archives Table for future-ready Story Archiving
CREATE TABLE IF NOT EXISTS public.story_archives (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  media_url text NOT NULL,
  media_type text CHECK (media_type IN ('image', 'video')) NOT NULL,
  thumbnail_url text,
  caption text,
  stickers jsonb DEFAULT '[]'::jsonb,
  text_overlays jsonb DEFAULT '[]'::jsonb,
  location text,
  music_track jsonb,
  archived_at timestamp with time zone DEFAULT now() NOT NULL,
  original_created_at timestamp with time zone NOT NULL
);

ALTER TABLE public.story_archives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own story archives" ON public.story_archives;
CREATE POLICY "Users can read own story archives" ON public.story_archives
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own story archives" ON public.story_archives;
CREATE POLICY "Users can delete own story archives" ON public.story_archives
  FOR DELETE USING (auth.uid() = user_id);

-- 2. Create Story Rate Limits Table
CREATE TABLE IF NOT EXISTS public.story_rate_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  action_type text NOT NULL,
  count int DEFAULT 1 NOT NULL,
  window_start timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT unique_user_action_window UNIQUE (user_id, action_type)
);

ALTER TABLE public.story_rate_limits ENABLE ROW LEVEL SECURITY;

-- 3. Create Maintenance Logs Table
CREATE TABLE IF NOT EXISTS public.maintenance_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name text NOT NULL,
  records_cleaned int DEFAULT 0 NOT NULL,
  storage_deleted_count int DEFAULT 0 NOT NULL,
  run_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;

-- 4. Add Media Metadata Columns to Stories Table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'width') THEN
    ALTER TABLE public.stories ADD COLUMN width int;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'height') THEN
    ALTER TABLE public.stories ADD COLUMN height int;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'aspect_ratio') THEN
    ALTER TABLE public.stories ADD COLUMN aspect_ratio numeric(5,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'duration') THEN
    ALTER TABLE public.stories ADD COLUMN duration numeric(6,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'file_size') THEN
    ALTER TABLE public.stories ADD COLUMN file_size bigint;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'mime_type') THEN
    ALTER TABLE public.stories ADD COLUMN mime_type text;
  END IF;
END $$;

-- 5. Rate Limiting Function
CREATE OR REPLACE FUNCTION public.check_story_rate_limit(
  p_user_id UUID,
  p_action TEXT,
  p_max_limit INT,
  p_window_seconds INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
  v_window_start TIMESTAMPTZ;
BEGIN
  SELECT count, window_start INTO v_count, v_window_start
  FROM public.story_rate_limits
  WHERE user_id = p_user_id AND action_type = p_action;

  IF NOT FOUND THEN
    INSERT INTO public.story_rate_limits (user_id, action_type, count, window_start)
    VALUES (p_user_id, p_action, 1, NOW());
    RETURN TRUE;
  END IF;

  IF NOW() - v_window_start > (p_window_seconds || ' seconds')::INTERVAL THEN
    UPDATE public.story_rate_limits
    SET count = 1, window_start = NOW()
    WHERE user_id = p_user_id AND action_type = p_action;
    RETURN TRUE;
  ELSE
    IF v_count >= p_max_limit THEN
      RETURN FALSE;
    ELSE
      UPDATE public.story_rate_limits
      SET count = count + 1
      WHERE user_id = p_user_id AND action_type = p_action;
      RETURN TRUE;
    END IF;
  END IF;
END;
$$;
