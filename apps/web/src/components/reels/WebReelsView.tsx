import React, { useCallback, useRef, useState, useEffect } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Bookmark,
  Heart,
  MessageCircle,
  Share2,
  Volume2,
  VolumeX,
  Plus,
  Send,
  Trash2,
  X,
  MoreVertical,
  Check,
  Edit2
} from 'lucide-react';
import {
  fetchReelsFeed,
  likeReel,
  shareReel,
  toggleReelSave,
  trackVideoInteraction,
  commentOnReel,
  fetchReelComments,
  deleteReelComment,
  deleteReel,
  updateReelMetadata,
  useAuthStore
} from '@jamsh/api';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

interface WebReelsViewProps {
  height: number;
  width: number;
  onNavigateProfile?: (userId: string) => void;
  onOpenCreateReel?: () => void;
}

export const WebReelsView: React.FC<WebReelsViewProps> = ({
  height,
  width,
  onNavigateProfile,
  onOpenCreateReel,
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Comments drawer state
  const [commentsOpenId, setCommentsOpenId] = useState<string | null>(null);
  const [commentsList, setCommentsList] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);

  // Options menu state (for own reels)
  const [optionsOpenId, setOptionsOpenId] = useState<string | null>(null);

  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const currentUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['web-reels-feed'],
    queryFn: ({ pageParam }: { pageParam: { timestamp?: string; id?: string } | null }) =>
      fetchReelsFeed(8, pageParam?.timestamp, pageParam?.id),
    initialPageParam: null,
    getNextPageParam: (page: any[]) => {
      const last = page?.[page.length - 1];
      return last ? { timestamp: last.created_at, id: last.id } : undefined;
    },
  });

  const reels = data?.pages.flatMap((page: any[]) => page) || [];

  // Initialize active item once data is loaded
  useEffect(() => {
    if (reels.length > 0 && !activeId) {
      activate(reels[0].id);
    }
  }, [reels.length, activeId]);

  const activate = useCallback(
    (id: string) => {
      setActiveId(id);
      Object.entries(videoRefs.current).forEach(([videoId, video]) => {
        if (!video) return;
        if (videoId === id) {
          video.muted = muted;
          void video.play().catch(() => undefined);
          void trackVideoInteraction(id, 'watch');
        } else {
          video.pause();
        }
      });
    },
    [muted]
  );

  const activateRef = useRef(activate);
  activateRef.current = activate;

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    const first = viewableItems[0]?.item;
    if (first) activateRef.current(first.id);
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  // Comments management
  const openComments = async (reelId: string) => {
    setCommentsOpenId(reelId);
    setLoadingComments(true);
    try {
      const list = await fetchReelComments(reelId);
      setCommentsList(list);
    } catch (e) {
      console.error('Failed to load comments:', e);
    } finally {
      setLoadingComments(false);
    }
  };

  const handlePostComment = async () => {
    if (!commentsOpenId || !commentText.trim()) return;
    try {
      const newC = await commentOnReel(commentsOpenId, commentText.trim());
      setCommentsList((prev) => [...prev, newC]);
      setCommentText('');
      setCommentCounts((prev) => ({
        ...prev,
        [commentsOpenId]: (prev[commentsOpenId] ?? 0) + 1,
      }));
      void trackVideoInteraction(commentsOpenId, 'comment');
    } catch (err: any) {
      showToast('Could not post comment: ' + (err?.message || err));
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteReelComment(commentId);
      setCommentsList((prev) => prev.filter((c) => c.id !== commentId));
      if (commentsOpenId) {
        setCommentCounts((prev) => ({
          ...prev,
          [commentsOpenId]: Math.max(0, (prev[commentsOpenId] ?? 1) - 1),
        }));
      }
      showToast('Comment deleted');
    } catch (err: any) {
      showToast('Failed to delete comment: ' + (err?.message || err));
    }
  };

  // Creator Reel Actions
  const handleDeleteReel = async (reelId: string) => {
    if (!confirm('Are you sure you want to delete this Reel? This cannot be undone.')) return;
    try {
      await deleteReel(reelId);
      setOptionsOpenId(null);
      showToast('Reel deleted successfully');
      void queryClient.invalidateQueries({ queryKey: ['web-reels-feed'] });
    } catch (err: any) {
      showToast('Failed to delete Reel: ' + (err?.message || err));
    }
  };

  const handleEditReelCaption = async (reel: any) => {
    const nextCaption = prompt('Edit caption:', reel.caption || '');
    if (nextCaption !== null) {
      try {
        await updateReelMetadata(reel.id, { caption: nextCaption });
        reel.caption = nextCaption;
        setOptionsOpenId(null);
        showToast('Caption updated! ✨');
      } catch (err: any) {
        showToast('Failed to update caption: ' + (err?.message || err));
      }
    }
  };

  const handleShare = async (reel: any) => {
    const url = `${window.location.origin}/#reel-${reel.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Reel by @${reel.user?.username || 'creator'} on JamSh`,
          text: reel.caption || 'Watch this reel on JamSh',
          url,
        });
      } catch {
        // User dismissed share
      }
    } else {
      await navigator.clipboard.writeText(url);
      showToast('Reel link copied to clipboard! 🔗');
    }
    void shareReel(reel.id);
  };

  const renderItem = ({ item }: { item: any }) => {
    const isOwner = currentUser?.id && (item.user_id === currentUser.id || item.user?.id === currentUser.id);
    const isItemLiked = liked[item.id] !== undefined ? liked[item.id] : item.liked_by_me || false;
    const currentLikeCount = likeCounts[item.id] !== undefined ? likeCounts[item.id] : item.like_count || 0;
    const currentCommentCount = commentCounts[item.id] !== undefined ? commentCounts[item.id] : item.comment_count || 0;

    return (
      <View style={[styles.page, { height, width }]}>
        {/* Responsive centered container for desktop/tablet */}
        <View style={styles.videoWrapper}>
          {/* @ts-ignore browser video is required for HLS playback */}
          <video
            ref={(element: HTMLVideoElement | null) => {
              videoRefs.current[item.id] = element;
            }}
            src={item.video_url}
            poster={item.thumbnail_url}
            loop
            muted={muted}
            playsInline
            onClick={() => activate(item.id)}
            onLoadedData={() => {
              if (activeId === item.id) activate(item.id);
            }}
            style={styles.video}
          />

          {/* Floating Top Right Creator Menu */}
          {isOwner && (
            <div style={webStyles.optionsBtnWrapper}>
              <button
                style={webStyles.circleBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setOptionsOpenId(optionsOpenId === item.id ? null : item.id);
                }}
              >
                <MoreVertical size={18} color="#FFF" />
              </button>
              {optionsOpenId === item.id && (
                <div style={webStyles.optionsDropdown}>
                  <button style={webStyles.dropdownItem} onClick={() => handleEditReelCaption(item)}>
                    <Edit2 size={14} color="#F59A18" /> Edit Caption
                  </button>
                  <button style={{ ...webStyles.dropdownItem, color: '#ED4956' }} onClick={() => handleDeleteReel(item.id)}>
                    <Trash2 size={14} color="#ED4956" /> Delete Reel
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Reel Overlay */}
          <View style={styles.overlay}>
            {/* Metadata Bottom Left */}
            <View style={styles.metadata}>
              <TouchableOpacity
                onPress={() => onNavigateProfile?.(item.user_id || item.user?.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.creator}>@{item.user?.username || 'creator'}</Text>
              </TouchableOpacity>
              <Text style={styles.caption}>{item.caption || ''}</Text>
              {!!item.hashtags?.length && (
                <Text style={styles.hashtags}>
                  {item.hashtags.map((tag: string) => `#${tag}`).join(' ')}
                </Text>
              )}
            </View>

            {/* Social Action Column Bottom Right */}
            <View style={styles.actions}>
              {/* Like Button */}
              <TouchableOpacity
                style={styles.action}
                onPress={async () => {
                  const nextState = !isItemLiked;
                  setLiked((current) => ({ ...current, [item.id]: nextState }));
                  setLikeCounts((current) => ({
                    ...current,
                    [item.id]: nextState ? currentLikeCount + 1 : Math.max(0, currentLikeCount - 1),
                  }));
                  const result = await likeReel(item.id);
                  setLiked((current) => ({ ...current, [item.id]: result.liked }));
                }}
              >
                <Heart
                  color={isItemLiked ? '#F59A18' : '#FFF'}
                  fill={isItemLiked ? '#F59A18' : 'transparent'}
                  size={26}
                />
                <Text style={styles.count}>{currentLikeCount}</Text>
              </TouchableOpacity>

              {/* Comment Button */}
              <TouchableOpacity
                style={styles.action}
                onPress={() => openComments(item.id)}
              >
                <MessageCircle color="#FFF" size={26} />
                <Text style={styles.count}>{currentCommentCount}</Text>
              </TouchableOpacity>

              {/* Bookmark / Save Button */}
              <TouchableOpacity
                style={styles.action}
                onPress={async () => {
                  const res = await toggleReelSave(item.id);
                  setSaved((current) => ({ ...current, [item.id]: res.saved }));
                  showToast(res.saved ? 'Reel saved to bookmarks! 📑' : 'Removed from saved');
                }}
              >
                <Bookmark
                  color={saved[item.id] ? '#F59A18' : '#FFF'}
                  fill={saved[item.id] ? '#F59A18' : 'transparent'}
                  size={26}
                />
              </TouchableOpacity>

              {/* Share Button */}
              <TouchableOpacity style={styles.action} onPress={() => handleShare(item)}>
                <Share2 color="#FFF" size={26} />
              </TouchableOpacity>

              {/* Sound / Mute Toggle */}
              <TouchableOpacity
                style={styles.action}
                onPress={() => setMuted((current) => !current)}
              >
                {muted ? <VolumeX color="#FFF" size={26} /> : <Volume2 color="#FFF" size={26} />}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#F59A18" size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Could not load Reels.</Text>
        <TouchableOpacity onPress={() => void refetch()}>
          <Text style={styles.retry}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (reels.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>No published Reels yet.</Text>
        {onOpenCreateReel && (
          <TouchableOpacity style={styles.createEmptyBtn} onPress={onOpenCreateReel}>
            <Plus size={18} color="#000" />
            <Text style={{ color: '#000', fontWeight: '800' }}>Be the first to create one!</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, position: 'relative' }}>
      <FlatList
        data={reels}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        pagingEnabled
        snapToInterval={height}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
        onEndReachedThreshold={0.7}
      />

      {/* Floating Cyberpunk Create Reel Button */}
      {onOpenCreateReel && (
        <TouchableOpacity
          style={styles.floatingCreateBtn}
          activeOpacity={0.85}
          onPress={onOpenCreateReel}
        >
          <Plus size={26} color="#000" />
          <Text style={styles.floatingCreateText}>Create Reel</Text>
        </TouchableOpacity>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div style={webStyles.toastNotification}>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Comments Drawer / Sheet */}
      {commentsOpenId && (
        <div style={webStyles.commentsBackdrop} onClick={() => setCommentsOpenId(null)}>
          <div style={webStyles.commentsDrawer} onClick={(e) => e.stopPropagation()}>
            <div style={webStyles.commentsHeader}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#FFF' }}>Comments</h3>
              <button style={webStyles.closeBtn} onClick={() => setCommentsOpenId(null)}>
                <X size={20} color="#FFF" />
              </button>
            </div>

            {/* Comments List */}
            <div style={webStyles.commentsList}>
              {loadingComments ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                  <ActivityIndicator color="#F59A18" />
                </div>
              ) : commentsList.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#8E8E93', padding: '32px 16px', fontSize: 13 }}>
                  No comments yet. Start the conversation!
                </div>
              ) : (
                commentsList.map((comm) => (
                  <div key={comm.id} style={webStyles.commentItem}>
                    <div style={{ flex: 1 }}>
                      <span style={webStyles.commentAuthor}>@{comm.user?.username || 'user'}</span>
                      <p style={webStyles.commentText}>{comm.content}</p>
                    </div>
                    {currentUser?.id && comm.user_id === currentUser.id && (
                      <button
                        style={webStyles.deleteCommentBtn}
                        onClick={() => handleDeleteComment(comm.id)}
                      >
                        <Trash2 size={14} color="#ED4956" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Comment Input */}
            <div style={webStyles.commentInputRow}>
              <input
                type="text"
                placeholder="Add a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePostComment();
                }}
                style={webStyles.commentInput}
              />
              <button
                style={webStyles.commentSendBtn}
                disabled={!commentText.trim()}
                onClick={handlePostComment}
              >
                <Send size={16} color="#000" />
              </button>
            </div>
          </div>
        </div>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#000',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoWrapper: {
    width: '100%',
    maxWidth: 520,
    height: '100%',
    position: 'relative',
    backgroundColor: '#050505',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  } as any,
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'flex-end',
    flexDirection: 'row',
    padding: 24,
  },
  metadata: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)' as any,
    paddingRight: 12,
  },
  creator: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  caption: {
    color: '#FFF',
    fontSize: 14,
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  hashtags: {
    color: '#F59A18',
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 18,
    paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)' as any,
  },
  action: {
    alignItems: 'center',
    gap: 3,
  },
  count: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  center: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  empty: {
    color: '#A8A8A8',
    fontSize: 15,
  },
  error: {
    color: '#ED4956',
    fontSize: 15,
  },
  retry: {
    color: '#F59A18',
    fontWeight: '800',
  },
  createEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F59A18',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    marginTop: 8,
  },
  floatingCreateBtn: {
    position: 'absolute',
    top: 'calc(env(safe-area-inset-top, 0px) + 16px)' as any,
    right: 20,
    backgroundColor: '#F59A18',
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#F59A18',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 999,
  },
  floatingCreateText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '800',
  },
});

const webStyles: Record<string, React.CSSProperties> = {
  optionsBtnWrapper: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 20,
  },
  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#FFF',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    cursor: 'pointer',
  },
  optionsDropdown: {
    position: 'absolute',
    top: 42,
    right: 0,
    backgroundColor: '#141414',
    border: '1px solid #333',
    borderRadius: 10,
    boxShadow: '0 6px 20px rgba(0,0,0,0.8)',
    overflow: 'hidden',
    minWidth: 140,
    display: 'flex',
    flexDirection: 'column',
    zIndex: 30,
  },
  dropdownItem: {
    background: 'none',
    border: 'none',
    padding: '10px 14px',
    color: '#FFF',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    textAlign: 'left',
  },
  toastNotification: {
    position: 'fixed',
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#1E1E1E',
    border: '1px solid #F59A18',
    color: '#FFF',
    padding: '10px 20px',
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 600,
    boxShadow: '0 4px 16px rgba(0,0,0,0.7)',
    zIndex: 999999,
  },
  commentsBackdrop: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    zIndex: 99999,
  },
  commentsDrawer: {
    width: '100%',
    maxWidth: 460,
    height: '65vh',
    maxHeight: 'calc(100vh - env(safe-area-inset-top, 0px) - 60px)',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    backgroundColor: '#121212',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    border: '1px solid #222',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 -4px 30px rgba(0,0,0,0.8)',
  },
  commentsHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #222',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
  },
  commentsList: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  commentItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    paddingBottom: 8,
    borderBottom: '1px solid #1C1C1C',
  },
  commentAuthor: {
    color: '#F59A18',
    fontSize: 13,
    fontWeight: 700,
  },
  commentText: {
    margin: '4px 0 0 0',
    color: '#FFF',
    fontSize: 13,
    lineHeight: '1.4',
  },
  deleteCommentBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
  },
  commentInputRow: {
    padding: '12px 16px',
    borderTop: '1px solid #222',
    display: 'flex',
    gap: 8,
    backgroundColor: '#0E0E0E',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#1C1C1C',
    border: '1px solid #333',
    borderRadius: 20,
    padding: '8px 14px',
    color: '#FFF',
    fontSize: 13,
    outline: 'none',
  },
  commentSendBtn: {
    backgroundColor: '#F59A18',
    border: 'none',
    borderRadius: 20,
    width: 36,
    height: 36,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    cursor: 'pointer',
  },
};
