import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  SafeAreaView,
  Image,
  TouchableOpacity,
  TextInput,
  Modal,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { StoryTray } from './components/stories/StoryTray';
import { StoryPlayer } from './components/stories/StoryPlayer';
import { InstagramInboxView } from './components/messaging/InstagramInboxView';
import { InstagramChatWindow } from './components/messaging/InstagramChatWindow';
import { StoryService } from '@jamsh/api';
import {
  useAuthStore,
  supabase,

  initializeE2EKeys,
  fetchFeed,
  createPost,
  toggleThunderReaction,
  followUser,
  checkIfFollowing,
  createChatRoom,
  sendEncryptedMessage,
  decryptReceivedMessage,
  setupCallSignalChannel,
  startLiveStream,
  endLiveStream,
  fetchProfile,
  updateProfile,
  signInUser,
  signUpUser,
  searchUsers,
  fetchChatRooms,
  fetchMessages,
  mockDb,
  forgotPassword,
  updatePassword,
  signInWithGoogle,
  sendPhoneOtp,
  verifyPhoneOtp,
  setupAuthListener,
  initializeNearbyListeners,
  startNearbyAdvertising,
  stopNearbyAdvertising,
  startNearbyScanning,
  stopNearbyScanning,
  checkIsOnline,
  createGroupRoom,
  addGroupMembers,
  removeGroupMember,
  promoteToAdmin,
  demoteToAdmin,
  editGroupInfo,
  deleteGroup,
  leaveGroup,
  fetchExploreFeed,
  fetchTrendingContent,
  fetchSearchSuggestions,
  searchExploreAll,
  logSearchQuery,
  addComment,
  editComment,
  deleteComment,
  fetchComments,
  toggleSavePost,
  shareContent,
  logPostView,
  fetchNotifications,
  fetchUnreadCounts,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  fetchFollowers,
  fetchFollowing
} from '@jamsh/api';
import { generateKeyPair, encryptPairwise } from '@jamsh/encryption';
import { Capacitor } from '@capacitor/core';
import {
  Home,
  Search,
  Compass,
  Film,
  MessageSquare,
  PlusSquare,
  User,
  Menu,
  MoreHorizontal,
  Bookmark,
  Smile,
  Link2,
  Send,
  Lock,
  Phone,
  Video,
  Info,
  Shield,
  LogOut,
  Image as ImageIcon,
  BookOpen,
  X,
  CheckCircle,
  Settings,
  UserCheck,
  UserPlus,
  Eye,
  EyeOff,
  Zap,
  Bell,
  Plus,
  Trash2,
  Mail,
  Edit3,
  ShieldCheck,
} from 'lucide-react';

import { getDisplayName, formatThunderCount, timeAgo } from '@jamsh/shared';

// Theme config matching Instagram Web Dark Mode
const instagramTheme = {
  colors: {
    bg: '#000000',          // Pure Black
    surface: '#121212',     // Very Dark Grey
    border: '#262626',      // Dark Grey border
    text: '#F5F5F5',        // Off White
    textSecondary: '#A8A8A8', // Grey text
    blue: '#0095F6',        // Instagram active blue
    red: '#ED4956',         // Red
    orange: '#F59A18',      // JAMSH primary orange
    messageUser: '#3797F0',  // Messenger blue
    messagePeer: '#262626',  // Dark grey bubble
  }
};

// Stylized Logo using the copied fist holding lightning image with white shadow filter
const JamshLogo = () => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    {/* @ts-ignore */}
    <img
      src="logo.jpg"
      alt="Jamsh Logo"
      style={{
        width: '42px',
        height: '42px',
        objectFit: 'contain',
        borderRadius: '8px',
        border: '1px solid rgba(245, 154, 24, 0.25)',
        filter: 'drop-shadow(0px 0px 8px rgba(245, 154, 24, 0.75))',
      }}
    />
    <Text style={{
      color: '#F5F5F5',
      fontFamily: 'Outfit, Inter, sans-serif',
      fontSize: 22,
      fontWeight: '900',
      letterSpacing: 1.2
    }}>
      JAMSH
    </Text>
  </View>
);

const JamshLoginHeader = () => (
  <View style={{ alignItems: 'center', marginBottom: 24, width: '100%' }}>
    {/* Glowing Logo Container */}
    <View style={{
      width: 80,
      height: 80,
      borderRadius: 24,
      borderWidth: 1.5,
      borderColor: '#F59A18',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#000000',
      boxShadow: '0 0 20px rgba(245, 154, 24, 0.45)',
      shadowColor: '#F59A18',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 15,
      marginBottom: 20,
    } as any}>
      {/* @ts-ignore */}
      <img
        src="logo.jpg"
        alt="Jamsh Logo"
        style={{
          width: '74px',
          height: '74px',
          borderRadius: '20px',
          objectFit: 'cover',
        }}
      />
    </View>

    {/* Brand Title */}
    <Text style={{
      color: '#FFFFFF',
      fontFamily: 'Outfit, Sora, sans-serif',
      fontSize: 28,
      fontWeight: '900',
      letterSpacing: 1.5,
      marginBottom: 12,
      textAlign: 'center',
    }}>
      JAMSH
    </Text>

    {/* Tagline */}
    <Text style={{
      color: '#A8A8A8',
      fontFamily: 'Manrope, Inter, sans-serif',
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: 20,
      maxWidth: 280,
    }}>
      Encrypted signals, live channels & vlogs.{"\n"}One dark pulse.
    </Text>

    {/* End-to-end encrypted Pill */}
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(245, 154, 24, 0.05)',
      borderWidth: 1,
      borderColor: 'rgba(245, 154, 24, 0.25)',
      borderRadius: 16,
      paddingVertical: 6,
      paddingHorizontal: 12,
      gap: 6,
      marginBottom: 16,
    }}>
      <Shield size={12} color="#F59A18" fill="rgba(245, 154, 24, 0.1)" />
      <Text style={{
        color: '#F59A18',
        fontFamily: 'Manrope, sans-serif',
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.2,
      }}>
        End-to-end encrypted
      </Text>
    </View>
  </View>
);

const Avatar = ({ uri, size = 32, style }: { uri?: string; size?: number; style?: any }) => {
  if (uri && uri.trim() !== '') {
    return <Image source={{ uri }} style={[{ width: size, height: size, borderRadius: size / 2 }, style]} />;
  }
  return (
    <View style={[{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: '#262626',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#363636'
    }, style]}>
      <User size={size * 0.6} color="#A8A8A8" />
    </View>
  );
};

const getBackendServerUrl = () => {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.VITE_SOCKET_URL) return process.env.VITE_SOCKET_URL;
    if (process.env.VITE_API_URL) return process.env.VITE_API_URL;
  }
  try {
    const metaEnv = Function('return import.meta.env')();
    if (metaEnv) {
      if (metaEnv.VITE_SOCKET_URL) return metaEnv.VITE_SOCKET_URL;
      if (metaEnv.VITE_API_URL) return metaEnv.VITE_API_URL;
    }
  } catch (e) {}

  return '';
};

