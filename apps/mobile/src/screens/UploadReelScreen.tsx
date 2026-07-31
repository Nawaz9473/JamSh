import React, { useState } from 'react';
import { View, StyleSheet, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { supabase } from '@jamsh/api';
import { FileVideo, UploadCloud, AlertTriangle } from 'lucide-react-native';

export default function UploadReelScreen({ onUploadComplete }: { onUploadComplete?: () => void }) {
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number>(0); // in MB
  const [duration, setDuration] = useState<number>(0); // in seconds
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [interests, setInterests] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Pick video locally (simulate select for testing, or pick mockup file)
  const handleSelectMockVideo = () => {
    // Simulate picking a valid video file
    setVideoUri('file://local/tmp/reel_video_draft.mp4');
    setFileSize(12.4); // 12.4 MB
    setDuration(45.2); // 45.2 seconds
  };

  const handleSelectMockLargeVideo = () => {
    // Simulate picking an invalid large file
    setVideoUri('file://local/tmp/large_movie.mp4');
    setFileSize(152.0); // 152 MB (invalid)
    setDuration(240.0); // 4 minutes (invalid)
    Alert.alert('Validation Error', 'File size exceeds 50MB and duration exceeds 3 minutes!');
  };

  const handleUpload = async () => {
    if (!videoUri) {
      Alert.alert('No file', 'Please select a video file first');
      return;
    }

    // Double-check validation gates
    if (fileSize > 50) {
      Alert.alert('File size limit exceeded', 'Video must be less than 50MB');
      return;
    }
    if (duration > 180) {
      Alert.alert('Duration limit exceeded', 'Video must be less than 3 minutes long');
      return;
    }

    setUploading(true);
    setProgress(10);

    try {
      // Simulate chunk-wise progress intervals
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(interval);
            return 90;
          }
          return prev + 15;
        });
      }, 500);

      // Extract details
      const parsedTags = hashtags.split(',').map(t => t.trim().replace('#', '')).filter(t => t.length > 0);
      const parsedInterests = interests.split(',').map(i => i.trim()).filter(i => i.length > 0);

      // Perform local mock queue insertion
      const sessionUser = (supabase.auth as any).session?.()?.user || { id: 'user_1' };
      
      const { data, error } = await supabase
        .from('media_jobs')
        .insert({
          user_id: sessionUser.id,
          raw_video_path: `ingest/${sessionUser.id}/${Date.now()}_raw.mp4`,
          status: 'queued',
          attempts: 0,
          max_attempts: 3,
          metadata: {
            caption,
            hashtags: parsedTags,
            interests: parsedInterests,
            visibility: 'public'
          }
        })
        .select()
        .single();

      clearInterval(interval);
      setProgress(100);

      if (error) throw error;

      Alert.alert('Success', 'Video uploaded successfully! Processing started in background.');
      
      // Reset Form
      setVideoUri(null);
      setCaption('');
      setHashtags('');
      setInterests('');
      setProgress(0);
      
      if (onUploadComplete) onUploadComplete();
    } catch (e: any) {
      Alert.alert('Upload Failed', e.message || 'An error occurred during upload.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Publish Reel</Text>
      
      {/* File selector zone */}
      {!videoUri ? (
        <View style={styles.uploadPlaceholder}>
          <UploadCloud size={60} color="#F59A18" />
          <Text style={styles.uploadTitle}>Choose video file to publish</Text>
          <Text style={styles.uploadDesc}>Maximum 50MB file size, under 3 minutes duration</Text>
          
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.selectBtn} onPress={handleSelectMockVideo}>
              <Text style={styles.selectBtnText}>Select Demo Video</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.selectBtn, styles.selectLargeBtn]} onPress={handleSelectMockLargeVideo}>
              <Text style={styles.selectBtnText}>Select Large Video</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.fileSelected}>
          <FileVideo size={40} color="#F59A18" />
          <View style={styles.fileDetails}>
            <Text style={styles.fileName}>{videoUri.split('/').pop()}</Text>
            <Text style={styles.fileMeta}>{fileSize.toFixed(1)} MB • {duration.toFixed(1)} seconds</Text>
          </View>
          <TouchableOpacity style={styles.changeBtn} onPress={() => setVideoUri(null)}>
            <Text style={styles.changeBtnText}>Change</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Upload progress indicator */}
      {uploading && (
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>Uploading: {progress}%</Text>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
        </View>
      )}

      {/* Metadata input forms */}
      <View style={styles.form}>
        <Text style={styles.label}>Caption</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Write a descriptive caption..."
          placeholderTextColor="#666"
          multiline
          numberOfLines={4}
          value={caption}
          onChangeText={setCaption}
        />

        <Text style={styles.label}>Hashtags (comma separated)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. nature, travel, vlog"
          placeholderTextColor="#666"
          value={hashtags}
          onChangeText={setHashtags}
        />

        <Text style={styles.label}>Interests Categories (comma separated)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Nature, Travel, Tech"
          placeholderTextColor="#666"
          value={interests}
          onChangeText={setInterests}
        />

        <TouchableOpacity 
          style={[styles.publishBtn, (!videoUri || uploading) && styles.disabledBtn]} 
          onPress={handleUpload}
          disabled={!videoUri || uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.publishBtnText}>Ingest & Publish Video</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  content: {
    padding: 20,
    gap: 20,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'System',
    marginTop: 10,
  },
  uploadPlaceholder: {
    borderWidth: 2,
    borderColor: '#333',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    gap: 12,
  },
  uploadTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  uploadDesc: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  selectBtn: {
    backgroundColor: '#F59A18',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  selectLargeBtn: {
    backgroundColor: '#ED4956',
  },
  selectBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  fileSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    gap: 16,
  },
  fileDetails: {
    flex: 1,
    gap: 4,
  },
  fileName: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  fileMeta: {
    color: '#666',
    fontSize: 12,
  },
  changeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#F59A18',
  },
  changeBtnText: {
    color: '#F59A18',
    fontSize: 12,
    fontWeight: 'bold',
  },
  progressContainer: {
    gap: 8,
  },
  progressText: {
    color: '#F59A18',
    fontSize: 13,
    fontWeight: 'bold',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F59A18',
  },
  form: {
    gap: 12,
  },
  label: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: '#1E1E1E',
    color: '#fff',
    borderRadius: 8,
    padding: 14,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#333',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  publishBtn: {
    backgroundColor: '#F59A18',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  disabledBtn: {
    backgroundColor: '#333',
  },
  publishBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  }
});
