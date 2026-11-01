import { createClient } from '@supabase/supabase-js';
import { create } from 'zustand';
import { UserProfile, Post, Comment, Story, ChatRoom, Message, LiveStream, LiveComment, DeviceKey, Notification, NotificationCounts, NotificationPreferences } from '@jamsh/types';
import { generateKeyPair, encryptPairwise, decryptPairwise, deriveSharedSecret, importRawAESKey, generateGroupKeyHex, encryptWithKey, decryptWithKey, computeFingerprint, generateAckSignature, verifyAckSignature } from '@jamsh/encryption';


import { registerPlugin, Capacitor } from '@capacitor/core';
import { MessagingService } from './services/MessagingService.js';
export * from './services/MessagingService.js';

// Register Capacitor Custom Plugin
export const JamshNearby = registerPlugin<any>('JamshNearby');

/**
 * Checks and requests location and bluetooth permissions on native platforms.
 * Returns true if both permissions are granted, or if we are not on a native platform.
 */
export async function requestNearbyPermissions(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    let permStatus = await JamshNearby.checkPermissions();
    if (permStatus.location !== 'granted' || permStatus.bluetooth !== 'granted') {
      console.log('[Permissions] Requesting location and bluetooth permissions...');
      permStatus = await JamshNearby.requestPermissions();
    }
    const granted = permStatus.location === 'granted' && permStatus.bluetooth === 'granted';
    console.log(`[Permissions] Status location: ${permStatus.location}, bluetooth: ${permStatus.bluetooth}, granted: ${granted}`);
    return granted;
  } catch (e) {
    console.error('[Permissions] Failed to check or request permissions', e);
    return false;
  }
}

// Cryptographic and UUID utility helpers
export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function encodeLengthPrefixed(field: string): string {
  return `${field.length}:${field}`;
}

// Local byte converters matching encryption packages
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// HMAC-SHA256 implementation using Web Crypto API
export async function hmacSHA256(keyHex: string, message: string): Promise<string> {
  const keyBytes = hexToBytes(keyHex);
  const msgBytes = new TextEncoder().encode(message);
  
  let cryptoObj: any = typeof globalThis !== 'undefined' ? (globalThis.crypto || (globalThis as any).msCrypto) : null;
  if (!cryptoObj && typeof require !== 'undefined') {
    cryptoObj = require('crypto').webcrypto;
  }
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error('Web Crypto API not available for HMAC');
  }
  
  const key = await cryptoObj.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await cryptoObj.subtle.sign('HMAC', key, msgBytes);
  return bytesToHex(new Uint8Array(signature));
}

// Active local discovery cache for nearby peers (peerUserId -> { ip: string, lastSeen: number })
export const nearbyPeers = new Map<string, { ip: string; lastSeen: number; isOnline?: boolean }>();

// Initialize Supabase Client
const getSupabaseConfig = () => {
  let url = 'https://czxoschackeetzspupxh.supabase.co';
  let key = 'sb_publishable__B8FxfHeDWfs65PqwfBhkQ_NA-r4HDH';
  const metaEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

  if (typeof process !== 'undefined' && process.env) {
    if (process.env.EXPO_PUBLIC_SUPABASE_URL) url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    else if (process.env.NEXT_PUBLIC_SUPABASE_URL) url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    else if (process.env.VITE_SUPABASE_URL) url = process.env.VITE_SUPABASE_URL;

    if (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    else if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else if (process.env.VITE_SUPABASE_ANON_KEY) key = process.env.VITE_SUPABASE_ANON_KEY;
  }

  if (metaEnv?.VITE_SUPABASE_URL) url = metaEnv.VITE_SUPABASE_URL;
  if (metaEnv?.VITE_SUPABASE_ANON_KEY) key = metaEnv.VITE_SUPABASE_ANON_KEY;

  return { url, key };
};

const { url: supabaseUrl, key: supabaseAnonKey } = getSupabaseConfig();

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Zustand Auth & Encryption Key Store
interface AuthState {
  user: any | null;
  profile: UserProfile | null;
  authSetupRequired: boolean;
  deviceKeyPair: { privateKey: string; publicKey: string } | null;
  groupKeys: Record<string, string>; // room_id -> decrypted group key (hex)
  setSession: (user: any, profile: UserProfile | null) => void;
  setAuthSetupRequired: (required: boolean) => void;
  setDeviceKeyPair: (keys: { privateKey: string; publicKey: string } | null) => void;
  addGroupKey: (roomId: string, keyHex: string) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  authSetupRequired: false,
  deviceKeyPair: null,
  groupKeys: {},
  setSession: (user, profile) => set((state) => ({ user, profile, deviceKeyPair: state.user?.id === user?.id ? state.deviceKeyPair : null })),
  setAuthSetupRequired: (authSetupRequired) => set({ authSetupRequired }),
  setDeviceKeyPair: (deviceKeyPair) => set({ deviceKeyPair }),
  addGroupKey: (roomId, keyHex) => set((state) => ({ groupKeys: { ...state.groupKeys, [roomId]: keyHex } })),
  logout: async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.log('Supabase signout skipped in local mode');
    }
    set({ user: null, profile: null, authSetupRequired: false, deviceKeyPair: null, groupKeys: {} });
  },
}));

// Helper to determine if we should fall back to LocalMockDB
const isMockMode = () => {
  // Check if mock mode is explicitly enabled via environment variable
  if (typeof process !== 'undefined' && process.env && process.env.VITE_USE_MOCK_API === 'true') {
    return true;
  }
  const metaEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return metaEnv?.VITE_USE_MOCK_API === 'true';
};


// ----------------------------------------------------
// LOCAL MOCK DATABASE SYSTEM
// ----------------------------------------------------
class LocalMockDatabase {
  private getStore(key: string, defaultVal: any = []): any {
    if (typeof window === 'undefined' || !window.localStorage) {
      if (!(global as any)[key]) {
        (global as any)[key] = defaultVal;
      }
      return (global as any)[key];
    }
    const val = window.localStorage.getItem(key);
    if (!val) {
      window.localStorage.setItem(key, JSON.stringify(defaultVal));
      return defaultVal;
    }
    try {
      return JSON.parse(val);
    } catch {
      return defaultVal;
    }
  }

