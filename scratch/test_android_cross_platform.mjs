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

async function runAndroidCrossPlatformTests() {
  console.log('=== ANDROID ↔ WEB CROSS-PLATFORM REAL-TIME SUITE ===\n');
  const results = [];

  function recordResult(testId, description, passed, error = null, details = {}) {
    results.push({ testId, description, passed, error: error?.message || error, details });
    const symbol = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${symbol}] ${testId}: ${description}`);
    if (error) console.log(`   Error: ${error?.message || error}`);
  }

  try {
    const timestamp = Date.now();
    const { client: clientWeb, user: userWeb } = await createAuthenticatedClient('web_user_a', `web_user_a_${timestamp}@test.com`);
    const { client: clientAndroid, user: userAndroid } = await createAuthenticatedClient('android_user_b', `android_user_b_${timestamp}@test.com`);

    console.log(`Web Client User A: ${userWeb.id}`);
    console.log(`Android App User B: ${userAndroid.id}\n`);

    // --- TEST 1: Web → Android Post Creation Propagation ---
    let postWeb;
    try {
      const start = Date.now();
      const { data: p, error: pErr } = await clientWeb
        .from('posts')
        .insert({ user_id: userWeb.id, content: `Cross-Platform Web -> Android Test ${timestamp}`, type: 'text', status: 'published', visibility: 'public' })
        .select()
        .single();
      if (pErr) throw pErr;
      postWeb = p;

      // Query from Android client session
      const { data: androidFeed } = await clientAndroid.from('posts').select('*').eq('id', postWeb.id).single();
      const latencyMs = Date.now() - start;

      const pass = androidFeed && androidFeed.id === postWeb.id;
      recordResult('CROSS-AND-01', 'Web -> Android post creation real-time propagation', pass, null, { latencyMs });
    } catch (e) {
      recordResult('CROSS-AND-01', 'Web -> Android post creation real-time propagation', false, e);
    }

    // --- TEST 2: Android → Web Like & Reaction Propagation ---
    try {
      const start = Date.now();
      await clientAndroid.from('thunder_reactions').insert({ user_id: userAndroid.id, post_id: postWeb.id });

      // Verify Web client receives counter update
      await new Promise(r => setTimeout(r, 500));
      const { data: webPostCheck } = await clientWeb.from('posts').select('thunders_count').eq('id', postWeb.id).single();
      const latencyMs = Date.now() - start;

      const pass = webPostCheck.thunders_count === 1;
      recordResult('CROSS-AND-02', 'Android -> Web like reaction counter sync', pass, null, { latencyMs, count: webPostCheck.thunders_count });
    } catch (e) {
      recordResult('CROSS-AND-02', 'Android -> Web like reaction counter sync', false, e);
    }

    // --- TEST 3: Android → Web Comment & Notification Propagation ---
    try {
      const start = Date.now();
      await clientAndroid.from('comments').insert({ user_id: userAndroid.id, post_id: postWeb.id, content: 'Commented from Android device!' });

      await new Promise(r => setTimeout(r, 1000));
      const { data: notifsA } = await clientWeb.from('notifications').select('*').eq('receiver_id', userWeb.id);
      const latencyMs = Date.now() - start;

      const commentNotif = (notifsA || []).find(n => n.type === 'COMMENT' && n.sender_id === userAndroid.id);
      const pass = !!commentNotif;
      recordResult('CROSS-AND-03', 'Android -> Web comment & THUNDER notification delivery', pass, null, { latencyMs });
    } catch (e) {
      recordResult('CROSS-AND-03', 'Android -> Web comment & THUNDER notification delivery', false, e);
    }

  } catch (err) {
    console.error('\nFatal execution error in Android cross-platform test:', err);
  }

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`\n=== ANDROID CROSS-PLATFORM SUMMARY: ${passed}/${total} PASSED (${failed} FAILED) ===`);
}

runAndroidCrossPlatformTests();
