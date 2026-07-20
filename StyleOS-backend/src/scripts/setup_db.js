/**
 * Run ONCE to create all Oracle tables.
 * Usage:  node src/scripts/setup_db.js
 */
require('dotenv').config();
const oracledb = require('oracledb');
const fs = require('fs');
const path = require('path');

async function setup() {
  console.log('🔌 Connecting to Oracle...');
  console.log(`   User:    ${process.env.DB_USER}`);
  console.log(`   Connect: ${process.env.DB_CONNECT}\n`);

  let conn;
  try {
    conn = await oracledb.getConnection({
      user:          process.env.DB_USER,
      password:      process.env.DB_PASSWORD,
      connectString: process.env.DB_CONNECT,
    });
    console.log('✅ Connected to Oracle\n');

    const sqlFile = path.join(__dirname, 'create_tables.sql');
    const raw = fs.readFileSync(sqlFile, 'utf8');

    // Split on the Oracle "/" delimiter (each statement ends with a bare /)
    const statements = raw
      .split(/^\/\s*$/m)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let ok = 0, skipped = 0, failed = 0;

    for (const stmt of statements) {
      const preview = stmt.slice(0, 70).replace(/\s+/g, ' ');
      try {
        await conn.execute(stmt);
        console.log(`✅  ${preview}`);
        ok++;
      } catch (err) {
        // ORA-00955 = name already used; ORA-01408 = index already exists
        if (err.message.includes('ORA-00955') || err.message.includes('ORA-01408')) {
          console.log(`⚠️  Already exists — ${preview}`);
          skipped++;
        } else {
          console.error(`❌  ${preview}`);
          console.error(`    ${err.message.split('\n')[0]}`);
          failed++;
        }
      }
    }

    await conn.commit();
    console.log(`\n📊 Done — ${ok} created, ${skipped} already existed, ${failed} errors`);
    if (failed === 0) console.log('🎉 Database ready!');

  } catch (err) {
    console.error('\n❌ Connection failed:', err.message);
    console.error('\nCheck your .env:');
    console.error('  DB_USER=system');
    console.error('  DB_PASSWORD=Aggarwal');
    console.error('  DB_CONNECT=localhost:1521/XEPDB1');
    process.exit(1);
  } finally {
    if (conn) await conn.close();
  }
}

setup();