  private setStore(key: string, data: any) {
    if (typeof window === 'undefined' || !window.localStorage) {
      (global as any)[key] = data;
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
    list.forEach((u: any) => {
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
  setUsers(users: any) { this.setStore('jamsh_mock_users', users); }

  getProfiles(): UserProfile[] {
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
  setProfiles(profiles: any) { this.setStore('jamsh_mock_profiles', profiles); }

  getPosts(): any[] {
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
  setPosts(posts: any) { this.setStore('jamsh_mock_posts', posts); }

  getFollowers() { return this.getStore('jamsh_mock_followers', []); }
  setFollowers(followers: any) { this.setStore('jamsh_mock_followers', followers); }

  getChatRooms() { return this.getStore('jamsh_mock_chat_rooms', []); }
  setChatRooms(rooms: any) { this.setStore('jamsh_mock_chat_rooms', rooms); }

  getMessages(): Message[] { return this.getStore('jamsh_mock_messages', []); }
  setMessages(messages: any) { this.setStore('jamsh_mock_messages', messages); }

  getReactions() { return this.getStore('jamsh_mock_reactions', []); }
  setReactions(reactions: any) { this.setStore('jamsh_mock_reactions', reactions); }

  getVideos(): any[] {
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
  setVideos(videos: any) { this.setStore('jamsh_mock_videos', videos); }

  getVideoLikes() { return this.getStore('jamsh_mock_video_likes', []); }
  setVideoLikes(likes: any) { this.setStore('jamsh_mock_video_likes', likes); }

  getVideoComments() { return this.getStore('jamsh_mock_video_comments', []); }
  setVideoComments(comments: any) { this.setStore('jamsh_mock_video_comments', comments); }

  getVideoSaves() { return this.getStore('jamsh_mock_video_saves', []); }
  setVideoSaves(saves: any) { this.setStore('jamsh_mock_video_saves', saves); }

  getVideoInteractions() { return this.getStore('jamsh_mock_video_interactions', []); }
  setVideoInteractions(interactions: any) { this.setStore('jamsh_mock_video_interactions', interactions); }

  getWatchHistory() { return this.getStore('jamsh_mock_watch_history', []); }
  setWatchHistory(history: any) { this.setStore('jamsh_mock_watch_history', history); }

  getComments() { return this.getStore('jamsh_mock_comments', []); }
  setComments(comments: any) { this.setStore('jamsh_mock_comments', comments); }

  getSaves() { return this.getStore('jamsh_mock_saves', []); }
  setSaves(saves: any) { this.setStore('jamsh_mock_saves', saves); }

  getShares() { return this.getStore('jamsh_mock_shares', []); }
  setShares(shares: any) { this.setStore('jamsh_mock_shares', shares); }

  getNotifications() { return this.getStore('jamsh_mock_notifications', []); }
  setNotifications(notifs: any) { this.setStore('jamsh_mock_notifications', notifs); }
}

export const mockDb = new LocalMockDatabase();

// ----------------------------------------------------
// AUTH & PROFILE API
// ----------------------------------------------------

export async function signInUser(contact: string, password: string): Promise<{ user: any; profile: UserProfile }> {
  if (isMockMode()) {
    const users = mockDb.getUsers();
    const normalizedContact = contact.trim().toLowerCase();
    const foundUser = users.find((u: any) =>
      (u.email?.toLowerCase() === normalizedContact || u.username?.toLowerCase() === normalizedContact) &&
      u.password === password
    );
    if (!foundUser) throw new Error('Invalid login credentials');

    const profiles = mockDb.getProfiles();
    let profile: UserProfile | undefined = profiles.find((p: any) => p.id === foundUser.id);
    if (!profile) {
      profile = {
        id: foundUser.id,
        username: foundUser.username || foundUser.email?.split('@')[0] || 'user',
        display_name: foundUser.display_name || foundUser.username || 'User',
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
        updated_at: new Date().toISOString(),
      } as any;
      mockDb.setProfiles([...profiles, profile]);
    }

    useAuthStore.getState().setSession(foundUser, profile as UserProfile);
    await initializeE2EKeys(foundUser.id, 'web-device-1');
    return { user: foundUser, profile: profile as UserProfile };
  }

  const isEmail = contact.includes('@');
  if (!isEmail) {
    const { data, error } = await supabase.functions.invoke('auth-username-login', {
      body: { username: contact.trim(), password },
    });
    if (error || !data?.access_token || !data?.refresh_token || !data.user) {
      throw new Error('Invalid username or password.');
    }
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    if (sessionError) throw sessionError;
    const profile = await fetchProfile(data.user.id);
    if (!profile) throw new Error('Your account profile could not be loaded.');
    useAuthStore.getState().setSession(data.user, profile);
    useAuthStore.getState().setAuthSetupRequired(false);
    await initializeE2EKeys(data.user.id, 'web-device-1');
    return { user: data.user, profile };
  }
  const signInPayload: any = {
    password,
  };
  if (isEmail) {
    signInPayload.email = contact.trim();
  } else {
    signInPayload.phone = contact.trim();
  }

  const { data, error } = await supabase.auth.signInWithPassword(signInPayload);
  if (error) {
    if (error.message?.toLowerCase().includes('email not confirmed')) {
      throw new Error('Email not confirmed. Please check your inbox or confirm your email to log in.');
    }
    if (error.message?.toLowerCase().includes('invalid login credentials')) {
      throw new Error('Invalid email or password.');
    }
    throw error;
  }
  if (!data.user) throw new Error('Authentication failed');

  let profile = await fetchProfile(data.user.id);
  const finalProfile: UserProfile = profile || ({
    id: data.user.id,
    email: data.user.email || null,
    username: (data.user.user_metadata?.username || data.user.email?.split('@')[0] || `user_${data.user.id.slice(0, 6)}`) as string,
    display_name: (data.user.user_metadata?.display_name || data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'JamSh User') as string,
    avatar_url: (data.user.user_metadata?.avatar_url || '') as string,
    cover_url: '',
    bio: '',
    website: '',
    followers_count: 0,
    following_count: 0,
    is_private: false,
    is_verified: false,
    birthday: (data.user.user_metadata?.birthday || null) as any,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any);

  if (!profile) {
    try {
      await supabase.from('profiles').upsert(finalProfile as any);
      cacheProfile(finalProfile);
    } catch (_) {}
  }

  useAuthStore.getState().setSession(data.user, finalProfile);
  useAuthStore.getState().setAuthSetupRequired(false);
  await initializeE2EKeys(data.user.id, 'web-device-1');
  return { user: data.user, profile: finalProfile };
}

export async function signUpUser(
  contact: string,
  username: string,
  displayName: string,
  birthday: string,
  password: string
): Promise<{ user: any; profile: UserProfile }> {
  if (isMockMode()) {
    const users = mockDb.getUsers();
    if (users.some((u: any) => u.email === contact.trim())) {
      throw new Error('An account with this email already exists. Please log in.');
    }
    if (users.some((u: any) => u.username?.toLowerCase() === username.trim().toLowerCase())) {
      throw new Error('That username is already taken.');
    }
    const newUserId = `user_${Date.now()}`;
    const newUser = { id: newUserId, email: contact.trim(), username, password };
    mockDb.setUsers([...users, newUser]);

    const profiles = mockDb.getProfiles();
    const newProfile: UserProfile = {
      id: newUserId,
      email: contact.trim().toLowerCase(),
      username: username.trim(),
      display_name: displayName.trim(),
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
    } as any;
    mockDb.setProfiles([...profiles, newProfile]);

    useAuthStore.getState().setSession(newUser, newProfile);
    await initializeE2EKeys(newUserId, 'web-device-1');
    return { user: newUser, profile: newProfile };
  }

  const isEmail = contact.includes('@');
  const signUpPayload: any = {
    password,
    options: {
      data: {
        username: username.trim(),
        display_name: displayName.trim(),
        birthday,
      }
    }
  };

  if (isEmail) {
    signUpPayload.email = contact.trim();
  } else {
    signUpPayload.phone = contact.trim();
  }

  const { data, error } = await supabase.auth.signUp(signUpPayload);
  if (error) {
    if (error.message?.toLowerCase().includes('username already exists') || error.code === '23505') {
      throw new Error('That username is already taken.');
    }
    if (error.message?.toLowerCase().includes('user already registered') || error.message?.toLowerCase().includes('already registered')) {
      throw new Error('An account with this email already exists. Please log in.');
    }
    throw error;
  }
  if (!data.user) throw new Error('Registration failed');

  // Supabase returns an empty identities list if user already exists (enumeration prevention)
  if (!data.session && data.user.identities && data.user.identities.length === 0) {
    throw new Error('An account with this email already exists. Please log in.');
  }

  // Poll for database profile trigger, fallback if delayed
  let profile: UserProfile | null = null;
  for (let i = 0; i < 3; i++) {
    profile = await fetchProfile(data.user.id);
    if (profile) break;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  const finalProfile: UserProfile = profile || ({
    id: data.user.id,
    email: data.user.email || contact.trim().toLowerCase(),
    username: username.trim(),
    display_name: displayName.trim(),
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
  } as any);

  if (!profile) {
    try {
      await supabase.from('profiles').upsert(finalProfile as any);
      cacheProfile(finalProfile);
    } catch (_) {}
  }

  useAuthStore.getState().setSession(data.user, finalProfile);
  useAuthStore.getState().setAuthSetupRequired(false);
  await initializeE2EKeys(data.user.id, 'web-device-1');
  return { user: data.user, profile: finalProfile };
}

export async function signOutUser(): Promise<void> {
  await useAuthStore.getState().logout();
}

export async function fetchProfile(userId: string): Promise<UserProfile | null> {
  if (isMockMode()) {
    const profiles = mockDb.getProfiles();
    const profile = profiles.find(p => p.id === userId);
    if (profile) cacheProfile(profile);
    return profile || null;
  }

  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error || !data) return null;
  
  // Cache profile metadata locally
  cacheProfile(data as UserProfile);
  
  return data as UserProfile;
}

export async function fetchProfileByEmail(email: string): Promise<UserProfile | null> {
  if (isMockMode()) {
    return mockDb.getProfiles().find((profile: any) =>
      profile.email?.toLowerCase() === email.trim().toLowerCase()
    ) || null;
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();
  if (error || !data) return null;
  return data as UserProfile;
}

export async function completeGoogleProfile(
  username: string,
  displayName: string,
  birthday?: string,
  password?: string
): Promise<UserProfile> {
  const store = useAuthStore.getState();
  if (!store.user) throw new Error('Not authenticated');
  const cleanUsername = username.trim();
  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(cleanUsername)) {
    throw new Error('Username must be 3-30 characters and use only letters, numbers, underscores, or periods.');
  }

  if (isMockMode()) {
    const profiles = mockDb.getProfiles();
    if (profiles.some((p: any) => p.id !== store.user.id && p.username.toLowerCase() === cleanUsername.toLowerCase())) {
      throw new Error('That username is already taken.');
    }
    const existing = profiles.find((p: any) => p.id === store.user.id);
    const updated = {
      ...(existing || {}),
      id: store.user.id,
      email: store.user.email,
      username: cleanUsername,
      display_name: displayName.trim() || existing?.display_name || cleanUsername,
      birthday: birthday || existing?.birthday || null,
      updated_at: new Date().toISOString(),
    } as UserProfile;
    mockDb.setProfiles([...profiles.filter((p: any) => p.id !== store.user.id), updated]);
    if (password) {
      const users = mockDb.getUsers();
      mockDb.setUsers(users.map((user: any) => user.id === store.user.id ? { ...user, password } : user));
    }
    store.user.user_metadata = {
      ...(store.user.user_metadata || {}),
      google_profile_completed: true,
      username: cleanUsername,
    };
    store.setSession(store.user, updated);
    store.setAuthSetupRequired(false);
    return updated;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      username: cleanUsername,
      display_name: displayName.trim() || cleanUsername,
      birthday: birthday || null,
      email: store.user.email?.toLowerCase() || null,
    })
    .eq('id', store.user.id)
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('That username is already taken.');
    throw error;
  }
  const { error: metadataError } = await supabase.auth.updateUser({
    ...(password ? { password } : {}),
    data: { google_profile_completed: true, username: cleanUsername },
  });
  if (metadataError) throw metadataError;
  store.setSession(store.user, data as UserProfile);
  store.setAuthSetupRequired(false);
  return data as UserProfile;
}

export async function updateProfile(profileUpdates: Partial<UserProfile>): Promise<UserProfile> {
  const store = useAuthStore.getState();
  const user = store.user;
  if (!user) throw new Error('Not authenticated');

  if (isMockMode()) {
    const profiles = mockDb.getProfiles();
    const existingIndex = profiles.findIndex(p => p.id === user.id);
    let updatedProfile: UserProfile;
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
      } as any;
      profiles.push(updatedProfile);
    } else {
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
  } else {
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

  store.setSession(user, result as UserProfile);
  return result as UserProfile;
}

export async function searchUsers(query: string, limit = 15, excludeSelf = false): Promise<UserProfile[]> {
  const cleanQuery = (query || '').trim().replace(/^@/, '');
  if (!cleanQuery) return [];

  const currentUser = useAuthStore.getState().user;
  const currentUserId = currentUser?.id;

  const filterSelf = (list: any[]) => {
    if (!excludeSelf || !currentUserId) return list;
    return list.filter((p: any) => p.id !== currentUserId);
  };

  const online = await checkIsOnline();
  if (!online) {
    const cached = getCachedProfiles();
    const searchVal = cleanQuery.toLowerCase();
    const matched = cached.filter((p: any) => 
      (p.username && p.username.toLowerCase().includes(searchVal)) || 
      (p.display_name && p.display_name.toLowerCase().includes(searchVal))
    );
    return filterSelf(matched);
  }
  if (isMockMode()) {
    const profiles = mockDb.getProfiles();
    const searchVal = cleanQuery.toLowerCase();
    const matched = profiles.filter((p: any) => 
      (p.username && p.username.toLowerCase().includes(searchVal)) || 
      (p.display_name && p.display_name.toLowerCase().includes(searchVal))
    );
    return filterSelf(matched);
  }

  try {
    // 1. Try high-performance RPC function with ranking & functional lower indexes
    const { data: rpcData, error: rpcError } = await supabase.rpc('search_profiles', {
      p_query: cleanQuery,
      p_limit: limit,
      p_exclude_self: excludeSelf,
    });

    if (!rpcError && rpcData && Array.isArray(rpcData)) {
      const filtered = filterSelf(rpcData);
      filtered.forEach((p: any) => cacheProfile(p as UserProfile));
      return filtered as UserProfile[];
    }
  } catch (rpcErr) {
    console.warn('[searchUsers] RPC search failed, falling back to direct query:', rpcErr);
  }

  // 2. Direct fallback query
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, is_verified, is_private, followers_count, following_count')
      .or(`username.ilike.%${cleanQuery}%,display_name.ilike.%${cleanQuery}%`)
      .limit(limit);

    if (error || !data) return [];
    
    const filtered = filterSelf(data as UserProfile[]);
    filtered.forEach((p: any) => cacheProfile(p as UserProfile));
    return filtered;
  } catch (err) {
    console.error('[searchUsers] Error during user search:', err);
    return [];
  }
}


// Supabase Auth Helpers
export async function forgotPassword(email: string, redirectTo: string): Promise<void> {
  if (isMockMode()) {
    console.log('Forgot password email requested for', email);
    return;
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) throw error;
}

export async function updatePassword(password: string): Promise<void> {
  if (isMockMode()) {
    console.log('Password updated in mock mode to', password);
    return;
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signInWithGoogle(redirectTo?: string): Promise<void> {
  const store = useAuthStore.getState();

  if (isMockMode()) {
    const users = mockDb.getUsers();
    const googleEmail = 'google.user@example.test';
    const foundUser = users.find((candidate: any) => candidate.email === googleEmail) || {
      id: `google_${Date.now()}`,
      email: googleEmail,
      user_metadata: { full_name: 'Google User', avatar_url: '', provider: 'google' },
    };
    if (!users.some((candidate: any) => candidate.id === foundUser.id)) {
      mockDb.setUsers([...users, foundUser]);
    }
    const profiles = mockDb.getProfiles();
    let profile = profiles.find((p: any) => p.id === foundUser.id);
    if (!profile) {
      profile = {
        id: foundUser.id,
        email: googleEmail,
        username: `google_user_${foundUser.id.slice(-6)}`,
        display_name: 'Google User',
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
        updated_at: new Date().toISOString(),
      } as any;
      mockDb.setProfiles([...profiles, profile]);
    }
    store.setSession(foundUser, profile as UserProfile);
    store.setAuthSetupRequired(!foundUser.user_metadata?.google_profile_completed);
    await initializeE2EKeys(foundUser.id, 'web-device-1');
    return;
  }

  const effectiveRedirect = redirectTo || (typeof window !== 'undefined' ? window.location.origin : undefined);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: effectiveRedirect,
    },
  });

  if (error) throw error;

  if (data?.url && typeof window !== 'undefined') {
    window.location.href = data.url;
  }
}

export async function sendPhoneOtp(phone: string): Promise<void> {
  if (isMockMode()) {
    console.log('Phone OTP requested for', phone);
    return;
  }
  const { error } = await supabase.auth.signInWithOtp({
    phone,
  });
  if (error) throw error;
}

export async function verifyPhoneOtp(phone: string, token: string): Promise<{ user: any; profile: UserProfile }> {
  if (isMockMode()) {
    const foundUser = mockDb.getUsers()[0];
    const profiles = mockDb.getProfiles();
    const profile = profiles.find((p: any) => p.id === foundUser.id);
    useAuthStore.getState().setSession(foundUser, profile || null);
    await initializeE2EKeys(foundUser.id, 'web-device-1');
    return { user: foundUser, profile: profile! };
  }
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: 'sms',
  });
  if (error) throw error;
  if (!data.user) throw new Error('OTP verification failed');

  const profile = await fetchProfile(data.user.id);
  if (!profile) throw new Error('Profile not found');

  useAuthStore.getState().setSession(data.user, profile);
  await initializeE2EKeys(data.user.id, 'web-device-1');
  return { user: data.user, profile };
}

export function setupAuthListener() {
  if (isMockMode()) {
    return () => {};
  }
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    const store = useAuthStore.getState();
    if (session?.user) {
      let profile: UserProfile | null = null;
      try {
        profile = await fetchProfile(session.user.id);
      } catch (err) {
        console.warn('Failed to fetch profile on auth change:', err);
      }
      const existingEmailProfile = session.user.email
        ? await fetchProfileByEmail(session.user.email)
        : null;
      if (existingEmailProfile && existingEmailProfile.id !== session.user.id) {
        await supabase.auth.signOut();
        store.setSession(null, null);
        throw new Error('This Google email is already linked to an existing JamSh account. Log in to that account first to link Google securely.');
      }

      const finalProfile: UserProfile = profile || ({
        id: session.user.id,
        email: session.user.email || null,
        username: (session.user.user_metadata?.username || session.user.email?.split('@')[0] || `user_${session.user.id.slice(0, 6)}`) as string,
        display_name: (session.user.user_metadata?.full_name || session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'JamSh User') as string,
        avatar_url: (session.user.user_metadata?.avatar_url || '') as string,
        cover_url: '',
        bio: '',
        website: '',
        followers_count: 0,
        following_count: 0,
        is_private: false,
        is_verified: false,
        birthday: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);

      store.setSession(session.user, finalProfile);
      store.setAuthSetupRequired(
        session.user.app_metadata?.provider === 'google' &&
        session.user.user_metadata?.google_profile_completed !== true
      );
      try {
        await initializeE2EKeys(session.user.id, 'web-device-1');
      } catch (e) {
        console.warn('Failed to initialize E2E keys on auth change:', e);
      }
      try {
        await syncGroupKeys();
      } catch (e) {
        console.warn('Failed to sync group keys on auth change:', e);
      }
    } else {
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

export async function fetchFeed(page = 0, limit = 10): Promise<Post[]> {
  const store = useAuthStore.getState();
  const currentUser = store.user;

  if (!isMockMode()) {
    try {
      const { data, error: functionError } = await supabase.functions.invoke('feed-posts', {
        body: { action: 'fetch-feed', page, limit },
      });
      if (!functionError && data && Array.isArray(data.posts)) {
        return data.posts as Post[];
      }
    } catch (e) {
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
        const authorizedData = await signPostMediaUrls(data as Post[]);
        if (currentUser) {
          const postIds = authorizedData.map(p => p.id);
          const { data: reactions } = await supabase
            .from('thunder_reactions')
            .select('post_id')
            .eq('user_id', currentUser.id)
            .in('post_id', postIds);

          const reactedIds = new Set(reactions?.map(r => r.post_id) || []);
          return authorizedData.map((post: any) => ({
            ...post,
            thundered_by_me: reactedIds.has(post.id),
          })) as Post[];
        }
        return authorizedData;
      }
    } catch (e) {}
  }

  // Fallback LocalMockDB
  const posts = mockDb.getPosts();
  const profiles = mockDb.getProfiles();
  const reactions = mockDb.getReactions();
  const followers = mockDb.getFollowers();

  // If follow relationships exist, filter feed.
  // Alice followed by Bob => Bob sees Alice's posts.
  // If Bob doesn't follow anyone, show all posts.
  let followedIds: string[] = [];
  if (currentUser) {
    followedIds = followers
      .filter((f: any) => f.follower_id === currentUser.id && f.status === 'accepted')
      .map((f: any) => f.following_id);
  }

  let filteredPosts = posts.filter((post: any) => {
    if (post.status && post.status !== 'published') return false;
    if (!currentUser) return post.visibility !== 'private';
    if (post.user_id === currentUser.id) return true;
    if (post.visibility === 'private') return followedIds.includes(post.user_id);
    return followedIds.length === 0 || followedIds.includes(post.user_id) || post.visibility !== 'private';
  });

  const sorted = [...filteredPosts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const chunk = sorted.slice(page * limit, (page + 1) * limit);

  return chunk.map(post => {
    const author = profiles.find(p => p.id === post.user_id);
    const thunderedByMe = currentUser ? reactions.some((r: any) => r.user_id === currentUser.id && r.post_id === post.id && !r.comment_id) : false;
    return {
      ...post,
      user: author || { id: post.user_id, username: 'user', display_name: 'User', avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150' },
      thundered_by_me: thunderedByMe,
    } as any;
  });
}

async function signPostMediaUrls(posts: Post[]): Promise<Post[]> {
  return Promise.all(posts.map(async (post) => {
    const media = await Promise.all((post.media || []).map(async (item) => {
      const rawPath = item.media_url;
      const publicMarker = '/storage/v1/object/public/';
      const publicIndex = rawPath.indexOf(publicMarker);
      let bucket = 'posts';
      let path = rawPath;

      if (publicIndex >= 0) {
        const objectPath = rawPath.slice(publicIndex + publicMarker.length);
        const separator = objectPath.indexOf('/');
        if (separator > 0) {
          bucket = objectPath.slice(0, separator);
          path = objectPath.slice(separator + 1);
        }
      } else {
        const separator = rawPath.indexOf('/');
        if (separator > 0) {
          bucket = rawPath.slice(0, separator);
          path = rawPath.slice(separator + 1);
        }
      }

      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
      if (error || !data?.signedUrl) {
        throw error || new Error('Unable to authorize post media');
      }
      return { ...item, media_url: data.signedUrl };
    }));
    return { ...post, media };
  }));
}

export async function uploadPostImage(file: Blob, fileName: string): Promise<string> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');
  if (file.size === 0) throw new Error('The selected image is empty');
  if (file.size > 25 * 1024 * 1024) throw new Error('Images must be 25 MB or smaller');

  const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
  const allowedExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic']);
  if (!allowedExtensions.has(extension)) throw new Error('Unsupported image format');

  const storagePath = `${user.id}/${uuidv4()}.${extension}`;
  const { error } = await supabase.storage.from('posts').upload(storagePath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || `image/${extension === 'jpg' ? 'jpeg' : extension}`,
  });
  if (error) throw error;
  return `posts/${storagePath}`;
}

export async function removePostMedia(storageReference: string): Promise<void> {
  const separator = storageReference.indexOf('/');
  if (separator <= 0) throw new Error('Invalid post media storage reference');
  const bucket = storageReference.slice(0, separator);
  const path = storageReference.slice(separator + 1);
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

export async function createPost(content: string, type: 'text' | 'image' | 'video' | 'multiple', mediaUrls: string[]): Promise<Post> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');

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
          const { error: mediaError } = await supabase.from('post_media').insert(mediaInserts);
          if (mediaError) {
            await supabase.from('posts').delete().eq('id', post.id).eq('user_id', user.id);
            throw mediaError;
          }
        }

        const { data: fullPost } = await supabase
          .from('posts')
          .select('*, user:profiles(*), media:post_media(*)')
          .eq('id', post.id)
          .single();

        return (await signPostMediaUrls([(fullPost || post) as Post]))[0];
      }
    } catch (e) {
      throw e;
    }
  }

