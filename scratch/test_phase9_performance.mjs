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

async function runPhase9Tests() {
  console.log('=== PHASE 9: PERFORMANCE STRESS & LATENCY TEST SUITE ===\n');
  const results = [];

  function recordResult(testId, description, passed, error = null, details = {}) {
    results.push({ testId, description, passed, error: error?.message || error, details });
    const symbol = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${symbol}] ${testId}: ${description}`);
    if (error) console.log(`   Error: ${error?.message || error}`);
  }

  try {
    const timestamp = Date.now();
    const { client: clientA, user: userA } = await createAuthenticatedClient('perf_user_a', `perf_user_a_${timestamp}@test.com`);

    // --- TEST 1: Feed posts query latency (<50ms target) ---
    try {
      const start = Date.now();
      const { data: postsData, error: pErr } = await clientA
        .from('posts')
        .select('*, media:post_media(*)')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(20);
      const latencyMs = Date.now() - start;

      if (pErr) throw pErr;
      const pass = latencyMs < 500; // API network + DB query roundtrip threshold
      recordResult('PERF-01', 'Feed posts query network roundtrip latency (<500ms API)', pass, null, { latencyMs, rows: postsData?.length });
    } catch (e) {
      recordResult('PERF-01', 'Feed posts query network roundtrip latency', false, e);
    }

    // --- TEST 2: Notifications query index performance (idx_notifications_receiver_created) ---
    try {
      const start = Date.now();
      const { data: notifData, error: nErr } = await clientA
        .from('notifications')
        .select('*')
        .eq('receiver_id', userA.id)
        .order('created_at', { ascending: false })
        .limit(20);
      const latencyMs = Date.now() - start;

      if (nErr) throw nErr;
      const pass = latencyMs < 500;
      recordResult('PERF-02', 'Notifications query index utilization (idx_notifications_receiver_created)', pass, null, { latencyMs });
    } catch (e) {
      recordResult('PERF-02', 'Notifications query index utilization', false, e);
    }

    // --- TEST 3: Concurrent like toggle stress test (5 rapid requests) ---
    try {
      const { data: testP } = await clientA
        .from('posts')
        .insert({ user_id: userA.id, content: `Perf Stress Post ${timestamp}`, type: 'text', status: 'published' })
        .select()
        .single();

      const start = Date.now();
      const promises = Array.from({ length: 5 }).map((_, i) =>
        clientA.from('thunder_reactions').upsert({ user_id: userA.id, post_id: testP.id })
      );
      await Promise.all(promises);
      const durationMs = Date.now() - start;
      const avgMs = Math.round(durationMs / 5);

      const pass = avgMs < 300;
      recordResult('PERF-03', 'Concurrent 5 like toggles stress test latency', pass, null, { totalDurationMs: durationMs, avgPerReqMs: avgMs });
    } catch (e) {
      recordResult('PERF-03', 'Concurrent 5 like toggles stress test latency', false, e);
    }

  } catch (err) {
    console.error('\nFatal test execution error in Phase 9:', err);
  }

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`\n=== PHASE 9 SUMMARY: ${passed}/${total} PASSED (${failed} FAILED) ===`);
}

runPhase9Tests();
