import { signInUser } from '../packages/api/dist/index.js';

async function test() {
  try {
    console.log('Logging in user...');
    // Try to login a user with correct credentials from scratch_check_supabase.js
    const result = await signInUser('jamilnawaz04@gmail.com', 'N@w@z1234');
    console.log('Signin Success:', result);
  } catch (err) {
    console.error('Signin Error:', err);
  }
}

test();
