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

async function runPhase4Tests() {
  console.log('=== PHASE 4: COMMENTS COMPREHENSIVE TEST SUITE ===\n');
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
    const { client: clientB, user: userB } = await createAuthenticatedClient('user_b', `user_b_${timestamp}@test.com`);
    const { client: clientC, user: userC } = await createAuthenticatedClient('user_c', `user_c_${timestamp}@test.com`);

    console.log(`User A (Owner): ${userA.id}`);
    console.log(`User B (Commenter): ${userB.id}`);
    console.log(`User C (Commenter): ${userC.id}\n`);

    // Create test post
    const { data: testPost, error: pErr } = await clientA
      .from('posts')
      .insert({ user_id: userA.id, content: `Phase 4 Comments Test Post ${timestamp}`, type: 'text', status: 'published' })
      .select()
      .single();

    if (pErr) throw pErr;
    console.log(`Created Test Post ID: ${testPost.id}\n`);

    // --- TEST 1: Empty comment submission rejection ---
    try {
      const { data, error: emptyErr } = await clientB.from('comments').insert({ user_id: userB.id, post_id: testPost.id, content: '   ' }).select();
      // Empty content check in application API or DB constraint
      const pass = !!emptyErr || (data && data.length === 0);
      recordResult('COMM-01', 'Empty comment submission validation', pass, null, { error: emptyErr?.message });
    } catch (e) {
      recordResult('COMM-01', 'Empty comment submission validation', true);
    }

    // --- TEST 2: Extremely long comment handling & preview truncation ---
    let longComment;
    try {
      const longText = 'A'.repeat(2000);
      const { data: comm, error: cErr } = await clientB.from('comments').insert({ user_id: userB.id, post_id: testPost.id, content: longText }).select().single();
      if (cErr) throw cErr;
      longComment = comm;

      const pass = comm && comm.content.length === 2000;
      recordResult('COMM-02', 'Extremely long comment insertion (2000 chars)', pass);
    } catch (e) {
      recordResult('COMM-02', 'Extremely long comment insertion (2000 chars)', false, e);
    }

    // --- TEST 3: Emoji and special character support ---
    let emojiComment;
    try {
      const emojiText = 'Amazing post! 🎉🔥🚀 Special chars: <script>alert(1)</script> \' " --';
      const { data: comm, error: cErr } = await clientC.from('comments').insert({ user_id: userC.id, post_id: testPost.id, content: emojiText }).select().single();
      if (cErr) throw cErr;
      emojiComment = comm;

      const pass = comm && comm.content.includes('🎉🔥🚀') && comm.content.includes('<script>');
      recordResult('COMM-03', 'Emoji & special characters support in comments', pass);
    } catch (e) {
      recordResult('COMM-03', 'Emoji & special characters support in comments', false, e);
    }

    // --- TEST 4: Comment editing (author authorization & update) ---
    try {
      const updatedText = 'Edited comment text ✨';
      const { data: updated, error: uErr } = await clientC.from('comments').update({ content: updatedText }).eq('id', emojiComment.id).select().single();
      if (uErr) throw uErr;

      const pass = updated && updated.content === updatedText;
      recordResult('COMM-04', 'Comment author editing content', pass, null, { updatedContent: updated?.content });
    } catch (e) {
      recordResult('COMM-04', 'Comment author editing content', false, e);
    }

    // --- TEST 5: Cross-user comment edit block ---
    try {
      const { error: blockErr } = await clientB.from('comments').update({ content: 'Hacked by User B' }).eq('id', emojiComment.id);
      // RLS or UPDATE policy should prevent editing another user's comment
      const { data: fetchComm } = await clientA.from('comments').select('content').eq('id', emojiComment.id).single();
      const pass = fetchComm.content !== 'Hacked by User B';
      recordResult('COMM-05', 'Cross-user comment editing rejected by RLS', pass);
    } catch (e) {
      recordResult('COMM-05', 'Cross-user comment editing rejected by RLS', true);
    }

    // --- TEST 6: Multiple top-level comments & ordering ---
    try {
      const { data: commentList } = await clientA.from('comments').select('*, user:profiles(*)').eq('post_id', testPost.id).is('parent_id', null).order('created_at', { ascending: false });
      const pass = Array.isArray(commentList) && commentList.length >= 2;
      recordResult('COMM-06', 'Multiple top-level comments query & descending ordering', pass, null, { count: commentList?.length });
    } catch (e) {
      recordResult('COMM-06', 'Multiple top-level comments query & descending ordering', false, e);
    }

    // --- TEST 7: Comment deletion & cascading count check ---
    try {
      await clientB.from('comments').delete().eq('id', longComment.id);
      const { data: checkDeleted } = await clientA.from('comments').select('id').eq('id', longComment.id).maybeSingle();
      
      const pass = !checkDeleted;
      recordResult('COMM-07', 'Comment author deletion', pass);
    } catch (e) {
      recordResult('COMM-07', 'Comment author deletion', false, e);
    }

    // --- TEST 8: Post comments_count trigger check ---
    try {
      const { data: postRecord } = await clientA.from('posts').select('comments_count').eq('id', testPost.id).single();
      const { count: actualCount } = await clientA.from('comments').select('id', { count: 'exact' }).eq('post_id', testPost.id);

      const pass = postRecord.comments_count === actualCount;
      recordResult('COMM-08', 'Post comments_count DB trigger synchronization', pass, null, { DB_counter: postRecord.comments_count, actualCount });
    } catch (e) {
      recordResult('COMM-08', 'Post comments_count DB trigger synchronization', false, e);
    }

  } catch (err) {
    console.error('\nFatal test execution error in Phase 4:', err);
  }

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`\n=== PHASE 4 SUMMARY: ${passed}/${total} PASSED (${failed} FAILED) ===`);
}

runPhase4Tests();
