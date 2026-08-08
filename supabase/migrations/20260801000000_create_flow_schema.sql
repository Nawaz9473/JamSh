-- ====================================================
-- JAMSH Database Schema Extension: Create Flow (Posts, Reels, Stories)
-- ====================================================

-- 1. Create stories table if not existing
CREATE TABLE IF NOT EXISTS public.stories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  media_url TEXT NOT NULL,
  media_type TEXT CHECK (media_type IN ('image', 'video')) NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  stickers JSONB DEFAULT '[]'::jsonb NOT NULL,
  text_overlays JSONB DEFAULT '[]'::jsonb NOT NULL,
  location TEXT,
  music_track JSONB,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours') NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on stories
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public stories read policy" ON public.stories;
CREATE POLICY "Public stories read policy" ON public.stories
  FOR SELECT USING (expires_at > NOW());

DROP POLICY IF EXISTS "Authenticated users create stories" ON public.stories;
CREATE POLICY "Authenticated users create stories" ON public.stories
  FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can delete own stories" ON public.stories;
CREATE POLICY "Users can delete own stories" ON public.stories
  FOR DELETE USING (auth.uid() = user_id);

-- 2. Extend posts table with additional Create Flow columns if missing
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='hashtags') THEN
    ALTER TABLE public.posts ADD COLUMN hashtags TEXT[] DEFAULT '{}'::text[];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='mentions') THEN
    ALTER TABLE public.posts ADD COLUMN mentions TEXT[] DEFAULT '{}'::text[];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='location') THEN
    ALTER TABLE public.posts ADD COLUMN location TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='allow_comments') THEN
    ALTER TABLE public.posts ADD COLUMN allow_comments BOOLEAN DEFAULT true NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='expires_at') THEN
    ALTER TABLE public.posts ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
END $$;

-- 3. Storage Buckets Provisioning
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('posts', 'posts', true),
  ('reels', 'reels', true),
  ('stories', 'stories', true),
  ('thumbnails', 'thumbnails', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage RLS Policies
DROP POLICY IF EXISTS "Public Storage Read" ON storage.objects;
CREATE POLICY "Public Storage Read" ON storage.objects
  FOR SELECT USING (bucket_id IN ('posts', 'reels', 'stories', 'thumbnails'));

DROP POLICY IF EXISTS "Authenticated Storage Insert" ON storage.objects;
CREATE POLICY "Authenticated Storage Insert" ON storage.objects
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');
