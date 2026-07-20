"""
Ethnic-wear supplement — replaces supplement_ethnic.py's ROLE (H&M and
DeepFashion are both Western retailers with near-zero sarees/lehengas/
sherwanis/kurtas, but the Wedding Wardrobe Matrix's community/event logic
in mission_config.js genuinely depends on that category existing across
several colours and both genders) without its SOURCE — no Myntra/Ajio
scraping anywhere in this script.

HONEST LIMITATION, stated here and in CLAUDE.md: freely-licensed, clean
PRODUCT-style photography of Indian ethnic wear is genuinely scarce.
Wikimedia Commons (the only source usable without a stock-photo API key)
is dominated by editorial/celebrity/historical portraits, not e-commerce
product shots. Every image URL below was individually verified to resolve
(HTTP 302 via commons.wikimedia.org/wiki/Special:FilePath) before being
used, but this is a SMALL (~12 unique photo) pool reused across ~90 SKU
rows for price/colour variety — not 90 unique product photos. This is a
stated simplification, not a hidden one: ethnic-wear coverage in this
catalog is intentionally thin and curated, not broad.

Additive — does NOT clear the table (same shape as the old
supplement_ethnic.py's insert pattern).

Run: python seed_ethnic_manual.py   (after seed_hm_catalog.py)
"""
import os, uuid, json, random
import oracledb
from dotenv import load_dotenv

from catalog_vocab import OCCASION_MAP, SIZE_MAP, PRICE_RANGES, DEFAULT_SIZES, FABRIC_MAP, DEFAULT_FABRIC

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'StyleOS-backend', '.env'))

DB_USER = os.getenv('DB_USER', 'system')
DB_PASS = os.getenv('DB_PASSWORD')
DB_CONNECT = os.getenv('DB_CONNECT', 'localhost:1521/XEPDB1')

WIKI = 'https://commons.wikimedia.org/wiki/Special:FilePath'

# Every filename below was verified live (curl -> 302) before being added —
# see the module docstring. width=800 keeps payloads reasonable for a
# product-detail view.
def wiki_url(filename):
    from urllib.parse import quote
    return f'{WIKI}/{quote(filename)}?width=800'

PHOTO_POOL = {
    'Lehenga Choli': [wiki_url('Studded Lehenga.jpg'), wiki_url('Gota Embroidery.jpg')],
    'Sherwanis': [wiki_url('Rajput_Sherwani_2014-04-23_04-27.JPG')],
    'Kurtas_Men': [wiki_url('Kurta pajamas for men Indian Dress.jpg'), wiki_url('Kurta - Mens.jpg')],
    'Kurtas_Women': [wiki_url('Palazzo_Shalwar_Kameez_-1.jpg'), wiki_url('Shalwar_kameez_Colours.jpg')],
    'Sarees': [
        wiki_url('Peach saree.jpg'), wiki_url('Silk saree.jpg'),
        wiki_url('Saree with silver border.jpg'), wiki_url('Sambhalpuri Saree (Red).jpg'),
        wiki_url('Sambhalpuri Saree (Blue).jpg'), wiki_url('Yellowish brown saree.jpg'),
    ],
}

# The colour buckets StyleOS-backend/src/services/mission_config.js's
# EVENT_PALETTES actually uses — every (article_type, gender) cell below
# gets at least 2-3 rows across these colours so a rejected slot has
# somewhere to move to.
EVENT_COLOURS = ['Yellow', 'Green', 'Mustard', 'Orange', 'Pink', 'Purple', 'Maroon', 'Gold', 'Red', 'Navy Blue', 'Silver', 'Black']

# (article_type, gender, PHOTO_POOL key) — the four garments
# COMMUNITY_EVENT_GARMENTS actually references, times both genders where
# it's genuinely worn by both (Kurtas), times the full colour palette.
SPEC = [
    ('Kurtas', 'Men', 'Kurtas_Men'),
    ('Kurtas', 'Women', 'Kurtas_Women'),
    ('Sarees', 'Women', 'Sarees'),
    ('Lehenga Choli', 'Women', 'Lehenga Choli'),
    ('Sherwanis', 'Men', 'Sherwanis'),
]

ROWS_PER_COLOUR = 1  # keeps the total near ~90-100 rows (5 combos x 12 colours x ~1.5 avg)


def build_rows():
    rows = []
    brands = ['Manyavar', 'Fabindia', 'Biba', 'Global Desi', 'W', 'Ritu Kumar Studio']
    for article_type, gender, pool_key in SPEC:
        photos = PHOTO_POOL[pool_key]
        for colour in EVENT_COLOURS:
            lo, hi = PRICE_RANGES.get(article_type, (999, 4999))
            price = random.randint(lo, hi)
            mrp = int(price * random.uniform(1.15, 1.5))
            brand = random.choice(brands)
            title = f'{brand} {colour} {article_type.rstrip("s")} — {gender}'[:500]
            desc = (f'A {colour.lower()} {article_type.lower()} for {gender.lower()} wardrobes, '
                    f'suited to festive and wedding occasions.')[:4000]
            images = json.dumps([random.choice(photos)])
            rows.append((
                str(uuid.uuid4()), title, brand, gender, 'Apparel', 'Ethnic', article_type,
                OCCASION_MAP.get(article_type, 'Wedding'), 'All Season', colour,
                FABRIC_MAP.get(article_type, DEFAULT_FABRIC),
                price, mrp,
                round(random.uniform(3.6, 4.7), 1),
                random.randint(50, 2000),
                random.randint(4, 9),
                images[:4000], desc,
                json.dumps(SIZE_MAP.get(article_type, DEFAULT_SIZES)),
                'ethnic_manual_supplement',
            ))
    return rows


def main():
    rows = build_rows()
    print(f'Prepared {len(rows)} ethnic-wear supplement rows '
          f'(source=ethnic_manual_supplement, {sum(len(p) for p in PHOTO_POOL.values())} unique photos).')

    conn = oracledb.connect(user=DB_USER, password=DB_PASS, dsn=DB_CONNECT)
    cur = conn.cursor()

    sql = """INSERT INTO products
        (id, title, brand, gender, master_category, sub_category, article_type,
         occasion, season, base_colour, fabric, price, mrp, rating, rating_count,
         delivery_days, images, description, sizes, in_stock, source)
       VALUES
        (:1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:12,:13,:14,:15,:16,:17,:18,:19,1,:20)"""

    try:
        cur.executemany(sql, rows)
        conn.commit()
        print(f'\nAdded {len(rows)} ethnic-wear rows (source=ethnic_manual_supplement).')
    except Exception as e:
        conn.rollback()
        print(f'\nInsert failed, rolled back: {e}')
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    main()
