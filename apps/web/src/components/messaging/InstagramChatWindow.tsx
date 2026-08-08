import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import {
  ArrowLeft,
  Send,
  ShieldCheck,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  ChevronDown,
  Image as ImageIcon,
  Mic,
  Smile,
  Phone,
  Video,
  Info,
} from 'lucide-react';
import { ChatRoom, Message } from '@jamsh/types';
import {
  MessagingService,
  fetchMessages,
  sendEncryptedMessage,
  markRoomAsSeen,
  acceptMessageRequest,
  decryptReceivedMessage,
  supabase,
  useAuthStore,
} from '@jamsh/api';

interface InstagramChatWindowProps {
  room: ChatRoom;
  onBack?: () => void;
  isMobile?: boolean;
}

export const InstagramChatWindow: React.FC<InstagramChatWindowProps> = ({
  room,
  onBack,
  isMobile = false,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoadingMessages, setIsLoadingLoadingMessages] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [showNewMessagesPill, setShowNewMessagesPill] = useState(false);
  const [roomStatus, setRoomStatus] = useState<'pending' | 'accepted' | 'archived' | 'blocked'>(
    room.status || 'accepted'
  );

  const scrollViewRef = useRef<ScrollView>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const typingTimeoutRef = useRef<any>(null);

  const currentUser = useAuthStore((s) => s.user);
  const peer = room.peer;
  const roomTitle = room.name || peer?.display_name || peer?.username || 'Chat Partner';
  const avatarUrl = room.type === 'group' ? room.avatar_url : peer?.avatar_url;

  // Helper to decrypt message list
  const decryptMessageList = async (list: Message[]): Promise<Message[]> => {
    return Promise.all(
      list.map(async (msg) => {
        try {
          const plain = await decryptReceivedMessage(msg, msg.sender_id);
          return { ...msg, decrypted: plain };
        } catch (e) {
          return msg;
        }
      })
    );
  };

  // Load initial message chunk (last 40 messages)
  const loadInitialMessages = async () => {
    setIsLoadingLoadingMessages(true);
    try {
      const initial = await fetchMessages(room.id, 40);
      const decryptedList = await decryptMessageList(initial);
      setMessages(decryptedList);

      // Auto-scroll to bottom immediately
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: false });
        isAtBottomRef.current = true;
      }, 50);

      // Mark messages as seen if we are at bottom
      await markRoomAsSeen(room.id);
    } catch (e) {
      console.error('[ChatWindow] Error loading messages:', e);
    } finally {
      setIsLoadingLoadingMessages(false);
    }
  };

  useEffect(() => {
    setRoomStatus(room.status || 'accepted');
    setShowNewMessagesPill(false);
    loadInitialMessages();
  }, [room.id]);

  // Realtime subscription for incoming messages & typing status
  useEffect(() => {
    if (!currentUser) return;

    // 1. Postgres Changes for messages in this room
    const msgChannel = supabase
      .channel(`room-messages-${room.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${room.id}`,
        },
        async (payload: any) => {
          const newMsg: Message = payload.new;
          if (MessagingService.isDuplicateMessage(newMsg.id)) return;

          let decryptedMsg = newMsg;
          try {
            const plain = await decryptReceivedMessage(newMsg, newMsg.sender_id);
            decryptedMsg = { ...newMsg, decrypted: plain };
          } catch (e) {}

          setMessages((prev) => {
            // Replace optimistic sending message if temp_id matches or append
            const exists = prev.some((m) => m.id === decryptedMsg.id || (m.temp_id && m.temp_id === decryptedMsg.temp_id));
            if (exists) {
              return prev.map((m) => (m.id === decryptedMsg.id || (m.temp_id && m.temp_id === decryptedMsg.temp_id) ? decryptedMsg : m));
            }
            return [...prev, decryptedMsg];
          });

          // Handle Scroll behavior
          if (isAtBottomRef.current) {
            setTimeout(() => {
              scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 50);
            await markRoomAsSeen(room.id);
          } else {
            setShowNewMessagesPill(true);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${room.id}`,
        },
        (payload: any) => {
          const updatedMsg: Message = payload.new;
          setMessages((prev) =>
            prev.map((m) => (m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m))
          );
        }
      )
      .subscribe();

    // 2. Broadcast Channel for Typing Indicator
    const typingChannel = supabase.channel(`typing-${room.id}`);
    typingChannel
      .on('broadcast', { event: 'typing' }, (payload: any) => {
        if (payload.payload?.userId !== currentUser.id) {
          setIsPeerTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => {
            setIsPeerTyping(false);
          }, 3000);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(typingChannel);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [room.id, currentUser]);

  // Load older messages on upward infinite scroll
  const handleLoadOlder = async () => {
    if (isLoadingMore || !hasMoreOlder || messages.length === 0) return;
    setIsLoadingMore(true);

    try {
      const oldestTimestamp = messages[0].created_at;
      const olderChunk = await fetchMessages(room.id, 30, oldestTimestamp);

      if (olderChunk.length < 30) {
        setHasMoreOlder(false);
      }

      if (olderChunk.length > 0) {
        const decryptedOlder = await decryptMessageList(olderChunk);
        setMessages((prev) => [...decryptedOlder, ...prev]);
      }
    } catch (e) {
      console.error('[ChatWindow] Error loading older messages:', e);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Scroll Position Listener
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;

    // Check if user is at bottom (< 50px offset)
    const isAtBottom = distanceFromBottom < 50;
    isAtBottomRef.current = isAtBottom;

    if (isAtBottom && showNewMessagesPill) {
      setShowNewMessagesPill(false);
      markRoomAsSeen(room.id);
    }

    // Check if user scrolled near top (< 100px) -> load older messages
    if (contentOffset.y < 100 && !isLoadingMore && hasMoreOlder) {
      handleLoadOlder();
    }
  };

  // Broadcast Typing Presence
  const handleInputChange = (text: string) => {
    setInputText(text);
    if (currentUser) {
      supabase.channel(`typing-${room.id}`).send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUser.id },
      });
    }
  };

  // Send Message with Optimistic UI & Retry Support
  const handleSendMessage = async () => {
    if (!inputText.trim() || !currentUser) return;

    const content = inputText.trim();
    setInputText('');

    const tempId = `temp_${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      temp_id: tempId,
      room_id: room.id,
      sender_id: currentUser.id,
      content,
      type: 'text',
      is_encrypted: true,
      status: 'sending',
      created_at: new Date().toISOString(),
    };

    // Optimistically append message
    setMessages((prev) => [...prev, optimisticMsg]);

    // Auto-scroll to bottom
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
      isAtBottomRef.current = true;
    }, 50);

    try {
      const recipientId = room.type === 'group' ? '' : peer?.id || '';
      const realMsg = await sendEncryptedMessage(room.id, recipientId, content);

      // Replace optimistic message with confirmed server message
      setMessages((prev) =>
        prev.map((m) => (m.temp_id === tempId ? { ...realMsg, decrypted: realMsg.decrypted || content, status: 'sent' } : m))
      );
    } catch (e) {
      console.error('[ChatWindow] Error sending message:', e);
      // Mark optimistic message as failed
      setMessages((prev) =>
        prev.map((m) => (m.temp_id === tempId ? { ...m, status: 'failed' } : m))
      );
    }
  };

  // Accept Message Request Action
  const handleAcceptRequest = async () => {
    try {
      await acceptMessageRequest(room.id);
      setRoomStatus('accepted');
      await loadInitialMessages();
    } catch (e) {
      console.error('[ChatWindow] Error accepting message request:', e);
    }
  };

  // Render Status Badge for Sent Messages (○, ✓, ✓✓, Seen)
  const renderStatusBadge = (msg: Message) => {
    if (msg.sender_id !== currentUser?.id) return null;

    const status = MessagingService.resolveMessageStatus(msg, currentUser?.id || '');

    if (status === 'sending') {
      return <Clock size={12} color="#8E8E93" />;
    }
    if (status === 'failed') {
      return <AlertCircle size={12} color="#FF3B30" />;
    }
    if (status === 'seen') {
      return <Text style={styles.seenBadgeText}>Seen</Text>;
    }
    if (status === 'delivered') {
      return <CheckCheck size={14} color="#F59A18" />;
    }
    return <Check size={14} color="#8E8E93" />;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {isMobile && (
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <ArrowLeft size={20} color="#FFFFFF" />
            </TouchableOpacity>
          )}

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

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.headerTitle}>{roomTitle}</Text>
              <ShieldCheck size={14} color="#F59A18" />
            </View>
            <Text style={styles.headerSubtitle}>
              {isPeerTyping ? 'Typing...' : 'Active now'}
            </Text>
          </View>
        </View>

        {/* Action icons */}
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn}>
            <Phone size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
            <Video size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
            <Info size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Pending Message Request Banner */}
      {roomStatus === 'pending' && (
        <View style={styles.requestBanner}>
          <Text style={styles.requestBannerTitle}>
            {roomTitle} wants to send you a message
          </Text>
          <Text style={styles.requestBannerSubtitle}>
            They won't know you've seen their request until you accept.
          </Text>

          <View style={styles.requestBannerActions}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleAcceptRequest}
              style={styles.acceptBtn}
            >
              <Text style={styles.acceptBtnText}>Accept</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.declineBtn}>
              <Text style={styles.declineBtnText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Messages Scroll Area */}
      <View style={{ flex: 1, position: 'relative' }}>
        {isLoadingMessages ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#F59A18" />
          </View>
        ) : (
          <ScrollView
            ref={scrollViewRef}
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {isLoadingMore && (
              <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#F59A18" />
              </View>
            )}

            {messages.map((msg, index) => {
              const isMine = msg.sender_id === currentUser?.id;
              return (
                <View
                  key={msg.id || index}
                  style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowPeer]}
                >
                  <View
                    style={[
                      styles.msgBubble,
                      isMine ? styles.msgBubbleMine : styles.msgBubblePeer,
                    ]}
                  >
                    <Text
                      style={[
                        styles.msgText,
                        isMine ? styles.msgTextMine : styles.msgTextPeer,
                      ]}
                    >
                      {msg.decrypted || msg.content}
                    </Text>

                    <View style={styles.msgFooter}>
                      <Text style={styles.msgTime}>
                        {MessagingService.formatTimeAgo(msg.created_at)}
                      </Text>
                      {renderStatusBadge(msg)}
                    </View>
                  </View>
                </View>
              );
            })}

            {/* Peer Typing Dots Animation */}
            {isPeerTyping && (
              <View style={[styles.msgRow, styles.msgRowPeer]}>
                <View style={styles.typingBubble}>
                  <View style={styles.typingDot} />
                  <View style={styles.typingDot} />
                  <View style={styles.typingDot} />
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {/* Floating "New Messages ↓" Button */}
        {showNewMessagesPill && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => {
              scrollViewRef.current?.scrollToEnd({ animated: true });
              setShowNewMessagesPill(false);
            }}
            style={styles.newMessagesPill}
          >
            <Text style={styles.newMessagesPillText}>New Messages</Text>
            <ChevronDown size={16} color="#000000" />
          </TouchableOpacity>
        )}
      </View>

      {/* Input Bar */}
      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TouchableOpacity style={styles.mediaIconBtn}>
            <ImageIcon size={20} color="#8E8E93" />
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            placeholder="Message..."
            placeholderTextColor="#8E8E93"
            value={inputText}
            onChangeText={handleInputChange}
            multiline
          />

          <TouchableOpacity style={styles.mediaIconBtn}>
            <Mic size={20} color="#8E8E93" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.mediaIconBtn}>
            <Smile size={20} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleSendMessage}
          disabled={!inputText.trim()}
          style={[
            styles.sendBtn,
            inputText.trim() ? styles.sendBtnActive : styles.sendBtnDisabled,
          ]}
        >
          <Send size={18} color={inputText.trim() ? '#000000' : '#8E8E93'} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: '100%',
    backgroundColor: '#000000',
    flexDirection: 'column',
  },
  header: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F1F',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    marginRight: 4,
  },
  avatarWrapper: {
    position: 'relative',
    width: 40,
    height: 40,
  },
  avatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    objectFit: 'cover',
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#262626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFallbackText: {
    color: '#F59A18',
    fontSize: 16,
    fontWeight: '700',
  },
  activeDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34C759',
    borderWidth: 2,
    borderColor: '#000000',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#34C759',
    fontSize: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBtn: {
    padding: 8,
  },
  requestBanner: {
    backgroundColor: '#161616',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
    alignItems: 'center',
  },
  requestBannerTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  requestBannerSubtitle: {
    color: '#8E8E93',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
  },
  requestBannerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  acceptBtn: {
    backgroundColor: '#F59A18',
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 20,
  },
  acceptBtnText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 13,
  },
  declineBtn: {
    backgroundColor: '#262626',
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 20,
  },
  declineBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  msgRowMine: {
    justifyContent: 'flex-end',
  },
  msgRowPeer: {
    justifyContent: 'flex-start',
  },
  msgBubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  msgBubbleMine: {
    backgroundColor: '#F59A18',
    borderBottomRightRadius: 4,
  },
  msgBubblePeer: {
    backgroundColor: '#262626',
    borderBottomLeftRadius: 4,
  },
  msgText: {
    fontSize: 15,
    lineHeight: 20,
  },
  msgTextMine: {
    color: '#000000',
  },
  msgTextPeer: {
    color: '#FFFFFF',
  },
  msgFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  msgTime: {
    fontSize: 10,
    color: 'rgba(0, 0, 0, 0.5)',
  },
  seenBadgeText: {
    fontSize: 10,
    color: '#000000',
    fontWeight: '700',
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#262626',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8E8E93',
  },
  newMessagesPill: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F59A18',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#F59A18',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  newMessagesPillText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1F1F1F',
    backgroundColor: '#0A0A0A',
    gap: 10,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161616',
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  textInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    maxHeight: 100,
    paddingHorizontal: 8,
  },
  mediaIconBtn: {
    padding: 6,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnActive: {
    backgroundColor: '#F59A18',
  },
  sendBtnDisabled: {
    backgroundColor: '#161616',
  },
});
