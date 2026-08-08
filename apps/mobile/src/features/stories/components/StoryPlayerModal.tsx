import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Dimensions,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { X, Eye, Trash2 } from 'lucide-react-native';
import { StoryService, StoryItem, StoryViewerItem } from '@jamsh/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const REACTION_EMOJIS = ['⚡', '❤️', '🔥', '😂', '😮', '👏'];
const DEFAULT_IMAGE_DURATION_MS = 5000;

interface StoryPlayerModalProps {
  visible: boolean;
  authorId: string | null;
  currentUserId?: string;
  allAuthorIds?: string[];
  onClose: () => void;
  onAuthorChange?: (nextAuthorId: string) => void;
}

export const StoryPlayerModal: React.FC<StoryPlayerModalProps> = ({
  visible,
  authorId,
  currentUserId,
  allAuthorIds = [],
  onClose,
  onAuthorChange,
}) => {
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [viewersModalVisible, setViewersModalVisible] = useState<boolean>(false);
  const [viewersList, setViewersList] = useState<StoryViewerItem[]>([]);
  const [loadingViewers, setLoadingViewers] = useState<boolean>(false);
  const [myReaction, setMyReaction] = useState<string | null>(null);

  const progressAnim = useRef(new Animated.Value(0)).current;

  // Bounded memory window (previous, current, next)
  const visibleStories = useMemo(() => {
    if (stories.length === 0) return [];
    return stories.filter((_, idx) => Math.abs(idx - currentIndex) <= 1);
  }, [stories, currentIndex]);

  const currentStory = stories[currentIndex];
  const nextStory = stories[currentIndex + 1];
  const isOwner = currentStory && currentUserId && currentStory.user_id === currentUserId;

  // Image Prefetching for next story
  useEffect(() => {
    if (!nextStory) return;
    if (nextStory.media_type === 'image' && nextStory.media_url) {
      try {
        Image.prefetch(nextStory.media_url);
      } catch (e) {}
    }
  }, [nextStory]);

  useEffect(() => {
    if (!visible || !authorId) return;

    let isMounted = true;
    setLoading(true);
    setCurrentIndex(0);

    const loadStories = async () => {
      try {
        const userStories = await StoryService.getUserStories(authorId);
        if (isMounted) {
          setStories(userStories);
          if (userStories.length > 0) {
            const firstUnseenIdx = userStories.findIndex((s) => !s.is_viewed);
            setCurrentIndex(firstUnseenIdx >= 0 ? firstUnseenIdx : 0);
          } else {
            onClose();
          }
        }
      } catch (e) {
        console.error('[StoryPlayerModal] Error loading user stories:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadStories();

    return () => {
      isMounted = false;
    };
  }, [visible, authorId]);

  useEffect(() => {
    if (!currentStory || isPaused) return;

    StoryService.markStoryViewed(currentStory.id);
    setMyReaction(currentStory.my_reaction || null);

    progressAnim.setValue(0);
    const duration = DEFAULT_IMAGE_DURATION_MS;

    const anim = Animated.timing(progressAnim, {
      toValue: 1,
      duration,
      useNativeDriver: false,
    });

    anim.start(({ finished }) => {
      if (finished && !isPaused) {
        handleNextStory();
      }
    });

    return () => {
      anim.stop();
    };
  }, [currentIndex, currentStory, isPaused]);

  const handleNextStory = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      const currentAuthorIdx = allAuthorIds.indexOf(authorId || '');
      if (currentAuthorIdx >= 0 && currentAuthorIdx < allAuthorIds.length - 1) {
        const nextAuthor = allAuthorIds[currentAuthorIdx + 1];
        if (onAuthorChange) onAuthorChange(nextAuthor);
      } else {
        onClose();
      }
    }
  };

  const handlePrevStory = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    } else {
      const currentAuthorIdx = allAuthorIds.indexOf(authorId || '');
      if (currentAuthorIdx > 0) {
        const prevAuthor = allAuthorIds[currentAuthorIdx - 1];
        if (onAuthorChange) onAuthorChange(prevAuthor);
      }
    }
  };

  const handleReact = async (emoji: string) => {
    if (!currentStory) return;
    try {
      const newReaction = myReaction === emoji ? null : emoji;
      setMyReaction(newReaction);
      await StoryService.reactToStory(currentStory.id, emoji);
    } catch (e) {
      console.error('[StoryPlayerModal] React error:', e);
    }
  };

  const handleLoadViewers = async () => {
    if (!currentStory) return;
    setIsPaused(true);
    setLoadingViewers(true);
    setViewersModalVisible(true);
    try {
      const list = await StoryService.getStoryViewers(currentStory.id);
      setViewersList(list);
    } catch (e) {
      console.error('[StoryPlayerModal] Error fetching viewers:', e);
    } finally {
      setLoadingViewers(false);
    }
  };

  const handleDeleteStory = async () => {
    if (!currentStory) return;
    try {
      await StoryService.deleteStory(currentStory.id);
      const remaining = stories.filter((s) => s.id !== currentStory.id);
      if (remaining.length === 0) {
        onClose();
      } else {
        setStories(remaining);
        setCurrentIndex((prev) => (prev >= remaining.length ? remaining.length - 1 : prev));
      }
    } catch (e) {
      console.error('[StoryPlayerModal] Delete error:', e);
    }
  };

  if (!visible || !authorId) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.container}>
        {loading || !currentStory ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#F59A18" />
          </View>
        ) : (
          <View style={styles.mediaContainer}>
            <Image source={{ uri: currentStory.media_url }} style={styles.mediaImage} resizeMode="cover" />

            <View style={styles.touchOverlay}>
              <TouchableOpacity
                activeOpacity={1}
                style={styles.touchLeft}
                onPress={handlePrevStory}
                onPressIn={() => setIsPaused(true)}
                onPressOut={() => setIsPaused(false)}
              />
              <TouchableOpacity
                activeOpacity={1}
                style={styles.touchRight}
                onPress={handleNextStory}
                onPressIn={() => setIsPaused(true)}
                onPressOut={() => setIsPaused(false)}
              />
            </View>

            <View style={styles.headerContainer}>
              <View style={styles.progressRow}>
                {stories.map((story, idx) => {
                  let progress = 0;
                  if (idx < currentIndex) progress = 1;

                  return (
                    <View key={story.id} style={styles.progressBarBackground}>
                      {idx === currentIndex ? (
                        <Animated.View
                          style={[
                            styles.progressBarFill,
                            {
                              width: progressAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: ['0%', '100%'],
                              }),
                            },
                          ]}
                        />
                      ) : (
                        <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
                      )}
                    </View>
                  );
                })}
              </View>

              <View style={styles.userInfoRow}>
                <Image
                  source={{ uri: currentStory.user?.avatar_url || 'https://assets.jamsh.app/sample_avatar.jpg' }}
                  style={styles.userAvatar}
                />
                <View style={styles.userMeta}>
                  <Text style={styles.userName}>{currentStory.user?.display_name || currentStory.user?.username || 'User'}</Text>
                  <Text style={styles.timeAgo}>
                    {new Date(currentStory.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>

                <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
                  <X size={24} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>

            {currentStory.caption && (
              <View style={styles.captionContainer}>
                <Text style={styles.captionText}>{currentStory.caption}</Text>
              </View>
            )}

            <View style={styles.bottomBar}>
              {isOwner ? (
                <View style={styles.ownerBar}>
                  <TouchableOpacity style={styles.viewersBtn} onPress={handleLoadViewers}>
                    <Eye size={18} color="#FFF" />
                    <Text style={styles.viewersText}>{currentStory.views_count || 0} Views</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteStory}>
                    <Trash2 size={18} color="#FF4B72" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.reactionRow}>
                  {REACTION_EMOJIS.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      style={[styles.emojiBtn, myReaction === emoji && styles.emojiBtnActive]}
                      onPress={() => handleReact(emoji)}
                    >
                      <Text style={styles.emojiText}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        <Modal
          visible={viewersModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => {
            setViewersModalVisible(false);
            setIsPaused(false);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.viewersSheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Story Views ({viewersList.length})</Text>
                <TouchableOpacity
                  onPress={() => {
                    setViewersModalVisible(false);
                    setIsPaused(false);
                  }}
                >
                  <X size={20} color="#FFF" />
                </TouchableOpacity>
              </View>

              {loadingViewers ? (
                <ActivityIndicator size="small" color="#F59A18" style={{ marginTop: 24 }} />
              ) : viewersList.length === 0 ? (
                <Text style={styles.emptyText}>No views yet</Text>
              ) : (
                <View style={styles.viewerListContainer}>
                  {viewersList.map((v) => (
                    <View key={v.id} style={styles.viewerItem}>
                      <Image source={{ uri: v.avatar_url || 'https://assets.jamsh.app/sample_avatar.jpg' }} style={styles.viewerAvatar} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.viewerName}>{v.display_name || v.username}</Text>
                        <Text style={styles.viewerTime}>
                          {new Date(v.viewed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
    justifyContent: 'center',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  touchOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    zIndex: 10,
  },
  touchLeft: {
    flex: 3,
  },
  touchRight: {
    flex: 7,
  },
  headerContainer: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 20,
  },
  progressRow: {
    flexDirection: 'row',
    height: 3,
    gap: 4,
  },
  progressBarBackground: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFF',
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FFF',
  },
  userMeta: {
    flex: 1,
    marginLeft: 10,
  },
  userName: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  timeAgo: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
  },
  iconBtn: {
    padding: 6,
  },
  captionContainer: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 12,
    borderRadius: 12,
    zIndex: 20,
  },
  captionText: {
    color: '#FFF',
    fontSize: 14,
    textAlign: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 20,
  },
  reactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 24,
    paddingVertical: 8,
  },
  emojiBtn: {
    padding: 8,
    borderRadius: 20,
  },
  emojiBtnActive: {
    backgroundColor: 'rgba(245, 154, 24, 0.3)',
  },
  emojiText: {
    fontSize: 22,
  },
  ownerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  viewersText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 13,
    marginLeft: 6,
  },
  deleteBtn: {
    backgroundColor: 'rgba(255, 75, 114, 0.2)',
    padding: 10,
    borderRadius: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  viewersSheet: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: SCREEN_HEIGHT * 0.5,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 12,
  },
  sheetTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    color: '#A8A8A8',
    textAlign: 'center',
    marginTop: 24,
    fontSize: 14,
  },
  viewerListContainer: {
    marginTop: 12,
  },
  viewerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  viewerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  viewerName: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  viewerTime: {
    color: '#A8A8A8',
    fontSize: 11,
    marginTop: 2,
  },
});
