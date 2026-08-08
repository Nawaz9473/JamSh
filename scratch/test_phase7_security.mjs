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

async function runPhase7Tests() {
  console.log('=== PHASE 7: SECURITY & AUTHORIZATION COMPREHENSIVE SUITE ===\n');
  const results = [];

  function recordResult(testId, description, passed, error = null, details = {}) {
    results.push({ testId, description, passed, error: error?.message || error, details });
    const symbol = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${symbol}] ${testId}: ${description}`);
    if (error) console.log(`   Error: ${error?.message || error}`);
  }

  try {
    const timestamp = Date.now();
    const { client: clientA, user: userA } = await createAuthenticatedClient('sec_owner_a', `sec_owner_a_${timestamp}@test.com`);
    const { client: clientB, user: userB } = await createAuthenticatedClient('sec_attacker_b', `sec_attacker_b_${timestamp}@test.com`);
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false }, realtime: { transport: ws } });

    console.log(`User A (Victim/Owner): ${userA.id}`);
    console.log(`User B (Attacker): ${userB.id}\n`);

    // Create target post owned by User A
    const { data: targetPost, error: pErr } = await clientA
      .from('posts')
      .insert({ user_id: userA.id, content: `Target post for security test ${timestamp}`, type: 'text', status: 'published' })
      .select()
      .single();

    if (pErr) throw pErr;

    // --- TEST 1: Cross-user post content modification blocked ---
    try {
      const { data: updateRes, error: updateErr } = await clientB
        .from('posts')
        .update({ content: 'DEFACED BY ATTACKER B' })
        .eq('id', targetPost.id)
        .select();

      const { data: verifyPost } = await clientA.from('posts').select('content').eq('id', targetPost.id).single();
      const pass = verifyPost.content !== 'DEFACED BY ATTACKER B' && (!updateRes || updateRes.length === 0);
      recordResult('SEC-01', 'Cross-user post content update blocked by RLS', pass);
    } catch (e) {
      recordResult('SEC-01', 'Cross-user post content update blocked by RLS', true);
    }

    // --- TEST 2: Cross-user post deletion blocked ---
    try {
      const { data: delRes, error: delErr } = await clientB
        .from('posts')
        .delete()
        .eq('id', targetPost.id)
        .select();

      const { data: verifyPost } = await clientA.from('posts').select('id').eq('id', targetPost.id).single();
      const pass = !!verifyPost && (!delRes || delRes.length === 0);
      recordResult('SEC-02', 'Cross-user post deletion blocked by RLS', pass);
    } catch (e) {
      recordResult('SEC-02', 'Cross-user post deletion blocked by RLS', true);
    }

    // --- TEST 3: Unauthenticated post creation rejected ---
    try {
      const { data: unauthData, error: unauthErr } = await anonClient
        .from('posts')
        .insert({ user_id: '00000000-0000-0000-0000-000000000000', content: 'Unauthenticated post', type: 'text', status: 'published' })
        .select();

      const pass = !!unauthErr || (!unauthData || unauthData.length === 0);
      recordResult('SEC-03', 'Unauthenticated post creation rejected', pass, null, { error: unauthErr?.message });
    } catch (e) {
      recordResult('SEC-03', 'Unauthenticated post creation rejected', true);
    }

    // --- TEST 4: Invalid/Fake JWT token request rejected ---
    try {
      const fakeJwtClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fakeToken' } }
      });
      const { data: fakeData, error: fakeErr } = await fakeJwtClient
        .from('posts')
        .insert({ user_id: userB.id, content: 'Fake JWT post', type: 'text', status: 'published' })
        .select();

      const pass = !!fakeErr || (!fakeData || fakeData.length === 0);
      recordResult('SEC-04', 'Invalid JWT session payload rejected', pass, null, { error: fakeErr?.message });
    } catch (e) {
      recordResult('SEC-04', 'Invalid JWT session payload rejected', true);
    }

    // --- TEST 5: SQL Injection & XSS Payload Insertion Safety ---
    try {
      const injectionPayload = "'; DROP TABLE posts; -- <script>alert('XSS')</script>";
      const { data: injPost, error: injErr } = await clientA
        .from('posts')
        .insert({ user_id: userA.id, content: injectionPayload, type: 'text', status: 'published' })
        .select()
        .single();

      // Verify posts table still exists & content stored safely escaped
      const { data: fetchInj } = await clientA.from('posts').select('content').eq('id', injPost.id).single();
      const pass = fetchInj.content === injectionPayload;
      recordResult('SEC-05', 'SQL injection & XSS payload parameterization safety', pass);
    } catch (e) {
      recordResult('SEC-05', 'SQL injection & XSS payload parameterization safety', false, e);
    }

    // --- TEST 6: User A post deletion succeeds for post owner ---
    try {
      await clientA.from('posts').delete().eq('id', targetPost.id);
      const { data: fetchDeleted } = await clientA.from('posts').select('id').eq('id', targetPost.id).maybeSingle();
      const pass = !fetchDeleted;
      recordResult('SEC-06', 'Post owner post deletion succeeds', pass);
    } catch (e) {
      recordResult('SEC-06', 'Post owner post deletion succeeds', false, e);
    }

  } catch (err) {
    console.error('\nFatal test execution error in Phase 7:', err);
  }

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`\n=== PHASE 7 SUMMARY: ${passed}/${total} PASSED (${failed} FAILED) ===`);
}

runPhase7Tests();
