import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Dimensions,
} from 'react-native';
import { ArrowLeft, Crop, Sliders, Check } from 'lucide-react-native';
import { theme } from '@jamsh/ui';
import { useCreateStore } from '../hooks/useCreateStore';
import { AspectRatio, FilterPreset } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const CropView: React.FC = () => {
  const {
    selectedMedia,
    activeMediaIndex,
    updateMediaAspectRatio,
    updateMediaFilter,
    setCurrentStep,
    resetFlow,
  } = useCreateStore();

  const currentItem = selectedMedia[activeMediaIndex] || selectedMedia[0];

  const aspectRatios: AspectRatio[] = ['1:1', '4:5', '16:9', '9:16'];
  const filterPresets: { id: FilterPreset; name: string; overlayColor?: string }[] = [
    { id: 'none', name: 'Original' },
    { id: 'cyber_gold', name: 'Cyber Gold', overlayColor: 'rgba(245, 154, 24, 0.18)' },
    { id: 'dark_neon', name: 'Dark Neon', overlayColor: 'rgba(10, 132, 255, 0.15)' },
    { id: 'cyber_mono', name: 'Monochrome', overlayColor: 'rgba(0, 0, 0, 0.35)' },
    { id: 'vivid_contrast', name: 'Vivid Gold', overlayColor: 'rgba(245, 154, 24, 0.3)' },
  ];

  if (!currentItem) return null;

  const currentRatio = currentItem.aspectRatio || '1:1';
  const currentFilter = currentItem.filter || 'none';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => setCurrentStep('PICKER')}>
          <ArrowLeft size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Crop & Filter</Text>
        <TouchableOpacity style={styles.nextBtn} onPress={() => setCurrentStep('CAPTION')}>
          <Text style={styles.nextBtnText}>Next</Text>
        </TouchableOpacity>
      </View>

      {/* Main Preview Container */}
      <View style={styles.previewBox}>
        <Image source={{ uri: currentItem.uri }} style={styles.previewImage} resizeMode="cover" />

        {/* Cyberpunk Filter Overlay */}
        {filterPresets.find((f) => f.id === currentFilter)?.overlayColor && (
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: filterPresets.find((f) => f.id === currentFilter)?.overlayColor },
            ]}
          />
        )}
      </View>

      {/* Toolbar: Aspect Ratios */}
      <Text style={styles.sectionTitle}>Aspect Ratio</Text>
      <View style={styles.ratioRow}>
        {aspectRatios.map((ratio) => (
          <TouchableOpacity
            key={ratio}
            style={[styles.ratioChip, currentRatio === ratio && styles.ratioChipActive]}
            onPress={() => updateMediaAspectRatio(currentItem.id, ratio)}
          >
            <Text style={[styles.ratioText, currentRatio === ratio && styles.ratioTextActive]}>
              {ratio}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Toolbar: Cyberpunk Filter Presets */}
      <Text style={styles.sectionTitle}>Filters</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
        {filterPresets.map((f) => {
          const isActive = currentFilter === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterCard, isActive && styles.filterCardActive]}
              onPress={() => updateMediaFilter(currentItem.id, f.id)}
            >
              <Image source={{ uri: currentItem.uri }} style={styles.filterThumb} />
              {f.overlayColor && (
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: f.overlayColor, height: 60 }]} />
              )}
              <Text style={[styles.filterName, isActive && styles.filterNameActive]}>{f.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
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
  previewBox: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.95,
    backgroundColor: '#000',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  sectionTitle: {
    color: '#A0A0A0',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  ratioRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
  },
  ratioChip: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  ratioChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(245, 154, 24, 0.15)',
  },
  ratioText: {
    color: '#AAA',
    fontSize: 13,
    fontWeight: '600',
  },
  ratioTextActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 24,
  },
  filterCard: {
    width: 76,
    alignItems: 'center',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  filterCardActive: {
    borderColor: theme.colors.primary,
  },
  filterThumb: {
    width: 76,
    height: 60,
  },
  filterName: {
    color: '#AAA',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  filterNameActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
});