function NotificationsCenter() {
  const user = useAuthStore(state => state.user);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadNotificationsData = async (pageNum: number, category: string, replace = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const data = await fetchNotifications(pageNum, 15, category);
      if (data.length < 15) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
      if (replace) {
        setNotifications(data);
      } else {
        setNotifications(prev => [...prev, ...data]);
      }
    } catch (e) {
      console.error('Failed to load notifications', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotificationsData(0, activeCategory, true);
    setPage(0);
  }, [activeCategory]);

  // WebSocket & Supabase Realtime Live Sync
  useEffect(() => {
    if (!user) return;

    // 1. Supabase Realtime Listener (Cloud / Production)
    const realtimeChannel = supabase
      .channel(`user_notifications_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `receiver_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) => [payload.new as any, ...prev]);
        }
      )
      .subscribe();

    // 2. Socket.IO (only if explicit backend socket URL is configured)
    let socket: any = null;
    const socketUrl = getBackendServerUrl();
    if (socketUrl) {
      try {
        socket = io(socketUrl, {
          query: { userId: user.id },
          transports: ['websocket'],
          autoConnect: true,
          timeout: 5000,
        });

        socket.on('notification:new', (newNotif: any) => {
          setNotifications(prev => [newNotif, ...prev]);
        });

        socket.on('notification:update', (updatedNotif: any) => {
          setNotifications(prev => prev.map(n => n.id === updatedNotif.id ? updatedNotif : n));
        });

        socket.on('notification:read', (data: any) => {
          setNotifications(prev => prev.map(n => n.id === data.notificationId ? { ...n, status: 'READ' } : n));
        });

        socket.on('notification:delete', (data: any) => {
          setNotifications(prev => prev.filter(n => n.id !== data.notificationId));
        });
      } catch (e) {}
    }

    return () => {
      if (realtimeChannel) supabase.removeChannel(realtimeChannel);
      if (socket) socket.disconnect();
    };
  }, [user]);

  const handleLoadMore = () => {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadNotificationsData(nextPage, activeCategory, false);
  };

  const handleMarkRead = async (notifId: string) => {
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, status: 'READ' } : n));
    await markNotificationAsRead(notifId);
    
    // Analytics
    try {
      await supabase.functions.invoke('notifications-api', {
        body: { action: 'log-analytics', notificationId: notifId, status: 'clicked', deviceType: 'web' }
      });
    } catch {}
  };

  const handleDelete = async (notifId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notifId));
    await deleteNotification(notifId);

    // Analytics
    try {
      await supabase.functions.invoke('notifications-api', {
        body: { action: 'log-analytics', notificationId: notifId, status: 'dismissed', deviceType: 'web' }
      });
    } catch {}
  };

  const handleMarkAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, status: 'READ' })));
    await markAllNotificationsAsRead();
  };

  const getCategoryIcon = (type: string) => {
    switch (type) {
      case 'THUNDER':
      case 'LIKE':
        return <Zap size={12} color="#F59A18" />;
      case 'COMMENT':
      case 'REPLY':
        return <MessageSquare size={12} color="#00C1F5" />;
      case 'FOLLOW':
      case 'FOLLOW_REQUEST':
      case 'FOLLOW_ACCEPTED':
        return <User size={12} color="#A358FF" />;
      case 'SECURITY':
        return <Shield size={12} color="#FF453A" />;
      default:
        return <Bell size={12} color="#A8A8A8" />;
    }
  };

  const getNotificationText = (item: any) => {
    const actors = item.metadata?.actors || [];
    const count = item.metadata?.count || 1;
    const actorName = actors[0] || 'Someone';

    switch (item.type) {
      case 'LIKE':
      case 'THUNDER':
        return count > 1 
          ? `**${actorName}** and **${count - 1} others** liked your post.`
          : `**${actorName}** liked your post.`;
      case 'COMMENT':
        return `**${actorName}** commented on your post: "${item.metadata?.preview || '...'}"`;
      case 'REPLY':
        return `**${actorName}** replied: "${item.metadata?.preview || '...'}"`;
      case 'FOLLOW':
        return `**${actorName}** started following you.`;
      case 'FOLLOW_REQUEST':
        return `**${actorName}** sent a follow request.`;
      case 'FOLLOW_ACCEPTED':
        return `**${actorName}** accepted your follow request.`;
      case 'SECURITY':
        return `Security alert: ${item.metadata?.details || 'New login detected.'}`;
      default:
        return `New notification alert.`;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000000', paddingHorizontal: 16, paddingTop: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Text style={{ color: '#ffffff', fontFamily: 'Sora, sans-serif', fontSize: 20, fontWeight: 'bold' }}>
          Alerts
        </Text>
        {notifications.some(n => n.status === 'UNREAD') && (
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={{ color: '#F59A18', fontSize: 13, fontWeight: '600', fontFamily: 'Manrope, sans-serif' }}>
              Mark all read
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
        style={{ flexGrow: 0 }}
      >
        {['All', 'Likes', 'Comments', 'Follows', 'Mentions', 'AI'].map(cat => {
          const isActive = activeCategory === cat;
          return (
            <TouchableOpacity
              key={cat}
              onPress={() => setActiveCategory(cat)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 20,
                backgroundColor: isActive ? 'rgba(245, 154, 24, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                borderWidth: isActive ? 1 : 0,
                borderColor: '#F59A18',
              }}
            >
              <Text style={{
                color: isActive ? '#F59A18' : '#A8A8A8',
                fontWeight: '600',
                fontSize: 13,
                fontFamily: 'Manrope, sans-serif'
              }}>
                {cat}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        onScroll={({ nativeEvent }) => {
          const isCloseToBottom = nativeEvent.layoutMeasurement.height + nativeEvent.contentOffset.y >= nativeEvent.contentSize.height - 100;
          if (isCloseToBottom) {
            handleLoadMore();
          }
        }}
        scrollEventThrottle={400}
        style={{ flex: 1 }}
      >
        {notifications.length === 0 ? (
          <View style={{ flex: 1, height: 300, justifyContent: 'center', alignItems: 'center' }}>
            <Bell size={40} color="rgba(255, 255, 255, 0.15)" style={{ marginBottom: 12 }} />
            <Text style={{ color: '#555555', fontFamily: 'Manrope, sans-serif', fontSize: 14 }}>
              No notifications yet.
            </Text>
          </View>
        ) : (
          notifications.map(item => {
            const isUnread = item.status === 'UNREAD';
            return (
              <View 
                key={item.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  marginBottom: 10,
                  borderRadius: 16,
                  backgroundColor: isUnread ? 'rgba(245, 154, 24, 0.03)' : 'rgba(255, 255, 255, 0.02)',
                  borderWidth: 1,
                  borderColor: isUnread ? 'rgba(245, 154, 24, 0.08)' : 'rgba(255, 255, 255, 0.04)',
                }}
              >
                <View style={{ position: 'relative', marginRight: 12 }}>
                  <Avatar uri={item.sender?.avatarUrl || undefined} size={40} />
                  <View style={{
                    position: 'absolute',
                    bottom: -3,
                    right: -3,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: '#121212',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.08)',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}>
                    {getCategoryIcon(item.type)}
                  </View>
                </View>

                <View style={{ flex: 1, gap: 2 }}>
                  <TouchableOpacity onPress={() => handleMarkRead(item.id)}>
                    <Text style={{ color: '#F5F5F5', fontSize: 13, lineHeight: 18, fontFamily: 'Manrope, sans-serif' }}>
                      {getNotificationText(item).split('**').map((chunk, idx) => (
                        <Text key={idx} style={idx % 2 === 1 ? { fontWeight: 'bold', color: '#ffffff' } : {}}>
                          {chunk}
                        </Text>
                      ))}
                    </Text>
                  </TouchableOpacity>
                  <Text style={{ color: '#777777', fontSize: 11, fontFamily: 'Manrope, sans-serif' }}>
                    {timeAgo(item.createdAt)}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 8 }}>
                  {isUnread && (
                    <TouchableOpacity 
                      onPress={() => handleMarkRead(item.id)}
                      style={{ padding: 4 }}
                    >
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#F59A18' }} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity 
                    onPress={() => handleDelete(item.id)}
                    style={{ padding: 4 }}
                  >
                    <Trash2 size={16} color="#555555" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
        
        {loading && (
          <View style={{ paddingVertical: 16, alignItems: 'center' }}>
            <ActivityIndicator color="#F59A18" />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

export default function App() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [activeTab, setActiveTab] = useState<'feed' | 'search' | 'shorts' | 'messages' | 'profile' | 'live' | 'admin' | 'notifications'>('feed');
  const [selectedCategory, setSelectedCategory] = useState<'For you' | 'Nearby' | 'Vlogs' | 'Vault'>('For you');
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot_password' | 'phone_otp' | 'update_password'>('login');
  const [authError, setAuthError] = useState('');

  // Auth states
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [fullNameInput, setFullNameInput] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [otpTokenInput, setOtpTokenInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [followModalVisible, setFollowModalVisible] = useState(false);
  const [followModalTitle, setFollowModalTitle] = useState<'Followers' | 'Following'>('Followers');
  const [followModalUsers, setFollowModalUsers] = useState<any[]>([]);
  const [isLoadingFollowModal, setIsLoadingFollowModal] = useState(false);

  // Setup Auth state listener on mount for auto login / session persistence
  useEffect(() => {
    const unsubscribe = setupAuthListener();

    // Check if user landed from a password recovery link
    if (window.location.hash.includes('type=recovery') || window.location.hash.includes('access_token')) {
      setAuthMode('update_password');
    }

    return () => {
      unsubscribe();
    };
  }, []);
  // Zustand state refs
  const { user, profile, deviceKeyPair, logout } = useAuthStore();

  const [unreadCounts, setUnreadCounts] = useState({ messages: 0, notifications: 0, communities: 0, requests: 0 });

  const loadUnreadCountsData = async () => {
    try {
      const counts = await fetchUnreadCounts();
      setUnreadCounts(counts);
    } catch {}
  };

  useEffect(() => {
    if (!user) return;
    loadUnreadCountsData();

    let socket: any = null;
    const socketUrl = getBackendServerUrl();
    if (socketUrl) {
      try {
        socket = io(socketUrl, {
          query: { userId: user.id },
          transports: ['websocket'],
          autoConnect: true,
          timeout: 5000,
        });

        socket.on('notification:new', () => {
          loadUnreadCountsData();
        });

        socket.on('notification:read', () => {
          loadUnreadCountsData();
        });

        socket.on('notification:delete', () => {
          loadUnreadCountsData();
        });
      } catch (e) {}
    }

    const interval = setInterval(loadUnreadCountsData, 10000);

    return () => {
      if (socket) socket.disconnect();
      clearInterval(interval);
    };
  }, [user]);

  const fallbackProfile = user ? {
    id: user.id,
    username: user.user_metadata?.username || user.email?.split('@')[0] || 'user',
    display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'User',
    avatar_url: user.user_metadata?.avatar_url || '',
    bio: user.user_metadata?.bio || 'No bio yet.',
    website: user.user_metadata?.website || '',
    followers_count: 0,
    following_count: 0,
  } : null;

  const [posts, setPosts] = useState<any[]>([]);

  // Engagement States
  const [activeCommentsPostId, setActiveCommentsPostId] = useState<string | null>(null);
  const [postCommentsList, setPostCommentsList] = useState<any[]>([]);
  const [commentsSortBy, setCommentsSortBy] = useState<'newest' | 'oldest' | 'top'>('newest');
  const [newCommentInputText, setNewCommentInputText] = useState('');
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [replyingToUsername, setReplyingToUsername] = useState<string | null>(null);
  const [activeSharePostId, setActiveSharePostId] = useState<string | null>(null);
  const [engagementToastMessage, setEngagementToastMessage] = useState('');
  const [engagementToastVisible, setEngagementToastVisible] = useState(false);
  const [notificationsList, setNotificationsList] = useState<any[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Profile View Target
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [targetProfile, setTargetProfile] = useState<any>(null);
  const [targetPosts, setTargetPosts] = useState<any[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);

  // Story Player state
  const [isStoryPlayerVisible, setIsStoryPlayerVisible] = useState(false);
  const [activeStoryAuthorId, setActiveStoryAuthorId] = useState<string | null>(null);


  // Comments state
  const [expandedPostComments, setExpandedPostComments] = useState<Record<string, boolean>>({});
  const [newCommentText, setNewCommentText] = useState<Record<string, string>>({});

  // Chat messaging & Redesigned Inbox UI
  const [chatRooms, setChatRooms] = useState<any[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [inboxSearch, setInboxSearch] = useState('');
  const [inboxSubTab, setInboxSubTab] = useState<'messages' | 'requests'>('messages');
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [newMessageUserSearch, setNewMessageUserSearch] = useState('');


  // Group Chat state hooks
  const [showGroupCreateModal, setShowGroupCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newGroupAvatar, setNewGroupAvatar] = useState('');
  const [newGroupSelectedMembers, setNewGroupSelectedMembers] = useState<string[]>([]);
  const [showGroupSettingsModal, setShowGroupSettingsModal] = useState(false);
  const [groupSettingAddMemberId, setGroupSettingAddMemberId] = useState('');

  // Explore & Search states
  const [exploreCategory, setExploreCategory] = useState('all');
  const [exploreItems, setExploreItems] = useState<any[]>([]);
  const [trendingContent, setTrendingContent] = useState<any>({ hashtags: [], searches: [], creators: [] });
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoadingExplore, setIsLoadingExplore] = useState(false);
  const [searchTabCombinedResults, setSearchTabCombinedResults] = useState<any>({ users: [], communities: [], posts: [], reels: [] });
  const [explorePage, setExplorePage] = useState(0);

  // Offline & Nearby States
  const [isConnected, setIsConnected] = useState(true);
  const [discoveredPeers, setDiscoveredPeers] = useState<Record<string, string>>({}); // peerId -> ip
  const [showHotspotInfo, setShowHotspotInfo] = useState(false);

  // Dynamic suggestions
  const [suggestions, setSuggestions] = useState<any[]>([]);

  // Setup offline nearby discovery, listeners, and advertising when authenticated
  useEffect(() => {
    if (!user) return;

    // Check connectivity on startup
    const checkInitialConnection = async () => {
      const online = await checkIsOnline();
      setIsConnected(online);
    };
    checkInitialConnection();

    // Initialize native custom plugin listeners and servers
    initializeNearbyListeners(user.id);

    // Start advertising and scanning if native Capacitor platform
    if (Capacitor.isNativePlatform()) {
      startNearbyAdvertising(user.id, profile?.username || 'user');
      startNearbyScanning(user.id);
    }

    const handlePeerUpdate = (e: any) => {
      const { peerId, ip } = e.detail;
      setDiscoveredPeers(prev => ({ ...prev, [peerId]: ip }));
    };

    const handleNearbyMsg = async (e: any) => {
      const newMsg = e.detail;
      if (selectedRoom && selectedRoom.id === newMsg.room_id) {
        const dec = await decryptReceivedMessage(newMsg, newMsg.sender_id);
        setMessages(prev => {
          const exists = prev.some(m => m.id === newMsg.id);
          if (exists) return prev;
          return [...prev, { ...newMsg, decrypted: dec }];
        });
      }
    };

    const handleConnUpdate = (e: any) => {
      setIsConnected(e.detail.connected);
    };

    window.addEventListener('nearbyPeerUpdate', handlePeerUpdate);
    window.addEventListener('nearbyMessageReceived', handleNearbyMsg);
    window.addEventListener('connectivityUpdate', handleConnUpdate);

    return () => {
      if (Capacitor.isNativePlatform()) {
        stopNearbyAdvertising();
        stopNearbyScanning();
      }
      window.removeEventListener('nearbyPeerUpdate', handlePeerUpdate);
      window.removeEventListener('nearbyMessageReceived', handleNearbyMsg);
      window.removeEventListener('connectivityUpdate', handleConnUpdate);
    };
  }, [user, profile, selectedRoom?.id]);



  // WebRTC Calling
  const [activeCall, setActiveCall] = useState<any | null>(null);
  const [callSignalLog, setCallSignalLog] = useState<string[]>([]);

  // Streams
  const [isLive, setIsLive] = useState(false);
  const [streamTitle, setStreamTitle] = useState('');
  const [streamComments, setStreamComments] = useState<any[]>([]);
  const [liveCommentInput, setLiveCommentInput] = useState('');
  const [viewerCount, setViewerCount] = useState(0);

  // Moderation
  const [reports, setReports] = useState<any[]>([
    { id: 'rep_1', reporter: 'sophia_code', target: 'Crypto spam bot advertisement', reason: 'Spam/Bots', status: 'pending' }
  ]);

  // Modals
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [postMediaUrl, setPostMediaUrl] = useState('');

  // Edit Profile States
  const [isEditProfileVisible, setIsEditProfileVisible] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editWebsite, setEditWebsite] = useState('');

  const handleOpenEditProfile = () => {
    const current = profile || fallbackProfile;
    setEditDisplayName(current?.display_name || '');
    setEditBio(current?.bio || '');
    setEditWebsite(current?.website || '');
    setIsEditProfileVisible(true);
  };

  const handleSaveProfile = async () => {
    try {
      await updateProfile({
        display_name: editDisplayName,
        bio: editBio,
        website: editWebsite,
      });
      setIsEditProfileVisible(false);
      alert('Profile updated successfully!');
    } catch (e: any) {
      alert(e.message || 'Failed to update profile');
    }
  };

  const handleOpenFollowers = async () => {
    if (!activeProfile) return;
    setFollowModalTitle('Followers');
    setFollowModalVisible(true);
    setIsLoadingFollowModal(true);
    try {
      const followersList = await fetchFollowers(activeProfile.id);
      setFollowModalUsers(followersList);
    } catch (e) {
      console.error('Failed to load followers:', e);
    } finally {
      setIsLoadingFollowModal(false);
    }
  };

  const handleOpenFollowing = async () => {
    if (!activeProfile) return;
    setFollowModalTitle('Following');
    setFollowModalVisible(true);
    setIsLoadingFollowModal(true);
    try {
      const followingList = await fetchFollowing(activeProfile.id);
      setFollowModalUsers(followingList);
    } catch (e) {
      console.error('Failed to load following:', e);
    } finally {
      setIsLoadingFollowModal(false);
    }
  };

  // Handle Auth
  // Handle Auth
  const handleAuth = async () => {
    if (!emailInput || !passwordInput) return;
    setAuthError('');
    try {
      await signInUser(emailInput, passwordInput);
    } catch (e: any) {
      setAuthError(e.message || 'Authentication failed');
    }
  };

  const handleRegister = async () => {
    if (!emailInput || !passwordInput || !usernameInput || !fullNameInput || !birthMonth || !birthDay || !birthYear) {
      setAuthError('All fields are required.');
      return;
    }
    setAuthError('');
    try {
      const formattedMonth = birthMonth.padStart(2, '0');
      const formattedDay = birthDay.padStart(2, '0');
      const birthday = `${birthYear}-${formattedMonth}-${formattedDay}`;

      // Date validation
      const parsedDate = new Date(birthday);
      if (isNaN(parsedDate.getTime())) {
        setAuthError('Please enter a valid birthday.');
        return;
      }

      await signUpUser(emailInput, usernameInput, fullNameInput, birthday, passwordInput);
    } catch (e: any) {
      setAuthError(e.message || 'Registration failed');
    }
  };

  const handleForgotPassword = async () => {
    if (!emailInput) {
      setAuthError('Email address is required.');
      return;
    }
    setAuthError('');
    try {
      await forgotPassword(emailInput, window.location.origin);
      alert('Password reset link has been sent to your email.');
      setAuthMode('login');
    } catch (e: any) {
      setAuthError(e.message || 'Failed to send password reset email.');
    }
  };

  const handleUpdatePassword = async () => {
    if (!passwordInput) {
      setAuthError('New password is required.');
      return;
    }
    setAuthError('');
    try {
      await updatePassword(passwordInput);
      alert('Password updated successfully. Please log in.');
      setAuthMode('login');
      // Clear hash parameters
      window.location.hash = '';
    } catch (e: any) {
      setAuthError(e.message || 'Failed to update password.');
    }
  };

  const handleSendOtp = async () => {
    if (!phoneInput) {
      setAuthError('Phone number is required (e.g. +1234567890).');
      return;
    }
    setAuthError('');
    try {
      await sendPhoneOtp(phoneInput);
      setOtpSent(true);
      alert('OTP code sent to your phone.');
    } catch (e: any) {
      setAuthError(e.message || 'Failed to send OTP.');
    }
  };

  const handleVerifyOtp = async () => {
    if (!phoneInput || !otpTokenInput) {
      setAuthError('Phone number and verification code are required.');
      return;
    }
    setAuthError('');
    try {
      await verifyPhoneOtp(phoneInput, otpTokenInput);
    } catch (e: any) {
      setAuthError(e.message || 'Failed to verify OTP.');
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError('');
    try {
      await signInWithGoogle(window.location.origin);
    } catch (e: any) {
      setAuthError(e.message || 'Google Login failed.');
    }
  };


  // Sync Feed, Rooms, and Suggestions
  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        const feed = await fetchFeed();
        setPosts(feed);

        const rooms = await fetchChatRooms();
        setChatRooms(rooms);

        const profiles = mockDb.getProfiles();
        const filtered = profiles.filter((p: any) => p.id !== user.id).slice(0, 5);
        setSuggestions(filtered);
      } catch (err) {
        console.error('Error loading startup data', err);
      }
    };
    loadData();
  }, [user]);

  // Sync messages in selected room
  useEffect(() => {
    if (!selectedRoom) {
      if (messages.length > 0) {
        setMessages([]);
      }
      return;
    }

    const loadMsgs = async () => {
      try {
        const rawMsgs = await fetchMessages(selectedRoom.id);
        const decrypted = await Promise.all(rawMsgs.map(async (msg: any) => {
          const dec = await decryptReceivedMessage(msg, selectedRoom.peer?.id || msg.sender_id);
          return { ...msg, decrypted: dec };
        }));
        setMessages(decrypted);
      } catch (err) {
        console.error('Error loading messages', err);
      }
    };

    loadMsgs();

    // Setup polling every 3 seconds for local real-time multi-account simulation
    const interval = setInterval(async () => {
      try {
        const rawMsgs = await fetchMessages(selectedRoom.id);
        const hasUndecrypted = messages.some(m => !m.decrypted);
        if (rawMsgs.length !== messages.length || hasUndecrypted) {
          const decrypted = await Promise.all(rawMsgs.map(async (msg: any) => {
            const dec = await decryptReceivedMessage(msg, selectedRoom.peer?.id || msg.sender_id);
            return { ...msg, decrypted: dec };
          }));
          setMessages(decrypted);
        }
      } catch (e) { }
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedRoom, messages]);

  // Sync Target profile info
  useEffect(() => {
    const loadTarget = async () => {
      if (activeTab === 'profile' && activeProfileId && activeProfileId !== user?.id) {
        const prof = await fetchProfile(activeProfileId);
        setTargetProfile(prof);

        const allPosts = mockDb.getPosts();
        setTargetPosts(allPosts.filter((p: any) => p.user_id === activeProfileId));

        const following = user ? await checkIfFollowing(user.id, activeProfileId) : false;
        setIsFollowing(following);
      } else {
        if (targetProfile !== null) setTargetProfile(null);
        if (targetPosts.length > 0) setTargetPosts([]);
      }
    };
    loadTarget();
  }, [activeProfileId, activeTab, user]);

  // Search profiles query
  const handleSearch = async (val: string) => {
    setSearchQuery(val);
    const results = await searchUsers(val);
    // Exclude current logged in user from results
    setSearchResults(results.filter((r: any) => r.id !== user?.id));
  };

  // Explore Feed Handlers
  const loadExploreFeed = async (reset = false) => {
    setIsLoadingExplore(true);
    try {
      const nextPage = reset ? 0 : explorePage + 1;
      const items = await fetchExploreFeed(exploreCategory, nextPage, 12);
      if (reset) {
        setExploreItems(items);
        setExplorePage(0);
      } else {
        setExploreItems(prev => [...prev, ...items]);
        setExplorePage(nextPage);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingExplore(false);
    }
  };

  const loadTrending = async () => {
    try {
      const trending = await fetchTrendingContent();
      setTrendingContent(trending);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSearchInput = async (val: string) => {
    setSearchQuery(val);
    if (val.trim().length === 0) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      setSearchTabCombinedResults({ users: [], communities: [], posts: [], reels: [] });
      return;
    }
    setShowSuggestions(true);
    try {
      const suggestions = await fetchSearchSuggestions(val);
      setSearchSuggestions(suggestions);

      const results = await searchExploreAll(val);
      setSearchTabCombinedResults(results);
    } catch (e) {
      console.error(e);
    }
  };

  const handleExecuteSearch = async (query: string) => {
    if (!query.trim()) return;
    const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('jamsh_recent_searches', JSON.stringify(updated));

    await logSearchQuery(query);
    setShowSuggestions(false);
    setSearchQuery(query);
    
    const results = await searchExploreAll(query);
    setSearchTabCombinedResults(results);
  };

  const handleClearRecent = () => {
    setRecentSearches([]);
    localStorage.removeItem('jamsh_recent_searches');
  };

  const getColumns = () => {
    const columnsCount = isMobile ? 2 : 3;
    const columns: any[][] = Array.from({ length: columnsCount }, () => []);
    exploreItems.forEach((item, index) => {
      columns[index % columnsCount].push(item);
    });
    return columns;
  };

  // Load explore on Search tab load
  useEffect(() => {
    if (activeTab === 'search') {
      loadExploreFeed(true);
      loadTrending();
      const saved = localStorage.getItem('jamsh_recent_searches');
      if (saved) setRecentSearches(JSON.parse(saved));
    }
  }, [activeTab, exploreCategory]);



  // Handle Thunder Reactions
  const handleThunder = async (postId: string) => {
    try {
      const { thundered, countChange } = await toggleThunderReaction(postId);
      setPosts(prev => prev.map((p: any) => {
        if (p.id === postId) {
          return { ...p, thundered_by_me: thundered, thunders_count: Math.max(0, p.thunders_count + countChange) };
        }
        return p;
      }));

      if (targetProfile && activeProfileId) {
        setTargetPosts(prev => prev.map(p => {
          if (p.id === postId) {
            return { ...p, thundered_by_me: thundered, thunders_count: Math.max(0, p.thunders_count + countChange) };
          }
          return p;
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Follow/Unfollow Target Profile
  const handleFollowToggle = async () => {
    if (!targetProfile) return;
    try {
      await followUser(targetProfile.id);
      const prof = await fetchProfile(targetProfile.id);
      setTargetProfile(prof);

      const following = user ? await checkIfFollowing(user.id, targetProfile.id) : false;
      setIsFollowing(following);

      // Refresh current user session stats too
      const myProf = await fetchProfile(user.id);
      useAuthStore.getState().setSession(user, myProf);
    } catch (e) { }
  };

  // Refresh and navigate to own profile tab
  const handleNavigateToOwnProfile = async () => {
    setActiveProfileId(null);
    setActiveTab('profile');
    if (user) {
      try {
        const myProf = await fetchProfile(user.id);
        if (myProf) {
          useAuthStore.getState().setSession(user, myProf);
        }
      } catch (err) {
        console.error('Failed to refresh profile on navigation', err);
      }
    }
  };

  // Refresh and navigate to Messages tab
  const handleNavigateToMessages = async () => {
    setActiveTab('messages');
    try {
      const rooms = await fetchChatRooms();
      setChatRooms(rooms);
      if (rooms.length > 0) {
        const stillExists = selectedRoom ? rooms.some((r: any) => r.id === selectedRoom.id) : false;
        if (!stillExists) {
          if (!isMobile) {
            setSelectedRoom(rooms[0]);
          } else {
            setSelectedRoom(null);
          }
        }
      } else {
        setSelectedRoom(null);
      }
    } catch (err) {
      console.error('Failed to load chat rooms', err);
    }
  };

  // Start chat with user
  const handleStartChat = async (peerId: string) => {
    try {
      const room = await createChatRoom(peerId);
      const rooms = await fetchChatRooms();
      setChatRooms(rooms);
      setSelectedRoom(room);
      setActiveTab('messages');
    } catch (e) { }
  };

  // Submit Comments
  const handleAddComment = (postId: string) => {
    const txt = newCommentText[postId];
    if (!txt || !txt.trim()) return;

    const allPosts = mockDb.getPosts();
    const updated = allPosts.map((p: any) => {
      if (p.id === postId) {
        const comments = p.comments || [];
        return {
          ...p,
          comments_count: p.comments_count + 1,
          comments: [...comments, { id: `c_${Date.now()}`, username: profile?.username || 'me', content: txt.trim() }]
        };
      }
      return p;
    });

    mockDb.setPosts(updated);

    // Reload state
    setPosts(prev => prev.map((p: any) => {
      if (p.id === postId) {
        return {
          ...p,
          comments_count: p.comments_count + 1,
          comments: [...(p.comments || []), { id: `c_${Date.now()}`, username: profile?.username || 'me', content: txt.trim() }]
        };
      }
      return p;
    }));

    if (targetProfile) {
      setTargetPosts(prev => prev.map(p => {
        if (p.id === postId) {
          return {
            ...p,
            comments_count: p.comments_count + 1,
            comments: [...(p.comments || []), { id: `c_${Date.now()}`, username: profile?.username || 'me', content: txt.trim() }]
          };
        }
        return p;
      }));
    }

    setNewCommentText(prev => ({ ...prev, [postId]: '' }));
  };

  // Submit Post
  const handleSubmitPost = async () => {
    if (!postContent.trim() && !postMediaUrl.trim()) return;
    const mediaUrls = postMediaUrl.trim() ? [postMediaUrl.trim()] : [];
    const type = mediaUrls.length > 0 ? 'image' : 'text';

    try {
      const newP = await createPost(postContent, type, mediaUrls);
      setPosts(prev => [newP, ...prev]);
    } catch (e) {
      console.error(e);
    }
    setPostContent('');
    setPostMediaUrl('');
    setIsCreateModalVisible(false);
  };

  // Send E2E message
  const handleSendMessage = async () => {
    if (!msgInput.trim() || !selectedRoom) return;
    const room = selectedRoom;
    const plaintext = msgInput;
    setMsgInput('');

    try {
      const newMsg = await sendEncryptedMessage(room.id, room.type === 'group' ? 'group' : room.peer.id, plaintext);
      setMessages(prev => [...prev, { ...newMsg, decrypted: plaintext }]);
    } catch (e) {
      console.error(e);
    }
  };

  // Group Handlers
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      alert('Group name is required');
      return;
    }
    try {
      const group = await createGroupRoom(
        newGroupName,
        newGroupDescription,
        newGroupAvatar,
        newGroupSelectedMembers
      );
      const rooms = await fetchChatRooms();
      setChatRooms(rooms);
      setSelectedRoom(group);
      setShowGroupCreateModal(false);
      setNewGroupName('');
      setNewGroupDescription('');
      setNewGroupAvatar('');
      setNewGroupSelectedMembers([]);
    } catch (e) {
      alert('Failed to create group');
    }
  };

  const handleAddGroupMember = async () => {
    if (!groupSettingAddMemberId || !selectedRoom) return;
    try {
      await addGroupMembers(selectedRoom.id, [groupSettingAddMemberId]);
      const rooms = await fetchChatRooms();
      setChatRooms(rooms);
      const updated = rooms.find(r => r.id === selectedRoom.id);
      if (updated) setSelectedRoom(updated);
      setGroupSettingAddMemberId('');
      alert('Member added successfully');
    } catch (e) {
      alert('Failed to add member');
    }
  };

  const handleRemoveGroupMember = async (targetUserId: string) => {
    if (!selectedRoom) return;
    try {
      await removeGroupMember(selectedRoom.id, targetUserId);
      const rooms = await fetchChatRooms();
      setChatRooms(rooms);
      const updated = rooms.find(r => r.id === selectedRoom.id);
      if (updated) setSelectedRoom(updated);
      alert('Member removed & E2EE Group key rotated successfully');
    } catch (e) {
      alert('Failed to remove member');
    }
  };

  const handleLeaveGroup = async () => {
    if (!selectedRoom) return;
    try {
      await leaveGroup(selectedRoom.id);
      setSelectedRoom(null);
      const rooms = await fetchChatRooms();
      setChatRooms(rooms);
      setShowGroupSettingsModal(false);
      alert('Left the group successfully');
    } catch (e) {
      alert('Failed to leave group');
    }
  };

  const handleDeleteGroup = async () => {
    if (!selectedRoom) return;
    try {
      await deleteGroup(selectedRoom.id);
      setSelectedRoom(null);
      const rooms = await fetchChatRooms();
      setChatRooms(rooms);
      setShowGroupSettingsModal(false);
      alert('Group deleted successfully');
    } catch (e) {
      alert('Failed to delete group');
    }
  };

  const handlePromoteToAdmin = async (targetUserId: string) => {
    if (!selectedRoom) return;
    try {
      await promoteToAdmin(selectedRoom.id, targetUserId);
      const rooms = await fetchChatRooms();
      setChatRooms(rooms);
      const updated = rooms.find(r => r.id === selectedRoom.id);
      if (updated) setSelectedRoom(updated);
      alert('Promoted to Admin');
    } catch (e) {
      alert('Failed to promote');
    }
  };

  const handleDemoteToAdmin = async (targetUserId: string) => {
    if (!selectedRoom) return;
    try {
      await demoteToAdmin(selectedRoom.id, targetUserId);
      const rooms = await fetchChatRooms();
      setChatRooms(rooms);
      const updated = rooms.find(r => r.id === selectedRoom.id);
      if (updated) setSelectedRoom(updated);
      alert('Demoted to Member');
    } catch (e) {
      alert('Failed to demote');
    }
  };

  // Dial call
  const handleDialCall = (type: 'voice' | 'video') => {
    if (!selectedRoom) return;
    setCallSignalLog(['Initializing WebRTC Handshake...']);
    setActiveCall({ type, peer: selectedRoom.peer, status: 'dialing' });

    setTimeout(() => {
      setCallSignalLog(prev => [...prev, '⚡ Connecting call channel: call_signaling:' + selectedRoom.id]);
    }, 800);
    setTimeout(() => {
      setCallSignalLog(prev => [...prev, '✓ Channel open. Dispatching Local SDP Offer...']);
    }, 1500);
    setTimeout(() => {
      setCallSignalLog(prev => [...prev, '✓ Peer SDP Answer accepted. Syncing encryption keys...']);
    }, 2800);
    setTimeout(() => {
      setCallSignalLog(prev => [...prev, '⚡ Routing ICE Candidates. P2P Tunnel established.']);
    }, 3800);
    setTimeout(() => {
      setCallSignalLog(prev => [...prev, '✓ WebRTC Connection Secured. Session Streaming Active.']);
      setActiveCall((prev: any) => prev ? { ...prev, status: 'connected' } : null);
    }, 4500);
  };

  const handleEndCall = () => {
    setActiveCall(null);
    setCallSignalLog([]);
  };

  // Broadcaster
  const handleGoLive = () => {
    if (isLive) {
      setIsLive(false);
      setViewerCount(0);
      setStreamComments([]);
    } else {
      if (!streamTitle.trim()) return;
      setIsLive(true);
      setViewerCount(1);
      setStreamComments([{ id: 'c1', username: 'sophia_code', content: 'Live streaming securely! ⚡' }]);
    }
  };

  const handleSendLiveComment = () => {
    if (!liveCommentInput.trim()) return;
    setStreamComments(prev => [...prev, {
      id: `lc_${Date.now()}`,
      username: profile?.username || 'me',
      content: liveCommentInput.trim(),
    }]);
    setLiveCommentInput('');
  };

  // Auth screen
  if (!user) {
    return (
      <View style={authStyles.container}>
        <View style={authStyles.card}>
          <JamshLoginHeader />

          {authError ? <Text style={authStyles.errorText}>{authError}</Text> : null}

          {authMode === 'login' && (
            <View style={{ width: '100%' }}>
              <Text style={authStyles.inputLabel}>EMAIL</Text>
              <View style={authStyles.inputContainer}>
                <Mail size={18} color="#737373" style={{ marginRight: 12 }} />
                <TextInput
                  placeholder="you@example.com"
                  placeholderTextColor="#555555"
                  style={authStyles.innerInput}
                  value={emailInput}
                  onChangeText={setEmailInput}
                />
              </View>

              <Text style={authStyles.inputLabel}>PASSWORD</Text>
              <View style={authStyles.inputContainer}>
                <Lock size={18} color="#737373" style={{ marginRight: 12 }} />
                <TextInput
                  placeholder="• • • • • • • •"
                  placeholderTextColor="#555555"
                  secureTextEntry={!showPassword}
                  style={authStyles.innerInput}
                  value={passwordInput}
                  onChangeText={setPasswordInput}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  {showPassword ? (
                    <EyeOff size={18} color="#737373" />
                  ) : (
                    <Eye size={18} color="#737373" />
                  )}
                </TouchableOpacity>
              </View>

              <View style={{ width: '100%', alignItems: 'flex-end', marginTop: -4, marginBottom: 24 }}>
                <TouchableOpacity onPress={() => setAuthMode('forgot_password')}>
                  <Text style={{ color: '#F59A18', fontSize: 13, fontWeight: '700' }}>Forgot password?</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={authStyles.btnGradient} onPress={handleAuth}>
                <Zap size={16} color="#000" fill="#000" style={{ marginRight: 8 }} />
                <Text style={authStyles.btnTextBlack}>Log in</Text>
              </TouchableOpacity>

              <View style={authStyles.dividerRow}>
                <View style={authStyles.dividerLine} />
                <Text style={authStyles.dividerText}>OR</Text>
                <View style={authStyles.dividerLine} />
              </View>

              <TouchableOpacity style={authStyles.googleBtn} onPress={handleGoogleLogin}>
                <View style={{ marginRight: 10 }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="white">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#fff" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" />
                  </svg>
                </View>
                <Text style={authStyles.googleBtnText}>Continue with Google</Text>
              </TouchableOpacity>

              <View style={{ width: '100%', alignItems: 'center', marginTop: 20 }}>
                <TouchableOpacity onPress={() => setAuthMode('signup')} style={authStyles.toggle}>
                  <Text style={authStyles.toggleText}>
                    New to JAMSH? <Text style={{ color: '#F59A18', fontWeight: 'bold' }}>Sign up</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {authMode === 'signup' && (
            <View style={{ width: '100%' }}>
              <Text style={authStyles.inputLabel}>EMAIL</Text>
              <View style={authStyles.inputContainer}>
                <Mail size={18} color="#737373" style={{ marginRight: 12 }} />
                <TextInput
                  placeholder="you@example.com"
                  placeholderTextColor="#555555"
                  style={authStyles.innerInput}
                  value={emailInput}
                  onChangeText={setEmailInput}
                />
              </View>

              <Text style={authStyles.inputLabel}>FULL NAME</Text>
              <View style={authStyles.inputContainer}>
                <User size={18} color="#737373" style={{ marginRight: 12 }} />
                <TextInput
                  placeholder="Full Name"
                  placeholderTextColor="#555555"
                  style={authStyles.innerInput}
                  value={fullNameInput}
                  onChangeText={setFullNameInput}
                />
              </View>

              <Text style={authStyles.inputLabel}>USERNAME</Text>
              <View style={authStyles.inputContainer}>
                <UserPlus size={18} color="#737373" style={{ marginRight: 12 }} />
                <TextInput
                  placeholder="Username"
                  placeholderTextColor="#555555"
                  style={authStyles.innerInput}
                  value={usernameInput}
                  onChangeText={setUsernameInput}
                />
              </View>

              <Text style={authStyles.inputLabel}>BIRTHDAY</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
                <select
                  value={birthMonth}
                  onChange={(e) => setBirthMonth(e.target.value)}
                  style={{
                    flex: 1,
                    height: '48px',
                    backgroundColor: '#0c0c0c',
                    border: '1px solid #202020',
                    borderRadius: '24px',
                    padding: '0 16px',
                    color: birthMonth ? '#fff' : '#555555',
                    fontSize: '14px',
                    marginRight: '8px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="" disabled>Month</option>
                  {Array.from({ length: 12 }, (_, i) => {
                    const val = String(i + 1);
                    const name = new Date(2000, i, 1).toLocaleString('en-US', { month: 'short' });
                    return <option key={val} value={val} style={{ backgroundColor: '#0c0c0c', color: '#fff' }}>{name}</option>;
                  })}
                </select>
                <select
                  value={birthDay}
                  onChange={(e) => setBirthDay(e.target.value)}
                  style={{
                    flex: 1,
                    height: '48px',
                    backgroundColor: '#0c0c0c',
                    border: '1px solid #202020',
                    borderRadius: '24px',
                    padding: '0 16px',
                    color: birthDay ? '#fff' : '#555555',
                    fontSize: '14px',
                    marginRight: '8px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="" disabled>Day</option>
                  {Array.from({ length: 31 }, (_, i) => {
                    const val = String(i + 1);
                    return <option key={val} value={val} style={{ backgroundColor: '#0c0c0c', color: '#fff' }}>{val}</option>;
                  })}
                </select>
                <select
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  style={{
                    flex: 1,
                    height: '48px',
                    backgroundColor: '#0c0c0c',
                    border: '1px solid #202020',
                    borderRadius: '24px',
                    padding: '0 16px',
                    color: birthYear ? '#fff' : '#555555',
                    fontSize: '14px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="" disabled>Year</option>
                  {Array.from({ length: 100 }, (_, i) => {
                    const val = String(new Date().getFullYear() - i);
                    return <option key={val} value={val} style={{ backgroundColor: '#0c0c0c', color: '#fff' }}>{val}</option>;
                  })}
                </select>
              </View>

              <Text style={authStyles.inputLabel}>PASSWORD</Text>
              <View style={authStyles.inputContainer}>
                <Lock size={18} color="#737373" style={{ marginRight: 12 }} />
                <TextInput
                  placeholder="Password (Min 8 characters)"
                  placeholderTextColor="#555555"
                  secureTextEntry={!showPassword}
                  style={authStyles.innerInput}
                  value={passwordInput}
                  onChangeText={setPasswordInput}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  {showPassword ? (
                    <EyeOff size={18} color="#737373" />
                  ) : (
                    <Eye size={18} color="#737373" />
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={authStyles.btnGradient} onPress={handleRegister}>
                <Text style={authStyles.btnTextBlack}>Sign up</Text>
              </TouchableOpacity>
              <View style={{ width: '100%', alignItems: 'center', marginTop: 12 }}>
                <TouchableOpacity onPress={() => setAuthMode('login')} style={authStyles.toggle}>
                  <Text style={authStyles.toggleText}>
                    Have an account? <Text style={{ color: '#F59A18', fontWeight: 'bold' }}>Log in</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {authMode === 'forgot_password' && (
            <View style={{ width: '100%' }}>
              <Text style={{ color: '#A8A8A8', fontSize: 13, marginBottom: 20, textAlign: 'center', lineHeight: 18 }}>
                Enter your email address and we'll send you a link to reset your password.
              </Text>
              <Text style={authStyles.inputLabel}>EMAIL</Text>
              <View style={authStyles.inputContainer}>
                <Mail size={18} color="#737373" style={{ marginRight: 12 }} />
                <TextInput
                  placeholder="Email Address"
                  placeholderTextColor="#555555"
                  style={authStyles.innerInput}
                  value={emailInput}
                  onChangeText={setEmailInput}
                />
              </View>
              <TouchableOpacity style={authStyles.btnGradient} onPress={handleForgotPassword}>
                <Text style={authStyles.btnTextBlack}>Send Reset Link</Text>
              </TouchableOpacity>
              <View style={{ width: '100%', alignItems: 'center', marginTop: 12 }}>
                <TouchableOpacity onPress={() => setAuthMode('login')} style={authStyles.toggle}>
                  <Text style={authStyles.toggleText}>
                    Back to <Text style={{ color: '#F59A18', fontWeight: 'bold' }}>Log in</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {authMode === 'update_password' && (
            <View style={{ width: '100%' }}>
              <Text style={{ color: '#A8A8A8', fontSize: 13, marginBottom: 20, textAlign: 'center', lineHeight: 18 }}>
                Create a new secure password for your account.
              </Text>
              <Text style={authStyles.inputLabel}>NEW PASSWORD</Text>
              <View style={authStyles.inputContainer}>
                <Lock size={18} color="#737373" style={{ marginRight: 12 }} />
                <TextInput
                  placeholder="New Password (Min 8 characters)"
                  placeholderTextColor="#555555"
                  secureTextEntry={!showPassword}
                  style={authStyles.innerInput}
                  value={passwordInput}
                  onChangeText={setPasswordInput}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  {showPassword ? (
                    <EyeOff size={18} color="#737373" />
                  ) : (
                    <Eye size={18} color="#737373" />
                  )}
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={authStyles.btnGradient} onPress={handleUpdatePassword}>
                <Text style={authStyles.btnTextBlack}>Update Password</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  }

  // Active user data
  const activeProfile = targetProfile || profile || fallbackProfile;
  const isTargetMode = targetProfile !== null;

  return (
    <SafeAreaView style={[styles.container, isMobile && { flexDirection: 'column' }]}>
      {isMobile && (
        <View style={{
          height: 60,
          width: '100%',
          backgroundColor: '#000000',
          borderBottomWidth: 0.5,
          borderBottomColor: 'rgba(255, 255, 255, 0.08)',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          zIndex: 200,
        }}>
          {/* Left section: Logo & App name */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              borderWidth: 1.5,
              borderColor: '#F59A18',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: '#121212',
              shadowColor: '#F59A18',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.3,
              shadowRadius: 4,
            } as any}>
              <Zap size={16} color="#F59A18" fill="#F59A18" />
            </View>
            <View style={{ flexDirection: 'column' }}>
              <Text style={{
                color: '#F5F5F5',
                fontFamily: 'Sora, sans-serif',
                fontSize: 18,
                fontWeight: '800',
                letterSpacing: 0.5,
                lineHeight: 20,
              }}>
                JAMSH
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
                <Shield size={10} color="#F59A18" />
                <Text style={{
                  color: '#A8A8A8',
                  fontFamily: 'Manrope, sans-serif',
                  fontSize: 10,
                  marginLeft: 3,
                }}>
                  End-to-end encrypted
                </Text>
              </View>
            </View>
          </View>

          {/* Right section: Notifications & Add button */}
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            <TouchableOpacity 
              style={{ position: 'relative', padding: 4 }}
              onPress={() => setActiveTab('notifications')}
            >
              <Bell size={22} color="#F5F5F5" />
              {unreadCounts.notifications > 0 && (
                <View style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: '#F59A18',
                  borderWidth: 1,
                  borderColor: '#000000',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                  <Text style={{ color: '#000000', fontSize: 8, fontWeight: 'bold', fontFamily: 'Manrope, sans-serif' }}>
                    {unreadCounts.notifications}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {activeTab === 'profile' ? (
              <TouchableOpacity 
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: '#E11D48',
                  backgroundImage: 'linear-gradient(135deg, #F43F5E 0%, #BE123C 100%)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  shadowColor: '#E11D48',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.4,
                  shadowRadius: 6,
                } as any}
                onPress={logout}
              >
                <LogOut size={18} color="#FFFFFF" strokeWidth={2.5} style={{ marginLeft: 2 }} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: '#F59A18',
                  backgroundImage: 'linear-gradient(135deg, #F59A18 0%, #D47A0E 100%)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  shadowColor: '#F59A18',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.4,
                  shadowRadius: 6,
                } as any}
                onPress={() => setIsCreateModalVisible(true)}
              >
                <Plus size={20} color="#000000" strokeWidth={3} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* NAVIGATION SIDEBAR / BOTTOM BAR */}
      <View style={[
        sidebarStyles.container,
        isMobile && {
          width: width - 24,
          height: 60,
          flexDirection: 'row',
          borderRightWidth: 0,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.08)',
          paddingVertical: 0,
          paddingHorizontal: 16,
          justifyContent: 'space-around',
          alignItems: 'center',
          position: 'absolute',
          bottom: 12,
          left: 12,
          right: 12,
          backgroundColor: 'rgba(10, 10, 10, 0.85)',
          borderRadius: 30,
          zIndex: 1000,
          backdropFilter: 'blur(20px)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 10,
        } as any
      ]}>
        {!isMobile && (
          <View style={{ gap: 24, width: '100%' }}>
            <View style={sidebarStyles.top}>
              <JamshLogo />
            </View>

            <View style={sidebarStyles.menu}>
              <TouchableOpacity style={[sidebarStyles.item, activeTab === 'feed' && sidebarStyles.itemActive]} onPress={() => { setActiveTab('feed'); setActiveProfileId(null); }}>
                <Home size={24} color={instagramTheme.colors.text} />
                <Text style={sidebarStyles.itemLabel}>Home</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[sidebarStyles.item, activeTab === 'search' && sidebarStyles.itemActive]} onPress={() => setActiveTab('search')}>
                <Search size={24} color={instagramTheme.colors.text} />
                <Text style={sidebarStyles.itemLabel}>Search</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[sidebarStyles.item, activeTab === 'shorts' && sidebarStyles.itemActive]} onPress={() => setActiveTab('shorts')}>
                <Film size={24} color={instagramTheme.colors.text} />
                <Text style={sidebarStyles.itemLabel}>Reels</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[sidebarStyles.item, activeTab === 'messages' && sidebarStyles.itemActive]} onPress={handleNavigateToMessages}>
                <MessageSquare size={24} color={instagramTheme.colors.text} />
                <Text style={sidebarStyles.itemLabel}>Messages</Text>
                <View style={sidebarStyles.badge}><Text style={sidebarStyles.badgeText}>{chatRooms.length || 1}</Text></View>
              </TouchableOpacity>

              <TouchableOpacity style={[sidebarStyles.item, activeTab === 'live' && sidebarStyles.itemActive]} onPress={() => setActiveTab('live')}>
                <Video size={24} color={instagramTheme.colors.text} />
                <Text style={sidebarStyles.itemLabel}>Go Live</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[sidebarStyles.item, activeTab === 'profile' && !isTargetMode && sidebarStyles.itemActive]} onPress={handleNavigateToOwnProfile}>
                <Avatar uri={(profile || fallbackProfile)?.avatar_url} size={24} style={sidebarStyles.profilePic} />
                <Text style={sidebarStyles.itemLabel}>Profile</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[sidebarStyles.item, activeTab === 'admin' && sidebarStyles.itemActive]} onPress={() => setActiveTab('admin')}>
                <Shield size={24} color={instagramTheme.colors.text} />
                <Text style={sidebarStyles.itemLabel}>Moderation</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isMobile && (
          <View style={{
            flexDirection: 'row',
            width: '100%',
            justifyContent: 'space-around',
            alignItems: 'center',
            backgroundColor: '#121212',
            height: 60,
            borderRadius: 30,
            paddingHorizontal: 8,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.08)',
          }}>
            <TouchableOpacity onPress={() => { setActiveTab('feed'); setActiveProfileId(null); }}>
              {activeTab === 'feed' ? (
                <View style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: '#F59A18',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                  <Zap size={20} color="#000000" fill="#000000" />
                </View>
              ) : (
                <Zap size={22} color="#A8A8A8" />
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setActiveTab('search')}>
              {activeTab === 'search' ? (
                <View style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: '#F59A18',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                  <Search size={20} color="#000000" />
                </View>
              ) : (
                <Search size={22} color="#A8A8A8" />
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setActiveTab('shorts')}>
              {activeTab === 'shorts' ? (
                <View style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: '#F59A18',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                  <Film size={20} color="#000000" />
                </View>
              ) : (
                <Film size={22} color="#A8A8A8" />
              )}
            </TouchableOpacity>

            <TouchableOpacity style={{ position: 'relative' }} onPress={handleNavigateToMessages}>
              {activeTab === 'messages' ? (
                <View style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: '#F59A18',
                  justifyContent: 'center',
                  alignItems: 'center',
                  shadowColor: '#F59A18',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.5,
                  shadowRadius: 8,
                }}>
                  <MessageSquare size={20} color="#000000" fill="#000000" />
                </View>
              ) : (
                <MessageSquare size={22} color="#A8A8A8" />
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleNavigateToOwnProfile}>
              {activeTab === 'profile' ? (
                <View style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: '#F59A18',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                  <User size={20} color="#000000" />
                </View>
              ) : (
                <User size={22} color="#A8A8A8" />
              )}
            </TouchableOpacity>
          </View>
        )}


        {!isMobile && (
          <View style={{ gap: 8, width: '100%' }}>
            <TouchableOpacity style={sidebarStyles.logout} onPress={logout}>
              <LogOut size={22} color={instagramTheme.colors.textSecondary} />
              <Text style={sidebarStyles.logoutLabel}>Log out</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* MAIN VIEW AREA */}
      <View style={[styles.main, isMobile && { paddingBottom: 80 }]}>

        {/* NOTIFICATIONS TAB */}
        {activeTab === 'notifications' && (
          <NotificationsCenter />
        )}

        {/* FEED TAB */}
        {activeTab === 'feed' && (
          <View style={[styles.feedWrapper, isMobile && { flexDirection: 'column' }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[feedStyles.scroll, isMobile && { width: width, paddingLeft: 0, paddingRight: 0, paddingBottom: 64, alignItems: 'center' }]} style={{ height: '100%', flex: 1 }}>

              {/* Category Pills Filters (Mobile Only) */}
              {isMobile && (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false} 
                  contentContainerStyle={{
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    gap: 8,
                  }}
                  style={{ width: '100%', flexGrow: 0 }}
                >
                  {(['For you', 'Nearby', 'Vlogs', 'Vault'] as const).map((cat) => {
                    const isSelected = selectedCategory === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        onPress={() => setSelectedCategory(cat)}
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 8,
                          borderRadius: 20,
                          backgroundColor: isSelected ? '#F59A18' : 'rgba(255, 255, 255, 0.05)',
                          borderWidth: isSelected ? 0 : 1,
                          borderColor: 'rgba(255, 255, 255, 0.1)',
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{
                          color: isSelected ? '#000000' : '#A8A8A8',
                          fontFamily: 'Manrope, sans-serif',
                          fontSize: 13,
                          fontWeight: '600',
                        }}>
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {/* Production Instagram-style Story Tray */}
              <StoryTray
                currentUserId={user?.id}
                onSelectUserStory={(authorId) => {
                  setActiveStoryAuthorId(authorId);
                  setIsStoryPlayerVisible(true);
                }}
                onCreateStory={() => setIsCreateModalVisible(true)}
              />


              {/* Feed posts list */}
              {posts.map(post => {
                if (isMobile) {
                  return (
                    <View 
                      key={post.id} 
                      style={{
                        width: width - 24,
                        backgroundColor: '#121212',
                        borderRadius: 24,
                        borderWidth: 1,
                        borderColor: 'rgba(255, 255, 255, 0.06)',
                        padding: 12,
                        marginBottom: 16,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.3,
                        shadowRadius: 8,
                      }}
                    >
                      {/* Header */}
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 12,
                      }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <TouchableOpacity onPress={() => { setActiveProfileId(post.user_id); setActiveTab('profile'); }}>
                            <Avatar uri={post.user?.avatar_url} size={36} />
                          </TouchableOpacity>
                          <View style={{ marginLeft: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <TouchableOpacity onPress={() => { setActiveProfileId(post.user_id); setActiveTab('profile'); }}>
                                <Text style={{
                                  color: '#F5F5F5',
                                  fontFamily: 'Sora, sans-serif',
                                  fontWeight: '600',
                                  fontSize: 14,
                                }}>
                                  {post.user?.username || 'user'}
                                </Text>
                              </TouchableOpacity>
                              {post.user?.is_verified && (
                                <CheckCircle size={14} color="#0095F6" style={{ marginLeft: 4 }} />
                              )}
                            </View>
                            <Text style={{
                              color: '#A8A8A8',
                              fontFamily: 'Manrope, sans-serif',
                              fontSize: 11,
                              marginTop: 1,
                            }}>
                              @{post.user?.username || 'user'}.eth
                            </Text>
                          </View>
                        </View>

                        {/* Lock / Time Badge */}
                        <View style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          backgroundColor: 'rgba(255, 255, 255, 0.06)',
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 12,
                        }}>
                          <Lock size={10} color="#F59A18" />
                          <Text style={{
                            color: '#A8A8A8',
                            fontFamily: 'Manrope, sans-serif',
                            fontSize: 11,
                          }}>
                            {timeAgo(post.created_at)}
                          </Text>
                        </View>
                      </View>

                      {/* Post media / content box with floating overlay actions */}
                      <View style={{ position: 'relative', width: '100%', borderRadius: 16, overflow: 'hidden' }}>
                        {post.media && post.media.length > 0 ? (
                          <Image 
                            source={{ uri: post.media[0].media_url }} 
                            style={{ width: '100%', aspectRatio: 1, backgroundColor: '#050505' }} 
                            resizeMode="cover" 
                          />
                        ) : (
                          <View style={{
                            width: '100%',
                            aspectRatio: 1.2,
                            backgroundColor: '#1a1a1a',
                            justifyContent: 'center',
                            alignItems: 'center',
                            padding: 20,
                          }}>
                            <Text style={{
                              color: '#F5F5F5',
                              fontFamily: 'Manrope, sans-serif',
                              fontSize: 15,
                              lineHeight: 22,
                              textAlign: 'center',
                            }}>
                              {post.content}
                            </Text>
                          </View>
                        )}

                        {/* Floating Vertical Actions Bar */}
                        <View style={{
                          position: 'absolute',
                          right: 12,
                          bottom: 12,
                          backgroundColor: 'rgba(0, 0, 0, 0.55)',
                          borderRadius: 20,
                          paddingVertical: 12,
                          paddingHorizontal: 8,
                          gap: 12,
                          alignItems: 'center',
                          borderWidth: 1,
                          borderColor: 'rgba(255, 255, 255, 0.08)',
                          backdropFilter: 'blur(8px)',
                        } as any}>
                          {/* Lightning Reaction */}
                          <TouchableOpacity 
                            onPress={() => handleThunder(post.id)}
                            style={{ alignItems: 'center' }}
                          >
                            <Zap 
                              size={20} 
                              color={post.thundered_by_me ? '#F59A18' : '#F5F5F5'} 
                              fill={post.thundered_by_me ? '#F59A18' : 'none'} 
                            />
                            <Text style={{
                              color: '#F5F5F5',
                              fontSize: 10,
                              fontWeight: '600',
                              marginTop: 2,
                              fontFamily: 'Manrope, sans-serif',
                            }}>
                              {post.thunders_count || 0}
                            </Text>
                          </TouchableOpacity>

                          {/* Comments Trigger */}
                          <TouchableOpacity 
                            onPress={() => setExpandedPostComments(prev => ({ ...prev, [post.id]: !prev[post.id] }))}
                            style={{ alignItems: 'center' }}
                          >
                            <MessageSquare size={20} color="#F5F5F5" />
                            <Text style={{
                              color: '#F5F5F5',
                              fontSize: 10,
                              fontWeight: '600',
                              marginTop: 2,
                              fontFamily: 'Manrope, sans-serif',
                            }}>
                              {post.comments?.length || 0}
                            </Text>
                          </TouchableOpacity>

                          {/* Send/Share Chat */}
                          <TouchableOpacity onPress={() => handleStartChat(post.user_id)}>
                            <Send size={20} color="#F5F5F5" />
                          </TouchableOpacity>

                          {/* Bookmark */}
                          <TouchableOpacity>
                            <Bookmark size={20} color="#F5F5F5" />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Post Caption (Inside Card) */}
                      {post.content && post.media && post.media.length > 0 && (
                        <View style={{ marginTop: 10, paddingHorizontal: 4 }}>
                          <Text style={{
                            color: '#E5E5E5',
                            fontFamily: 'Manrope, sans-serif',
                            fontSize: 13,
                            lineHeight: 18,
                          }}>
                            <Text 
                              style={{ fontWeight: '700', color: '#F5F5F5', fontFamily: 'Sora, sans-serif' }}
                              onPress={() => { setActiveProfileId(post.user_id); setActiveTab('profile'); }}
                            >
                              {post.user?.username || 'user'}{' '}
                            </Text>
                            {post.content}
                          </Text>
                        </View>
                      )}

                      {/* Comments Drawer (Visible only if comments are expanded) */}
                      {expandedPostComments[post.id] && (
                        <View style={{
                          marginTop: 12,
                          borderTopWidth: 0.5,
                          borderTopColor: 'rgba(255, 255, 255, 0.08)',
                          paddingTop: 8,
                        }}>
                          {post.comments && post.comments.length > 0 ? (
                            post.comments.map((c: any) => (
                              <View key={c.id} style={{ flexDirection: 'row', marginVertical: 3 }}>
                                <Text style={{ color: '#E5E5E5', fontSize: 13, fontFamily: 'Manrope, sans-serif' }}>
                                  <Text 
                                    style={{ fontWeight: '700', color: '#F5F5F5' }}
                                    onPress={() => {
                                      const found = mockDb.getProfiles().find((p: any) => p.username === c.username);
                                      if (found) { setActiveProfileId(found.id); setActiveTab('profile'); }
                                    }}
                                  >
                                    {c.username}{' '}
                                  </Text>
                                  {c.content}
                                </Text>
                              </View>
                            ))
                          ) : (
                            <Text style={{ color: '#A8A8A8', fontSize: 12, fontFamily: 'Manrope, sans-serif', paddingVertical: 4 }}>
                              No comments yet.
                            </Text>
                          )}

                          {/* Add Inline Comment field inside Drawer */}
                          <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginTop: 8,
                            backgroundColor: 'rgba(255, 255, 255, 0.04)',
                            borderRadius: 12,
                            paddingHorizontal: 8,
                            height: 36,
                          }}>
                            <TextInput
                              placeholder="Add a comment..."
                              placeholderTextColor="#A8A8A8"
                              style={{
                                flex: 1,
                                color: '#fff',
                                fontSize: 12,
                                backgroundColor: 'transparent',
                                borderStyle: 'none' as any,
                                borderWidth: 0,
                                paddingVertical: 4,
                                outlineWidth: 0,
                              } as any}
                              value={newCommentText[post.id] || ''}
                              onChangeText={(val: string) => setNewCommentText(prev => ({ ...prev, [post.id]: val }))}
                            />
                            <TouchableOpacity 
                              onPress={() => handleAddComment(post.id)} 
                              disabled={!(newCommentText[post.id] || '').trim()}
                            >
                              <Text style={{
                                color: '#F59A18',
                                fontWeight: '700',
                                fontSize: 12,
                                opacity: (newCommentText[post.id] || '').trim() ? 1 : 0.4,
                              }}>
                                Post
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                }

                // Desktop Post Layout
                return (
                  <View key={post.id} style={[postStyles.card, isMobile && { width: width, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: instagramTheme.colors.border, marginBottom: 20 }]}>
                    {/* Header */}
                    <View style={postStyles.header}>
                      <TouchableOpacity onPress={() => { setActiveProfileId(post.user_id); setActiveTab('profile'); }}>
                        <Avatar uri={post.user?.avatar_url} size={32} style={postStyles.avatar} />
                      </TouchableOpacity>
                      <View style={postStyles.userInfo}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <TouchableOpacity onPress={() => { setActiveProfileId(post.user_id); setActiveTab('profile'); }}>
                            <Text style={postStyles.username}>{post.user?.username || 'user'}</Text>
                          </TouchableOpacity>
                          {post.user?.is_verified && (
                            <CheckCircle size={14} color={instagramTheme.colors.blue} style={{ marginLeft: 4 }} />
                          )}
                        </View>
                        <Text style={postStyles.location}>Location hidden</Text>
                      </View>
                      <TouchableOpacity style={{ padding: 4 }}><MoreHorizontal size={20} color={instagramTheme.colors.text} /></TouchableOpacity>
                    </View>

                    {/* Post Image */}
                    {post.media && post.media.length > 0 ? (
                      <Image source={{ uri: post.media[0].media_url }} style={postStyles.media} resizeMode="cover" />
                    ) : (
                      <View style={postStyles.textContainer}>
                        <Text style={postStyles.textPostContent}>{post.content}</Text>
                      </View>
                    )}

                    {/* Actions Bar */}
                    <View style={postStyles.actionBar}>
                      <View style={postStyles.actionBarLeft}>
                        <TouchableOpacity onPress={() => handleThunder(post.id)} style={{ marginRight: 16 }}>
                          <Text style={{ fontSize: 24, textShadowRadius: post.thundered_by_me ? 6 : 0, textShadowColor: instagramTheme.colors.orange }}>
                            {post.thundered_by_me ? '⚡' : '⚡'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={{ marginRight: 16 }} onPress={() => setExpandedPostComments(prev => ({ ...prev, [post.id]: !prev[post.id] }))}>
                          <MessageSquare size={22} color={instagramTheme.colors.text} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleStartChat(post.user_id)}><Send size={22} color={instagramTheme.colors.text} /></TouchableOpacity>
                      </View>
                      <TouchableOpacity><Bookmark size={22} color={instagramTheme.colors.text} /></TouchableOpacity>
                    </View>

                    {/* Thunders Count */}
                    <Text style={postStyles.thundersText}>
                      {formatThunderCount(post.thunders_count)} {post.thunders_count === 1 ? 'Thunder' : 'Thunders'}
                    </Text>

                    {/* Caption */}
                    {post.content && post.media && post.media.length > 0 && (
                      <View style={postStyles.captionContainer}>
                        <Text style={postStyles.captionText}>
                          <Text style={postStyles.captionUser} onPress={() => { setActiveProfileId(post.user_id); setActiveTab('profile'); }}>{post.user?.username || 'user'} </Text>
                          {post.content}
                        </Text>
                      </View>
                    )}

                    {/* Time ago */}
                    <Text style={postStyles.timeText}>{timeAgo(post.created_at)}</Text>

                    {/* Comments Block */}
                    <View style={postStyles.commentsBlock}>
                      {post.comments && post.comments.length > 0 && (
                        <TouchableOpacity onPress={() => setExpandedPostComments(prev => ({ ...prev, [post.id]: !prev[post.id] }))}>
                          <Text style={postStyles.viewAllText}>
                            {expandedPostComments[post.id] ? 'Hide comments' : `View all ${post.comments.length} comments`}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {expandedPostComments[post.id] && post.comments && post.comments.map((c: any) => (
                        <View key={c.id} style={postStyles.commentLine}>
                          <Text style={postStyles.commentText}>
                            <Text style={postStyles.commentUser} onPress={() => {
                              const found = mockDb.getProfiles().find((p: any) => p.username === c.username);
                              if (found) { setActiveProfileId(found.id); setActiveTab('profile'); }
                            }}>{c.username} </Text>
                            {c.content}
                          </Text>
                        </View>
                      ))}
                    </View>

                    {/* Add inline comment field */}
                    <View style={postStyles.addCommentRow}>
                      <Smile size={20} color={instagramTheme.colors.textSecondary} style={{ marginRight: 12 }} />
                      <TextInput
                        placeholder="Add a comment..."
                        placeholderTextColor={instagramTheme.colors.textSecondary}
                        style={postStyles.commentInput}
                        value={newCommentText[post.id] || ''}
                        onChangeText={(val: string) => setNewCommentText(prev => ({ ...prev, [post.id]: val }))}
                      />
                      <TouchableOpacity onPress={() => handleAddComment(post.id)} disabled={!(newCommentText[post.id] || '').trim()}>
                        <Text style={[postStyles.postCommentBtn, !(newCommentText[post.id] || '').trim() && { opacity: 0.4 }]}>Post</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              {posts.length === 0 && (
                <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                  <Text style={{ color: instagramTheme.colors.textSecondary }}>No posts on the feed yet. Create one or follow other profiles!</Text>
                </View>
              )}
            </ScrollView>

            {/* RIGHT SUGGESTION PANEL */}
            {!isMobile && (
              <View style={rightSidebarStyles.container}>
                {/* Current active user profile */}
                <View style={rightSidebarStyles.userRow}>
                  <Avatar uri={(profile || fallbackProfile)?.avatar_url} size={56} style={rightSidebarStyles.avatarLarge} />
                  <View style={rightSidebarStyles.userInfo}>
                    <Text style={rightSidebarStyles.username}>{(profile || fallbackProfile)?.username || 'zack_thunder'}</Text>
                    <Text style={rightSidebarStyles.display}>{(profile || fallbackProfile)?.display_name || 'Zack Thunder'}</Text>
                  </View>
                  <TouchableOpacity onPress={handleNavigateToOwnProfile}><Text style={rightSidebarStyles.actionLink}>View</Text></TouchableOpacity>
                </View>

                {/* Suggestions header */}
                <View style={rightSidebarStyles.suggestHeader}>
                  <Text style={rightSidebarStyles.suggestTitle}>Suggestions for you</Text>
                  <TouchableOpacity><Text style={rightSidebarStyles.seeAll}>See All</Text></TouchableOpacity>
                </View>

                {/* Dynamic suggestion list */}
                {suggestions.map(suggest => (
                  <View key={suggest.id} style={rightSidebarStyles.suggestRow}>
                    <TouchableOpacity onPress={() => { setActiveProfileId(suggest.id); setActiveTab('profile'); }}>
                      <Avatar uri={suggest.avatar_url} size={32} style={rightSidebarStyles.avatarSmall} />
                    </TouchableOpacity>
                    <View style={rightSidebarStyles.userInfo}>
                      <TouchableOpacity onPress={() => { setActiveProfileId(suggest.id); setActiveTab('profile'); }}>
                        <Text style={rightSidebarStyles.suggestUser}>{suggest.username}</Text>
                      </TouchableOpacity>
                      <Text style={rightSidebarStyles.suggestRelation} numberOfLines={1}>Recommended for you ⚡</Text>
                    </View>
                    <TouchableOpacity onPress={() => { setActiveProfileId(suggest.id); setActiveTab('profile'); }}>
                      <Text style={rightSidebarStyles.actionLink}>View Profile</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {/* Suggestions footer */}
                <Text style={rightSidebarStyles.footerText}>
                  About • Help • Press • API • Jobs • Privacy • Terms • Locations • Language • JAMSH Verified
                </Text>
                <Text style={rightSidebarStyles.copyright}>
                  © 2026 JAMSH FROM META
                </Text>
              </View>
            )}
          </View>
        )}

        {/* SEARCH & EXPLORE TAB */}
        {activeTab === 'search' && (
          <View style={[searchStyles.container, isMobile && { padding: 12 }]}>
            {/* STICKY SEARCH BAR */}
            <View style={{ position: 'relative', zIndex: 100 }}>
              <TextInput
                placeholder="Type username or display name..."
                placeholderTextColor={instagramTheme.colors.textSecondary}
                style={[
                  searchStyles.searchInput,
                  showSuggestions && { borderColor: instagramTheme.colors.orange, borderWidth: 1.5 }
                ]}
                value={searchQuery}
                onChangeText={handleSearchInput}
                onSubmitEditing={() => handleExecuteSearch(searchQuery)}
                onFocus={() => setShowSuggestions(true)}
              />

              {/* SEARCH SUGGESTIONS & RECENT OVERLAY */}
              {showSuggestions && searchQuery.trim().length === 0 && (
                <View style={{
                  position: 'absolute',
                  top: 50,
                  left: 0,
                  right: 0,
                  backgroundColor: '#121212',
                  borderWidth: 1,
                  borderColor: '#262626',
                  borderRadius: 12,
                  padding: 16,
                  maxHeight: 350,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.5,
                  shadowRadius: 10,
                  zIndex: 200
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={{ color: '#8e8e93', fontSize: 12, fontWeight: 'bold' }}>RECENT SEARCHES</Text>
                    {recentSearches.length > 0 && (
                      <TouchableOpacity onPress={handleClearRecent}>
                        <Text style={{ color: instagramTheme.colors.orange, fontSize: 11, fontWeight: 'bold' }}>Clear All</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {recentSearches.map((term, index) => (
                    <TouchableOpacity
                      key={index}
                      onPress={() => handleExecuteSearch(term)}
                      style={{ paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#262626' }}
                    >
                      <Text style={{ color: '#fff', fontSize: 13 }}>🕒 {term}</Text>
                    </TouchableOpacity>
                  ))}

                  {recentSearches.length === 0 && (
                    <Text style={{ color: '#8e8e93', fontSize: 12, fontStyle: 'italic', marginBottom: 16 }}>No recent searches</Text>
                  )}

                  <TouchableOpacity
                    onPress={() => setShowSuggestions(false)}
                    style={{
                      marginTop: 16,
                      backgroundColor: '#262626',
                      padding: 8,
                      borderRadius: 6,
                      alignItems: 'center'
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>Close Overlay</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* DEFAULT EXPLORE GRID OR SEARCH RESULTS */}
            {searchQuery.trim().length === 0 ? (
              <ScrollView style={{ flex: 1, marginTop: 16 }} showsVerticalScrollIndicator={false}>
                {/* HORIZONTAL CATEGORIES FILTER CHIPS */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingVertical: 8, maxHeight: 50 }}>
                  {[
                    'All', 'Reels', 'Photos', 'Videos', 'AI Picks', 'Nearby',
                    'Technology', 'Travel', 'Fitness', 'Gaming', 'Music', 'Fashion', 'Food'
                  ].map(cat => {
                    const isActive = exploreCategory === cat.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={cat}
                        onPress={() => setExploreCategory(cat.toLowerCase())}
                        style={[
                          {
                            paddingHorizontal: 16,
                            paddingVertical: 8,
                            borderRadius: 20,
                            borderWidth: 1,
                            borderColor: '#262626',
                            marginRight: 8,
                            backgroundColor: '#121212',
                            height: 34,
                            justifyContent: 'center'
                          },
                          isActive && {
                            backgroundColor: '#D4AF37', // Gold highlight
                            borderColor: '#D4AF37'
                          }
                        ]}
                      >
                        <Text style={[
                          { color: '#8e8e93', fontSize: 12, fontWeight: 'bold' },
                          isActive && { color: '#000' }
                        ]}>
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* SKELETON LOADER CELLS */}
                {isLoadingExplore && exploreItems.length === 0 ? (
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                    {[1, 2, 3].map(col => (
                      <View key={col} style={{ flex: 1, gap: 12 }}>
                        {[1, 2, 3].map(row => (
                          <View
                            key={row}
                            style={{
                              height: row === 1 ? 180 : 120,
                              backgroundColor: '#1C1C1E',
                              borderRadius: 12,
                              borderWidth: 1,
                              borderColor: '#2C2C2E'
                            }}
                          />
                        ))}
                      </View>
                    ))}
                  </View>
                ) : (
                  /* MASONRY COLUMNS LAYOUT */
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 16, width: '100%' }}>
                    {getColumns().map((colItems, colIdx) => (
                      <View key={colIdx} style={{ flex: 1, gap: 12 }}>
                        {colItems.map((item: any) => {
                          const isVideo = item.type === 'video';
                          return (
                            <TouchableOpacity
                              key={item.id}
                              style={{
                                backgroundColor: '#121212',
                                borderRadius: 12,
                                overflow: 'hidden',
                                borderWidth: 1,
                                borderColor: '#262626',
                                position: 'relative'
                              }}
                              onPress={() => {
                                setActiveProfileId(item.userId);
                                setActiveTab('profile');
                              }}
                            >
                              {isVideo ? (
                                <View style={{ height: 220, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
                                  <Film size={28} color="#D4AF37" />
                                  <Text style={{ color: '#D4AF37', fontSize: 10, marginTop: 8, fontWeight: 'bold' }}>Reel Clip</Text>
                                </View>
                              ) : (
                                <Image
                                  source={{ uri: item.mediaUrl || 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=300&q=80' }}
                                  style={{
                                    width: '100%',
                                    height: item.aspectRatio === 1.3 ? 140 : 190,
                                    borderRadius: 12
                                  }}
                                />
                              )}
                              
                              {/* Hover info overlay */}
                              <View style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                padding: 6,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                              }}>
                                <Text style={{ color: '#fff', fontSize: 10 }}>⚡ {item.like_count || 0}</Text>
                                <Text style={{ color: '#D4AF37', fontSize: 9, fontWeight: 'bold' }}>AI Pick: {item.recommendation_score}%</Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                )}

                {/* INFINITE SCROLL LOADING TRIGGER */}
                <TouchableOpacity
                  onPress={() => loadExploreFeed(false)}
                  style={{
                    marginVertical: 24,
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: '#262626',
                    alignItems: 'center',
                    backgroundColor: '#121212'
                  }}
                >
                  <Text style={{ color: '#D4AF37', fontWeight: 'bold', fontSize: 12 }}>LOAD MORE EXPLORE</Text>
                </TouchableOpacity>

                {/* TRENDING SECTIONS CARDS */}
                <Text style={{ color: '#D4AF37', fontSize: 13, fontWeight: 'bold', marginTop: 24, marginBottom: 12, textTransform: 'uppercase' }}>🔥 Trending Searches</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                  {trendingContent.searches?.map((tag: string, idx: number) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => handleExecuteSearch(tag)}
                      style={{
                        backgroundColor: '#1c1c1e',
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: '#2c2c2e'
                      }}
                    >
                      <Text style={{ color: '#E4E6EB', fontSize: 12 }}>🔎 {tag}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            ) : (
              /* SEARCH RESULTS GRID VIEW */
              <ScrollView style={{ flex: 1, marginTop: 16 }} showsVerticalScrollIndicator={false}>
                {/* Inline suggestions panel */}
                {searchSuggestions.length > 0 && (
                  <View style={{ marginBottom: 20, backgroundColor: '#1c1c1e', padding: 12, borderRadius: 10 }}>
                    <Text style={{ color: '#D4AF37', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 8 }}>Suggestions</Text>
                    {searchSuggestions.map((sug, idx) => (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => handleExecuteSearch(sug.text)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: idx < searchSuggestions.length - 1 ? 0.5 : 0, borderBottomColor: '#2c2c2e' }}
                      >
                        {sug.type === 'user' ? (
                          <>
                            <Avatar uri={sug.avatar_url || undefined} size={28} />
                            <View>
                              <Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>@{sug.text}</Text>
                              {sug.detail && <Text style={{ color: '#8e8e93', fontSize: 11 }}>{sug.detail}</Text>}
                            </View>
                          </>
                        ) : (
                          <Text style={{ color: '#fff', fontSize: 13 }}>🔍 {sug.text}</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Users Results */}
                {searchTabCombinedResults.users?.length > 0 && (
                  <View style={{ marginBottom: 20 }}>
                    <Text style={{ color: '#D4AF37', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 8 }}>Users</Text>
                    {searchTabCombinedResults.users.map((res: any) => (
                      <TouchableOpacity
                        key={res.id}
                        style={searchStyles.resultRow}
                        onPress={() => {
                          setActiveProfileId(res.id);
                          setActiveTab('profile');
                        }}
                      >
                        <Avatar uri={res.avatar_url || undefined} size={44} style={searchStyles.avatar} />
                        <View style={{ flex: 1 }}>
                          <Text style={searchStyles.username}>{res.username}</Text>
                          <Text style={searchStyles.displayName}>{res.display_name}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity style={[searchStyles.viewBtn, { backgroundColor: '#F59A18' }]} onPress={() => handleStartChat(res.id)}>
                            <Text style={{ color: '#000', fontSize: 12, fontWeight: 'bold' }}>Message</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={searchStyles.viewBtn} onPress={() => {
                            setActiveProfileId(res.id);
                            setActiveTab('profile');
                          }}>
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>View</Text>
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Communities Results */}
                {searchTabCombinedResults.communities?.length > 0 && (
                  <View style={{ marginBottom: 20 }}>
                    <Text style={{ color: '#D4AF37', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 8 }}>Communities</Text>
                    {searchTabCombinedResults.communities.map((comm: any) => (
                      <View key={comm.id} style={searchStyles.resultRow}>
                        <Avatar uri={comm.avatarUrl || undefined} size={44} style={searchStyles.avatar} />
                        <View style={{ flex: 1 }}>
                          <Text style={searchStyles.username}>{comm.name}</Text>
                          <Text style={searchStyles.displayName}>{comm.description}</Text>
                        </View>
                        <TouchableOpacity
                          style={{
                            backgroundColor: instagramTheme.colors.orange,
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 6
                          }}
                          onPress={() => {
                            alert(`Joined community: ${comm.name}`);
                          }}
                        >
                          <Text style={{ color: '#000', fontSize: 12, fontWeight: 'bold' }}>Join</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {/* Posts/Reels Results */}
                {(searchTabCombinedResults.posts?.length > 0 || searchTabCombinedResults.reels?.length > 0) && (
                  <View style={{ marginBottom: 20 }}>
                    <Text style={{ color: '#D4AF37', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 8 }}>Matched Content</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      {searchTabCombinedResults.posts.map((post: any) => (
                        <TouchableOpacity
                          key={post.id}
                          style={{
                            width: '47%',
                            backgroundColor: '#121212',
                            borderRadius: 8,
                            padding: 10,
                            borderWidth: 1,
                            borderColor: '#262626'
                          }}
                          onPress={() => {
                            setActiveProfileId(post.userId);
                            setActiveTab('profile');
                          }}
                        >
                          <Text style={{ color: '#fff', fontSize: 12 }} numberOfLines={3}>{post.content}</Text>
                          <Text style={{ color: '#8e8e93', fontSize: 10, marginTop: 8 }}>By @{post.user?.username}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* No matching results fallback */}
                {searchTabCombinedResults.users?.length === 0 &&
                 searchTabCombinedResults.communities?.length === 0 &&
                 searchTabCombinedResults.posts?.length === 0 && (
                  <Text style={searchStyles.emptyText}>No matches found for "{searchQuery}"</Text>
                )}
              </ScrollView>
            )}
          </View>
        )}

        {/* REELS/SHORTS TAB */}
        {activeTab === 'shorts' && (
          <View style={shortsStyles.container}>
            <View style={shortsStyles.reelCard}>
              <View style={shortsStyles.mockPlayer}>
                <Film size={48} color={instagramTheme.colors.orange} />
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginTop: 12 }}>Vlog short simulation</Text>
                <Text style={{ color: instagramTheme.colors.textSecondary, marginTop: 4 }}>[Simulated Loop vertical player]</Text>
              </View>

              {/* Overlay info */}
              <View style={shortsStyles.overlayInfo}>
                <View style={shortsStyles.authorRow}>
                  <Image source={{ uri: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150' }} style={postStyles.avatar} />
                  <Text style={shortsStyles.reelUser}>@sophia_code</Text>
                  <TouchableOpacity style={shortsStyles.followBtn}><Text style={shortsStyles.followText}>Follow</Text></TouchableOpacity>
                </View>
                <Text style={shortsStyles.reelDesc}>Unleashing E2EE key exchanges! ⚡ #thunder #reels</Text>
              </View>

              {/* Action column on the right side */}
              <View style={shortsStyles.actions}>
                <TouchableOpacity style={shortsStyles.actionItem} onPress={() => { }}>
                  <Text style={{ fontSize: 28 }}>⚡</Text>
                  <Text style={shortsStyles.actionCount}>12.4K</Text>
                </TouchableOpacity>
                <TouchableOpacity style={shortsStyles.actionItem}>
                  <MessageSquare size={26} color="#fff" />
                  <Text style={shortsStyles.actionCount}>120</Text>
                </TouchableOpacity>
                <TouchableOpacity style={shortsStyles.actionItem}>
                  <Send size={26} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={shortsStyles.actionItem}>
                  <Bookmark size={26} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* INBOX/MESSAGES TAB (Instagram Direct Experience) */}
        {activeTab === 'messages' && (
          <View style={{ flex: 1, flexDirection: isMobile ? 'column' : 'row', height: '100%', backgroundColor: '#000000' }}>
            {(!isMobile || !selectedRoom) && (
              <InstagramInboxView
                selectedRoomId={selectedRoom?.id || null}
                onSelectRoom={(room) => setSelectedRoom(room)}
                onOpenCompose={() => setShowNewMessageModal(true)}
                onOpenNewMessage={() => setShowNewMessageModal(true)}
                onOpenCreateGroup={() => setShowGroupCreateModal(true)}
                isMobile={isMobile}
              />
            )}

            {selectedRoom && (!isMobile || selectedRoom) ? (
              <InstagramChatWindow
                room={selectedRoom}
                onBack={() => setSelectedRoom(null)}
                isMobile={isMobile}
              />
            ) : (
              !isMobile && (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#050505', gap: 12 }}>
                  <View style={{ width: 80, height: 80, borderRadius: 40, borderBottomWidth: 0, borderWidth: 2, borderColor: '#F59A18', justifyContent: 'center', alignItems: 'center' }}>
                    <MessageSquare size={40} color="#F59A18" />
                  </View>
                  <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '700', fontFamily: 'Outfit, sans-serif' }}>
                    Your Messages
                  </Text>
                  <Text style={{ color: '#8E8E93', fontSize: 14, textAlign: 'center', maxWidth: 300 }}>
                    Send end-to-end encrypted messages, photos, and voice notes to friends on JamSh.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setShowNewMessageModal(true)}
                      style={{ backgroundColor: '#F59A18', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 }}
                    >
                      <Text style={{ color: '#000000', fontWeight: '700', fontSize: 14 }}>Send Message</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setShowGroupCreateModal(true)}
                      style={{ backgroundColor: '#262626', borderWidth: 1, borderColor: '#3A3A3C', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 }}
                    >
                      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>Create Group</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )
            )}
          </View>
        )}

        {/* PROFILE TAB */}
        {activeTab === 'profile' && (
          <ScrollView contentContainerStyle={[profileStyles.scroll, isMobile && { paddingHorizontal: 16, paddingVertical: 20, paddingBottom: 64 }]} showsVerticalScrollIndicator={false} style={{ height: '100%', flex: 1 }}>
            {/* Header info */}
            <View style={[profileStyles.header, isMobile && { flexDirection: 'column', gap: 16, alignItems: 'center', marginBottom: 24 }]}>
              <Avatar uri={activeProfile?.avatar_url} size={isMobile ? 90 : 150} style={profileStyles.avatar} />

              <View style={[profileStyles.infoBlock, isMobile && { alignItems: 'center', width: '100%' }]}>
                <View style={[profileStyles.usernameRow, isMobile && { flexDirection: 'column', gap: 12, alignItems: 'center', marginBottom: 16 }]}>
                  <Text style={profileStyles.username}>{activeProfile?.username || 'zack_thunder'}</Text>

                  {isTargetMode ? (
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <TouchableOpacity
                        style={[profileStyles.followBtn, isFollowing && { backgroundColor: '#363636' }]}
                        onPress={handleFollowToggle}
                      >
                        {isFollowing ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <UserCheck size={16} color="#fff" />
                            <Text style={profileStyles.editBtnText}>Following</Text>
                          </View>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <UserPlus size={16} color="#fff" />
                            <Text style={profileStyles.editBtnText}>Follow</Text>
                          </View>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity style={profileStyles.editBtn} onPress={() => handleStartChat(activeProfile.id)}>
                        <Text style={profileStyles.editBtnText}>Message</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <TouchableOpacity style={profileStyles.editBtn} onPress={handleOpenEditProfile}>
                        <Text style={profileStyles.editBtnText}>Edit profile</Text>
                      </TouchableOpacity>
                      <TouchableOpacity><Settings size={20} color="#fff" /></TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* Stats */}
                <View style={[profileStyles.statsRow, isMobile && { gap: 24, marginBottom: 16, justifyContent: 'center' }]}>
                  <Text style={profileStyles.stat}><Text style={profileStyles.statVal}>{isTargetMode ? targetPosts.length : posts.filter(p => p.user_id === user.id).length}</Text> posts</Text>
                  <TouchableOpacity onPress={handleOpenFollowers} activeOpacity={0.7}>
                    <Text style={profileStyles.stat}><Text style={profileStyles.statVal}>{activeProfile?.followers_count || 0}</Text> followers</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleOpenFollowing} activeOpacity={0.7}>
                    <Text style={profileStyles.stat}><Text style={profileStyles.statVal}>{activeProfile?.following_count || 0}</Text> following</Text>
                  </TouchableOpacity>
                </View>

                {/* Bio name */}
                <Text style={[profileStyles.displayName, isMobile && { textAlign: 'center' }]}>{activeProfile?.display_name || 'Zack Thunder'}</Text>
                <Text style={[profileStyles.bioText, isMobile && { textAlign: 'center' }]}>{activeProfile?.bio || 'Unleashing energy, lightning-fast builds.'}</Text>
                {activeProfile?.website && (
                  <Text style={[profileStyles.webLink, isMobile && { textAlign: 'center' }]}>{activeProfile.website}</Text>
                )}
              </View>
            </View>

            {/* Divider grid lines */}
            <View style={[profileStyles.tabsHeader, isMobile && { gap: 36, paddingHorizontal: 12 }]}>
              <Text style={profileStyles.activeTabLabel}>POSTS</Text>
              <Text style={profileStyles.inactiveTabLabel}>SAVED</Text>
              <Text style={profileStyles.inactiveTabLabel}>TAGGED</Text>
            </View>

            {/* Profile posts grid */}
            <View style={[profileStyles.grid, isMobile && { gap: 4, justifyContent: 'flex-start' }]}>
              {(isTargetMode ? targetPosts : posts.filter(p => p.user_id === user.id)).map(post => (
                <View key={post.id} style={[profileStyles.gridCell, isMobile && { width: (width - 32 - 8) / 3, margin: 0 }]}>
                  {post.media && post.media.length > 0 ? (
                    <Image source={{ uri: post.media[0].media_url }} style={profileStyles.gridImg} />
                  ) : (
                    <View style={profileStyles.textGridPlaceholder}>
                      <Text style={profileStyles.textGridContent} numberOfLines={3}>{post.content}</Text>
                    </View>
                  )}
                </View>
              ))}
              {(isTargetMode ? targetPosts : posts.filter(p => p.user_id === user.id)).length === 0 && (
                <View style={{ width: '100%', alignItems: 'center', padding: 48 }}>
                  <Text style={{ color: instagramTheme.colors.textSecondary }}>No posts shared by this account yet.</Text>
                </View>
              )}
            </View>
          </ScrollView>
        )}

        {/* GO LIVE TAB */}
        {activeTab === 'live' && (
          <View style={{ flex: 1, padding: 32, flexDirection: 'row', gap: 24, height: '100%' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.tabTitle}>⚡ Live Broadcast</Text>
              <View style={{ backgroundColor: instagramTheme.colors.surface, borderWidth: 1, borderColor: instagramTheme.colors.border, padding: 24, borderRadius: 8 }}>
                <Text style={styles.sectionHeader}>Broadcaster Dashboard</Text>
                <TextInput
                  placeholder="Enter stream title..."
                  placeholderTextColor={instagramTheme.colors.textSecondary}
                  style={authStyles.input}
                  value={streamTitle}
                  onChangeText={setStreamTitle}
                  editable={!isLive}
                />

                <TouchableOpacity style={[authStyles.btn, { backgroundColor: isLive ? instagramTheme.colors.red : instagramTheme.colors.orange }]} onPress={handleGoLive}>
                  <Text style={authStyles.btnText}>{isLive ? 'End Broadcast' : 'Start Live Broadcast'}</Text>
                </TouchableOpacity>

                {isLive && (
                  <View style={{ marginTop: 24 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#000', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                      <Text style={{ color: instagramTheme.colors.red, fontWeight: 'bold' }}>● LIVE</Text>
                      <Text style={{ color: '#fff' }}>👁️ {viewerCount} viewers</Text>
                    </View>
                    <View style={{ height: 280, backgroundColor: '#000', borderRadius: 8, justifyContent: 'center', alignItems: 'center' }}>
                      <Video size={48} color={instagramTheme.colors.orange} />
                      <Text style={{ color: '#fff', marginTop: 12 }}>Broadcasting stream active...</Text>
                    </View>
                  </View>
                )}
              </View>
            </View>

            <View style={{ width: 340 }}>
              <View style={{ flex: 1, backgroundColor: instagramTheme.colors.surface, borderWidth: 1, borderColor: instagramTheme.colors.border, padding: 16, borderRadius: 8, height: '100%' }}>
                <Text style={{ color: '#fff', fontWeight: 'bold', marginBottom: 12 }}>Live comments chat</Text>
                <ScrollView style={{ flex: 1 }}>
                  {streamComments.map(c => (
                    <View key={c.id} style={{ marginBottom: 12 }}>
                      <Text style={{ color: instagramTheme.colors.orange, fontWeight: 'bold', fontSize: 13 }}>@{c.username}</Text>
                      <Text style={{ color: '#fff', fontSize: 14 }}>{c.content}</Text>
                    </View>
                  ))}
                </ScrollView>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TextInput
                    placeholder="Send comment..."
                    placeholderTextColor={instagramTheme.colors.textSecondary}
                    style={[authStyles.input, { flex: 1, marginBottom: 0 }]}
                    value={liveCommentInput}
                    onChangeText={setLiveCommentInput}
                  />
                  <TouchableOpacity onPress={handleSendLiveComment} style={[authStyles.btn, { width: 70, marginBottom: 0 }]}>
                    <Text style={authStyles.btnText}>Send</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* MODERATION TAB */}
        {activeTab === 'admin' && (
          <View style={{ flex: 1, padding: 32, height: '100%' }}>
            <Text style={styles.tabTitle}>🛡️ Moderation Desk</Text>
            <View style={{ backgroundColor: instagramTheme.colors.surface, borderWidth: 1, borderColor: instagramTheme.colors.border, padding: 24, borderRadius: 8 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16, marginBottom: 16 }}>Flagged reports queue</Text>

              {reports.map(report => (
                <View key={report.id} style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: instagramTheme.colors.border }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Target: {report.target}</Text>
                    <Text style={{ color: instagramTheme.colors.orange, fontSize: 12 }}>{report.status}</Text>
                  </View>
                  <Text style={{ color: instagramTheme.colors.textSecondary, marginTop: 4 }}>Reason: {report.reason} | Flagged by: @{report.reporter}</Text>

                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                    <TouchableOpacity style={[authStyles.btn, { width: 120, height: 36, marginBottom: 0, backgroundColor: 'transparent', borderWidth: 1, borderColor: instagramTheme.colors.border }]} onPress={() => setReports(prev => prev.filter(r => r.id !== report.id))}>
                      <Text style={{ color: '#fff' }}>Ignore</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[authStyles.btn, { width: 120, height: 36, marginBottom: 0 }]} onPress={() => {
                      setReports(prev => prev.filter(r => r.id !== report.id));
                      alert('Account restriction flags applied');
                    }}>
                      <Text style={authStyles.btnText}>Restrict User</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {reports.length === 0 && (
                <Text style={{ color: instagramTheme.colors.textSecondary, textAlign: 'center', padding: 24 }}>Moderation queue empty. All posts checked.</Text>
              )}
            </View>
          </View>
        )}

      </View>

      {/* WEBRTC CALLING SCREEN DISPLAY MODAL */}
      {activeCall && (
        <Modal transparent visible animationType="fade">
          <View style={callStyles.overlay}>
            <View style={[callStyles.card, isMobile && { width: '90%' }]}>
              <Video size={48} color={instagramTheme.colors.orange} />
              <Text style={callStyles.peerName}>{activeCall.peer?.display_name}</Text>
              <Text style={callStyles.statusText}>Call Status: {activeCall.status.toUpperCase()}</Text>

              <ScrollView style={callStyles.logBox} contentContainerStyle={{ padding: 8 }}>
                {callSignalLog.map((log, index) => (
                  <Text key={index} style={callStyles.logLine}>&gt; {log}</Text>
                ))}
              </ScrollView>

              <TouchableOpacity style={callStyles.hangupBtn} onPress={handleEndCall}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Hang Up</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* CYBERPUNK CREATE BOTTOM SHEET & NATIVE MEDIA FLOW MODAL */}
      <Modal transparent visible={isCreateModalVisible} animationType="slide" onRequestClose={() => setIsCreateModalVisible(false)}>
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setIsCreateModalVisible(false)}
          />

          <View style={{
            width: isMobile ? '100%' : 540,
            maxHeight: '90%',
            backgroundColor: '#121212',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderWidth: 1.5,
            borderColor: 'rgba(245, 154, 24, 0.35)',
            padding: 24,
            paddingBottom: isMobile ? 36 : 24,
            shadowColor: '#F59A18',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.3,
            shadowRadius: 16,
            zIndex: 100,
          }}>
            {/* Handle Bar */}
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 44, height: 5, borderRadius: 2.5, backgroundColor: '#333' }} />
            </View>

            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ color: '#FFF', fontSize: 20, fontWeight: '800', fontFamily: 'Manrope, sans-serif' }}>
                Create New Content
              </Text>
              <TouchableOpacity
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#1E1E1E', justifyContent: 'center', alignItems: 'center' }}
                onPress={() => setIsCreateModalVisible(false)}
              >
                <X size={18} color="#A8A8A8" />
              </TouchableOpacity>
            </View>

            {/* Option Cards */}
            <View style={{ gap: 12 }}>
              {/* Option 1: Create Post */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#1E1E1E',
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(245, 154, 24, 0.25)',
                }}
                onPress={() => {
                  // Trigger Native Media Picker for Post
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*,video/*';
                  input.multiple = true;
                  input.onchange = async (e: any) => {
                    const files = Array.from(e.target.files || []) as File[];
                    if (files.length > 0) {
                      const fileUrls = files.map(f => URL.createObjectURL(f));
                      const captionPrompt = prompt('Write a caption for your post:', postContent || '');
                      if (captionPrompt !== null) {
                        try {
                          const newP = await createPost(captionPrompt, files[0].type.startsWith('video') ? 'video' : 'image', fileUrls);
                          setPosts(prev => [newP, ...prev]);
                          setPostContent('');
                          setIsCreateModalVisible(false);
                          alert('Post Published! 🚀');
                        } catch (err: any) {
                          alert('Failed to publish post: ' + (err?.message || err));
                        }
                      }
                    }
                  };
                  input.click();
                }}
              >
                <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(245, 154, 24, 0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 16 }}>
                  <ImageIcon size={24} color="#F59A18" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '700', fontFamily: 'Manrope, sans-serif' }}>
                    📸 Create Post
                  </Text>
                  <Text style={{ color: '#A8A8A8', fontSize: 12, fontFamily: 'Manrope, sans-serif', marginTop: 2 }}>
                    Pick photos or videos from camera or gallery
                  </Text>
                </View>
                <Text style={{ color: '#F59A18', fontSize: 20 }}>›</Text>
              </TouchableOpacity>

              {/* Option 2: Create Reel */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#1E1E1E',
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(245, 154, 24, 0.25)',
                }}
                onPress={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'video/*';
                  input.onchange = async (e: any) => {
                    const files = Array.from(e.target.files || []) as File[];
                    if (files.length > 0) {
                      const videoUrl = URL.createObjectURL(files[0]);
                      const captionPrompt = prompt('Write a caption for your Reel:', '');
                      if (captionPrompt !== null) {
                        try {
                          const newP = await createPost(captionPrompt || 'New Reel', 'video', [videoUrl]);
                          setPosts(prev => [newP, ...prev]);
                          setIsCreateModalVisible(false);
                          alert('Reel Published! 🎬');
                        } catch (err: any) {
                          alert('Failed to publish Reel: ' + (err?.message || err));
                        }
                      }
                    }
                  };
                  input.click();
                }}
              >
                <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(245, 154, 24, 0.25)', justifyContent: 'center', alignItems: 'center', marginRight: 16 }}>
                  <Video size={24} color="#F59A18" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '700', fontFamily: 'Manrope, sans-serif' }}>
                    🎬 Create Reel
                  </Text>
                  <Text style={{ color: '#A8A8A8', fontSize: 12, fontFamily: 'Manrope, sans-serif', marginTop: 2 }}>
                    Record or select short vertical video
                  </Text>
                </View>
                <Text style={{ color: '#F59A18', fontSize: 20 }}>›</Text>
              </TouchableOpacity>

              {/* Option 3: Create Story */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#1E1E1E',
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(245, 154, 24, 0.25)',
                }}
                onPress={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*,video/*';
                  input.onchange = async (e: any) => {
                    const files = Array.from(e.target.files || []) as File[];
                    if (files.length > 0) {
                      const file = files[0];
                      try {
                        const fileExt = file.name.split('.').pop() || 'jpg';
                        const filePath = `${user?.id || 'anon'}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                        
                        const { data: uploadData, error: uploadErr } = await supabase.storage
                          .from('stories')
                          .upload(filePath, file, { upsert: true });

                        let mediaUrl = '';
                        if (!uploadErr && uploadData) {
                          const { data: publicUrlData } = supabase.storage.from('stories').getPublicUrl(uploadData.path);
                          mediaUrl = publicUrlData.publicUrl;
                        } else {
                          mediaUrl = URL.createObjectURL(file);
                        }

                        const isVideo = file.type.startsWith('video');
                        await StoryService.createStory({
                          media_url: mediaUrl,
                          media_type: isVideo ? 'video' : 'image',
                          caption: 'Story (24h expiry)',
                        });

                        setIsCreateModalVisible(false);
                        alert('Story Published (Expires in 24h)! 📖');
                      } catch (err: any) {
                        alert('Failed to publish Story: ' + (err?.message || err));
                      }
                    }
                  };
                  input.click();
                }}

              >
                <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(245, 154, 24, 0.2)', justifyContent: 'center', alignItems: 'center', marginRight: 16 }}>
                  <BookOpen size={24} color="#F59A18" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '700', fontFamily: 'Manrope, sans-serif' }}>
                    📖 Create Story
                  </Text>
                  <Text style={{ color: '#A8A8A8', fontSize: 12, fontFamily: 'Manrope, sans-serif', marginTop: 2 }}>
                    24-hour expiring photo/video with overlays
                  </Text>
                </View>
                <Text style={{ color: '#F59A18', fontSize: 20 }}>›</Text>
              </TouchableOpacity>

              {/* Cancel Button */}
              <TouchableOpacity
                style={{
                  backgroundColor: '#1A1A1A',
                  borderRadius: 14,
                  paddingVertical: 16,
                  alignItems: 'center',
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: '#2A2A2A',
                }}
                onPress={() => setIsCreateModalVisible(false)}
              >
                <Text style={{ color: '#F59A18', fontSize: 16, fontWeight: '700', fontFamily: 'Manrope, sans-serif' }}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* FOLLOWERS & FOLLOWING OVERLAY MODAL */}
      <Modal transparent visible={followModalVisible} animationType="slide">
        <View style={createModalStyles.overlay}>
          <View style={[createModalStyles.card, isMobile && { width: '92%' }, { maxHeight: '80%' }]}>
            <View style={createModalStyles.header}>
              <TouchableOpacity onPress={() => setFollowModalVisible(false)}>
                <Text style={{ color: '#fff' }}>Close</Text>
              </TouchableOpacity>
              <Text style={createModalStyles.title}>{followModalTitle}</Text>
              <View style={{ width: 40 }} />
            </View>
            <View style={[createModalStyles.body, { padding: 0 }]}>
              {isLoadingFollowModal ? (
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={instagramTheme.colors.orange} />
                </View>
              ) : followModalUsers.length === 0 ? (
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <Text style={{ color: '#A8A8A8', fontFamily: 'Manrope, sans-serif' }}>
                    No users found.
                  </Text>
                </View>
              ) : (
                <ScrollView style={{ width: '100%', maxHeight: 400 }}>
                  {followModalUsers.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        borderBottomWidth: 0.5,
                        borderBottomColor: 'rgba(255, 255, 255, 0.08)',
                      }}
                      onPress={() => {
                        setFollowModalVisible(false);
                        setActiveProfileId(item.id);
                        setActiveTab('profile');
                      }}
                    >
                      <View style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: '#363636',
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginRight: 12,
                      }}>
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>
                          {(item.display_name || item.username || '?').substring(0, 1).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
                          {item.username || 'user'}
                        </Text>
                        {item.display_name && (
                          <Text style={{ color: '#a8a8a8', fontSize: 12, marginTop: 2 }}>
                            {item.display_name}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* EDIT PROFILE OVERLAY MODAL */}
      <Modal transparent visible={isEditProfileVisible} animationType="slide">
        <View style={createModalStyles.overlay}>
          <View style={[createModalStyles.card, isMobile && { width: '92%' }]}>
            <View style={createModalStyles.header}>
              <TouchableOpacity onPress={() => setIsEditProfileVisible(false)}><Text style={{ color: '#fff' }}>Cancel</Text></TouchableOpacity>
              <Text style={createModalStyles.title}>Edit Profile</Text>
              <TouchableOpacity onPress={handleSaveProfile}><Text style={{ color: instagramTheme.colors.orange, fontWeight: 'bold' }}>Save</Text></TouchableOpacity>
            </View>
            <View style={createModalStyles.body}>
              <TextInput
                placeholder="Display Name"
                placeholderTextColor={instagramTheme.colors.textSecondary}
                value={editDisplayName}
                onChangeText={setEditDisplayName}
                style={[createModalStyles.urlField, { marginBottom: 16 }]}
              />
              <TextInput
                placeholder="Bio"
                placeholderTextColor={instagramTheme.colors.textSecondary}
                value={editBio}
                onChangeText={setEditBio}
                multiline
                style={[createModalStyles.captionField, { height: 80, marginBottom: 16 }]}
              />
              <TextInput
                placeholder="Website (URL)"
                placeholderTextColor={instagramTheme.colors.textSecondary}
                value={editWebsite}
                onChangeText={setEditWebsite}
                style={createModalStyles.urlField}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* NEW DIRECT MESSAGE OVERLAY MODAL */}
      <Modal transparent visible={showNewMessageModal} animationType="slide">
        <View style={createModalStyles.overlay}>
          <View style={[createModalStyles.card, isMobile && { width: '92%' }]}>
            <View style={createModalStyles.header}>
              <TouchableOpacity onPress={() => { setShowNewMessageModal(false); setNewMessageUserSearch(''); }}>
                <Text style={{ color: '#fff' }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={createModalStyles.title}>New Direct Message</Text>
              <View style={{ width: 45 }} />
            </View>
            <View style={{ padding: 16 }}>
              <TextInput
                placeholder="Search username or display name..."
                placeholderTextColor={instagramTheme.colors.textSecondary}
                value={newMessageUserSearch}
                onChangeText={setNewMessageUserSearch}
                style={[createModalStyles.urlField, { marginBottom: 12 }]}
              />
              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {mockDb.getProfiles()
                  .filter((p: any) => p.id !== user?.id)
                  .filter((p: any) => {
                    if (!newMessageUserSearch.trim()) return true;
                    const q = newMessageUserSearch.toLowerCase();
                    return (
                      (p.username && p.username.toLowerCase().includes(q)) ||
                      (p.display_name && p.display_name.toLowerCase().includes(q))
                    );
                  })
                  .map((profile: any) => (
                    <TouchableOpacity
                      key={profile.id}
                      onPress={async () => {
                        setShowNewMessageModal(false);
                        setNewMessageUserSearch('');
                        await handleStartChat(profile.id);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 10,
                        borderBottomWidth: 1,
                        borderBottomColor: '#262626',
                        justifyContent: 'space-between'
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Avatar uri={profile.avatar_url || undefined} size={36} style={{ marginRight: 12 }} />
                        <View>
                          <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>{profile.display_name}</Text>
                          <Text style={{ color: '#8e8e93', fontSize: 12 }}>@{profile.username}</Text>
                        </View>
                      </View>
                      <View style={{ backgroundColor: '#F59A18', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
                        <Text style={{ color: '#000', fontSize: 12, fontWeight: 'bold' }}>Chat</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      {/* GROUP CREATE OVERLAY MODAL */}
      <Modal transparent visible={showGroupCreateModal} animationType="slide">
        <View style={createModalStyles.overlay}>
          <View style={[createModalStyles.card, isMobile && { width: '92%' }]}>
            <View style={createModalStyles.header}>
              <TouchableOpacity onPress={() => setShowGroupCreateModal(false)}><Text style={{ color: '#fff' }}>Cancel</Text></TouchableOpacity>
              <Text style={createModalStyles.title}>Create Group</Text>
              <TouchableOpacity onPress={handleCreateGroup}><Text style={{ color: instagramTheme.colors.orange, fontWeight: 'bold' }}>Create</Text></TouchableOpacity>
            </View>
            <ScrollView style={createModalStyles.body} showsVerticalScrollIndicator={false}>
              <TextInput
                placeholder="Group Name"
                placeholderTextColor={instagramTheme.colors.textSecondary}
                value={newGroupName}
                onChangeText={setNewGroupName}
                style={[createModalStyles.urlField, { marginBottom: 12 }]}
              />
              <TextInput
                placeholder="Group Description (optional)"
                placeholderTextColor={instagramTheme.colors.textSecondary}
                value={newGroupDescription}
                onChangeText={setNewGroupDescription}
                style={[createModalStyles.urlField, { marginBottom: 12 }]}
              />
              <TextInput
                placeholder="Group Photo URL"
                placeholderTextColor={instagramTheme.colors.textSecondary}
                value={newGroupAvatar}
                onChangeText={setNewGroupAvatar}
                style={[createModalStyles.urlField, { marginBottom: 16 }]}
              />
              
              <Text style={{ color: '#fff', fontWeight: 'bold', marginBottom: 12 }}>Select Members</Text>
              {mockDb.getProfiles().filter((p: any) => p.id !== user?.id).map((profile: any) => {
                const isSelected = newGroupSelectedMembers.includes(profile.id);
                return (
                  <TouchableOpacity
                    key={profile.id}
                    onPress={() => {
                      if (isSelected) {
                        setNewGroupSelectedMembers(prev => prev.filter(id => id !== profile.id));
                      } else {
                        setNewGroupSelectedMembers(prev => [...prev, profile.id]);
                      }
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: '#262626'
                    }}
                  >
                    <Avatar uri={profile.avatar_url || undefined} size={32} style={{ marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#fff', fontSize: 14 }}>{profile.display_name}</Text>
                      <Text style={{ color: '#8e8e93', fontSize: 12 }}>@{profile.username}</Text>
                    </View>
                    <View style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      borderWidth: 2,
                      borderColor: isSelected ? instagramTheme.colors.orange : '#8e8e93',
                      backgroundColor: isSelected ? instagramTheme.colors.orange : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {isSelected && <Text style={{ color: '#000', fontSize: 10, fontWeight: 'bold' }}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* GROUP SETTINGS OVERLAY MODAL */}
      <Modal transparent visible={showGroupSettingsModal} animationType="slide">
        <View style={createModalStyles.overlay}>
          <View style={[createModalStyles.card, isMobile && { width: '92%' }]}>
            <View style={createModalStyles.header}>
              <TouchableOpacity onPress={() => setShowGroupSettingsModal(false)}><Text style={{ color: '#fff' }}>Close</Text></TouchableOpacity>
              <Text style={createModalStyles.title}>Group Settings</Text>
              <View style={{ width: 50 }} />
            </View>
            <ScrollView style={createModalStyles.body} showsVerticalScrollIndicator={false}>
              {selectedRoom && (
                <View>
                  <View style={{ alignItems: 'center', marginBottom: 20 }}>
                    <Avatar uri={selectedRoom.avatar_url || undefined} size={80} />
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginTop: 12 }}>{selectedRoom.name}</Text>
                    {selectedRoom.description && (
                      <Text style={{ color: '#8e8e93', fontSize: 13, marginTop: 4, textAlign: 'center' }}>{selectedRoom.description}</Text>
                    )}
                  </View>
                  
                  {/* Edit group details if admin */}
                  {(selectedRoom.member_roles?.[user?.id] === 'primary_admin' || selectedRoom.member_roles?.[user?.id] === 'admin') && (
                    <View style={{ marginBottom: 20 }}>
                      <Text style={{ color: '#8e8e93', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 8 }}>Edit Group Details</Text>
                      <TextInput
                        placeholder="Edit Group Name"
                        placeholderTextColor={instagramTheme.colors.textSecondary}
                        defaultValue={selectedRoom.name}
                        onSubmitEditing={(e) => editGroupInfo(selectedRoom.id, { name: e.nativeEvent.text })}
                        style={[createModalStyles.urlField, { marginBottom: 12 }]}
                      />
                    </View>
                  )}

                  {/* Add Member section if admin */}
                  {(selectedRoom.member_roles?.[user?.id] === 'primary_admin' || selectedRoom.member_roles?.[user?.id] === 'admin') && (
                    <View style={{ marginBottom: 20 }}>
                      <Text style={{ color: '#8e8e93', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 8 }}>Add Member</Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <select
                            value={groupSettingAddMemberId}
                            onChange={(e) => setGroupSettingAddMemberId(e.target.value)}
                            style={{
                              backgroundColor: '#1c1c1e',
                              color: '#fff',
                              padding: 10,
                              borderRadius: 6,
                              borderColor: '#3a3a3c',
                              width: '100%',
                              height: 40
                            }}
                          >
                            <option value="">Select a user...</option>
                            {mockDb.getProfiles()
                              .filter((p: any) => !selectedRoom.members?.includes(p.id))
                              .map((p: any) => (
                                <option key={p.id} value={p.id}>
                                  {p.display_name} (@{p.username})
                                </option>
                              ))}
                          </select>
                        </View>
                        <TouchableOpacity
                          onPress={handleAddGroupMember}
                          style={{
                            backgroundColor: instagramTheme.colors.orange,
                            paddingHorizontal: 16,
                            borderRadius: 6,
                            justifyContent: 'center',
                            height: 40
                          }}
                        >
                          <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 13 }}>Add</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Group Members List */}
                  <Text style={{ color: '#8e8e93', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 8 }}>Members ({selectedRoom.members?.length})</Text>
                  {selectedRoom.members?.map((uid: string) => {
                    const memberProfile = mockDb.getProfiles().find(p => p.id === uid);
                    const role = selectedRoom.member_roles?.[uid] || 'member';
                    const isMe = uid === user?.id;
                    
                    const myRole = selectedRoom.member_roles?.[user?.id] || 'member';
                    
                    return (
                      <View
                        key={uid}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 10,
                          borderBottomWidth: 1,
                          borderBottomColor: '#262626'
                        }}
                      >
                        <Avatar uri={memberProfile?.avatar_url || undefined} size={36} style={{ marginRight: 12 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#fff', fontSize: 14 }}>
                            {memberProfile?.display_name || 'Group Member'} {isMe && '(You)'}
                          </Text>
                          <Text style={{ color: role === 'primary_admin' ? instagramTheme.colors.orange : '#8e8e93', fontSize: 12, textTransform: 'capitalize' }}>
                            {role}
                          </Text>
                        </View>
                        
                        {/* Member management actions */}
                        {!isMe && (myRole === 'primary_admin' || myRole === 'admin') && (
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            {role === 'member' && (
                              <TouchableOpacity
                                onPress={() => handlePromoteToAdmin(uid)}
                                style={{ backgroundColor: '#262626', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4 }}
                              >
                                <Text style={{ color: '#0095f6', fontSize: 11, fontWeight: 'bold' }}>Promote</Text>
                              </TouchableOpacity>
                            )}
                            
                            {role === 'admin' && myRole === 'primary_admin' && (
                              <TouchableOpacity
                                onPress={() => handleDemoteToAdmin(uid)}
                                style={{ backgroundColor: '#262626', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4 }}
                              >
                                <Text style={{ color: '#f59a18', fontSize: 11, fontWeight: 'bold' }}>Demote</Text>
                              </TouchableOpacity>
                            )}
                            
                            {role !== 'primary_admin' && (
                              <TouchableOpacity
                                onPress={() => handleRemoveGroupMember(uid)}
                                style={{ backgroundColor: '#3d0a0a', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4 }}
                              >
                                <Text style={{ color: '#ff3b30', fontSize: 11, fontWeight: 'bold' }}>Remove</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}

                  {/* Leave & Delete options */}
                  <View style={{ marginTop: 32, gap: 12 }}>
                    <TouchableOpacity
                      onPress={handleLeaveGroup}
                      style={{
                        backgroundColor: '#262626',
                        padding: 12,
                        borderRadius: 6,
                        alignItems: 'center'
                      }}
                    >
                      <Text style={{ color: '#ff3b30', fontWeight: 'bold' }}>Leave Group</Text>
                    </TouchableOpacity>
                    
                    {selectedRoom.member_roles?.[user?.id] === 'primary_admin' && (
                      <TouchableOpacity
                        onPress={handleDeleteGroup}
                        style={{
                          backgroundColor: '#3d0a0a',
                          padding: 12,
                          borderRadius: 6,
                          alignItems: 'center'
                        }}
                      >
                        <Text style={{ color: '#ff3b30', fontWeight: 'bold' }}>Delete Group</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Production Story Player Modal */}
      <StoryPlayer
        visible={isStoryPlayerVisible}
        authorId={activeStoryAuthorId}
        currentUserId={user?.id}
        onClose={() => setIsStoryPlayerVisible(false)}
        onAuthorChange={(nextAuthorId) => setActiveStoryAuthorId(nextAuthorId)}
      />
    </SafeAreaView>
  );
}



// STYLING SPECIFICATIONS
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    flexDirection: 'row',
    width: '100vw' as any,
    height: '100vh' as any,
    overflow: 'hidden' as any,
  },
  main: {
    flex: 1,
    height: '100%',
    backgroundColor: '#000000',
  },
  feedWrapper: {
    flex: 1,
    flexDirection: 'row',
    height: '100%',
    justifyContent: 'center',
  },
  tabTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Outfit',
    marginBottom: 24,
  },
  sectionHeader: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
  },
});

const sidebarStyles = StyleSheet.create({
  container: {
    width: 244,
    height: '100%',
    borderRightWidth: 1,
    borderRightColor: instagramTheme.colors.border,
    backgroundColor: '#000000',
    paddingHorizontal: 12,
    paddingVertical: 24,
    justifyContent: 'space-between',
    zIndex: 100,
  },
  top: {
    paddingHorizontal: 12,
  },
  menu: {
    gap: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 16,
    position: 'relative',
  },
  itemActive: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  itemLabel: {
    color: instagramTheme.colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  profilePic: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#333',
  },
  badge: {
    position: 'absolute',
    left: 28,
    top: 6,
    backgroundColor: instagramTheme.colors.orange,
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 16,
  },
  logoutLabel: {
    color: instagramTheme.colors.textSecondary,
    fontSize: 15,
  },
  // Switcher menu styles
  switcherPopup: {
    position: 'absolute',
    bottom: 50,
    left: 12,
    right: 12,
    backgroundColor: instagramTheme.colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: instagramTheme.colors.border,
    padding: 12,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  switcherPopupTitle: {
    color: instagramTheme.colors.textSecondary,
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  switcherPopupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  switcherAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  switcherUsername: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
});

const feedStyles = StyleSheet.create({
  scroll: {
    width: 630,
    paddingTop: 24,
    paddingLeft: 48,
    paddingBottom: 48,
  },
});

const storyStyles = StyleSheet.create({
  tray: {
    flexDirection: 'row',
    paddingVertical: 16,
    marginBottom: 24,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: instagramTheme.colors.border,
  },
  item: {
    alignItems: 'center',
    width: 72,
  },
  avatarRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: instagramTheme.colors.orange,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  userLabel: {
    color: instagramTheme.colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
    width: '100%',
    textAlign: 'center',
  },
});

const postStyles = StyleSheet.create({
  card: {
    marginBottom: 32,
    borderBottomWidth: 1,
    borderBottomColor: instagramTheme.colors.border,
    paddingBottom: 16,
    width: 470,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  userInfo: {
    marginLeft: 12,
    flex: 1,
  },
  username: {
    color: instagramTheme.colors.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  location: {
    color: instagramTheme.colors.textSecondary,
    fontSize: 11,
  },
  media: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 4,
    backgroundColor: '#050505',
  },
  textContainer: {
    width: '100%',
    aspectRatio: 1.5,
    backgroundColor: instagramTheme.colors.surface,
    borderWidth: 1,
    borderColor: instagramTheme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    borderRadius: 4,
  },
  textPostContent: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thundersText: {
    color: instagramTheme.colors.text,
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 6,
  },
  captionContainer: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  captionText: {
    color: instagramTheme.colors.text,
    fontSize: 14,
    lineHeight: 18,
  },
  captionUser: {
    fontWeight: 'bold',
  },
  timeText: {
    color: instagramTheme.colors.textSecondary,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  commentsBlock: {
    marginTop: 8,
    gap: 4,
  },
  viewAllText: {
    color: instagramTheme.colors.textSecondary,
    fontSize: 13,
  },
  commentLine: {
    flexDirection: 'row',
  },
  commentText: {
    color: instagramTheme.colors.text,
    fontSize: 13,
  },
  commentUser: {
    fontWeight: 'bold',
  },
  addCommentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: instagramTheme.colors.border,
    paddingTop: 12,
    marginTop: 12,
  },
  commentInput: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    backgroundColor: 'transparent',
    borderWidth: 0,
    outlineStyle: 'none' as any,
  },
  postCommentBtn: {
    color: instagramTheme.colors.blue,
    fontWeight: 'bold',
    fontSize: 13,
    paddingHorizontal: 8,
  },
} as any);

const rightSidebarStyles = StyleSheet.create({
  container: {
    width: 320,
    paddingHorizontal: 24,
    paddingTop: 24,
    height: '100%',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarLarge: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  userInfo: {
    marginLeft: 16,
    flex: 1,
  },
  username: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  display: {
    color: instagramTheme.colors.textSecondary,
    fontSize: 14,
  },
  actionLink: {
    color: instagramTheme.colors.blue,
    fontSize: 12,
    fontWeight: 'bold',
  },
  suggestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  suggestTitle: {
    color: instagramTheme.colors.textSecondary,
    fontWeight: 'bold',
    fontSize: 14,
  },
  seeAll: {
    color: instagramTheme.colors.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  suggestUser: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  suggestRelation: {
    color: instagramTheme.colors.textSecondary,
    fontSize: 11,
    width: 160,
  },
  footerText: {
    color: '#363636',
    fontSize: 11,
    marginTop: 32,
    lineHeight: 16,
  },
  copyright: {
    color: '#363636',
    fontSize: 11,
    marginTop: 16,
  },
});

const searchStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 32,
    height: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  searchInput: {
    height: 44,
    backgroundColor: instagramTheme.colors.surface,
    borderWidth: 1,
    borderColor: instagramTheme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 14,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: instagramTheme.colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  username: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  displayName: {
    color: instagramTheme.colors.textSecondary,
    fontSize: 12,
  },
  viewBtn: {
    backgroundColor: instagramTheme.colors.blue,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  emptyText: {
    color: instagramTheme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 48,
    fontSize: 14,
  },
});

const shortsStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  reelCard: {
    width: 340,
    height: 520,
    borderRadius: 8,
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: instagramTheme.colors.border,
    position: 'relative',
    overflow: 'hidden',
  },
  mockPlayer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayInfo: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 64,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  reelUser: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 8,
    fontSize: 14,
  },
  followBtn: {
    marginLeft: 12,
    borderWidth: 1,
    borderColor: '#fff',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  followText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  reelDesc: {
    color: '#fff',
    fontSize: 13,
  },
  actions: {
    position: 'absolute',
    right: 12,
    bottom: 24,
    gap: 20,
    alignItems: 'center',
  },
  actionItem: {
    alignItems: 'center',
  },
  actionCount: {
    color: '#fff',
    fontSize: 11,
    marginTop: 4,
  },
});

const inboxStyles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#000000',
    borderLeftWidth: 0.5,
    borderLeftColor: instagramTheme.colors.border,
    height: '100%',
  },
  inboxList: {
    width: 380,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#000000',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  newHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  headerAvatarBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#121212',
    borderWidth: 1.5,
    borderColor: '#F59A18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inboxTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  e2eeSubtitle: {
    color: '#A8A8A8',
    fontSize: 11,
    fontWeight: '500',
  },
  composeBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F59A18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121212',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 14,
    height: 44,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    color: '#FFFFFF',
    fontSize: 13,
  },
  tabSegmentRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  subTabBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  subTabActive: {
    backgroundColor: '#F59A18',
  },
  subTabInactive: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  subTabText: {
    fontSize: 13,
  },
  subTabTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  subTabTextInactive: {
    color: '#A8A8A8',
    fontWeight: '500',
  },
  cardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121212',
    borderRadius: 26,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  cardItemActive: {
    backgroundColor: '#1A1A1A',
    borderColor: '#F59A18',
  },
  cardAvatarWrapper: {
    position: 'relative',
    marginRight: 14,
  },
  cardAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1E1E1E',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1E1E1E',
  },

  activeDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: '#F59A18',
    borderWidth: 2,
    borderColor: '#121212',
  },
  cardMiddleColumn: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 8,
  },
  cardName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  cardLastMsg: {
    color: '#A8A8A8',
    fontSize: 12,
    marginTop: 3,
  },
  cardRightColumn: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 42,
  },
  cardTime: {
    color: '#777777',
    fontSize: 11,
  },
  unreadBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F59A18',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  unreadBadgeText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '800',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },

  chatWindow: {
    flex: 1,
    backgroundColor: '#000000',
    height: '100%',
  },
  windowHeader: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: instagramTheme.colors.border,
  },
  windowTitle: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  windowSubtitle: {
    color: instagramTheme.colors.textSecondary,
    fontSize: 11,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  actionIcon: {
    padding: 4,
  },
  e2eeBanner: {
    backgroundColor: 'rgba(245, 154, 24, 0.08)',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(245, 154, 24, 0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  e2eeBannerText: {
    color: instagramTheme.colors.orange,
    fontSize: 11,
    flex: 1,
  },
  messageScroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 20,
    gap: 12,
  },
  encryptionHandshakeCard: {
    backgroundColor: instagramTheme.colors.surface,
    borderWidth: 1,
    borderColor: instagramTheme.colors.border,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
    gap: 6,
  },
  handshakeTitle: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
    marginTop: 4,
  },
  handshakeKey: {
    color: instagramTheme.colors.textSecondary,
    fontSize: 10,
    fontFamily: 'monospace',
  },
  msgRow: {
    width: '100%',
    flexDirection: 'row',
  },
  msgLeft: {
    justifyContent: 'flex-start',
  },
  msgRight: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '65%',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  bubbleMe: {
    backgroundColor: instagramTheme.colors.orange,
    borderBottomRightRadius: 2,
  },
  bubblePeer: {
    backgroundColor: instagramTheme.colors.messagePeer,
    borderBottomLeftRadius: 2,
  },
  bubbleText: {
    color: '#fff',
    fontSize: 14,
  },
  bubbleCipher: {
    color: 'rgba(0,0,0,0.4)',
    fontSize: 9,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  inputBarRow: {
    height: 72,
    borderTopWidth: 0.5,
    borderTopColor: instagramTheme.colors.border,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  chatField: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: instagramTheme.colors.border,
    paddingHorizontal: 20,
    color: '#fff',
    fontSize: 13,
  },
  sendMessageLink: {
    color: instagramTheme.colors.blue,
    fontWeight: 'bold',
    fontSize: 14,
  },
  inboxPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  placeholderTitle: {
    color: '#fff',
    fontWeight: '400',
    fontSize: 20,
    marginTop: 16,
  },
  placeholderText: {
    color: instagramTheme.colors.textSecondary,
    textAlign: 'center',
    fontSize: 14,
    marginTop: 8,
    maxWidth: 260,
  },
});

const profileStyles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 80,
    paddingVertical: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 44,
    gap: 80,
  },
  avatar: {
    width: 150,
    height: 150,
    borderRadius: 75,
  },
  infoBlock: {
    flex: 1,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 20,
  },
  username: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '300',
  },
  editBtn: {
    backgroundColor: '#363636',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  editBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  followBtn: {
    backgroundColor: instagramTheme.colors.blue,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 40,
    marginBottom: 20,
  },
  stat: {
    color: '#fff',
    fontSize: 16,
  },
  statVal: {
    fontWeight: 'bold',
  },
  displayName: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 4,
  },
  bioText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 18,
  },
  webLink: {
    color: instagramTheme.colors.blue,
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 4,
  },
  tabsHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: instagramTheme.colors.border,
    gap: 60,
    paddingTop: 16,
    marginBottom: 16,
  },
  activeTabLabel: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 1,
    borderTopWidth: 1,
    borderTopColor: '#fff',
    paddingTop: 12,
    marginTop: -17,
  },
  inactiveTabLabel: {
    color: instagramTheme.colors.textSecondary,
    fontSize: 12,
    letterSpacing: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
  },
  gridCell: {
    width: 290,
    aspectRatio: 1,
    backgroundColor: '#050505',
    borderWidth: 0.5,
    borderColor: instagramTheme.colors.border,
  },
  gridImg: {
    width: '100%',
    height: '100%',
  },
  textGridPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  textGridContent: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
  },
});

const callStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: 360,
    backgroundColor: instagramTheme.colors.surface,
    borderWidth: 1,
    borderColor: instagramTheme.colors.border,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  peerName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
  },
  statusText: {
    color: instagramTheme.colors.orange,
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 4,
  },
  logBox: {
    width: '100%',
    height: 180,
    backgroundColor: '#000',
    borderRadius: 8,
    marginTop: 20,
  },
  logLine: {
    color: '#00ff00',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  hangupBtn: {
    backgroundColor: instagramTheme.colors.red,
    height: 44,
    width: '100%',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
});

const createModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: 480,
    backgroundColor: instagramTheme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: instagramTheme.colors.border,
    overflow: 'hidden',
  },
  header: {
    height: 52,
    borderBottomWidth: 0.5,
    borderBottomColor: instagramTheme.colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  title: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  body: {
    padding: 20,
    gap: 16,
  },
  captionField: {
    color: '#fff',
    fontSize: 14,
    height: 120,
    textAlignVertical: 'top',
    backgroundColor: 'transparent',
    borderWidth: 0,
    outlineStyle: 'none' as any,
  },
  urlField: {
    height: 40,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: instagramTheme.colors.border,
    paddingHorizontal: 12,
    color: '#fff',
    fontSize: 13,
    backgroundColor: 'transparent',
    outlineStyle: 'none' as any,
  },
} as any);

const authStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
  },
  tagline: {
    color: instagramTheme.colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  errorText: {
    color: instagramTheme.colors.red,
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputLabel: {
    color: '#8e8e8e',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
    alignSelf: 'flex-start',
    letterSpacing: 0.8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    backgroundColor: '#0c0c0c',
    borderWidth: 1,
    borderColor: '#202020',
    borderRadius: 24,
    paddingHorizontal: 16,
    marginBottom: 16,
    width: '100%',
  },
  innerInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    outlineStyle: 'none' as any,
    height: '100%',
  },
  btnGradient: {
    backgroundImage: 'linear-gradient(90deg, #FAD961 0%, #F76B1C 100%)',
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    width: '100%',
    marginBottom: 20,
    shadowColor: '#F76B1C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    boxShadow: '0px 4px 20px rgba(247, 107, 28, 0.4)',
    cursor: 'pointer',
  } as any,
  btnTextBlack: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 15,
  },
  googleBtn: {
    backgroundColor: '#0c0c0c',
    borderWidth: 1,
    borderColor: '#202020',
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    width: '100%',
    marginBottom: 16,
    cursor: 'pointer',
  } as any,
  googleBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: '#202020',
  },
  dividerText: {
    color: '#737373',
    fontSize: 11,
    fontWeight: 'bold',
    paddingHorizontal: 16,
  },
  toggle: {
    marginTop: 8,
  },
  toggleText: {
    color: '#8e8e8e',
    fontSize: 14,
    textAlign: 'center',
  },
  // Legacy styles for backward compatibility in streaming views
  input: {
    height: 38,
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#262626',
    borderRadius: 3,
    paddingHorizontal: 12,
    color: '#fff',
    fontSize: 12,
    marginBottom: 8,
    width: '100%',
  },
  btn: {
    backgroundColor: '#0095F6',
    height: 32,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    width: '100%',
    marginBottom: 20,
  },
  btnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
