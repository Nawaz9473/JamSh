import pg from 'pg';

const passwords = ['jamilnawaz036', 'N@w@z1234', 'N%40w%40z1234', 'Nawaz9473'];
const hosts = [
  'aws-1-ap-southeast-1.pooler.supabase.com',
  'db.czxoschackeetzspupxh.supabase.co'
];
const ports = [6543, 5432];

async function testAll() {
  for (const host of hosts) {
    for (const port of ports) {
      for (const pass of passwords) {
        const user = host.includes('pooler') ? 'postgres.czxoschackeetzspupxh' : 'postgres';
        const connStr = `postgresql://${user}:${encodeURIComponent(pass)}@${host}:${port}/postgres`;
        console.log(`Testing: ${user} @ ${host}:${port} with pass=${pass.substring(0, 3)}...`);
        const client = new pg.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
        try {
          await client.connect();
          console.log(`🎉 SUCCESS! Working connection string: ${connStr}`);
          await client.end();
          return connStr;
        } catch (e) {
          console.log(`   Failed: ${e.message}`);
          try { await client.end(); } catch (err) {}
        }
      }
    }
  }
}

testAll();
