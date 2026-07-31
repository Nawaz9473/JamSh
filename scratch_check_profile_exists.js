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
    console.log('User ID:', userId);

    console.log('Fetching profile...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('Fetch profile failed:', profileError.message);
      return;
    }

    console.log('Profile found:', profile);

  } catch (err) {
    console.error('Runtime error:', err.message);
  }
}
main();
