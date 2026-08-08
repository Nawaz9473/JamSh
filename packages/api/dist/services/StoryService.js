import { supabase } from '../index.js';
const TRAY_CACHE_KEY = 'jamsh_story_tray_cache';
const QUEUE_CACHE_KEY = 'jamsh_offline_story_queue';
export class StoryService {
    static isInitialized = false;
    static initOfflineSync() {
        if (this.isInitialized)
            return;
        this.isInitialized = true;
        if (typeof window !== 'undefined' && 'addEventListener' in window) {
            window.addEventListener('online', () => {
                this.flushOfflineQueue();
            });
            // Initial check
            if (navigator.onLine) {
                this.flushOfflineQueue();
            }
        }
    }
    /**
     * Helper to retrieve cached tray items when offline
     */
    static getCachedTray() {
        try {
            if (typeof localStorage !== 'undefined') {
                const cached = localStorage.getItem(TRAY_CACHE_KEY);
                if (cached)
                    return JSON.parse(cached);
            }
        }
        catch (e) { }
        return [];
    }
    static setCachedTray(tray) {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(TRAY_CACHE_KEY, JSON.stringify(tray));
            }
        }
        catch (e) { }
    }
    /**
     * Fetch Story Tray grouped by creator
     */
    static async getStoryTray() {
        this.initOfflineSync();
        // If offline, return cached tray immediately
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            return this.getCachedTray();
        }
        try {
            const { data, error } = await supabase.functions.invoke('story-tray', {
                method: 'GET',
            });
            if (!error && data && data.tray) {
                this.setCachedTray(data.tray);
                return data.tray;
            }
        }
        catch (e) {
            console.warn('[StoryService] story-tray Edge Function error, falling back', e);
        }
        // Direct Database Fallback if Edge function is unreachable
        const user = (await supabase.auth.getUser()).data.user;
        if (!user)
            return this.getCachedTray();
        const { data: activeStories, error: storiesErr } = await supabase
            .from('stories')
            .select(`
        id,
        user_id,
        created_at,
        expires_at,
        profiles:user_id (id, username, display_name, avatar_url),
        story_views (id, user_id)
      `)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false });
        if (storiesErr || !activeStories)
            return this.getCachedTray();
        const groupedMap = new Map();
        activeStories.forEach((s) => {
            const authorId = s.user_id;
            const profile = s.profiles || {};
            const isViewed = (s.story_views || []).some((v) => v.user_id === user.id);
            if (!groupedMap.has(authorId)) {
                groupedMap.set(authorId, {
                    author_id: authorId,
                    username: profile.username || 'user',
                    display_name: profile.display_name || profile.username || 'User',
                    avatar_url: profile.avatar_url || '',
                    stories_count: 0,
                    unseen_count: 0,
                    latest_story_created_at: s.created_at,
                    is_own_story: authorId === user.id,
                });
            }
            const group = groupedMap.get(authorId);
            group.stories_count += 1;
            if (!isViewed)
                group.unseen_count += 1;
            if (new Date(s.created_at) > new Date(group.latest_story_created_at)) {
                group.latest_story_created_at = s.created_at;
            }
        });
        const sortedTray = Array.from(groupedMap.values()).sort((a, b) => {
            if (a.is_own_story !== b.is_own_story)
                return a.is_own_story ? -1 : 1;
            const aUnseen = a.unseen_count > 0;
            const bUnseen = b.unseen_count > 0;
            if (aUnseen !== bUnseen)
                return aUnseen ? -1 : 1;
            return new Date(b.latest_story_created_at).getTime() - new Date(a.latest_story_created_at).getTime();
        });
        this.setCachedTray(sortedTray);
        return sortedTray;
    }
    /**
     * Fetch stories for a target creator
     */
    static async getUserStories(targetUserId) {
        this.initOfflineSync();
        try {
            const { data, error } = await supabase.functions.invoke(`story-user?userId=${targetUserId}`, {
                method: 'GET',
            });
            if (!error && data && data.stories) {
                return data.stories;
            }
        }
        catch (e) {
            console.warn('[StoryService] story-user Edge Function error, falling back', e);
        }
        const user = (await supabase.auth.getUser()).data.user;
        const { data: stories, error: storiesErr } = await supabase
            .from('stories')
            .select(`
        *,
        user:user_id (id, username, display_name, avatar_url),
        story_views (id, user_id, created_at),
        story_reactions (id, user_id, reaction_type, created_at)
      `)
            .eq('user_id', targetUserId)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: true });
        if (storiesErr || !stories)
            return [];
        return stories.map((story) => {
            const isViewed = user ? (story.story_views || []).some((v) => v.user_id === user.id) : false;
            const myReaction = user ? (story.story_reactions || []).find((r) => r.user_id === user.id) : null;
            return {
                ...story,
                views_count: (story.story_views || []).length,
                is_viewed: isViewed,
                my_reaction: myReaction ? myReaction.reaction_type : null,
            };
        });
    }
    /**
     * Publish a new story with retry pipeline
     */
    static async createStory(payload) {
        this.initOfflineSync();
        let attempts = 0;
        const maxAttempts = 3;
        while (attempts < maxAttempts) {
            try {
                attempts++;
                const { data, error } = await supabase.functions.invoke('story-create', {
                    method: 'POST',
                    body: payload,
                });
                if (!error && data && data.story) {
                    return data.story;
                }
                if (attempts >= maxAttempts && error)
                    throw error;
            }
            catch (e) {
                if (attempts >= maxAttempts) {
                    console.warn('[StoryService] story-create Edge Function retry limit reached, fallback to direct insert', e);
                    break;
                }
                await new Promise((res) => setTimeout(res, 1000 * Math.pow(2, attempts)));
            }
        }
        // Direct table insert fallback
        const user = (await supabase.auth.getUser()).data.user;
        if (!user)
            throw new Error('Not authenticated');
        const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const { data: inserted, error: insertErr } = await supabase
            .from('stories')
            .insert({
            user_id: user.id,
            media_url: payload.media_url,
            media_type: payload.media_type,
            thumbnail_url: payload.thumbnail_url || null,
            caption: payload.caption || null,
            stickers: payload.stickers ? JSON.stringify(payload.stickers) : '[]',
            text_overlays: payload.text_overlays ? JSON.stringify(payload.text_overlays) : '[]',
            location: payload.location || null,
            music_track: payload.music_track ? JSON.stringify(payload.music_track) : null,
            width: payload.width || null,
            height: payload.height || null,
            aspect_ratio: payload.aspect_ratio || null,
            duration: payload.duration || null,
            file_size: payload.file_size || null,
            mime_type: payload.mime_type || null,
            expires_at,
        })
            .select()
            .single();
        if (insertErr)
            throw insertErr;
        return inserted;
    }
    /**
     * Delete story (Story owner only)
     */
    static async deleteStory(storyId) {
        try {
            const { error } = await supabase.functions.invoke('story-delete', {
                method: 'POST',
                body: { storyId },
            });
            if (!error)
                return true;
        }
        catch (e) { }
        const user = (await supabase.auth.getUser()).data.user;
        if (!user)
            return false;
        const { error: delErr } = await supabase
            .from('stories')
            .delete()
            .eq('id', storyId)
            .eq('user_id', user.id);
        return !delErr;
    }
    /**
     * Mark story as viewed (queues offline if disconnected)
     */
    static async markStoryViewed(storyId) {
        this.initOfflineSync();
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            this.enqueueOfflineAction({
                id: `view_${storyId}_${Date.now()}`,
                type: 'view',
                storyId,
                timestamp: Date.now(),
            });
            return;
        }
        try {
            await supabase.functions.invoke('story-view', {
                method: 'POST',
                body: { storyId },
            });
        }
        catch (e) {
            const user = (await supabase.auth.getUser()).data.user;
            if (user) {
                await supabase
                    .from('story_views')
                    .upsert({ story_id: storyId, user_id: user.id }, { onConflict: 'story_id, user_id' });
            }
        }
    }
    /**
     * Toggle or add emoji reaction to a story (queues offline if disconnected)
     */
    static async reactToStory(storyId, reactionType) {
        this.initOfflineSync();
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            this.enqueueOfflineAction({
                id: `react_${storyId}_${Date.now()}`,
                type: 'react',
                storyId,
                reactionType,
                timestamp: Date.now(),
            });
            return { reaction: reactionType, action: 'added' };
        }
        try {
            const { data, error } = await supabase.functions.invoke('story-react', {
                method: 'POST',
                body: { storyId, reactionType },
            });
            if (!error && data) {
                return { reaction: data.reaction, action: data.action };
            }
        }
        catch (e) { }
        // Direct fallback
        const user = (await supabase.auth.getUser()).data.user;
        if (!user)
            throw new Error('Not authenticated');
        const { data: existing } = await supabase
            .from('story_reactions')
            .select('id, reaction_type')
            .eq('story_id', storyId)
            .eq('user_id', user.id)
            .maybeSingle();
        if (existing && existing.reaction_type === reactionType) {
            await supabase.from('story_reactions').delete().eq('id', existing.id);
            return { reaction: null, action: 'removed' };
        }
        await supabase.from('story_reactions').upsert({
            story_id: storyId,
            user_id: user.id,
            reaction_type: reactionType,
        });
        return { reaction: reactionType, action: 'added' };
    }
    /**
     * Fetch viewer list for a story (Story owner only)
     */
    static async getStoryViewers(storyId) {
        try {
            const { data, error } = await supabase.functions.invoke(`story-viewers?storyId=${storyId}`, {
                method: 'GET',
            });
            if (!error && data && data.viewers) {
                return data.viewers;
            }
        }
        catch (e) { }
        // Direct fallback
        const { data: views, error: viewsErr } = await supabase
            .from('story_views')
            .select(`
        id,
        created_at,
        user:user_id (id, username, display_name, avatar_url)
      `)
            .eq('story_id', storyId)
            .order('created_at', { ascending: false });
        if (viewsErr || !views)
            return [];
        return views.map((v) => ({
            id: v.id,
            user_id: v.user?.id,
            username: v.user?.username || 'user',
            display_name: v.user?.display_name || v.user?.username || 'User',
            avatar_url: v.user?.avatar_url || '',
            viewed_at: v.created_at,
        }));
    }
    /**
     * Subscribe to realtime story changes
     */
    static subscribeToStories(onChange) {
        const channel = supabase
            .channel('stories-realtime-channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, () => onChange())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'story_views' }, () => onChange())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'story_reactions' }, () => onChange())
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }
    /**
     * Enqueue offline action to local storage
     */
    static enqueueOfflineAction(action) {
        try {
            if (typeof localStorage === 'undefined')
                return;
            const existingStr = localStorage.getItem(QUEUE_CACHE_KEY);
            const queue = existingStr ? JSON.parse(existingStr) : [];
            queue.push(action);
            localStorage.setItem(QUEUE_CACHE_KEY, JSON.stringify(queue));
        }
        catch (e) { }
    }
    /**
     * Flush queued offline views & reactions when connection is restored
     */
    static async flushOfflineQueue() {
        try {
            if (typeof localStorage === 'undefined')
                return;
            const existingStr = localStorage.getItem(QUEUE_CACHE_KEY);
            if (!existingStr)
                return;
            const queue = JSON.parse(existingStr);
            if (queue.length === 0)
                return;
            localStorage.removeItem(QUEUE_CACHE_KEY);
            for (const item of queue) {
                try {
                    if (item.type === 'view') {
                        await this.markStoryViewed(item.storyId);
                    }
                    else if (item.type === 'react' && item.reactionType) {
                        await this.reactToStory(item.storyId, item.reactionType);
                    }
                }
                catch (e) {
                    console.warn('[StoryService] Error processing offline item:', item, e);
                }
            }
        }
        catch (e) { }
    }
}
