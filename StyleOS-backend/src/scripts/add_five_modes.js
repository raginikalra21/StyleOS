/**
 * Additive migration for the Collab Cart Five Modes (Approver / Advisor /
 * Proxy / Peer / Co-Attendee) — one `ask_mode` column drives which UI and
 * which mechanics a collab session uses, per collab_cart_five_modes.md.
 *
 * Usage: node src/scripts/add_five_modes.js
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
      if (msg.includes('ORA-00955') || msg.includes('ORA-01408') || msg.includes('ORA-02260') || msg.includes('ORA-01430')) {
        console.log('SKP ' + label + ' (already exists)');
      } else {
        console.error('ERR ' + label + ': ' + msg);
      }
    }
  };

  // ask_mode: 'approver' | 'advisor' | 'proxy' | 'peer' | 'co_attendee'.
  // Defaults to 'advisor' — the existing swipe/react/comment flow, so every
  // collab session created before this migration keeps behaving exactly as
  // it always has.
  await exec('collab_sessions.ask_mode', `ALTER TABLE collab_sessions ADD (ask_mode VARCHAR2(20) DEFAULT 'advisor')`);

  // APPROVER — the Payer Lock. Null until the approver actually sets it;
  // once set, every /shop and /finalize call for this cart must treat it
  // as a hard ceiling (Invariant 4's own "never trust anything but code"
  // pattern, applied to a human-set number instead of a stated goal budget).
  await exec('collab_sessions.budget_lock', `ALTER TABLE collab_sessions ADD (budget_lock NUMBER)`);
  await exec('collab_sessions.item_price_cap', `ALTER TABLE collab_sessions ADD (item_price_cap NUMBER)`);
  await exec('collab_sessions.lock_detail_level', `ALTER TABLE collab_sessions ADD (lock_detail_level VARCHAR2(20) DEFAULT 'full')`);

  // PROXY — "who is this for" extended from gender to identity. The
  // recipient's own profile (as much as the buyer actually knows, or
  // an honest "I don't know" default), never surfaced back to the
  // recipient themselves if they later open the same link.
  await exec('collab_sessions.recipient_name', `ALTER TABLE collab_sessions ADD (recipient_name VARCHAR2(120))`);
  await exec('collab_sessions.recipient_relation', `ALTER TABLE collab_sessions ADD (recipient_relation VARCHAR2(40))`);
  await exec('collab_sessions.recipient_profile', `ALTER TABLE collab_sessions ADD (recipient_profile CLOB)`);

  // CO-ATTENDEE — the Clash Engine needs a shared "party" grouping so
  // multiple attendees' individual carts can be compared live, not just
  // reactions on one shared cart (which is what collab_sessions already
  // models for Approver/Advisor/Proxy/Peer).
  await exec('parties table', `
    CREATE TABLE parties (
      id VARCHAR2(36) PRIMARY KEY,
      name VARCHAR2(200),
      owner_id VARCHAR2(36),
      share_token VARCHAR2(36) NOT NULL,
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP
    )
  `);
  await exec('parties.uq_party_token', `CREATE UNIQUE INDEX uq_party_token ON parties(share_token)`);

  await exec('party_members table', `
    CREATE TABLE party_members (
      id VARCHAR2(36) PRIMARY KEY,
      party_id VARCHAR2(36) NOT NULL,
      user_id VARCHAR2(36),
      guest_name VARCHAR2(120),
      guest_token VARCHAR2(64),
      cart_id VARCHAR2(36),
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP
    )
  `);

  console.log('\nFive Modes migration complete.');
  await conn.close();
})().catch(err => { console.error(err); process.exit(1); });
