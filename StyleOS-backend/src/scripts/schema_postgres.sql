-- Auto-generated from the live Oracle schema. See generate_postgres_schema.js.

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(500),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(36) NOT NULL,
  title VARCHAR(500) NOT NULL,
  brand VARCHAR(255),
  gender VARCHAR(20),
  master_category VARCHAR(100),
  sub_category VARCHAR(100),
  article_type VARCHAR(100),
  occasion VARCHAR(100),
  season VARCHAR(50),
  base_colour VARCHAR(100),
  fabric VARCHAR(100),
  price NUMERIC NOT NULL,
  mrp NUMERIC,
  rating NUMERIC,
  rating_count NUMERIC,
  delivery_days NUMERIC,
  images TEXT,
  description TEXT,
  sizes TEXT,
  in_stock INTEGER,
  source VARCHAR(50),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  embedding TEXT,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS carts (
  id VARCHAR(36) NOT NULL,
  owner_id VARCHAR(36) NOT NULL,
  name VARCHAR(255),
  goal_text TEXT,
  total_price NUMERIC,
  status VARCHAR(20),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS cart_items (
  id VARCHAR(36) NOT NULL,
  cart_id VARCHAR(36) NOT NULL,
  product_id VARCHAR(36) NOT NULL,
  item_size VARCHAR(10),
  quantity NUMERIC,
  added_by_user_id VARCHAR(36),
  added_by_agent INTEGER,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS collab_sessions (
  id VARCHAR(36) NOT NULL,
  cart_id VARCHAR(36),
  share_token VARCHAR(36) NOT NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  mission_id VARCHAR(36),
  ask_mode VARCHAR(20),
  budget_lock NUMERIC,
  item_price_cap NUMERIC,
  lock_detail_level VARCHAR(20),
  recipient_name VARCHAR(120),
  recipient_relation VARCHAR(40),
  recipient_profile TEXT,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS collab_members (
  id VARCHAR(36) NOT NULL,
  session_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  guest_name VARCHAR(120),
  guest_token VARCHAR(64),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS reactions (
  id VARCHAR(36) NOT NULL,
  cart_item_id VARCHAR(36),
  user_id VARCHAR(36),
  reaction_type VARCHAR(10) NOT NULL,
  content TEXT,
  audio_url VARCHAR(500),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  mission_slot_id VARCHAR(36),
  guest_name VARCHAR(120),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS goals (
  id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  raw_text TEXT,
  parsed_plan TEXT,
  cart_id VARCHAR(36),
  status VARCHAR(20),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS wardrobes (
  id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  cart_id VARCHAR(36),
  name VARCHAR(255),
  outfit_combinations TEXT,
  total_items NUMERIC,
  total_price NUMERIC,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS missions (
  id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  type VARCHAR(20) NOT NULL,
  title VARCHAR(255),
  community VARCHAR(50),
  total_budget NUMERIC,
  city VARCHAR(100),
  status VARCHAR(20),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS mission_events (
  id VARCHAR(36) NOT NULL,
  mission_id VARCHAR(36) NOT NULL,
  name VARCHAR(100),
  event_date TIMESTAMP,
  palette_family TEXT,
  sort_order NUMERIC,
  created_at TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS mission_members (
  id VARCHAR(36) NOT NULL,
  mission_id VARCHAR(36) NOT NULL,
  name VARCHAR(100),
  role_weight NUMERIC,
  gender VARCHAR(20),
  age_bracket VARCHAR(20),
  created_at TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS mission_slots (
  id VARCHAR(36) NOT NULL,
  mission_id VARCHAR(36) NOT NULL,
  event_id VARCHAR(36) NOT NULL,
  member_id VARCHAR(36) NOT NULL,
  product_id VARCHAR(36),
  status VARCHAR(20),
  allocated_budget NUMERIC,
  relaxation_note VARCHAR(255),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS parties (
  id VARCHAR(36) NOT NULL,
  name VARCHAR(200),
  owner_id VARCHAR(36),
  share_token VARCHAR(36) NOT NULL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS party_members (
  id VARCHAR(36) NOT NULL,
  party_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36),
  guest_name VARCHAR(120),
  guest_token VARCHAR(64),
  cart_id VARCHAR(36),
  created_at TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS slot_rejections (
  id VARCHAR(36) NOT NULL,
  cart_id VARCHAR(36),
  mission_id VARCHAR(36),
  slot_key VARCHAR(150) NOT NULL,
  product_id VARCHAR(36) NOT NULL,
  product_price NUMERIC,
  product_colour VARCHAR(50),
  rejected_by VARCHAR(36),
  reason_text VARCHAR(500),
  reason_class VARCHAR(40),
  rejected_at TIMESTAMP,
  rejected_by_name VARCHAR(120),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS venue_shipment_log (
  id VARCHAR(36) NOT NULL,
  product_id VARCHAR(36) NOT NULL,
  venue_key VARCHAR(150) NOT NULL,
  shipped_at TIMESTAMP,
  mission_type VARCHAR(20),
  PRIMARY KEY (id)
);

-- Indexes mirrored from the live Oracle schema (see generate_postgres_schema.js's index query).
ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email);
CREATE INDEX IF NOT EXISTS idx_ci_cart ON cart_items (cart_id);
CREATE INDEX IF NOT EXISTS idx_events_mission ON mission_events (mission_id);
CREATE INDEX IF NOT EXISTS idx_members_mission ON mission_members (mission_id);
CREATE INDEX IF NOT EXISTS idx_slots_mission ON mission_slots (mission_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_party_token ON parties (share_token);
CREATE INDEX IF NOT EXISTS idx_prod_article ON products (article_type);
CREATE INDEX IF NOT EXISTS idx_prod_colour ON products (base_colour);
CREATE INDEX IF NOT EXISTS idx_prod_gender ON products (gender);
CREATE INDEX IF NOT EXISTS idx_prod_instock ON products (in_stock);
CREATE INDEX IF NOT EXISTS idx_prod_occasion ON products (occasion);
CREATE INDEX IF NOT EXISTS idx_prod_price ON products (price);
CREATE INDEX IF NOT EXISTS idx_rx_item ON reactions (cart_item_id);
CREATE INDEX IF NOT EXISTS idx_rejections_slot ON slot_rejections (slot_key);
CREATE INDEX IF NOT EXISTS idx_vsl_venue_product ON venue_shipment_log (venue_key, product_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_collab_share_token ON collab_sessions (share_token);

