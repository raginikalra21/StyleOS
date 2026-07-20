require('dotenv').config();
const oracledb = require('oracledb');

(async () => {
  const conn = await oracledb.getConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT,
  });

  // Test each column one at a time to find the bad one
  const cols = [
    "id VARCHAR2(36) PRIMARY KEY",
    "cart_id VARCHAR2(36) NOT NULL",
    "product_id VARCHAR2(36) NOT NULL",
    "item_size VARCHAR2(10) DEFAULT 'M'",   // renamed to avoid reserved word
    "quantity NUMBER DEFAULT 1",
    "added_by_user_id VARCHAR2(36)",
    "added_by_agent NUMBER(1) DEFAULT 0",
    "created_at TIMESTAMP DEFAULT SYSTIMESTAMP",
    "updated_at TIMESTAMP DEFAULT SYSTIMESTAMP",
  ];

  // Try building up column by column
  for (let i = 1; i <= cols.length; i++) {
    const subset = cols.slice(0, i).join(',\n  ');
    const sql = 'CREATE TABLE cart_items_test (\n  ' + subset + '\n)';
    try {
      await conn.execute(sql);
      await conn.execute('DROP TABLE cart_items_test');
      console.log('OK with ' + i + ' cols: last added = ' + cols[i-1].split(' ')[0]);
    } catch (e) {
      console.log('FAIL at col ' + i + ' (' + cols[i-1].split(' ')[0] + '): ' + e.message.slice(0, 80));
      break;
    }
  }

  await conn.close();
})().catch(e => console.error(e.message));