  const posts = mockDb.getPosts();
  const newPost: any = {
    id: `post_${Date.now()}`,
    user_id: user.id,
    content,
    type,
    hashtags,
    mentions,
    media: mediaUrls.map((url, index) => ({ media_url: url, position: index })) as any,
    thunders_count: 0,
    comments_count: 0,
    created_at: new Date().toISOString(),
    comments: [],
  };

  mockDb.setPosts([newPost, ...posts]);
  return newPost as Post;
}

export async function toggleThunderReaction(postId: string, commentId?: string): Promise<{ thundered: boolean; countChange: number }> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');

  if (!isMockMode()) {
    try {
      const { data, error: functionError } = await supabase.functions.invoke('handle-reaction', {
        body: { postId, commentId },
      });
      if (!functionError && data && data.thundered !== undefined) {
        return data;
      }
    } catch (e) {
      console.warn('[SDK Reaction] Edge Function invoke failed, falling back to direct table query', e);
    }

    try {
      const query = supabase.from('thunder_reactions').select('id').eq('user_id', user.id);
      if (commentId) query.eq('comment_id', commentId);
      else query.eq('post_id', postId).is('comment_id', null);
      
      const { data: existing } = await query;
      if (existing && existing.length > 0) {
        await supabase.from('thunder_reactions').delete().eq('id', existing[0].id);
        return { thundered: false, countChange: -1 };
      } else {
        await supabase.from('thunder_reactions').insert({
          user_id: user.id,
          post_id: postId,
          comment_id: commentId || null,
        });
        return { thundered: true, countChange: 1 };
      }
    } catch (e) {}
  }

  // Fallback
  const reactions = mockDb.getReactions();
  const posts = mockDb.getPosts();

  const matchIndex = reactions.findIndex((r: any) => 
    r.user_id === user.id && 
    r.post_id === postId && 
    (commentId ? r.comment_id === commentId : !r.comment_id)
  );

  let thundered = false;
  let countChange = 0;

  if (matchIndex >= 0) {
    reactions.splice(matchIndex, 1);
    thundered = false;
    countChange = -1;
  } else {
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
      ? mockDb.getComments().find((c: any) => c.id === commentId)?.userId 
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

export async function checkIfFollowing(followerId: string, followingId: string): Promise<boolean> {
  if (isMockMode()) {
    const followers = mockDb.getFollowers();
    return followers.some((f: any) => f.follower_id === followerId && f.following_id === followingId && f.status === 'accepted');
  }
  try {
    const { data, error } = await supabase
      .from('followers')
      .select('id')
      .eq('follower_id', followerId)
      .eq('following_id', followingId)
      .eq('status', 'accepted')
      .maybeSingle();
    if (error || !data) return false;
    return true;
  } catch (e) {
    console.error('Error checking if following:', e);
    return false;
  }
}

export async function followUser(followingId: string): Promise<string> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');

  if (!isMockMode()) {
    try {
      const { data, error: functionError } = await supabase.functions.invoke('handle-follow', {
        body: { targetUserId: followingId },
      });
      if (!functionError && data && data.status) {
        return data.status;
      }
    } catch (e) {
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

      if (fetchError) throw fetchError;

      if (existing) {
        // Unfollow: delete the relation
        const { error: deleteError } = await supabase
          .from('followers')
          .delete()
          .eq('id', existing.id);
        if (deleteError) throw deleteError;
        return 'unfollowed';
      } else {
        // Follow: fetch target profile to see if it's private
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('is_private')
          .eq('id', followingId)
          .single();
        if (profileError) throw profileError;

        const status = profile?.is_private ? 'pending' : 'accepted';
        const { error: insertError } = await supabase
          .from('followers')
          .insert({ follower_id: user.id, following_id: followingId, status });
        if (insertError) throw insertError;
        return status;
      }
    } catch (e) {
      console.error('Error in followUser live mode:', e);
      throw e;
    }
  }

  const followers = mockDb.getFollowers();
  const profiles = mockDb.getProfiles();
  const target = profiles.find(p => p.id === followingId);
  const status = target?.is_private ? 'pending' : 'accepted';

  const matchIdx = followers.findIndex((f: any) => f.follower_id === user.id && f.following_id === followingId);

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
  } else {
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

export async function fetchFollowers(userId: string): Promise<UserProfile[]> {
  if (isMockMode()) {
    const followers = mockDb.getFollowers();
    const profiles = mockDb.getProfiles();
    const followerIds = followers
      .filter((f: any) => f.following_id === userId && f.status === 'accepted')
      .map((f: any) => f.follower_id);
    return profiles.filter(p => followerIds.includes(p.id));
  }
  try {
    const { data, error } = await supabase
      .from('followers')
      .select('follower_id')
      .eq('following_id', userId)
      .eq('status', 'accepted');
    if (error) throw error;
    const ids = (data || []).map((r: any) => r.follower_id);
    if (ids.length === 0) return [];
    
    const { data: profiles, error: pError } = await supabase
      .from('profiles')
      .select('*')
      .in('id', ids);
    if (pError) throw pError;
    return profiles as UserProfile[];
  } catch (e) {
    console.error('Error in fetchFollowers:', e);
    return [];
  }
}

export async function fetchFollowing(userId: string): Promise<UserProfile[]> {
  if (isMockMode()) {
    const followers = mockDb.getFollowers();
    const profiles = mockDb.getProfiles();
    const followingIds = followers
      .filter((f: any) => f.follower_id === userId && f.status === 'accepted')
      .map((f: any) => f.following_id);
    return profiles.filter(p => followingIds.includes(p.id));
  }
  try {
    const { data, error } = await supabase
      .from('followers')
      .select('following_id')
      .eq('follower_id', userId)
      .eq('status', 'accepted');
    if (error) throw error;
    const ids = (data || []).map((r: any) => r.following_id);
    if (ids.length === 0) return [];
    
    const { data: profiles, error: pError } = await supabase
      .from('profiles')
      .select('*')
      .in('id', ids);
    if (pError) throw pError;
    return profiles as UserProfile[];
  } catch (e) {
    console.error('Error in fetchFollowing:', e);
    return [];
  }
}

export async function fetchPendingFollowRequests(): Promise<Array<{ id: string; follower_id: string; following_id: string; status: string; created_at: string; follower?: UserProfile }>> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');
  if (isMockMode()) {
    return mockDb.getFollowers().filter((row: any) => row.following_id === user.id && row.status === 'pending');
  }

  const { data, error } = await supabase
    .from('followers')
    .select('id, follower_id, following_id, status, created_at, follower:profiles!followers_follower_id_fkey(*)')
    .eq('following_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as any;
}

export async function respondToFollowRequest(requestId: string, decision: 'accepted' | 'rejected'): Promise<void> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');
  if (!requestId) throw new Error('Missing follow request');

  if (isMockMode()) {
    const followers = mockDb.getFollowers();
    const request = followers.find((row: any) => row.id === requestId && row.following_id === user.id && row.status === 'pending');
    if (!request) throw new Error('Follow request not found');
    if (decision === 'rejected') {
      mockDb.setFollowers(followers.filter((row: any) => row.id !== requestId));
    } else {
      request.status = 'accepted';
      mockDb.setFollowers([...followers]);
    }
    return;
  }

  const { error } = decision === 'rejected'
    ? await supabase.from('followers').delete()
      .eq('id', requestId)
      .eq('following_id', user.id)
      .eq('status', 'pending')
    : await supabase.from('followers').update({ status: 'accepted' })
      .eq('id', requestId)
      .eq('following_id', user.id)
      .eq('status', 'pending');
  if (error) throw error;
}

export async function cancelFollowRequest(followingId: string): Promise<void> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');
  const { error } = await supabase
    .from('followers')
    .delete()
    .eq('follower_id', user.id)
    .eq('following_id', followingId)
    .eq('status', 'pending');
  if (error) throw error;
}


// ----------------------------------------------------
// PUBLIC KEY CACHE & OFFLINE QUEUE UTILITIES
// ----------------------------------------------------

export function cacheProfile(profile: UserProfile) {
  if (typeof window === 'undefined') return;
  const cacheKey = 'jamsh_profile_metadata_cache';
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || '[]');
    const filtered = cached.filter((p: any) => p.id !== profile.id);
    filtered.push(profile);
    localStorage.setItem(cacheKey, JSON.stringify(filtered));
    console.log(`[Cache] Cached profile metadata for: ${profile.display_name}`);
  } catch (e) {
    console.error('[Cache] Failed to cache profile metadata', e);
  }
}

export function getCachedProfiles(): UserProfile[] {
  if (typeof window === 'undefined') return [];
  const cacheKey = 'jamsh_profile_metadata_cache';
  try {
    return JSON.parse(localStorage.getItem(cacheKey) || '[]');
  } catch (e) {
    return [];
  }
}

export function cachePublicKey(myUserId: string, peerId: string, publicKey: string) {
  if (typeof window === 'undefined') return;
  const cacheKey = `jamsh_public_key_cache_${myUserId}`;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || '{}');
    cached[peerId] = publicKey;
    localStorage.setItem(cacheKey, JSON.stringify(cached));
    console.log(`[Cache] Cached public key for peer: ${peerId}`);
  } catch (e) {
    console.error('[Nearby] Failed to write public key to cache', e);
  }
}

export function getCachedPublicKey(myUserId: string, peerId: string): string | null {
  if (typeof window === 'undefined') return null;
  const cacheKey = `jamsh_public_key_cache_${myUserId}`;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || '{}');
    return cached[peerId] || null;
  } catch (e) {
    return null;
  }
}

