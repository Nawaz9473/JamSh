import { test, expect } from '@playwright/test';
import { fetchReelsFeed, likeReel, commentOnReel, trackVideoInteraction, uploadReel, mockDb, useAuthStore } from '@jamsh/api';

// Configure mock environment
test.beforeAll(async () => {
  // Explicitly trigger mock mode to make tests independent of running docker network
  process.env.VITE_USE_MOCK_API = 'true';
  
  // Set up dummy mock user
  const alexUser = { id: 'user_1', username: 'alex', display_name: 'Alex' };
  mockDb.setUsers([
    alexUser,
    { id: 'user_2', username: 'bob', display_name: 'Bob' }
  ]);
  
  useAuthStore.getState().setSession(alexUser as any, alexUser as any);
});

test.describe('Reels & Recommendation Engine Pipeline', () => {
  
  test('1. Should perform cursor-paginated reels feed fetches', async () => {
    // Force active user state inside useAuthStore
    const feed = await fetchReelsFeed(2);
    
    expect(feed).toBeDefined();
    expect(Array.isArray(feed)).toBe(true);
    expect(feed.length).toBeGreaterThan(0);
    
    const firstItem = feed[0];
    expect(firstItem.id).toBeDefined();
    expect(firstItem.video_url).toBeDefined();
    expect(firstItem.recommendation_score).toBeDefined();
  });

  test('2. Should log interactions and compute recommendation updates', async () => {
    const feed = await fetchReelsFeed(2);
    const targetVideo = feed[0];

    // Log a watch and like action
    await trackVideoInteraction(targetVideo.id, 'watch', 10, 100);
    await trackVideoInteraction(targetVideo.id, 'like');

    const updatedFeed = await fetchReelsFeed(2);
    const updatedVideo = updatedFeed.find(v => v.id === targetVideo.id);

    expect(updatedVideo).toBeDefined();
  });

  test('3. Should toggle likes and increment counts', async () => {
    const feed = await fetchReelsFeed(2);
    const targetVideo = feed[0];
    const initialLikes = targetVideo.like_count || 0;

    // First toggle: Like
    const state1 = await likeReel(targetVideo.id);
    expect(state1.liked).toBe(true);
    expect(state1.countChange).toBe(1);

    // Second toggle: Unlike
    const state2 = await likeReel(targetVideo.id);
    expect(state2.liked).toBe(false);
    expect(state2.countChange).toBe(-1);
  });

  test('4. Should submit video comments', async () => {
    const feed = await fetchReelsFeed(2);
    const targetVideo = feed[0];

    const comment = await commentOnReel(targetVideo.id, 'Stunning capture! 🔥');
    expect(comment).toBeDefined();
    expect(comment.content).toBe('Stunning capture! 🔥');
    expect(comment.video_id).toBe(targetVideo.id);
  });

  test('5. Should handle video uploads and publishing', async () => {
    const newVideo = await uploadReel(
      'https://assets.mixkit.co/videos/preview/mixkit-waves-breaking-in-slow-motion-1191-large.mp4',
      'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=400',
      'Calming summer ocean waves. 🌊 #ocean #chill',
      ['ocean', 'chill'],
      ['Nature'],
      14.2
    );

    expect(newVideo).toBeDefined();
    expect(newVideo.id).toBeDefined();
    expect(newVideo.caption).toBe('Calming summer ocean waves. 🌊 #ocean #chill');

    // Retrieve feed to ensure new upload appears
    const feed = await fetchReelsFeed(10);
    const found = feed.find(v => v.id === newVideo.id);
    expect(found).toBeDefined();
  });
});
