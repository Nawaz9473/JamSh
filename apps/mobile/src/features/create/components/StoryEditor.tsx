import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  Dimensions,
  Alert,
} from 'react-native';
import { ArrowLeft, Type, Smile, Music, MapPin, AtSign, Send, Check } from 'lucide-react-native';
import { theme } from '@jamsh/ui';
import { StoryService } from '@jamsh/api';
import { useCreateStore } from '../hooks/useCreateStore';
import { StickerOverlay } from '../types';
import { CreateService } from '../services/createService';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const StoryEditor: React.FC = () => {
  const {
    selectedMedia,
    stickers,
    addSticker,
    removeSticker,
    setIsUploading,
    setUploadProgress,
    resetFlow,
    setCurrentStep,
  } = useCreateStore();

  const [activeTextInput, setActiveTextInput] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');

  const currentMedia = selectedMedia[0] || {
    uri: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800',
    type: 'image',
  };

  const handleAddTextSticker = () => {
    if (!inputText.trim()) {
      setActiveTextInput(false);
      return;
    }
    const newSticker: StickerOverlay = {
      id: `text_${Date.now()}`,
      type: 'text',
      content: inputText,
      x: 0.5,
      y: 0.4,
      scale: 1,
      rotation: 0,
      color: theme.colors.primary,
    };
    addSticker(newSticker);
    setInputText('');
    setActiveTextInput(false);
  };

  const handleAddQuickSticker = (type: StickerOverlay['type'], content: string) => {
    const newSticker: StickerOverlay = {
      id: `${type}_${Date.now()}`,
      type,
      content,
      x: 0.5,
      y: 0.5,
      scale: 1,
      rotation: 0,
    };
    addSticker(newSticker);
  };

  const handlePublishStory = async () => {
    try {
      setIsUploading(true);
      setCurrentStep('UPLOADING');

      const mediaItem = selectedMedia[0] || currentMedia;
      await StoryService.createStory({
        media_url: mediaItem.uri,
        media_type: mediaItem.type === 'video' ? 'video' : 'image',
        caption: 'Story',
        stickers,
      });

      Alert.alert('Story Published! 📖', 'Your 24-hour story has been uploaded to your followers.');
      resetFlow();
    } catch (e: any) {
      Alert.alert('Story Upload Failed', e?.message || 'Could not upload story');
      setIsUploading(false);
      setCurrentStep('STORY_EDIT');
    }
  };


  return (
    <View style={styles.container}>
      {/* Background Media Canvas */}
      <Image source={{ uri: currentMedia.uri }} style={styles.canvasImage} resizeMode="cover" />

      {/* Top Toolbar Overlay */}
      <View style={styles.topToolbar}>
        <TouchableOpacity style={styles.iconBtn} onPress={resetFlow}>
          <ArrowLeft size={24} color="#FFF" />
        </TouchableOpacity>

        <View style={styles.stickerTools}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setActiveTextInput(true)}>
            <Type size={22} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconBtn} onPress={() => handleAddQuickSticker('emoji', '🔥')}>
            <Smile size={22} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconBtn} onPress={() => handleAddQuickSticker('location', '📍 Neo-Tokyo')}>
            <MapPin size={22} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconBtn} onPress={() => handleAddQuickSticker('music', '🎵 Cyberpunk Beats')}>
            <Music size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Text Input Modal Overlay */}
      {activeTextInput && (
        <View style={styles.textInputOverlay}>
          <TextInput
            autoFocus
            style={styles.overlayTextInput}
            placeholder="Type text overlay..."
            placeholderTextColor="#888"
            value={inputText}
            onChangeText={setInputText}
          />
          <TouchableOpacity style={styles.doneBtn} onPress={handleAddTextSticker}>
            <Check size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* Rendered Stickers Canvas */}
      {stickers.map((s) => (
        <TouchableOpacity
          key={s.id}
          style={[styles.stickerBubble, { top: SCREEN_HEIGHT * s.y - 30, left: SCREEN_WIDTH * s.x - 60 }]}
          onPress={() => removeSticker(s.id)}
        >
          <Text style={[styles.stickerText, s.color ? { color: s.color } : null]}>{s.content}</Text>
        </TouchableOpacity>
      ))}

      {/* Bottom Publish Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.expiryBadge}>
          <Text style={styles.expiryText}>Expires in 24h</Text>
        </View>

        <TouchableOpacity style={styles.shareBtn} onPress={handlePublishStory}>
          <Text style={styles.shareBtnText}>Share Story</Text>
          <Send size={18} color="#FFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  canvasImage: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  topToolbar: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  stickerTools: {
    flexDirection: 'row',
    gap: 10,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInputOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    paddingHorizontal: 20,
  },
  overlayTextInput: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
  },
  doneBtn: {
    marginTop: 20,
    backgroundColor: theme.colors.primary,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerBubble: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(245, 154, 24, 0.4)',
    zIndex: 20,
  },
  stickerText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  expiryBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  expiryText: {
    color: '#AAA',
    fontSize: 12,
    fontWeight: '700',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 25,
    gap: 8,
  },
  shareBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
