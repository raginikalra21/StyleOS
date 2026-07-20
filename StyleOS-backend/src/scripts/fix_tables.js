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

  // DROP leftovers
  for (const t of ['REACTIONS', 'CART_ITEMS']) {
    try { await conn.execute('DROP TABLE ' + t + ' CASCADE CONSTRAINTS'); console.log('Dropped ' + t); }
    catch (e) { /* doesn't exist, fine */ }
  }

  // CART_ITEMS — no FK constraints inline, add separately
  await exec('CREATE cart_items', [
    'CREATE TABLE cart_items (',
    '  id               VARCHAR2(36) PRIMARY KEY,',
    '  cart_id          VARCHAR2(36) NOT NULL,',
    '  product_id       VARCHAR2(36) NOT NULL,',
    '  item_size        VARCHAR2(10),',
    '  quantity         NUMBER DEFAULT 1,',
    '  added_by_user_id VARCHAR2(36),',
    '  added_by_agent   NUMBER(1) DEFAULT 0,',
    '  created_at       TIMESTAMP DEFAULT SYSTIMESTAMP,',
    '  updated_at       TIMESTAMP DEFAULT SYSTIMESTAMP',
    ')',
  ].join(' '));

  await exec('FK cart_items.cart_id',
    "ALTER TABLE cart_items ADD CONSTRAINT fk_ci_cart FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE");

  await exec('FK cart_items.product_id',
    "ALTER TABLE cart_items ADD CONSTRAINT fk_ci_prod FOREIGN KEY (product_id) REFERENCES products(id)");

  await exec('IDX cart_items',
    "CREATE INDEX idx_ci_cart ON cart_items(cart_id)");

  // REACTIONS
  await exec('CREATE reactions', [
    'CREATE TABLE reactions (',
    '  id           VARCHAR2(36) PRIMARY KEY,',
    '  cart_item_id VARCHAR2(36) NOT NULL,',
    '  user_id      VARCHAR2(36) NOT NULL,',
    '  reaction_type VARCHAR2(10) NOT NULL,',
    '  content      CLOB,',
    '  audio_url    VARCHAR2(500),',
    '  created_at   TIMESTAMP DEFAULT SYSTIMESTAMP,',
    '  updated_at   TIMESTAMP DEFAULT SYSTIMESTAMP',
    ')',
  ].join(' '));

  await exec('FK reactions.cart_item_id',
    "ALTER TABLE reactions ADD CONSTRAINT fk_rx_item FOREIGN KEY (cart_item_id) REFERENCES cart_items(id) ON DELETE CASCADE");

  await exec('FK reactions.user_id',
    "ALTER TABLE reactions ADD CONSTRAINT fk_rx_user FOREIGN KEY (user_id) REFERENCES users(id)");

  await exec('IDX reactions',
    "CREATE INDEX idx_rx_item ON reactions(cart_item_id)");

  await conn.commit();

  // Final check
  const r = await conn.execute(
    "SELECT table_name FROM user_tables WHERE table_name IN ('USERS','PRODUCTS','CARTS','CART_ITEMS','COLLAB_SESSIONS','COLLAB_MEMBERS','REACTIONS','GOALS','WARDROBES') ORDER BY table_name",
    [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  console.log('\nStyleOS tables:');
  r.rows.forEach(row => console.log('  ✅', row.TABLE_NAME));

  if (r.rows.length === 9) {
    console.log('\n🎉 All 9 tables ready! Run: npm run dev');
  } else {
    console.log('\n⚠️', 9 - r.rows.length, 'table(s) missing');
  }

  await conn.close();
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
