import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { theme } from '@jamsh/ui';

interface ThumbnailPickerProps {
  mediaUri: string;
  selectedTime: number;
  onSelectTime: (time: number) => void;
}

export const ThumbnailPicker: React.FC<ThumbnailPickerProps> = ({
  mediaUri,
  selectedTime,
  onSelectTime,
}) => {
  const mockFrames = [0, 2, 5, 8, 11, 14];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Cover Frame</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {mockFrames.map((sec) => {
          const isSelected = selectedTime === sec;
          return (
            <TouchableOpacity
              key={sec}
              style={[styles.frameTile, isSelected && styles.frameTileActive]}
              onPress={() => onSelectTime(sec)}
            >
              <Image source={{ uri: mediaUri }} style={styles.frameImage} />
              <Text style={styles.frameSec}>{sec}s</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  title: {
    color: '#AAA',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  strip: {
    gap: 8,
  },
  frameTile: {
    width: 60,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  frameTileActive: {
    borderColor: theme.colors.primary,
  },
  frameImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  frameSec: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: '100%',
    textAlign: 'center',
    paddingVertical: 2,
  },
});
