/**
 * Introspects the LIVE Oracle schema (ground truth — more reliable than
 * reconstructing history from 7+ separate migration scripts written over
 * time) and generates an equivalent Postgres CREATE TABLE script.
 *
 * Usage: node src/scripts/generate_postgres_schema.js > schema_postgres.sql
 */
require('dotenv').config();
const { query } = require('../db_oracle');

const TABLES = [
  'USERS', 'PRODUCTS', 'CARTS', 'CART_ITEMS', 'COLLAB_SESSIONS', 'COLLAB_MEMBERS',
  'REACTIONS', 'GOALS', 'WARDROBES', 'MISSIONS', 'MISSION_EVENTS', 'MISSION_MEMBERS',
  'MISSION_SLOTS', 'PARTIES', 'PARTY_MEMBERS', 'SLOT_REJECTIONS', 'VENUE_SHIPMENT_LOG',
];

// Oracle type -> Postgres type. NUMBER with no precision/scale is used
// throughout this codebase for both integers (flags, counts) and money
// (price) — NUMERIC preserves both without precision loss either way.
function pgType(row) {
  const t = row.DATA_TYPE;
  if (t === 'VARCHAR2' || t === 'NVARCHAR2') return `VARCHAR(${row.DATA_LENGTH || row.CHAR_LENGTH || 4000})`;
  if (t === 'CHAR') return `CHAR(${row.DATA_LENGTH || 1})`;
  if (t === 'CLOB' || t === 'NCLOB') return 'TEXT';
  if (t === 'NUMBER') {
    if (row.DATA_PRECISION && row.DATA_SCALE === 0) return `INTEGER`;
    return 'NUMERIC';
  }
  if (t === 'TIMESTAMP(6)' || t === 'TIMESTAMP' || t.startsWith('TIMESTAMP')) return 'TIMESTAMP';
  if (t === 'DATE') return 'TIMESTAMP';
  return 'TEXT'; // safe fallback — never crash the generator on an unexpected type
}

async function main() {
  const out = [];
  out.push('-- Auto-generated from the live Oracle schema. See generate_postgres_schema.js.');
  out.push('');

  for (const table of TABLES) {
    const cols = await query(
      `SELECT column_name, data_type, data_length, char_length, data_precision, data_scale, nullable
       FROM user_tab_columns WHERE table_name = :t ORDER BY column_id`,
      { t: table }
    );
    if (cols.rows.length === 0) { console.error(`-- SKIPPED ${table} (not found in live schema)`); continue; }

    const pk = await query(
      `SELECT cols.column_name FROM user_constraints cons
       JOIN user_cons_columns cols ON cons.constraint_name = cols.constraint_name
       WHERE cons.table_name = :t AND cons.constraint_type = 'P'`,
      { t: table }
    );
    const pkCols = pk.rows.map(r => r.COLUMN_NAME.toLowerCase());

    const lines = cols.rows.map(c => {
      const name = c.COLUMN_NAME.toLowerCase();
      const type = pgType(c);
      const notNull = c.NULLABLE === 'N' ? ' NOT NULL' : '';
      return `  ${name} ${type}${notNull}`;
    });
    if (pkCols.length > 0) lines.push(`  PRIMARY KEY (${pkCols.join(', ')})`);

    out.push(`CREATE TABLE IF NOT EXISTS ${table.toLowerCase()} (`);
    out.push(lines.join(',\n'));
    out.push(');');
    out.push('');
  }

  console.log(out.join('\n'));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
