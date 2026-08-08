import React from 'react';
import { View, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import { useCreateStore } from '../hooks/useCreateStore';
import { CreateBottomSheet } from '../components/CreateBottomSheet';
import { MediaPicker } from '../components/MediaPicker';
import { CameraView } from '../components/CameraView';
import { CropView } from '../components/CropView';
import { VideoEditor } from '../components/VideoEditor';
import { StoryEditor } from '../components/StoryEditor';
import { CaptionScreen } from '../components/CaptionScreen';
import { UploadProgress } from '../components/UploadProgress';

export const CreateFlowContainerScreen: React.FC = () => {
  const { currentStep, activeMode } = useCreateStore();

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'PICKER':
        return <MediaPicker />;
      case 'CAMERA':
        return <CameraView />;
      case 'CROP_EDIT':
        return <CropView />;
      case 'VIDEO_EDIT':
        return <VideoEditor />;
      case 'STORY_EDIT':
        return <StoryEditor />;
      case 'CAPTION':
        return <CaptionScreen />;
      case 'UPLOADING':
        return <MediaPicker />;
      default:
        return <MediaPicker />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />
      {renderCurrentStep()}
      <CreateBottomSheet />
      <UploadProgress />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
});
