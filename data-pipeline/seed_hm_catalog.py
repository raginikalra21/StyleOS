"""
Seed the H&M Personalized Fashion Recommendations dataset into Oracle,
replacing seed_paramaggarwal.py. Real product descriptions (detail_desc),
real studio photos (one per article, from images_128_128/), not Myntra/
Ajio-sourced.

Backs up the existing catalog FIRST (backup_catalog.py) before the DELETE —
structurally, not as a separately-remembered manual step.

Run: python seed_hm_catalog.py
"""
import os, uuid, json, random
import pandas as pd
import oracledb
from tqdm import tqdm
from dotenv import load_dotenv

from backup_catalog import backup_before_reseed
from catalog_vocab import (
    map_hm_article_type, map_hm_gender, map_hm_colour, synth_price,
    OCCASION_MAP, SIZE_MAP, DEFAULT_SIZES, FABRIC_MAP, DEFAULT_FABRIC,
    HM_DROP_INDEX_GROUPS,
)

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'StyleOS-backend', '.env'))

DB_USER = os.getenv('DB_USER', 'system')
DB_PASS = os.getenv('DB_PASSWORD')
DB_CONNECT = os.getenv('DB_CONNECT', 'localhost:1521/XEPDB1')

RAW = os.path.join(os.path.dirname(__file__), 'raw', 'hm')
IMG_BASE = 'http://localhost:5000/images/hm/images_128_128'


def infer_categories(article_type):
    """master_category/sub_category kept coarse — same shape the old
    pipeline used, nothing downstream reads these two fields for filtering
    (that's article_type's job), only for display grouping."""
    ethnic = {'Kurtas', 'Sarees', 'Lehenga Choli', 'Sherwanis'}
    footwear = {'Sports Shoes', 'Casual Shoes', 'Formal Shoes', 'Sandals', 'Flip Flops'}
    accessories = {'Backpacks', 'Handbags'}
    if article_type in ethnic:
        return 'Apparel', 'Ethnic'
    if article_type in footwear:
        return 'Footwear', article_type
    if article_type in accessories:
        return 'Accessories', article_type
    return 'Apparel', article_type


def image_url(article_id):
    padded = str(article_id).zfill(10)
    prefix = padded[:3]
    path = os.path.join(RAW, 'images_128_128', prefix, f'{padded}.jpg')
    if os.path.exists(path):
        return f'{IMG_BASE}/{prefix}/{padded}.jpg'
    return None


def main():
    articles_path = os.path.join(RAW, 'articles.csv')
    if not os.path.exists(articles_path):
        print(f'{articles_path} not found — run the H&M dataset download first.')
        return

    print('Backing up current catalog before reseed...')
    backup_before_reseed()

    print(f'Loading {articles_path}...')
    df = pd.read_csv(articles_path, dtype=str)
    print(f'Rows: {len(df)}')

    df = df[~df['index_group_name'].isin(HM_DROP_INDEX_GROUPS)].copy()
    print(f'Rows after dropping Baby/Children: {len(df)}')

    conn = oracledb.connect(user=DB_USER, password=DB_PASS, dsn=DB_CONNECT)
    cur = conn.cursor()

    cur.execute('DELETE FROM cart_items')
    cur.execute('DELETE FROM products')
    conn.commit()
    print('Cleared existing products.\n')

    sql = """INSERT INTO products
        (id, title, brand, gender, master_category, sub_category, article_type,
         occasion, season, base_colour, fabric, price, mrp, rating, rating_count,
         delivery_days, images, description, sizes, in_stock, source)
       VALUES
        (:1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:12,:13,:14,:15,:16,:17,:18,:19,1,:20)"""

    BATCH = 300
    inserted = 0
    dropped_no_type = 0
    dropped_no_image = 0
    dropped_type_counts = {}

    for i in tqdm(range(0, len(df), BATCH), desc='Seeding H&M catalog'):
        batch = df.iloc[i:i + BATCH]
        rows = []
        for _, r in batch.iterrows():
            article_type = map_hm_article_type(
                r.get('product_type_name', ''), r.get('garment_group_name', ''))
            if not article_type:
                dropped_no_type += 1
                t = r.get('product_type_name', 'unknown')
                dropped_type_counts[t] = dropped_type_counts.get(t, 0) + 1
                continue

            img = image_url(r['article_id'])
            if not img:
                dropped_no_image += 1
                continue

            gender = map_hm_gender(r.get('index_group_name', ''), r.get('section_name', ''))
            colour = map_hm_colour(r.get('colour_group_name', ''))
            mc, sc = infer_categories(article_type)
            price = synth_price(article_type)
            mrp = int(price * random.uniform(1.1, 1.4))
            title = str(r.get('prod_name', article_type))[:500]
            desc = str(r.get('detail_desc', '') or title)[:4000]
            images = json.dumps([img])

            rows.append((
                str(uuid.uuid4()), title, 'H&M', gender, mc, sc, article_type,
                OCCASION_MAP.get(article_type, 'Casual'), 'All Season', colour,
                FABRIC_MAP.get(article_type, DEFAULT_FABRIC),
                price, mrp,
                round(random.uniform(3.5, 4.8), 1),
                random.randint(50, 5000),
                random.randint(3, 7),
                images[:4000], desc,
                json.dumps(SIZE_MAP.get(article_type, DEFAULT_SIZES)),
                'hm',
            ))

        if not rows:
            continue
        try:
            cur.executemany(sql, rows)
            conn.commit()
            inserted += len(rows)
        except Exception as e:
            print(f'Batch error: {str(e)[:150]}')
            conn.rollback()

    cur.close()
    conn.close()

    print(f'\nSeeded {inserted} H&M products with real descriptions and real photos.')
    print(f'   Dropped {dropped_no_type} rows (unmapped product_type_name):')
    for t, c in sorted(dropped_type_counts.items(), key=lambda x: -x[1])[:15]:
        print(f'     {t}: {c}')
    print(f'   Dropped {dropped_no_image} rows (no local image file found).')


if __name__ == '__main__':
    main()
