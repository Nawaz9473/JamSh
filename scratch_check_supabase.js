const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const supabase = createClient('https://czxoschackeetzspupxh.supabase.co', 'sb_publishable__B8FxfHeDWfs65PqwfBhkQ_NA-r4HDH', {
  auth: { persistSession: false },
  realtime: { transport: ws }
});

async function main() {
  try {
    console.log('Logging in...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'jamilnawaz04@gmail.com',
      password: 'N@w@z1234'
    });

    if (authError) {
      console.error('Login failed:', authError.message);
      return;
    }

    const userId = authData.user.id;
    const peerId = '855dfed9-a81f-49f6-8259-d64fbdbc5d0c'; // The test user ID

    console.log('Inserting a new chat room...');
    const { data: room, error: roomError } = await supabase
      .from('chat_rooms')
      .insert({ type: 'direct' })
      .select()
      .single();

    if (roomError) {
      console.error('Create room failed:', roomError.message);
      return;
    }

    console.log('Room created successfully! ID:', room.id);

    console.log('Attempting to insert chat members...');
    const { data: members, error: membersError } = await supabase
      .from('chat_members')
      .insert([
        { room_id: room.id, user_id: userId, role: 'admin' },
        { room_id: room.id, user_id: peerId, role: 'member' }
      ]);

    if (membersError) {
      console.error('\nResult: Member insertion FAILED with error:', membersError.message);
    } else {
      console.log('\nResult: Member insertion SUCCESSFUL!');
    }

  } catch (err) {
    console.error('Runtime error:', err.message);
  }
}
main();
