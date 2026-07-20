/**
 * Oracle DB connection pool — oracledb v7, thin mode
 */
const oracledb = require('oracledb');

// Thin mode (no Oracle Instant Client needed)
oracledb.thin = true;

// Auto-convert CLOBs to strings so they come back as plain JS strings
oracledb.fetchTypeHandler = function (metaData) {
  if (metaData.dbType === oracledb.DB_TYPE_CLOB) {
    return { type: oracledb.DB_TYPE_VARCHAR };
  }
};

let pool = null;

async function getPool() {
  if (pool) return pool;

  // No hardcoded password fallback — a real DB credential has no business
  // living in source code. If DB_PASSWORD isn't set, fail loudly at
  // startup rather than silently trying a guessed default.
  if (!process.env.DB_PASSWORD) {
    throw new Error('DB_PASSWORD is not set — check your .env file');
  }

  pool = await oracledb.createPool({
    user:          process.env.DB_USER     || 'system',
    password:      process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT  || 'localhost:1521/XEPDB1',
    poolMin:       2,
    poolMax:       10,
    poolIncrement: 1,
  });

  console.log('✅ Oracle connection pool created');
  return pool;
}

async function query(sql, binds = [], opts = {}) {
  const p    = await getPool();
  const conn = await p.getConnection();
  try {
    const result = await conn.execute(sql, binds, {
      outFormat:  oracledb.OUT_FORMAT_OBJECT,
      autoCommit: true,
      ...opts,
    });
    return result;
  } catch (err) {
    console.error('Database query error:', err);
    console.error('SQL:', sql);
    console.error('Binds:', JSON.stringify(binds));
    throw err;
  } finally {
    await conn.close();
  }
}

async function closePool() {
  if (pool) {
    await pool.close(0);
    pool = null;
  }
}

module.exports = { getPool, query, closePool };
