-- 1. Create trending_searches table
CREATE TABLE IF NOT EXISTS public.trending_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL UNIQUE,
    count INT DEFAULT 1,
    category TEXT DEFAULT 'general',
    last_searched_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for trending_searches
ALTER TABLE public.trending_searches ENABLE ROW LEVEL SECURITY;

-- Policies for trending_searches
DROP POLICY IF EXISTS "Public read trending_searches" ON public.trending_searches;
CREATE POLICY "Public read trending_searches"
    ON public.trending_searches FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Authenticated insert trending_searches" ON public.trending_searches;
CREATE POLICY "Authenticated insert trending_searches"
    ON public.trending_searches FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- 2. Create group_keys table
CREATE TABLE IF NOT EXISTS public.group_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  encrypted_group_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT group_keys_group_user_unique UNIQUE (group_id, user_id)
);

-- Enable RLS for group_keys
ALTER TABLE public.group_keys ENABLE ROW LEVEL SECURITY;

-- Policies for group_keys
DROP POLICY IF EXISTS "Allow users to read their own group keys" ON public.group_keys;
CREATE POLICY "Allow users to read their own group keys" ON public.group_keys
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow inserting group keys" ON public.group_keys;
CREATE POLICY "Allow inserting group keys" ON public.group_keys
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow updating group keys" ON public.group_keys;
CREATE POLICY "Allow updating group keys" ON public.group_keys
  FOR UPDATE USING (auth.uid() = user_id OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow deleting group keys by admins" ON public.group_keys;
CREATE POLICY "Allow deleting group keys by admins" ON public.group_keys
  FOR DELETE USING (auth.uid() = user_id OR auth.role() = 'service_role');
