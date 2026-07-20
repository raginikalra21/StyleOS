/**
 * Additive migration for CLAUDE Part 3 / Section 3.1 — the convergence
 * engine. One new table: a tabu list of rejected products per slot, so a
 * rejected item can never come back for that slot, and so rejections can
 * be replayed to reconstruct the learned constraints for a slot.
 *
 * Usage: node src/scripts/add_convergence_tables.js
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
      const msg = e.message.slice(0, 80);
      if (msg.includes('ORA-00955') || msg.includes('ORA-01408') || msg.includes('ORA-02260')) {
        console.log('SKP ' + label + ' (already exists)');
      } else {
        console.error('ERR ' + label + ': ' + msg);
      }
    }
  };

  await exec('CREATE slot_rejections', [
    'CREATE TABLE slot_rejections (',
    '  id            VARCHAR2(36) PRIMARY KEY,',
    '  cart_id       VARCHAR2(36),',
    '  mission_id    VARCHAR2(36),',
    '  slot_key      VARCHAR2(150) NOT NULL,',
    '  product_id    VARCHAR2(36) NOT NULL,',
    '  product_price NUMBER,',
    '  product_colour VARCHAR2(50),',
    '  rejected_by   VARCHAR2(36),',
    '  reason_text   VARCHAR2(500),',
    '  reason_class  VARCHAR2(40),',
    '  rejected_at   TIMESTAMP DEFAULT SYSTIMESTAMP',
    ')',
  ].join(' '));

  await exec('IDX slot_rejections (cart_id/mission_id, slot_key)',
    'CREATE INDEX idx_rejections_slot ON slot_rejections(slot_key)');

  await conn.commit();

  const r = await conn.execute(
    "SELECT table_name FROM user_tables WHERE table_name = 'SLOT_REJECTIONS'",
    [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  console.log(r.rows.length === 1 ? '\n✅ slot_rejections ready' : '\n⚠️ slot_rejections missing');

  await conn.close();
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
