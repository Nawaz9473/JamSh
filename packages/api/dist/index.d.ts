import { UserProfile, Post, ChatRoom, Message, LiveStream, Notification, NotificationCounts } from '@jamsh/types';
export declare const JamshNearby: any;
/**
 * Checks and requests location and bluetooth permissions on native platforms.
 * Returns true if both permissions are granted, or if we are not on a native platform.
 */
export declare function requestNearbyPermissions(): Promise<boolean>;
export declare function uuidv4(): string;
export declare function constantTimeCompare(a: string, b: string): boolean;
export declare function encodeLengthPrefixed(field: string): string;
export declare function hmacSHA256(keyHex: string, message: string): Promise<string>;
export declare const nearbyPeers: Map<string, {
    ip: string;
    lastSeen: number;
    isOnline?: boolean;
}>;
export declare const supabase: import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
interface AuthState {
    user: any | null;
    profile: UserProfile | null;
    deviceKeyPair: {
        privateKey: string;
        publicKey: string;
    } | null;
    groupKeys: Record<string, string>;
    setSession: (user: any, profile: UserProfile | null) => void;
    setDeviceKeyPair: (keys: {
        privateKey: string;
        publicKey: string;
    } | null) => void;
    addGroupKey: (roomId: string, keyHex: string) => void;
    logout: () => Promise<void>;
}
export declare const useAuthStore: import("zustand").UseBoundStore<import("zustand").StoreApi<AuthState>>;
declare class LocalMockDatabase {
    private getStore;
    private setStore;
    getUsers(): any;
    setUsers(users: any): void;
    getProfiles(): UserProfile[];
    setProfiles(profiles: any): void;
    getPosts(): any[];
    setPosts(posts: any): void;
    getFollowers(): any;
    setFollowers(followers: any): void;
    getChatRooms(): any;
    setChatRooms(rooms: any): void;
    getMessages(): Message[];
    setMessages(messages: any): void;
    getReactions(): any;
    setReactions(reactions: any): void;
    getVideos(): any[];
    setVideos(videos: any): void;
    getVideoLikes(): any;
    setVideoLikes(likes: any): void;
    getVideoComments(): any;
    setVideoComments(comments: any): void;
    getVideoSaves(): any;
    setVideoSaves(saves: any): void;
    getVideoInteractions(): any;
    setVideoInteractions(interactions: any): void;
    getWatchHistory(): any;
    setWatchHistory(history: any): void;
    getComments(): any;
    setComments(comments: any): void;
    getSaves(): any;
    setSaves(saves: any): void;
    getShares(): any;
    setShares(shares: any): void;
    getNotifications(): any;
    setNotifications(notifs: any): void;
}
export declare const mockDb: LocalMockDatabase;
export declare function signInUser(contact: string, password: string): Promise<{
    user: any;
    profile: UserProfile;
}>;
export declare function signUpUser(contact: string, username: string, displayName: string, birthday: string, password: string): Promise<{
    user: any;
    profile: UserProfile;
}>;
export declare function fetchProfile(userId: string): Promise<UserProfile | null>;
export declare function updateProfile(profileUpdates: Partial<UserProfile>): Promise<UserProfile>;
export declare function searchUsers(query: string): Promise<UserProfile[]>;
export declare function forgotPassword(email: string, redirectTo: string): Promise<void>;
export declare function updatePassword(password: string): Promise<void>;
export declare function signInWithGoogle(redirectTo?: string): Promise<void>;
export declare function sendPhoneOtp(phone: string): Promise<void>;
export declare function verifyPhoneOtp(phone: string, token: string): Promise<{
    user: any;
    profile: UserProfile;
}>;
export declare function setupAuthListener(): () => void;
export declare function fetchFeed(page?: number, limit?: number): Promise<Post[]>;
export declare function createPost(content: string, type: 'text' | 'image' | 'video' | 'multiple', mediaUrls: string[]): Promise<Post>;
export declare function toggleThunderReaction(postId: string, commentId?: string): Promise<{
    thundered: boolean;
    countChange: number;
}>;
export declare function checkIfFollowing(followerId: string, followingId: string): Promise<boolean>;
export declare function followUser(followingId: string): Promise<string>;
export declare function fetchFollowers(userId: string): Promise<UserProfile[]>;
export declare function fetchFollowing(userId: string): Promise<UserProfile[]>;
export declare function cacheProfile(profile: UserProfile): void;
export declare function getCachedProfiles(): UserProfile[];
export declare function cachePublicKey(myUserId: string, peerId: string, publicKey: string): void;
export declare function getCachedPublicKey(myUserId: string, peerId: string): string | null;
export declare function addMessageToQueue(messageId: string, roomId: string, recipientId: string, envelope: any): Promise<void>;
export declare function getPendingMessages(): Promise<any[]>;
export declare function removeMessageFromQueue(messageId: string): Promise<void>;
export declare function startNearbyAdvertising(myUserId: string, username: string): Promise<void>;
export declare function stopNearbyAdvertising(): Promise<void>;
export declare function startNearbyScanning(myUserId: string): Promise<void>;
export declare function stopNearbyScanning(): Promise<void>;
export declare function checkIsOnline(): Promise<boolean>;
export declare function syncOfflineQueue(myUserId: string): Promise<void>;
export declare function initializeNearbyListeners(myUserId: string): Promise<void>;
export declare function fetchChatRooms(): Promise<any[]>;
export declare function createChatRoom(peerId: string): Promise<ChatRoom>;
export declare function fetchMessages(roomId: string): Promise<Message[]>;
export declare function sendEncryptedMessage(roomId: string, recipientId: string, plaintext: string): Promise<Message>;
export declare function decryptReceivedMessage(message: Message, senderId: string): Promise<string>;
export declare function setupCallSignalChannel(roomId: string, onSignal: (signal: any) => void): {
    sendSignal: (signal: any) => void;
    disconnect: () => void;
};
export declare function startLiveStream(title: string): Promise<LiveStream>;
export declare function endLiveStream(streamId: string): Promise<void>;
export declare function createGroupRoom(name: string, description: string, avatarUrl: string, memberIds: string[]): Promise<any>;
export declare function addGroupMembers(roomId: string, memberIds: string[]): Promise<void>;
export declare function removeGroupMember(roomId: string, targetUserId: string): Promise<void>;
export declare function promoteToAdmin(roomId: string, targetUserId: string): Promise<void>;
export declare function demoteToAdmin(roomId: string, targetUserId: string): Promise<void>;
export declare function editGroupInfo(roomId: string, updates: {
    name?: string;
    description?: string;
    avatarUrl?: string;
}): Promise<void>;
export declare function deleteGroup(roomId: string): Promise<void>;
export declare function leaveGroup(roomId: string): Promise<void>;
export declare function syncGroupKeys(): Promise<void>;
export declare function fetchExploreFeed(category?: string, page?: number, limit?: number): Promise<any[]>;
export declare function fetchTrendingContent(): Promise<any>;
export declare function fetchSearchSuggestions(query: string): Promise<any[]>;
export declare function searchExploreAll(query: string): Promise<any>;
export declare function logSearchQuery(query: string): Promise<void>;
export declare function initializeE2EKeys(userId: string, deviceId: string): Promise<{
    privateKey: string;
    publicKey: string;
}>;
export declare function fetchReelsFeed(limit?: number, cursorTimestamp?: string, cursorId?: string): Promise<any[]>;
export declare function likeReel(videoId: string): Promise<{
    liked: boolean;
    countChange: number;
}>;
export declare function commentOnReel(videoId: string, content: string, parentId?: string): Promise<any>;
export declare function trackVideoInteraction(videoId: string, type: 'watch' | 'like' | 'share' | 'save' | 'comment' | 'skip' | 'report' | 'hide' | 'not_interested', watchTime?: number, watchPercent?: number): Promise<void>;
export declare function uploadReel(videoUrl: string, thumbnailUrl: string, caption: string, hashtags: string[], interests: string[], duration: number): Promise<any>;
export interface QueuedEngagementAction {
    id: string;
    type: 'thunder' | 'comment' | 'save' | 'share';
    postId: string;
    payload: any;
    createdAt: number;
}
export declare function queueOfflineEngagement(type: 'thunder' | 'comment' | 'save' | 'share', postId: string, payload?: any): void;
export declare function syncOfflineEngagementQueue(): Promise<void>;
export declare function addComment(postId: string, content: string, parentId?: string): Promise<any>;
export declare function editComment(commentId: string, content: string): Promise<any>;
export declare function deleteComment(commentId: string): Promise<void>;
export declare function fetchComments(postId: string, sortBy?: string, page?: number, limit?: number): Promise<any[]>;
export declare function toggleSavePost(postId: string): Promise<{
    saved: boolean;
}>;
export declare function shareContent(postId: string, targetType?: string, targetId?: string): Promise<any>;
export declare function logPostView(postId: string, watchTime?: number): Promise<any>;
export declare function fetchNotifications(page?: number, limit?: number, category?: string): Promise<Notification[]>;
export declare function fetchUnreadCounts(): Promise<NotificationCounts>;
export declare function markNotificationAsRead(id: string): Promise<boolean>;
export declare function markAllNotificationsAsRead(): Promise<boolean>;
export declare function deleteNotification(id: string): Promise<boolean>;
export {};
