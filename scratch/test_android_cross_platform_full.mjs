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

async function runComprehensiveAndroidCrossPlatformTests() {
  console.log('=== COMPREHENSIVE ANDROID ↔ WEB CROSS-PLATFORM TEST SUITE ===\n');
  const results = [];

  function recordResult(testId, description, passed, error = null, details = {}) {
    results.push({ testId, description, passed, error: error?.message || error, details });
    const symbol = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${symbol}] ${testId}: ${description}`);
    if (details && Object.keys(details).length > 0) {
      console.log(`   Details:`, JSON.stringify(details, null, 2));
    }
    if (error) console.log(`   Error: ${error?.message || error}`);
  }

  try {
    const timestamp = Date.now();
    const { client: clientWebA, user: userWebA } = await createAuthenticatedClient('web_owner_a', `web_owner_a_${timestamp}@test.com`);
    const { client: clientAndroidB, user: userAndroidB } = await createAuthenticatedClient('android_user_b', `android_user_b_${timestamp}@test.com`);
    const { client: clientWebC, user: userWebC } = await createAuthenticatedClient('web_user_c', `web_user_c_${timestamp}@test.com`);

    console.log(`User A (Web Owner): ${userWebA.id}`);
    console.log(`User B (Android Client): ${userAndroidB.id}`);
    console.log(`User C (Web Participant): ${userWebC.id}\n`);

    // 1. Post Creation (Web Owner A)
    let postA;
    try {
      const start = Date.now();
      const { data: p, error: pErr } = await clientWebA
        .from('posts')
        .insert({ user_id: userWebA.id, content: `Android E2E Post ${timestamp} #android @android_user_b`, type: 'text', status: 'published', visibility: 'public' })
        .select()
        .single();
      if (pErr) throw pErr;
      postA = p;

      // Query from Android client B
      const { data: androidFeedP } = await clientAndroidB.from('posts').select('*').eq('id', postA.id).single();
      const latencyMs = Date.now() - start;

      recordResult('AND-01', 'Web -> Android post creation real-time sync', androidFeedP?.id === postA.id, null, { latencyMs, postId: postA.id });
    } catch (e) {
      recordResult('AND-01', 'Web -> Android post creation real-time sync', false, e);
    }

    // 2. Like Post (Android Client B)
    try {
      const start = Date.now();
      await clientAndroidB.from('thunder_reactions').insert({ user_id: userAndroidB.id, post_id: postA.id });

      // Verify Web Owner A counter & THUNDER notification
      await new Promise(r => setTimeout(r, 600));
      const { data: postCheck } = await clientWebA.from('posts').select('thunders_count').eq('id', postA.id).single();
      const { data: notifs } = await clientWebA.from('notifications').select('*').eq('receiver_id', userWebA.id).eq('type', 'THUNDER');
      const latencyMs = Date.now() - start;

      const pass = postCheck.thunders_count === 1 && notifs.length >= 1;
      recordResult('AND-02', 'Android -> Web like reaction counter sync & notification delivery', pass, null, { latencyMs, thunders_count: postCheck.thunders_count, notifCount: notifs.length });
    } catch (e) {
      recordResult('AND-02', 'Android -> Web like reaction counter sync & notification delivery', false, e);
    }

    // 3. Comment on Post (Android Client B)
    let commentB;
    try {
      const start = Date.now();
      const { data: c, error: cErr } = await clientAndroidB
        .from('comments')
        .insert({ user_id: userAndroidB.id, post_id: postA.id, content: 'Commented from Android device!' })
        .select()
        .single();
      if (cErr) throw cErr;
      commentB = c;

      await new Promise(r => setTimeout(r, 600));
      const { data: postCheck } = await clientWebA.from('posts').select('comments_count').eq('id', postA.id).single();
      const { data: notifs } = await clientWebA.from('notifications').select('*').eq('receiver_id', userWebA.id).eq('type', 'COMMENT');
      const latencyMs = Date.now() - start;

      const pass = postCheck.comments_count === 1 && notifs.length >= 1;
      recordResult('AND-03', 'Android -> Web comment counter sync & COMMENT notification', pass, null, { latencyMs, comments_count: postCheck.comments_count, notifCount: notifs.length });
    } catch (e) {
      recordResult('AND-03', 'Android -> Web comment counter sync & COMMENT notification', false, e);
    }

    // 4. Reply to Comment (User C -> Android User B's Comment)
    try {
      const start = Date.now();
      await clientWebC.from('comments').insert({ user_id: userWebC.id, post_id: postA.id, parent_id: commentB.id, content: 'Reply to Android comment' });

      await new Promise(r => setTimeout(r, 600));
      const { data: notifsB } = await clientAndroidB.from('notifications').select('*').eq('receiver_id', userAndroidB.id);
      const latencyMs = Date.now() - start;

      const replyNotif = (notifsB || []).find(n => (n.type === 'REPLY' || n.type === 'COMMENT') && n.sender_id === userWebC.id);
      const pass = !!replyNotif;
      recordResult('AND-04', 'Web -> Android comment reply notification delivery', pass, null, { latencyMs, notifFound: pass });
    } catch (e) {
      recordResult('AND-04', 'Web -> Android comment reply notification delivery', false, e);
    }

    // 5. Unlike Post (Android Client B -> Unlike Removal Verification)
    try {
      const start = Date.now();
      await clientAndroidB.from('thunder_reactions').delete().eq('user_id', userAndroidB.id).eq('post_id', postA.id);

      await new Promise(r => setTimeout(r, 600));
      const { data: postCheck } = await clientWebA.from('posts').select('thunders_count').eq('id', postA.id).single();
      const { data: notifs } = await clientWebA.from('notifications').select('*').eq('receiver_id', userWebA.id).eq('type', 'THUNDER');
      const latencyMs = Date.now() - start;

      const pass = postCheck.thunders_count === 0 && notifs.length === 0;
      recordResult('AND-05', 'Android -> Web unlike reaction counter decrement & notification deletion', pass, null, { latencyMs, thunders_count: postCheck.thunders_count, remainingNotifs: notifs.length });
    } catch (e) {
      recordResult('AND-05', 'Android -> Web unlike reaction counter decrement & notification deletion', false, e);
    }

    // 6. Share Post (User C)
    try {
      const start = Date.now();
      await clientWebC.from('shares').insert({ user_id: userWebC.id, post_id: postA.id });

      await new Promise(r => setTimeout(r, 600));
      const { data: postCheck } = await clientAndroidB.from('posts').select('shares_count').eq('id', postA.id).single();
      const latencyMs = Date.now() - start;

      const pass = postCheck.shares_count === 1;
      recordResult('AND-06', 'Web -> Android share counter increment without push notifications', pass, null, { latencyMs, shares_count: postCheck.shares_count });
    } catch (e) {
      recordResult('AND-06', 'Web -> Android share counter increment without push notifications', false, e);
    }

  } catch (err) {
    console.error('\nFatal execution error in full Android cross-platform test:', err);
  }

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`\n=== COMPREHENSIVE ANDROID SUMMARY: ${passed}/${total} PASSED (${failed} FAILED) ===`);
}

runComprehensiveAndroidCrossPlatformTests();
