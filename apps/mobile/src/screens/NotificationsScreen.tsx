import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { 
  Bell, 
  Zap, 
  MessageSquare, 
  User, 
  Shield, 
  Trash2, 
  Check 
} from 'lucide-react-native';
import { io } from 'socket.io-client';
import { 
  fetchNotifications, 
  fetchUnreadCounts, 
  markNotificationAsRead, 
  deleteNotification, 
  useAuthStore 
} from '@jamsh/api';

interface NotificationsScreenProps {
  navigation?: any;
}

export default function NotificationsScreen({ navigation }: NotificationsScreenProps) {
  const user = useAuthStore((state: any) => state.user);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
      console.error('[NotificationsScreen] Load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadNotificationsData(0, activeCategory, true);
    setPage(0);
  }, [activeCategory]);

  // Socket sync
  useEffect(() => {
    if (!user) return;
    const socket = io('http://localhost:3000', {
      query: { userId: user.id }
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

    return () => {
      socket.disconnect();
    };
  }, [user]);

  const handleRefresh = () => {
    setRefreshing(true);
    setPage(0);
    loadNotificationsData(0, activeCategory, true);
  };

  const handleLoadMore = () => {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadNotificationsData(nextPage, activeCategory, false);
  };

  const handleMarkRead = async (notifId: string) => {
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, status: 'READ' } : n));
    await markNotificationAsRead(notifId);

    // Track analytics
    try {
      await fetch('http://localhost:3000/notifications/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: notifId, status: 'opened', deviceType: 'mobile' })
      });
    } catch {}
  };

  const handleDelete = async (notifId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notifId));
    await deleteNotification(notifId);

    // Track analytics
    try {
      await fetch('http://localhost:3000/notifications/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: notifId, status: 'dismissed', deviceType: 'mobile' })
      });
    } catch {}
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
          ? `${actorName} and ${count - 1} others liked your post.`
          : `${actorName} liked your post.`;
      case 'COMMENT':
        return `${actorName} commented: "${item.metadata?.preview || '...'}"`;
      case 'REPLY':
        return `${actorName} replied: "${item.metadata?.preview || '...'}"`;
      case 'FOLLOW':
        return `${actorName} started following you.`;
      case 'FOLLOW_REQUEST':
        return `${actorName} sent a follow request.`;
      case 'FOLLOW_ACCEPTED':
        return `${actorName} accepted your follow request.`;
      case 'SECURITY':
        return `Security alert: ${item.metadata?.details || 'New login detected.'}`;
      default:
        return `New notification alert.`;
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const isUnread = item.status === 'UNREAD';
    return (
      <View style={[styles.notificationCard, isUnread && styles.unreadCard]}>
        {/* Sender Avatar */}
        <View style={styles.avatarContainer}>
          {item.sender?.avatarUrl ? (
            <Image source={{ uri: item.sender.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarText}>{item.sender?.username?.[0]?.toUpperCase() || 'U'}</Text>
            </View>
          )}
          <View style={styles.badgeOverlay}>
            {getCategoryIcon(item.type)}
          </View>
        </View>

        {/* Text Details */}
        <View style={styles.detailsContainer}>
          <TouchableOpacity onPress={() => handleMarkRead(item.id)}>
            <Text style={styles.notificationText}>{getNotificationText(item)}</Text>
          </TouchableOpacity>
          <Text style={styles.timeText}>Just now</Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          {isUnread && (
            <TouchableOpacity onPress={() => handleMarkRead(item.id)} style={styles.actionBtn}>
              <Check size={18} color="#F59A18" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionBtn}>
            <Trash2 size={18} color="#555" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Title Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
      </View>

      {/* Category List */}
      <View style={styles.categoryContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={['All', 'Likes', 'Comments', 'Follows', 'Mentions', 'AI']}
          keyExtractor={(item) => item}
          renderItem={({ item }) => {
            const isActive = activeCategory === item;
            return (
              <TouchableOpacity
                onPress={() => setActiveCategory(item)}
                style={[styles.categoryPill, isActive && styles.categoryPillActive]}
              >
                <Text style={[styles.categoryText, isActive && styles.categoryTextActive]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.categoryScroll}
        />
      </View>

      {/* List Feed */}
      <FlatList
        data={notifications}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.2}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#F59A18"
            colors={['#F59A18']}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Bell size={48} color="rgba(255,255,255,0.15)" />
              <Text style={styles.emptyText}>No notifications here yet.</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          loading ? (
            <ActivityIndicator color="#F59A18" style={styles.footerLoader} />
          ) : null
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
    fontFamily: 'System',
  },
  categoryContainer: {
    height: 48,
    marginBottom: 8,
  },
  categoryScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryPillActive: {
    backgroundColor: 'rgba(245, 154, 24, 0.15)',
    borderWidth: 1,
    borderColor: '#F59A18',
  },
  categoryText: {
    color: '#A8A8A8',
    fontSize: 13,
    fontWeight: '600',
  },
  categoryTextActive: {
    color: '#F59A18',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  unreadCard: {
    backgroundColor: 'rgba(245, 154, 24, 0.03)',
    borderColor: 'rgba(245, 154, 24, 0.08)',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  badgeOverlay: {
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
  },
  detailsContainer: {
    flex: 1,
    gap: 2,
  },
  notificationText: {
    color: '#F5F5F5',
    fontSize: 13,
    lineHeight: 18,
  },
  timeText: {
    color: '#777777',
    fontSize: 11,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 8,
  },
  actionBtn: {
    padding: 6,
  },
  emptyContainer: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#555555',
    fontSize: 14,
    marginTop: 12,
  },
  footerLoader: {
    paddingVertical: 16,
  },
});
