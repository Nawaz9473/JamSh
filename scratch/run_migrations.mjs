import pg from 'pg';
import fs from 'fs';
import path from 'path';

const connectionString = "postgresql://postgres.czxoschackeetzspupxh:N%40w%40z1234@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

async function runMigrations() {
  console.log('Connecting to database...');
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected successfully!');

  const migrationsDir = 'e:/JamSh/supabase/migrations';
  const files = fs.readdirSync(migrationsDir).sort();

  for (const file of files) {
    if (file.endsWith('.sql')) {
      console.log(`\nExecuting migration: ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      try {
        await client.query(sql);
        console.log(`✅ Success: ${file}`);
      } catch (err) {
        console.error(`❌ Error in ${file}:`, err.message);
      }
    }
  }

  await client.end();
  console.log('\nFinished migration execution.');
}

runMigrations();
