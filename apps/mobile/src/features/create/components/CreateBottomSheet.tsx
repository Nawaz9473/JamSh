import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
  Animated,
  PanResponder,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { Image, Clapperboard, BookOpen, X } from 'lucide-react-native';
import { theme } from '@jamsh/ui';
import { CreateOptionCard } from './CreateOptionCard';
import { useCreateStore } from '../hooks/useCreateStore';
import { CreateMode } from '../types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export const CreateBottomSheet: React.FC = () => {
  const { isBottomSheetOpen, closeBottomSheet, selectMode } = useCreateStore();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const triggerHaptic = () => {
    try {
      // Graceful fallback for haptics across platforms
      if (Platform.OS !== 'web') {
        const Haptics = require('expo-haptics');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (e) {
      // Haptics optional
    }
  };

  useEffect(() => {
    if (isBottomSheetOpen) {
      triggerHaptic();
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 6,
        speed: 14,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [isBottomSheetOpen]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 120 || gestureState.vy > 0.5) {
          closeBottomSheet();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 6,
          }).start();
        }
      },
    })
  ).current;

  const handleSelect = (mode: CreateMode) => {
    triggerHaptic();
    selectMode(mode);
  };

  if (!isBottomSheetOpen) return null;

  return (
    <Modal
      transparent
      visible={isBottomSheetOpen}
      animationType="fade"
      onRequestClose={closeBottomSheet}
    >
      <View style={styles.backdrop}>
        <TouchableWithoutFeedback onPress={closeBottomSheet}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.sheetContainer,
            { transform: [{ translateY }] },
          ]}
          {...panResponder.panHandlers}
        >
          {/* Drag Handle Indicator */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Create New Content</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={closeBottomSheet}>
              <X size={20} color="#A0A0A0" />
            </TouchableOpacity>
          </View>

          {/* Options */}
          <View style={styles.optionsList}>
            <CreateOptionCard
              title="📸 Create Post"
              subtitle="Share photos or carousel with filters & captions"
              icon={Image}
              iconBgColor="rgba(245, 154, 24, 0.15)"
              onPress={() => handleSelect('POST')}
            />

            <CreateOptionCard
              title="🎬 Create Reel"
              subtitle="Record or upload short immersive vertical video"
              icon={Clapperboard}
              iconBgColor="rgba(245, 154, 24, 0.25)"
              onPress={() => handleSelect('REEL')}
            />

            <CreateOptionCard
              title="📖 Create Story"
              subtitle="Share 24-hour expiring photo/video with stickers & music"
              icon={BookOpen}
              iconBgColor="rgba(245, 154, 24, 0.2)"
              onPress={() => handleSelect('STORY')}
            />
          </View>

          {/* Cancel Button */}
          <TouchableOpacity style={styles.cancelBtn} onPress={closeBottomSheet}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(245, 154, 24, 0.35)',
    elevation: 20,
    shadowColor: '#F59A18',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#333333',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingTop: 4,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionsList: {
    marginBottom: 8,
  },
  cancelBtn: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  cancelBtnText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
});
