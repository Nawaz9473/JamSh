import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import {
  RotateCcw,
  Zap,
  ZapOff,
  Clock,
  Gauge,
  Sparkles,
  ArrowLeft,
  CheckCircle,
} from 'lucide-react-native';
import { theme } from '@jamsh/ui';
import { useCreateStore } from '../hooks/useCreateStore';
import { SelectedMedia } from '../types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const CameraView: React.FC = () => {
  const {
    activeMode,
    cameraFacing,
    flashMode,
    cameraSpeed,
    isRecording,
    recordingDuration,
    setCameraFacing,
    setFlashMode,
    setCameraSpeed,
    setIsRecording,
    setRecordingDuration,
    setSelectedMedia,
    setCurrentStep,
    resetFlow,
  } = useCreateStore();

  const [timerCount, setTimerCount] = useState<number>(0);
  const [beautyEnabled, setBeautyEnabled] = useState<boolean>(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') {
        try {
          const { Camera } = require('expo-camera');
          const { status } = await Camera.requestCameraPermissionsAsync();
          setHasCameraPermission(status === 'granted');
        } catch (e) {
          setHasCameraPermission(true);
        }
      } else {
        setHasCameraPermission(true);
      }
    })();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleToggleFlip = () => {
    setCameraFacing(cameraFacing === 'back' ? 'front' : 'back');
  };

  const handleToggleFlash = () => {
    const nextFlash = flashMode === 'off' ? 'on' : flashMode === 'on' ? 'auto' : 'off';
    setFlashMode(nextFlash);
  };

  const handleToggleSpeed = () => {
    const speeds = [0.5, 1.0, 2.0, 3.0];
    const nextIdx = (speeds.indexOf(cameraSpeed) + 1) % speeds.length;
    setCameraSpeed(speeds[nextIdx]);
  };

  const handleCapturePhoto = () => {
    const capturedItem: SelectedMedia = {
      id: `cam_photo_${Date.now()}`,
      uri: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
      type: 'image',
    };
    setSelectedMedia([capturedItem]);

    if (activeMode === 'POST') setCurrentStep('CROP_EDIT');
    else if (activeMode === 'REEL') setCurrentStep('VIDEO_EDIT');
    else setCurrentStep('STORY_EDIT');
  };

  const handleStartRecordVideo = () => {
    setIsRecording(true);
    setRecordingDuration(0);

    timerRef.current = setInterval(() => {
      setRecordingDuration(useCreateStore.getState().recordingDuration + 1);
    }, 1000);
  };

  const handleStopRecordVideo = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);

    const capturedVideo: SelectedMedia = {
      id: `cam_video_${Date.now()}`,
      uri: 'https://assets.jamsh.app/sample_reel.mp4',
      type: 'video',
      duration: Math.max(recordingDuration, 5),
    };
    setSelectedMedia([capturedVideo]);

    if (activeMode === 'REEL') setCurrentStep('VIDEO_EDIT');
    else setCurrentStep('STORY_EDIT');
  };

  return (
    <View style={styles.container}>
      {/* Live Viewfinder Backdrop */}
      <View style={styles.viewfinder}>
        <Text style={styles.viewfinderWatermark}>
          {cameraFacing === 'front' ? 'Selfie Camera' : 'Main Camera'} • {cameraSpeed}x •{' '}
          {beautyEnabled ? 'Beauty Filter ON' : 'Standard Mode'}
        </Text>
      </View>

      {/* Top Controls Overlay */}
      <View style={styles.topToolbar}>
        <TouchableOpacity style={styles.iconBtn} onPress={resetFlow}>
          <ArrowLeft size={24} color="#FFF" />
        </TouchableOpacity>

        <View style={styles.rightControls}>
          <TouchableOpacity style={styles.iconBtn} onPress={handleToggleFlash}>
            {flashMode === 'on' ? (
              <Zap size={22} color={theme.colors.primary} />
            ) : (
              <ZapOff size={22} color="#FFF" />
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconBtn} onPress={handleToggleSpeed}>
            <Gauge size={22} color={cameraSpeed !== 1 ? theme.colors.primary : '#FFF'} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setBeautyEnabled(!beautyEnabled)}
          >
            <Sparkles size={22} color={beautyEnabled ? theme.colors.primary : '#FFF'} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconBtn} onPress={handleToggleFlip}>
            <RotateCcw size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Recording Duration Indicator */}
      {isRecording && (
        <View style={styles.recordingPill}>
          <View style={styles.redDot} />
          <Text style={styles.recordingTimeText}>{recordingDuration}s</Text>
        </View>
      )}

      {/* Bottom Shutter Controls */}
      <View style={styles.bottomToolbar}>
        <TouchableOpacity style={styles.galleryShortcut} onPress={() => setCurrentStep('PICKER')}>
          <Text style={styles.galleryShortcutText}>Gallery</Text>
        </TouchableOpacity>

        {/* Shutter Ring */}
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.shutterRing, isRecording && styles.shutterRingRecording]}
          onPress={activeMode === 'POST' ? handleCapturePhoto : isRecording ? handleStopRecordVideo : handleStartRecordVideo}
          onLongPress={handleStartRecordVideo}
          onPressOut={isRecording ? handleStopRecordVideo : undefined}
        >
          <View style={[styles.shutterInner, isRecording && styles.shutterInnerRecording]} />
        </TouchableOpacity>

        <View style={styles.placeholderSide} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  viewfinder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#161616',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinderWatermark: {
    color: '#444',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
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
  rightControls: {
    flexDirection: 'row',
    gap: 12,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingPill: {
    position: 'absolute',
    top: 105,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(237, 73, 86, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 8,
    zIndex: 10,
  },
  redDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFF',
  },
  recordingTimeText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 14,
  },
  bottomToolbar: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 30,
  },
  galleryShortcut: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  galleryShortcutText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  shutterRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  shutterRingRecording: {
    borderColor: '#ED4956',
  },
  shutterInner: {
    width: '100%',
    height: '100%',
    borderRadius: 34,
    backgroundColor: theme.colors.primary,
  },
  shutterInnerRecording: {
    borderRadius: 12,
    backgroundColor: '#ED4956',
    width: 32,
    height: 32,
  },
  placeholderSide: {
    width: 60,
  },
});
