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

async function runPhase8Tests() {
  console.log('=== PHASE 8: REAL-TIME SYNCHRONIZATION COMPREHENSIVE SUITE ===\n');
  const results = [];

  function recordResult(testId, description, passed, error = null, details = {}) {
    results.push({ testId, description, passed, error: error?.message || error, details });
    const symbol = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${symbol}] ${testId}: ${description}`);
    if (error) console.log(`   Error: ${error?.message || error}`);
  }

  try {
    const timestamp = Date.now();
    const { client: clientA, user: userA } = await createAuthenticatedClient('rt_listener_a', `rt_listener_a_${timestamp}@test.com`);
    const { client: clientB, user: userB } = await createAuthenticatedClient('rt_actor_b', `rt_actor_b_${timestamp}@test.com`);

    console.log(`User A (Listener): ${userA.id}`);
    console.log(`User B (Actor): ${userB.id}\n`);

    // --- TEST 1: Real-time post creation event broadcast ---
    let createdPostId;
    try {
      let postReceived = false;
      const postChannel = clientA.channel('rt_posts_test');
      
      const subPromise = new Promise((resolve) => {
        postChannel
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts', filter: 'visibility=eq.public' }, (payload) => {
            if (payload.new?.content?.includes(`RT Post ${timestamp}`)) {
              postReceived = true;
              createdPostId = payload.new.id;
            }
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') resolve(true);
          });
      });

      await subPromise;
      await new Promise(r => setTimeout(r, 1000));

      const { data: newP, error: pErr } = await clientB
        .from('posts')
        .insert({ user_id: userB.id, content: `RT Post ${timestamp}`, type: 'text', status: 'published', visibility: 'public' })
        .select()
        .single();
      if (pErr) throw pErr;
      if (!createdPostId) createdPostId = newP.id;

      await new Promise(r => setTimeout(r, 3000));
      clientA.removeChannel(postChannel);

      recordResult('RT-01', 'Real-time WebSocket post creation broadcast payload', postReceived);
    } catch (e) {
      recordResult('RT-01', 'Real-time WebSocket post creation broadcast payload', false, e);
    }

    // --- TEST 2: Real-time like event broadcast ---
    try {
      let likeReceived = false;
      const likeChannel = clientA.channel('rt_likes_test');

      const subPromise = new Promise((resolve) => {
        likeChannel
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'thunder_reactions', filter: `post_id=eq.${createdPostId}` }, (payload) => {
            likeReceived = true;
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') resolve(true);
          });
      });

      await subPromise;
      await new Promise(r => setTimeout(r, 1000));

      await clientB.from('thunder_reactions').insert({ user_id: userB.id, post_id: createdPostId });

      await new Promise(r => setTimeout(r, 3000));
      clientA.removeChannel(likeChannel);

      recordResult('RT-02', 'Real-time WebSocket thunder reaction broadcast payload', likeReceived);
    } catch (e) {
      recordResult('RT-02', 'Real-time WebSocket thunder reaction broadcast payload', false, e);
    }

    // --- TEST 3: Real-time comment event broadcast ---
    try {
      let commentReceived = false;
      const commentChannel = clientA.channel('rt_comments_test');

      const subPromise = new Promise((resolve) => {
        commentChannel
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `post_id=eq.${createdPostId}` }, (payload) => {
            commentReceived = true;
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') resolve(true);
          });
      });

      await subPromise;
      await new Promise(r => setTimeout(r, 1000));

      await clientB.from('comments').insert({ user_id: userB.id, post_id: createdPostId, content: 'Live real-time comment!' });

      await new Promise(r => setTimeout(r, 3000));
      clientA.removeChannel(commentChannel);

      recordResult('RT-03', 'Real-time WebSocket comment insertion broadcast payload', commentReceived);
    } catch (e) {
      recordResult('RT-03', 'Real-time WebSocket comment insertion broadcast payload', false, e);
    }

    // --- TEST 4: Real-time notification event broadcast ---
    try {
      let notifReceived = false;
      const notifChannel = clientA.channel('rt_notifs_test');

      const subPromise = new Promise((resolve) => {
        notifChannel
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
            if (payload.new?.receiver_id === userA.id) {
              notifReceived = true;
            }
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') resolve(true);
          });
      });

      await subPromise;
      await new Promise(r => setTimeout(r, 1000));

      // User A creates post
      const { data: postA } = await clientA
        .from('posts')
        .insert({ user_id: userA.id, content: `User A Post ${timestamp}`, type: 'text', status: 'published', visibility: 'public' })
        .select()
        .single();

      // User B comments on User A's post (triggers notification)
      const { data: commData, error: commErr } = await clientB.from('comments').insert({ user_id: userB.id, post_id: postA.id, content: 'Notify live!' }).select().single();
      
      await new Promise(r => setTimeout(r, 4500));
      const { data: checkNotif } = await clientA.from('notifications').select('*').eq('receiver_id', userA.id);
      console.log('RT-04 DB check notifications for User A:', { count: checkNotif?.length, commErr: commErr?.message, notifs: checkNotif });

      clientA.removeChannel(notifChannel);

      recordResult('RT-04', 'Real-time WebSocket notification broadcast payload', notifReceived);
    } catch (e) {
      recordResult('RT-04', 'Real-time WebSocket notification broadcast payload', false, e);
    }

  } catch (err) {
    console.error('\nFatal test execution error in Phase 8:', err);
  }

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  console.log(`\n=== PHASE 8 SUMMARY: ${passed}/${total} PASSED (${failed} FAILED) ===`);
}

runPhase8Tests();
