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

async function runPhase6Tests() {
  console.log('=== PHASE 6: POST SHARING COMPREHENSIVE TEST SUITE ===\n');
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
    const { client: clientB, user: userB } = await createAuthenticatedClient('sharer_b', `sharer_b_${timestamp}@test.com`);
    const { client: clientC, user: userC } = await createAuthenticatedClient('sharer_c', `sharer_c_${timestamp}@test.com`);

    console.log(`User A (Owner): ${userA.id}`);
    console.log(`User B (Sharer): ${userB.id}`);
    console.log(`User C (Sharer): ${userC.id}\n`);

    // Create test post
    const { data: testPost, error: pErr } = await clientA
      .from('posts')
      .insert({ user_id: userA.id, content: `Phase 6 Shares Test Post ${timestamp}`, type: 'text', status: 'published' })
      .select()
      .single();

    if (pErr) throw pErr;

    // --- TEST 1: User B shares post ---
    let shareB;
    try {
      const { data: sh, error: shErr } = await clientB
        .from('shares')
        .insert({ user_id: userB.id, post_id: testPost.id, target_type: 'external' })
        .select()
        .single();
      if (shErr) throw shErr;
      shareB = sh;

      const pass = sh && sh.user_id === userB.id && sh.post_id === testPost.id;
      recordResult('SHARE-01', 'User B shares post via public.shares insert', pass);
    } catch (e) {
      recordResult('SHARE-01', 'User B shares post via public.shares insert', false, e);
    }

    // --- TEST 2: shares_count DB trigger increment check ---
    try {
      await new Promise(r => setTimeout(r, 500));
      const { data: pRec, error: pRecErr } = await clientA.from('posts').select('*').eq('id', testPost.id).single();
      const { count: actualShares } = await clientA.from('shares').select('id', { count: 'exact' }).eq('post_id', testPost.id);
      console.log('Post record debug in SHARE-02:', { shares_count: pRec?.shares_count, pRecErr: pRecErr?.message });

      const pass = pRec && pRec.shares_count === 1 && actualShares === 1;
      recordResult('SHARE-02', 'shares_count counter updated via DB trigger', pass, null, { counter: pRec?.shares_count, actualShares });
    } catch (e) {
      recordResult('SHARE-02', 'shares_count counter updated via DB trigger', false, e);
    }

    // --- TEST 3: Multiple users sharing post ---
    try {
      await clientC.from('shares').insert({ user_id: userC.id, post_id: testPost.id, target_type: 'direct_message', target_id: 'room_123' });
      await new Promise(r => setTimeout(r, 500));

      const { data: pRec } = await clientA.from('posts').select('shares_count').eq('id', testPost.id).single();
      const { count: actualShares } = await clientA.from('shares').select('id', { count: 'exact' }).eq('post_id', testPost.id);

      const pass = pRec.shares_count === 2 && actualShares === 2;
      recordResult('SHARE-03', 'Multiple users sharing post updates counter to 2', pass, null, { counter: pRec.shares_count, actualShares });
    } catch (e) {
      recordResult('SHARE-03', 'Multiple users sharing post updates counter to 2', false, e);
    }

    // --- TEST 4: Confirm share intentionally produces NO push notification ---
    try {
      await new Promise(r => setTimeout(r, 1000));
      const { data: notifsA } = await clientA.from('notifications').select('*').eq('receiver_id', userA.id);
      const shareNotifs = (notifsA || []).filter(n => n.type === 'SHARE');

      const pass = shareNotifs.length === 0;
      recordResult('SHARE-04', 'Share produces ZERO push notifications (product specification)', pass);
    } catch (e) {
      recordResult('SHARE-04', 'Share produces ZERO push notifications (product specification)', false, e);
    }

    // --- TEST 5: User B queries own share history ---
    try {
      const { data: myShares } = await clientB.from('shares').select('*, post:posts(*)').eq('user_id', userB.id);
      const pass = Array.isArray(myShares) && myShares.some(s => s.post_id === testPost.id);
      recordResult('SHARE-05', 'User queries own shares history with post relation', pass, null, { count: myShares?.length });
    } catch (e) {
      recordResult('SHARE-05', 'User queries own shares history with post relation', false, e);
    }

  } catch (err) {
    console.error('\nFatal test execution error in Phase 6:', err);
  }

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`\n=== PHASE 6 SUMMARY: ${passed}/${total} PASSED (${failed} FAILED) ===`);
}

runPhase6Tests();
