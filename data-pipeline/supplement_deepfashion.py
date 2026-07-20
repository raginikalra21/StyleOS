"""
Additive supplement (does NOT clear the table) — merges in a stratified
subset of DeepFashion In-Shop Clothes Retrieval items that genuinely have
MULTIPLE angle photos each, so a meaningful slice of the catalog gets a real
multi-image gallery instead of every product being single-photo.

DeepFashion has no colour ground truth per item, so base_colour defaults to
'Multi' and every row is tagged source='deepfashion_inshop' — Script A's
strict-colour checks run against the H&M-sourced bulk, not these rows.

Run: python supplement_deepfashion.py   (after seed_hm_catalog.py)
"""
import os, re, uuid, json, random
from collections import defaultdict
import oracledb
from tqdm import tqdm
from dotenv import load_dotenv

from catalog_vocab import OCCASION_MAP, SIZE_MAP, DEFAULT_SIZES, FABRIC_MAP, DEFAULT_FABRIC, synth_price

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'StyleOS-backend', '.env'))

DB_USER = os.getenv('DB_USER', 'system')
DB_PASS = os.getenv('DB_PASSWORD')
DB_CONNECT = os.getenv('DB_CONNECT', 'localhost:1521/XEPDB1')

RAW = os.path.join(os.path.dirname(__file__), 'raw', 'deepfashion')
IMG_ROOT = os.path.join(RAW, 'img_highres')
IMG_BASE = 'http://localhost:5000/images/deepfashion/img_highres'

TARGET_ITEM_COUNT = 7000

# DeepFashion In-Shop category folder -> canonical article_type. Categories
# with no clean fit (Suiting, Rompers_Jumpsuits, Underwear, etc.) are
# intentionally absent and dropped rather than force-mapped.
CATEGORY_MAP = {
    'Tees_Tanks': 'Tshirts', 'Blouses_Shirts': 'Shirts', 'Shirts_Polos': 'Shirts',
    'Sweaters': 'Sweatshirts', 'Sweatshirts_Hoodies': 'Sweatshirts',
    'Denim': 'Jeans', 'Pants': 'Trousers', 'Shorts': 'Shorts',
    'Jackets_Coats': 'Jackets', 'Dresses': 'Dresses', 'Skirts': 'Trousers',
}

# Sort key for picking a front-facing image as images[0] — both ItemCard.js
# and normalizeProduct.js read that index as the thumbnail.
def image_sort_key(filename):
    if 'front' in filename.lower():
        return (0, filename)
    if re.search(r'01_1', filename):
        return (0, filename)
    return (1, filename)


def scan_items():
    """Walk img_highres/{GENDER}/{CATEGORY}/id_{ITEMID}/*.jpg, group by item
    folder, keep only groups with >=2 real photos (segmentation masks
    excluded)."""
    items = []
    if not os.path.isdir(IMG_ROOT):
        print(f'{IMG_ROOT} not found — run the DeepFashion dataset download first.')
        return items

    for gender_dir in ('MEN', 'WOMEN'):
        gender_path = os.path.join(IMG_ROOT, gender_dir)
        if not os.path.isdir(gender_path):
            continue
        for category_dir in os.listdir(gender_path):
            article_type = CATEGORY_MAP.get(category_dir)
            if not article_type:
                continue
            category_path = os.path.join(gender_path, category_dir)
            if not os.path.isdir(category_path):
                continue
            for item_dir in os.listdir(category_path):
                item_path = os.path.join(category_path, item_dir)
                if not os.path.isdir(item_path):
                    continue
                jpgs = sorted(
                    (f for f in os.listdir(item_path) if f.lower().endswith('.jpg')),
                    key=image_sort_key,
                )
                if len(jpgs) < 2:
                    continue
                gender = 'Men' if gender_dir == 'MEN' else 'Women'
                rel_dir = os.path.relpath(item_path, IMG_ROOT).replace('\\', '/')
                image_urls = [f'{IMG_BASE}/{rel_dir}/{f}' for f in jpgs]
                items.append({
                    'gender': gender, 'article_type': article_type,
                    'item_id': item_dir, 'images': image_urls,
                })
    return items


def stratified_sample(items, target):
    if len(items) <= target:
        return items
    buckets = defaultdict(list)
    for it in items:
        buckets[(it['gender'], it['article_type'])].append(it)
    share = target / len(items)
    sampled = []
    for key, group in buckets.items():
        n = max(1, round(len(group) * share))
        sampled.extend(random.sample(group, min(n, len(group))))
    return sampled[:target]


def main():
    print('Scanning DeepFashion In-Shop images for multi-photo items...')
    items = scan_items()
    print(f'Found {len(items)} items with >=2 real photos.')
    if not items:
        return

    sampled = stratified_sample(items, TARGET_ITEM_COUNT)
    print(f'Sampled {len(sampled)} items (stratified by gender x article_type).')

    conn = oracledb.connect(user=DB_USER, password=DB_PASS, dsn=DB_CONNECT)
    cur = conn.cursor()

    sql = """INSERT INTO products
        (id, title, brand, gender, master_category, sub_category, article_type,
         occasion, season, base_colour, fabric, price, mrp, rating, rating_count,
         delivery_days, images, description, sizes, in_stock, source)
       VALUES
        (:1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:12,:13,:14,:15,:16,:17,:18,:19,1,:20)"""

    BATCH = 200
    inserted = 0
    for i in tqdm(range(0, len(sampled), BATCH), desc='Inserting DeepFashion multi-photo items'):
        batch = sampled[i:i + BATCH]
        rows = []
        for it in batch:
            article_type = it['article_type']
            price = synth_price(article_type)
            mrp = int(price * random.uniform(1.1, 1.4))
            title = f"{article_type} — {it['gender']} style {it['item_id']}"
            images = json.dumps(it['images'])
            rows.append((
                str(uuid.uuid4()), title, 'StyleOS Studio', it['gender'],
                'Apparel', article_type, article_type,
                OCCASION_MAP.get(article_type, 'Casual'), 'All Season', 'Multi',
                FABRIC_MAP.get(article_type, DEFAULT_FABRIC),
                price, mrp,
                round(random.uniform(3.6, 4.9), 1),
                random.randint(50, 3000),
                random.randint(3, 7),
                images[:4000],
                f'{article_type} with a full multi-angle gallery — front, side, and back views.'[:4000],
                json.dumps(SIZE_MAP.get(article_type, DEFAULT_SIZES)),
                'deepfashion_inshop',
            ))
        try:
            cur.executemany(sql, rows)
            conn.commit()
            inserted += len(rows)
        except Exception as e:
            print(f'Batch error: {str(e)[:150]}')
            conn.rollback()

    cur.close()
    conn.close()
    print(f'\nAdded {inserted} multi-photo DeepFashion products (source=deepfashion_inshop).')


if __name__ == '__main__':
    main()
