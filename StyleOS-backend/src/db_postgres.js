/**
 * Postgres DB connection pool — used only when DATABASE_URL is set (see
 * db.js). Exposes the exact same query(sql, binds) -> { rows } shape the
 * Oracle driver does, so every existing model/route/service file that
 * calls query(`... :name ...`, { name: value }) and reads row.COLUMN_NAME
 * works completely unchanged against Postgres too. All the translation
 * happens right here:
 *
 *   1. Oracle named binds (:name) -> Postgres positional binds ($1, $2, ...)
 *   2. Oracle-only SQL text (SYSTIMESTAMP, NVL) -> Postgres equivalents
 *   3. Postgres's lowercase result columns -> UPPERCASE, matching what
 *      Oracle always returned and what the whole app already expects
 */
const { Pool } = require('pg');

let pool = null;

async function getPool() {
  if (pool) return pool;
  // Parsing DATABASE_URL ourselves rather than handing the raw string to
  // Pool's own connectionString option — combining that with an explicit
  // ssl object triggers a real pg parsing bug (password silently comes
  // back undefined, fails with a confusing SASL error). Node's own URL
  // parser has no such issue.
  const u = new URL(process.env.DATABASE_URL);
  pool = new Pool({
    host: u.hostname,
    port: u.port || 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  console.log('✅ Postgres connection pool created');
  return pool;
}

// Oracle text this codebase actually uses that has no direct Postgres
// equivalent by the same name — a plain, safe find/replace since neither
// function name collides with a real column or table name anywhere.
function translateSql(sql) {
  return sql.replace(/\bSYSTIMESTAMP\b/gi, 'NOW()').replace(/\bNVL\(/gi, 'COALESCE(');
}

// { at: 'x', pid: 'y' } + "... :at ... :pid ..." -> "... $1 ... $2 ..." + ['x','y']
// Binds an array (the rare positional-bind call) passes through untouched.
function translateBinds(sql, binds) {
  if (Array.isArray(binds) || !binds || typeof binds !== 'object') {
    return { sql, values: binds || [] };
  }
  const order = [];
  const translatedSql = sql.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, name) => {
    if (!(name in binds)) return match; // not one of ours — leave alone
    let idx = order.indexOf(name);
    if (idx === -1) { order.push(name); idx = order.length - 1; }
    return `$${idx + 1}`;
  });
  return { sql: translatedSql, values: order.map(name => binds[name]) };
}

function uppercaseRow(row) {
  const out = {};
  for (const key of Object.keys(row)) out[key.toUpperCase()] = row[key];
  return out;
}

async function query(sql, binds = [], opts = {}) {
  const p = await getPool();
  const translatedSqlText = translateSql(sql);
  const { sql: finalSql, values } = translateBinds(translatedSqlText, binds);
  try {
    const result = await p.query(finalSql, values);
    return { ...result, rows: result.rows.map(uppercaseRow) };
  } catch (err) {
    console.error('Database query error:', err);
    console.error('SQL:', finalSql);
    console.error('Values:', JSON.stringify(values));
    throw err;
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, query, closePool };
