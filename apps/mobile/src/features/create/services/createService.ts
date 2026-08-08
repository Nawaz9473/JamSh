import { supabase } from '@jamsh/api';
import { CreateMode, SelectedMedia, AudienceVisibility, StickerOverlay, TextOverlay, MusicTrack } from '../types';

export interface PublishOptions {
  mode: CreateMode;
  media: SelectedMedia[];
  caption: string;
  hashtags: string[];
  mentions: string[];
  location: string | null;
  visibility: AudienceVisibility;
  allowComments: boolean;
  thumbnailUri?: string | null;
  stickers?: StickerOverlay[];
  textOverlays?: TextOverlay[];
  musicTrack?: MusicTrack | null;
  onProgress?: (percent: number) => void;
}

export class CreateService {
  /**
   * Upload media file to Supabase Storage bucket with progress simulation/tracking
   */
  static async uploadMediaFile(
    bucket: 'posts' | 'reels' | 'stories' | 'thumbnails',
    uri: string,
    fileType: 'image' | 'video',
    onProgress?: (percent: number) => void
  ): Promise<string> {
    try {
      const ext = uri.split('.').pop() || (fileType === 'video' ? 'mp4' : 'jpg');
      const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const path = `${bucket}/${filename}`;

      if (onProgress) onProgress(20);

      // Web/Mobile fetch blob strategy
      let blob: Blob;
      if (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('blob:') || uri.startsWith('data:')) {
        const res = await fetch(uri);
        blob = await res.blob();
      } else {
        // Native URI
        const res = await fetch(uri);
        blob = await res.blob();
      }

      if (onProgress) onProgress(60);

      const { data, error } = await supabase.storage.from(bucket).upload(filename, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType: fileType === 'video' ? `video/${ext}` : `image/${ext}`,
      });

      if (onProgress) onProgress(90);

      if (error) {
        // If storage bucket is missing in local dev, fallback to standard media URL reference
        console.warn('Supabase storage upload fallback:', error.message);
        return uri;
      }

      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filename);
      return publicUrlData.publicUrl;
    } catch (e: any) {
      console.warn('Upload media file error, returning local URI:', e?.message || e);
      return uri;
    }
  }

  /**
   * Complete Publish Pipeline for Post, Reel, or Story
   */
  static async publish({
    mode,
    media,
    caption,
    hashtags,
    mentions,
    location,
    visibility,
    allowComments,
    thumbnailUri,
    stickers = [],
    textOverlays = [],
    musicTrack = null,
    onProgress,
  }: PublishOptions): Promise<{ success: boolean; id: string }> {
    if (onProgress) onProgress(10);

    const userSession = (supabase.auth as any).session?.()?.user || { id: 'anonymous_user' };
    const userId = userSession.id;

    // Step 1: Upload Thumbnails if provided
    let uploadedThumbnailUrl: string | null = null;
    if (thumbnailUri) {
      uploadedThumbnailUrl = await this.uploadMediaFile('thumbnails', thumbnailUri, 'image');
    }

    if (onProgress) onProgress(30);

    // Step 2: Upload main media items
    const uploadedMediaUrls: { url: string; type: 'image' | 'video' }[] = [];
    const stepIncrement = 40 / Math.max(media.length, 1);
    let currentP = 30;

    for (const item of media) {
      const bucketName = mode === 'POST' ? 'posts' : mode === 'REEL' ? 'reels' : 'stories';
      const uploadedUrl = await this.uploadMediaFile(bucketName, item.uri, item.type);
      uploadedMediaUrls.push({ url: uploadedUrl, type: item.type });
      currentP += stepIncrement;
      if (onProgress) onProgress(Math.min(Math.round(currentP), 75));
    }

    if (onProgress) onProgress(80);

    // Step 3: Insert into database based on mode
    if (mode === 'POST') {
      const primaryType = media.length > 1 ? 'multiple' : media[0]?.type || 'image';
      
      const { data: postData, error: postErr } = await supabase
        .from('posts')
        .insert({
          user_id: userId,
          content: caption,
          type: primaryType,
          visibility,
          hashtags,
          mentions,
          location,
          allow_comments: allowComments,
          status: 'published',
        })
        .select()
        .single();

      if (postErr) throw postErr;
      const postId = postData.id;

      // Insert post media items
      if (uploadedMediaUrls.length > 0) {
        const mediaRecords = uploadedMediaUrls.map((m, idx) => ({
          post_id: postId,
          media_url: m.url,
          media_type: m.type,
          position: idx,
        }));
        await supabase.from('post_media').insert(mediaRecords);
      }

      if (onProgress) onProgress(100);
      return { success: true, id: postId };
    } else if (mode === 'REEL') {
      const mainVideo = uploadedMediaUrls[0]?.url || 'https://assets.jamsh.app/sample_reel.mp4';
      const thumb = uploadedThumbnailUrl || mainVideo;

      const { data: reelData, error: reelErr } = await supabase
        .from('videos')
        .insert({
          user_id: userId,
          video_url: mainVideo,
          thumbnail_url: thumb,
          caption,
          hashtags,
          visibility,
          duration: media[0]?.duration || 15,
        })
        .select()
        .single();

      if (reelErr) throw reelErr;

      if (onProgress) onProgress(100);
      return { success: true, id: reelData.id };
    } else {
      // STORY mode (24h expiry)
      const storyMedia = uploadedMediaUrls[0]?.url || 'https://assets.jamsh.app/sample_story.jpg';
      const storyType = media[0]?.type || 'image';

      const { data: storyData, error: storyErr } = await supabase
        .from('stories')
        .insert({
          user_id: userId,
          media_url: storyMedia,
          media_type: storyType,
          thumbnail_url: uploadedThumbnailUrl,
          caption,
          stickers: JSON.stringify(stickers),
          text_overlays: JSON.stringify(textOverlays),
          location,
          music_track: musicTrack ? JSON.stringify(musicTrack) : null,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (storyErr) throw storyErr;

      if (onProgress) onProgress(100);
      return { success: true, id: storyData.id };
    }
  }
}