export async function addMessageToQueue(messageId: string, roomId: string, recipientId: string, envelope: any) {
  if (Capacitor.isNativePlatform()) {
    try {
      await JamshNearby.addMessageToQueue({ messageId, roomId, recipientId, envelope });
      return;
    } catch (e) {
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

export async function getPendingMessages(): Promise<any[]> {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await JamshNearby.getPendingMessages();
      if (res && res.messages) {
        return res.messages.map((m: any) => ({
          messageId: m.messageId,
          roomId: m.roomId,
          recipientId: m.recipientId,
          envelope: JSON.parse(m.envelopeJson),
        }));
      }
    } catch (e) {
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

export async function removeMessageFromQueue(messageId: string) {
  if (Capacitor.isNativePlatform()) {
    try {
      await JamshNearby.removeMessageFromQueue({ messageId });
      return;
    } catch (e) {
      console.error('[Queue] Native SQLite remove failed, falling back to localStorage', e);
    }
  }
  // Web Fallback
  if (typeof window !== 'undefined') {
    const queueKey = 'jamsh_offline_queue';
    let queue = JSON.parse(localStorage.getItem(queueKey) || '[]');
    queue = queue.filter((m: any) => m.messageId !== messageId);
    localStorage.setItem(queueKey, JSON.stringify(queue));
  }
}

// ----------------------------------------------------
// PEER DISCOVERY & TRANSPORT ADVERTISING (HMAC SIGNED)
// ----------------------------------------------------

let isAdvertisingActive = false;
let isScanningActive = false;

let advertisingInterval: any = null;
let currentAdvertisingBatchIndex = 0;

export async function startNearbyAdvertising(myUserId: string, username: string) {
  if (!Capacitor.isNativePlatform()) return;
  
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
      if (!myKeys) return;
      
      const tokens: string[] = [];
      const epoch = Math.floor(Date.now() / (15 * 60 * 1000));
      
      for (const [peerId, peerPublicKey] of Object.entries(cachedPeerPublicKeys)) {
        const shared = deriveSharedSecret(myKeys.privateKey, peerPublicKey as string);
        const tokenFull = await hmacSHA256(shared, `discovery|${epoch}`);
        tokens.push(tokenFull.substring(0, 16));
      }
      
      if (tokens.length === 0) {
        const myFp = await computeFingerprint(myKeys.publicKey);
        await JamshNearby.startAdvertising({ discoveryId: myFp.substring(0, 8) });
        return;
      }
      
      // Rotate single 8-char token to strictly fit within 31-byte legacy BLE ADV packet
      const currentToken = tokens[currentAdvertisingBatchIndex % tokens.length].substring(0, 8);
      await JamshNearby.startAdvertising({ discoveryId: currentToken });
      isAdvertisingActive = true;
      currentAdvertisingBatchIndex = (currentAdvertisingBatchIndex + 1) % tokens.length;
    } catch (e) {
      console.error('[Nearby] Failed in advertising step', e);
    }
  };
  
  await advertiseStep();
  advertisingInterval = setInterval(advertiseStep, 10000);
  console.log("[Nearby] Discovery started");
}

export async function stopNearbyAdvertising() {
  if (!Capacitor.isNativePlatform()) return;
  if (advertisingInterval) {
    clearInterval(advertisingInterval);
    advertisingInterval = null;
  }
  try {
    await JamshNearby.stopAdvertising();
    isAdvertisingActive = false;
  } catch (e) {
    console.error('[Nearby] Failed to stop advertising', e);
  }
}

export async function startNearbyScanning(myUserId: string) {
  if (!Capacitor.isNativePlatform()) return;
  if (isScanningActive) return;
  
  const granted = await requestNearbyPermissions();
  if (!granted) {
    console.warn('[Nearby] Cannot start scanning: Permissions not granted.');
    return;
  }
  
  try {
    await JamshNearby.startScanning();
    isScanningActive = true;
    
    JamshNearby.removeAllListeners('peerDiscovered');
    await JamshNearby.addListener('peerDiscovered', async (data: any) => {
      const peer = data.peer;
      if (!peer || !peer.discoveryId) return;
      
      const cachedPeerPublicKeysStr = localStorage.getItem(`jamsh_public_key_cache_${myUserId}`) || '{}';
      const cachedPeerPublicKeys = JSON.parse(cachedPeerPublicKeysStr);
      const myKeys = useAuthStore.getState().deviceKeyPair;
      if (!myKeys) return;
      
      const epoch = Math.floor(Date.now() / (15 * 60 * 1000));
      const peerTokens = peer.discoveryId.split(',');
      
      for (const [peerId, peerPublicKey] of Object.entries(cachedPeerPublicKeys)) {
        const shared = deriveSharedSecret(myKeys.privateKey, peerPublicKey as string);
        const expectedTokenFull = await hmacSHA256(shared, `discovery|${epoch}`);
        const expectedTokenTruncated = expectedTokenFull.substring(0, 16);
        
        const expectedToken8 = expectedTokenFull.substring(0, 8);
        if (peer.discoveryId.startsWith(expectedToken8) || peerTokens.includes(expectedTokenTruncated) || peerTokens.includes(expectedToken8)) {
          nearbyPeers.set(peerId, { ip: peer.ip, lastSeen: Date.now(), isOnline: !!peer.isOnline });
          console.log("[Nearby] Authenticated peer established via BLE beacon:", peerId);
          
          const evt = new CustomEvent('nearbyPeerUpdate', { detail: { peerId, ip: peer.ip, active: true, isOnline: !!peer.isOnline } });
          window.dispatchEvent(evt);

          // Trigger automatic forwarding of any pending mesh relay packets to this peer!
          try {
            if (Capacitor.isNativePlatform()) {
              await JamshNearby.forwardPendingRelays();
            }
          } catch (e) {}
          break;
        }
      }
    });
  } catch (e) {
    console.error('[Nearby] Failed to start scanning', e);
  }
}

export async function stopNearbyScanning() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await JamshNearby.stopScanning();
    isScanningActive = false;
  } catch (e) {
    console.error('[Nearby] Failed to stop scanning', e);
  }
}

export async function checkIsOnline(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await JamshNearby.getConnectivityStatus();
      return !!status.connected;
    } catch (e) {
      return typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
    }
  }
  return typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
}

let isSyncingQueue = false;

export async function syncOfflineQueue(myUserId: string) {
  if (isSyncingQueue) return;
  isSyncingQueue = true;
  
  try {
    // Playback pending thunders/comments/saves offline action queue
    try {
      await syncOfflineEngagementQueue();
    } catch (e) {
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
        } else {
          console.error(`[Sync] Failed to upload message ${item.messageId}:`, error);
        }
      } catch (e) {
        console.error(`[Sync] Error syncing item ${item.messageId}`, e);
      }
    }
  } catch (err) {
    console.error('[Sync] Queue synchronization error', err);
  } finally {
    isSyncingQueue = false;
  }
}

export async function initializeNearbyListeners(myUserId: string) {
  if (!Capacitor.isNativePlatform()) return;
  
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
    await JamshNearby.addListener('messageReceived', async (data: any) => {
      const envelope = data.envelope;
      const connectionId = data.connectionId;
      if (
        !envelope ||
        typeof envelope.id !== 'string' ||
        typeof envelope.room_id !== 'string' ||
        typeof envelope.sender_id !== 'string' ||
        typeof envelope.recipient_id !== 'string' ||
        typeof envelope.content !== 'string' ||
        typeof envelope.nonce !== 'string' ||
        !connectionId
      ) return;
      const expiresAt = Date.parse(envelope.expires_at || '');
      if (
        !Number.isFinite(expiresAt) ||
        expiresAt <= Date.now() ||
        !Number.isInteger(envelope.hop_count) ||
        envelope.hop_count < 0 ||
        envelope.hop_count > 8
      ) return;
      
      console.log("[Nearby] Encrypted message received");
      
      const messages = mockDb.getMessages();
      const alreadyExists = messages.some(m => m.id === envelope.id);
      
      let decryptedText = '';
      let isValid = true;
      let senderPubKey: string | null = null;
      const store = useAuthStore.getState();
      const isGroup = !!envelope.is_group;
      
      if (isGroup) {
        const groupKeyHex = store.groupKeys[envelope.room_id];
        if (groupKeyHex) {
          try {
            const cryptoKey = await importRawAESKey(groupKeyHex);
            decryptedText = await decryptWithKey(envelope.content, envelope.nonce, cryptoKey);
          } catch (err) {
            console.error('[Nearby Group] Decryption failed', err);
            isValid = false;
          }
        } else {
          console.warn('[Nearby Group] Group key missing locally. Rejecting packet.');
          isValid = false;
        }
      } else {
        if (envelope.recipient_id !== myUserId) {
          console.warn('[Nearby] Recipient context mismatch. Intended recipient:', envelope.recipient_id, 'Self:', myUserId);
          isValid = false;
        }
        
        const authenticatedPeerKey = getCachedPublicKey(myUserId, envelope.sender_id);
        if (!authenticatedPeerKey) {
          console.warn('[Nearby] Cannot bind sender identity offline: No cached peer key found for sender', envelope.sender_id);
          isValid = false;
        } else if (envelope.sender_public_key && envelope.sender_public_key !== authenticatedPeerKey) {
          console.warn('[Nearby] Claimed public key does not match authenticated peer key');
          isValid = false;
        }
        
        senderPubKey = authenticatedPeerKey;
        if (!senderPubKey) {
          if (isMockMode()) {
            const users = mockDb.getUsers();
            const senderUser = users.find((u: any) => u.id === envelope.sender_id);
            if (senderUser) {
              senderPubKey = senderUser.devicePublicKey;
            }
          }
        }
        
        if (isValid && senderPubKey) {
          try {
            const myKeys = store.deviceKeyPair;
            if (myKeys && envelope.is_encrypted && envelope.nonce) {
              decryptedText = await decryptPairwise(envelope.content, envelope.nonce, myKeys.privateKey, senderPubKey);
            } else {
              isValid = false;
            }
          } catch (err) {
            console.error('[Nearby] E2EE decryption failed', err);
            isValid = false;
          }
        } else {
          isValid = false;
        }
      }
      
      if (isValid && !alreadyExists) {
        const newMsg: Message = {
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
        } as any;
        
        mockDb.setMessages([...messages, newMsg]);
        
        if (envelope.sender_public_key) {
          cachePublicKey(myUserId, envelope.sender_id, envelope.sender_public_key);
        }
        
        const event = new CustomEvent('nearbyMessageReceived', { detail: { ...newMsg, decrypted: decryptedText } });
        window.dispatchEvent(event);

        // Dispatch cryptographically signed Delivery ACK to sender
        if (isValid && senderPubKey && store.deviceKeyPair) {
          try {
            const shared = deriveSharedSecret(store.deviceKeyPair.privateKey, senderPubKey);
            const ackSig = await generateAckSignature(shared, envelope.id);
            await JamshNearby.respondToEnvelope({
              connectionId,
              ack: {
                protocol_version: '1.0',
                message_id: envelope.id,
                ack_status: 'SUCCESS',
                signature: ackSig,
                authenticated: true
              }
            });
            console.log('[Nearby] Authenticated delivery ACK generated and cached for connection:', connectionId);
          } catch (ackErr) {
            console.error('[Nearby] Failed to generate authenticated ACK', ackErr);
          }
        }
      }
    });

    // 3. Setup incoming BLE Relay upload listener
    JamshNearby.removeAllListeners('relayUploadTrigger');
    await JamshNearby.addListener('relayUploadTrigger', async (data: any) => {
      const envelope = data.envelope;
      if (!envelope || !envelope.id) return;
      
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
      } catch (e) {
        console.error('[Nearby] Immediate relay upload failed', e);
      }
    });
    
    // 4. Setup connectivity state listener
    JamshNearby.removeAllListeners('connectivityChanged');
    await JamshNearby.addListener('connectivityChanged', async (status: any) => {
      console.log('[Nearby] Connectivity changed. Status:', status);
      const event = new CustomEvent('connectivityUpdate', { detail: status });
      window.dispatchEvent(event);
      
      if (status.connected) {
        console.log('[Nearby] Restored online connectivity. Syncing queue...');
        await syncOfflineQueue(myUserId);
      }
    });
    
  } catch (e) {
    console.error("Failed to initialize listeners: ", e);
  }
}


// ----------------------------------------------------
// ENCRYPTED MESSAGING API
// ----------------------------------------------------

