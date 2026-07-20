/**
 * Drops old project tables and creates fresh StyleOS tables.
 * Usage: node src/scripts/clean_and_setup.js
 */
require('dotenv').config();
const oracledb = require('oracledb');

// Tables from the old digital-twin project to drop
const OLD_TABLES = [
  'RISK_ASSESSMENTS', 'DIGITAL_TWIN_SNAPSHOTS', 'PATIENT_MEDICATIONS',
  'MEDICATIONS', 'LIFESTYLE_LOGS', 'GLUCOSE_READINGS', 'ALERTS',
  'APPOINTMENTS', 'DOCTORS', 'HOSPITALS', 'PATIENTS',
];

// StyleOS tables — drop in reverse FK order if they exist from a partial run
const STYLEOS_TABLES = [
  'WARDROBES', 'GOALS', 'REACTIONS', 'COLLAB_MEMBERS',
  'COLLAB_SESSIONS', 'CART_ITEMS', 'CARTS', 'PRODUCTS', 'USERS',
];

async function run() {
  console.log('🔌 Connecting to Oracle...\n');
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectString: process.env.DB_CONNECT,
    });
    console.log('✅ Connected\n');

    // Drop old project tables
    console.log('🗑  Dropping old digital-twin tables...');
    for (const t of OLD_TABLES) {
      try {
        await conn.execute(`DROP TABLE ${t} CASCADE CONSTRAINTS`);
        console.log(`   ✅ Dropped ${t}`);
      } catch (e) {
        if (e.message.includes('ORA-00942')) {
          console.log(`   ⚠️  ${t} doesn't exist — skipping`);
        } else {
          console.log(`   ❌ ${t}: ${e.message.split('\n')[0]}`);
        }
      }
    }

    // Drop existing StyleOS tables (clean slate)
    console.log('\n🗑  Dropping any existing StyleOS tables...');
    for (const t of STYLEOS_TABLES) {
      try {
        await conn.execute(`DROP TABLE ${t} CASCADE CONSTRAINTS`);
        console.log(`   ✅ Dropped ${t}`);
      } catch (e) {
        if (e.message.includes('ORA-00942')) {
          console.log(`   ⚠️  ${t} doesn't exist — skipping`);
        } else {
          console.log(`   ❌ ${t}: ${e.message.split('\n')[0]}`);
        }
      }
    }

    await conn.commit();
    console.log('\n✅ Old tables cleared.\n');

    // Create StyleOS tables
    console.log('🏗  Creating StyleOS tables...\n');

    const tables = [
      {
        name: 'USERS',
        sql: `CREATE TABLE users (
  id            VARCHAR2(36)  PRIMARY KEY,
  name          VARCHAR2(255) NOT NULL,
  email         VARCHAR2(255) NOT NULL UNIQUE,
  password_hash VARCHAR2(255) NOT NULL,
  avatar_url    VARCHAR2(500),
  created_at    TIMESTAMP DEFAULT SYSTIMESTAMP,
  updated_at    TIMESTAMP DEFAULT SYSTIMESTAMP
)`,
      },
      {
        name: 'PRODUCTS',
        sql: `CREATE TABLE products (
  id              VARCHAR2(36)  PRIMARY KEY,
  title           VARCHAR2(500) NOT NULL,
  brand           VARCHAR2(255),
  gender          VARCHAR2(20),
  master_category VARCHAR2(100),
  sub_category    VARCHAR2(100),
  article_type    VARCHAR2(100),
  occasion        VARCHAR2(100),
  season          VARCHAR2(50),
  base_colour     VARCHAR2(100),
  fabric          VARCHAR2(100),
  price           NUMBER        NOT NULL,
  mrp             NUMBER,
  rating          NUMBER(3,1)   DEFAULT 4.0,
  rating_count    NUMBER        DEFAULT 0,
  delivery_days   NUMBER        DEFAULT 5,
  images          CLOB,
  description     CLOB,
  sizes           CLOB,
  in_stock        NUMBER(1)     DEFAULT 1,
  source          VARCHAR2(50),
  created_at      TIMESTAMP     DEFAULT SYSTIMESTAMP,
  updated_at      TIMESTAMP     DEFAULT SYSTIMESTAMP
)`,
      },
      {
        name: 'CARTS',
        sql: `CREATE TABLE carts (
  id          VARCHAR2(36)  PRIMARY KEY,
  owner_id    VARCHAR2(36)  NOT NULL REFERENCES users(id),
  name        VARCHAR2(255),
  goal_text   CLOB,
  total_price NUMBER        DEFAULT 0,
  status      VARCHAR2(20)  DEFAULT 'active',
  created_at  TIMESTAMP     DEFAULT SYSTIMESTAMP,
  updated_at  TIMESTAMP     DEFAULT SYSTIMESTAMP
)`,
      },
      {
        name: 'CART_ITEMS',
        sql: `CREATE TABLE cart_items (
  id               VARCHAR2(36) PRIMARY KEY,
  cart_id          VARCHAR2(36) NOT NULL,
  product_id       VARCHAR2(36) NOT NULL,
  size             VARCHAR2(10) DEFAULT 'M',
  quantity         NUMBER       DEFAULT 1,
  added_by_user_id VARCHAR2(36),
  added_by_agent   NUMBER(1)    DEFAULT 0,
  created_at       TIMESTAMP    DEFAULT SYSTIMESTAMP,
  updated_at       TIMESTAMP    DEFAULT SYSTIMESTAMP,
  CONSTRAINT fk_ci_cart    FOREIGN KEY (cart_id)    REFERENCES carts(id) ON DELETE CASCADE,
  CONSTRAINT fk_ci_product FOREIGN KEY (product_id) REFERENCES products(id)
)`,
      },
      {
        name: 'COLLAB_SESSIONS',
        sql: `CREATE TABLE collab_sessions (
  id          VARCHAR2(36) PRIMARY KEY,
  cart_id     VARCHAR2(36) NOT NULL UNIQUE REFERENCES carts(id) ON DELETE CASCADE,
  share_token VARCHAR2(36) NOT NULL UNIQUE,
  expires_at  TIMESTAMP,
  created_at  TIMESTAMP    DEFAULT SYSTIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT SYSTIMESTAMP
)`,
      },
      {
        name: 'COLLAB_MEMBERS',
        sql: `CREATE TABLE collab_members (
  id         VARCHAR2(36) PRIMARY KEY,
  session_id VARCHAR2(36) NOT NULL REFERENCES collab_sessions(id) ON DELETE CASCADE,
  user_id    VARCHAR2(36) NOT NULL REFERENCES users(id),
  created_at TIMESTAMP    DEFAULT SYSTIMESTAMP,
  updated_at TIMESTAMP    DEFAULT SYSTIMESTAMP,
  UNIQUE (session_id, user_id)
)`,
      },
      {
        name: 'REACTIONS',
        sql: `CREATE TABLE reactions (
  id           VARCHAR2(36) PRIMARY KEY,
  cart_item_id VARCHAR2(36) NOT NULL,
  user_id      VARCHAR2(36) NOT NULL,
  type         VARCHAR2(10) NOT NULL,
  content      CLOB,
  audio_url    VARCHAR2(500),
  created_at   TIMESTAMP    DEFAULT SYSTIMESTAMP,
  updated_at   TIMESTAMP    DEFAULT SYSTIMESTAMP,
  CONSTRAINT fk_rx_item FOREIGN KEY (cart_item_id) REFERENCES cart_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_rx_user FOREIGN KEY (user_id)      REFERENCES users(id)
)`,
      },
      {
        name: 'GOALS',
        sql: `CREATE TABLE goals (
  id          VARCHAR2(36) PRIMARY KEY,
  user_id     VARCHAR2(36) NOT NULL REFERENCES users(id),
  raw_text    CLOB,
  parsed_plan CLOB,
  cart_id     VARCHAR2(36),
  status      VARCHAR2(20) DEFAULT 'planning',
  created_at  TIMESTAMP    DEFAULT SYSTIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT SYSTIMESTAMP
)`,
      },
      {
        name: 'WARDROBES',
        sql: `CREATE TABLE wardrobes (
  id                  VARCHAR2(36) PRIMARY KEY,
  user_id             VARCHAR2(36) NOT NULL REFERENCES users(id),
  cart_id             VARCHAR2(36),
  name                VARCHAR2(255),
  outfit_combinations CLOB,
  total_items         NUMBER       DEFAULT 0,
  total_price         NUMBER       DEFAULT 0,
  created_at          TIMESTAMP    DEFAULT SYSTIMESTAMP,
  updated_at          TIMESTAMP    DEFAULT SYSTIMESTAMP
)`,
      },
    ];

    const indexes = [
      'CREATE INDEX idx_prod_article  ON products(article_type)',
      'CREATE INDEX idx_prod_gender   ON products(gender)',
      'CREATE INDEX idx_prod_price    ON products(price)',
      'CREATE INDEX idx_prod_colour   ON products(base_colour)',
      'CREATE INDEX idx_prod_occasion ON products(occasion)',
      'CREATE INDEX idx_prod_instock  ON products(in_stock)',
      'CREATE INDEX idx_ci_cart       ON cart_items(cart_id)',
      'CREATE INDEX idx_rx_item       ON reactions(cart_item_id)',
    ];

    for (const { name, sql } of tables) {
      try {
        await conn.execute(sql);
        console.log(`✅  ${name} created`);
      } catch (e) {
        console.error(`❌  ${name}: ${e.message.split('\n')[0]}`);
      }
    }

    console.log('\n📇 Creating indexes...');
    for (const idx of indexes) {
      try {
        await conn.execute(idx);
        console.log(`✅  ${idx.slice(7, 35)}...`);
      } catch (e) {
        console.log(`⚠️  ${e.message.split('\n')[0]}`);
      }
    }

    await conn.commit();
    console.log('\n🎉 StyleOS database is ready!');
    console.log('\nNext step: run the data pipeline to seed products:');
    console.log('  cd data-pipeline && python merge_catalog.py\n');

  } catch (e) {
    console.error('Fatal:', e.message);
    process.exit(1);
  } finally {
    if (conn) await conn.close();
  }
}

run();
