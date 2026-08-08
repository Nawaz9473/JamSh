export type CreateMode = 'POST' | 'REEL' | 'STORY';

export type AudienceVisibility = 'public' | 'friends' | 'private';

export type AspectRatio = '1:1' | '4:5' | '16:9' | '9:16';

export type FilterPreset = 'none' | 'cyber_gold' | 'dark_neon' | 'cyber_mono' | 'vivid_contrast';

export interface SelectedMedia {
  id: string;
  uri: string;
  type: 'image' | 'video';
  width?: number;
  height?: number;
  duration?: number; // for videos in seconds
  fileSize?: number; // in MB or bytes
  thumbnailUri?: string;
  aspectRatio?: AspectRatio;
  filter?: FilterPreset;
}

export interface StickerOverlay {
  id: string;
  type: 'emoji' | 'text' | 'mention' | 'location' | 'music' | 'gif';
  content: string;
  x: number; // position 0-1
  y: number; // position 0-1
  scale: number;
  rotation: number;
  color?: string;
}

export interface TextOverlay {
  id: string;
  text: string;
  color: string;
  backgroundColor?: string;
  fontSize: number;
  fontFamily?: string;
  x: number;
  y: number;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  coverUrl?: string;
  audioUrl: string;
  duration: number;
  startTime: number;
}

export interface PostCreationState {
  activeMode: CreateMode;
  isBottomSheetOpen: boolean;
  currentStep: 'PICKER' | 'CAMERA' | 'CROP_EDIT' | 'VIDEO_EDIT' | 'STORY_EDIT' | 'CAPTION' | 'UPLOADING';
  selectedMedia: SelectedMedia[];
  activeMediaIndex: number;
  
  // Post/Reel Metadata
  caption: string;
  hashtags: string[];
  mentions: string[];
  location: string | null;
  visibility: AudienceVisibility;
  allowComments: boolean;
  
  // Video / Reel specific
  selectedThumbnailUri: string | null;
  thumbnailTimeSeconds: number;
  musicTrack: MusicTrack | null;
  volumeVideo: number;
  volumeAudio: number;
  isRecording: boolean;
  recordingDuration: number;
  cameraFacing: 'front' | 'back';
  flashMode: 'off' | 'on' | 'auto';
  cameraSpeed: number; // 0.5, 1, 2, 3
  
  // Story / Overlays
  stickers: StickerOverlay[];
  textOverlays: TextOverlay[];
  
  // Upload State
  uploadProgress: number; // 0 - 100
  isUploading: boolean;
  uploadError: string | null;
  offlineQueued: boolean;
}