export async function fetchChatRooms(subTab: 'messages' | 'requests' = 'messages'): Promise<any[]> {
  const user = useAuthStore.getState().user;
  if (!user) return [];

  if (!isMockMode()) {
    try {
      let myRoomIds: Set<string> | null = null;
      try {
        const { data: myMemData } = await supabase.from('chat_members').select('room_id').eq('user_id', user.id);
        if (myMemData && myMemData.length > 0) {
          myRoomIds = new Set(myMemData.map((m: any) => m.room_id));
        }
      } catch (e) {}

      const { data, error } = await supabase
        .from('chat_rooms')
        .select('*, members:chat_members(*)')
        .order('last_message_at', { ascending: false });

      if (!error && data) {
        const rooms = data.map((r: any) => {
          const myMember = r.members?.find((m: any) => m.user_id === user.id);
          return {
            ...r,
            unread_count: myMember?.unread_count || 0
          };
        });

        // Filter by user membership and tab status ('accepted' for main inbox, 'pending' for message requests)
        const filtered = rooms.filter((r: any) => {
          const isMember = myRoomIds ? myRoomIds.has(r.id) : (r.members?.some((m: any) => m.user_id === user.id) ?? true);
          if (!isMember) return false;
          const isSender = r.last_message_sender_id === user.id;
          const roomStatus = r.status || 'accepted';
          if (subTab === 'requests') {
            return !isSender && roomStatus === 'pending';
          }
          return roomStatus === 'accepted' || isSender || !r.last_message_sender_id;
        });

        const mapped = await Promise.all(filtered.map(async (r: any) => {
          let preview = r.last_message_preview;
          if (!preview || preview.endsWith('==') || (preview.length > 50 && !preview.includes(' '))) {
            preview = r.type === 'group' ? 'Group chat active' : 'Handshake verified – send a message';
          }

          if (r.type === 'group') {
            return {
              id: r.id,
              name: r.name || 'Group Chat',
              type: 'group' as const,
              status: r.status || 'accepted',
              created_at: r.created_at || new Date().toISOString(),
              last_message_at: r.last_message_at || r.created_at,
              last_message_preview: preview,
              unread_count: r.unread_count || 0,
              description: r.description,
              avatar_url: r.avatar_url,
              primary_admin_id: r.primary_admin_id,
              members: r.members ? r.members.map((m: any) => m.user_id) : []
            };
          }
          const peerMember = r.members?.find((m: any) => m.user_id !== user.id);
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
            } catch (err) {}
          }
          
          return {
            id: r.id,
            name: peerProfile?.display_name || peerProfile?.username || 'Chat Partner',
            type: (r.type || 'direct') as 'direct' | 'group',
            status: r.status || 'accepted',
            created_at: r.created_at || new Date().toISOString(),
            last_message_at: r.last_message_at || r.created_at,
            last_message_preview: preview,
            unread_count: r.unread_count || 0,
            peer: peerProfile,
          };
        }));

        return MessagingService.sortConversations(mapped as ChatRoom[]);
      }
    } catch (e) {
      console.error('[fetchChatRooms] Error querying rooms:', e);
    }
  }

  // Fallback
  const rooms = mockDb.getChatRooms();
  const profiles = mockDb.getProfiles();

  const myRooms = rooms.filter((r: any) => r.members.includes(user.id));
  const mapped = myRooms.map((r: any) => {
    let preview = r.last_message_preview;
    if (!preview || preview.endsWith('==') || (preview.length > 50 && !preview.includes(' '))) {
      preview = r.type === 'group' ? 'Group chat active' : 'Handshake verified – send a message';
    }

    if (r.type === 'group') {
      return {
        id: r.id,
        name: r.name || 'Group Chat',
        type: 'group' as const,
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
    const peerId = r.members.find((uid: string) => uid !== user.id) || user.id;
    const peerProfile = profiles.find(p => p.id === peerId) || null;
    return {
      id: r.id,
      name: peerProfile?.display_name || peerProfile?.username || 'Chat Partner',
      type: (r.type || 'direct') as 'direct' | 'group',
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

export function generateDeterministicUUID(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const hex32 = (hex + 'a1b2c3d4e5f67890a1b2c3d4e5f67890').slice(0, 32);
  return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-4${hex32.slice(13, 16)}-a${hex32.slice(17, 20)}-${hex32.slice(20, 32)}`;
}

export async function createChatRoom(peerId: string): Promise<ChatRoom> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');
  if (!peerId) throw new Error('Recipient peerId is required');
  if (user.id === peerId) throw new Error('Cannot start a chat with yourself');

  if (!isMockMode()) {
    try {
      // 1. Call our atomic, idempotent database RPC
      const { data: roomData, error: rpcError } = await supabase.rpc('get_or_create_direct_room', {
        p_peer_id: peerId,
      });

      if (!rpcError && roomData) {
        let peerProfile: UserProfile | null = (roomData.peer as UserProfile) || null;
        if (!peerProfile) {
          peerProfile = await fetchProfile(peerId);
        }


        // Cache peer public key for offline and E2EE messaging
        if (peerProfile?.id) {
          try {
            const { data: keyData } = await supabase
              .from('device_keys')
              .select('identity_key')
              .eq('user_id', peerProfile.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (keyData?.identity_key) {
              cachePublicKey(user.id, peerProfile.id, keyData.identity_key);
            }
          } catch (e) {}
        }

        return {
          id: roomData.id,
          name: roomData.name || peerProfile?.display_name || peerProfile?.username || 'Chat Partner',
          type: (roomData.type || 'direct') as 'direct' | 'group',
          status: roomData.status || 'accepted',
          created_at: roomData.created_at || new Date().toISOString(),
          last_message_at: roomData.last_message_at || roomData.created_at,
          last_message_preview: roomData.last_message_preview || null,
          unread_count: 0,
          peer: peerProfile || undefined,
          members: [user.id, peerId],
        } as ChatRoom;
      }
    } catch (e) {
      console.warn('[createChatRoom] RPC error, attempting direct query fallback:', e);
    }

    // 2. Fallback: Query existing direct room through chat_members join
    try {
      const { data: myMemberships } = await supabase
        .from('chat_members')
        .select('room_id')
        .eq('user_id', user.id);

      if (myMemberships && myMemberships.length > 0) {
        const roomIds = myMemberships.map((m: any) => m.room_id);
        const { data: peerMembership } = await supabase
          .from('chat_members')
          .select('room_id')
          .eq('user_id', peerId)
          .in('room_id', roomIds)
          .limit(1)
          .maybeSingle();

        if (peerMembership) {
          const { data: existingRoom } = await supabase
            .from('chat_rooms')
            .select('*')
            .eq('id', peerMembership.room_id)
            .single();

          if (existingRoom && existingRoom.type === 'direct') {
            const peerProfile = await fetchProfile(peerId);
            return {
              ...existingRoom,
              name: peerProfile?.display_name || peerProfile?.username || 'Chat Partner',
              peer: peerProfile || undefined,
              members: [user.id, peerId],
            } as ChatRoom;
          }
        }
      }

      // Create new direct room safely
      const { data: newRoom, error: createErr } = await supabase
        .from('chat_rooms')
        .insert({
          type: 'direct',
          status: 'accepted',
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!createErr && newRoom) {
        await supabase.from('chat_members').insert([
          { room_id: newRoom.id, user_id: user.id, role: 'admin' },
          { room_id: newRoom.id, user_id: peerId, role: 'member' },
        ]);
        const peerProfile = await fetchProfile(peerId);
        return {
          ...newRoom,
          name: peerProfile?.display_name || peerProfile?.username || 'Chat Partner',
          peer: peerProfile || undefined,
          members: [user.id, peerId],
        } as ChatRoom;
      }
    } catch (fallbackErr) {
      console.error('[createChatRoom] Failed to retrieve or create direct chat room:', fallbackErr);
      throw fallbackErr;
    }
  }

  // Fallback for mock mode
  const rooms = mockDb.getChatRooms();
  const preExisting = rooms.find((r: any) => r.members?.includes(user.id) && r.members?.includes(peerId));
  const profiles = mockDb.getProfiles();
  const peerProfile = profiles.find((p: any) => p.id === peerId) || null;

  if (preExisting) {
    return {
      ...preExisting,
      name: peerProfile?.display_name || peerProfile?.username || 'Chat Partner',
      peer: peerProfile,
    } as any;
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
  } as any;
}

export async function fetchMessages(roomId: string, limit = 50, beforeTimestamp?: string): Promise<Message[]> {
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
        return (data as Message[]).reverse();
      }
    } catch (e) {}
  }

  // Fallback
  const messages = mockDb.getMessages();
  let filtered = messages.filter(m => m.room_id === roomId);
  if (beforeTimestamp) {
    filtered = filtered.filter(m => new Date(m.created_at).getTime() < new Date(beforeTimestamp).getTime());
  }
  return filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).slice(-limit);
}

export async function markRoomAsSeen(roomId: string): Promise<void> {
  const user = useAuthStore.getState().user;
  if (!user || isMockMode()) return;
  try {
    await supabase.rpc('mark_messages_as_seen', {
      p_room_id: roomId,
      p_user_id: user.id
    });
  } catch (e) {
    console.error('[Messaging] Error marking messages as seen:', e);
  }
}

export async function acceptMessageRequest(roomId: string): Promise<void> {
  if (!isMockMode()) {
    try {
      await supabase.rpc('accept_message_request', {
        p_room_id: roomId
      });
    } catch (e) {
      console.error('[Messaging] Error accepting request:', e);
    }
  }
}

export async function sendEncryptedMessage(roomId: string, recipientId: string, plaintext: string): Promise<Message> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');

  let myKeys = useAuthStore.getState().deviceKeyPair;
  if (!myKeys) {
    try {
      myKeys = await initializeE2EKeys(user.id, 'web-device-1');
    } catch (e) {
      console.warn('[sendEncryptedMessage] Failed to auto-initialize device keys:', e);
    }
  }
  if (!myKeys) throw new Error('Device encryption keys not loaded. Please log in again.');

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
    } else if (online && !isMockMode()) {
      try {
        const { data: keyData } = await supabase
          .from('device_keys')
          .select('identity_key')
          .eq('user_id', recipientId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (keyData?.identity_key) {
          recipientPublicKey = keyData.identity_key;
          cachePublicKey(user.id, recipientId, recipientPublicKey);
        }
      } catch (e) {}

      if (!recipientPublicKey) {
        try {
          const { data: profData } = await supabase
            .from('profiles')
            .select('device_public_key')
            .eq('id', recipientId)
            .maybeSingle();
          if (profData?.device_public_key) {
            recipientPublicKey = profData.device_public_key;
            cachePublicKey(user.id, recipientId, recipientPublicKey);
          }
        } catch (e) {}
      }
    }

    if (!recipientPublicKey && isMockMode()) {
      const users = mockDb.getUsers();
      const peer = users.find((u: any) => u.id === recipientId);
      if (peer) {
        recipientPublicKey = peer.devicePublicKey;
        cachePublicKey(user.id, recipientId, recipientPublicKey);
      }
    }

    if (!recipientPublicKey) {
      throw new Error("Recipient has not published an encryption key yet. They must log in to establish secure messaging.");
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
  } else {
    const enc = await encryptPairwise(plaintext, myKeys.privateKey, recipientPublicKey);
    ciphertext = enc.ciphertext;
    nonce = enc.nonce;
  }


  // 1. Get GPS coordinates locally for Geofence Relay metadata
  let originLat = 0.0;
  let originLng = 0.0;
  if (Capacitor.isNativePlatform()) {
    try {
      const location = await JamshNearby.getCurrentLocation();
      originLat = location.latitude || 0.0;
      originLng = location.longitude || 0.0;
    } catch (e) {
      console.warn('[Location] Failed to fetch native location', e);
    }
  } else if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const pos = await new Promise<any>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
      });
      originLat = pos.coords.latitude;
      originLng = pos.coords.longitude;
    } catch (e) {}
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
    relay_radius: 5000,
    hop_count: 0,
    max_hops: 8,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    expires_at_epoch_ms: Date.now() + 24 * 60 * 60 * 1000
  };

  // 3. Transport Decision Layer
  if (isMockMode()) {
    const messages = mockDb.getMessages();
    const newMsg: Message = {
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
    const updatedRooms = rooms.map((r: any) => {
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
        } catch (updateErr) {
          console.warn('[Transport] Failed to update chat_rooms last message info:', updateErr);
        }

        return { ...msg, decrypted: plaintext, local_status: 'synced' } as any;
      }
    } catch (e) {
      console.warn('[Transport] Supabase upload failed, falling back to BLE', e);
    }
  }


  // Try Mode 2: Direct Bluetooth LE GATT write
  const peerInfo = isGroup ? null : nearbyPeers.get(recipientId);
  let transportMode: 'online' | 'ble_direct' | 'ble_mesh' | 'queued' = 'queued';
  if (peerInfo && (Date.now() - peerInfo.lastSeen < 60000)) {
    try {
      const res = await JamshNearby.sendEnvelope({ ip: peerInfo.ip, envelope });
      if (res && res.ack && res.ack.ack_status === 'SUCCESS') {
        let ackVerified = true;
        if (res.ack.authenticated && res.ack.signature && recipientPublicKey && myKeys) {
          const shared = deriveSharedSecret(myKeys.privateKey, recipientPublicKey);
          ackVerified = await verifyAckSignature(shared, messageId, res.ack.signature);
        }
        finalStatus = ackVerified ? 'delivered_nearby' : 'sent_nearby';
        transportMode = 'ble_direct';
        console.log("[Nearby] Encrypted direct BLE message delivery confirmed. ACK authenticated:", ackVerified);
      }
    } catch (nearbyErr) {
      console.error('[Transport] Direct BLE GATT delivery failed', nearbyErr);
    }
  }

  // Try Mode 3: Bluetooth Mesh Relay routing
  if (finalStatus !== 'delivered_nearby' && finalStatus !== 'sent_nearby') {
    const peers = Array.from(nearbyPeers.values());
    const onlineRelay = peers.find(p => p.isOnline && (Date.now() - p.lastSeen < 60000));
    const targetRelay = onlineRelay || peers.find(p => Date.now() - p.lastSeen < 60000);
    
    if (targetRelay) {
      try {
        console.log(`[Relay] Relay forwarding packet ${messageId} via node: ${targetRelay.ip}`);
        const res = await JamshNearby.sendEnvelope({ ip: targetRelay.ip, envelope });
        if (res && res.ack && res.ack.ack_status === 'SUCCESS') {
          finalStatus = 'relayed_nearby';
          transportMode = 'ble_mesh';
          console.log("[Relay] Encrypted packet accepted by relay node.");
        }
      } catch (relayErr) {
        console.error('[Relay] Mesh relay routing step failed', relayErr);
      }
    }
  }

  // Local SQLite geofence queue fallback
  await addMessageToQueue(messageId, roomId, isGroup ? 'group' : recipientId, envelope);

  const localMsg: Message = {
    id: messageId,
    room_id: roomId,
    sender_id: user.id,
    content: ciphertext,
    nonce: nonce,
    is_encrypted: true,
    type: 'text',
    created_at: envelope.created_at,
    local_status: finalStatus as any,
    transport: transportMode,
  } as any;

  const localMessages = mockDb.getMessages();
  mockDb.setMessages([...localMessages, localMsg]);

  return localMsg;
}

export async function decryptReceivedMessage(message: Message, senderId: string): Promise<string> {
  if (message.decrypted) return message.decrypted;

  const store = useAuthStore.getState();
  let myKeys = store.deviceKeyPair;

  if (!myKeys && store.user?.id) {
    try {
      myKeys = await initializeE2EKeys(store.user.id, 'web-device-1');
    } catch (e) {}
  }
  if (!message.is_encrypted || !message.nonce) return message.content;
  if (!myKeys) {
    return !message.content.endsWith('==') ? message.content : '⚡ [Encrypted Message]';
  }

  // Is this a Group Chat message?
  const groupKeyHex = store.groupKeys[message.room_id];
  if (groupKeyHex) {
    try {
      const cryptoKey = await importRawAESKey(groupKeyHex);
      const dec = await decryptWithKey(message.content, message.nonce, cryptoKey);
      return dec;
    } catch (e) {
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
          const peer = members.find((m: any) => m.user_id !== myUserId);
          if (peer) peerId = peer.user_id;
        }
      } catch (e) {}
    } else {
      const rooms = mockDb.getChatRooms();
      const room = rooms.find((r: any) => r.id === message.room_id);
      if (room) {
        peerId = room.members.find((uid: string) => uid !== myUserId) || '';
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
    } catch (e) {}

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
      } catch (e) {}
    }
  }

  // Fallback to cache
  if (!targetPublicKey && myUserId) {
    targetPublicKey = getCachedPublicKey(myUserId, targetUserId) || '';
  }

  // Fallback to mock db
  if (!targetPublicKey) {
    const users = mockDb.getUsers();
    const targetUser = users.find((u: any) => u.id === targetUserId);
    if (targetUser) {
      targetPublicKey = targetUser.devicePublicKey;
      if (myUserId) {
        cachePublicKey(myUserId, targetUserId, targetPublicKey);
      }
    }
  }

  if (!targetPublicKey) {
    return '⚡ [Encrypted Message: key unavailable]';
  }

  try {
    // 2. Decrypt pairwise using my private key and peer's public key
    const decrypted = await decryptPairwise(message.content, message.nonce, myKeys.privateKey, targetPublicKey);
    return decrypted;
  } catch (err) {
    return '⚡ [Decryption failed]';
  }
}



// ----------------------------------------------------
// WEBRTC SIGNALING API
// ----------------------------------------------------

export function setupCallSignalChannel(roomId: string, onSignal: (signal: any) => void) {
  if (isMockMode()) {
    return {
      sendSignal: (signal: any) => {
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
    sendSignal: (signal: any) => {
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

export async function startLiveStream(title: string): Promise<LiveStream> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');

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
    } as any;
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

  if (error) throw error;
  return data as LiveStream;
}

export async function endLiveStream(streamId: string): Promise<void> {
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

export async function createGroupRoom(
  name: string,
  description: string,
  avatarUrl: string,
  memberIds: string[]
): Promise<any> {
  const store = useAuthStore.getState();
  const user = store.user;
  if (!user) throw new Error('Not authenticated');

  const myKeys = store.deviceKeyPair;
  if (!myKeys) throw new Error('Device keys not loaded');

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

      if (roomError || !room) throw roomError || new Error('Failed to create room');

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
        } else {
          const { data: kd } = await supabase
            .from('device_keys')
            .select('identity_key')
            .eq('user_id', targetUid)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (kd) pubKey = kd.identity_key;
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
    } catch (e) {
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

export async function addGroupMembers(roomId: string, memberIds: string[]): Promise<void> {
  const store = useAuthStore.getState();
  const user = store.user;
  if (!user) throw new Error('Not authenticated');

  const myKeys = store.deviceKeyPair;
  if (!myKeys) throw new Error('Device keys not loaded');

  const groupKeyHex = store.groupKeys[roomId];
  if (!groupKeyHex) throw new Error('Group key not found locally');

  if (!isMockMode()) {
    const inserts = memberIds.map(uid => ({ room_id: roomId, user_id: uid, role: 'member' }));
    const { error } = await supabase.from('chat_members').insert(inserts);
    if (error) throw error;

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
  const room = rooms.find((r: any) => r.id === roomId);
  if (room) {
    room.members = [...new Set([...room.members, ...memberIds])];
    memberIds.forEach(uid => {
      room.member_roles[uid] = 'member';
    });
    mockDb.setChatRooms([...rooms]);
  }
}

export async function removeGroupMember(roomId: string, targetUserId: string): Promise<void> {
  const store = useAuthStore.getState();
  const user = store.user;
  if (!user) throw new Error('Not authenticated');

  const myKeys = store.deviceKeyPair;
  if (!myKeys) throw new Error('Device keys not loaded');

  if (!isMockMode()) {
    await supabase.from('chat_members').delete().eq('room_id', roomId).eq('user_id', targetUserId);
    await supabase.from('group_keys').delete().eq('group_id', roomId).eq('user_id', targetUserId);

    const newGroupKeyHex = generateGroupKeyHex();
    
    const { data: members } = await supabase
      .from('chat_members')
      .select('user_id')
      .eq('room_id', roomId);
      
    if (members) {
      const remainingUserIds = members.map((m: any) => m.user_id);
      const keyInserts = [];
      
      for (const targetUid of remainingUserIds) {
        let pubKey = '';
        if (targetUid === user.id) {
          pubKey = myKeys.publicKey;
        } else {
          const { data: kd } = await supabase
            .from('device_keys')
            .select('identity_key')
            .eq('user_id', targetUid)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (kd) pubKey = kd.identity_key;
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
  const room = rooms.find((r: any) => r.id === roomId);
  if (room) {
    room.members = room.members.filter((uid: string) => uid !== targetUserId);
    delete room.member_roles[targetUserId];
    mockDb.setChatRooms([...rooms]);
    
    const rotatedKey = generateGroupKeyHex();
    store.addGroupKey(roomId, rotatedKey);
  }
}

export async function promoteToAdmin(roomId: string, targetUserId: string): Promise<void> {
  if (!isMockMode()) {
    const { error } = await supabase
      .from('chat_members')
      .update({ role: 'admin' })
      .eq('room_id', roomId)
      .eq('user_id', targetUserId);
    if (error) throw error;
    return;
  }
  const rooms = mockDb.getChatRooms();
  const room = rooms.find((r: any) => r.id === roomId);
  if (room) {
    room.member_roles[targetUserId] = 'admin';
    mockDb.setChatRooms([...rooms]);
  }
}

export async function demoteToAdmin(roomId: string, targetUserId: string): Promise<void> {
  if (!isMockMode()) {
    const { error } = await supabase
      .from('chat_members')
      .update({ role: 'member' })
      .eq('room_id', roomId)
      .eq('user_id', targetUserId);
    if (error) throw error;
    return;
  }
  const rooms = mockDb.getChatRooms();
  const room = rooms.find((r: any) => r.id === roomId);
  if (room) {
    room.member_roles[targetUserId] = 'member';
    mockDb.setChatRooms([...rooms]);
  }
}

export async function editGroupInfo(
  roomId: string,
  updates: { name?: string; description?: string; avatarUrl?: string }
): Promise<void> {
  if (!isMockMode()) {
    const { error } = await supabase
      .from('chat_rooms')
      .update({
        name: updates.name,
        description: updates.description,
        avatar_url: updates.avatarUrl
      })
      .eq('id', roomId);
    if (error) throw error;
    return;
  }
  const rooms = mockDb.getChatRooms();
  const room = rooms.find((r: any) => r.id === roomId);
  if (room) {
    if (updates.name !== undefined) room.name = updates.name;
    if (updates.description !== undefined) room.description = updates.description;
    if (updates.avatarUrl !== undefined) room.avatar_url = updates.avatarUrl;
    mockDb.setChatRooms([...rooms]);
  }
}

export async function deleteGroup(roomId: string): Promise<void> {
  if (!isMockMode()) {
    const { error } = await supabase.from('chat_rooms').delete().eq('id', roomId);
    if (error) throw error;
    return;
  }
  const rooms = mockDb.getChatRooms();
  const filtered = rooms.filter((r: any) => r.id !== roomId);
  mockDb.setChatRooms(filtered);
}

export async function leaveGroup(roomId: string): Promise<void> {
  const store = useAuthStore.getState();
  const user = store.user;
  if (!user) throw new Error('Not authenticated');

  if (!isMockMode()) {
    await supabase.from('chat_members').delete().eq('room_id', roomId).eq('user_id', user.id);
    await supabase.from('group_keys').delete().eq('group_id', roomId).eq('user_id', user.id);
    return;
  }
  const rooms = mockDb.getChatRooms();
  const room = rooms.find((r: any) => r.id === roomId);
  if (room) {
    room.members = room.members.filter((uid: string) => uid !== user.id);
    delete room.member_roles[user.id];
    mockDb.setChatRooms([...rooms]);
  }
}

export async function syncGroupKeys(): Promise<void> {
  const store = useAuthStore.getState();
  const user = store.user;
  const myKeys = store.deviceKeyPair;
  if (!user || !myKeys || isMockMode()) return;

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
        const decryptedKey = await decryptPairwise(
          row.encrypted_key,
          row.nonce,
          myKeys.privateKey,
          row.sender_public_key
        );
        store.addGroupKey(row.group_id, decryptedKey);
      } catch (e) {
        console.error('[Groups E2EE] Failed to decrypt group key for room', row.group_id, e);
      }
    }
  } catch (err) {
    console.error('[Groups E2EE] Sync failed', err);
  }
}

// ----------------------------------------------------
// EXPLORE & INSTAGRAM-STYLE SEARCH SDK APIS
// ----------------------------------------------------

export async function fetchExploreFeed(
  category = 'all',
  page = 0,
  limit = 12
): Promise<any[]> {
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
          result = data.filter((p: any) => {
            if (cat === 'reels') return p.type === 'video';
            if (cat === 'photos') return p.type === 'image';
            if (cat === 'videos') return p.type === 'video';
            return p.content?.toLowerCase().includes(cat) || false;
          });
        }
        return result.map((post: any, idx: number) => ({
          ...post,
          aspectRatio: post.type === 'video' ? 0.7 : (idx % 3 === 0 ? 1.3 : 0.9),
          recommendation_score: 95 - idx
        }));
      }
    } catch (e) {
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
      if (cat === 'reels') return p.type === 'video';
      if (cat === 'photos') return p.type === 'image';
      if (cat === 'videos') return p.type === 'video';
      return p.content?.toLowerCase().includes(cat) || false;
    });
  }

  const mapped = filteredPool.map((post: any, idx: number) => {
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

export async function fetchTrendingContent(): Promise<any> {
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
          searches: data.trending.map((s: any) => s.query || s.tag || s.name || s),
          creators: creators || []
        };
      }
    } catch (e) {}

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
          searches: searches?.map((s: any) => s.query) || [],
          creators: creators || []
        };
      }
    } catch (e) {}
  }

  const profiles = mockDb.getProfiles();
  return {
    hashtags: ['#jamsh', '#offline', '#crypto', '#nature', '#explore', '#coding', '#fitness'],
    searches: ['ble mesh', 'offline chat', 'hiking trails', 'healthy food', 'cyberpunk setup'],
    creators: profiles.slice(0, 4)
  };
}

export async function fetchSearchSuggestions(query: string): Promise<any[]> {
  const cleanQuery = (query || '').trim().replace(/^@/, '');
  if (!cleanQuery) return [];

  const online = await checkIsOnline();
  if (online && !isMockMode()) {
    try {
      const users = await searchUsers(cleanQuery, 5);
      if (users && users.length > 0) {
        return users.map(p => ({
          type: 'user',
          text: p.username,
          id: p.id,
          detail: p.display_name,
          avatar_url: p.avatar_url
        }));
      }
    } catch (e) {
      console.warn('[fetchSearchSuggestions] Search error:', e);
    }
  }

  const profiles = isMockMode() ? mockDb.getProfiles() : getCachedProfiles();
  const searchVal = cleanQuery.toLowerCase();
  const matched = profiles.filter((p: any) =>
    (p.username && p.username.toLowerCase().includes(searchVal)) ||
    (p.display_name && p.display_name.toLowerCase().includes(searchVal))
  );

  return matched.map((p: any) => ({
    type: 'user',
    text: p.username,
    id: p.id,
    detail: p.display_name,
    avatar_url: p.avatar_url
  })).slice(0, 5);
}

export async function searchExploreAll(query: string): Promise<any> {
  const cleanQuery = (query || '').trim().replace(/^@/, '');
  const searchVal = cleanQuery.toLowerCase();
  const online = await checkIsOnline();

  if (online && !isMockMode()) {
    try {
      // 1. Search Users via reliable searchUsers RPC & indexing
      const users = await searchUsers(cleanQuery, 10);

      // 2. Search Posts
      let posts: any[] = [];
      try {
        const { data: postsData } = await supabase
          .from('posts')
          .select('*, user:profiles(*), media:post_media(*)')
          .eq('status', 'published')
          .ilike('content', `%${cleanQuery}%`)
          .limit(10);
        if (postsData) posts = postsData;
      } catch (pErr) {}

      // 3. Search Group Communities (from chat_rooms where type = group)
      let communities: any[] = [];
      try {
        const { data: groupData } = await supabase
          .from('chat_rooms')
          .select('id, name, description, avatar_url, created_at')
          .eq('type', 'group')
          .ilike('name', `%${cleanQuery}%`)
          .limit(10);
        if (groupData) {
          communities = groupData.map((c: any) => ({
            id: c.id,
            name: c.name || 'Group Community',
            description: c.description || 'E2EE Group Chat Community',
            avatarUrl: c.avatar_url
          }));
        }
      } catch (cErr) {}

      return {
        users: users || [],
        communities: communities || [],
        posts: posts || [],
        reels: posts?.filter((p: any) => p.type === 'video') || []
      };
    } catch (e) {
      console.warn('[searchExploreAll] Search error:', e);
    }
  }

  // Fallback for mock/offline mode
  const profiles = isMockMode() ? mockDb.getProfiles() : getCachedProfiles();
  const posts = isMockMode() ? mockDb.getPosts() : [];
  const rooms = isMockMode() ? mockDb.getChatRooms() : [];

  const matchedUsers = profiles.filter((p: any) =>
    (p.username && p.username.toLowerCase().includes(searchVal)) ||
    (p.display_name && p.display_name.toLowerCase().includes(searchVal))
  );

  const matchedPosts = posts.filter((p: any) =>
    p.content?.toLowerCase().includes(searchVal)
  ).map((post: any) => {
    const author = profiles.find((p: any) => p.id === post.userId) || { id: post.userId, username: 'anonymous_user', display_name: 'Anonymous', avatar_url: '' };
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

  const matchedCommunities = rooms.filter((r: any) =>
    r.type === 'group' && r.name?.toLowerCase().includes(searchVal)
  ).map((c: any) => ({
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

export async function logSearchQuery(query: string): Promise<void> {
  const store = useAuthStore.getState();
  const user = store.user;
  if (!user || !query || query.trim().length === 0) return;

  const online = await checkIsOnline();
  if (online && !isMockMode()) {
    try {
      await supabase.from('search_history').insert({
        user_id: user.id,
        query: query.trim().toLowerCase()
      });
    } catch (e) {}
  }
  console.log(`[Explore Search] Logged search query: "${query}"`);
}

export async function initializeE2EKeys(userId: string, deviceId: string) {
  const store = useAuthStore.getState();
  const keyStorageKey = `jamsh_e2e_keys_${userId}`;
  let keys: any = null;

  // 1. Try reading from native secure storage first
  if (!keys && Capacitor.isNativePlatform()) {
    try {
      const secureResult = await JamshNearby.getSecure({ key: keyStorageKey });
      if (secureResult && secureResult.value) {
        keys = JSON.parse(secureResult.value);
        store.setDeviceKeyPair(keys);
      }
    } catch (e) {
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
      } catch (e) {
        console.error('[E2EKeys] Failed to parse localStorage keys', e);
      }
    }
  }

  // 3. Fallback / key generation if keys still don't exist
  if (!keys) {
    if (isMockMode()) {
      const users = mockDb.getUsers();
      const foundUser = users.find((u: any) => u.id === userId);
      if (foundUser && foundUser.devicePrivateKey && foundUser.devicePublicKey) {
        keys = {
          privateKey: foundUser.devicePrivateKey,
          publicKey: foundUser.devicePublicKey,
        };
      }
    }

    if (!keys) {
      keys = generateKeyPair();
    }

    // Persist key pair
    if (Capacitor.isNativePlatform()) {
      try {
        await JamshNearby.saveSecure({ key: keyStorageKey, value: JSON.stringify(keys) });
      } catch (e) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(keyStorageKey, JSON.stringify(keys));
        }
      }
    } else if (typeof window !== 'undefined') {
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
    } catch (e) {}

    try {
      await supabase.from('device_keys').upsert({
        user_id: userId,
        device_id: deviceId,
        identity_key: keys.publicKey,
        signed_prekey: keys.publicKey,
        prekey_signature: 'sig_placeholder',
      }, { onConflict: 'user_id,device_id' });
    } catch (err) {}
  }

  return keys;
}


// ----------------------------------------------------
// REELS & AI RECOMMENDATION FEED API
// ----------------------------------------------------

export async function fetchReelsFeed(limit = 10, cursorTimestamp?: string, cursorId?: string): Promise<any[]> {
  const store = useAuthStore.getState();
  const currentUser = store.user;
  if (!currentUser) throw new Error('Not authenticated');

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
      if (!response.ok) throw new Error(resJson.error || 'Failed to fetch Reels feed');
      return resJson.feed || [];
    } catch (e) {
      console.warn('[Reels] Remote Edge function failed, attempting direct table fetch', e);
      try {
        let query = supabase
          .from('videos')
          .select('*, user:profiles(id, username, display_name, avatar_url)')
          .eq('visibility', 'public')
          .eq('moderation_status', 'approved');

        if (cursorTimestamp) {
          query = query.lt('created_at', cursorTimestamp);
        }

        const { data: dbVideos, error: dbError } = await query
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!dbError && dbVideos && dbVideos.length > 0) {
          return dbVideos;
        }
      } catch (dbErr) {
        console.warn('[Reels] Direct table fetch note:', dbErr);
      }
    }
  }

  // Mock recommendation engine with cold-start and engagement scoring
  const videos = mockDb.getVideos();
  const reactions = mockDb.getVideoInteractions();
  const profiles = mockDb.getProfiles();
  const likes = mockDb.getVideoLikes();

  const userInteractions = reactions.filter((r: any) => r.user_id === currentUser.id);
  const userLikes = likes.filter((l: any) => l.user_id === currentUser.id).map((l: any) => l.video_id);

  // Parse cursors
  let filtered = videos.filter(v => v.visibility === 'public' && v.moderation_status === 'approved');
  if (cursorTimestamp) {
    filtered = filtered.filter(v => {
      const t = new Date(v.created_at).getTime();
      const cut = new Date(cursorTimestamp).getTime();
      if (t < cut) return true;
      if (t === cut && cursorId && v.id < cursorId) return true;
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
    } else {
      // Engagement scoring
      score = v.like_count * 5.0 + v.share_count * 10.0;
      if (isLiked) score += 25;
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

export async function likeReel(videoId: string): Promise<{ liked: boolean; countChange: number }> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');

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
      } else {
        await supabase.from('video_likes').insert({ user_id: user.id, video_id: videoId });
        return { liked: true, countChange: 1 };
      }
    } catch (e) {
      console.warn('[Reels] Remote database like failed', e);
    }
  }

  // Fallback
  const likes = mockDb.getVideoLikes();
  const idx = likes.findIndex((l: any) => l.user_id === user.id && l.video_id === videoId);
  let liked = false;
  let countChange = 0;

  if (idx >= 0) {
    likes.splice(idx, 1);
    liked = false;
    countChange = -1;
  } else {
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

export async function commentOnReel(videoId: string, content: string, parentId?: string): Promise<any> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');

  if (!isMockMode()) {
    try {
      const { data, error } = await supabase
        .from('video_comments')
        .insert({ video_id: videoId, user_id: user.id, content, parent_id: parentId || null })
        .select()
        .single();
      if (!error && data) return data;
    } catch (e) {
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

export async function fetchReelComments(videoId: string, limit = 25): Promise<any[]> {
  if (!isMockMode()) {
    try {
      const { data, error } = await supabase
        .from('video_comments')
        .select('*, user:profiles(id, username, display_name, avatar_url)')
        .eq('video_id', videoId)
        .order('created_at', { ascending: true })
        .limit(limit);
      if (!error && data) return data;
    } catch (e) {
      console.warn('[Reels] Remote fetch comments note:', e);
    }
  }

  const comments = mockDb.getVideoComments();
  const profiles = mockDb.getProfiles();
  const filtered = comments.filter((c: any) => c.video_id === videoId);
  return filtered.map((c: any) => ({
    ...c,
    user: profiles.find((p: any) => p.id === c.user_id) || { id: c.user_id, username: 'user', display_name: 'User' },
  }));
}

export async function deleteReelComment(commentId: string): Promise<boolean> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');

  if (!isMockMode()) {
    try {
      const { error } = await supabase
        .from('video_comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', user.id);
      if (!error) return true;
    } catch (e) {
      console.warn('[Reels] Remote delete comment note:', e);
    }
  }

  const comments = mockDb.getVideoComments();
  const index = comments.findIndex((c: any) => c.id === commentId && c.user_id === user.id);
  if (index >= 0) {
    const videoId = comments[index].video_id;
    comments.splice(index, 1);
    mockDb.setVideoComments(comments);

    const videos = mockDb.getVideos();
    const updated = videos.map((v: any) => {
      if (v.id === videoId) {
        return { ...v, comment_count: Math.max(0, v.comment_count - 1) };
      }
      return v;
    });
    mockDb.setVideos(updated);
    return true;
  }
  return false;
}

export async function fetchCreatorReels(userId: string): Promise<any[]> {
  if (!isMockMode()) {
    try {
      const { data, error } = await supabase
        .from('videos')
        .select('*, user:profiles(id, username, display_name, avatar_url)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (!error && data) return data;
    } catch (e) {
      console.warn('[Reels] Remote fetch creator reels note:', e);
    }
  }

  const videos = mockDb.getVideos();
  const profiles = mockDb.getProfiles();
  const author = profiles.find((p: any) => p.id === userId);
  return videos
    .filter((v: any) => v.user_id === userId)
    .map((v: any) => ({
      ...v,
      user: author || { id: userId, username: 'creator', display_name: 'Creator' },
    }));
}

export async function updateReelMetadata(
  videoId: string,
  updates: { caption?: string; hashtags?: string[]; visibility?: 'public' | 'private' }
): Promise<any> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');

  if (!isMockMode()) {
    try {
      const { data, error } = await supabase
        .from('videos')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', videoId)
        .eq('user_id', user.id)
        .select()
        .single();
      if (!error && data) return data;
    } catch (e) {
      console.warn('[Reels] Remote update reel note:', e);
    }
  }

  const videos = mockDb.getVideos();
  let updatedVideo: any = null;
  const updated = videos.map((v: any) => {
    if (v.id === videoId && v.user_id === user.id) {
      updatedVideo = { ...v, ...updates, updated_at: new Date().toISOString() };
      return updatedVideo;
    }
    return v;
  });
  if (!updatedVideo) throw new Error('Reel not found or unauthorized');
  mockDb.setVideos(updated);
  return updatedVideo;
}

export async function deleteReel(videoId: string): Promise<boolean> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');

  if (!isMockMode()) {
    try {
      const { error } = await supabase
        .from('videos')
        .delete()
        .eq('id', videoId)
        .eq('user_id', user.id);
      if (!error) return true;
    } catch (e) {
      console.warn('[Reels] Remote delete reel note:', e);
    }
  }

  const videos = mockDb.getVideos();
  const index = videos.findIndex((v: any) => v.id === videoId && v.user_id === user.id);
  if (index >= 0) {
    videos.splice(index, 1);
    mockDb.setVideos(videos);
    return true;
  }
  return false;
}

export async function toggleReelSave(videoId: string): Promise<{ saved: boolean }> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');
  if (isMockMode()) {
    const saves = mockDb.getVideoSaves();
    const index = saves.findIndex((save: any) => save.user_id === user.id && save.video_id === videoId);
    if (index >= 0) {
      saves.splice(index, 1);
      mockDb.setVideoSaves(saves);
      return { saved: false };
    }
    saves.push({ id: `vsave_${Date.now()}`, user_id: user.id, video_id: videoId });
    mockDb.setVideoSaves(saves);
    return { saved: true };
  }
  const { data: existing, error: readError } = await supabase
    .from('video_saves')
    .select('id')
    .eq('user_id', user.id)
    .eq('video_id', videoId)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) {
    const { error } = await supabase.from('video_saves').delete().eq('id', existing.id);
    if (error) throw error;
    return { saved: false };
  }
  const { error } = await supabase.from('video_saves').insert({ user_id: user.id, video_id: videoId });
  if (error) throw error;
  return { saved: true };
}

export async function shareReel(videoId: string, platform = 'direct'): Promise<void> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');
  if (isMockMode()) {
    await trackVideoInteraction(videoId, 'share');
    return;
  }
  const { error } = await supabase.from('video_shares').insert({
    user_id: user.id,
    video_id: videoId,
    platform,
  });
  if (error) throw error;
  await trackVideoInteraction(videoId, 'share');
}

export async function trackVideoInteraction(
  videoId: string,
  type: 'watch' | 'like' | 'share' | 'save' | 'comment' | 'skip' | 'report' | 'hide' | 'not_interested',
  watchTime = 0,
  watchPercent = 0
): Promise<void> {
  const user = useAuthStore.getState().user;
  if (!user) return;

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
    } catch (e) {
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
    const existingIdx = history.findIndex((h: any) => h.user_id === user.id && h.video_id === videoId);
    if (existingIdx >= 0) {
      history[existingIdx].completed = watchPercent >= 95;
      history[existingIdx].last_watched_at = new Date().toISOString();
    } else {
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

function getScoreWeight(type: string): number {
  const weights: Record<string, number> = {
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

export async function uploadReel(
  videoUrl: string,
  thumbnailUrl: string,
  caption: string,
  hashtags: string[],
  interests: string[],
  duration: number
): Promise<any> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');

  if (!isMockMode()) {
    throw new Error('Direct Reel publication is disabled. Upload the source file through createReelUploadJob.');
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

export interface ReelEditManifest {
  version: 1;
  clips: Array<{
    path: string;
    trimStart?: number;
    trimEnd?: number;
    speed?: number;
    volume?: number;
  }>;
  filter?: 'none' | 'cyber_gold' | 'dark_neon' | 'cyber_mono' | 'vivid_contrast';
  textOverlays?: Array<{
    text: string;
    start: number;
    end: number;
    x: number;
    y: number;
    color: string;
    fontSize: number;
  }>;
  audio?: {
    path?: string;
    volume: number;
  };
  coverTimeSeconds?: number;
}

export interface ReelUploadJob {
  jobId: string;
  videoId: string;
  rawVideoPath: string;
  status: 'queued';
}

export interface ReelJobStatus {
  id: string;
  video_id: string | null;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  attempts: number;
  max_attempts: number;
  error_log: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function createClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return uuidv4();
}

export async function createReelUploadJob(
  file: Blob,
  metadata: {
    caption: string;
    hashtags: string[];
    interests: string[];
    visibility: 'public' | 'private';
    duration: number;
    width?: number;
    height?: number;
    thumbnailPath?: string;
    editManifest?: ReelEditManifest;
  },
  onProgress?: (progress: number) => void,
): Promise<ReelUploadJob> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');
  if (file.size === 0) throw new Error('The selected video is empty.');
  if (file.size > 200 * 1024 * 1024) throw new Error('Videos must be smaller than 200 MB.');
  if (metadata.duration <= 0 || metadata.duration > 180) {
    throw new Error('Reels must be between 1 second and 3 minutes long.');
  }

  if (isMockMode()) {
    const videoId = createClientId();
    const jobId = createClientId();
    return { jobId, videoId, rawVideoPath: `mock/${user.id}/${videoId}.mp4`, status: 'queued' };
  }

  const videoId = createClientId();
  const rawVideoPath = `${user.id}/${videoId}/source`;
  onProgress?.(5);

  const { error: uploadError } = await supabase.storage
    .from('reels-ingest')
    .upload(rawVideoPath, file, {
      cacheControl: '3600',
      contentType: file.type || 'video/mp4',
      upsert: false,
    });
  if (uploadError) throw new Error(`Video upload failed: ${uploadError.message}`);
  onProgress?.(70);

  const { data, error: jobError } = await supabase
    .from('media_jobs')
    .insert({
      video_id: videoId,
      user_id: user.id,
      raw_video_path: rawVideoPath,
      status: 'queued',
      metadata: {
        ...metadata,
        source_content_type: file.type || 'video/mp4',
      },
    })
    .select('id, video_id, raw_video_path, status')
    .single();

  if (jobError || !data) {
    await supabase.storage.from('reels-ingest').remove([rawVideoPath]);
    throw new Error(`Could not queue video processing: ${jobError?.message || 'Unknown error'}`);
  }
  onProgress?.(75);
  return {
    jobId: data.id,
    videoId: data.video_id,
    rawVideoPath: data.raw_video_path,
    status: data.status,
  };
}

export async function getReelUploadJob(jobId: string): Promise<ReelJobStatus> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');
  if (isMockMode()) {
    return {
      id: jobId,
      video_id: null,
      status: 'queued',
      attempts: 0,
      max_attempts: 3,
      error_log: null,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase
    .from('media_jobs')
    .select('id, video_id, status, attempts, max_attempts, error_log, metadata, created_at, updated_at')
    .eq('id', jobId)
    .eq('user_id', user.id)
    .single();
  if (error || !data) throw new Error(`Could not read video processing status: ${error?.message || 'Job not found'}`);
  return data as ReelJobStatus;
}

export async function waitForReelPublication(
  jobId: string,
  options: { timeoutMs?: number; intervalMs?: number; onStatus?: (job: ReelJobStatus) => void } = {},
): Promise<ReelJobStatus> {
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const intervalMs = options.intervalMs ?? 2500;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const job = await getReelUploadJob(jobId);
    options.onStatus?.(job);
    if (job.status === 'completed') return job;
    if (job.status === 'failed') throw new Error(job.error_log || 'Video processing failed.');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Video processing timed out. You can retry from your drafts.');
}

// ----------------------------------------------------
// OFFLINE ENGAGEMENT QUEUE & SYNC SYSTEM
// ----------------------------------------------------

export interface QueuedEngagementAction {
  id: string;
  type: 'thunder' | 'comment' | 'save' | 'share';
  postId: string;
  payload: any;
  createdAt: number;
}

let queuedEngagementActions: QueuedEngagementAction[] = [];

// Load queue from localStorage on startup
try {
  const saved = localStorage.getItem('jamsh_offline_engagement_queue');
  if (saved) queuedEngagementActions = JSON.parse(saved);
} catch (e) {}

function saveEngagementQueue() {
  try {
    localStorage.setItem('jamsh_offline_engagement_queue', JSON.stringify(queuedEngagementActions));
  } catch (e) {}
}

export function queueOfflineEngagement(type: 'thunder' | 'comment' | 'save' | 'share', postId: string, payload: any = {}) {
  if (type === 'thunder' || type === 'save') {
    const existing = queuedEngagementActions.find(a => a.type === type && a.postId === postId);
    if (existing) return;
  }
  
  const action: QueuedEngagementAction = {
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

export async function syncOfflineEngagementQueue(): Promise<void> {
  const online = await checkIsOnline();
  if (!online || queuedEngagementActions.length === 0) return;

  console.log(`[Sync Engagement] Processing ${queuedEngagementActions.length} offline engagement actions...`);
  const sorted = [...queuedEngagementActions].sort((a, b) => a.createdAt - b.createdAt);
  
  queuedEngagementActions = [];
  saveEngagementQueue();

  for (const action of sorted) {
    try {
      if (action.type === 'thunder') {
        await toggleThunderReaction(action.postId, action.payload.commentId);
      } else if (action.type === 'comment') {
        await addComment(action.postId, action.payload.content, action.payload.parentId);
      } else if (action.type === 'save') {
        await toggleSavePost(action.postId);
      } else if (action.type === 'share') {
        await shareContent(action.postId, action.payload.targetType, action.payload.targetId);
      }
    } catch (err) {
      console.error(`[Sync Engagement] Failed to run queued action ${action.id}:`, err);
      queueOfflineEngagement(action.type, action.postId, action.payload);
    }
  }
}

// ----------------------------------------------------
// GENERAL ENGAGEMENT CLIENT SDK APIS
// ----------------------------------------------------

export async function addComment(postId: string, content: string, parentId?: string): Promise<any> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');

  if (!content || content.trim().length === 0) {
    throw new Error('Comment content cannot be empty');
  }
  if (content.trim().length > 2000) {
    throw new Error('Comments must be 2,000 characters or fewer');
  }

  const online = await checkIsOnline();
  if (online && !isMockMode()) {
    try {
      const { data, error: functionError } = await supabase.functions.invoke('handle-comment', {
        body: { postId, content, parentId },
      });
      if (!functionError && data && data.comment) {
        return data.comment;
      }
    } catch (e) {
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

      if (error) throw error;
      return data;
    } catch (e) {
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
      const parentComment = mockDb.getComments().find((c: any) => c.id === parentId);
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
      const parentComment = parentId ? mockDb.getComments().find((c: any) => c.id === parentId) : null;
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

export async function editComment(commentId: string, content: string): Promise<any> {
  const online = await checkIsOnline();
  if (online && !isMockMode()) {
    const { data, error } = await supabase
      .from('comments')
      .update({ content })
      .eq('id', commentId)
      .select('*, user:profiles(*)')
      .single();
    if (!error && data) return data;
  }

  const comments = mockDb.getComments();
  const index = comments.findIndex((c: any) => c.id === commentId);
  if (index >= 0) {
    comments[index].content = content;
    comments[index].updatedAt = new Date().toISOString();
    mockDb.setComments([...comments]);
    return comments[index];
  }
  throw new Error('Comment not found');
}

export async function deleteComment(commentId: string): Promise<void> {
  const online = await checkIsOnline();
  if (online && !isMockMode()) {
    const { error } = await supabase.from('comments').delete().eq('id', commentId);
    if (error) throw error;
    return;
  }

  const comments = mockDb.getComments();
  const comment = comments.find((c: any) => c.id === commentId);
  const updatedComments = comments.filter((c: any) => c.id !== commentId);
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

export async function fetchComments(
  postId: string,
  sortBy = 'newest',
  page = 0,
  limit = 10
): Promise<any[]> {
  const online = await checkIsOnline();
  if (online && !isMockMode()) {
    try {
      let query = supabase
        .from('comments')
        .select('*, user:profiles(*)')
        .eq('post_id', postId)
        .is('parent_id', null);

      if (sortBy === 'oldest') query = query.order('created_at', { ascending: true });
      else query = query.order('created_at', { ascending: false });

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
    } catch (e) {}
  }

  const comments = mockDb.getComments();
  const rootComments = comments.filter((c: any) => c.postId === postId && !c.parentId);

  if (sortBy === 'oldest') {
    rootComments.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } else if (sortBy === 'top') {
    rootComments.sort((a: any, b: any) => (b.thundersCount || 0) - (a.thundersCount || 0));
  } else {
    rootComments.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const paginated = rootComments.slice(page * limit, (page + 1) * limit);

  return paginated.map((parent: any) => ({
    ...parent,
    replies: comments.filter((c: any) => c.parentId === parent.id)
  }));
}

export async function toggleSavePost(postId: string): Promise<{ saved: boolean }> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');

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
      } else {
        await supabase.from('saves').insert({ user_id: user.id, post_id: postId });
        return { saved: true };
      }
    } catch (e) {}
  }

  if (!online) {
    queueOfflineEngagement('save', postId);
  }

  const saves = mockDb.getSaves();
  const matchIdx = saves.findIndex((s: any) => s.userId === user.id && s.postId === postId);
  let saved = false;

  if (matchIdx >= 0) {
    saves.splice(matchIdx, 1);
    saved = false;
  } else {
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

export async function shareContent(
  postId: string,
  targetType = 'external',
  targetId?: string
): Promise<any> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not authenticated');

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
      if (!error && data) return data;
    } catch (e) {}
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

export async function logPostView(postId: string, watchTime = 0.0): Promise<any> {
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
      if (!error && data) return data;
    } catch (e) {}
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
  } catch {
    return {
      'Content-Type': 'application/json',
      'Authorization': '',
    };
  }
}

const getBackendUrl = () => {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.VITE_API_URL) return process.env.VITE_API_URL;
    if (process.env.VITE_SOCKET_URL) return process.env.VITE_SOCKET_URL;
  }
  try {
    const metaEnv = Function('return import.meta.env')();
    if (metaEnv) {
      if (metaEnv.VITE_API_URL) return metaEnv.VITE_API_URL;
      if (metaEnv.VITE_SOCKET_URL) return metaEnv.VITE_SOCKET_URL;
    }
  } catch (e) {}

  return '';
};

export async function fetchNotifications(page = 0, limit = 20, category?: string): Promise<Notification[]> {
  const store = useAuthStore.getState();
  const currentUser = store.user;
  if (!currentUser) return [];

  if (!isMockMode() && await checkIsOnline()) {
    try {
      const { data, error } = await supabase.functions.invoke('notifications-api', {
        body: { action: 'fetch-notifications', page, limit, category }
      });
      if (!error && data && Array.isArray(data.notifications)) {
        return data.notifications as Notification[];
      }
    } catch (e) {
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
      if (data) return data as Notification[];
    } catch (e) {}
  }

  // Fallback LocalMockDB
  let notifications = mockDb.getNotifications() || [];
  notifications = notifications.filter((n: any) => n.receiverId === currentUser.id && !n.deletedAt);
  
  if (category && category !== 'All') {
    notifications = notifications.filter((n: any) => {
      if (category === 'Likes') return n.type === 'LIKE' || n.type === 'THUNDER';
      if (category === 'Comments') return n.type === 'COMMENT' || n.type === 'REPLY';
      if (category === 'Follows') return n.type === 'FOLLOW' || n.type === 'FOLLOW_REQUEST' || n.type === 'FOLLOW_ACCEPTED';
      if (category === 'Mentions') return n.type === 'MENTION' || n.type === 'TAG';
      if (category === 'AI') return n.type === 'AI_RECOMMENDATION';
      return true;
    });
  }

  // Group notifications in Mock mode (like "Rahul and 12 others liked your post")
  const groupedMap = new Map<string, any>();
  const results: any[] = [];
  
  for (const n of notifications) {
    if (!n.groupKey) {
      results.push(n);
      continue;
    }
    
    if (groupedMap.has(n.groupKey)) {
      const parent = groupedMap.get(n.groupKey);
      if (parent.metadata && n.metadata && n.metadata.actors) {
        const existingActors = new Set(parent.metadata.actors);
        n.metadata.actors.forEach((act: string) => existingActors.add(act));
        parent.metadata.actors = Array.from(existingActors);
        parent.metadata.count = (parent.metadata.count || 1) + 1;
      }
    } else {
      const copy = { ...n, metadata: n.metadata ? { ...n.metadata } : { actors: [], count: 1 } };
      groupedMap.set(n.groupKey, copy);
      results.push(copy);
    }
  }

  return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function fetchUnreadCounts(): Promise<NotificationCounts> {
  const store = useAuthStore.getState();
  const currentUser = store.user;
  const defaultCounts: NotificationCounts = { messages: 0, notifications: 0, communities: 0, requests: 0 };
  if (!currentUser) return defaultCounts;

  if (!isMockMode() && await checkIsOnline()) {
    try {
      const { data, error } = await supabase.functions.invoke('notifications-api', {
        body: { action: 'unread-counts' }
      });
      if (!error && data && data.counts) {
        return data.counts as NotificationCounts;
      }
    } catch (e) {
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
        messages: list.filter((n: any) => n.type === 'MESSAGE').length,
        notifications: list.filter((n: any) => n.type !== 'MESSAGE' && n.type !== 'COMMUNITY').length,
        communities: list.filter((n: any) => n.type === 'COMMUNITY').length,
        requests: 0,
      };
    } catch (e) {}
  }

  // Fallback LocalMockDB
  const notifications = mockDb.getNotifications() || [];
  const unreadNotifs = notifications.filter((n: any) => n.receiverId === currentUser.id && n.status === 'UNREAD' && !n.deletedAt);
  const followers = mockDb.getFollowers() || [];
  const pendingRequests = followers.filter((f: any) => f.following_id === currentUser.id && f.status === 'pending');

  return {
    messages: unreadNotifs.filter((n: any) => n.type === 'MESSAGE').length,
    notifications: unreadNotifs.filter((n: any) => n.type !== 'MESSAGE' && n.type !== 'COMMUNITY').length,
    communities: unreadNotifs.filter((n: any) => n.type === 'COMMUNITY').length,
    requests: pendingRequests.length
  };
}

export async function markNotificationAsRead(id: string): Promise<boolean> {
  const store = useAuthStore.getState();
  if (!store.user) return false;

  if (!isMockMode() && await checkIsOnline()) {
    try {
      const { data, error } = await supabase.functions.invoke('notifications-api', {
        body: { action: 'mark-read', notificationId: id }
      });
      if (!error && data && data.success) return true;
    } catch (e) {}

    try {
      await supabase
        .from('notifications')
        .update({ status: 'READ', read_at: new Date().toISOString() })
        .eq('id', id)
        .eq('receiver_id', store.user.id);
      return true;
    } catch (e) {}
  }

  // Fallback LocalMockDB
  const notifications = mockDb.getNotifications() || [];
  const updated = notifications.map((n: any) => {
    if (n.id === id) {
      return { ...n, status: 'READ', readAt: new Date().toISOString() };
    }
    return n;
  });
  mockDb.setNotifications(updated);
  return true;
}

export async function markAllNotificationsAsRead(): Promise<boolean> {
  const store = useAuthStore.getState();
  if (!store.user) return false;

  if (!isMockMode() && await checkIsOnline()) {
    try {
      const { data, error } = await supabase.functions.invoke('notifications-api', {
        body: { action: 'mark-all-read' }
      });
      if (!error && data && data.success) return true;
    } catch (e) {}

    try {
      await supabase
        .from('notifications')
        .update({ status: 'READ', read_at: new Date().toISOString() })
        .eq('receiver_id', store.user.id)
        .eq('status', 'UNREAD');
      return true;
    } catch (e) {}
  }

  // Fallback LocalMockDB
  const notifications = mockDb.getNotifications() || [];
  const updated = notifications.map((n: any) => {
    if (n.receiverId === store.user.id) {
      return { ...n, status: 'READ', readAt: new Date().toISOString() };
    }
    return n;
  });
  mockDb.setNotifications(updated);
  return true;
}

export async function deleteNotification(id: string): Promise<boolean> {
  const store = useAuthStore.getState();
  if (!store.user) return false;

  if (!isMockMode() && await checkIsOnline()) {
    try {
      const { data, error } = await supabase.functions.invoke('notifications-api', {
        body: { action: 'delete-notification', notificationId: id }
      });
      if (!error && data && data.success) return true;
    } catch (e) {}

    try {
      await supabase
        .from('notifications')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('receiver_id', store.user.id);
      return true;
    } catch (e) {}
  }

  // Fallback LocalMockDB (Soft delete)
  const notifications = mockDb.getNotifications() || [];
  const updated = notifications.map((n: any) => {
    if (n.id === id) {
      return { ...n, deletedAt: new Date().toISOString() };
    }
    return n;
  });
  mockDb.setNotifications(updated);
  return true;
}

export * from './services/StoryService.js';

// ----------------------------------------------------
// BITCHAT-INSPIRED OFFLINE LOCAL PAIRING (ZERO-SERVER)
// ----------------------------------------------------

export function generateOfflinePairingUrl(user: UserProfile, myPublicKeyHex: string): string {
  const params = new URLSearchParams({
    id: user.id,
    name: user.username || user.display_name || 'user',
    pub: myPublicKeyHex,
  });
  return `jamsh-pair://v1?${params.toString()}`;
}

export function parseOfflinePairingUrl(pairingUrl: string): { userId: string; username: string; publicKey: string } | null {
  try {
    if (!pairingUrl || !pairingUrl.startsWith('jamsh-pair://v1?')) return null;
    const queryString = pairingUrl.replace('jamsh-pair://v1?', '');
    const params = new URLSearchParams(queryString);
    const userId = params.get('id');
    const username = params.get('name') || 'Peer';
    const publicKey = params.get('pub');
    if (!userId || !publicKey) return null;
    return { userId, username, publicKey };
  } catch (e) {
    return null;
  }
}

export function completeOfflinePairing(myUserId: string, peer: { userId: string; username: string; publicKey: string }): ChatRoom {
  cachePublicKey(myUserId, peer.userId, peer.publicKey);

  const existingRooms = mockDb.getChatRooms();
  let room = existingRooms.find((r: any) => 
    r.type === 'direct' && r.members && r.members.includes(peer.userId)
  );

  if (!room) {
    const roomId = `room_offline_${peer.userId.substring(0, 8)}_${Date.now()}`;
    room = {
      id: roomId,
      type: 'direct',
      name: peer.username,
      members: [myUserId, peer.userId],
      created_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
      last_message_preview: 'Offline paired via QR code',
      peer: {
        id: peer.userId,
        username: peer.username,
        display_name: peer.username,
        avatar_url: null,
      } as any,
    };
    mockDb.setChatRooms([room, ...existingRooms]);
  }

  const evt = new CustomEvent('nearbyPeerUpdate', { 
    detail: { peerId: peer.userId, active: true, isOnline: false } 
  });
  if (typeof window !== 'undefined') window.dispatchEvent(evt);

  return room;
}
