import pg from 'pg';

const passwords = ['jamilnawaz036', 'N@w@z1234', 'Nawaz9473', 'password123'];

async function testDirect() {
  for (const pass of passwords) {
    const connStr = `postgresql://postgres:${encodeURIComponent(pass)}@db.czxoschackeetzspupxh.supabase.co:5432/postgres`;
    console.log(`Testing direct 5432 with pass=${pass.substring(0, 3)}...`);
    const client = new pg.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });
    try {
      await client.connect();
      console.log(`🎉 SUCCESS! Direct connection string: ${connStr}`);
      await client.end();
      return;
    } catch (e) {
      console.log(`   Failed: ${e.message}`);
      try { await client.end(); } catch (err) {}
    }
  }
}

testDirect();
