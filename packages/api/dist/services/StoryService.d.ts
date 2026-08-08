export interface StoryTrayItem {
    author_id: string;
    username: string;
    display_name: string;
    avatar_url: string;
    stories_count: number;
    unseen_count: number;
    latest_story_created_at: string;
    is_own_story: boolean;
}
export interface StoryItem {
    id: string;
    user_id: string;
    media_url: string;
    media_type: 'image' | 'video';
    thumbnail_url?: string;
    caption?: string;
    stickers?: any[];
    text_overlays?: any[];
    location?: string;
    music_track?: any;
    width?: number;
    height?: number;
    aspect_ratio?: number;
    duration?: number;
    file_size?: number;
    mime_type?: string;
    expires_at: string;
    created_at: string;
    user?: {
        id: string;
        username: string;
        display_name?: string;
        avatar_url?: string;
    };
    views_count?: number;
    is_viewed?: boolean;
    my_reaction?: string | null;
}
export interface StoryViewerItem {
    id: string;
    user_id: string;
    username: string;
    display_name: string;
    avatar_url: string;
    viewed_at: string;
}
export interface CreateStoryPayload {
    media_url: string;
    media_type: 'image' | 'video';
    thumbnail_url?: string;
    caption?: string;
    stickers?: any[];
    text_overlays?: any[];
    location?: string;
    music_track?: any;
    width?: number;
    height?: number;
    aspect_ratio?: number;
    duration?: number;
    file_size?: number;
    mime_type?: string;
}
export declare class StoryService {
    private static isInitialized;
    static initOfflineSync(): void;
    /**
     * Helper to retrieve cached tray items when offline
     */
    static getCachedTray(): StoryTrayItem[];
    private static setCachedTray;
    /**
     * Fetch Story Tray grouped by creator
     */
    static getStoryTray(): Promise<StoryTrayItem[]>;
    /**
     * Fetch stories for a target creator
     */
    static getUserStories(targetUserId: string): Promise<StoryItem[]>;
    /**
     * Publish a new story with retry pipeline
     */
    static createStory(payload: CreateStoryPayload): Promise<StoryItem>;
    /**
     * Delete story (Story owner only)
     */
    static deleteStory(storyId: string): Promise<boolean>;
    /**
     * Mark story as viewed (queues offline if disconnected)
     */
    static markStoryViewed(storyId: string): Promise<void>;
    /**
     * Toggle or add emoji reaction to a story (queues offline if disconnected)
     */
    static reactToStory(storyId: string, reactionType: string): Promise<{
        reaction: string | null;
        action: 'added' | 'removed';
    }>;
    /**
     * Fetch viewer list for a story (Story owner only)
     */
    static getStoryViewers(storyId: string): Promise<StoryViewerItem[]>;
    /**
     * Subscribe to realtime story changes
     */
    static subscribeToStories(onChange: () => void): () => void;
    /**
     * Enqueue offline action to local storage
     */
    private static enqueueOfflineAction;
    /**
     * Flush queued offline views & reactions when connection is restored
     */
    static flushOfflineQueue(): Promise<void>;
}
