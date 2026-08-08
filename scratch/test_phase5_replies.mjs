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

async function runPhase5Tests() {
  console.log('=== PHASE 5: COMMENT REPLIES COMPREHENSIVE TEST SUITE ===\n');
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
    console.log(`User C (Replier): ${userC.id}\n`);

    // Create test post
    const { data: testPost, error: pErr } = await clientA
      .from('posts')
      .insert({ user_id: userA.id, content: `Phase 5 Replies Test Post ${timestamp}`, type: 'text', status: 'published' })
      .select()
      .single();

    if (pErr) throw pErr;

    // Create root comment by User B
    const { data: rootComment, error: rErr } = await clientB
      .from('comments')
      .insert({ user_id: userB.id, post_id: testPost.id, content: 'Root comment for replies test' })
      .select()
      .single();

    if (rErr) throw rErr;

    // --- TEST 1: Reply to top-level comment (parent_id linking) ---
    let reply1;
    try {
      const { data: rep, error: repErr } = await clientC
        .from('comments')
        .insert({ user_id: userC.id, post_id: testPost.id, content: 'Reply 1 from User C', parent_id: rootComment.id })
        .select()
        .single();
      if (repErr) throw repErr;
      reply1 = rep;

      const pass = rep && rep.parent_id === rootComment.id;
      recordResult('REPLY-01', 'Reply to top-level comment (parent_id linking)', pass);
    } catch (e) {
      recordResult('REPLY-01', 'Reply to top-level comment (parent_id linking)', false, e);
    }

    // --- TEST 2: Multiple replies on the same comment from different user accounts ---
    let reply2;
    try {
      const { data: rep, error: repErr } = await clientA
        .from('comments')
        .insert({ user_id: userA.id, post_id: testPost.id, content: 'Reply 2 from Post Owner User A', parent_id: rootComment.id })
        .select()
        .single();
      if (repErr) throw repErr;
      reply2 = rep;

      const { data: allReplies } = await clientA.from('comments').select('*').eq('parent_id', rootComment.id);
      const pass = Array.isArray(allReplies) && allReplies.length === 2;
      recordResult('REPLY-02', 'Multiple replies on same comment from distinct users', pass, null, { count: allReplies?.length });
    } catch (e) {
      recordResult('REPLY-02', 'Multiple replies on same comment from distinct users', false, e);
    }

    // --- TEST 3: Nested multi-level replies (replying to a reply) ---
    let nestedReply;
    try {
      const { data: rep, error: repErr } = await clientB
        .from('comments')
        .insert({ user_id: userB.id, post_id: testPost.id, content: 'Nested reply from User B to User C', parent_id: reply1.id })
        .select()
        .single();
      if (repErr) throw repErr;
      nestedReply = rep;

      const pass = rep && rep.parent_id === reply1.id;
      recordResult('REPLY-03', 'Nested multi-level reply (parent_id = reply1.id)', pass);
    } catch (e) {
      recordResult('REPLY-03', 'Nested multi-level reply (parent_id = reply1.id)', false, e);
    }

    // --- TEST 4: Reply tree hierarchy & ordering ---
    try {
      const { data: topComments } = await clientA
        .from('comments')
        .select('*, user:profiles(*)')
        .eq('post_id', testPost.id)
        .is('parent_id', null);

      const rootId = topComments[0].id;
      const { data: directReplies } = await clientA
        .from('comments')
        .select('*')
        .eq('parent_id', rootId)
        .order('created_at', { ascending: true });

      const pass = directReplies.length === 2 && directReplies[0].id === reply1.id && directReplies[1].id === reply2.id;
      recordResult('REPLY-04', 'Reply tree hierarchy & ascending chronological ordering', pass);
    } catch (e) {
      recordResult('REPLY-04', 'Reply tree hierarchy & ascending chronological ordering', false, e);
    }

    // --- TEST 5: Deleting parent comment cascades to child replies ---
    try {
      await clientB.from('comments').delete().eq('id', rootComment.id);
      await new Promise(r => setTimeout(r, 1000));

      const { data: checkChild1 } = await clientA.from('comments').select('id').eq('id', reply1.id).maybeSingle();
      const { data: checkNested } = await clientA.from('comments').select('id').eq('id', nestedReply.id).maybeSingle();

      const pass = !checkChild1 && !checkNested;
      recordResult('REPLY-05', 'Deleting parent comment cascades to child replies in DB', pass);
    } catch (e) {
      recordResult('REPLY-05', 'Deleting parent comment cascades to child replies in DB', false, e);
    }

    // --- TEST 6: Total post comments_count updated after reply cascade deletion ---
    try {
      const { data: postRec } = await clientA.from('posts').select('comments_count').eq('id', testPost.id).single();
      const { count: actualCount } = await clientA.from('comments').select('id', { count: 'exact' }).eq('post_id', testPost.id);

      const pass = postRec.comments_count === 0 && actualCount === 0;
      recordResult('REPLY-06', 'Post comments_count accurate after reply cascade deletion', pass, null, { counter: postRec.comments_count, actualCount });
    } catch (e) {
      recordResult('REPLY-06', 'Post comments_count accurate after reply cascade deletion', false, e);
    }

  } catch (err) {
    console.error('\nFatal test execution error in Phase 5:', err);
  }

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`\n=== PHASE 5 SUMMARY: ${passed}/${total} PASSED (${failed} FAILED) ===`);
}

runPhase5Tests();
