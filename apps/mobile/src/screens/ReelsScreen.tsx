import React, { useState, useRef, useCallback } from 'react';
import { View, FlatList, StyleSheet, useWindowDimensions, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchReelsFeed } from '@jamsh/api';
import { Plus } from 'lucide-react-native';
import ReelPlayer from '../components/ReelPlayer';
import { useCreateStore, CreateBottomSheet, CreateFlowContainerScreen } from '../features/create';

export default function ReelsScreen() {
  const { height, width } = useWindowDimensions();
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const viewabilityConfigRef = useRef({ itemVisiblePercentThreshold: 80 });

  const { openBottomSheet, isBottomSheetOpen, currentStep, selectedMedia } = useCreateStore();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch
  } = useInfiniteQuery({
    queryKey: ['reels-feed'],
    queryFn: ({ pageParam }) => {
      const page = pageParam as { timestamp: string; id: string } | null;
      return fetchReelsFeed(5, page?.timestamp, page?.id);
    },
    initialPageParam: null as any,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length === 0) return undefined;
      const lastItem = lastPage[lastPage.length - 1];
      return { timestamp: lastItem.created_at, id: lastItem.id };
    }
  });

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      const topVisible = viewableItems[0].item;
      setActiveVideoId(topVisible.id);
    }
  }).current;

  const renderItem = useCallback(({ item, index }: { item: any; index: number }) => {
    const isPlaying = item.id === activeVideoId;
    
    // We preload files that are neighbors of the active item in index (active - 2 to active + 2)
    const activeIndex = data?.pages.flatMap(p => p).findIndex(v => v.id === activeVideoId) ?? 0;
    const shouldPreload = Math.abs(index - activeIndex) <= 2;

    return (
      <View style={{ height, width }}>
        <ReelPlayer 
          video={item} 
          isPlaying={isPlaying} 
          shouldPreload={shouldPreload}
          height={height}
          width={width}
        />
      </View>
    );
  }, [activeVideoId, data]);

  const reels = data?.pages.flatMap(p => p) || [];
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // If user is inside active creation flow steps (e.g. MediaPicker, Camera, Edit, Caption)
  if (selectedMedia.length > 0 || currentStep !== 'PICKER') {
    return <CreateFlowContainerScreen />;
  }

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center, { height, width }]}>
        <ActivityIndicator size="large" color="#F59A18" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, styles.center, { height, width }]}>
        <Text style={styles.errorText}>Failed to load Reels Feed</Text>
        <Text style={styles.errorSubtext}>{error?.message || 'Check your internet connection'}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height, width }]}>
      <FlatList
        data={reels}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        pagingEnabled
        refreshing={refreshing}
        onRefresh={handleRefresh}
        showsVerticalScrollIndicator={false}
        snapToInterval={height}
        snapToAlignment="start"
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfigRef.current}
        onEndReached={() => hasNextPage && fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListFooterComponent={isFetchingNextPage ? (
          <View style={styles.footerLoader}>
            <ActivityIndicator size="small" color="#F59A18" />
          </View>
        ) : null}
      />

      {/* Floating Cyberpunk "+" Create Button */}
      <TouchableOpacity style={styles.floatingCreateBtn} activeOpacity={0.8} onPress={openBottomSheet}>
        <Plus size={28} color="#FFF" />
      </TouchableOpacity>

      <CreateBottomSheet />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#ED4956',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorSubtext: {
    color: '#A8A8A8',
    fontSize: 13,
    marginTop: 8,
  },
  footerLoader: {
    paddingVertical: 16,
    backgroundColor: '#000',
  },
  floatingCreateBtn: {
    position: 'absolute',
    bottom: 30,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F59A18',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#F59A18',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    borderWidth: 2,
    borderColor: '#FFF',
  },
});

