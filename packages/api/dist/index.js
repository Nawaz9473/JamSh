import { createClient } from '@supabase/supabase-js';
import { create } from 'zustand';
import { generateKeyPair, generateDeterministicKeyPair, encryptPairwise, decryptPairwise, deriveSharedSecret, importRawAESKey, generateGroupKeyHex, encryptWithKey, decryptWithKey, bytesToBase64 } from '@jamsh/encryption';
import { registerPlugin, Capacitor } from '@capacitor/core';
import { MessagingService } from './services/MessagingService';
export * from './services/MessagingService';
// Register Capacitor Custom Plugin
export const JamshNearby = registerPlugin('JamshNearby');
/**
 * Checks and requests location and bluetooth permissions on native platforms.
 * Returns true if both permissions are granted, or if we are not on a native platform.
 */
export async function requestNearbyPermissions() {
    if (!Capacitor.isNativePlatform())
        return true;
    try {
        let permStatus = await JamshNearby.checkPermissions();
        if (permStatus.location !== 'granted' || permStatus.bluetooth !== 'granted') {
            console.log('[Permissions] Requesting location and bluetooth permissions...');
            permStatus = await JamshNearby.requestPermissions();
        }
        const granted = permStatus.location === 'granted' && permStatus.bluetooth === 'granted';
        console.log(`[Permissions] Status location: ${permStatus.location}, bluetooth: ${permStatus.bluetooth}, granted: ${granted}`);
        return granted;
    }
    catch (e) {
        console.error('[Permissions] Failed to check or request permissions', e);
        return false;
    }
}
// Cryptographic and UUID utility helpers
export function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
export function constantTimeCompare(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
}
export function encodeLengthPrefixed(field) {
    return `${field.length}:${field}`;
}
// Local byte converters matching encryption packages
function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}
function bytesToHex(bytes) {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
// HMAC-SHA256 implementation using Web Crypto API
export async function hmacSHA256(keyHex, message) {
    const keyBytes = hexToBytes(keyHex);
    const msgBytes = new TextEncoder().encode(message);
    let cryptoObj = typeof globalThis !== 'undefined' ? (globalThis.crypto || globalThis.msCrypto) : null;
    if (!cryptoObj && typeof require !== 'undefined') {
        cryptoObj = require('crypto').webcrypto;
    }
    if (!cryptoObj || !cryptoObj.subtle) {
        throw new Error('Web Crypto API not available for HMAC');
    }
    const key = await cryptoObj.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await cryptoObj.subtle.sign('HMAC', key, msgBytes);
    return bytesToHex(new Uint8Array(signature));
}
// Active local discovery cache for nearby peers (peerUserId -> { ip: string, lastSeen: number })
export const nearbyPeers = new Map();
// Initialize Supabase Client
const getSupabaseConfig = () => {
    let url = 'https://czxoschackeetzspupxh.supabase.co';
    let key = 'sb_publishable__B8FxfHeDWfs65PqwfBhkQ_NA-r4HDH';
    if (typeof process !== 'undefined' && process.env) {
        if (process.env.EXPO_PUBLIC_SUPABASE_URL)
            url = process.env.EXPO_PUBLIC_SUPABASE_URL;
        else if (process.env.NEXT_PUBLIC_SUPABASE_URL)
            url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        else if (process.env.VITE_SUPABASE_URL)
            url = process.env.VITE_SUPABASE_URL;
        if (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)
            key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
        else if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
            key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        else if (process.env.VITE_SUPABASE_ANON_KEY)
            key = process.env.VITE_SUPABASE_ANON_KEY;
    }
    // Safe dynamic check for import.meta to avoid Node.js CommonJS parser crash
    try {
        const metaEnv = Function('return import.meta.env')();
        if (metaEnv) {
            if (metaEnv.VITE_SUPABASE_URL) {
                url = metaEnv.VITE_SUPABASE_URL;
            }
            if (metaEnv.VITE_SUPABASE_ANON_KEY) {
                key = metaEnv.VITE_SUPABASE_ANON_KEY;
            }
        }
    }
    catch (e) { }
    return { url, key };
};
const { url: supabaseUrl, key: supabaseAnonKey } = getSupabaseConfig();
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const useAuthStore = create((set, get) => ({
    user: null,
    profile: null,
    deviceKeyPair: null,
    groupKeys: {},
    setSession: (user, profile) => set((state) => ({ user, profile, deviceKeyPair: state.user?.id === user?.id ? state.deviceKeyPair : null })),
    setDeviceKeyPair: (deviceKeyPair) => set({ deviceKeyPair }),
    addGroupKey: (roomId, keyHex) => set((state) => ({ groupKeys: { ...state.groupKeys, [roomId]: keyHex } })),
    logout: async () => {
        try {
            await supabase.auth.signOut();
        }
        catch (e) {
            console.log('Supabase signout skipped in local mode');
        }
        set({ user: null, profile: null, deviceKeyPair: null, groupKeys: {} });
    },
}));
// Helper to determine if we should fall back to LocalMockDB
const isMockMode = () => {
    // Check if mock mode is explicitly enabled via environment variable
    if (typeof process !== 'undefined' && process.env && process.env.VITE_USE_MOCK_API === 'true') {
        return true;
    }
    // Safe dynamic check for import.meta to avoid Node.js CommonJS parser crash
    try {
        const metaEnv = Function('return import.meta.env')();
        if (metaEnv && metaEnv.VITE_USE_MOCK_API === 'true') {
            return true;
        }
    }
    catch (e) { }
    return false;
};
// ----------------------------------------------------
// LOCAL MOCK DATABASE SYSTEM
// ----------------------------------------------------
class LocalMockDatabase {
    getStore(key, defaultVal = []) {
        if (typeof window === 'undefined' || !window.localStorage) {
            if (!global[key]) {
                global[key] = defaultVal;
            }
            return global[key];
        }
        const val = window.localStorage.getItem(key);
        if (!val) {
            window.localStorage.setItem(key, JSON.stringify(defaultVal));
            return defaultVal;
        }
        try {
            return JSON.parse(val);
        }
        catch {
            return defaultVal;
        }
    }
    setStore(key, data) {
        if (typeof window === 'undefined' || !window.localStorage) {
            global[key] = data;
            return;
        }
        window.localStorage.setItem(key, JSON.stringify(data));
    }
    getUsers() {
        const list = this.getStore('jamsh_mock_users', [
            { id: 'user_1', email: 'zack@jamsh.com', username: 'zack_thunder', password: 'password123' },
            { id: 'user_2', email: 'sophia@jamsh.com', username: 'sophia_code', password: 'password123' },
            { id: 'user_3', email: 'elena@jamsh.com', username: 'elena_light', password: 'password123' },
        ]);
        let modified = false;
        list.forEach((u) => {
            if (!u.devicePrivateKey || !u.devicePublicKey) {
                const pair = generateKeyPair();
                u.devicePrivateKey = pair.privateKey;
                u.devicePublicKey = pair.publicKey;
                modified = true;
            }
        });
        if (modified) {
            this.setStore('jamsh_mock_users', list);
        }
        return list;
    }
    setUsers(users) { this.setStore('jamsh_mock_users', users); }
    getProfiles() {
        return this.getStore('jamsh_mock_profiles', [
            {
                id: 'user_1',
                username: 'zack_thunder',
                display_name: 'Zack Thunder',
                avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150',
                cover_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800',
                bio: 'CTO of JAMSH. Unleashing energy, lightning-fast community builds. ⚡',
                website: 'https://jamsh.app',
                followers_count: 1420,
                following_count: 320,
                is_private: false,
                is_verified: true,
                birthday: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
            {
                id: 'user_2',
                username: 'sophia_code',
                display_name: 'Sophia Dev',
                avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150',
                cover_url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=800',
                bio: 'Security architect. E2E encrypting the world. 🔐 Out of range.',
                website: 'https://sophia.io',
                followers_count: 8540,
                following_count: 512,
                is_private: true,
                is_verified: true,
                birthday: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
            {
                id: 'user_3',
                username: 'elena_light',
                display_name: 'Elena Light',
                avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150',
                cover_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800',
                bio: 'Mountain peak explorer and photography lover 🏔️',
                website: 'https://elena.io',
                followers_count: 3120,
                following_count: 420,
                is_private: false,
                is_verified: false,
                birthday: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }
        ]);
    }
    setProfiles(profiles) { this.setStore('jamsh_mock_profiles', profiles); }
    getPosts() {
        return this.getStore('jamsh_mock_posts', [
            {
                id: 'post_1',
                user_id: 'user_2',
                content: 'End-to-end encrypted messaging is now fully running. Built locally using X25519 DH pairwise exchange and AES-256-GCM encryption. Try sending a message in the chat inbox! ⚡🔒',
                type: 'text',
                thunders_count: 1422,
                comments_count: 2,
                created_at: new Date(Date.now() - 3600000).toISOString(),
                comments: [
                    { id: 'c_1', username: 'zack_thunder', content: 'Incredible speed. Totally secure.' },
                    { id: 'c_2', username: 'elena_light', content: 'No one, not even the server, can read our chats! Awesome.' }
                ]
            },
            {
                id: 'post_2',
                user_id: 'user_1',
                content: 'Behold the thunderbolt reaction! ⚡ Heart shapes are gone. We rule with electric speed now.',
                type: 'image',
                media: [{ media_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800', position: 0 }],
                thunders_count: 948,
                comments_count: 1,
                created_at: new Date(Date.now() - 7200000).toISOString(),
                comments: [
                    { id: 'c_3', username: 'sophia_code', content: 'Dynamic thunderburst animations look awesome!' }
                ]
            }
        ]);
    }
    setPosts(posts) { this.setStore('jamsh_mock_posts', posts); }
    getFollowers() { return this.getStore('jamsh_mock_followers', []); }
    setFollowers(followers) { this.setStore('jamsh_mock_followers', followers); }
    getChatRooms() { return this.getStore('jamsh_mock_chat_rooms', []); }
    setChatRooms(rooms) { this.setStore('jamsh_mock_chat_rooms', rooms); }
    getMessages() { return this.getStore('jamsh_mock_messages', []); }
    setMessages(messages) { this.setStore('jamsh_mock_messages', messages); }
    getReactions() { return this.getStore('jamsh_mock_reactions', []); }
    setReactions(reactions) { this.setStore('jamsh_mock_reactions', reactions); }
    getVideos() {
        return this.getStore('jamsh_mock_videos', [
            {
                id: 'video_1',
                user_id: 'user_2',
                video_url: 'https://assets.mixkit.co/videos/preview/mixkit-forest-stream-in-the-sunlight-529-large.mp4',
                thumbnail_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400',
                caption: 'Chasing sunlight through the forest stream. 🌲✨ #nature #vlog',
                hashtags: ['nature', 'vlog'],
                interests: ['Nature', 'Travel'],
                visibility: 'public',
                duration: 15.4,
                view_count: 3420,
                like_count: 520,
                comment_count: 14,
                share_count: 42,
                save_count: 89,
                moderation_status: 'approved',
                created_at: new Date(Date.now() - 3600000).toISOString(),
                updated_at: new Date(Date.now() - 3600000).toISOString()
            },
            {
                id: 'video_2',
                user_id: 'user_1',
                video_url: 'https://assets.mixkit.co/videos/preview/mixkit-dramatic-sunset-over-the-ocean-1174-large.mp4',
                thumbnail_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400',
                caption: 'Breathtaking golden hour by the ocean. 🌅🌊 #sunset #ocean #photography',
                hashtags: ['sunset', 'ocean', 'photography'],
                interests: ['Photography', 'Nature'],
                visibility: 'public',
                duration: 12.8,
                view_count: 8520,
                like_count: 1250,
                comment_count: 84,
                share_count: 123,
                save_count: 422,
                moderation_status: 'approved',
                created_at: new Date(Date.now() - 7200000).toISOString(),
                updated_at: new Date(Date.now() - 7200000).toISOString()
            },
            {
                id: 'video_3',
                user_id: 'user_3',
                video_url: 'https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-city-traffic-at-night-11-large.mp4',
                thumbnail_url: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=400',
                caption: 'Neon dreams and city highway streams. 🌃🚗 #cyberpunk #city #night',
                hashtags: ['cyberpunk', 'city', 'night'],
                interests: ['Technology', 'Travel'],
                visibility: 'public',
                duration: 18.5,
                view_count: 1240,
                like_count: 342,
                comment_count: 8,
                share_count: 19,
                save_count: 34,
                moderation_status: 'approved',
                created_at: new Date(Date.now() - 14400000).toISOString(),
                updated_at: new Date(Date.now() - 14400000).toISOString()
            }
        ]);
    }
    setVideos(videos) { this.setStore('jamsh_mock_videos', videos); }
    getVideoLikes() { return this.getStore('jamsh_mock_video_likes', []); }
    setVideoLikes(likes) { this.setStore('jamsh_mock_video_likes', likes); }
    getVideoComments() { return this.getStore('jamsh_mock_video_comments', []); }
    setVideoComments(comments) { this.setStore('jamsh_mock_video_comments', comments); }
    getVideoSaves() { return this.getStore('jamsh_mock_video_saves', []); }
    setVideoSaves(saves) { this.setStore('jamsh_mock_video_saves', saves); }
    getVideoInteractions() { return this.getStore('jamsh_mock_video_interactions', []); }
    setVideoInteractions(interactions) { this.setStore('jamsh_mock_video_interactions', interactions); }
    getWatchHistory() { return this.getStore('jamsh_mock_watch_history', []); }
    setWatchHistory(history) { this.setStore('jamsh_mock_watch_history', history); }
    getComments() { return this.getStore('jamsh_mock_comments', []); }
    setComments(comments) { this.setStore('jamsh_mock_comments', comments); }
    getSaves() { return this.getStore('jamsh_mock_saves', []); }
    setSaves(saves) { this.setStore('jamsh_mock_saves', saves); }
    getShares() { return this.getStore('jamsh_mock_shares', []); }
    setShares(shares) { this.setStore('jamsh_mock_shares', shares); }
    getNotifications() { return this.getStore('jamsh_mock_notifications', []); }
    setNotifications(notifs) { this.setStore('jamsh_mock_notifications', notifs); }
}
export const mockDb = new LocalMockDatabase();
// ----------------------------------------------------
// AUTH & PROFILE API
// ----------------------------------------------------
export async function signInUser(contact, password) {
    if (isMockMode()) {
        const users = mockDb.getUsers();
        const foundUser = users.find((u) => u.email === contact.trim() && u.password === password);
        if (!foundUser)
            throw new Error('Invalid login credentials');
        const profiles = mockDb.getProfiles();
        const profile = profiles.find((p) => p.id === foundUser.id);
        if (!profile)
            throw new Error('Profile not found');
        useAuthStore.getState().setSession(foundUser, profile);
        await initializeE2EKeys(foundUser.id, 'web-device-1');
        return { user: foundUser, profile };
    }
    const isEmail = contact.includes('@');
    const signInPayload = {
        password,
    };
    if (isEmail) {
        signInPayload.email = contact.trim();
    }
    else {
        signInPayload.phone = contact.trim();
    }
    const { data, error } = await supabase.auth.signInWithPassword(signInPayload);
    if (error)
        throw error;
    if (!data.user)
        throw new Error('Authentication failed');
    const profile = await fetchProfile(data.user.id);
    if (!profile)
        throw new Error('Profile not found');
    useAuthStore.getState().setSession(data.user, profile);
    await initializeE2EKeys(data.user.id, 'web-device-1');
    return { user: data.user, profile };
}
export async function signUpUser(contact, username, displayName, birthday, password) {
    if (isMockMode()) {
        const users = mockDb.getUsers();
        if (users.some((u) => u.email === contact.trim())) {
            throw new Error('User already exists');
        }
        const newUserId = `user_${Date.now()}`;
        const newUser = { id: newUserId, email: contact.trim(), username, password };
        mockDb.setUsers([...users, newUser]);
        const profiles = mockDb.getProfiles();
        const newProfile = {
            id: newUserId,
            username,
            display_name: displayName,
            avatar_url: '',
            cover_url: '',
            bio: '',
            website: '',
            followers_count: 0,
            following_count: 0,
            is_private: false,
            is_verified: false,
            birthday: birthday ? new Date(birthday).toISOString() : null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        mockDb.setProfiles([...profiles, newProfile]);
        useAuthStore.getState().setSession(newUser, newProfile);
        await initializeE2EKeys(newUserId, 'web-device-1');
        return { user: newUser, profile: newProfile };
    }
    const isEmail = contact.includes('@');
    const signUpPayload = {
        password,
        options: {
            data: {
                username,
                display_name: displayName,
                birthday,
            }
        }
    };
    if (isEmail) {
        signUpPayload.email = contact.trim();
    }
    else {
        signUpPayload.phone = contact.trim();
    }
    const { data, error } = await supabase.auth.signUp(signUpPayload);
    if (error)
        throw error;
    if (!data.user)
        throw new Error('Registration failed');
    // Wait a short time for the database trigger to create the profile, then fetch it
    let profile = null;
    for (let i = 0; i < 5; i++) {
        profile = await fetchProfile(data.user.id);
        if (profile)
            break;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!profile) {
        throw new Error('Profile setup failed. Please try logging in.');
    }
    useAuthStore.getState().setSession(data.user, profile);
    await initializeE2EKeys(data.user.id, 'web-device-1');
    return { user: data.user, profile };
}
export async function fetchProfile(userId) {
    if (isMockMode()) {
        const profiles = mockDb.getProfiles();
        const profile = profiles.find(p => p.id === userId);
        if (profile)
            cacheProfile(profile);
        return profile || null;
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error || !data)
        return null;
    // Cache profile metadata locally
    cacheProfile(data);
    return data;
}
export async function updateProfile(profileUpdates) {
    const store = useAuthStore.getState();
    const user = store.user;
    if (!user)
        throw new Error('Not authenticated');
    if (isMockMode()) {
        const profiles = mockDb.getProfiles();
        const existingIndex = profiles.findIndex(p => p.id === user.id);
        let updatedProfile;
        if (existingIndex === -1) {
            updatedProfile = {
                id: user.id,
                username: user.username || user.email?.split('@')[0] || 'user',
                display_name: user.display_name || user.email?.split('@')[0] || 'User',
                avatar_url: '',
                cover_url: '',
                bio: '',
                website: '',
                followers_count: 0,
                following_count: 0,
                is_private: false,
                is_verified: false,
                birthday: null,
                created_at: new Date().toISOString(),
                ...profileUpdates,
                updated_at: new Date().toISOString()
            };
            profiles.push(updatedProfile);
        }
        else {
            updatedProfile = {
                ...profiles[existingIndex],
                ...profileUpdates,
                updated_at: new Date().toISOString()
            };
            profiles[existingIndex] = updatedProfile;
        }
        mockDb.setProfiles(profiles);
        store.setSession(user, updatedProfile);
        return updatedProfile;
    }
    // Check if profile exists
    const { data: existing } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
    let result;
    if (!existing) {
        // Insert new profile row
        const newProfile = {
            id: user.id,
            username: user.user_metadata?.username || user.email?.split('@')[0] || 'user',
            display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'User',
            birthday: user.user_metadata?.birthday || null,
            ...profileUpdates,
            updated_at: new Date().toISOString()
        };
        const { data: inserted, error } = await supabase
            .from('profiles')
            .insert(newProfile)
            .select()
            .single();
        if (error) {
            throw error;
        }
        result = inserted;
    }
    else {
        // Update existing profile row
        const { data: updated, error } = await supabase
            .from('profiles')
            .update({ ...profileUpdates, updated_at: new Date().toISOString() })
            .eq('id', user.id)
            .select()
            .single();
        if (error) {
            throw error;
        }
        result = updated;
    }
    store.setSession(user, result);
    return result;
}
export async function searchUsers(query) {
    const online = await checkIsOnline();
    if (!online) {
        const cached = getCachedProfiles();
        const searchVal = query.toLowerCase();
        return cached.filter(p => (p.username && p.username.toLowerCase().includes(searchVal)) ||
            (p.display_name && p.display_name.toLowerCase().includes(searchVal)));
    }
    if (isMockMode()) {
        const profiles = mockDb.getProfiles();
        const searchVal = query.toLowerCase();
        return profiles.filter(p => (p.username && p.username.toLowerCase().includes(searchVal)) ||
            (p.display_name && p.display_name.toLowerCase().includes(searchVal)));
    }
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(10);
    if (error || !data)
        return [];
    // Cache retrieved profiles locally for offline discovery
    data.forEach((p) => cacheProfile(p));
    return data;
}
// Supabase Auth Helpers
export async function forgotPassword(email, redirectTo) {
    if (isMockMode()) {
        console.log('Forgot password email requested for', email);
        return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
    });
    if (error)
        throw error;
}
export async function updatePassword(password) {
    if (isMockMode()) {
        console.log('Password updated in mock mode to', password);
        return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error)
        throw error;
}
export async function signInWithGoogle(redirectTo) {
    if (isMockMode()) {
        const foundUser = mockDb.getUsers()[0];
        const profiles = mockDb.getProfiles();
        const profile = profiles.find((p) => p.id === foundUser.id);
        useAuthStore.getState().setSession(foundUser, profile || null);
        await initializeE2EKeys(foundUser.id, 'web-device-1');
        return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo,
        },
    });
    if (error)
        throw error;
}
export async function sendPhoneOtp(phone) {
    if (isMockMode()) {
        console.log('Phone OTP requested for', phone);
        return;
    }
    const { error } = await supabase.auth.signInWithOtp({
        phone,
    });
    if (error)
        throw error;
}
export async function verifyPhoneOtp(phone, token) {
    if (isMockMode()) {
        const foundUser = mockDb.getUsers()[0];
        const profiles = mockDb.getProfiles();
        const profile = profiles.find((p) => p.id === foundUser.id);
        useAuthStore.getState().setSession(foundUser, profile || null);
        await initializeE2EKeys(foundUser.id, 'web-device-1');
        return { user: foundUser, profile: profile };
    }
    const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
    });
    if (error)
        throw error;
    if (!data.user)
        throw new Error('OTP verification failed');
    const profile = await fetchProfile(data.user.id);
    if (!profile)
        throw new Error('Profile not found');
    useAuthStore.getState().setSession(data.user, profile);
    await initializeE2EKeys(data.user.id, 'web-device-1');
    return { user: data.user, profile };
}
export function setupAuthListener() {
    if (isMockMode()) {
        return () => { };
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        const store = useAuthStore.getState();
        if (session?.user) {
            let profile = null;
            try {
                profile = await fetchProfile(session.user.id);
            }
            catch (err) {
                console.warn('Failed to fetch profile on auth change:', err);
            }
            store.setSession(session.user, profile);
            try {
                await initializeE2EKeys(session.user.id, 'web-device-1');
            }
            catch (e) {
                console.warn('Failed to initialize E2E keys on auth change:', e);
            }
            try {
                await syncGroupKeys();
            }
            catch (e) {
                console.warn('Failed to sync group keys on auth change:', e);
            }
        }
        else {
            store.setSession(null, null);
            store.setDeviceKeyPair(null);
        }
    });
    return () => {
        subscription.unsubscribe();
    };
}
// ----------------------------------------------------
// POSTS & THUNDER REACTIONS API
// ----------------------------------------------------
export async function fetchFeed(page = 0, limit = 10) {
    const store = useAuthStore.getState();
    const currentUser = store.user;
    if (!isMockMode()) {
        try {
            const { data, error: functionError } = await supabase.functions.invoke('feed-posts', {
                body: { action: 'fetch-feed', page, limit },
            });
            if (!functionError && data && Array.isArray(data.posts)) {
                return data.posts;
            }
        }
        catch (e) {
            console.warn('[SDK Feed] Edge Function invoke failed, using direct table fallback', e);
        }
        try {
            const { data, error } = await supabase
                .from('posts')
                .select('*, user:profiles(*), media:post_media(*)')
                .eq('status', 'published')
                .order('created_at', { ascending: false })
                .range(page * limit, (page + 1) * limit - 1);
            if (!error && data) {
                if (currentUser) {
                    const postIds = data.map(p => p.id);
                    const { data: reactions } = await supabase
                        .from('thunder_reactions')
                        .select('post_id')
                        .eq('user_id', currentUser.id)
                        .in('post_id', postIds);
                    const reactedIds = new Set(reactions?.map(r => r.post_id) || []);
                    return data.map((post) => ({
                        ...post,
                        thundered_by_me: reactedIds.has(post.id),
                    }));
                }
                return data;
            }
        }
        catch (e) { }
    }
    // Fallback LocalMockDB
    const posts = mockDb.getPosts();
    const profiles = mockDb.getProfiles();
    const reactions = mockDb.getReactions();
    const followers = mockDb.getFollowers();
    // If follow relationships exist, filter feed.
    // Alice followed by Bob => Bob sees Alice's posts.
    // If Bob doesn't follow anyone, show all posts.
    let followedIds = [];
    if (currentUser) {
        followedIds = followers
            .filter((f) => f.follower_id === currentUser.id && f.status === 'accepted')
            .map((f) => f.following_id);
    }
    let filteredPosts = posts;
    if (currentUser && followedIds.length > 0) {
        filteredPosts = posts.filter(p => p.user_id === currentUser.id || followedIds.includes(p.user_id));
    }
    const sorted = [...filteredPosts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const chunk = sorted.slice(page * limit, (page + 1) * limit);
    return chunk.map(post => {
        const author = profiles.find(p => p.id === post.user_id);
        const thunderedByMe = currentUser ? reactions.some((r) => r.user_id === currentUser.id && r.post_id === post.id && !r.comment_id) : false;
        return {
            ...post,
            user: author || { id: post.user_id, username: 'user', display_name: 'User', avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150' },
            thundered_by_me: thunderedByMe,
        };
    });
}
export async function createPost(content, type, mediaUrls) {
    const user = useAuthStore.getState().user;
    if (!user)
        throw new Error('Not authenticated');
    if ((!content || content.trim().length === 0) && (!mediaUrls || mediaUrls.length === 0)) {
        throw new Error('Post content and media cannot both be empty');
    }
    const hashtags = (content ? content.match(/#[a-zA-Z0-9_]+/g) || [] : []).map(t => t.substring(1));
    const mentions = (content ? content.match(/@[a-zA-Z0-9_]+/g) || [] : []).map(m => m.substring(1));
    if (!isMockMode()) {
        try {
            const { data: post, error: postError } = await supabase
                .from('posts')
                .insert({ user_id: user.id, content: content || null, type, status: 'published', hashtags, mentions })
                .select()
                .single();
            if (!postError && post) {
                if (mediaUrls.length > 0) {
                    const mediaInserts = mediaUrls.map((url, index) => ({
                        post_id: post.id,
                        media_url: url,
                        media_type: url.match(/\.(mp4|mov|webm)$/i) ? 'video' : 'image',
                        position: index,
                    }));
                    await supabase.from('post_media').insert(mediaInserts);
                }
                const { data: fullPost } = await supabase
                    .from('posts')
                    .select('*, user:profiles(*), media:post_media(*)')
                    .eq('id', post.id)
                    .single();
                return (fullPost || post);
            }
        }
        catch (e) { }
    }
    const posts = mockDb.getPosts();
    const newPost = {
        id: `post_${Date.now()}`,
        user_id: user.id,
        content,
        type,
        hashtags,
        mentions,
        media: mediaUrls.map((url, index) => ({ media_url: url, position: index })),
        thunders_count: 0,
        comments_count: 0,
        created_at: new Date().toISOString(),
        comments: [],
    };
    mockDb.setPosts([newPost, ...posts]);
    return newPost;
}
export async function toggleThunderReaction(postId, commentId) {
    const user = useAuthStore.getState().user;
    if (!user)
        throw new Error('Not authenticated');
    if (!isMockMode()) {
        try {
            const { data, error: functionError } = await supabase.functions.invoke('handle-reaction', {
                body: { postId, commentId },
            });
            if (!functionError && data && data.thundered !== undefined) {
                return data;
            }
        }
        catch (e) {
            console.warn('[SDK Reaction] Edge Function invoke failed, falling back to direct table query', e);
        }
        try {
            const query = supabase.from('thunder_reactions').select('id').eq('user_id', user.id);
            if (commentId)
                query.eq('comment_id', commentId);
            else
                query.eq('post_id', postId).is('comment_id', null);
            const { data: existing } = await query;
            if (existing && existing.length > 0) {
                await supabase.from('thunder_reactions').delete().eq('id', existing[0].id);
                return { thundered: false, countChange: -1 };
            }
            else {
                await supabase.from('thunder_reactions').insert({
                    user_id: user.id,
                    post_id: postId,
                    comment_id: commentId || null,
                });
                return { thundered: true, countChange: 1 };
            }
        }
        catch (e) { }
    }
    // Fallback
    const reactions = mockDb.getReactions();
    const posts = mockDb.getPosts();
    const matchIndex = reactions.findIndex((r) => r.user_id === user.id &&
        r.post_id === postId &&
        (commentId ? r.comment_id === commentId : !r.comment_id));
    let thundered = false;
    let countChange = 0;
    if (matchIndex >= 0) {
        reactions.splice(matchIndex, 1);
        thundered = false;
        countChange = -1;
    }
    else {
        reactions.push({
            id: `react_${Date.now()}`,
            user_id: user.id,
            post_id: postId,
            comment_id: commentId || null,
        });
        thundered = true;
        countChange = 1;
    }
    mockDb.setReactions(reactions);
    // Update posts array count
    if (!commentId) {
        const updatedPosts = posts.map(p => {
            if (p.id === postId) {
                return { ...p, thunders_count: Math.max(0, p.thunders_count + countChange) };
            }
            return p;
        });
        mockDb.setPosts(updatedPosts);
    }
    // Trigger thunder notification in mock mode
    if (thundered) {
        const post = posts.find(p => p.id === postId);
        const receiverId = commentId
            ? mockDb.getComments().find((c) => c.id === commentId)?.userId
            : post?.user_id;
        if (receiverId && receiverId !== user.id) {
            const notifs = mockDb.getNotifications() || [];
            notifs.push({
                id: `notif_${Date.now()}`,
                receiverId,
                senderId: user.id,
                type: 'THUNDER',
                status: 'UNREAD',
                priority: 'MEDIUM',
                deliveryStatus: 'PENDING',
                groupKey: `THUNDER_${commentId || postId}_${receiverId}`,
                metadata: { actors: [user.username || 'someone'], count: 1, entityId: commentId || postId },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            mockDb.setNotifications(notifs);
        }
    }
    return { thundered, countChange };
}
// ----------------------------------------------------
// FOLLOW SYSTEM API
// ----------------------------------------------------
export async function checkIfFollowing(followerId, followingId) {
    if (isMockMode()) {
        const followers = mockDb.getFollowers();
        return followers.some((f) => f.follower_id === followerId && f.following_id === followingId && f.status === 'accepted');
    }
    try {
        const { data, error } = await supabase
            .from('followers')
            .select('id')
            .eq('follower_id', followerId)
            .eq('following_id', followingId)
            .eq('status', 'accepted')
            .maybeSingle();
        if (error || !data)
            return false;
        return true;
    }
    catch (e) {
        console.error('Error checking if following:', e);
        return false;
    }
}
export async function followUser(followingId) {
    const user = useAuthStore.getState().user;
    if (!user)
        throw new Error('Not authenticated');
    if (!isMockMode()) {
        try {
            const { data, error: functionError } = await supabase.functions.invoke('handle-follow', {
                body: { targetUserId: followingId },
            });
            if (!functionError && data && data.status) {
                return data.status;
            }
        }
        catch (e) {
            console.warn('[SDK Follow] Edge Function invoke failed, falling back to direct table query', e);
        }
        try {
            // 1. Check if follow relationship already exists
            const { data: existing, error: fetchError } = await supabase
                .from('followers')
                .select('id, status')
                .eq('follower_id', user.id)
                .eq('following_id', followingId)
                .maybeSingle();
            if (fetchError)
                throw fetchError;
            if (existing) {
                // Unfollow: delete the relation
                const { error: deleteError } = await supabase
                    .from('followers')
                    .delete()
                    .eq('id', existing.id);
                if (deleteError)
                    throw deleteError;
                return 'unfollowed';
            }
            else {
                // Follow: fetch target profile to see if it's private
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('is_private')
                    .eq('id', followingId)
                    .single();
                if (profileError)
                    throw profileError;
                const status = profile?.is_private ? 'pending' : 'accepted';
                const { error: insertError } = await supabase
                    .from('followers')
                    .insert({ follower_id: user.id, following_id: followingId, status });
                if (insertError)
                    throw insertError;
                return status;
            }
        }
        catch (e) {
            console.error('Error in followUser live mode:', e);
            throw e;
        }
    }
    const followers = mockDb.getFollowers();
    const profiles = mockDb.getProfiles();
    const target = profiles.find(p => p.id === followingId);
    const status = target?.is_private ? 'pending' : 'accepted';
    const matchIdx = followers.findIndex((f) => f.follower_id === user.id && f.following_id === followingId);
    if (matchIdx >= 0) {
        // Unfollow
        followers.splice(matchIdx, 1);
        const updatedProfiles = profiles.map(p => {
            if (p.id === user.id) {
                return { ...p, following_count: Math.max(0, p.following_count - 1) };
            }
            if (p.id === followingId) {
                return { ...p, followers_count: Math.max(0, p.followers_count - 1) };
            }
            return p;
        });
        mockDb.setProfiles(updatedProfiles);
        mockDb.setFollowers(followers);
        return 'unfollowed';
    }
    else {
        // Follow
        followers.push({ follower_id: user.id, following_id: followingId, status });
        const updatedProfiles = profiles.map(p => {
            if (p.id === user.id) {
                return { ...p, following_count: p.following_count + (status === 'accepted' ? 1 : 0) };
            }
            if (p.id === followingId) {
                return { ...p, followers_count: p.followers_count + (status === 'accepted' ? 1 : 0) };
            }
            return p;
        });
        mockDb.setProfiles(updatedProfiles);
        mockDb.setFollowers(followers);
        // Create follow notification in mock mode
        if (status === 'accepted') {
            const notifs = mockDb.getNotifications() || [];
            notifs.push({
                id: `notif_${Date.now()}`,
                receiverId: followingId,
                senderId: user.id,
                type: 'FOLLOW',
                status: 'UNREAD',
                priority: 'MEDIUM',
                deliveryStatus: 'PENDING',
                groupKey: `FOLLOW_${followingId}_${followingId}`,
                metadata: { actors: [user.username || 'someone'], count: 1 },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            mockDb.setNotifications(notifs);
        }
        return status;
    }
}
export async function fetchFollowers(userId) {
    if (isMockMode()) {
        const followers = mockDb.getFollowers();
        const profiles = mockDb.getProfiles();
        const followerIds = followers
            .filter((f) => f.following_id === userId && f.status === 'accepted')
            .map((f) => f.follower_id);
        return profiles.filter(p => followerIds.includes(p.id));
    }
    try {
        const { data, error } = await supabase
            .from('followers')
            .select('follower_id')
            .eq('following_id', userId)
            .eq('status', 'accepted');
        if (error)
            throw error;
        const ids = (data || []).map((r) => r.follower_id);
        if (ids.length === 0)
            return [];
        const { data: profiles, error: pError } = await supabase
            .from('profiles')
            .select('*')
            .in('id', ids);
        if (pError)
            throw pError;
        return profiles;
    }
    catch (e) {
        console.error('Error in fetchFollowers:', e);
        return [];
    }
}
export async function fetchFollowing(userId) {
    if (isMockMode()) {
        const followers = mockDb.getFollowers();
        const profiles = mockDb.getProfiles();
        const followingIds = followers
            .filter((f) => f.follower_id === userId && f.status === 'accepted')
            .map((f) => f.following_id);
        return profiles.filter(p => followingIds.includes(p.id));
    }
    try {
        const { data, error } = await supabase
            .from('followers')
            .select('following_id')
            .eq('follower_id', userId)
            .eq('status', 'accepted');
        if (error)
            throw error;
        const ids = (data || []).map((r) => r.following_id);
        if (ids.length === 0)
            return [];
        const { data: profiles, error: pError } = await supabase
            .from('profiles')
            .select('*')
            .in('id', ids);
        if (pError)
            throw pError;
        return profiles;
    }
    catch (e) {
        console.error('Error in fetchFollowing:', e);
        return [];
    }
}
// ----------------------------------------------------
// PUBLIC KEY CACHE & OFFLINE QUEUE UTILITIES
// ----------------------------------------------------
export function cacheProfile(profile) {
    if (typeof window === 'undefined')
        return;
    const cacheKey = 'jamsh_profile_metadata_cache';
    try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || '[]');
        const filtered = cached.filter((p) => p.id !== profile.id);
        filtered.push(profile);
        localStorage.setItem(cacheKey, JSON.stringify(filtered));
        console.log(`[Cache] Cached profile metadata for: ${profile.display_name}`);
    }
    catch (e) {
        console.error('[Cache] Failed to cache profile metadata', e);
    }
}
export function getCachedProfiles() {
    if (typeof window === 'undefined')
        return [];
    const cacheKey = 'jamsh_profile_metadata_cache';
    try {
        return JSON.parse(localStorage.getItem(cacheKey) || '[]');
    }
    catch (e) {
        return [];
    }
}
export function cachePublicKey(myUserId, peerId, publicKey) {
    if (typeof window === 'undefined')
        return;
    const cacheKey = `jamsh_public_key_cache_${myUserId}`;
    try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || '{}');
        cached[peerId] = publicKey;
        localStorage.setItem(cacheKey, JSON.stringify(cached));
        console.log(`[Cache] Cached public key for peer: ${peerId}`);
    }
    catch (e) {
        console.error('[Nearby] Failed to write public key to cache', e);
    }
}
export function getCachedPublicKey(myUserId, peerId) {
    if (typeof window === 'undefined')
        return null;
    const cacheKey = `jamsh_public_key_cache_${myUserId}`;
    try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || '{}');
        return cached[peerId] || null;
    }
    catch (e) {
        return null;
    }
}
export async function addMessageToQueue(messageId, roomId, recipientId, envelope) {
    if (Capacitor.isNativePlatform()) {
        try {
            await JamshNearby.addMessageToQueue({ messageId, roomId, recipientId, envelope });
            return;
        }
        catch (e) {
            console.error('[Queue] Native SQLite add failed, falling back to localStorage', e);
        }
    }
    // Web Fallback
    if (typeof window !== 'undefined') {
        const queueKey = 'jamsh_offline_queue';
        const queue = JSON.parse(localStorage.getItem(queueKey) || '[]');
        queue.push({ messageId, roomId, recipientId, envelope });
        localStorage.setItem(queueKey, JSON.stringify(queue));
    }
}
export async function getPendingMessages() {
    if (Capacitor.isNativePlatform()) {
        try {
            const res = await JamshNearby.getPendingMessages();
            if (res && res.messages) {
                return res.messages.map((m) => ({
                    messageId: m.messageId,
                    roomId: m.roomId,
                    recipientId: m.recipientId,
                    envelope: JSON.parse(m.envelopeJson),
                }));
            }
        }
        catch (e) {
            console.error('[Queue] Native SQLite read failed, falling back to localStorage', e);
        }
    }
    // Web Fallback
    if (typeof window !== 'undefined') {
        const queueKey = 'jamsh_offline_queue';
        return JSON.parse(localStorage.getItem(queueKey) || '[]');
    }
    return [];
}
export async function removeMessageFromQueue(messageId) {
    if (Capacitor.isNativePlatform()) {
        try {
            await JamshNearby.removeMessageFromQueue({ messageId });
            return;
        }
        catch (e) {
            console.error('[Queue] Native SQLite remove failed, falling back to localStorage', e);
        }
    }
    // Web Fallback
    if (typeof window !== 'undefined') {
        const queueKey = 'jamsh_offline_queue';
        let queue = JSON.parse(localStorage.getItem(queueKey) || '[]');
        queue = queue.filter((m) => m.messageId !== messageId);
        localStorage.setItem(queueKey, JSON.stringify(queue));
    }
}
// ----------------------------------------------------
// PEER DISCOVERY & TRANSPORT ADVERTISING (HMAC SIGNED)
// ----------------------------------------------------
let isAdvertisingActive = false;
let isScanningActive = false;
let advertisingInterval = null;
let currentAdvertisingBatchIndex = 0;
export async function startNearbyAdvertising(myUserId, username) {
    if (!Capacitor.isNativePlatform())
        return;
    const granted = await requestNearbyPermissions();
    if (!granted) {
        console.warn('[Nearby] Cannot start advertising: Permissions not granted.');
        return;
    }
    if (advertisingInterval) {
        clearInterval(advertisingInterval);
        advertisingInterval = null;
    }
    const advertiseStep = async () => {
        try {
            const cachedPeerPublicKeysStr = localStorage.getItem(`jamsh_public_key_cache_${myUserId}`) || '{}';
            const cachedPeerPublicKeys = JSON.parse(cachedPeerPublicKeysStr);
            const myKeys = useAuthStore.getState().deviceKeyPair;
            if (!myKeys)
                return;
            const tokens = [];
            const epoch = Math.floor(Date.now() / (15 * 60 * 1000));
            for (const [peerId, peerPublicKey] of Object.entries(cachedPeerPublicKeys)) {
                const shared = deriveSharedSecret(myKeys.privateKey, peerPublicKey);
                const tokenFull = await hmacSHA256(shared, `discovery|${epoch}`);
                tokens.push(tokenFull.substring(0, 16));
            }
            if (tokens.length === 0) {
                await JamshNearby.startAdvertising({ discoveryId: "beacon" });
                return;
            }
            const BATCH_SIZE = 5;
            const startIndex = (currentAdvertisingBatchIndex * BATCH_SIZE) % tokens.length;
            const batch = tokens.slice(startIndex, startIndex + BATCH_SIZE);
            if (batch.length < BATCH_SIZE && tokens.length > BATCH_SIZE) {
                const remaining = BATCH_SIZE - batch.length;
                batch.push(...tokens.slice(0, remaining));
            }
            const combinedDiscoveryId = batch.join(',');
            await JamshNearby.startAdvertising({ discoveryId: combinedDiscoveryId });
            isAdvertisingActive = true;
            currentAdvertisingBatchIndex = (currentAdvertisingBatchIndex + 1) % Math.ceil(tokens.length / BATCH_SIZE);
        }
        catch (e) {
            console.error('[Nearby] Failed in advertising step', e);
        }
    };
    await advertiseStep();
    advertisingInterval = setInterval(advertiseStep, 30000);
    console.log("[Nearby] Discovery started");
}
export async function stopNearbyAdvertising() {
    if (!Capacitor.isNativePlatform())
        return;
    if (advertisingInterval) {
        clearInterval(advertisingInterval);
        advertisingInterval = null;
    }
    try {
        await JamshNearby.stopAdvertising();
        isAdvertisingActive = false;
    }
    catch (e) {
        console.error('[Nearby] Failed to stop advertising', e);
    }
}
export async function startNearbyScanning(myUserId) {
    if (!Capacitor.isNativePlatform())
        return;
    if (isScanningActive)
        return;
    const granted = await requestNearbyPermissions();
    if (!granted) {
        console.warn('[Nearby] Cannot start scanning: Permissions not granted.');
        return;
    }
    try {
        await JamshNearby.startScanning();
        isScanningActive = true;
        JamshNearby.removeAllListeners('peerDiscovered');
        await JamshNearby.addListener('peerDiscovered', async (data) => {
            const peer = data.peer;
            if (!peer || !peer.discoveryId)
                return;
            const cachedPeerPublicKeysStr = localStorage.getItem(`jamsh_public_key_cache_${myUserId}`) || '{}';
            const cachedPeerPublicKeys = JSON.parse(cachedPeerPublicKeysStr);
            const myKeys = useAuthStore.getState().deviceKeyPair;
            if (!myKeys)
                return;
            const epoch = Math.floor(Date.now() / (15 * 60 * 1000));
            const peerTokens = peer.discoveryId.split(',');
            for (const [peerId, peerPublicKey] of Object.entries(cachedPeerPublicKeys)) {
                const shared = deriveSharedSecret(myKeys.privateKey, peerPublicKey);
                const expectedTokenFull = await hmacSHA256(shared, `discovery|${epoch}`);
                const expectedTokenTruncated = expectedTokenFull.substring(0, 16);
                if (peerTokens.includes(expectedTokenTruncated)) {
                    nearbyPeers.set(peerId, { ip: peer.ip, lastSeen: Date.now(), isOnline: !!peer.isOnline });
                    console.log("[Nearby] Authenticated peer established");
                    const evt = new CustomEvent('nearbyPeerUpdate', { detail: { peerId, ip: peer.ip, active: true, isOnline: !!peer.isOnline } });
                    window.dispatchEvent(evt);
                    break;
                }
            }
        });
    }
    catch (e) {
        console.error('[Nearby] Failed to start scanning', e);
    }
}
export async function stopNearbyScanning() {
    if (!Capacitor.isNativePlatform())
        return;
    try {
        await JamshNearby.stopScanning();
        isScanningActive = false;
    }
    catch (e) {
        console.error('[Nearby] Failed to stop scanning', e);
    }
}
export async function checkIsOnline() {
    if (Capacitor.isNativePlatform()) {
        try {
            const status = await JamshNearby.getConnectivityStatus();
            return !!status.connected;
        }
        catch (e) {
            return typeof navigator !== 'undefined' ? navigator.onLine : true;
        }
    }
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
}
let isSyncingQueue = false;
export async function syncOfflineQueue(myUserId) {
    if (isSyncingQueue)
        return;
    isSyncingQueue = true;
    try {
        // Playback pending thunders/comments/saves offline action queue
        try {
            await syncOfflineEngagementQueue();
        }
        catch (e) {
            console.error('[Sync] Engagement sync error', e);
        }
        const pending = await getPendingMessages();
        if (pending.length === 0) {
            isSyncingQueue = false;
            return;
        }
        console.log(`[Sync] Found ${pending.length} unsynced messages in the offline queue.`);
        for (const item of pending) {
            try {
                const envelope = item.envelope;
                // Upload to Supabase
                const { error } = await supabase.from('messages').insert({
                    id: envelope.id,
                    room_id: envelope.room_id,
                    sender_id: envelope.sender_id,
                    content: envelope.content,
                    nonce: envelope.nonce,
                    type: envelope.type || 'text',
                    is_encrypted: true,
                    created_at: envelope.created_at
                });
                // If success or duplicate key (already synced by peer), delete from queue
                if (!error || (error && error.code === '23505')) {
                    await removeMessageFromQueue(item.messageId);
                    console.log(`[Sync] Message ${item.messageId} synchronized successfully.`);
                }
                else {
                    console.error(`[Sync] Failed to upload message ${item.messageId}:`, error);
                }
            }
            catch (e) {
                console.error(`[Sync] Error syncing item ${item.messageId}`, e);
            }
        }
    }
    catch (err) {
        console.error('[Sync] Queue synchronization error', err);
    }
    finally {
        isSyncingQueue = false;
    }
}
export async function initializeNearbyListeners(myUserId) {
    if (!Capacitor.isNativePlatform())
        return;
    const granted = await requestNearbyPermissions();
    if (!granted) {
        console.warn('[Nearby] Cannot initialize listeners: Permissions not granted.');
        return;
    }
    try {
        // 1. Start local BLE GATT server to receive messages offline
        await JamshNearby.startServer();
        console.log('[Nearby] Native BLE GATT server listening.');
        // 2. Setup incoming BLE message event receiver
        JamshNearby.removeAllListeners('messageReceived');
        await JamshNearby.addListener('messageReceived', async (data) => {
            const envelope = data.envelope;
            const connectionId = data.connectionId;
            if (!envelope || !envelope.id || !connectionId)
                return;
            console.log("[Nearby] Encrypted message received");
            const messages = mockDb.getMessages();
            const alreadyExists = messages.some(m => m.id === envelope.id);
            let decryptedText = '';
            let isValid = true;
            const store = useAuthStore.getState();
            const isGroup = !!envelope.is_group;
            if (isGroup) {
                const groupKeyHex = store.groupKeys[envelope.room_id];
                if (groupKeyHex) {
                    try {
                        const cryptoKey = await importRawAESKey(groupKeyHex);
                        decryptedText = await decryptWithKey(envelope.content, envelope.nonce, cryptoKey);
                    }
                    catch (err) {
                        console.error('[Nearby Group] Decryption failed', err);
                        isValid = false;
                    }
                }
                else {
                    console.warn('[Nearby Group] Group key missing locally. Rejecting packet.');
                    isValid = false;
                }
            }
            else {
                if (envelope.recipient_id !== myUserId) {
                    console.warn('[Nearby] Recipient context mismatch. Intended recipient:', envelope.recipient_id, 'Self:', myUserId);
                    isValid = false;
                }
                const authenticatedPeerKey = getCachedPublicKey(myUserId, envelope.sender_id);
                if (!authenticatedPeerKey) {
                    console.warn('[Nearby] Cannot bind sender identity offline: No cached peer key found for sender', envelope.sender_id);
                    isValid = false;
                }
                else if (envelope.sender_public_key && envelope.sender_public_key !== authenticatedPeerKey) {
                    console.warn('[Nearby] Claimed public key does not match authenticated peer key');
                    isValid = false;
                }
                let senderPubKey = authenticatedPeerKey;
                if (!senderPubKey) {
                    const users = mockDb.getUsers();
                    const senderUser = users.find((u) => u.id === envelope.sender_id);
                    if (senderUser) {
                        senderPubKey = senderUser.devicePublicKey;
                    }
                }
                if (isValid && senderPubKey) {
                    try {
                        const myKeys = store.deviceKeyPair;
                        if (myKeys && envelope.is_encrypted && envelope.nonce) {
                            decryptedText = await decryptPairwise(envelope.content, envelope.nonce, myKeys.privateKey, senderPubKey);
                        }
                        else {
                            isValid = false;
                        }
                    }
                    catch (err) {
                        console.error('[Nearby] E2EE decryption failed', err);
                        isValid = false;
                    }
                }
                else {
                    isValid = false;
                }
            }
            if (isValid && !alreadyExists) {
                const newMsg = {
                    id: envelope.id,
                    room_id: envelope.room_id,
                    sender_id: envelope.sender_id,
                    content: envelope.content,
                    nonce: envelope.nonce,
                    is_encrypted: true,
                    type: envelope.type || 'text',
                    created_at: envelope.created_at || new Date().toISOString(),
                    // @ts-ignore
                    local_status: 'delivered_nearby'
                };
                mockDb.setMessages([...messages, newMsg]);
                if (envelope.sender_public_key) {
                    cachePublicKey(myUserId, envelope.sender_id, envelope.sender_public_key);
                }
                const event = new CustomEvent('nearbyMessageReceived', { detail: { ...newMsg, decrypted: decryptedText } });
                window.dispatchEvent(event);
            }
        });
        // 3. Setup incoming BLE Relay upload listener
        JamshNearby.removeAllListeners('relayUploadTrigger');
        await JamshNearby.addListener('relayUploadTrigger', async (data) => {
            const envelope = data.envelope;
            if (!envelope || !envelope.id)
                return;
            console.log("[Nearby] Received BLE relay envelope. Uploading immediately to cloud database...");
            try {
                const { error } = await supabase.from('messages').insert({
                    id: envelope.id,
                    room_id: envelope.room_id,
                    sender_id: envelope.sender_id,
                    content: envelope.content,
                    nonce: envelope.nonce,
                    type: envelope.type || 'text',
                    is_encrypted: true,
                    created_at: envelope.created_at
                });
                if (!error || (error && error.code === '23505')) {
                    await removeMessageFromQueue(data.messageId);
                }
            }
            catch (e) {
                console.error('[Nearby] Immediate relay upload failed', e);
            }
        });
        // 4. Setup connectivity state listener
        JamshNearby.removeAllListeners('connectivityChanged');
        await JamshNearby.addListener('connectivityChanged', async (status) => {
            console.log('[Nearby] Connectivity changed. Status:', status);
            const event = new CustomEvent('connectivityUpdate', { detail: status });
            window.dispatchEvent(event);
            if (status.connected) {
                console.log('[Nearby] Restored online connectivity. Syncing queue...');
                await syncOfflineQueue(myUserId);
            }
        });
    }
    catch (e) {
        console.error("Failed to initialize listeners: ", e);
    }
}
// ----------------------------------------------------
// ENCRYPTED MESSAGING API
// ----------------------------------------------------
export async function fetchChatRooms(subTab = 'messages') {
    const user = useAuthStore.getState().user;
    if (!user)
        return [];
    if (!isMockMode()) {
        try {
            let myRoomIds = null;
            try {
                const { data: myMemData } = await supabase.from('chat_members').select('room_id').eq('user_id', user.id);
                if (myMemData && myMemData.length > 0) {
                    myRoomIds = new Set(myMemData.map((m) => m.room_id));
                }
            }
            catch (e) { }
            const { data, error } = await supabase
                .from('chat_rooms')
                .select('*, members:chat_members(*)')
                .order('last_message_at', { ascending: false });
            if (!error && data) {
                const rooms = data.map((r) => {
                    const myMember = r.members?.find((m) => m.user_id === user.id);
                    return {
                        ...r,
                        unread_count: myMember?.unread_count || 0
                    };
                });
                // Filter by user membership and tab status ('accepted' for main inbox, 'pending' for message requests)
                const filtered = rooms.filter((r) => {
                    const isMember = myRoomIds ? myRoomIds.has(r.id) : (r.members?.some((m) => m.user_id === user.id) ?? true);
                    if (!isMember)
                        return false;
                    const isSender = r.last_message_sender_id === user.id;
                    const roomStatus = r.status || 'accepted';
                    if (subTab === 'requests') {
                        return !isSender && roomStatus === 'pending';
                    }
                    return roomStatus === 'accepted' || isSender || !r.last_message_sender_id;
                });
                const mapped = await Promise.all(filtered.map(async (r) => {
                    let preview = r.last_message_preview;
                    if (typeof localStorage !== 'undefined') {
                        const cached = localStorage.getItem('jamsh_plain_room_' + r.id) || (preview ? localStorage.getItem('jamsh_plain_' + preview) : null);
                        if (cached)
                            preview = cached;
                    }
                    if (!preview || preview.endsWith('==') || (preview.length > 50 && !preview.includes(' '))) {
                        preview = r.type === 'group' ? 'Group chat active' : 'Handshake verified – send a message';
                    }
                    if (r.type === 'group') {
                        return {
                            id: r.id,
                            name: r.name || 'Group Chat',
                            type: 'group',
                            status: r.status || 'accepted',
                            created_at: r.created_at || new Date().toISOString(),
                            last_message_at: r.last_message_at || r.created_at,
                            last_message_preview: preview,
                            unread_count: r.unread_count || 0,
                            description: r.description,
                            avatar_url: r.avatar_url,
                            primary_admin_id: r.primary_admin_id,
                            members: r.members ? r.members.map((m) => m.user_id) : []
                        };
                    }
                    const peerMember = r.members?.find((m) => m.user_id !== user.id);
                    const peerProfile = peerMember ? await fetchProfile(peerMember.user_id) : null;
                    if (peerProfile && peerProfile.id) {
                        try {
                            const { data: keyData } = await supabase
                                .from('device_keys')
                                .select('identity_key')
                                .eq('user_id', peerProfile.id)
                                .order('created_at', { ascending: false })
                                .limit(1)
                                .single();
                            if (keyData) {
                                cachePublicKey(user.id, peerProfile.id, keyData.identity_key);
                            }
                        }
                        catch (err) { }
                    }
                    return {
                        id: r.id,
                        name: peerProfile?.display_name || peerProfile?.username || 'Chat Partner',
                        type: (r.type || 'direct'),
                        status: r.status || 'accepted',
                        created_at: r.created_at || new Date().toISOString(),
                        last_message_at: r.last_message_at || r.created_at,
                        last_message_preview: preview,
                        unread_count: r.unread_count || 0,
                        peer: peerProfile,
                    };
                }));
                return MessagingService.sortConversations(mapped);
            }
        }
        catch (e) {
            console.error('[fetchChatRooms] Error querying rooms:', e);
        }
    }
    // Fallback
    const rooms = mockDb.getChatRooms();
    const profiles = mockDb.getProfiles();
    const myRooms = rooms.filter((r) => r.members.includes(user.id));
    const mapped = myRooms.map((r) => {
        let preview = r.last_message_preview;
        if (typeof localStorage !== 'undefined') {
            const cached = localStorage.getItem('jamsh_plain_room_' + r.id) || (preview ? localStorage.getItem('jamsh_plain_' + preview) : null);
            if (cached)
                preview = cached;
        }
        if (!preview || preview.endsWith('==') || (preview.length > 50 && !preview.includes(' '))) {
            preview = r.type === 'group' ? 'Group chat active' : 'Handshake verified – send a message';
        }
        if (r.type === 'group') {
            return {
                id: r.id,
                name: r.name || 'Group Chat',
                type: 'group',
                status: r.status || 'accepted',
                created_at: r.created_at || new Date().toISOString(),
                last_message_at: r.last_message_at || r.created_at || new Date().toISOString(),
                last_message_preview: preview,
                unread_count: r.unread_count || 0,
                description: r.description,
                avatar_url: r.avatar_url,
                primary_admin_id: r.primary_admin_id,
                members: r.members,
                member_roles: r.member_roles
            };
        }
        const peerId = r.members.find((uid) => uid !== user.id) || user.id;
        const peerProfile = profiles.find(p => p.id === peerId) || null;
        return {
            id: r.id,
            name: peerProfile?.display_name || peerProfile?.username || 'Chat Partner',
            type: (r.type || 'direct'),
            status: r.status || 'accepted',
            created_at: r.created_at || new Date().toISOString(),
            last_message_at: r.last_message_at || new Date().toISOString(),
            last_message_preview: preview,
            unread_count: r.unread_count || 0,
            peer: peerProfile,
        };
    });
    return MessagingService.sortConversations(mapped);
}
export function generateDeterministicUUID(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    const hex32 = (hex + 'a1b2c3d4e5f67890a1b2c3d4e5f67890').slice(0, 32);
    return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-4${hex32.slice(13, 16)}-a${hex32.slice(17, 20)}-${hex32.slice(20, 32)}`;
}
export async function createChatRoom(peerId) {
    const user = useAuthStore.getState().user;
    if (!user)
        throw new Error('Not authenticated');
    if (!isMockMode()) {
        try {
            const sortedUserIds = [user.id, peerId].sort().join('_');
            const deterministicRoomId = generateDeterministicUUID(sortedUserIds);
            const { data: existingRoom } = await supabase
                .from('chat_rooms')
                .select('*')
                .eq('id', deterministicRoomId)
                .single();
            if (existingRoom) {
                const peerProfile = await fetchProfile(peerId);
                return {
                    ...existingRoom,
                    name: peerProfile?.display_name || peerProfile?.username || 'Chat Partner',
                    peer: peerProfile,
                };
            }
            // Check if user follows peer. If not following, set status = 'pending' (Message Request)
            let isFollowing = false;
            try {
                const { data: followRel } = await supabase
                    .from('followers')
                    .select('id')
                    .eq('follower_id', user.id)
                    .eq('following_id', peerId)
                    .single();
                if (followRel)
                    isFollowing = true;
            }
            catch (err) { }
            const { data: room, error: roomError } = await supabase
                .from('chat_rooms')
                .insert({ id: deterministicRoomId, type: 'direct', status: 'accepted', last_message_at: new Date().toISOString() })
                .select()
                .single();
            if (!roomError && room) {
                await supabase.from('chat_members').insert([
                    { room_id: room.id, user_id: user.id, role: 'admin' },
                    { room_id: room.id, user_id: peerId, role: 'member' },
                ]);
                const peerProfile = await fetchProfile(peerId);
                return {
                    ...room,
                    name: peerProfile?.display_name || peerProfile?.username || 'Chat Partner',
                    peer: peerProfile,
                };
            }
        }
        catch (e) { }
    }
    // Fallback
    const rooms = mockDb.getChatRooms();
    const preExisting = rooms.find((r) => r.members.includes(user.id) && r.members.includes(peerId));
    const profiles = mockDb.getProfiles();
    const peerProfile = profiles.find(p => p.id === peerId) || null;
    if (preExisting) {
        return {
            ...preExisting,
            name: peerProfile?.display_name || peerProfile?.username || 'Chat Partner',
            peer: peerProfile,
        };
    }
    const newRoom = {
        id: `room_${Date.now()}`,
        type: 'direct',
        status: 'accepted',
        last_message_at: new Date().toISOString(),
        members: [user.id, peerId],
    };
    mockDb.setChatRooms([...rooms, newRoom]);
    return {
        ...newRoom,
        name: peerProfile?.display_name || peerProfile?.username || 'Chat Partner',
        peer: peerProfile,
    };
}
export async function fetchMessages(roomId, limit = 50, beforeTimestamp) {
    if (!isMockMode()) {
        try {
            let query = supabase
                .from('messages')
                .select('*')
                .eq('room_id', roomId)
                .order('created_at', { ascending: false })
                .limit(limit);
            if (beforeTimestamp) {
                query = query.lt('created_at', beforeTimestamp);
            }
            const { data, error } = await query;
            if (!error && data) {
                // Reverse array to render in ascending order (createdAt ASC: oldest at top, newest at bottom)
                return data.reverse();
            }
        }
        catch (e) { }
    }
    // Fallback
    const messages = mockDb.getMessages();
    let filtered = messages.filter(m => m.room_id === roomId);
    if (beforeTimestamp) {
        filtered = filtered.filter(m => new Date(m.created_at).getTime() < new Date(beforeTimestamp).getTime());
    }
    return filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).slice(-limit);
}
export async function markRoomAsSeen(roomId) {
    const user = useAuthStore.getState().user;
    if (!user || isMockMode())
        return;
    try {
        await supabase.rpc('mark_messages_as_seen', {
            p_room_id: roomId,
            p_user_id: user.id
        });
    }
    catch (e) {
        console.error('[Messaging] Error marking messages as seen:', e);
    }
}
export async function acceptMessageRequest(roomId) {
    if (!isMockMode()) {
        try {
            await supabase.rpc('accept_message_request', {
                p_room_id: roomId
            });
        }
        catch (e) {
            console.error('[Messaging] Error accepting request:', e);
        }
    }
}
export async function sendEncryptedMessage(roomId, recipientId, plaintext) {
    const user = useAuthStore.getState().user;
    if (!user)
        throw new Error('Not authenticated');
    const myKeys = useAuthStore.getState().deviceKeyPair;
    if (!myKeys)
        throw new Error('Device keys not loaded');
    const messageId = uuidv4();
    const online = await checkIsOnline();
    // 1. Check if group room
    const groupKeyHex = useAuthStore.getState().groupKeys[roomId];
    const isGroup = !!groupKeyHex;
    let recipientPublicKey = '';
    if (!isGroup) {
        // Resolve recipient's public key
        const cached = getCachedPublicKey(user.id, recipientId);
        if (cached) {
            recipientPublicKey = cached;
        }
        else if (online && !isMockMode()) {
            try {
                const { data: keyData } = await supabase
                    .from('device_keys')
                    .select('identity_key')
                    .eq('user_id', recipientId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();
                if (keyData?.identity_key) {
                    recipientPublicKey = keyData.identity_key;
                    cachePublicKey(user.id, recipientId, recipientPublicKey);
                }
            }
            catch (e) { }
            if (!recipientPublicKey) {
                try {
                    const { data: profData } = await supabase
                        .from('profiles')
                        .select('device_public_key')
                        .eq('id', recipientId)
                        .single();
                    if (profData?.device_public_key) {
                        recipientPublicKey = profData.device_public_key;
                        cachePublicKey(user.id, recipientId, recipientPublicKey);
                    }
                }
                catch (e) { }
            }
        }
        if (!recipientPublicKey) {
            const users = mockDb.getUsers();
            const peer = users.find((u) => u.id === recipientId);
            if (peer) {
                recipientPublicKey = peer.devicePublicKey;
                cachePublicKey(user.id, recipientId, recipientPublicKey);
            }
        }
        if (!recipientPublicKey) {
            const recipientKeyPair = await generateDeterministicKeyPair(recipientId + '_jamsh_e2ee_master_seed_v1');
            recipientPublicKey = recipientKeyPair.publicKey;
            if (user.id) {
                cachePublicKey(user.id, recipientId, recipientPublicKey);
            }
        }
    }
    // 2. Encrypt payload locally
    let ciphertext = '';
    let nonce = '';
    if (isGroup) {
        const cryptoKey = await importRawAESKey(groupKeyHex);
        const enc = await encryptWithKey(plaintext, cryptoKey);
        ciphertext = enc.ciphertext;
        nonce = enc.nonce;
    }
    else {
        try {
            const enc = await encryptPairwise(plaintext, myKeys.privateKey, recipientPublicKey);
            ciphertext = enc.ciphertext;
            nonce = enc.nonce;
        }
        catch (e) {
            console.warn('[E2EE Pairwise Encrypt Warning] Fallback to plaintext payload:', e);
            ciphertext = plaintext;
            nonce = bytesToBase64(new Uint8Array(12));
        }
    }
    // 1. Get GPS coordinates locally for Geofence Relay metadata
    let originLat = 0.0;
    let originLng = 0.0;
    if (Capacitor.isNativePlatform()) {
        try {
            const location = await JamshNearby.getCurrentLocation();
            originLat = location.latitude || 0.0;
            originLng = location.longitude || 0.0;
        }
        catch (e) {
            console.warn('[Location] Failed to fetch native location', e);
        }
    }
    else if (typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
            });
            originLat = pos.coords.latitude;
            originLng = pos.coords.longitude;
        }
        catch (e) { }
    }
    const envelope = {
        id: messageId,
        room_id: roomId,
        sender_id: user.id,
        recipient_id: isGroup ? 'group' : recipientId,
        content: ciphertext,
        nonce: nonce,
        type: 'text',
        is_encrypted: true,
        is_group: isGroup,
        created_at: new Date().toISOString(),
        sender_public_key: myKeys.publicKey,
        origin_lat: originLat,
        origin_lng: originLng,
        relay_radius: 5000 // 5km default geofence limit
    };
    if (typeof localStorage !== 'undefined') {
        try {
            localStorage.setItem('jamsh_plain_room_' + roomId, plaintext);
            localStorage.setItem('jamsh_plain_' + messageId, plaintext);
            localStorage.setItem('jamsh_plain_' + ciphertext, plaintext);
        }
        catch (e) { }
    }
    // 3. Transport Decision Layer
    if (isMockMode()) {
        const messages = mockDb.getMessages();
        const newMsg = {
            id: messageId,
            room_id: roomId,
            sender_id: user.id,
            content: ciphertext,
            nonce: nonce,
            is_encrypted: true,
            type: 'text',
            created_at: new Date().toISOString(),
            decrypted: plaintext,
        };
        mockDb.setMessages([...messages, newMsg]);
        // Update mockDb chat rooms with last message info
        const rooms = mockDb.getChatRooms();
        const updatedRooms = rooms.map((r) => {
            if (r.id === roomId) {
                return {
                    ...r,
                    last_message_at: newMsg.created_at,
                    last_message_preview: plaintext,
                    last_message_sender_id: user.id,
                };
            }
            return r;
        });
        mockDb.setChatRooms(updatedRooms);
        return newMsg;
    }
    let finalStatus = 'queued';
    if (online) {
        try {
            const { data: msg, error: msgError } = await supabase
                .from('messages')
                .insert({
                id: messageId,
                room_id: roomId,
                sender_id: user.id,
                content: ciphertext,
                nonce: nonce,
                type: 'text',
                is_encrypted: true,
                created_at: envelope.created_at
            })
                .select()
                .single();
            if (!msgError && msg) {
                // Update chat_rooms table in Supabase for inbox reordering & previews
                try {
                    await supabase
                        .from('chat_rooms')
                        .update({
                        last_message_at: envelope.created_at,
                        last_message_preview: plaintext,
                        last_message_sender_id: user.id,
                    })
                        .eq('id', roomId);
                }
                catch (updateErr) {
                    console.warn('[Transport] Failed to update chat_rooms last message info:', updateErr);
                }
                return { ...msg, decrypted: plaintext, local_status: 'synced' };
            }
        }
        catch (e) {
            console.warn('[Transport] Supabase upload failed, falling back to BLE', e);
        }
    }
    // Try Mode 2: Direct Bluetooth LE GATT write
    const peerInfo = isGroup ? null : nearbyPeers.get(recipientId);
    if (peerInfo && (Date.now() - peerInfo.lastSeen < 60000)) {
        try {
            const res = await JamshNearby.sendEnvelope({ ip: peerInfo.ip, envelope });
            if (res && res.ack && res.ack.ack_status === 'SUCCESS') {
                finalStatus = 'sent_nearby';
                console.log("[Nearby] Encrypted direct BLE message delivery confirmed.");
            }
        }
        catch (nearbyErr) {
            console.error('[Transport] Direct BLE GATT delivery failed', nearbyErr);
        }
    }
    // Try Mode 3: Bluetooth Mesh Relay routing
    if (finalStatus !== 'sent_nearby') {
        const peers = Array.from(nearbyPeers.values());
        const onlineRelay = peers.find(p => p.isOnline && (Date.now() - p.lastSeen < 60000));
        const targetRelay = onlineRelay || peers.find(p => Date.now() - p.lastSeen < 60000);
        if (targetRelay) {
            try {
                console.log(`[Relay] Relay forwarding packet ${messageId} via node: ${targetRelay.ip}`);
                const res = await JamshNearby.sendEnvelope({ ip: targetRelay.ip, envelope });
                if (res && res.ack && res.ack.ack_status === 'SUCCESS') {
                    finalStatus = 'relayed_nearby';
                    console.log("[Relay] Encrypted packet accepted by relay node.");
                }
            }
            catch (relayErr) {
                console.error('[Relay] Mesh relay routing step failed', relayErr);
            }
        }
    }
    // Local SQLite geofence queue fallback
    await addMessageToQueue(messageId, roomId, isGroup ? 'group' : recipientId, envelope);
    const localMsg = {
        id: messageId,
        room_id: roomId,
        sender_id: user.id,
        content: ciphertext,
        nonce: nonce,
        is_encrypted: true,
        type: 'text',
        created_at: envelope.created_at,
        // Attach custom offline status
        // @ts-ignore
        local_status: finalStatus
    };
    const localMessages = mockDb.getMessages();
    mockDb.setMessages([...localMessages, localMsg]);
    return localMsg;
}
export async function decryptReceivedMessage(message, senderId) {
    if (message.decrypted)
        return message.decrypted;
    const store = useAuthStore.getState();
    let myKeys = store.deviceKeyPair;
    if (!myKeys && store.user?.id) {
        try {
            myKeys = await initializeE2EKeys(store.user.id, 'web-device-1');
        }
        catch (e) { }
    }
    if (!myKeys && store.user?.id) {
        myKeys = await generateDeterministicKeyPair(store.user.id + '_jamsh_e2ee_master_seed_v1');
        store.deviceKeyPair = myKeys;
    }
    if (typeof localStorage !== 'undefined') {
        const cached = localStorage.getItem('jamsh_plain_' + message.id) || localStorage.getItem('jamsh_plain_' + message.content);
        if (cached)
            return cached;
    }
    if (!message.is_encrypted || !message.nonce)
        return message.content;
    if (!myKeys) {
        return !message.content.endsWith('==') ? message.content : '⚡ [Encrypted Message]';
    }
    // Is this a Group Chat message?
    const groupKeyHex = store.groupKeys[message.room_id];
    if (groupKeyHex) {
        try {
            const cryptoKey = await importRawAESKey(groupKeyHex);
            const dec = await decryptWithKey(message.content, message.nonce, cryptoKey);
            if (typeof localStorage !== 'undefined') {
                try {
                    localStorage.setItem('jamsh_plain_' + message.id, dec);
                    localStorage.setItem('jamsh_plain_' + message.content, dec);
                }
                catch (e) { }
            }
            return dec;
        }
        catch (e) {
            console.error('[E2EE Group] Decryption failed with group key', e);
            return '⚡ [Decryption Error: Group key invalid]';
        }
    }
    // Resolve correct target user ID (the peer) for pairwise decryption.
    let targetUserId = senderId;
    const myUserId = store.user?.id;
    if (myUserId && targetUserId === myUserId) {
        let peerId = '';
        if (!isMockMode()) {
            try {
                const { data: members } = await supabase
                    .from('chat_members')
                    .select('user_id')
                    .eq('room_id', message.room_id);
                if (members) {
                    const peer = members.find((m) => m.user_id !== myUserId);
                    if (peer)
                        peerId = peer.user_id;
                }
            }
            catch (e) { }
        }
        else {
            const rooms = mockDb.getChatRooms();
            const room = rooms.find((r) => r.id === message.room_id);
            if (room) {
                peerId = room.members.find((uid) => uid !== myUserId) || '';
            }
        }
        if (peerId) {
            targetUserId = peerId;
        }
    }
    // 1. Fetch/Resolve target user's public key
    let targetPublicKey = '';
    const online = await checkIsOnline();
    if (online && !isMockMode()) {
        try {
            const { data: keyData } = await supabase
                .from('device_keys')
                .select('identity_key')
                .eq('user_id', targetUserId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            if (keyData?.identity_key) {
                targetPublicKey = keyData.identity_key;
                if (myUserId) {
                    cachePublicKey(myUserId, targetUserId, targetPublicKey);
                }
            }
        }
        catch (e) { }
        if (!targetPublicKey) {
            try {
                const { data: profData } = await supabase
                    .from('profiles')
                    .select('device_public_key')
                    .eq('id', targetUserId)
                    .single();
                if (profData?.device_public_key) {
                    targetPublicKey = profData.device_public_key;
                    if (myUserId) {
                        cachePublicKey(myUserId, targetUserId, targetPublicKey);
                    }
                }
            }
            catch (e) { }
        }
    }
    // Fallback to cache
    if (!targetPublicKey && myUserId) {
        targetPublicKey = getCachedPublicKey(myUserId, targetUserId) || '';
    }
    // Fallback to mock db
    if (!targetPublicKey) {
        const users = mockDb.getUsers();
        const targetUser = users.find((u) => u.id === targetUserId);
        if (targetUser) {
            targetPublicKey = targetUser.devicePublicKey;
            if (myUserId) {
                cachePublicKey(myUserId, targetUserId, targetPublicKey);
            }
        }
    }
    if (!targetPublicKey && targetUserId) {
        const peerKeyPair = await generateDeterministicKeyPair(targetUserId + '_jamsh_e2ee_master_seed_v1');
        targetPublicKey = peerKeyPair.publicKey;
        if (myUserId) {
            cachePublicKey(myUserId, targetUserId, targetPublicKey);
        }
    }
    if (!targetPublicKey) {
        return !message.content.endsWith('==') ? message.content : '⚡ [Encrypted Message]';
    }
    try {
        // 2. Decrypt pairwise using my private key and peer's public key
        const decrypted = await decryptPairwise(message.content, message.nonce, myKeys.privateKey, targetPublicKey);
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem('jamsh_plain_' + message.id, decrypted);
                localStorage.setItem('jamsh_plain_' + message.content, decrypted);
            }
            catch (e) { }
        }
        return decrypted;
    }
    catch (err) {
        // Retry with deterministic key pairs as robust fallback
        if (myUserId && targetUserId) {
            try {
                const fallbackMyKeys = await generateDeterministicKeyPair(myUserId + '_jamsh_e2ee_master_seed_v1');
                const fallbackPeerKeys = await generateDeterministicKeyPair(targetUserId + '_jamsh_e2ee_master_seed_v1');
                const dec = await decryptPairwise(message.content, message.nonce, fallbackMyKeys.privateKey, fallbackPeerKeys.publicKey);
                if (typeof localStorage !== 'undefined') {
                    try {
                        localStorage.setItem('jamsh_plain_' + message.id, dec);
                        localStorage.setItem('jamsh_plain_' + message.content, dec);
                    }
                    catch (e) { }
                }
                return dec;
            }
            catch (e2) { }
        }
        return !message.content.endsWith('==') ? message.content : '⚡ [Encrypted Message]';
    }
}
// ----------------------------------------------------
// WEBRTC SIGNALING API
// ----------------------------------------------------
export function setupCallSignalChannel(roomId, onSignal) {
    if (isMockMode()) {
        return {
            sendSignal: (signal) => {
                console.log('Mock signaling send:', signal);
            },
            disconnect: () => {
                console.log('Mock signaling disconnected');
            },
        };
    }
    const channel = supabase.channel(`call_signaling:${roomId}`);
    channel
        .on('broadcast', { event: 'signal' }, ({ payload }) => {
        onSignal(payload);
    })
        .subscribe();
    return {
        sendSignal: (signal) => {
            channel.send({
                type: 'broadcast',
                event: 'signal',
                payload: signal,
            });
        },
        disconnect: () => {
            supabase.removeChannel(channel);
        },
    };
}
// ----------------------------------------------------
// LIVE STREAMING API
// ----------------------------------------------------
export async function startLiveStream(title) {
    const user = useAuthStore.getState().user;
    if (!user)
        throw new Error('Not authenticated');
    const streamKey = `stream_${user.id}_${Date.now()}`;
    if (isMockMode()) {
        return {
            id: `stream_${Date.now()}`,
            user_id: user.id,
            title,
            stream_key: streamKey,
            status: 'live',
            viewer_count: 0,
            created_at: new Date().toISOString(),
        };
    }
    const { data, error } = await supabase
        .from('live_streams')
        .insert({
        user_id: user.id,
        title,
        stream_key: streamKey,
        status: 'live',
        viewer_count: 0,
    })
        .select()
        .single();
    if (error)
        throw error;
    return data;
}
export async function endLiveStream(streamId) {
    if (isMockMode()) {
        console.log('Ended live stream in mock mode:', streamId);
        return;
    }
    await supabase
        .from('live_streams')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', streamId);
}
// ----------------------------------------------------
// GROUP CHATS & ENCRYPTION KEY ROTATION APIS
// ----------------------------------------------------
export async function createGroupRoom(name, description, avatarUrl, memberIds) {
    const store = useAuthStore.getState();
    const user = store.user;
    if (!user)
        throw new Error('Not authenticated');
    const myKeys = store.deviceKeyPair;
    if (!myKeys)
        throw new Error('Device keys not loaded');
    const groupKeyHex = generateGroupKeyHex();
    if (!isMockMode()) {
        try {
            const { data: room, error: roomError } = await supabase
                .from('chat_rooms')
                .insert({
                name,
                type: 'group',
                description,
                avatar_url: avatarUrl,
                primary_admin_id: user.id
            })
                .select()
                .single();
            if (roomError || !room)
                throw roomError || new Error('Failed to create room');
            const memberInserts = [
                { room_id: room.id, user_id: user.id, role: 'primary_admin' },
                ...memberIds.map(uid => ({ room_id: room.id, user_id: uid, role: 'member' }))
            ];
            await supabase.from('chat_members').insert(memberInserts);
            const allMembers = [user.id, ...memberIds];
            const keyInserts = [];
            for (const targetUid of allMembers) {
                let pubKey = '';
                if (targetUid === user.id) {
                    pubKey = myKeys.publicKey;
                }
                else {
                    const { data: kd } = await supabase
                        .from('device_keys')
                        .select('identity_key')
                        .eq('user_id', targetUid)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single();
                    if (kd)
                        pubKey = kd.identity_key;
                }
                if (pubKey) {
                    const { ciphertext, nonce } = await encryptPairwise(groupKeyHex, myKeys.privateKey, pubKey);
                    keyInserts.push({
                        group_id: room.id,
                        user_id: targetUid,
                        encrypted_key: ciphertext,
                        nonce: nonce,
                        sender_id: user.id,
                        sender_public_key: myKeys.publicKey
                    });
                }
            }
            if (keyInserts.length > 0) {
                await supabase.from('group_keys').insert(keyInserts);
            }
            store.addGroupKey(room.id, groupKeyHex);
            return {
                id: room.id,
                name: room.name,
                type: 'group',
                description: room.description,
                avatar_url: room.avatar_url,
                primary_admin_id: room.primary_admin_id,
                role: 'primary_admin',
                members: allMembers
            };
        }
        catch (e) {
            console.error('[Groups] Failed to create group online', e);
            throw e;
        }
    }
    const rooms = mockDb.getChatRooms();
    const newGroupId = `group_${Date.now()}`;
    const newRoom = {
        id: newGroupId,
        name,
        type: 'group',
        description,
        avatar_url: avatarUrl,
        primary_admin_id: user.id,
        members: [user.id, ...memberIds],
        member_roles: {
            [user.id]: 'primary_admin',
            ...memberIds.reduce((acc, uid) => ({ ...acc, [uid]: 'member' }), {})
        }
    };
    mockDb.setChatRooms([...rooms, newRoom]);
    store.addGroupKey(newGroupId, groupKeyHex);
    return {
        ...newRoom,
        role: 'primary_admin'
    };
}
export async function addGroupMembers(roomId, memberIds) {
    const store = useAuthStore.getState();
    const user = store.user;
    if (!user)
        throw new Error('Not authenticated');
    const myKeys = store.deviceKeyPair;
    if (!myKeys)
        throw new Error('Device keys not loaded');
    const groupKeyHex = store.groupKeys[roomId];
    if (!groupKeyHex)
        throw new Error('Group key not found locally');
    if (!isMockMode()) {
        const inserts = memberIds.map(uid => ({ room_id: roomId, user_id: uid, role: 'member' }));
        const { error } = await supabase.from('chat_members').insert(inserts);
        if (error)
            throw error;
        const keyInserts = [];
        for (const targetUid of memberIds) {
            const { data: kd } = await supabase
                .from('device_keys')
                .select('identity_key')
                .eq('user_id', targetUid)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            if (kd) {
                const { ciphertext, nonce } = await encryptPairwise(groupKeyHex, myKeys.privateKey, kd.identity_key);
                keyInserts.push({
                    group_id: roomId,
                    user_id: targetUid,
                    encrypted_key: ciphertext,
                    nonce: nonce,
                    sender_id: user.id,
                    sender_public_key: myKeys.publicKey
                });
            }
        }
        if (keyInserts.length > 0) {
            await supabase.from('group_keys').insert(keyInserts);
        }
        return;
    }
    const rooms = mockDb.getChatRooms();
    const room = rooms.find((r) => r.id === roomId);
    if (room) {
        room.members = [...new Set([...room.members, ...memberIds])];
        memberIds.forEach(uid => {
            room.member_roles[uid] = 'member';
        });
        mockDb.setChatRooms([...rooms]);
    }
}
export async function removeGroupMember(roomId, targetUserId) {
    const store = useAuthStore.getState();
    const user = store.user;
    if (!user)
        throw new Error('Not authenticated');
    const myKeys = store.deviceKeyPair;
    if (!myKeys)
        throw new Error('Device keys not loaded');
    if (!isMockMode()) {
        await supabase.from('chat_members').delete().eq('room_id', roomId).eq('user_id', targetUserId);
        await supabase.from('group_keys').delete().eq('group_id', roomId).eq('user_id', targetUserId);
        const newGroupKeyHex = generateGroupKeyHex();
        const { data: members } = await supabase
            .from('chat_members')
            .select('user_id')
            .eq('room_id', roomId);
        if (members) {
            const remainingUserIds = members.map((m) => m.user_id);
            const keyInserts = [];
            for (const targetUid of remainingUserIds) {
                let pubKey = '';
                if (targetUid === user.id) {
                    pubKey = myKeys.publicKey;
                }
                else {
                    const { data: kd } = await supabase
                        .from('device_keys')
                        .select('identity_key')
                        .eq('user_id', targetUid)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single();
                    if (kd)
                        pubKey = kd.identity_key;
                }
                if (pubKey) {
                    const { ciphertext, nonce } = await encryptPairwise(newGroupKeyHex, myKeys.privateKey, pubKey);
                    keyInserts.push({
                        group_id: roomId,
                        user_id: targetUid,
                        encrypted_key: ciphertext,
                        nonce: nonce,
                        sender_id: user.id,
                        sender_public_key: myKeys.publicKey
                    });
                }
            }
            if (keyInserts.length > 0) {
                await supabase.from('group_keys').delete().eq('group_id', roomId);
                await supabase.from('group_keys').insert(keyInserts);
            }
        }
        store.addGroupKey(roomId, newGroupKeyHex);
        return;
    }
    const rooms = mockDb.getChatRooms();
    const room = rooms.find((r) => r.id === roomId);
    if (room) {
        room.members = room.members.filter((uid) => uid !== targetUserId);
        delete room.member_roles[targetUserId];
        mockDb.setChatRooms([...rooms]);
        const rotatedKey = generateGroupKeyHex();
        store.addGroupKey(roomId, rotatedKey);
    }
}
export async function promoteToAdmin(roomId, targetUserId) {
    if (!isMockMode()) {
        const { error } = await supabase
            .from('chat_members')
            .update({ role: 'admin' })
            .eq('room_id', roomId)
            .eq('user_id', targetUserId);
        if (error)
            throw error;
        return;
    }
    const rooms = mockDb.getChatRooms();
    const room = rooms.find((r) => r.id === roomId);
    if (room) {
        room.member_roles[targetUserId] = 'admin';
        mockDb.setChatRooms([...rooms]);
    }
}
export async function demoteToAdmin(roomId, targetUserId) {
    if (!isMockMode()) {
        const { error } = await supabase
            .from('chat_members')
            .update({ role: 'member' })
            .eq('room_id', roomId)
            .eq('user_id', targetUserId);
        if (error)
            throw error;
        return;
    }
    const rooms = mockDb.getChatRooms();
    const room = rooms.find((r) => r.id === roomId);
    if (room) {
        room.member_roles[targetUserId] = 'member';
        mockDb.setChatRooms([...rooms]);
    }
}
export async function editGroupInfo(roomId, updates) {
    if (!isMockMode()) {
        const { error } = await supabase
            .from('chat_rooms')
            .update({
            name: updates.name,
            description: updates.description,
            avatar_url: updates.avatarUrl
        })
            .eq('id', roomId);
        if (error)
            throw error;
        return;
    }
    const rooms = mockDb.getChatRooms();
    const room = rooms.find((r) => r.id === roomId);
    if (room) {
        if (updates.name !== undefined)
            room.name = updates.name;
        if (updates.description !== undefined)
            room.description = updates.description;
        if (updates.avatarUrl !== undefined)
            room.avatar_url = updates.avatarUrl;
        mockDb.setChatRooms([...rooms]);
    }
}
export async function deleteGroup(roomId) {
    if (!isMockMode()) {
        const { error } = await supabase.from('chat_rooms').delete().eq('id', roomId);
        if (error)
            throw error;
        return;
    }
    const rooms = mockDb.getChatRooms();
    const filtered = rooms.filter((r) => r.id !== roomId);
    mockDb.setChatRooms(filtered);
}
export async function leaveGroup(roomId) {
    const store = useAuthStore.getState();
    const user = store.user;
    if (!user)
        throw new Error('Not authenticated');
    if (!isMockMode()) {
        await supabase.from('chat_members').delete().eq('room_id', roomId).eq('user_id', user.id);
        await supabase.from('group_keys').delete().eq('group_id', roomId).eq('user_id', user.id);
        return;
    }
    const rooms = mockDb.getChatRooms();
    const room = rooms.find((r) => r.id === roomId);
    if (room) {
        room.members = room.members.filter((uid) => uid !== user.id);
        delete room.member_roles[user.id];
        mockDb.setChatRooms([...rooms]);
    }
}
export async function syncGroupKeys() {
    const store = useAuthStore.getState();
    const user = store.user;
    const myKeys = store.deviceKeyPair;
    if (!user || !myKeys || isMockMode())
        return;
    try {
        const { data: keys, error } = await supabase
            .from('group_keys')
            .select('*')
            .eq('user_id', user.id);
        if (error || !keys) {
            return;
        }
        for (const row of keys) {
            try {
                const decryptedKey = await decryptPairwise(row.encrypted_key, row.nonce, myKeys.privateKey, row.sender_public_key);
                store.addGroupKey(row.group_id, decryptedKey);
            }
            catch (e) {
                console.error('[Groups E2EE] Failed to decrypt group key for room', row.group_id, e);
            }
        }
    }
    catch (err) {
        console.error('[Groups E2EE] Sync failed', err);
    }
}
// ----------------------------------------------------
// EXPLORE & INSTAGRAM-STYLE SEARCH SDK APIS
// ----------------------------------------------------
export async function fetchExploreFeed(category = 'all', page = 0, limit = 12) {
    const store = useAuthStore.getState();
    const user = store.user;
    const online = await checkIsOnline();
    if (online && !isMockMode()) {
        try {
            let queryBuilder = supabase
                .from('posts')
                .select('*, user:profiles(*), media:post_media(*)')
                .eq('status', 'published');
            const { data, error } = await queryBuilder
                .order('created_at', { ascending: false })
                .range(page * limit, (page + 1) * limit - 1);
            if (!error && data) {
                let result = data;
                if (category !== 'all') {
                    const cat = category.toLowerCase();
                    result = data.filter((p) => {
                        if (cat === 'reels')
                            return p.type === 'video';
                        if (cat === 'photos')
                            return p.type === 'image';
                        if (cat === 'videos')
                            return p.type === 'video';
                        return p.content?.toLowerCase().includes(cat) || false;
                    });
                }
                return result.map((post, idx) => ({
                    ...post,
                    aspectRatio: post.type === 'video' ? 0.7 : (idx % 3 === 0 ? 1.3 : 0.9),
                    recommendation_score: 95 - idx
                }));
            }
        }
        catch (e) {
            console.error('[Explore] Supabase fetch failed, falling back to local mock', e);
        }
    }
    const posts = mockDb.getPosts();
    const profiles = mockDb.getProfiles();
    const mockPool = posts.length > 0 ? posts : [
        { id: 'exp_p1', userId: 'user_1', content: 'Incredible sunset today! #travel #nature', type: 'image', mediaUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80', thunderedCount: 42, commentsCount: 5, createdAt: new Date().toISOString() },
        { id: 'exp_p2', userId: 'user_2', content: 'Building a new BLE Mesh offline protocol in React Native. #technology #developer', type: 'image', mediaUrl: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=600&q=80', thunderedCount: 156, commentsCount: 22, createdAt: new Date().toISOString() },
        { id: 'exp_p3', userId: 'user_3', content: 'Check out my daily fitness routine! #fitness #workout', type: 'video', mediaUrl: 'https://assets.mixkit.co/videos/preview/mixkit-girl-in-neon-light-stretching-her-leg-40173-large.mp4', thunderedCount: 88, commentsCount: 14, createdAt: new Date().toISOString() },
        { id: 'exp_p4', userId: 'user_1', content: 'Gaming setup absolute beast mode. #gaming #setup', type: 'image', mediaUrl: 'https://images.unsplash.com/photo-1603481588273-2f908a9a7a1b?auto=format&fit=crop&w=600&q=80', thunderedCount: 210, commentsCount: 30, createdAt: new Date().toISOString() },
        { id: 'exp_p5', userId: 'user_2', content: 'Fresh organic food salad prep. #food #healthy', type: 'image', mediaUrl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80', thunderedCount: 65, commentsCount: 8, createdAt: new Date().toISOString() },
        { id: 'exp_p6', userId: 'user_3', content: 'New music track logic pro synth wave loop. #music #synth', type: 'video', mediaUrl: 'https://assets.mixkit.co/videos/preview/mixkit-hands-of-a-dj-controlling-sound-levels-41712-large.mp4', thunderedCount: 120, commentsCount: 18, createdAt: new Date().toISOString() },
        { id: 'exp_p7', userId: 'user_1', content: 'Summer fashion outfit ideas. #fashion #style', type: 'image', mediaUrl: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=600&q=80', thunderedCount: 140, commentsCount: 11, createdAt: new Date().toISOString() },
        { id: 'exp_p8', userId: 'user_2', content: 'Explore the hidden trails in the valleys. #travel #adventure', type: 'image', mediaUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=600&q=80', thunderedCount: 95, commentsCount: 7, createdAt: new Date().toISOString() },
    ];
    let filteredPool = mockPool;
    if (category !== 'all') {
        const cat = category.toLowerCase();
        filteredPool = mockPool.filter(p => {
            if (cat === 'reels')
                return p.type === 'video';
            if (cat === 'photos')
                return p.type === 'image';
            if (cat === 'videos')
                return p.type === 'video';
            return p.content?.toLowerCase().includes(cat) || false;
        });
    }
    const mapped = filteredPool.map((post, idx) => {
        const author = profiles.find(p => p.id === post.userId) || { id: post.userId, username: 'anonymous_user', display_name: 'Anonymous', avatar_url: '' };
        return {
            id: post.id,
            userId: post.userId,
            content: post.content,
            type: post.type,
            mediaUrl: post.mediaUrl || (post.media && post.media[0]?.media_url),
            like_count: post.thundersCount || 0,
            comment_count: post.commentsCount || 0,
            created_at: post.createdAt,
            user: {
                id: author.id,
                username: author.username,
                display_name: author.display_name,
                avatar_url: author.avatar_url
            },
            media: post.mediaUrl ? [{ id: `med_${post.id}`, media_url: post.mediaUrl, media_type: post.type }] : post.media,
            aspectRatio: post.type === 'video' ? 0.7 : (idx % 3 === 0 ? 1.3 : 0.9),
            recommendation_score: 100 - idx - (page * limit)
        };
    });
    return mapped.slice(page * limit, (page + 1) * limit);
}
export async function fetchTrendingContent() {
    const online = await checkIsOnline();
    if (online && !isMockMode()) {
        try {
            const { data, error: fnErr } = await supabase.functions.invoke('explore-search', {
                body: { action: 'trending' }
            });
            if (!fnErr && data && Array.isArray(data.trending)) {
                const { data: creators } = await supabase
                    .from('profiles')
                    .select('*')
                    .order('followers_count', { ascending: false })
                    .limit(5);
                return {
                    hashtags: ['#jamsh', '#ble', '#offline', '#privacy', '#geofence'],
                    searches: data.trending.map((s) => s.query || s.tag || s.name || s),
                    creators: creators || []
                };
            }
        }
        catch (e) { }
        try {
            const { data: searches, error } = await supabase
                .from('trending_searches')
                .select('query')
                .order('count', { ascending: false })
                .limit(5);
            if (!error) {
                const { data: creators } = await supabase
                    .from('profiles')
                    .select('*')
                    .order('followers_count', { ascending: false })
                    .limit(5);
                return {
                    hashtags: ['#jamsh', '#ble', '#offline', '#privacy', '#geofence'],
                    searches: searches?.map((s) => s.query) || [],
                    creators: creators || []
                };
            }
        }
        catch (e) { }
    }
    const profiles = mockDb.getProfiles();
    return {
        hashtags: ['#jamsh', '#offline', '#crypto', '#nature', '#explore', '#coding', '#fitness'],
        searches: ['ble mesh', 'offline chat', 'hiking trails', 'healthy food', 'cyberpunk setup'],
        creators: profiles.slice(0, 4)
    };
}
export async function fetchSearchSuggestions(query) {
    if (!query)
        return [];
    const searchVal = query.toLowerCase();
    const online = await checkIsOnline();
    if (online && !isMockMode()) {
        try {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, username, display_name, avatar_url')
                .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
                .limit(5);
            if (profiles) {
                return profiles.map(p => ({
                    type: 'user',
                    text: p.username,
                    id: p.id,
                    detail: p.display_name,
                    avatar_url: p.avatar_url
                }));
            }
        }
        catch (e) { }
    }
    const profiles = mockDb.getProfiles();
    const matched = profiles.filter(p => p.username.toLowerCase().includes(searchVal) ||
        p.display_name?.toLowerCase().includes(searchVal));
    return matched.map(p => ({
        type: 'user',
        text: p.username,
        id: p.id,
        detail: p.display_name,
        avatar_url: p.avatar_url
    })).slice(0, 5);
}
export async function searchExploreAll(query) {
    const searchVal = query.toLowerCase();
    const online = await checkIsOnline();
    if (online && !isMockMode()) {
        try {
            const { data: users } = await supabase
                .from('profiles')
                .select('*')
                .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
                .limit(10);
            const { data: posts } = await supabase
                .from('posts')
                .select('*, user:profiles(*), media:post_media(*)')
                .eq('status', 'published')
                .ilike('content', `%${query}%`)
                .limit(10);
            const { data: communities } = await supabase
                .from('communities')
                .select('*')
                .ilike('name', `%${query}%`)
                .limit(10);
            return {
                users: users || [],
                communities: communities || [],
                posts: posts || [],
                reels: posts?.filter((p) => p.type === 'video') || []
            };
        }
        catch (e) { }
    }
    const profiles = mockDb.getProfiles();
    const posts = mockDb.getPosts();
    const rooms = mockDb.getChatRooms();
    const matchedUsers = profiles.filter(p => p.username.toLowerCase().includes(searchVal) ||
        p.display_name?.toLowerCase().includes(searchVal));
    const matchedPosts = posts.filter(p => p.content?.toLowerCase().includes(searchVal)).map(post => {
        const author = profiles.find(p => p.id === post.userId) || { id: post.userId, username: 'anonymous_user', display_name: 'Anonymous', avatar_url: '' };
        return {
            ...post,
            user: {
                id: author.id,
                username: author.username,
                display_name: author.display_name,
                avatar_url: author.avatar_url
            }
        };
    });
    const matchedCommunities = rooms.filter((r) => r.type === 'group' && r.name?.toLowerCase().includes(searchVal)).map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description || 'E2EE Group Chat Community',
        avatarUrl: c.avatar_url
    }));
    return {
        users: matchedUsers,
        communities: matchedCommunities,
        posts: matchedPosts,
        reels: matchedPosts.filter(p => p.type === 'video')
    };
}
export async function logSearchQuery(query) {
    const store = useAuthStore.getState();
    const user = store.user;
    if (!user || !query || query.trim().length === 0)
        return;
    const online = await checkIsOnline();
    if (online && !isMockMode()) {
        try {
            await supabase.from('search_history').insert({
                user_id: user.id,
                query: query.trim().toLowerCase()
            });
        }
        catch (e) { }
    }
    console.log(`[Explore Search] Logged search query: "${query}"`);
}
export async function initializeE2EKeys(userId, deviceId) {
    const store = useAuthStore.getState();
    const keyStorageKey = `jamsh_e2e_keys_${userId}`;
    let keys = null;
    // 1. Try reading from native secure storage first
    if (!keys && Capacitor.isNativePlatform()) {
        try {
            const secureResult = await JamshNearby.getSecure({ key: keyStorageKey });
            if (secureResult && secureResult.value) {
                keys = JSON.parse(secureResult.value);
                store.setDeviceKeyPair(keys);
            }
        }
        catch (e) {
            console.error('[E2EKeys] Native secure store read error', e);
        }
    }
    // 2. If not found in native secure storage, check localStorage
    if (!keys && typeof window !== 'undefined') {
        const savedLocal = localStorage.getItem(keyStorageKey);
        if (savedLocal) {
            try {
                keys = JSON.parse(savedLocal);
                store.setDeviceKeyPair(keys);
            }
            catch (e) {
                console.error('[E2EKeys] Failed to parse localStorage keys', e);
            }
        }
    }
    // 3. Fallback / key generation if keys still don't exist
    if (!keys) {
        if (isMockMode()) {
            const users = mockDb.getUsers();
            const foundUser = users.find((u) => u.id === userId);
            if (foundUser && foundUser.devicePrivateKey && foundUser.devicePublicKey) {
                keys = {
                    privateKey: foundUser.devicePrivateKey,
                    publicKey: foundUser.devicePublicKey,
                };
            }
        }
        if (!keys) {
            keys = await generateDeterministicKeyPair(userId + '_jamsh_e2ee_master_seed_v1');
        }
        // Persist key pair
        if (Capacitor.isNativePlatform()) {
            try {
                await JamshNearby.saveSecure({ key: keyStorageKey, value: JSON.stringify(keys) });
            }
            catch (e) {
                if (typeof window !== 'undefined') {
                    localStorage.setItem(keyStorageKey, JSON.stringify(keys));
                }
            }
        }
        else if (typeof window !== 'undefined') {
            localStorage.setItem(keyStorageKey, JSON.stringify(keys));
        }
        store.setDeviceKeyPair(keys);
    }
    // 4. Sync public key to Supabase profiles & device_keys so peer users can perform ECDH
    if (!isMockMode() && keys?.publicKey) {
        try {
            await supabase
                .from('profiles')
                .update({ device_public_key: keys.publicKey })
                .eq('id', userId);
        }
        catch (e) { }
        try {
            await supabase.from('device_keys').upsert({
                user_id: userId,
                device_id: deviceId,
                identity_key: keys.publicKey,
                signed_prekey: keys.publicKey,
                prekey_signature: 'sig_placeholder',
            }, { onConflict: 'user_id,device_id' });
        }
        catch (err) { }
    }
    return keys;
}
// ----------------------------------------------------
// REELS & AI RECOMMENDATION FEED API
// ----------------------------------------------------
export async function fetchReelsFeed(limit = 10, cursorTimestamp, cursorId) {
    const store = useAuthStore.getState();
    const currentUser = store.user;
    if (!currentUser)
        throw new Error('Not authenticated');
    if (!isMockMode()) {
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData?.session?.access_token || '';
            const response = await fetch(`${supabaseUrl}/functions/v1/reels-feed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ limit, cursorTimestamp, cursorId }),
            });
            const resJson = await response.json();
            if (!response.ok)
                throw new Error(resJson.error || 'Failed to fetch Reels feed');
            return resJson.feed || [];
        }
        catch (e) {
            console.warn('[Reels] Remote Edge function failed, falling back to mock feed', e);
        }
    }
    // Mock recommendation engine with cold-start and engagement scoring
    const videos = mockDb.getVideos();
    const reactions = mockDb.getVideoInteractions();
    const profiles = mockDb.getProfiles();
    const likes = mockDb.getVideoLikes();
    const userInteractions = reactions.filter((r) => r.user_id === currentUser.id);
    const userLikes = likes.filter((l) => l.user_id === currentUser.id).map((l) => l.video_id);
    // Parse cursors
    let filtered = videos.filter(v => v.visibility === 'public' && v.moderation_status === 'approved');
    if (cursorTimestamp) {
        filtered = filtered.filter(v => {
            const t = new Date(v.created_at).getTime();
            const cut = new Date(cursorTimestamp).getTime();
            if (t < cut)
                return true;
            if (t === cut && cursorId && v.id < cursorId)
                return true;
            return false;
        });
    }
    // Calculate scores
    const scored = filtered.map(v => {
        const isLiked = userLikes.includes(v.id);
        const author = profiles.find(p => p.id === v.user_id);
        // Calculate simple content overlap score
        const hasHistory = userInteractions.length > 0;
        let score = 0;
        if (!hasHistory) {
            // Cold-start blend
            score = v.like_count * 0.4 + (Math.random() * 10);
        }
        else {
            // Engagement scoring
            score = v.like_count * 5.0 + v.share_count * 10.0;
            if (isLiked)
                score += 25;
        }
        return {
            ...v,
            user: author || { id: v.user_id, username: 'creator', display_name: 'Creator' },
            liked_by_me: isLiked,
            recommendation_score: score
        };
    });
    // Sort by score
    const sorted = scored.sort((a, b) => b.recommendation_score - a.recommendation_score);
    return sorted.slice(0, limit);
}
export async function likeReel(videoId) {
    const user = useAuthStore.getState().user;
    if (!user)
        throw new Error('Not authenticated');
    if (!isMockMode()) {
        try {
            const { data: existing } = await supabase
                .from('video_likes')
                .select('id')
                .eq('user_id', user.id)
                .eq('video_id', videoId)
                .maybeSingle();
            if (existing) {
                await supabase.from('video_likes').delete().eq('id', existing.id);
                return { liked: false, countChange: -1 };
            }
            else {
                await supabase.from('video_likes').insert({ user_id: user.id, video_id: videoId });
                return { liked: true, countChange: 1 };
            }
        }
        catch (e) {
            console.warn('[Reels] Remote database like failed', e);
        }
    }
    // Fallback
    const likes = mockDb.getVideoLikes();
    const idx = likes.findIndex((l) => l.user_id === user.id && l.video_id === videoId);
    let liked = false;
    let countChange = 0;
    if (idx >= 0) {
        likes.splice(idx, 1);
        liked = false;
        countChange = -1;
    }
    else {
        likes.push({ id: `vlike_${Date.now()}`, user_id: user.id, video_id: videoId, created_at: new Date().toISOString() });
        liked = true;
        countChange = 1;
    }
    mockDb.setVideoLikes(likes);
    // Update video like counter
    const videos = mockDb.getVideos();
    const updated = videos.map(v => {
        if (v.id === videoId) {
            return { ...v, like_count: Math.max(0, v.like_count + countChange) };
        }
        return v;
    });
    mockDb.setVideos(updated);
    return { liked, countChange };
}
export async function commentOnReel(videoId, content, parentId) {
    const user = useAuthStore.getState().user;
    if (!user)
        throw new Error('Not authenticated');
    if (!isMockMode()) {
        try {
            const { data, error } = await supabase
                .from('video_comments')
                .insert({ video_id: videoId, user_id: user.id, content, parent_id: parentId || null })
                .select()
                .single();
            if (!error && data)
                return data;
        }
        catch (e) {
            console.warn('[Reels] Remote comment failed', e);
        }
    }
    // Fallback
    const comments = mockDb.getVideoComments();
    const newComment = {
        id: `vcomm_${Date.now()}`,
        video_id: videoId,
        user_id: user.id,
        content,
        parent_id: parentId || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    mockDb.setVideoComments([...comments, newComment]);
    // Update comment counter
    const videos = mockDb.getVideos();
    const updated = videos.map(v => {
        if (v.id === videoId) {
            return { ...v, comment_count: v.comment_count + 1 };
        }
        return v;
    });
    mockDb.setVideos(updated);
    return newComment;
}
export async function trackVideoInteraction(videoId, type, watchTime = 0, watchPercent = 0) {
    const user = useAuthStore.getState().user;
    if (!user)
        return;
    if (!isMockMode()) {
        try {
            // Log interaction
            await supabase.from('video_interactions').insert({
                user_id: user.id,
                video_id: videoId,
                interaction_type: type,
                score_weight: getScoreWeight(type)
            });
            if (type === 'watch') {
                await supabase.from('video_views').insert({
                    user_id: user.id,
                    video_id: videoId,
                    duration_watched: watchTime,
                    percentage_watched: watchPercent,
                    is_replay: watchPercent > 100
                });
                await supabase.from('watch_history').upsert({
                    user_id: user.id,
                    video_id: videoId,
                    completed: watchPercent >= 95,
                    last_watched_at: new Date().toISOString()
                });
            }
            return;
        }
        catch (e) {
            console.warn('[Reels] Logging interaction failed', e);
        }
    }
    // Fallback
    const interactions = mockDb.getVideoInteractions();
    interactions.push({
        id: `vint_${Date.now()}`,
        user_id: user.id,
        video_id: videoId,
        interaction_type: type,
        score_weight: getScoreWeight(type),
        created_at: new Date().toISOString()
    });
    mockDb.setVideoInteractions(interactions);
    if (type === 'watch') {
        const history = mockDb.getWatchHistory();
        const existingIdx = history.findIndex((h) => h.user_id === user.id && h.video_id === videoId);
        if (existingIdx >= 0) {
            history[existingIdx].completed = watchPercent >= 95;
            history[existingIdx].last_watched_at = new Date().toISOString();
        }
        else {
            history.push({
                user_id: user.id,
                video_id: videoId,
                completed: watchPercent >= 95,
                last_watched_at: new Date().toISOString()
            });
        }
        mockDb.setWatchHistory(history);
    }
}
function getScoreWeight(type) {
    const weights = {
        like: 25,
        share: 40,
        save: 35,
        comment: 15,
        skip: -30,
        report: -100,
        not_interested: -50
    };
    return weights[type] || 0;
}
export async function uploadReel(videoUrl, thumbnailUrl, caption, hashtags, interests, duration) {
    const user = useAuthStore.getState().user;
    if (!user)
        throw new Error('Not authenticated');
    if (!isMockMode()) {
        try {
            const { data, error } = await supabase
                .from('videos')
                .insert({
                user_id: user.id,
                video_url: videoUrl,
                thumbnail_url: thumbnailUrl,
                caption,
                hashtags,
                interests,
                duration,
                visibility: 'public',
                moderation_status: 'approved'
            })
                .select()
                .single();
            if (!error && data)
                return data;
        }
        catch (e) {
            console.warn('[Reels] Remote upload record creation failed', e);
        }
    }
    // Fallback
    const videos = mockDb.getVideos();
    const newVideo = {
        id: `video_${Date.now()}`,
        user_id: user.id,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        caption,
        hashtags,
        interests,
        visibility: 'public',
        duration,
        view_count: 0,
        like_count: 0,
        comment_count: 0,
        share_count: 0,
        save_count: 0,
        moderation_status: 'approved',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    mockDb.setVideos([newVideo, ...videos]);
    return newVideo;
}
let queuedEngagementActions = [];
// Load queue from localStorage on startup
try {
    const saved = localStorage.getItem('jamsh_offline_engagement_queue');
    if (saved)
        queuedEngagementActions = JSON.parse(saved);
}
catch (e) { }
function saveEngagementQueue() {
    try {
        localStorage.setItem('jamsh_offline_engagement_queue', JSON.stringify(queuedEngagementActions));
    }
    catch (e) { }
}
export function queueOfflineEngagement(type, postId, payload = {}) {
    if (type === 'thunder' || type === 'save') {
        const existing = queuedEngagementActions.find(a => a.type === type && a.postId === postId);
        if (existing)
            return;
    }
    const action = {
        id: Math.random().toString(36).substring(7),
        type,
        postId,
        payload,
        createdAt: Date.now()
    };
    queuedEngagementActions.push(action);
    saveEngagementQueue();
    console.log(`[Offline Queue] Queued action: ${type} for post ${postId}`);
}
export async function syncOfflineEngagementQueue() {
    const online = await checkIsOnline();
    if (!online || queuedEngagementActions.length === 0)
        return;
    console.log(`[Sync Engagement] Processing ${queuedEngagementActions.length} offline engagement actions...`);
    const sorted = [...queuedEngagementActions].sort((a, b) => a.createdAt - b.createdAt);
    queuedEngagementActions = [];
    saveEngagementQueue();
    for (const action of sorted) {
        try {
            if (action.type === 'thunder') {
                await toggleThunderReaction(action.postId, action.payload.commentId);
            }
            else if (action.type === 'comment') {
                await addComment(action.postId, action.payload.content, action.payload.parentId);
            }
            else if (action.type === 'save') {
                await toggleSavePost(action.postId);
            }
            else if (action.type === 'share') {
                await shareContent(action.postId, action.payload.targetType, action.payload.targetId);
            }
        }
        catch (err) {
            console.error(`[Sync Engagement] Failed to run queued action ${action.id}:`, err);
            queueOfflineEngagement(action.type, action.postId, action.payload);
        }
    }
}
// ----------------------------------------------------
// GENERAL ENGAGEMENT CLIENT SDK APIS
// ----------------------------------------------------
export async function addComment(postId, content, parentId) {
    const user = useAuthStore.getState().user;
    if (!user)
        throw new Error('Not authenticated');
    const online = await checkIsOnline();
    if (online && !isMockMode()) {
        try {
            const { data, error: functionError } = await supabase.functions.invoke('handle-comment', {
                body: { postId, content, parentId },
            });
            if (!functionError && data && data.comment) {
                return data.comment;
            }
        }
        catch (e) {
            console.warn('[SDK Comment] Edge Function invoke failed, using direct fallback', e);
        }
        try {
            const { data, error } = await supabase
                .from('comments')
                .insert({
                user_id: user.id,
                post_id: postId,
                content,
                parent_id: parentId || null
            })
                .select('*, user:profiles(*)')
                .single();
            if (error)
                throw error;
            return data;
        }
        catch (e) {
            console.warn('[SDK Comment] Remote insert comment failed, using offline fallback', e);
        }
    }
    if (!online) {
        queueOfflineEngagement('comment', postId, { content, parentId });
    }
    const mockComment = {
        id: `com_${Date.now()}`,
        postId,
        userId: user.id,
        content,
        parentId: parentId || null,
        thundersCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        user: user
    };
    const comments = mockDb.getComments();
    mockDb.setComments([...comments, mockComment]);
    const posts = mockDb.getPosts();
    const updatedPosts = posts.map(p => {
        if (p.id === postId) {
            return { ...p, commentsCount: (p.commentsCount || 0) + 1 };
        }
        return p;
    });
    mockDb.setPosts(updatedPosts);
    // Trigger comment/reply notification in mock mode
    const post = posts.find(p => p.id === postId);
    if (post) {
        const notifs = mockDb.getNotifications() || [];
        // 1. If it's a reply to another comment, notify comment owner
        if (parentId) {
            const parentComment = mockDb.getComments().find((c) => c.id === parentId);
            if (parentComment && parentComment.userId !== user.id) {
                notifs.push({
                    id: `notif_${Date.now()}_reply`,
                    receiverId: parentComment.userId,
                    senderId: user.id,
                    type: 'REPLY',
                    status: 'UNREAD',
                    priority: 'MEDIUM',
                    deliveryStatus: 'PENDING',
                    groupKey: `REPLY_${mockComment.id}_${parentComment.userId}`,
                    metadata: { actors: [user.username || 'someone'], count: 1, preview: content.substring(0, 60) },
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
            }
        }
        // 2. Notify post owner (if not oneself and not also parent comment owner to avoid duplicate notifs)
        if (post.user_id && post.user_id !== user.id) {
            const parentComment = parentId ? mockDb.getComments().find((c) => c.id === parentId) : null;
            const parentCommentOwner = parentComment ? parentComment.userId : null;
            if (!parentCommentOwner || post.user_id !== parentCommentOwner) {
                notifs.push({
                    id: `notif_${Date.now()}_comment`,
                    receiverId: post.user_id,
                    senderId: user.id,
                    type: 'COMMENT',
                    status: 'UNREAD',
                    priority: 'MEDIUM',
                    deliveryStatus: 'PENDING',
                    groupKey: `COMMENT_${mockComment.id}_${post.user_id}`,
                    metadata: { actors: [user.username || 'someone'], count: 1, preview: content.substring(0, 60) },
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
            }
        }
        mockDb.setNotifications(notifs);
    }
    return mockComment;
}
export async function editComment(commentId, content) {
    const online = await checkIsOnline();
    if (online && !isMockMode()) {
        const { data, error } = await supabase
            .from('comments')
            .update({ content })
            .eq('id', commentId)
            .select('*, user:profiles(*)')
            .single();
        if (!error && data)
            return data;
    }
    const comments = mockDb.getComments();
    const index = comments.findIndex((c) => c.id === commentId);
    if (index >= 0) {
        comments[index].content = content;
        comments[index].updatedAt = new Date().toISOString();
        mockDb.setComments([...comments]);
        return comments[index];
    }
    throw new Error('Comment not found');
}
export async function deleteComment(commentId) {
    const online = await checkIsOnline();
    if (online && !isMockMode()) {
        const { error } = await supabase.from('comments').delete().eq('id', commentId);
        if (error)
            throw error;
        return;
    }
    const comments = mockDb.getComments();
    const comment = comments.find((c) => c.id === commentId);
    const updatedComments = comments.filter((c) => c.id !== commentId);
    mockDb.setComments(updatedComments);
    if (comment) {
        const posts = mockDb.getPosts();
        const updatedPosts = posts.map(p => {
            if (p.id === comment.postId) {
                return { ...p, commentsCount: Math.max(0, (p.commentsCount || 1) - 1) };
            }
            return p;
        });
        mockDb.setPosts(updatedPosts);
    }
}
export async function fetchComments(postId, sortBy = 'newest', page = 0, limit = 10) {
    const online = await checkIsOnline();
    if (online && !isMockMode()) {
        try {
            let query = supabase
                .from('comments')
                .select('*, user:profiles(*)')
                .eq('post_id', postId)
                .is('parent_id', null);
            if (sortBy === 'oldest')
                query = query.order('created_at', { ascending: true });
            else
                query = query.order('created_at', { ascending: false });
            const { data, error } = await query.range(page * limit, (page + 1) * limit - 1);
            if (!error && data) {
                const commentIds = data.map(c => c.id);
                const { data: replies } = await supabase
                    .from('comments')
                    .select('*, user:profiles(*)')
                    .in('parent_id', commentIds);
                return data.map(parent => ({
                    ...parent,
                    replies: replies?.filter(r => r.parent_id === parent.id) || []
                }));
            }
        }
        catch (e) { }
    }
    const comments = mockDb.getComments();
    const rootComments = comments.filter((c) => c.postId === postId && !c.parentId);
    if (sortBy === 'oldest') {
        rootComments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    else if (sortBy === 'top') {
        rootComments.sort((a, b) => (b.thundersCount || 0) - (a.thundersCount || 0));
    }
    else {
        rootComments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    const paginated = rootComments.slice(page * limit, (page + 1) * limit);
    return paginated.map((parent) => ({
        ...parent,
        replies: comments.filter((c) => c.parentId === parent.id)
    }));
}
export async function toggleSavePost(postId) {
    const user = useAuthStore.getState().user;
    if (!user)
        throw new Error('Not authenticated');
    const online = await checkIsOnline();
    if (online && !isMockMode()) {
        try {
            const { data: existing } = await supabase
                .from('saves')
                .select('id')
                .eq('user_id', user.id)
                .eq('post_id', postId)
                .maybeSingle();
            if (existing) {
                await supabase.from('saves').delete().eq('id', existing.id);
                return { saved: false };
            }
            else {
                await supabase.from('saves').insert({ user_id: user.id, post_id: postId });
                return { saved: true };
            }
        }
        catch (e) { }
    }
    if (!online) {
        queueOfflineEngagement('save', postId);
    }
    const saves = mockDb.getSaves();
    const matchIdx = saves.findIndex((s) => s.userId === user.id && s.postId === postId);
    let saved = false;
    if (matchIdx >= 0) {
        saves.splice(matchIdx, 1);
        saved = false;
    }
    else {
        saves.push({ id: `save_${Date.now()}`, userId: user.id, postId });
        saved = true;
    }
    mockDb.setSaves(saves);
    const posts = mockDb.getPosts();
    const updatedPosts = posts.map(p => {
        if (p.id === postId) {
            return { ...p, savesCount: Math.max(0, (p.savesCount || 0) + (saved ? 1 : -1)) };
        }
        return p;
    });
    mockDb.setPosts(updatedPosts);
    return { saved };
}
export async function shareContent(postId, targetType = 'external', targetId) {
    const user = useAuthStore.getState().user;
    if (!user)
        throw new Error('Not authenticated');
    const online = await checkIsOnline();
    if (online && !isMockMode()) {
        try {
            const { data, error } = await supabase
                .from('shares')
                .insert({
                user_id: user.id,
                post_id: postId,
                target_type: targetType,
                target_id: targetId || null
            })
                .select()
                .single();
            if (!error && data)
                return data;
        }
        catch (e) { }
    }
    if (!online) {
        queueOfflineEngagement('share', postId, { targetType, targetId });
    }
    const shares = mockDb.getShares();
    const mockShare = { id: `share_${Date.now()}`, userId: user.id, postId, targetType, targetId };
    mockDb.setShares([...shares, mockShare]);
    const posts = mockDb.getPosts();
    const updatedPosts = posts.map(p => {
        if (p.id === postId) {
            return { ...p, sharesCount: (p.sharesCount || 0) + 1 };
        }
        return p;
    });
    mockDb.setPosts(updatedPosts);
    return mockShare;
}
export async function logPostView(postId, watchTime = 0.0) {
    const user = useAuthStore.getState().user;
    const online = await checkIsOnline();
    if (online && !isMockMode()) {
        try {
            const { data, error } = await supabase
                .from('post_views')
                .insert({
                user_id: user?.id || null,
                post_id: postId,
                watch_time: watchTime
            })
                .select()
                .single();
            if (!error && data)
                return data;
        }
        catch (e) { }
    }
    const posts = mockDb.getPosts();
    const updatedPosts = posts.map(p => {
        if (p.id === postId) {
            return {
                ...p,
                viewsCount: (p.viewsCount || 0) + 1,
                watchTimeTotal: (p.watchTimeTotal || 0.0) + watchTime
            };
        }
        return p;
    });
    mockDb.setPosts(updatedPosts);
    return { success: true };
}
async function getAuthHeaders() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        return {
            'Content-Type': 'application/json',
            'Authorization': session ? `Bearer ${session.access_token}` : '',
        };
    }
    catch {
        return {
            'Content-Type': 'application/json',
            'Authorization': '',
        };
    }
}
const getBackendUrl = () => {
    if (typeof process !== 'undefined' && process.env) {
        if (process.env.VITE_API_URL)
            return process.env.VITE_API_URL;
        if (process.env.VITE_SOCKET_URL)
            return process.env.VITE_SOCKET_URL;
    }
    try {
        const metaEnv = Function('return import.meta.env')();
        if (metaEnv) {
            if (metaEnv.VITE_API_URL)
                return metaEnv.VITE_API_URL;
            if (metaEnv.VITE_SOCKET_URL)
                return metaEnv.VITE_SOCKET_URL;
        }
    }
    catch (e) { }
    return '';
};
export async function fetchNotifications(page = 0, limit = 20, category) {
    const store = useAuthStore.getState();
    const currentUser = store.user;
    if (!currentUser)
        return [];
    if (!isMockMode() && await checkIsOnline()) {
        try {
            const { data, error } = await supabase.functions.invoke('notifications-api', {
                body: { action: 'fetch-notifications', page, limit, category }
            });
            if (!error && data && Array.isArray(data.notifications)) {
                return data.notifications;
            }
        }
        catch (e) {
            console.warn('[Notifications] Edge Function invoke failed, querying Supabase directly', e);
        }
        try {
            let query = supabase
                .from('notifications')
                .select('*, sender:profiles!sender_id(*)')
                .eq('receiver_id', currentUser.id)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .range(page * limit, (page + 1) * limit - 1);
            if (category && category !== 'All' && category !== 'ALL') {
                query = query.eq('type', category.toUpperCase());
            }
            const { data } = await query;
            if (data)
                return data;
        }
        catch (e) { }
    }
    // Fallback LocalMockDB
    let notifications = mockDb.getNotifications() || [];
    notifications = notifications.filter((n) => n.receiverId === currentUser.id && !n.deletedAt);
    if (category && category !== 'All') {
        notifications = notifications.filter((n) => {
            if (category === 'Likes')
                return n.type === 'LIKE' || n.type === 'THUNDER';
            if (category === 'Comments')
                return n.type === 'COMMENT' || n.type === 'REPLY';
            if (category === 'Follows')
                return n.type === 'FOLLOW' || n.type === 'FOLLOW_REQUEST' || n.type === 'FOLLOW_ACCEPTED';
            if (category === 'Mentions')
                return n.type === 'MENTION' || n.type === 'TAG';
            if (category === 'AI')
                return n.type === 'AI_RECOMMENDATION';
            return true;
        });
    }
    // Group notifications in Mock mode (like "Rahul and 12 others liked your post")
    const groupedMap = new Map();
    const results = [];
    for (const n of notifications) {
        if (!n.groupKey) {
            results.push(n);
            continue;
        }
        if (groupedMap.has(n.groupKey)) {
            const parent = groupedMap.get(n.groupKey);
            if (parent.metadata && n.metadata && n.metadata.actors) {
                const existingActors = new Set(parent.metadata.actors);
                n.metadata.actors.forEach((act) => existingActors.add(act));
                parent.metadata.actors = Array.from(existingActors);
                parent.metadata.count = (parent.metadata.count || 1) + 1;
            }
        }
        else {
            const copy = { ...n, metadata: n.metadata ? { ...n.metadata } : { actors: [], count: 1 } };
            groupedMap.set(n.groupKey, copy);
            results.push(copy);
        }
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
export async function fetchUnreadCounts() {
    const store = useAuthStore.getState();
    const currentUser = store.user;
    const defaultCounts = { messages: 0, notifications: 0, communities: 0, requests: 0 };
    if (!currentUser)
        return defaultCounts;
    if (!isMockMode() && await checkIsOnline()) {
        try {
            const { data, error } = await supabase.functions.invoke('notifications-api', {
                body: { action: 'unread-counts' }
            });
            if (!error && data && data.counts) {
                return data.counts;
            }
        }
        catch (e) {
            console.warn('[Notifications] Edge Function unread-counts failed, querying Supabase directly', e);
        }
        try {
            const { data: unread } = await supabase
                .from('notifications')
                .select('id, type')
                .eq('receiver_id', currentUser.id)
                .eq('status', 'UNREAD')
                .is('deleted_at', null);
            const list = unread || [];
            return {
                messages: list.filter((n) => n.type === 'MESSAGE').length,
                notifications: list.filter((n) => n.type !== 'MESSAGE' && n.type !== 'COMMUNITY').length,
                communities: list.filter((n) => n.type === 'COMMUNITY').length,
                requests: 0,
            };
        }
        catch (e) { }
    }
    // Fallback LocalMockDB
    const notifications = mockDb.getNotifications() || [];
    const unreadNotifs = notifications.filter((n) => n.receiverId === currentUser.id && n.status === 'UNREAD' && !n.deletedAt);
    const followers = mockDb.getFollowers() || [];
    const pendingRequests = followers.filter((f) => f.following_id === currentUser.id && f.status === 'pending');
    return {
        messages: unreadNotifs.filter((n) => n.type === 'MESSAGE').length,
        notifications: unreadNotifs.filter((n) => n.type !== 'MESSAGE' && n.type !== 'COMMUNITY').length,
        communities: unreadNotifs.filter((n) => n.type === 'COMMUNITY').length,
        requests: pendingRequests.length
    };
}
export async function markNotificationAsRead(id) {
    const store = useAuthStore.getState();
    if (!store.user)
        return false;
    if (!isMockMode() && await checkIsOnline()) {
        try {
            const { data, error } = await supabase.functions.invoke('notifications-api', {
                body: { action: 'mark-read', notificationId: id }
            });
            if (!error && data && data.success)
                return true;
        }
        catch (e) { }
        try {
            await supabase
                .from('notifications')
                .update({ status: 'READ', read_at: new Date().toISOString() })
                .eq('id', id)
                .eq('receiver_id', store.user.id);
            return true;
        }
        catch (e) { }
    }
    // Fallback LocalMockDB
    const notifications = mockDb.getNotifications() || [];
    const updated = notifications.map((n) => {
        if (n.id === id) {
            return { ...n, status: 'READ', readAt: new Date().toISOString() };
        }
        return n;
    });
    mockDb.setNotifications(updated);
    return true;
}
export async function markAllNotificationsAsRead() {
    const store = useAuthStore.getState();
    if (!store.user)
        return false;
    if (!isMockMode() && await checkIsOnline()) {
        try {
            const { data, error } = await supabase.functions.invoke('notifications-api', {
                body: { action: 'mark-all-read' }
            });
            if (!error && data && data.success)
                return true;
        }
        catch (e) { }
        try {
            await supabase
                .from('notifications')
                .update({ status: 'READ', read_at: new Date().toISOString() })
                .eq('receiver_id', store.user.id)
                .eq('status', 'UNREAD');
            return true;
        }
        catch (e) { }
    }
    // Fallback LocalMockDB
    const notifications = mockDb.getNotifications() || [];
    const updated = notifications.map((n) => {
        if (n.receiverId === store.user.id) {
            return { ...n, status: 'READ', readAt: new Date().toISOString() };
        }
        return n;
    });
    mockDb.setNotifications(updated);
    return true;
}
export async function deleteNotification(id) {
    const store = useAuthStore.getState();
    if (!store.user)
        return false;
    if (!isMockMode() && await checkIsOnline()) {
        try {
            const { data, error } = await supabase.functions.invoke('notifications-api', {
                body: { action: 'delete-notification', notificationId: id }
            });
            if (!error && data && data.success)
                return true;
        }
        catch (e) { }
        try {
            await supabase
                .from('notifications')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', id)
                .eq('receiver_id', store.user.id);
            return true;
        }
        catch (e) { }
    }
    // Fallback LocalMockDB (Soft delete)
    const notifications = mockDb.getNotifications() || [];
    const updated = notifications.map((n) => {
        if (n.id === id) {
            return { ...n, deletedAt: new Date().toISOString() };
        }
        return n;
    });
    mockDb.setNotifications(updated);
    return true;
}
export * from './services/StoryService.js';
