const { Client } = require('pg');

async function testConnection(name, connectionString) {
  console.log(`Testing: ${name}...`);
  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });
  try {
    await client.connect();
    console.log(`  => SUCCESS! Connected.`);
    await client.end();
    return true;
  } catch (err) {
    console.log(`  => FAILED: ${err.message}`);
    try { await client.end(); } catch (e) {}
    return false;
  }
}

async function main() {
  const tests = [
    {
      name: "Pooled connection (from .env)",
      url: "postgresql://postgres.czxoschackeetzspupxh:jamilnawaz036@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
    },
    {
      name: "Direct connection with project ref username",
      url: "postgresql://postgres.czxoschackeetzspupxh:jamilnawaz036@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"
    },
    {
      name: "Direct connection with standard username",
      url: "postgresql://postgres:jamilnawaz036@db.czxoschackeetzspupxh.supabase.co:5432/postgres"
    },
    {
      name: "Direct connection with alternative user password",
      url: "postgresql://postgres:N%40w%40z1234@db.czxoschackeetzspupxh.supabase.co:5432/postgres"
    }
  ];

  for (const t of tests) {
    const ok = await testConnection(t.name, t.url);
    if (ok) {
      console.log(`\nFound working connection string: ${t.url}`);
      break;
    }
  }
}

main();
