-- Add type column to public.thunder_reactions
ALTER TABLE IF EXISTS public.thunder_reactions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'THUNDER';

-- Add counters and scores columns to public.posts
ALTER TABLE IF EXISTS public.posts ADD COLUMN IF NOT EXISTS shares_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS public.posts ADD COLUMN IF NOT EXISTS saves_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS public.posts ADD COLUMN IF NOT EXISTS views_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS public.posts ADD COLUMN IF NOT EXISTS watch_time_total DOUBLE PRECISION NOT NULL DEFAULT 0.0;
ALTER TABLE IF EXISTS public.posts ADD COLUMN IF NOT EXISTS engagement_score DOUBLE PRECISION NOT NULL DEFAULT 0.0;
ALTER TABLE IF EXISTS public.posts ADD COLUMN IF NOT EXISTS trending_score DOUBLE PRECISION NOT NULL DEFAULT 0.0;

-- Create shares table
CREATE TABLE IF NOT EXISTS public.shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL DEFAULT 'external',
    target_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create saves table
CREATE TABLE IF NOT EXISTS public.saves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, post_id)
);

-- Create post_views table
CREATE TABLE IF NOT EXISTS public.post_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    watch_time DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_blocks table
CREATE TABLE IF NOT EXISTS public.user_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (blocker_id, blocked_id)
);

-- Enable RLS
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- Policies for shares
CREATE POLICY "Users can insert their own shares" ON public.shares FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own shares" ON public.shares FOR SELECT USING (auth.uid() = user_id);

-- Policies for saves
CREATE POLICY "Users can insert their own saves" ON public.saves FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can select their own saves" ON public.saves FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own saves" ON public.saves FOR DELETE USING (auth.uid() = user_id);

-- Policies for post_views
CREATE POLICY "Anyone can view views" ON public.post_views FOR SELECT USING (true);
CREATE POLICY "Logged in users can insert view logs" ON public.post_views FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Policies for notifications
CREATE POLICY "Users can select their own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- Policies for user_blocks
CREATE POLICY "Users can view their blocks" ON public.user_blocks FOR SELECT USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);
CREATE POLICY "Users can manage blocks" ON public.user_blocks FOR ALL USING (auth.uid() = blocker_id);
