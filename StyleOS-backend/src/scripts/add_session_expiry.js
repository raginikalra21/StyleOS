/**
 * Additive migration — a Collab Cart is a live room with a lifespan, not a
 * permanent page (Collab Cart Complete Session UX Spec, §1). `expires_at` is
 * null for existing/legacy sessions (never expires, preserving old links);
 * new sessions set it explicitly at creation from the owner's chosen
 * duration.
 *
 * Usage: node src/scripts/add_session_expiry.js
 */
require('dotenv').config();
const oracledb = require('oracledb');

(async () => {
  const conn = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT,
  });
  console.log('Connected\n');

  const exec = async (label, sql) => {
    try {
      await conn.execute(sql);
      console.log('OK  ' + label);
    } catch (e) {
      const msg = e.message.slice(0, 100);
      if (msg.includes('ORA-00955') || msg.includes('ORA-01430') || msg.includes('ORA-02260')) {
        console.log('SKP ' + label + ' (already exists)');
      } else {
        console.error('ERR ' + label + ': ' + msg);
      }
    }
  };

  await exec('collab_sessions.expires_at', `ALTER TABLE collab_sessions ADD (expires_at TIMESTAMP)`);

  console.log('\nSession expiry migration complete.');
  await conn.close();
})().catch(err => { console.error(err); process.exit(1); });
