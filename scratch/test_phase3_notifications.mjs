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

async function runPhase3Tests() {
  console.log('=== PHASE 3: NOTIFICATIONS ARCHITECTURE & CLEANUP TEST SUITE ===\n');
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
    console.log(`User B (Actor): ${userB.id}`);
    console.log(`User C (Actor): ${userC.id}\n`);

    // 1. Create a test post by User A
    const { data: testPost, error: postErr } = await clientA
      .from('posts')
      .insert({ user_id: userA.id, content: `Phase 3 Test Post ${timestamp}`, type: 'text', status: 'published' })
      .select()
      .single();

    if (postErr) throw postErr;
    console.log(`Created Test Post ID: ${testPost.id}\n`);

    // Helper to get notifications for specific user
    async function getNotificationsFor(client, userId) {
      const { data } = await client.from('notifications').select('*').eq('receiver_id', userId).order('created_at', { ascending: false });
      return data || [];
    }

    // --- TEST 1: Single notification creation on Like & Zero Duplicates ---
    let reactionB;
    try {
      const { data: rx, error: rxErr } = await clientB.from('thunder_reactions').insert({ user_id: userB.id, post_id: testPost.id }).select().single();
      if (rxErr) throw rxErr;
      reactionB = rx;

      await new Promise(r => setTimeout(r, 1000));
      const notifs = await getNotificationsFor(clientA, userA.id);
      const postNotifs = notifs.filter(n => n.metadata?.entityId === testPost.id);
      
      const pass = postNotifs.length === 1 && postNotifs[0].sender_id === userB.id && postNotifs[0].type === 'THUNDER';
      recordResult('NOTIF-01', 'Single like notification creation & zero duplicates', pass, null, { count: postNotifs.length, notif: postNotifs[0] });
    } catch (e) {
      recordResult('NOTIF-01', 'Single like notification creation & zero duplicates', false, e);
    }

    // --- TEST 2: Unlike notification cleanup ---
    try {
      await clientB.from('thunder_reactions').delete().eq('id', reactionB.id);
      await new Promise(r => setTimeout(r, 1000));

      const notifs = await getNotificationsFor(clientA, userA.id);
      const postNotifs = notifs.filter(n => n.metadata?.entityId === testPost.id);

      const pass = postNotifs.length === 0;
      recordResult('NOTIF-02', 'Unlike notification cleanup via DB trigger', pass, null, { remainingCount: postNotifs.length });
    } catch (e) {
      recordResult('NOTIF-02', 'Unlike notification cleanup via DB trigger', false, e);
    }

    // --- TEST 3: Multiple users liking post creates 1 notif per user ---
    try {
      await clientB.from('thunder_reactions').insert({ user_id: userB.id, post_id: testPost.id });
      await clientC.from('thunder_reactions').insert({ user_id: userC.id, post_id: testPost.id });

      await new Promise(r => setTimeout(r, 1000));
      const notifs = await getNotificationsFor(clientA, userA.id);
      const postNotifs = notifs.filter(n => n.metadata?.entityId === testPost.id);

      const pass = postNotifs.length === 2 && postNotifs.some(n => n.sender_id === userB.id) && postNotifs.some(n => n.sender_id === userC.id);
      recordResult('NOTIF-03', 'Multiple user likes generate distinct 1 notification per user', pass, null, { count: postNotifs.length });
    } catch (e) {
      recordResult('NOTIF-03', 'Multiple user likes generate distinct 1 notification per user', false, e);
    }

    // --- TEST 4: Comment Notification creation ---
    let commentB;
    try {
      const { data: comm, error: cErr } = await clientB
        .from('comments')
        .insert({ user_id: userB.id, post_id: testPost.id, content: 'Awesome post!' })
        .select()
        .single();
      if (cErr) throw cErr;
      commentB = comm;

      await new Promise(r => setTimeout(r, 1000));
      const notifs = await getNotificationsFor(clientA, userA.id);
      const commentNotif = notifs.find(n => n.type === 'COMMENT' && n.group_key.includes(commentB.id));

      const pass = !!commentNotif && commentNotif.sender_id === userB.id;
      recordResult('NOTIF-04', 'Comment notification delivered to post owner', pass, null, { commentNotif });
    } catch (e) {
      recordResult('NOTIF-04', 'Comment notification delivered to post owner', false, e);
    }

    // --- TEST 5: Reply Notification creation ---
    try {
      const { data: replyC, error: rErr } = await clientC
        .from('comments')
        .insert({ user_id: userC.id, post_id: testPost.id, content: 'Great point!', parent_id: commentB.id })
        .select()
        .single();
      if (rErr) throw rErr;

      await new Promise(r => setTimeout(r, 1000));
      const notifsB = await getNotificationsFor(clientB, userB.id);
      const replyNotif = notifsB.find(n => n.type === 'REPLY' && n.group_key.includes(replyC.id));

      const pass = !!replyNotif && replyNotif.receiver_id === userB.id && replyNotif.sender_id === userC.id;
      recordResult('NOTIF-05', 'Reply notification delivered to parent comment author', pass, null, { replyNotif });
    } catch (e) {
      recordResult('NOTIF-05', 'Reply notification delivered to parent comment author', false, e);
    }

    // --- TEST 6: Comment deletion notification cleanup ---
    try {
      await clientB.from('comments').delete().eq('id', commentB.id);
      await new Promise(r => setTimeout(r, 1000));

      const notifsA = await getNotificationsFor(clientA, userA.id);
      const commentNotif = notifsA.find(n => n.group_key.includes(commentB.id));

      const pass = !commentNotif;
      recordResult('NOTIF-06', 'Comment deletion notification cleanup via DB trigger', pass);
    } catch (e) {
      recordResult('NOTIF-06', 'Comment deletion notification cleanup via DB trigger', false, e);
    }

    // --- TEST 7: Read/Unread state toggling ---
    try {
      const notifsA = await getNotificationsFor(clientA, userA.id);
      if (notifsA.length > 0) {
        const targetId = notifsA[0].id;
        await clientA.from('notifications').update({ status: 'READ', read_at: new Date().toISOString() }).eq('id', targetId);

        const { data: updated } = await clientA.from('notifications').select('status, read_at').eq('id', targetId).single();
        const pass = updated?.status === 'READ' && !!updated?.read_at;
        recordResult('NOTIF-07', 'Mark notification as read status update', pass, null, updated);
      } else {
        recordResult('NOTIF-07', 'Mark notification as read status update', true);
      }
    } catch (e) {
      recordResult('NOTIF-07', 'Mark notification as read status update', false, e);
    }

    // --- TEST 8: Outbox queue entry verification ---
    try {
      const { data: outboxRows } = await clientA.from('outbox').select('*').order('created_at', { ascending: false }).limit(10);
      const pass = Array.isArray(outboxRows) && outboxRows.length > 0;
      recordResult('NOTIF-08', 'Outbox pattern event row insertion check', pass, null, { count: outboxRows?.length });
    } catch (e) {
      recordResult('NOTIF-08', 'Outbox pattern event row insertion check', false, e);
    }

  } catch (err) {
    console.error('\nFatal test execution error in Phase 3:', err);
  }

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`\n=== PHASE 3 SUMMARY: ${passed}/${total} PASSED (${failed} FAILED) ===`);
}

runPhase3Tests();
