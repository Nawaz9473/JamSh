import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { UploadCloud, X, RefreshCw } from 'lucide-react-native';
import { theme } from '@jamsh/ui';
import { useCreateStore } from '../hooks/useCreateStore';

export const UploadProgress: React.FC = () => {
  const { uploadProgress, isUploading, uploadError, resetFlow } = useCreateStore();

  if (!isUploading && !uploadError) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <UploadCloud size={32} color={theme.colors.primary} />
        </View>

        <Text style={styles.title}>
          {uploadError ? 'Upload Error' : `Publishing Content (${uploadProgress}%)`}
        </Text>

        <Text style={styles.subtitle}>
          {uploadError
            ? uploadError
            : 'Compressing media and uploading to Supabase Storage...'}
        </Text>

        {!uploadError ? (
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${uploadProgress}%` }]} />
          </View>
        ) : (
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={resetFlow}>
              <X size={16} color="#FFF" />
              <Text style={styles.btnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 154, 24, 0.35)',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(245, 154, 24, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    color: '#AAA',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },
  progressBarTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#2A2A2A',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  btnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
