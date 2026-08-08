import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { ArrowLeft, MapPin, Globe, MessageSquare, Hash, AtSign, Send } from 'lucide-react-native';
import { theme } from '@jamsh/ui';
import { useCreateStore } from '../hooks/useCreateStore';
import { AudienceSelector } from './AudienceSelector';
import { LocationPicker } from './LocationPicker';
import { ThumbnailPicker } from './ThumbnailPicker';
import { CreateService } from '../services/createService';

export const CaptionScreen: React.FC = () => {
  const {
    activeMode,
    selectedMedia,
    caption,
    hashtags,
    mentions,
    location,
    visibility,
    allowComments,
    thumbnailTimeSeconds,
    setCaption,
    setHashtags,
    setMentions,
    setLocation,
    setVisibility,
    setAllowComments,
    setThumbnailTimeSeconds,
    setIsUploading,
    setUploadProgress,
    setCurrentStep,
    resetFlow,
  } = useCreateStore();

  const [showAudienceModal, setShowAudienceModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);

  const previewItem = selectedMedia[0];

  const handleShare = async () => {
    try {
      setIsUploading(true);
      setCurrentStep('UPLOADING');

      // Auto extract hashtags and mentions from caption if not explicitly entered
      const extractedTags = caption.match(/#[a-zA-Z0-9_]+/g)?.map((t) => t.replace('#', '')) || hashtags;
      const extractedMentions = caption.match(/@[a-zA-Z0-9_]+/g)?.map((m) => m.replace('@', '')) || mentions;

      await CreateService.publish({
        mode: activeMode,
        media: selectedMedia,
        caption,
        hashtags: extractedTags,
        mentions: extractedMentions,
        location,
        visibility,
        allowComments,
        thumbnailUri: previewItem?.uri,
        onProgress: (p) => setUploadProgress(p),
      });

      Alert.alert('Published! 🚀', `Your ${activeMode.toLowerCase()} has been shared successfully.`);
      resetFlow();
    } catch (e: any) {
      Alert.alert('Publish Failed', e?.message || 'Could not publish content.');
      setIsUploading(false);
      setCurrentStep('CAPTION');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => setCurrentStep(activeMode === 'POST' ? 'CROP_EDIT' : 'VIDEO_EDIT')}>
          <ArrowLeft size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New {activeMode === 'POST' ? 'Post' : 'Reel'}</Text>
        <TouchableOpacity style={styles.shareHeaderBtn} onPress={handleShare}>
          <Text style={styles.shareBtnText}>Share</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Caption & Media Preview Row */}
        <View style={styles.captionRow}>
          {previewItem && (
            <Image source={{ uri: previewItem.uri }} style={styles.thumbPreview} />
          )}

          <TextInput
            multiline
            style={styles.captionInput}
            placeholder="Write a caption, #hashtags, @mentions..."
            placeholderTextColor="#666"
            value={caption}
            onChangeText={setCaption}
          />
        </View>

        {/* Thumbnail Selector (if video/reel) */}
        {previewItem?.type === 'video' && (
          <ThumbnailPicker
            mediaUri={previewItem.uri}
            selectedTime={thumbnailTimeSeconds}
            onSelectTime={setThumbnailTimeSeconds}
          />
        )}

        <View style={styles.divider} />

        {/* Location Row */}
        <TouchableOpacity style={styles.settingRow} onPress={() => setShowLocationModal(true)}>
          <View style={styles.settingLeft}>
            <MapPin size={20} color={theme.colors.primary} />
            <Text style={styles.settingLabel}>
              {location ? location : 'Add Location'}
            </Text>
          </View>
          <Text style={styles.settingValue}>›</Text>
        </TouchableOpacity>

        {/* Audience Row */}
        <TouchableOpacity style={styles.settingRow} onPress={() => setShowAudienceModal(true)}>
          <View style={styles.settingLeft}>
            <Globe size={20} color={theme.colors.primary} />
            <Text style={styles.settingLabel}>Audience</Text>
          </View>
          <Text style={styles.settingValueText}>{visibility.toUpperCase()}</Text>
        </TouchableOpacity>

        {/* Comments Toggle Row */}
        <View style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <MessageSquare size={20} color={theme.colors.primary} />
            <Text style={styles.settingLabel}>Allow Comments</Text>
          </View>
          <Switch
            value={allowComments}
            onValueChange={setAllowComments}
            trackColor={{ false: '#333', true: theme.colors.primary }}
            thumbColor="#FFF"
          />
        </View>

        {/* Big Share CTA */}
        <TouchableOpacity style={styles.bigShareBtn} onPress={handleShare}>
          <Send size={20} color="#FFF" />
          <Text style={styles.bigShareBtnText}>Publish {activeMode}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modals */}
      <AudienceSelector
        visible={showAudienceModal}
        selected={visibility}
        onSelect={setVisibility}
        onClose={() => setShowAudienceModal(false)}
      />

      <LocationPicker
        visible={showLocationModal}
        selectedLocation={location}
        onSelect={setLocation}
        onClose={() => setShowLocationModal(false)}
      />
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
  shareHeaderBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  shareBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  scrollContent: {
    padding: 16,
  },
  captionRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 20,
  },
  thumbPreview: {
    width: 80,
    height: 100,
    borderRadius: 10,
    backgroundColor: '#1E1E1E',
  },
  captionInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 15,
    textAlignVertical: 'top',
    height: 100,
  },
  divider: {
    height: 1,
    backgroundColor: '#1E1E1E',
    marginVertical: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: '#1A1A1A',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  settingLabel: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  settingValue: {
    color: '#666',
    fontSize: 20,
  },
  settingValueText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  bigShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 30,
    gap: 10,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  bigShareBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
