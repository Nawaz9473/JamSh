const { Client } = require('pg');

async function main() {
  const connectionString = "postgresql://postgres.czxoschackeetzspupxh:N%40w%40z1234@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true";
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    console.log('Connected successfully!');
    
    // Let's get count of public.profiles
    const profilesCount = await client.query('SELECT count(*) FROM public.profiles;');
    console.log('Profiles Count:', profilesCount.rows[0].count);

    // Let's get list of auth users
    const authUsers = await client.query('SELECT id, email, created_at FROM auth.users LIMIT 10;');
    console.log('Auth Users:', authUsers.rows);

    // Let's list some profiles
    const profiles = await client.query('SELECT id, username, display_name FROM public.profiles LIMIT 10;');
    console.log('Profiles:', profiles.rows);

  } catch (err) {
    console.error('Connection failed:', err.message);
  } finally {
    await client.end();
  }
}
main();
