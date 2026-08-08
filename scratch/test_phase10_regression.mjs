import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const SUPABASE_URL = 'https://czxoschackeetzspupxh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__B8FxfHeDWfs65PqwfBhkQ_NA-r4HDH';

async function createAuthenticatedClient(usernamePrefix, email) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    realtime: { transport: ws }
  });

  const timestamp = Date.now();
  let { data: signInData, error: signInErr } = await client.auth.signInWithPassword({
    email,
    password: 'Password123!'
  });

  if (signInErr || !signInData?.user) {
    const { data: signUpData, error: signUpErr } = await client.auth.signUp({
      email,
      password: 'Password123!',
      options: { data: { username: `${usernamePrefix}_${timestamp}`, display_name: usernamePrefix } }
    });
    if (signUpErr) throw signUpErr;

    const { data: reloginData } = await client.auth.signInWithPassword({
      email,
      password: 'Password123!'
    });
    signInData = reloginData;
  }

  const user = signInData.user;
  await client.from('profiles').upsert({ id: user.id, username: `${usernamePrefix}_${timestamp}`, display_name: usernamePrefix });
  return { client, user };
}

async function runPhase10Tests() {
  console.log('=== PHASE 10: REGRESSION & END-TO-END SYSTEM SUITE ===\n');
  const results = [];

  function recordResult(testId, description, passed, error = null, details = {}) {
    results.push({ testId, description, passed, error: error?.message || error, details });
    const symbol = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${symbol}] ${testId}: ${description}`);
    if (error) console.log(`   Error: ${error?.message || error}`);
  }

  try {
    const timestamp = Date.now();
    const { client: clientA, user: userA } = await createAuthenticatedClient('reg_owner_a', `reg_owner_a_${timestamp}@test.com`);
    const { client: clientB, user: userB } = await createAuthenticatedClient('reg_user_b', `reg_user_b_${timestamp}@test.com`);

    // --- TEST 1: Home Feed Query Regression ---
    try {
      const { data: feedPosts, error: feedErr } = await clientA
        .from('posts')
        .select('*, media:post_media(*), user:profiles(*)')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(20);

      if (feedErr) throw feedErr;
      const pass = Array.isArray(feedPosts);
      recordResult('REG-01', 'Home Feed posts retrieval with media & user profiles', pass, null, { feedCount: feedPosts?.length });
    } catch (e) {
      recordResult('REG-01', 'Home Feed posts retrieval with media & user profiles', false, e);
    }

    // --- TEST 2: User Profile Posts Query Regression ---
    let postA;
    try {
      const { data: newP, error: pErr } = await clientA
        .from('posts')
        .insert({ user_id: userA.id, content: `Profile test #regression @user_b ${timestamp}`, hashtags: ['#regression'], mentions: ['@user_b'], type: 'text', status: 'published' })
        .select('*, media:post_media(*)')
        .single();
      if (pErr) throw pErr;
      postA = newP;

      const { data: userPosts, error: uErr } = await clientA
        .from('posts')
        .select('*, media:post_media(*)')
        .eq('user_id', userA.id)
        .order('created_at', { ascending: false });

      if (uErr) throw uErr;
      const pass = Array.isArray(userPosts) && userPosts.some(p => p.id === postA.id);
      recordResult('REG-02', 'User Profile posts retrieval for user_id', pass);
    } catch (e) {
      recordResult('REG-02', 'User Profile posts retrieval for user_id', false, e);
    }

    // --- TEST 3: Post Details View with Comments & Reaction Counts ---
    try {
      // User B likes and comments on Post A
      await clientB.from('thunder_reactions').insert({ user_id: userB.id, post_id: postA.id });
      await clientB.from('comments').insert({ user_id: userB.id, post_id: postA.id, content: 'Regression comment' });

      const { data: postDetails, error: dErr } = await clientA
        .from('posts')
        .select('*, comments(*, user:profiles(*)), media:post_media(*)')
        .eq('id', postA.id)
        .single();

      if (dErr) throw dErr;
      const pass = postDetails.thunders_count >= 1 && postDetails.comments_count >= 1 && postDetails.comments.length >= 1;
      recordResult('REG-03', 'Post Details view with full counters and joined comments', pass, null, postDetails);
    } catch (e) {
      recordResult('REG-03', 'Post Details view with full counters and joined comments', false, e);
    }

    // --- TEST 4: Notifications View Regression ---
    try {
      const { data: notifs, error: nErr } = await clientA
        .from('notifications')
        .select('*')
        .eq('receiver_id', userA.id)
        .order('created_at', { ascending: false });

      if (nErr) throw nErr;
      const pass = Array.isArray(notifs) && notifs.length >= 2;
      recordResult('REG-04', 'Notifications feed query for user_id', pass, null, { notifCount: notifs?.length });
    } catch (e) {
      recordResult('REG-04', 'Notifications feed query for user_id', false, e);
    }

    // --- TEST 5: Search Posts by Hashtag Array Operator ---
    try {
      const { data: searchResults, error: sErr } = await clientA
        .from('posts')
        .select('*')
        .contains('hashtags', ['#regression']);

      if (sErr) throw sErr;
      const pass = Array.isArray(searchResults) && searchResults.some(p => p.id === postA.id);
      recordResult('REG-05', 'Hashtag search query (.contains("hashtags"))', pass);
    } catch (e) {
      recordResult('REG-05', 'Hashtag search query (.contains("hashtags"))', false, e);
    }

  } catch (err) {
    console.error('\nFatal test execution error in Phase 10:', err);
  }

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`\n=== PHASE 10 SUMMARY: ${passed}/${total} PASSED (${failed} FAILED) ===`);
}

runPhase10Tests();
