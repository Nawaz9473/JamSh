import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { ArrowLeft, Music, Scissors, Volume2, Type, Sticker, Play, Pause } from 'lucide-react-native';
import { theme } from '@jamsh/ui';
import { useCreateStore } from '../hooks/useCreateStore';
import { MusicTrack } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const VideoEditor: React.FC = () => {
  const {
    selectedMedia,
    volumeVideo,
    musicTrack,
    setVolumeVideo,
    setMusicTrack,
    setCurrentStep,
  } = useCreateStore();

  const [isPlaying, setIsPlaying] = useState<boolean>(true);

  const mockTracks: MusicTrack[] = [
    { id: '1', title: 'Cyberpunk Cyberwave', artist: 'JAMSH Beats', audioUrl: 'm1.mp3', duration: 30, startTime: 0 },
    { id: '2', title: 'Neon Nights', artist: 'Synthwave Prod', audioUrl: 'm2.mp3', duration: 45, startTime: 0 },
    { id: '3', title: 'Futuristic Glow', artist: 'Bassline Crew', audioUrl: 'm3.mp3', duration: 60, startTime: 0 },
  ];

  const currentVideo = selectedMedia[0];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => setCurrentStep('CAMERA')}>
          <ArrowLeft size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reel Editor</Text>
        <TouchableOpacity style={styles.nextBtn} onPress={() => setCurrentStep('CAPTION')}>
          <Text style={styles.nextBtnText}>Next</Text>
        </TouchableOpacity>
      </View>

      {/* Video Viewfinder Preview */}
      <View style={styles.videoBox}>
        <Text style={styles.videoPlaceholderText}>
          🎬 Video Preview ({currentVideo?.duration || 15}s)
        </Text>

        <TouchableOpacity
          style={styles.playOverlayBtn}
          onPress={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? <Pause size={32} color="#FFF" /> : <Play size={32} color="#FFF" />}
        </TouchableOpacity>

        {musicTrack && (
          <View style={styles.musicBadge}>
            <Music size={14} color={theme.colors.primary} />
            <Text style={styles.musicBadgeText}>{musicTrack.title}</Text>
          </View>
        )}
      </View>

      {/* Timeline Trim Indicator */}
      <View style={styles.timelineBar}>
        <Scissors size={18} color={theme.colors.primary} />
        <Text style={styles.timelineText}>Trim & Duration (0s - {currentVideo?.duration || 15}s)</Text>
      </View>

      {/* Music selector */}
      <Text style={styles.sectionTitle}>Add Cyberpunk Background Music</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.musicList}>
        {mockTracks.map((track) => {
          const isSelected = musicTrack?.id === track.id;
          return (
            <TouchableOpacity
              key={track.id}
              style={[styles.musicChip, isSelected && styles.musicChipActive]}
              onPress={() => setMusicTrack(isSelected ? null : track)}
            >
              <Music size={16} color={isSelected ? theme.colors.primary : '#AAA'} />
              <View>
                <Text style={[styles.musicTitle, isSelected && styles.musicTitleActive]}>{track.title}</Text>
                <Text style={styles.musicArtist}>{track.artist}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Volume slider control */}
      <View style={styles.volumeRow}>
        <Volume2 size={20} color="#AAA" />
        <Text style={styles.volumeText}>Original Audio Volume: {Math.round(volumeVideo * 100)}%</Text>
        <TouchableOpacity
          style={styles.muteBtn}
          onPress={() => setVolumeVideo(volumeVideo === 0 ? 1 : 0)}
        >
          <Text style={styles.muteBtnText}>{volumeVideo === 0 ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#1E1E1E',
  },
  iconBtn: {
    padding: 8,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  nextBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
  },
  nextBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  videoBox: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 1.1,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  videoPlaceholderText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '700',
  },
  playOverlayBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  musicBadge: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 8,
  },
  musicBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  timelineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1E1E1E',
    gap: 12,
    borderBottomWidth: 1,
    borderColor: '#2A2A2A',
  },
  timelineText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#A0A0A0',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 10,
  },
  musicList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  musicChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  musicChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(245, 154, 24, 0.15)',
  },
  musicTitle: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  musicTitleActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  musicArtist: {
    color: '#888',
    fontSize: 11,
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 20,
    gap: 12,
  },
  volumeText: {
    flex: 1,
    color: '#AAA',
    fontSize: 13,
    fontWeight: '600',
  },
  muteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
  },
  muteBtnText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
});
