"""
Supplement the catalog with Lehenga Choli and groom-formal (Kurta Set ->
Sherwanis) products from the hiteshsuthar101 Myntra scrape, whose real
Myntra CDN image URL is downloaded per-row (no index-guessing — that's
exactly the bug that corrupted the catalog once already tonight).
Run: python supplement_ethnic.py
"""
import os, re, csv, json, uuid, random, time
import urllib.request
import oracledb
from dotenv import load_dotenv

load_dotenv('../StyleOS-backend/.env')

DB_USER    = os.getenv('DB_USER', 'system')
DB_PASS    = os.getenv('DB_PASSWORD', 'Aggarwal')
DB_CONNECT = os.getenv('DB_CONNECT', 'localhost:1521/XEPDB1')

RAW        = os.path.join(os.path.dirname(__file__), 'raw')
CSV_PATH   = os.path.join(RAW, 'myntra_scrape', 'Fashion Dataset.csv')
IMAGES_DIR = os.path.join(RAW, 'Images', 'Images')  # same folder the backend already serves from

MAX_LEHENGA = 400
MAX_KURTA_SET = 72  # take all available

COLOUR_NORM = {
    'navy blue':'Navy Blue','navy':'Navy Blue','off white':'Off White','cream':'Off White',
    'maroon':'Maroon','burgundy':'Maroon','wine':'Maroon','mustard':'Mustard','grey':'Grey',
    'gray':'Grey','black':'Black','white':'White','red':'Red','blue':'Blue','green':'Green',
    'pink':'Pink','purple':'Purple','orange':'Orange','brown':'Brown','beige':'Beige',
    'gold':'Gold','silver':'Silver','multi':'Multi','yellow': 'Yellow', 'peach': 'Peach',
}

def norm_colour(c):
    if not c: return 'Multi'
    c = c.strip().lower()
    for k, v in COLOUR_NORM.items():
        if k in c: return v
    return c.title()[:100] if c else 'Multi'

def download_image(url, dest_path, timeout=8):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=timeout) as resp, open(dest_path, 'wb') as f:
            f.write(resp.read())
        return True
    except Exception:
        return False

def main():
    rows = []
    with open(CSV_PATH, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    print(f'Loaded {len(rows)} rows from Fashion Dataset.csv')

    lehenga_rows = [r for r in rows if 'lehenga' in (r.get('name') or '').lower()][:MAX_LEHENGA]
    kurta_set_rows = [r for r in rows if 'kurta set' in (r.get('name') or '').lower()
                       or 'kurta with nehru' in (r.get('name') or '').lower()][:MAX_KURTA_SET]

    print(f'Selected {len(lehenga_rows)} Lehenga Choli rows, {len(kurta_set_rows)} groom-formal (-> Sherwanis) rows')

    os.makedirs(IMAGES_DIR, exist_ok=True)

    conn = oracledb.connect(user=DB_USER, password=DB_PASS, dsn=DB_CONNECT)
    cur = conn.cursor()

    sql = """INSERT INTO products
        (id, title, brand, gender, master_category, sub_category, article_type,
         occasion, season, base_colour, fabric, price, mrp, rating, rating_count,
         delivery_days, images, description, sizes, in_stock, source)
       VALUES
        (:1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:12,:13,:14,:15,:16,:17,:18,:19,1,:20)"""

    inserted, skipped = 0, 0

    def process(rows_subset, article_type, occasion, gender_default, fabric, sizes_json, source_tag):
        nonlocal inserted, skipped
        batch = []
        for r in rows_subset:
            img_url = (r.get('img') or '').strip()
            if not img_url.startswith('http'):
                skipped += 1
                continue
            pid = str(uuid.uuid4())
            fname = f'{pid}.jpg'
            dest = os.path.join(IMAGES_DIR, fname)
            if not download_image(img_url, dest):
                skipped += 1
                continue

            title = (r.get('name') or article_type)[:500]
            attrs = (r.get('p_attributes') or '').lower()
            if 'women' in attrs or 'female' in attrs or 'women' in title.lower():
                gender = 'Women'
            elif 'men' in attrs or 'male' in attrs or 'men' in title.lower():
                gender = 'Men'
            else:
                gender = gender_default

            try:
                price = float(r.get('price') or 0)
            except ValueError:
                price = 0
            if price <= 0:
                price = random.randint(1999, 14999)
            mrp = int(price * random.uniform(1.15, 1.45))

            try:
                rating = float(r.get('avg_rating') or 0) or round(random.uniform(3.7, 4.8), 1)
            except ValueError:
                rating = round(random.uniform(3.7, 4.8), 1)
            try:
                rating_count = int(float(r.get('ratingCount') or 0)) or random.randint(50, 3000)
            except ValueError:
                rating_count = random.randint(50, 3000)

            batch.append((
                pid, title, (r.get('brand') or 'Unknown')[:255], gender,
                'Apparel', 'Ethnic', article_type, occasion, 'All Season',
                norm_colour(r.get('colour') or ''), fabric,
                int(price), mrp, round(rating, 1), rating_count,
                random.randint(3, 7),
                json.dumps([f'http://localhost:5000/images/{fname}']),
                title, sizes_json, source_tag,
            ))

        if batch:
            cur.executemany(sql, batch)
            conn.commit()
            inserted += len(batch)

    print('Downloading + inserting Lehenga Choli...')
    process(lehenga_rows, 'Lehenga Choli', 'Wedding', 'Women', 'Net',
            json.dumps(['XS','S','M','L','XL']), 'hiteshsuthar101_supplement')
    print(f'  -> {inserted} inserted so far, {skipped} skipped')

    print('Downloading + inserting groom-formal Kurta Sets as Sherwanis...')
    before = inserted
    process(kurta_set_rows, 'Sherwanis', 'Wedding', 'Men', 'Brocade',
            json.dumps(['S','M','L','XL','XXL']), 'hiteshsuthar101_supplement')
    print(f'  -> {inserted - before} inserted, total {inserted}, {skipped} skipped')

    cur.close()
    conn.close()
    print(f'\nDone. Inserted {inserted} supplemental products ({skipped} skipped due to bad/missing images).')

if __name__ == '__main__':
    main()
