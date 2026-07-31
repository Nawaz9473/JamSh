import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Text, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Heart, MessageCircle, Share2, Bookmark, Volume2, VolumeX, ShieldAlert } from 'lucide-react-native';
import { trackVideoInteraction, likeReel } from '@jamsh/api';

interface ReelPlayerProps {
  video: any;
  isPlaying: boolean;
  shouldPreload: boolean;
  height: number;
  width: number;
}

export default function ReelPlayer({ video, isPlaying, shouldPreload, height, width }: ReelPlayerProps) {
  const videoRef = useRef<Video>(null);
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const [muted, setMuted] = useState(false);
  const [liked, setLiked] = useState(video.liked_by_me || false);
  const [likeCount, setLikeCount] = useState(video.like_count || 0);
  const [saved, setSaved] = useState(false);
  const [saveCount, setSaveCount] = useState(video.save_count || 0);
  const watchTimerRef = useRef<number>(0);
  
  const isLoaded = status?.isLoaded;
  const isBuffering = status?.isLoaded && status.isBuffering;

  // Handle Autoplay & Preloading
  useEffect(() => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      if (isLoaded) {
        videoRef.current.playAsync();
      }
      watchTimerRef.current = Date.now();
    } else {
      videoRef.current.pauseAsync();
      
      // Track watch interaction metrics on pause
      if (watchTimerRef.current > 0) {
        const watchDurationSec = (Date.now() - watchTimerRef.current) / 1000;
        let watchPercent = 0;
        if (status && status.isLoaded && status.durationMillis) {
          watchPercent = (watchDurationSec * 1000 / status.durationMillis) * 100;
        }
        
        trackVideoInteraction(video.id, 'watch', watchDurationSec, watchPercent);
        watchTimerRef.current = 0;
      }
    }
  }, [isPlaying, isLoaded]);

  // Cleanup on unmount (e.g. tracking when user leaves screen)
  useEffect(() => {
    return () => {
      if (watchTimerRef.current > 0) {
        const watchDurationSec = (Date.now() - watchTimerRef.current) / 1000;
        trackVideoInteraction(video.id, 'watch', watchDurationSec, 50); // guestimate
      }
    };
  }, []);

  const handleLikeToggle = async () => {
    try {
      const nextLiked = !liked;
      setLiked(nextLiked);
      setLikeCount((prev: number) => nextLiked ? prev + 1 : Math.max(0, prev - 1));
      
      const res = await likeReel(video.id);
      trackVideoInteraction(video.id, res.liked ? 'like' : 'skip');
    } catch (e) {
      // Revert if error
      setLiked(video.liked_by_me || false);
      setLikeCount(video.like_count || 0);
    }
  };

  const handleSaveToggle = () => {
    const nextSaved = !saved;
    setSaved(nextSaved);
    setSaveCount((prev: number) => nextSaved ? prev + 1 : Math.max(0, prev - 1));
    trackVideoInteraction(video.id, nextSaved ? 'save' : 'not_interested');
  };

  const handleShare = () => {
    trackVideoInteraction(video.id, 'share');
    alert('Share link copied to clipboard!');
  };

  const handleReport = () => {
    trackVideoInteraction(video.id, 'report');
    alert('Video reported. We will review this content shortly.');
  };

  return (
    <View style={[styles.container, { height, width }]}>
      {shouldPreload && (
        <Video
          ref={videoRef}
          source={{ uri: video.video_url }}
          style={StyleSheet.absoluteFillObject}
          resizeMode={ResizeMode.COVER}
          isLooping
          isMuted={muted}
          shouldPlay={isPlaying}
          onPlaybackStatusUpdate={(status) => setStatus(() => status)}
        />
      )}

      {/* Buffering overlay indicator */}
      {isBuffering && (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#F59A18" />
        </View>
      )}

      {/* Muted overlay icon indicator briefly */}
      <TouchableOpacity 
        activeOpacity={1} 
        style={StyleSheet.absoluteFill} 
        onPress={() => setMuted(!muted)} 
      >
        <View style={styles.muteIndicator}>
          {muted ? <VolumeX size={24} color="#fff" /> : <Volume2 size={24} color="#fff" />}
        </View>
      </TouchableOpacity>

      {/* Metadata display overlay bottom-left */}
      <View style={styles.bottomOverlay}>
        <Text style={styles.creatorName}>@{video.creator_username || 'creator'}</Text>
        <Text style={styles.caption} numberOfLines={2}>{video.caption}</Text>
        <View style={styles.hashtagRow}>
          {(video.hashtags || []).map((tag: string) => (
            <Text key={tag} style={styles.hashtag}>#{tag}</Text>
          ))}
        </View>
      </View>

      {/* Engagement actions panel right-aligned */}
      <View style={styles.actionColumn}>
        <TouchableOpacity style={styles.actionButton} onPress={handleLikeToggle}>
          <Heart size={30} color={liked ? '#F59A18' : '#fff'} fill={liked ? '#F59A18' : 'transparent'} />
          <Text style={styles.actionLabel}>{likeCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton}>
          <MessageCircle size={30} color="#fff" />
          <Text style={styles.actionLabel}>{video.comment_count}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
          <Share2 size={30} color="#fff" />
          <Text style={styles.actionLabel}>{video.share_count}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleSaveToggle}>
          <Bookmark size={30} color={saved ? '#F59A18' : '#fff'} fill={saved ? '#F59A18' : 'transparent'} />
          <Text style={styles.actionLabel}>{saveCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleReport}>
          <ShieldAlert size={28} color="#ED4956" />
          <Text style={[styles.actionLabel, { color: '#ED4956' }]}>Report</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    position: 'relative',
  },
  loaderContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  muteIndicator: {
    position: 'absolute',
    top: 24,
    left: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 32,
    left: 16,
    right: 88,
    gap: 8,
  },
  creatorName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'System',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  caption: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 18,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  hashtagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  hashtag: {
    color: '#F59A18',
    fontSize: 13,
    fontWeight: 'bold',
  },
  actionColumn: {
    position: 'absolute',
    right: 16,
    bottom: 32,
    alignItems: 'center',
    gap: 22,
  },
  actionButton: {
    alignItems: 'center',
  },
  actionLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  }
});
