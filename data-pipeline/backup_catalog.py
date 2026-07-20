"""
Safety net before any destructive catalog reseed. Dumps products and
cart_items to timestamped JSON (full fidelity) and CSV (human-skimmable)
under data-pipeline/backups/. seed_hm_catalog.py imports and calls
backup_before_reseed() as its literal first action, so a reseed can't run
without the backup happening first.

Standalone usage: python backup_catalog.py
"""
import os, json, csv
from datetime import datetime
import oracledb
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'StyleOS-backend', '.env'))

DB_USER = os.getenv('DB_USER', 'system')
DB_PASS = os.getenv('DB_PASSWORD')
DB_CONNECT = os.getenv('DB_CONNECT', 'localhost:1521/XEPDB1')

BACKUP_DIR = os.path.join(os.path.dirname(__file__), 'backups')


def _row_to_dict(cursor, row):
    columns = [d[0].lower() for d in cursor.description]
    return dict(zip(columns, row))


def backup_table(cur, table_name, timestamp):
    cur.execute(f'SELECT * FROM {table_name}')
    rows = [_row_to_dict(cur, r) for r in cur.fetchall()]

    os.makedirs(BACKUP_DIR, exist_ok=True)
    json_path = os.path.join(BACKUP_DIR, f'{table_name}_backup_{timestamp}.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(rows, f, default=str, ensure_ascii=False)

    csv_path = os.path.join(BACKUP_DIR, f'{table_name}_backup_{timestamp}.csv')
    if rows:
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)

    print(f'  Backed up {len(rows)} rows from {table_name} -> {json_path}')
    return len(rows)


def backup_before_reseed():
    """Called by seed_hm_catalog.py before any DELETE. Backs up cart_items
    FIRST since the reseed's DELETE FROM cart_items runs before DELETE FROM
    products (cart_items references products, so it cascades first) —
    losing that order would mean losing in-progress demo carts silently."""
    if not DB_PASS:
        raise RuntimeError('DB_PASSWORD is not set — check StyleOS-backend/.env')

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    conn = oracledb.connect(user=DB_USER, password=DB_PASS, dsn=DB_CONNECT)
    cur = conn.cursor()

    print(f'Backing up catalog before reseed (timestamp {timestamp})...')
    cart_count = backup_table(cur, 'cart_items', timestamp)
    product_count = backup_table(cur, 'products', timestamp)

    cur.close()
    conn.close()
    print(f'Backup complete: {product_count} products, {cart_count} cart_items.\n')
    return timestamp


if __name__ == '__main__':
    backup_before_reseed()
