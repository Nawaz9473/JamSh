const { Client } = require('pg');

const client = new Client({
  connectionString: "postgresql://postgres.czxoschackeetzspupxh:jamilnawaz036@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
});

async function main() {
  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL database.');
    
    // Check tables and policies
    const policiesRes = await client.query("SELECT * FROM pg_policies WHERE tablename = 'profiles';");
    console.log('Policies on profiles table:');
    console.log(policiesRes.rows);

    // Check count of profiles
    const countRes = await client.query("SELECT count(*) FROM public.profiles;");
    console.log('\nTotal profiles count:', countRes.rows[0].count);

    // List recent profiles
    const profilesRes = await client.query("SELECT id, username, display_name, created_at FROM public.profiles ORDER BY created_at DESC LIMIT 10;");
    console.log('\nRecent profiles:');
    console.log(profilesRes.rows);

    // List recent auth users
    const authRes = await client.query("SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC LIMIT 10;");
    console.log('\nRecent auth users:');
    console.log(authRes.rows);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

main();
