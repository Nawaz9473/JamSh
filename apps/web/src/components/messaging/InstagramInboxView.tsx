import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Search, Edit3, ShieldCheck, Zap, Check, CheckCheck, Clock, AlertCircle, Users, MessageSquarePlus } from 'lucide-react';
import { ChatRoom } from '@jamsh/types';
import { MessagingService, fetchChatRooms, decryptReceivedMessage, supabase, useAuthStore } from '@jamsh/api';

interface InstagramInboxViewProps {
  selectedRoomId: string | null;
  onSelectRoom: (room: ChatRoom) => void;
  onOpenCompose?: () => void;
  onOpenNewMessage?: () => void;
  onOpenCreateGroup?: () => void;
  isMobile?: boolean;
}

export const InstagramInboxView: React.FC<InstagramInboxViewProps> = ({
  selectedRoomId,
  onSelectRoom,
  onOpenCompose,
  onOpenNewMessage,
  onOpenCreateGroup,
  isMobile = false,
}) => {
  const [subTab, setSubTab] = useState<'messages' | 'requests'>('messages');
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<ChatRoom[]>([]);
  const [requestsCount, setRequestsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const currentUser = useAuthStore((s) => s.user);

  const handleNewMessage = onOpenNewMessage || onOpenCompose || (() => {});
  const handleCreateGroup = onOpenCreateGroup || onOpenCompose || (() => {});

  // Load conversations on mount, tab switch, and selected room change
  const loadConversations = async () => {
    setIsLoading(true);
    try {
      const rooms = await fetchChatRooms(subTab);
      setConversations(rooms);

      // Fetch pending requests count if on main tab
      if (subTab === 'messages') {
        const reqRooms = await fetchChatRooms('requests');
        setRequestsCount(reqRooms.length);
      }
    } catch (e) {
      console.error('[InboxView] Error loading conversations:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [subTab, selectedRoomId]);

  // Setup Supabase Realtime Subscription for instant inbox reordering
  useEffect(() => {
    if (!currentUser) return;

    // Realtime channel listening to chat_rooms & messages changes
    const channel = supabase
      .channel(`inbox-realtime-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_rooms',
        },
        (payload) => {
          loadConversations();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload: any) => {
          const newMsg = payload.new;
          if (MessagingService.isDuplicateMessage(newMsg.id)) return;

          let preview = newMsg.content;
          if (newMsg.type === 'image') preview = '📷 Photo';
          else if (newMsg.type === 'video') preview = '🎥 Video';
          else if (newMsg.type === 'voice') preview = '🎤 Voice Message';
          else {
            if (typeof localStorage !== 'undefined') {
              const cached = localStorage.getItem('jamsh_plain_room_' + newMsg.room_id) || localStorage.getItem('jamsh_plain_' + newMsg.id) || localStorage.getItem('jamsh_plain_' + newMsg.content);
              if (cached) preview = cached;
            }
            if (!preview || preview.endsWith('==') || (preview.length > 50 && !preview.includes(' '))) {
              try {
                const dec = await decryptReceivedMessage(newMsg, newMsg.sender_id);
                if (dec) preview = dec;
              } catch (e) {}
            }
          }

          if (typeof localStorage !== 'undefined' && preview && !preview.endsWith('==')) {
            try {
              localStorage.setItem('jamsh_plain_room_' + newMsg.room_id, preview);
            } catch (e) {}
          }

          // Reorder conversations in state immediately
          setConversations((prev) => {
            const updated = prev.map((r) => {
              if (r.id === newMsg.room_id) {
                return {
                  ...r,
                  last_message_at: newMsg.created_at,
                  last_message_preview: preview,
                  last_message_sender_id: newMsg.sender_id,
                  unread_count: (r.unread_count || 0) + (newMsg.sender_id !== currentUser.id ? 1 : 0),
                };
              }
              return r;
            });

            return MessagingService.sortConversations(updated);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, subTab]);

  // Filter conversations by search term
  const filteredConversations = conversations.filter((room) => {
    const targetName = room.name || room.peer?.display_name || room.peer?.username || '';
    return targetName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <View style={[styles.container, isMobile && styles.containerMobile]}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleGroup}>
          <View style={styles.headerBadge}>
            <Zap size={20} color="#F59A18" />
          </View>
          <View>
            <Text style={styles.inboxTitle}>Direct</Text>
            <View style={styles.e2eeRow}>
              <ShieldCheck size={12} color="#F59A18" />
              <Text style={styles.e2eeSubtitle}>End-to-end encrypted</Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleNewMessage}
            style={styles.composeBtn}
            accessibilityLabel="New Direct Message"
          >
            <Edit3 size={18} color="#000000" />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleCreateGroup}
            style={[styles.composeBtn, { backgroundColor: '#262626' }]}
            accessibilityLabel="Create Group"
          >
            <Users size={18} color="#F59A18" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.searchBar}>
        <Search size={18} color="#8E8E93" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search messages or people..."
          placeholderTextColor="#8E8E93"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Segmented Sub-Tabs (Messages / Requests) */}
      <View style={styles.subTabRow}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setSubTab('messages')}
          style={[styles.subTabBtn, subTab === 'messages' && styles.subTabActive]}
        >
          <Text style={[styles.subTabText, subTab === 'messages' && styles.subTabTextActive]}>
            Messages
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setSubTab('requests')}
          style={[styles.subTabBtn, subTab === 'requests' && styles.subTabActive]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.subTabText, subTab === 'requests' && styles.subTabTextActive]}>
              Requests
            </Text>
            {requestsCount > 0 && (
              <View style={styles.requestsCountBadge}>
                <Text style={styles.requestsCountText}>{requestsCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Conversation List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#F59A18" />
        </View>
      ) : filteredConversations.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            {subTab === 'requests' ? 'No pending message requests' : 'No messages found'}
          </Text>
          {subTab === 'messages' && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleNewMessage}
                style={{ backgroundColor: '#F59A18', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 }}
              >
                <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 12 }}>Send Message</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleCreateGroup}
                style={{ backgroundColor: '#262626', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 }}
              >
                <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 12 }}>Create Group</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {filteredConversations.map((room) => {
            const isSelected = selectedRoomId === room.id;
            const isGroup = room.type === 'group';
            const peer = room.peer;
            const avatarUrl = isGroup ? room.avatar_url : peer?.avatar_url;
            const roomTitle = room.name || peer?.display_name || peer?.username || 'User';

            let rawPreview = room.last_message_preview || (isGroup ? 'Group chat active' : 'Handshake verified');
            if (typeof localStorage !== 'undefined') {
              const cached = localStorage.getItem('jamsh_plain_room_' + room.id) || localStorage.getItem('jamsh_plain_' + rawPreview) || localStorage.getItem('jamsh_plain_' + room.id);
              if (cached) rawPreview = cached;
            }
            if (rawPreview.endsWith('==') || (rawPreview.length > 50 && !rawPreview.includes(' '))) {
              rawPreview = isGroup ? 'Group message' : 'Message';
            }

            const messagePreview = rawPreview;
            const timeAgoStr = MessagingService.formatTimeAgo(room.last_message_at || room.created_at);
            const unread = room.unread_count || 0;
            const isSentByMe = room.last_message_sender_id === currentUser?.id;

            return (
              <TouchableOpacity
                key={room.id}
                activeOpacity={0.85}
                onPress={() => onSelectRoom(room)}
                style={[styles.cardItem, isSelected && styles.cardItemActive]}
              >
                {/* Avatar */}
                <View style={styles.avatarWrapper}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={roomTitle} style={styles.avatarImg as any} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarFallbackText}>
                        {roomTitle.substring(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.activeDot} />
                </View>

                {/* Middle info */}
                <View style={styles.cardMiddle}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {roomTitle}
                    </Text>
                    <ShieldCheck size={13} color="#F59A18" />
                  </View>
                  <Text style={styles.cardLastMsg} numberOfLines={1}>
                    {isSentByMe ? `You: ${messagePreview}` : messagePreview}
                  </Text>
                </View>

                {/* Right side status & badge */}
                <View style={styles.cardRight}>
                  <Text style={styles.cardTime}>{timeAgoStr}</Text>
                  {unread > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{unread}</Text>
                    </View>
                  ) : isSentByMe ? (
                    <CheckCheck size={14} color="#8E8E93" />
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 350,
    height: '100%',
    backgroundColor: '#0A0A0A',
    borderRightWidth: 1,
    borderRightColor: '#1F1F1F',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  containerMobile: {
    width: '100%',
    borderRightWidth: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(245, 154, 24, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inboxTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Outfit, sans-serif',
  },
  e2eeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  e2eeSubtitle: {
    color: '#F59A18',
    fontSize: 11,
    fontWeight: '500',
  },
  composeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F59A18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161616',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    padding: 0,
  },
  subTabRow: {
    flexDirection: 'row',
    backgroundColor: '#161616',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  subTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  subTabActive: {
    backgroundColor: '#262626',
  },
  subTabText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
  },
  subTabTextActive: {
    color: '#FFFFFF',
  },
  requestsCountBadge: {
    backgroundColor: '#F59A18',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  requestsCountText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '700',
  },
  loadingContainer: {
    marginTop: 32,
    alignItems: 'center',
  },
  emptyState: {
    marginTop: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 14,
  },
  cardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    marginBottom: 4,
    gap: 12,
  },
  cardItemActive: {
    backgroundColor: 'rgba(245, 154, 24, 0.1)',
  },
  avatarWrapper: {
    position: 'relative',
    width: 48,
    height: 48,
  },
  avatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    objectFit: 'cover',
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#262626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFallbackText: {
    color: '#F59A18',
    fontSize: 18,
    fontWeight: '700',
  },
  activeDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#34C759',
    borderWidth: 2,
    borderColor: '#0A0A0A',
  },
  cardMiddle: {
    flex: 1,
  },
  cardName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  cardLastMsg: {
    color: '#8E8E93',
    fontSize: 13,
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  cardTime: {
    color: '#8E8E93',
    fontSize: 12,
  },
  unreadBadge: {
    backgroundColor: '#F59A18',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  unreadBadgeText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '700',
  },
});
