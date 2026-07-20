/**
 * One-time data copy: Oracle (source of truth for the demo catalog, users,
 * and all seeded content) -> Postgres (the deployed database). Run after
 * schema_postgres.sql has been applied. Table order respects the informal
 * dependency chain (e.g. products before cart_items) even though neither
 * schema enforces real FK constraints.
 *
 * Usage: DATABASE_URL=<postgres url> node src/scripts/copy_oracle_to_postgres.js
 */
require('dotenv').config();
const oracle = require('../db_oracle');
const postgres = require('../db_postgres');

// Only the master data — the real product catalog and real accounts.
// Everything else (carts, collab sessions, missions, reactions...) is this
// session's own test data accumulated over hours of manual verification;
// copying it into a fresh production DB would just be clutter. The app's
// own POST /api/demo/seed-all creates clean operational data on demand,
// exactly how it's meant to be demoed.
const TABLES = ['users', 'products'];

const BATCH_SIZE = 250;

async function copyTable(table) {
  const { rows } = await oracle.query(`SELECT * FROM ${table}`);
  if (rows.length === 0) { console.log(`${table}: 0 rows (skipped)`); return; }

  await postgres.query(`TRUNCATE TABLE ${table}`);

  const columns = Object.keys(rows[0]).map(c => c.toLowerCase());
  const batches = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) batches.push(rows.slice(i, i + BATCH_SIZE));

  // One INSERT per batch (multi-row VALUES), not one per row — cuts a
  // 59k-row table from 59k network round trips to ~240. Bypasses the
  // named-bind wrapper deliberately: array binds pass straight through
  // as positional $N params (see db_postgres.js's translateBinds).
  const CONCURRENCY = 8;
  let cursor = 0, inserted = 0, failed = 0;

  async function worker() {
    while (cursor < batches.length) {
      const batch = batches[cursor++];
      const values = [];
      const rowPlaceholders = batch.map(row => {
        const placeholders = columns.map(col => { values.push(row[col.toUpperCase()]); return `$${values.length}`; });
        return `(${placeholders.join(', ')})`;
      });
      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${rowPlaceholders.join(', ')}`;
      try {
        await postgres.query(sql, values);
        inserted += batch.length;
      } catch (e) {
        failed += batch.length;
        if (failed <= BATCH_SIZE) console.error(`  ${table} batch failed: ${e.message}`);
      }
      if ((inserted + failed) % 5000 < BATCH_SIZE) console.log(`  ${table}: ${inserted + failed}/${rows.length}...`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`${table}: ${inserted}/${rows.length} copied${failed > 0 ? `, ${failed} FAILED` : ''}`);
}

async function main() {
  for (const table of TABLES) {
    await copyTable(table);
  }
  console.log('\nDone.');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
