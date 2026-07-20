/**
 * Additive migration for CLAUDE Part 2 / Page 56 — repetition-avoidance
 * memory. One new table, no changes to existing schema. Safe to re-run;
 * skips gracefully if the table already exists.
 *
 * Usage: node src/scripts/add_context_layer_tables.js
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

  await exec('CREATE venue_shipment_log', [
    'CREATE TABLE venue_shipment_log (',
    '  id           VARCHAR2(36) PRIMARY KEY,',
    '  product_id   VARCHAR2(36) NOT NULL,',
    '  venue_key    VARCHAR2(150) NOT NULL,',
    '  shipped_at   TIMESTAMP DEFAULT SYSTIMESTAMP,',
    '  mission_type VARCHAR2(20)',
    ')',
  ].join(' '));

  await exec('IDX venue_shipment_log (venue_key, product_id)',
    'CREATE INDEX idx_vsl_venue_product ON venue_shipment_log(venue_key, product_id)');

  await conn.commit();

  const r = await conn.execute(
    "SELECT table_name FROM user_tables WHERE table_name = 'VENUE_SHIPMENT_LOG'",
    [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  console.log(r.rows.length === 1 ? '\n✅ venue_shipment_log ready' : '\n⚠️ venue_shipment_log missing');

  await conn.close();
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
