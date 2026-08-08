import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Plus } from 'lucide-react-native';
import { StoryService, StoryTrayItem } from '@jamsh/api';

interface StoryTrayProps {
  currentUserId?: string;
  onSelectUserStory: (authorId: string) => void;
  onCreateStory: () => void;
}

export const StoryTray: React.FC<StoryTrayProps> = ({
  currentUserId,
  onSelectUserStory,
  onCreateStory,
}) => {
  const [trayItems, setTrayItems] = useState<StoryTrayItem[]>([]);

  const loadTray = async () => {
    try {
      const items = await StoryService.getStoryTray();
      setTrayItems(items);
    } catch (e) {
      console.error('[Mobile StoryTray] Failed to load tray:', e);
    }
  };

  useEffect(() => {
    loadTray();
    const unsubscribe = StoryService.subscribeToStories(() => {
      loadTray();
    });
    return () => unsubscribe();
  }, [currentUserId]);

  const ownItem = trayItems.find((item) => item.is_own_story);
  const otherItems = trayItems.filter((item) => !item.is_own_story);

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* OWN STORY ITEM */}
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.storyItem}
          onPress={() => {
            if (ownItem && ownItem.stories_count > 0) {
              onSelectUserStory(ownItem.author_id);
            } else {
              onCreateStory();
            }
          }}
        >
          <View style={[styles.avatarRing, ownItem && ownItem.unseen_count > 0 ? styles.ringUnseen : styles.ringSeen]}>
            <Image
              source={{ uri: ownItem?.avatar_url || 'https://assets.jamsh.app/sample_avatar.jpg' }}
              style={styles.avatar}
            />
            {(!ownItem || ownItem.stories_count === 0) && (
              <View style={styles.addBadge}>
                <Plus size={12} color="#000" />
              </View>
            )}
          </View>
          <Text style={styles.userLabel} numberOfLines={1}>
            Your Story
          </Text>
        </TouchableOpacity>

        {/* OTHER USERS STORIES */}
        {otherItems.map((item) => {
          const hasUnseen = item.unseen_count > 0;
          return (
            <TouchableOpacity
              key={item.author_id}
              activeOpacity={0.8}
              style={styles.storyItem}
              onPress={() => onSelectUserStory(item.author_id)}
            >
              <View style={[styles.avatarRing, hasUnseen ? styles.ringUnseen : styles.ringSeen]}>
                <Image
                  source={{ uri: item.avatar_url || 'https://assets.jamsh.app/sample_avatar.jpg' }}
                  style={styles.avatar}
                />
              </View>
              <Text style={styles.userLabel} numberOfLines={1}>
                {item.username}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 10,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  scrollContent: {
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  storyItem: {
    alignItems: 'center',
    marginRight: 14,
    width: 64,
  },
  avatarRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  ringUnseen: {
    borderWidth: 2,
    borderColor: '#F59A18',
    backgroundColor: 'rgba(245, 154, 24, 0.15)',
  },
  ringSeen: {
    borderWidth: 1.5,
    borderColor: '#333333',
    backgroundColor: 'transparent',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1E1E1E',
  },
  addBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F59A18',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000',
  },
  userLabel: {
    color: '#E1E1E1',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
});
