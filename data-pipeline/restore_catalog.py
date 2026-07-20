"""
Rollback path — reloads a products/cart_items backup produced by
backup_catalog.py. Written and tested BEFORE the real destructive reseed
runs, not after something goes wrong.

Usage: python restore_catalog.py <timestamp>
  (timestamp matches the suffix on the backup files, e.g. 20260716_143000)
"""
import os, sys, json
import oracledb
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'StyleOS-backend', '.env'))

DB_USER = os.getenv('DB_USER', 'system')
DB_PASS = os.getenv('DB_PASSWORD')
DB_CONNECT = os.getenv('DB_CONNECT', 'localhost:1521/XEPDB1')
BACKUP_DIR = os.path.join(os.path.dirname(__file__), 'backups')

PRODUCT_COLUMNS = [
    'id', 'title', 'brand', 'gender', 'master_category', 'sub_category', 'article_type',
    'occasion', 'season', 'base_colour', 'fabric', 'price', 'mrp', 'rating', 'rating_count',
    'delivery_days', 'images', 'description', 'sizes', 'in_stock', 'source',
]


def restore_products(cur, timestamp):
    path = os.path.join(BACKUP_DIR, f'products_backup_{timestamp}.json')
    if not os.path.exists(path):
        raise FileNotFoundError(f'No backup found at {path}')
    with open(path, 'r', encoding='utf-8') as f:
        rows = json.load(f)

    print(f'Restoring {len(rows)} products from {path}...')
    cur.execute('DELETE FROM cart_items')
    cur.execute('DELETE FROM products')

    sql = f"""INSERT INTO products ({', '.join(PRODUCT_COLUMNS)})
       VALUES ({', '.join(f':{i+1}' for i in range(len(PRODUCT_COLUMNS)))})"""

    BATCH = 300
    restored = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i + BATCH]
        tuples = [tuple(r.get(c) for c in PRODUCT_COLUMNS) for r in batch]
        cur.executemany(sql, tuples)
        restored += len(tuples)
    return restored


def main():
    if len(sys.argv) < 2:
        print('Usage: python restore_catalog.py <timestamp>')
        print(f'Available backups in {BACKUP_DIR}:')
        if os.path.isdir(BACKUP_DIR):
            for f in sorted(os.listdir(BACKUP_DIR)):
                if f.startswith('products_backup_') and f.endswith('.json'):
                    print(' ', f.replace('products_backup_', '').replace('.json', ''))
        return

    timestamp = sys.argv[1]
    conn = oracledb.connect(user=DB_USER, password=DB_PASS, dsn=DB_CONNECT)
    cur = conn.cursor()
    try:
        restored = restore_products(cur, timestamp)
        conn.commit()
        print(f'\nRestored {restored} products from backup {timestamp}.')
    except Exception as e:
        conn.rollback()
        print(f'\nRestore failed, rolled back: {e}')
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    main()
