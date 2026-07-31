import pkg from './packages/api/dist/index.js';
const { signUpUser } = pkg;

async function test() {
  try {
    console.log('Registering user...');
    const result = await signUpUser(
      `test_${Date.now()}@jamsh.com`,
      `user_${Date.now()}`,
      'Test User',
      '2000-01-01',
      'Password123!'
    );
    console.log('Signup Success:', result);
  } catch (err) {
    console.error('Signup Error:', err);
  }
}

test();
