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

    // Log in with new user
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

async function runPhase2Tests() {
  console.log('=== PHASE 2: LIKES & REACTIONS COMPREHENSIVE TEST SUITE ===\n');
  const results = [];

  function recordResult(testId, description, passed, error = null, details = {}) {
    results.push({ testId, description, passed, error: error?.message || error, details });
    const symbol = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${symbol}] ${testId}: ${description}`);
    if (error) console.log(`   Error: ${error?.message || error}`);
  }

  try {
    const timestamp = Date.now();
    const { client: clientA, user: userA } = await createAuthenticatedClient('owner_a', `owner_a_${timestamp}@test.com`);
    const { client: clientB, user: userB } = await createAuthenticatedClient('liker_b', `liker_b_${timestamp}@test.com`);
    const { client: clientC, user: userC } = await createAuthenticatedClient('liker_c', `liker_c_${timestamp}@test.com`);

    console.log(`User A (Owner): ${userA.id}`);
    console.log(`User B (Liker): ${userB.id}`);
    console.log(`User C (Liker): ${userC.id}\n`);

    // 1. User A creates a test post
    const { data: testPost, error: postErr } = await clientA
      .from('posts')
      .insert({ user_id: userA.id, content: `Phase 2 Test Post ${timestamp}`, type: 'text', status: 'published' })
      .select()
      .single();

    if (postErr) throw postErr;
    console.log(`Created Test Post ID: ${testPost.id}\n`);

    // Helper to toggle reaction as specific client
    async function toggleReaction(client, user, postId) {
      const { data: existing } = await client
        .from('thunder_reactions')
        .select('id')
        .eq('user_id', user.id)
        .eq('post_id', postId)
        .is('comment_id', null);

      if (existing && existing.length > 0) {
        const { error: delErr } = await client.from('thunder_reactions').delete().eq('id', existing[0].id);
        if (delErr) throw delErr;
        return { thundered: false, change: -1 };
      } else {
        const { error: insErr } = await client.from('thunder_reactions').insert({ user_id: user.id, post_id: postId });
        if (insErr) throw insErr;
        return { thundered: true, change: 1 };
      }
    }

    // Helper to get post thunders count
    async function getPostCount(postId) {
      const { data: post } = await clientA.from('posts').select('thunders_count').eq('id', postId).single();
      const { count } = await clientA.from('thunder_reactions').select('id', { count: 'exact' }).eq('post_id', postId);
      return { DB_counter: post?.thunders_count || 0, DB_rows: count || 0 };
    }

    // --- TEST 1: Likes from multiple distinct users simultaneously ---
    try {
      await toggleReaction(clientB, userB, testPost.id);
      await toggleReaction(clientC, userC, testPost.id);
      const counts = await getPostCount(testPost.id);
      const pass = counts.DB_rows === 2;
      recordResult('LIKE-01', 'Likes from multiple distinct users', pass, null, counts);
    } catch (e) {
      recordResult('LIKE-01', 'Likes from multiple distinct users', false, e);
    }

    // --- TEST 2: Rapid multiple clicks / idempotency ---
    try {
      await toggleReaction(clientB, userB, testPost.id); // unlike
      await toggleReaction(clientB, userB, testPost.id); // re-like
      const counts = await getPostCount(testPost.id);
      const pass = counts.DB_rows === 2;
      recordResult('LIKE-02', 'Rapid toggle idempotency check', pass, null, counts);
    } catch (e) {
      recordResult('LIKE-02', 'Rapid toggle idempotency check', false, e);
    }

    // --- TEST 3: Duplicate like prevention ---
    try {
      const { error: dupErr } = await clientB.from('thunder_reactions').insert({ user_id: userB.id, post_id: testPost.id });
      const pass = !!dupErr && dupErr.code === '23505'; // Unique constraint error code
      recordResult('LIKE-03', 'Duplicate like prevention via unique constraint', pass, null, { errorCode: dupErr?.code });
    } catch (e) {
      recordResult('LIKE-03', 'Duplicate like prevention via unique constraint', false, e);
    }

    // --- TEST 4: Self-liking post behavior ---
    try {
      const res = await toggleReaction(clientA, userA, testPost.id);
      const counts = await getPostCount(testPost.id);
      recordResult('LIKE-04', 'Self-liking post allowed', res.thundered && counts.DB_rows === 3, null, counts);
    } catch (e) {
      recordResult('LIKE-04', 'Self-liking post allowed', false, e);
    }

    // --- TEST 5: Unlike flow and counter decrement ---
    try {
      await toggleReaction(clientA, userA, testPost.id); // Unlike User A
      await toggleReaction(clientB, userB, testPost.id); // Unlike User B
      await toggleReaction(clientC, userC, testPost.id); // Unlike User C
      const counts = await getPostCount(testPost.id);
      recordResult('LIKE-05', 'Unlike flow and zero count decrement', counts.DB_rows === 0, null, counts);
    } catch (e) {
      recordResult('LIKE-05', 'Unlike flow and zero count decrement', false, e);
    }

    // --- TEST 6: Refresh persistence after Like/Unlike ---
    try {
      await toggleReaction(clientB, userB, testPost.id); // Relike User B
      const { data: pData } = await clientA.from('posts').select('*, thunder_reactions(*)').eq('id', testPost.id).single();
      const pass = pData && pData.thunder_reactions.some(r => r.user_id === userB.id);
      recordResult('LIKE-06', 'Refresh persistence after Like/Unlike', pass);
    } catch (e) {
      recordResult('LIKE-06', 'Refresh persistence after Like/Unlike', false, e);
    }

    // --- TEST 7: Multi-client real-time sync of likes ---
    try {
      let realTimeTriggered = false;
      const channel = clientA.channel('post_likes_test');
      
      const subPromise = new Promise((resolve) => {
        channel
          .on('postgres_changes', { event: '*', schema: 'public', table: 'thunder_reactions', filter: `post_id=eq.${testPost.id}` }, (payload) => {
            realTimeTriggered = true;
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') resolve(true);
          });
      });

      await subPromise;
      await new Promise(r => setTimeout(r, 500));
      await toggleReaction(clientC, userC, testPost.id); // User C likes
      await new Promise(r => setTimeout(r, 2000));
      clientA.removeChannel(channel);

      recordResult('LIKE-07', 'Real-time WebSocket event dispatch for likes', realTimeTriggered);
    } catch (e) {
      recordResult('LIKE-07', 'Real-time WebSocket event dispatch for likes', false, e);
    }

    // --- TEST 8: Liking/reacting on deleted posts ---
    try {
      const { data: delPost } = await clientA.from('posts').insert({ user_id: userA.id, content: 'Temp post to delete', type: 'text' }).select().single();
      await clientA.from('posts').delete().eq('id', delPost.id);

      const { error: delLikeErr } = await clientB.from('thunder_reactions').insert({ user_id: userB.id, post_id: delPost.id });
      const pass = !!delLikeErr;
      recordResult('LIKE-08', 'Liking deleted post fails gracefully', pass, null, { error: delLikeErr?.message });
    } catch (e) {
      recordResult('LIKE-08', 'Liking deleted post fails gracefully', false, e);
    }

    // --- TEST 9: Counter Sync Trigger Check ---
    try {
      const counts = await getPostCount(testPost.id);
      const isConsistent = counts.DB_counter === counts.DB_rows;
      recordResult('LIKE-09', 'Counter consistency check (thunders_count vs reactions count)', isConsistent, null, counts);
    } catch (e) {
      recordResult('LIKE-09', 'Counter consistency check (thunders_count vs reactions count)', false, e);
    }

  } catch (err) {
    console.error('\nFatal test execution error in Phase 2:', err);
  }

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`\n=== PHASE 2 SUMMARY: ${passed}/${total} PASSED (${failed} FAILED) ===`);
}

runPhase2Tests();
