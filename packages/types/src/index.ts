export interface UserProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  website: string | null;
  followers_count: number;
  following_count: number;
  is_private: boolean;
  is_verified: boolean;
  birthday: string | null;
  created_at: string;
  updated_at: string;
}

export interface Post {
  id: string;
  user_id: string;
  content: string | null;
  type: 'text' | 'image' | 'video' | 'multiple';
  visibility: 'public' | 'private';
  status: 'draft' | 'scheduled' | 'published';
  scheduled_for: string | null;
  thunders_count: number;
  comments_count: number;
  created_at: string;
  updated_at: string;
  user?: UserProfile;
  media?: PostMedia[];
  thundered_by_me?: boolean;
}

export interface PostMedia {
  id: string;
  post_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  position: number;
  created_at: string;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  parent_id: string | null;
  thunders_count: number;
  created_at: string;
  updated_at: string;
  user?: UserProfile;
  replies?: Comment[];
  thundered_by_me?: boolean;
}

export interface FollowRelation {
  id: string;
  follower_id: string;
  following_id: string;
  status: 'pending' | 'accepted';
  created_at: string;
}

export interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  expires_at: string;
  created_at: string;
  user?: UserProfile;
  views_count?: number;
  story_views?: StoryView[];
  story_reactions?: StoryReaction[];
}

export interface StoryView {
  id: string;
  story_id: string;
  user_id: string;
  created_at: string;
  user?: UserProfile;
}

export interface StoryReaction {
  id: string;
  story_id: string;
  user_id: string;
  reaction_type: string;
  created_at: string;
}

export interface ChatRoom {
  id: string;
  name: string | null;
  type: 'direct' | 'group';
  avatar_url?: string | null;
  status?: 'pending' | 'accepted' | 'archived' | 'blocked';
  last_message_at?: string;
  last_message_preview?: string | null;
  last_message_sender_id?: string | null;
  unread_count?: number;
  updated_at?: string;
  created_at: string;
  last_message?: Message;
  members?: ChatMember[];
  peer?: UserProfile;
}

export interface ChatMember {
  id: string;
  room_id: string;
  user_id: string;
  role: 'admin' | 'member';
  last_read_at?: string;
  unread_count?: number;
  is_muted?: boolean;
  is_archived?: boolean;
  is_blocked?: boolean;
  joined_at: string;
  profile?: UserProfile;
}

export interface Message {
  id: string;
  room_id: string;
  sender_id: string;
  content: string; // Will hold base64 ciphertext in end-to-end encrypted chats
  type: 'text' | 'image' | 'video' | 'voice' | 'document';
  is_encrypted: boolean;
  nonce?: string; // Nonce for AES decryption
  sender_device_id?: string;
  delivered_at?: string | null;
  seen_at?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  reaction?: string | null;
  reply_to_message_id?: string | null;
  status?: 'sending' | 'sent' | 'delivered' | 'seen' | 'failed';
  temp_id?: string;
  decrypted?: string;
  created_at: string;
  sender?: UserProfile;
  attachments?: MessageAttachment[];
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  file_url: string; // URL to Supabase storage, content is encrypted locally before upload
  file_type: string;
  file_name: string;
  file_size: number;
}

export interface DeviceKey {
  id: string;
  user_id: string;
  device_id: string;
  identity_key: string; // X25519 public key (Base64)
  signed_prekey: string; // X25519 prekey (Base64)
  prekey_signature: string; // Signature (Base64)
  created_at: string;
}

export interface LiveStream {
  id: string;
  user_id: string;
  title: string;
  stream_key: string;
  status: 'live' | 'ended';
  viewer_count: number;
  started_at: string;
  ended_at: string | null;
  user?: UserProfile;
}

export interface LiveComment {
  id: string;
  stream_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user?: UserProfile;
}

export interface Report {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  post_id: string | null;
  comment_id: string | null;
  reason: string;
  status: 'pending' | 'reviewed' | 'resolved';
  created_at: string;
}

export type NotificationType =
  | 'MESSAGE'
  | 'THUNDER'
  | 'LIKE'
  | 'COMMENT'
  | 'REPLY'
  | 'FOLLOW'
  | 'FOLLOW_REQUEST'
  | 'FOLLOW_ACCEPTED'
  | 'MENTION'
  | 'TAG'
  | 'SHARE'
  | 'BOOKMARK'
  | 'COMMUNITY'
  | 'EVENT'
  | 'SYSTEM'
  | 'SECURITY'
  | 'AI_RECOMMENDATION';

export type NotificationPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type NotificationStatus = 'UNREAD' | 'READ' | 'ARCHIVED';

export type NotificationDeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED' | 'RETRYING';

export interface Notification {
  id: string;
  receiverId: string;
  senderId: string;
  type: NotificationType;
  status: NotificationStatus;
  priority: NotificationPriority;
  deliveryStatus: NotificationDeliveryStatus;
  groupKey: string | null;
  metadata: Record<string, any> | null;
  deliveredAt: string | null;
  readAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sender?: UserProfile;
}

export interface NotificationPreferences {
  userId: string;
  pushEnabled: boolean;
  emailEnabled: boolean;
  likesEnabled: boolean;
  commentsEnabled: boolean;
  thunderEnabled: boolean;
  messageEnabled: boolean;
  communityEnabled: boolean;
  recommendationEnabled: boolean;
  marketingEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

export interface NotificationAnalytics {
  id: string;
  notificationId: string;
  status: string;
  timestamp: string;
  deviceType: string | null;
}

export interface NotificationCounts {
  messages: number;
  notifications: number;
  communities: number;
  requests: number;
}

export interface WebRTCSignal {
  type: 'offer' | 'answer' | 'candidate';
  senderId: string;
  receiverId: string;
  sdp?: string;
  candidate?: string;
}
