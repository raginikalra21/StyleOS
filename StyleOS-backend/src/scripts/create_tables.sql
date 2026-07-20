CREATE TABLE users (
  id VARCHAR2(36) PRIMARY KEY,
  name VARCHAR2(255) NOT NULL,
  email VARCHAR2(255) NOT NULL,
  password_hash VARCHAR2(255) NOT NULL,
  avatar_url VARCHAR2(500),
  created_at TIMESTAMP DEFAULT SYSTIMESTAMP,
  updated_at TIMESTAMP DEFAULT SYSTIMESTAMP
)
/

CREATE UNIQUE INDEX uq_users_email ON users(email)
/

CREATE TABLE products (
  id VARCHAR2(36) PRIMARY KEY,
  title VARCHAR2(500) NOT NULL,
  brand VARCHAR2(255),
  gender VARCHAR2(20),
  master_category VARCHAR2(100),
  sub_category VARCHAR2(100),
  article_type VARCHAR2(100),
  occasion VARCHAR2(100),
  season VARCHAR2(50),
  base_colour VARCHAR2(100),
  fabric VARCHAR2(100),
  price NUMBER NOT NULL,
  mrp NUMBER,
  rating NUMBER(3,1) DEFAULT 4.0,
  rating_count NUMBER DEFAULT 0,
  delivery_days NUMBER DEFAULT 5,
  images CLOB,
  description CLOB,
  sizes CLOB,
  in_stock NUMBER(1) DEFAULT 1,
  source VARCHAR2(50),
  created_at TIMESTAMP DEFAULT SYSTIMESTAMP,
  updated_at TIMESTAMP DEFAULT SYSTIMESTAMP
)
/

CREATE INDEX idx_prod_article  ON products(article_type)
/
CREATE INDEX idx_prod_gender   ON products(gender)
/
CREATE INDEX idx_prod_price    ON products(price)
/
CREATE INDEX idx_prod_colour   ON products(base_colour)
/
CREATE INDEX idx_prod_occasion ON products(occasion)
/
CREATE INDEX idx_prod_instock  ON products(in_stock)
/

CREATE TABLE carts (
  id VARCHAR2(36) PRIMARY KEY,
  owner_id VARCHAR2(36) NOT NULL,
  name VARCHAR2(255),
  goal_text CLOB,
  total_price NUMBER DEFAULT 0,
  status VARCHAR2(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT SYSTIMESTAMP,
  updated_at TIMESTAMP DEFAULT SYSTIMESTAMP
)
/

CREATE TABLE cart_items (
  id VARCHAR2(36) PRIMARY KEY,
  cart_id VARCHAR2(36) NOT NULL,
  product_id VARCHAR2(36) NOT NULL,
  size VARCHAR2(10) DEFAULT 'M',
  quantity NUMBER DEFAULT 1,
  added_by_user_id VARCHAR2(36),
  added_by_agent NUMBER(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT SYSTIMESTAMP,
  updated_at TIMESTAMP DEFAULT SYSTIMESTAMP
)
/

CREATE TABLE collab_sessions (
  id VARCHAR2(36) PRIMARY KEY,
  cart_id VARCHAR2(36) NOT NULL,
  share_token VARCHAR2(36) NOT NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT SYSTIMESTAMP,
  updated_at TIMESTAMP DEFAULT SYSTIMESTAMP
)
/

CREATE UNIQUE INDEX uq_cs_cart  ON collab_sessions(cart_id)
/
CREATE UNIQUE INDEX uq_cs_token ON collab_sessions(share_token)
/

CREATE TABLE collab_members (
  id VARCHAR2(36) PRIMARY KEY,
  session_id VARCHAR2(36) NOT NULL,
  user_id VARCHAR2(36) NOT NULL,
  created_at TIMESTAMP DEFAULT SYSTIMESTAMP,
  updated_at TIMESTAMP DEFAULT SYSTIMESTAMP
)
/

CREATE UNIQUE INDEX uq_cm_pair ON collab_members(session_id, user_id)
/

CREATE TABLE reactions (
  id VARCHAR2(36) PRIMARY KEY,
  cart_item_id VARCHAR2(36) NOT NULL,
  user_id VARCHAR2(36) NOT NULL,
  type VARCHAR2(10) NOT NULL,
  content CLOB,
  audio_url VARCHAR2(500),
  created_at TIMESTAMP DEFAULT SYSTIMESTAMP,
  updated_at TIMESTAMP DEFAULT SYSTIMESTAMP
)
/

CREATE TABLE goals (
  id VARCHAR2(36) PRIMARY KEY,
  user_id VARCHAR2(36) NOT NULL,
  raw_text CLOB,
  parsed_plan CLOB,
  cart_id VARCHAR2(36),
  status VARCHAR2(20) DEFAULT 'planning',
  created_at TIMESTAMP DEFAULT SYSTIMESTAMP,
  updated_at TIMESTAMP DEFAULT SYSTIMESTAMP
)
/

CREATE TABLE wardrobes (
  id VARCHAR2(36) PRIMARY KEY,
  user_id VARCHAR2(36) NOT NULL,
  cart_id VARCHAR2(36),
  name VARCHAR2(255),
  outfit_combinations CLOB,
  total_items NUMBER DEFAULT 0,
  total_price NUMBER DEFAULT 0,
  created_at TIMESTAMP DEFAULT SYSTIMESTAMP,
  updated_at TIMESTAMP DEFAULT SYSTIMESTAMP
)
/
