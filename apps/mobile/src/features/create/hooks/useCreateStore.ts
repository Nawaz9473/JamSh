import { create } from 'zustand';
import { CreateMode, AudienceVisibility, SelectedMedia, StickerOverlay, TextOverlay, MusicTrack, PostCreationState } from '../types';

interface CreateStoreActions {
  // Navigation & Flow
  openBottomSheet: () => void;
  closeBottomSheet: () => void;
  selectMode: (mode: CreateMode) => void;
  setCurrentStep: (step: PostCreationState['currentStep']) => void;
  resetFlow: () => void;
  
  // Media selection
  setSelectedMedia: (media: SelectedMedia[]) => void;
  addMedia: (item: SelectedMedia) => void;
  removeMedia: (id: string) => void;
  updateMediaFilter: (id: string, filter: SelectedMedia['filter']) => void;
  updateMediaAspectRatio: (id: string, aspectRatio: SelectedMedia['aspectRatio']) => void;
  setActiveMediaIndex: (index: number) => void;
  
  // Metadata & Options
  setCaption: (caption: string) => void;
  setHashtags: (hashtags: string[]) => void;
  setMentions: (mentions: string[]) => void;
  setLocation: (location: string | null) => void;
  setVisibility: (visibility: AudienceVisibility) => void;
  setAllowComments: (allow: boolean) => void;
  
  // Video & Reel Editor
  setSelectedThumbnailUri: (uri: string | null) => void;
  setThumbnailTimeSeconds: (time: number) => void;
  setMusicTrack: (track: MusicTrack | null) => void;
  setVolumeVideo: (vol: number) => void;
  setVolumeAudio: (vol: number) => void;
  setIsRecording: (recording: boolean) => void;
  setRecordingDuration: (duration: number) => void;
  setCameraFacing: (facing: 'front' | 'back') => void;
  setFlashMode: (flash: 'off' | 'on' | 'auto') => void;
  setCameraSpeed: (speed: number) => void;
  
  // Story & Overlays
  addSticker: (sticker: StickerOverlay) => void;
  removeSticker: (id: string) => void;
  addTextOverlay: (text: TextOverlay) => void;
  removeTextOverlay: (id: string) => void;
  
  // Upload State
  setUploadProgress: (progress: number) => void;
  setIsUploading: (uploading: boolean) => void;
  setUploadError: (error: string | null) => void;
  setOfflineQueued: (queued: boolean) => void;
}

export type CreateStore = PostCreationState & CreateStoreActions;

const initialPostState: PostCreationState = {
  activeMode: 'POST',
  isBottomSheetOpen: false,
  currentStep: 'PICKER',
  selectedMedia: [],
  activeMediaIndex: 0,
  caption: '',
  hashtags: [],
  mentions: [],
  location: null,
  visibility: 'public',
  allowComments: true,
  selectedThumbnailUri: null,
  thumbnailTimeSeconds: 0,
  musicTrack: null,
  volumeVideo: 1.0,
  volumeAudio: 1.0,
  isRecording: false,
  recordingDuration: 0,
  cameraFacing: 'back',
  flashMode: 'off',
  cameraSpeed: 1.0,
  stickers: [],
  textOverlays: [],
  uploadProgress: 0,
  isUploading: false,
  uploadError: null,
  offlineQueued: false,
};

export const useCreateStore = create<CreateStore>((set) => ({
  ...initialPostState,
  
  openBottomSheet: () => set({ isBottomSheetOpen: true }),
  closeBottomSheet: () => set({ isBottomSheetOpen: false }),
  
  selectMode: (mode: CreateMode) => {
    let initialStep: PostCreationState['currentStep'] = 'PICKER';
    if (mode === 'REEL') initialStep = 'CAMERA';
    if (mode === 'STORY') initialStep = 'CAMERA';
    
    set({
      activeMode: mode,
      isBottomSheetOpen: false,
      currentStep: initialStep,
      selectedMedia: [],
      caption: '',
      stickers: [],
      textOverlays: [],
    });
  },
  
  setCurrentStep: (step) => set({ currentStep: step }),
  
  resetFlow: () => set({ ...initialPostState }),
  
  setSelectedMedia: (media) => set({ selectedMedia: media, activeMediaIndex: 0 }),
  addMedia: (item) => set((state) => ({ selectedMedia: [...state.selectedMedia, item] })),
  removeMedia: (id) => set((state) => ({
    selectedMedia: state.selectedMedia.filter((m) => m.id !== id),
  })),
  
  updateMediaFilter: (id, filter) => set((state) => ({
    selectedMedia: state.selectedMedia.map((m) => (m.id === id ? { ...m, filter } : m)),
  })),
  
  updateMediaAspectRatio: (id, aspectRatio) => set((state) => ({
    selectedMedia: state.selectedMedia.map((m) => (m.id === id ? { ...m, aspectRatio } : m)),
  })),
  
  setActiveMediaIndex: (index) => set({ activeMediaIndex: index }),
  
  setCaption: (caption) => set({ caption }),
  setHashtags: (hashtags) => set({ hashtags }),
  setMentions: (mentions) => set({ mentions }),
  setLocation: (location) => set({ location }),
  setVisibility: (visibility) => set({ visibility }),
  setAllowComments: (allowComments) => set({ allowComments }),
  
  setSelectedThumbnailUri: (uri) => set({ selectedThumbnailUri: uri }),
  setThumbnailTimeSeconds: (time) => set({ thumbnailTimeSeconds: time }),
  setMusicTrack: (track) => set({ musicTrack: track }),
  setVolumeVideo: (volumeVideo) => set({ volumeVideo }),
  setVolumeAudio: (volumeAudio) => set({ volumeAudio }),
  setIsRecording: (isRecording) => set({ isRecording }),
  setRecordingDuration: (recordingDuration) => set({ recordingDuration }),
  setCameraFacing: (cameraFacing) => set({ cameraFacing }),
  setFlashMode: (flashMode) => set({ flashMode }),
  setCameraSpeed: (cameraSpeed) => set({ cameraSpeed }),
  
  addSticker: (sticker) => set((state) => ({ stickers: [...state.stickers, sticker] })),
  removeSticker: (id) => set((state) => ({ stickers: state.stickers.filter((s) => s.id !== id) })),
  
  addTextOverlay: (textOverlay) => set((state) => ({ textOverlays: [...state.textOverlays, textOverlay] })),
  removeTextOverlay: (id) => set((state) => ({ textOverlays: state.textOverlays.filter((t) => t.id !== id) })),
  
  setUploadProgress: (uploadProgress) => set({ uploadProgress }),
  setIsUploading: (isUploading) => set({ isUploading }),
  setUploadError: (uploadError) => set({ uploadError }),
  setOfflineQueued: (offlineQueued) => set({ offlineQueued }),
}));
