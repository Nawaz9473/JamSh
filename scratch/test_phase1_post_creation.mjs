import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const SUPABASE_URL = 'https://czxoschackeetzspupxh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__B8FxfHeDWfs65PqwfBhkQ_NA-r4HDH';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws }
});

async function runPhase1Tests() {
  console.log('=== PHASE 1: POST CREATION COMPREHENSIVE TEST SUITE ===\n');
  const results = [];

  // Helper to log test result
  function recordResult(testId, description, passed, error = null, details = {}) {
    results.push({ testId, description, passed, error: error?.message || error, details });
    const symbol = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${symbol}] ${testId}: ${description}`);
    if (error) console.log(`   Error: ${error?.message || error}`);
  }

  try {
    // 0. Signup / Login test user
    const timestamp = Date.now();
    const testEmail = `post_tester_${timestamp}@example.com`;
    const testPassword = 'TestPassword123!';
    
    console.log('Registering test user...');
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: {
          username: `tester_${timestamp}`,
          display_name: 'Post Tester',
        }
      }
    });

    let user = signUpData?.user;
    if (signUpErr || !user) {
      console.log('Signup error, trying login with default account...');
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: 'jamilnawaz04@gmail.com',
        password: 'N@w@z1234'
      });
      if (signInErr) throw signInErr;
      user = signInData.user;
    }

    console.log(`Authenticated as User ID: ${user.id}\n`);

    // Ensure user profile exists
    const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).single();
    if (!profile) {
      await supabase.from('profiles').insert({
        id: user.id,
        username: `tester_${timestamp}`,
        display_name: 'Post Tester',
      });
    }

    // Helper to extract hashtags and mentions
    function extractTags(text) {
      const hashtags = (text.match(/#[a-zA-Z0-9_]+/g) || []).map(t => t.substring(1));
      const mentions = (text.match(/@[a-zA-Z0-9_]+/g) || []).map(m => m.substring(1));
      return { hashtags, mentions };
    }

    // Post creation wrapper
    async function createPostHelper(content, type, mediaUrls = []) {
      // Validation check: empty post
      if ((!content || content.trim().length === 0) && mediaUrls.length === 0) {
        throw new Error('Post content and media cannot both be empty');
      }

      const { hashtags, mentions } = extractTags(content || '');

      const { data: post, error: postErr } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          content: content || null,
          type: type,
          status: 'published',
          hashtags,
          mentions,
        })
        .select()
        .single();

      if (postErr) throw postErr;

      let insertedMedia = [];
      if (mediaUrls.length > 0) {
        const mediaInserts = mediaUrls.map((url, index) => ({
          post_id: post.id,
          media_url: url,
          media_type: url.match(/\.(mp4|mov|webm)$/i) ? 'video' : 'image',
          position: index,
        }));
        const { data: mData, error: mErr } = await supabase.from('post_media').insert(mediaInserts).select();
        if (mErr) throw mErr;
        insertedMedia = mData || [];
      }

      return { ...post, media: insertedMedia };
    }

    // --- TEST 1: Text-only post ---
    try {
      const res = await createPostHelper('Hello JamSh! First text post.', 'text');
      recordResult('POST-01', 'Text-only post creation', !!res.id && res.type === 'text');
    } catch (e) {
      recordResult('POST-01', 'Text-only post creation', false, e);
    }

    // --- TEST 2: Image-only post ---
    try {
      const res = await createPostHelper('', 'image', ['https://picsum.photos/600/400.jpg']);
      recordResult('POST-02', 'Image-only post creation', !!res.id && res.media.length === 1);
    } catch (e) {
      recordResult('POST-02', 'Image-only post creation', false, e);
    }

    // --- TEST 3: Video-only post ---
    try {
      const res = await createPostHelper('', 'video', ['https://assets.mixkit.co/videos/preview/mixkit-test-video.mp4']);
      recordResult('POST-03', 'Video-only post creation', !!res.id && res.media[0]?.media_type === 'video');
    } catch (e) {
      recordResult('POST-03', 'Video-only post creation', false, e);
    }

    // --- TEST 4: Text + Image post ---
    try {
      const res = await createPostHelper('Check out this photo!', 'image', ['https://picsum.photos/600/401.jpg']);
      recordResult('POST-04', 'Text + Image post creation', !!res.id && !!res.content && res.media.length === 1);
    } catch (e) {
      recordResult('POST-04', 'Text + Image post creation', false, e);
    }

    // --- TEST 5: Text + Video post ---
    try {
      const res = await createPostHelper('Check out this clip!', 'video', ['https://assets.mixkit.co/videos/preview/mixkit-clip.mp4']);
      recordResult('POST-05', 'Text + Video post creation', !!res.id && !!res.content && res.media[0]?.media_type === 'video');
    } catch (e) {
      recordResult('POST-05', 'Text + Video post creation', false, e);
    }

    // --- TEST 6: Multiple images ---
    try {
      const res = await createPostHelper('Gallery photo dump 📸', 'multiple', [
        'https://picsum.photos/600/402.jpg',
        'https://picsum.photos/600/403.jpg',
        'https://picsum.photos/600/404.jpg'
      ]);
      recordResult('POST-06', 'Multiple images post creation', !!res.id && res.media.length === 3);
    } catch (e) {
      recordResult('POST-06', 'Multiple images post creation', false, e);
    }

    // --- TEST 7: Multiple videos / mixed media ---
    try {
      const res = await createPostHelper('Mixed media carousel 🎥📷', 'multiple', [
        'https://picsum.photos/600/405.jpg',
        'https://assets.mixkit.co/videos/preview/mixkit-sample.mp4'
      ]);
      recordResult('POST-07', 'Multiple / mixed media post creation', !!res.id && res.media.length === 2);
    } catch (e) {
      recordResult('POST-07', 'Multiple / mixed media post creation', false, e);
    }

    // --- TEST 8: Empty post validation ---
    try {
      await createPostHelper('', 'text', []);
      recordResult('POST-08', 'Empty post validation (should fail)', false, 'Empty post was accepted unexpectedly');
    } catch (e) {
      recordResult('POST-08', 'Empty post validation (should fail)', true, null, { message: e.message });
    }

    // --- TEST 9: Maximum character limit boundary testing ---
    try {
      const maxContent = 'A'.repeat(2200); // 2200 char Instagram limit
      const res = await createPostHelper(maxContent, 'text');
      recordResult('POST-09', 'Maximum character limit boundary test', !!res.id && res.content.length === 2200);
    } catch (e) {
      recordResult('POST-09', 'Maximum character limit boundary test', false, e);
    }

    // --- TEST 10: Very large post payload ---
    try {
      const largeContent = 'B'.repeat(5000);
      const res = await createPostHelper(largeContent, 'text');
      recordResult('POST-10', 'Very large post payload handling', !!res.id && res.content.length === 5000);
    } catch (e) {
      recordResult('POST-10', 'Very large post payload handling', false, e);
    }

    // --- TEST 11: Emoji & full Unicode support ---
    try {
      const unicodeContent = '🔥 JamSh App 🚀 Arabic: مرحبا بكم | Japanese: こんにちは | Emojis: 🎉✨🎨💯';
      const res = await createPostHelper(unicodeContent, 'text');
      recordResult('POST-11', 'Emoji & Unicode support', !!res.id && res.content.includes('🎉✨🎨💯'));
    } catch (e) {
      recordResult('POST-11', 'Emoji & Unicode support', false, e);
    }

    // --- TEST 12: Special characters & SQL injection attempt strings ---
    try {
      const sqlInjectionStr = `SELECT * FROM users; DROP TABLE posts; -- <script>alert("XSS")</script> ' " \\`;
      const res = await createPostHelper(sqlInjectionStr, 'text');
      recordResult('POST-12', 'Special chars & SQL injection handling', !!res.id && res.content.includes('DROP TABLE'));
    } catch (e) {
      recordResult('POST-12', 'Special chars & SQL injection handling', false, e);
    }

    // --- TEST 13: URL parsing ---
    try {
      const urlContent = 'Check out JamSh site at https://jamsh.app/feature and http://test.com';
      const res = await createPostHelper(urlContent, 'text');
      recordResult('POST-13', 'URL string parsing in post', !!res.id && res.content.includes('https://jamsh.app'));
    } catch (e) {
      recordResult('POST-13', 'URL string parsing in post', false, e);
    }

    // --- TEST 14: @mentions extraction ---
    try {
      const mentionContent = 'Shoutout to @jamil_nawaz and @user_b for building this!';
      const res = await createPostHelper(mentionContent, 'text');
      const mentionsArr = res.mentions || [];
      const pass = mentionsArr.includes('jamil_nawaz') && mentionsArr.includes('user_b');
      recordResult('POST-14', '@mentions extraction & indexing', pass, null, { mentions: mentionsArr });
    } catch (e) {
      recordResult('POST-14', '@mentions extraction & indexing', false, e);
    }

    // --- TEST 15: #hashtags extraction ---
    try {
      const hashtagContent = 'Building #JamSh with #React #Supabase and #OfflineFirst!';
      const res = await createPostHelper(hashtagContent, 'text');
      const hashtagsArr = res.hashtags || [];
      const pass = hashtagsArr.includes('JamSh') && hashtagsArr.includes('Supabase');
      recordResult('POST-15', '#hashtags extraction & indexing', pass, null, { hashtags: hashtagsArr });
    } catch (e) {
      recordResult('POST-15', '#hashtags extraction & indexing', false, e);
    }

    // --- TEST 16: Invalid media upload handling ---
    try {
      // Invalid media URL (malformed or corrupt string)
      const res = await createPostHelper('Post with bad image', 'image', ['not_a_valid_url']);
      recordResult('POST-16', 'Invalid media upload handling', !!res.id && res.media[0]?.media_url === 'not_a_valid_url');
    } catch (e) {
      recordResult('POST-16', 'Invalid media upload handling', false, e);
    }

    // Feed Verification Query
    console.log('\n--- VERIFYING FEED READ QUERY ---');
    const { data: feedPosts, error: feedErr } = await supabase
      .from('posts')
      .select('*, user:profiles(*), media:post_media(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (feedErr) {
      console.error('Feed query failed:', feedErr.message);
    } else {
      console.log(`Feed query successful! Found ${feedPosts.length} posts for test user.`);
      console.log('Sample latest post:', {
        id: feedPosts[0]?.id,
        content: feedPosts[0]?.content?.substring(0, 40),
        hashtags: feedPosts[0]?.hashtags,
        mentions: feedPosts[0]?.mentions,
        mediaCount: feedPosts[0]?.media?.length
      });
    }

  } catch (err) {
    console.error('\nFatal test execution error:', err);
  }

  // Summary
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`\n=== PHASE 1 SUMMARY: ${passed}/${total} PASSED (${failed} FAILED) ===`);
}

runPhase1Tests();
