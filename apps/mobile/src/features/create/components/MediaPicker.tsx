import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Camera, Image as ImageIcon, CheckCircle, Video, ArrowLeft } from 'lucide-react-native';
import { theme } from '@jamsh/ui';
import { useCreateStore } from '../hooks/useCreateStore';
import { SelectedMedia } from '../types';

export const MediaPicker: React.FC = () => {
  const { activeMode, selectedMedia, setSelectedMedia, setCurrentStep, resetFlow } = useCreateStore();
  const [loading, setLoading] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [galleryItems, setGalleryItems] = useState<SelectedMedia[]>([]);

  useEffect(() => {
    requestPermissionsAndLoad();
  }, []);

  const requestPermissionsAndLoad = async () => {
    try {
      setLoading(true);
      if (Platform.OS !== 'web') {
        const ImagePicker = require('expo-image-picker');
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Permission Required',
            'Please grant photos permission in system settings to pick media.'
          );
          setPermissionGranted(false);
          setLoading(false);
          return;
        }
      }
      setPermissionGranted(true);
      await loadInitialGalleryMock();
    } catch (e) {
      console.warn('Permissions check error:', e);
      setPermissionGranted(true);
      await loadInitialGalleryMock();
    } finally {
      setLoading(false);
    }
  };

  const loadInitialGalleryMock = async () => {
    // Curated high quality demo assets + native selection
    const mockList: SelectedMedia[] = [
      { id: '1', uri: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800', type: 'image' },
      { id: '2', uri: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800', type: 'image' },
      { id: '3', uri: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800', type: 'image' },
      { id: '4', uri: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800', type: 'image' },
      { id: '5', uri: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800', type: 'image' },
      { id: '6', uri: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800', type: 'image' },
    ];
    setGalleryItems(mockList);
  };

  const handleLaunchNativePicker = async () => {
    try {
      if (Platform.OS !== 'web') {
        const ImagePicker = require('expo-image-picker');
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: activeMode === 'REEL' ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.All,
          allowsMultipleSelection: activeMode === 'POST',
          quality: 0.9,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
          const newItems: SelectedMedia[] = result.assets.map((asset: any, idx: number) => ({
            id: `picked_${Date.now()}_${idx}`,
            uri: asset.uri,
            type: asset.type === 'video' ? 'video' : 'image',
            width: asset.width,
            height: asset.height,
            duration: asset.duration ? asset.duration / 1000 : undefined,
          }));

          setSelectedMedia(newItems);
          proceedNextStep(newItems);
        }
      } else {
        // Web Fallback Input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = activeMode === 'REEL' ? 'video/*' : 'image/*,video/*';
        input.multiple = activeMode === 'POST';
        input.onchange = (e: any) => {
          const files = Array.from(e.target.files || []);
          const newItems: SelectedMedia[] = files.map((file: any, idx: number) => ({
            id: `web_file_${Date.now()}_${idx}`,
            uri: URL.createObjectURL(file),
            type: file.type.startsWith('video') ? 'video' : 'image',
          }));
          if (newItems.length > 0) {
            setSelectedMedia(newItems);
            proceedNextStep(newItems);
          }
        };
        input.click();
      }
    } catch (e: any) {
      Alert.alert('Error launching gallery', e?.message || 'Could not launch media library');
    }
  };

  const handleLaunchCamera = () => {
    setCurrentStep('CAMERA');
  };

  const toggleSelectGalleryItem = (item: SelectedMedia) => {
    const isSelected = selectedMedia.some((m) => m.id === item.id);
    if (isSelected) {
      setSelectedMedia(selectedMedia.filter((m) => m.id !== item.id));
    } else {
      if (activeMode !== 'POST') {
        // Single selection for Reel & Story
        setSelectedMedia([item]);
      } else {
        setSelectedMedia([...selectedMedia, item]);
      }
    }
  };

  const proceedNextStep = (mediaList = selectedMedia) => {
    if (mediaList.length === 0) {
      Alert.alert('Selection required', 'Please select at least one photo or video.');
      return;
    }

    if (activeMode === 'POST') {
      setCurrentStep('CROP_EDIT');
    } else if (activeMode === 'REEL') {
      setCurrentStep('VIDEO_EDIT');
    } else {
      setCurrentStep('STORY_EDIT');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={resetFlow}>
          <ArrowLeft size={22} color="#FFF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          {activeMode === 'POST' ? 'New Post' : activeMode === 'REEL' ? 'New Reel' : 'New Story'}
        </Text>

        <TouchableOpacity
          style={[styles.nextBtn, selectedMedia.length === 0 && styles.nextBtnDisabled]}
          onPress={() => proceedNextStep()}
          disabled={selectedMedia.length === 0}
        >
          <Text style={styles.nextBtnText}>Next ({selectedMedia.length})</Text>
        </TouchableOpacity>
      </View>

      {/* Primary Action Row (Camera & System Gallery) */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionCard} onPress={handleLaunchCamera}>
          <Camera size={26} color={theme.colors.primary} />
          <Text style={styles.actionText}>Camera</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard} onPress={handleLaunchNativePicker}>
          <ImageIcon size={26} color={theme.colors.primary} />
          <Text style={styles.actionText}>Open Gallery</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Recent Media</Text>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={galleryItems}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={styles.gridContainer}
          renderItem={({ item }) => {
            const isSelected = selectedMedia.some((m) => m.id === item.id);
            const selectIndex = selectedMedia.findIndex((m) => m.id === item.id) + 1;

            return (
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.gridTile}
                onPress={() => toggleSelectGalleryItem(item)}
              >
                <Image source={{ uri: item.uri }} style={styles.tileImage} />

                {item.type === 'video' && (
                  <View style={styles.videoBadge}>
                    <Video size={14} color="#FFF" />
                  </View>
                )}

                <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                  {isSelected && (
                    <Text style={styles.checkText}>
                      {activeMode === 'POST' ? selectIndex : '✓'}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
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
  backBtn: {
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
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  nextBtnDisabled: {
    backgroundColor: '#333',
    opacity: 0.5,
  },
  nextBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  actionRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  actionCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(245, 154, 24, 0.25)',
  },
  actionText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#A0A0A0',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridContainer: {
    paddingHorizontal: 1,
  },
  gridTile: {
    flex: 1 / 3,
    aspectRatio: 1,
    margin: 1,
    position: 'relative',
    backgroundColor: '#1A1A1A',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 4,
    borderRadius: 4,
  },
  checkbox: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFF',
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  checkText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
});
